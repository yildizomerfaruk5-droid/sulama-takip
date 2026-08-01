/*
 * Kurulum Sihirbazı — yeni bir tarlayı kod yazmadan arayüzden tanımlama
 * Spesifikasyon: KURULUM_SIHIRBAZI_SPEC.md (Parça B)
 *
 * Bu aşamada Adım 1-5 (bölge, zonalar, parseller, boru/noktalar, vanalar)
 * çalışır; hat adımı sekme olarak görünür ama henüz açılmaz.
 */
import L from 'leaflet'
import { supabase } from './supabase.js'
import { logKaydet } from './log.js'
import { fiskiyeKonumlari, yonHesapla, mesafeM } from './harita.js'
import {
  kmlAyristir, kmlUret, poligonAlanM2, cizgiUzunlukM, isaretciNoAyristir, vanaAciklamaAyristir,
  alanBicimle, dekarBicimle, uzunlukBicimle
} from './kml.js'

const ADIMLAR = [
  { no: 1, ikon: '📍', ad: 'Bölge',    hazir: true },
  { no: 2, ikon: '🗂', ad: 'Zonalar',  hazir: true },
  { no: 3, ikon: '🟩', ad: 'Parseller', hazir: true },
  { no: 4, ikon: '🔧', ad: 'Boru ve noktalar', hazir: true },
  { no: 5, ikon: '🚰', ad: 'Vanalar',  hazir: true },
  { no: 6, ikon: '💧', ad: 'Hatlar',   hazir: true }
]

// Hat kapasitesi bandı (spec 5. Adım 6)
const HAT_BAND_YESIL = [75, 95]
const HAT_BAND_SARI = [60, 110]

const NOKTA_TIPLERI = {
  kuyu: 'Kuyu', ayrim: 'Ayrım noktası', karavan: 'Karavan',
  depo: 'Depo', diger: 'Diğer'
}

// Özel fıskiye dizilim kuralları (spec 3.5)
const KURAL_TIPLERI = {
  '':            'Normal (kural yok)',
  bosluk:        'Ekilmemiş boşluk',
  uzat:          'Parsel sonuna kadar uzat',
  sabit:         'Kırpmasız sabit uzunluk',
  yan_sira:      'Yan sıralar',
  kenar:         'Parsel kenarını takip et',
  alan_doldur:   'Alan doldurma'
}

// Yeni bölge için başlangıç değerleri (mevcut sahanın ölçüleri)
const VARSAYILAN = {
  varsayilan_zoom: 15,
  fiskiye_araligi_m: 10,
  fiskiye_kapsama_m: 7,
  fiskiye_alan_m2: 120,
  varsayilan_sure_dk: 480
}

let durum = {
  adim: 1,
  bolgeler: [],
  bolge: null,        // üzerinde çalışılan bölge (null = yeni bölge formu)
  zonalar: [],
  parseller: [],
  borular: [],
  noktalar: [],
  vanalar: [],
  hatlar: [],
  kmlAdaylari: null,  // { dosya, parseller, cizgiler, noktalar, vanaSatirlari }
  vanaFiltre: '',
  sadeceEksik: false,
  vanaSecili: new Set(),
  kuralVanaId: null,  // kural editörü açık olan vana
  kuralTip: null,     // editörde seçili tip (null = vananın kayıtlı tipi)
  hatDuzenleId: null,  // hat editörü açık olan hat ('yeni' = henüz kaydedilmemiş)
  hatYeniZona: null,   // yeni hat için seçili zona
  hatVanaSecili: new Set(), // editördeki hatta atanacak vana id'leri (taslak, henüz kaydedilmedi)
  hatVanaFiltre: '',
  ozetAcik: false,    // kurulum özeti ekranı (adım 6 sonrası)
  sistemAcik: false,  // sulama açıkken yapısal düzenleme uyarısı
  aktifHatId: null,   // o an sulanan hat — yapısı kilitlidir (spec 5.3)
  geriDon: null
}

let kurulumHaritasi = null
let mevcutKatman = null   // kayıtlı parsel/boru/nokta/vana çizimleri
let cizimKatmani = null   // haritada sürmekte olan çizim
let onizlemeKatmani = null // kural önizlemesindeki fıskiyeler
let cizim = null          // { tip: 'parsel'|'boru'|'nokta'|'vana'|'yon', noktalar: [[lat,lng]] }

// Fıskiye hesabı için saha verisi (harita.js ile aynı biçim)
function sahaVerisi() {
  return {
    parseller: durum.parseller,
    aralik: Number(durum.bolge?.fiskiye_araligi_m) || 10
  }
}

/*
 * Kurulum kilidi (spec 5.3): sulama sürerken o an SULANAN hattın yapısı
 * değiştirilemez. Sayaç, sıradaki hat ve pg_cron geçişi bu hatta bağlı
 * olduğu için hat/vana silmek veya taşımak akışı bozar.
 * Diğer hatlar sulama açıkken de düzenlenebilir (üst bantta uyarı var).
 */
function aktifHatKilitli(hatId) {
  return !!(durum.sistemAcik && hatId && durum.aktifHatId === hatId)
}

function kilitUyarisi(nerede) {
  alert(`Şu anda sulanan hat üzerinde ${nerede} yapılamaz.\n` +
        `Sulama sürerken aktif hattın yapısı değiştirilirse sayaç ve ` +
        `otomatik hat geçişi bozulur.\n\nÖnce sistemi durdurun veya ` +
        `sıradaki hatta geçilmesini bekleyin.`)
}

// Öznitelik içine güvenli yazım
function oz(deger) {
  return String(deger ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// Ad -> kod (slug): "Konya - Çumra Ovası" -> "konya-cumra-ovasi"
// Türkçe karakterler toLowerCase'den ÖNCE çevrilir; aksi halde büyük
// harfliler (Ç, Ş, Ğ...) ascii filtresine takılıp silinir.
function slugYap(metin) {
  const tr = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u'
  }
  return String(metin || '')
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, k => tr[k])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function deger(id) {
  return (document.getElementById(id)?.value || '').trim()
}

function sayi(id, varsayilan = null) {
  const v = deger(id)
  if (v === '') return varsayilan
  const n = Number(v)
  return Number.isFinite(n) ? n : varsayilan
}

// ── VERİ ──
async function verileriYukle(bolgeId = null) {
  const { data: bolgeler, error } = await supabase
    .from('bolgeler')
    .select('*')
    .order('sira_no')

  if (error) {
    console.error('Bölge okuma hatası:', error.message)
    durum.bolgeler = []
  } else {
    durum.bolgeler = bolgeler || []
  }

  durum.bolge = durum.bolgeler.find(b => b.id === bolgeId) || durum.bolgeler[0] || null
  await bolgeAyrintilariYukle()
}

// Seçili bölgenin zonaları, saha çizimleri ve sulama durumu
async function bolgeAyrintilariYukle() {
  durum.zonalar = []
  durum.parseller = []
  durum.borular = []
  durum.noktalar = []
  durum.vanalar = []
  durum.hatlar = []
  durum.sistemAcik = false
  durum.aktifHatId = null
  if (!durum.bolge?.id) return

  const b = durum.bolge.id
  const [z, s, p, br, n, v] = await Promise.all([
    supabase.from('zonalar').select('*').eq('bolge_id', b).order('sira_no'),
    supabase.from('sistem_durumu').select('sistem_acik, aktif_hat_id').eq('bolge_id', b).maybeSingle(),
    supabase.from('parseller').select('*').eq('bolge_id', b).order('sira_no'),
    supabase.from('boru_hatlari').select('*').eq('bolge_id', b).order('sira_no'),
    supabase.from('saha_noktalari').select('*').eq('bolge_id', b).order('tip'),
    supabase.from('vanalar').select('*, vana_parselleri (parsel_id)').eq('bolge_id', b).order('isaretci_no')
  ])

  const hata = z.error || p.error || br.error || n.error
  if (hata) console.error('Kurulum verisi okuma hatası:', hata.message)

  durum.zonalar = z.data || []
  durum.parseller = p.data || []
  durum.borular = br.data || []
  durum.noktalar = n.data || []
  durum.sistemAcik = !!s.data?.sistem_acik
  durum.aktifHatId = s.data?.aktif_hat_id || null

  // vana_parselleri ilişkisi okunamazsa (eski şema) ilişkisiz sorguya düş
  if (v.error) {
    const yedek = await supabase.from('vanalar').select('*').eq('bolge_id', b).order('isaretci_no')
    durum.vanalar = yedek.data || []
    if (yedek.error) console.error('Vana okuma hatası:', yedek.error.message)
  } else {
    durum.vanalar = v.data || []
  }

  // Hatlar (zonalara bağlı) — sıra no ve süre kurulum sihirbazından düzenlenir
  if (durum.zonalar.length > 0) {
    const { data: hatlar } = await supabase
      .from('hatlar')
      .select('id, hat_no, sira_no, zona_id, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk')
      .in('zona_id', durum.zonalar.map(x => x.id))
      .order('sira_no')
    durum.hatlar = hatlar || []

    // Her hattın gerçek vana sayısı ve fıskiye toplamı (elle girilmez, vanadan hesaplanır)
    durum.hatlar.forEach(h => {
      const baglilar = durum.vanalar.filter(v => v.hat_id === h.id)
      h.vana_sayisi = baglilar.length
      h.gercek_fiskiye = baglilar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
    })

    // Gerçek sulama kaydı olan hatlar silinemez (geçmiş veri korunur — spec 5.3)
    if (durum.hatlar.length > 0) {
      const { data: kayitlar } = await supabase
        .from('sulama_kayitlari')
        .select('hat_id')
        .in('hat_id', durum.hatlar.map(h => h.id))
      durum.hatlar.forEach(h => {
        h.kayit_sayisi = (kayitlar || []).filter(k => k.hat_id === h.id).length
      })
    }

    // Her zonanın hat sayısı (silme güvenliği için)
    durum.zonalar.forEach(zona => {
      zona.hat_sayisi = durum.hatlar.filter(h => h.zona_id === zona.id).length
    })
  }

  // Her parselin kaç vanaya bağlı olduğu (silme güvenliği için)
  if (durum.parseller.length > 0) {
    const idler = durum.parseller.map(x => x.id)
    const [vp, v] = await Promise.all([
      supabase.from('vana_parselleri').select('parsel_id').in('parsel_id', idler),
      supabase.from('vanalar').select('parsel_id').eq('bolge_id', b).not('parsel_id', 'is', null)
    ])
    durum.parseller.forEach(parsel => {
      const a = (vp.data || []).filter(x => x.parsel_id === parsel.id).length
      const c = (v.data || []).filter(x => x.parsel_id === parsel.id).length
      parsel.vana_sayisi = Math.max(a, c)
    })
  }
}

// ── EKRAN ──
export async function kurulumEkraniAc({ bolgeId = null, geriDon = null } = {}) {
  durum.geriDon = geriDon
  durum.adim = 1

  const app = document.querySelector('#app')
  app.innerHTML = '<div class="loading">Kurulum yükleniyor...</div>'

  await verileriYukle(bolgeId)
  ciz()
}

function ciz() {
  // Önceki harita örneğini temizle (DOM yenileniyor)
  if (kurulumHaritasi) {
    kurulumHaritasi.remove()
    kurulumHaritasi = null
  }
  mevcutKatman = null
  cizimKatmani = null
  onizlemeKatmani = null
  cizim = null

  const app = document.querySelector('#app')
  app.innerHTML = `
    <div class="container">
      <div class="kurulum-baslik">
        <div>
          <h1>⚙️ Kurulum Sihirbazı</h1>
          <div class="kurulum-alt">${durum.bolge ? oz(durum.bolge.ad) : 'Yeni bölge'}</div>
        </div>
        <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumCik()">← Panele dön</button>
      </div>

      ${durum.sistemAcik ? `
        <div class="kurulum-uyari">
          ⚠️ Bu bölgede sulama <b>şu anda açık</b>. Yapısal değişiklik yapmadan önce
          akışı etkileyip etkilemeyeceğini kontrol edin.
        </div>
      ` : ''}

      <div class="kurulum-sekmeler">
        ${ADIMLAR.map(a => `
          <button
            class="kurulum-sekme ${durum.adim === a.no ? 'aktif' : ''} ${a.hazir ? '' : 'pasif'}"
            ${a.hazir ? `onclick="kurulumAdimSec(${a.no})"` : 'disabled title="Sonraki geliştirme aşamasında"'}
          >${a.ikon} ${a.no}. ${a.ad}</button>
        `).join('')}
      </div>

      <div class="kurulum-govde">
        ${durum.ozetAcik ? ozetHTML() : ''}
        ${!durum.ozetAcik && durum.adim === 1 ? adim1HTML() : ''}
        ${!durum.ozetAcik && durum.adim === 2 ? adim2HTML() : ''}
        ${!durum.ozetAcik && durum.adim === 3 ? adim3HTML() : ''}
        ${!durum.ozetAcik && durum.adim === 4 ? adim4HTML() : ''}
        ${!durum.ozetAcik && durum.adim === 5 ? adim5HTML() : ''}
        ${!durum.ozetAcik && durum.adim === 6 ? adim6HTML() : ''}
      </div>
    </div>
  `

  if (!durum.ozetAcik && durum.adim === 1) haritaKur()
  if (!durum.ozetAcik && durum.adim >= 3 && durum.adim <= 6 && durum.bolge?.id) sahaHaritasiKur()
  if (!durum.ozetAcik && durum.adim === 5 && durum.kuralVanaId) kuralOnizle()
}

// ── ADIM 1: BÖLGE ──
function adim1HTML() {
  const b = durum.bolge || {}
  const yeni = !b.id

  return `
    <div class="kurulum-satir">
      <label class="kurulum-etiket">Düzenlenen bölge</label>
      <div class="kurulum-secim">
        <select id="k-bolge-sec" onchange="kurulumBolgeSec(this.value)">
          ${durum.bolgeler.map(x => `
            <option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>📍 ${oz(x.ad)}</option>
          `).join('')}
          <option value="" ${yeni ? 'selected' : ''}>➕ Yeni bölge...</option>
        </select>
      </div>
      ${b.id ? `
        <div class="kurulum-zona-alt">
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade"
                  onclick="kurulumBolgeKopyala(this)">📋 Bu bölgeyi şablon olarak kopyala</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade"
                  onclick="kurulumKmlIndir(this)">⬇ KML olarak indir</button>
        </div>
      ` : ''}
    </div>

    <div class="kurulum-kart">
      <h3>Bölge bilgileri</h3>
      <div class="kurulum-izgara">
        <div>
          <label class="kurulum-etiket">Ad *</label>
          <input id="k-ad" value="${oz(b.ad)}" placeholder="Konya - Çumra Sahası"
                 oninput="kurulumKodOner()">
        </div>
        <div>
          <label class="kurulum-etiket">Kod (slug) *</label>
          <input id="k-kod" value="${oz(b.kod)}" placeholder="konya-cumra"
                 oninput="this.dataset.elle='1'"
                 ${b.id ? 'readonly title="Kayıtlı bölgenin kodu değiştirilmez"' : ''}>
        </div>
        <div>
          <label class="kurulum-etiket">İl</label>
          <input id="k-il" value="${oz(b.il)}" placeholder="Konya">
        </div>
        <div>
          <label class="kurulum-etiket">İlçe</label>
          <input id="k-ilce" value="${oz(b.ilce)}" placeholder="Çumra">
        </div>
        <div class="kurulum-genis">
          <label class="kurulum-etiket">Açıklama</label>
          <input id="k-aciklama" value="${oz(b.aciklama)}" placeholder="Kısa not">
        </div>
      </div>
    </div>

    <div class="kurulum-kart">
      <h3>Harita merkezi</h3>
      <div class="kurulum-ipucu">Haritaya tıklayarak merkezi seçebilir veya koordinatı elle girebilirsiniz.</div>
      <div id="kurulum-harita" class="kurulum-harita"></div>
      <div class="kurulum-izgara">
        <div>
          <label class="kurulum-etiket">Enlem (lat)</label>
          <input id="k-lat" type="number" step="0.000001" inputmode="decimal"
                 value="${oz(b.merkez_lat)}" onchange="kurulumMerkeziUygula()">
        </div>
        <div>
          <label class="kurulum-etiket">Boylam (lng)</label>
          <input id="k-lng" type="number" step="0.000001" inputmode="decimal"
                 value="${oz(b.merkez_lng)}" onchange="kurulumMerkeziUygula()">
        </div>
        <div>
          <label class="kurulum-etiket">Varsayılan zoom</label>
          <input id="k-zoom" type="number" min="1" max="21" inputmode="numeric"
                 value="${oz(b.varsayilan_zoom ?? VARSAYILAN.varsayilan_zoom)}">
        </div>
      </div>
    </div>

    <div class="kurulum-kart">
      <h3>Saha ölçüleri</h3>
      <div class="kurulum-ipucu">Fıskiye çizimi ve alan hesabı bu değerleri kullanır.</div>
      <div class="kurulum-izgara">
        <div>
          <label class="kurulum-etiket">Fıskiye aralığı (m)</label>
          <input id="k-aralik" type="number" step="0.1" inputmode="decimal"
                 value="${oz(b.fiskiye_araligi_m ?? VARSAYILAN.fiskiye_araligi_m)}">
        </div>
        <div>
          <label class="kurulum-etiket">Kapsama yarıçapı (m)</label>
          <input id="k-kapsama" type="number" step="0.1" inputmode="decimal"
                 value="${oz(b.fiskiye_kapsama_m ?? VARSAYILAN.fiskiye_kapsama_m)}">
        </div>
        <div>
          <label class="kurulum-etiket">Fıskiye başına alan (m²)</label>
          <input id="k-alan" type="number" step="1" inputmode="numeric"
                 value="${oz(b.fiskiye_alan_m2 ?? VARSAYILAN.fiskiye_alan_m2)}">
        </div>
        <div>
          <label class="kurulum-etiket">Varsayılan hat süresi (dk)</label>
          <input id="k-sure" type="number" step="1" inputmode="numeric"
                 value="${oz(b.varsayilan_sure_dk ?? VARSAYILAN.varsayilan_sure_dk)}">
        </div>
      </div>
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn" onclick="kurulumBolgeKaydet(this)">
        ${yeni ? '➕ Bölgeyi oluştur' : '💾 Bölgeyi kaydet'}
      </button>
      ${b.id ? '<button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(2)">Zonalar →</button>' : ''}
    </div>
  `
}

function haritaKur() {
  const el = document.getElementById('kurulum-harita')
  if (!el) return

  const b = durum.bolge || {}
  const merkez = [
    Number(b.merkez_lat ?? 38.6295),
    Number(b.merkez_lng ?? 36.2460)
  ]

  kurulumHaritasi = L.map('kurulum-harita', {
    center: merkez,
    zoom: Number(b.varsayilan_zoom) || VARSAYILAN.varsayilan_zoom,
    zoomControl: true
  })

  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Google Satellite',
    maxZoom: 21
  }).addTo(kurulumHaritasi)

  const isaret = L.marker(merkez, { draggable: true }).addTo(kurulumHaritasi)
  isaret.bindPopup('Bölge merkezi').openPopup()

  const yaz = (lat, lng) => {
    document.getElementById('k-lat').value = lat.toFixed(6)
    document.getElementById('k-lng').value = lng.toFixed(6)
  }

  kurulumHaritasi.on('click', e => {
    isaret.setLatLng(e.latlng)
    yaz(e.latlng.lat, e.latlng.lng)
  })
  isaret.on('dragend', () => {
    const k = isaret.getLatLng()
    yaz(k.lat, k.lng)
  })

  // Koordinat elle girildiğinde işareti taşımak için sakla
  kurulumHaritasi._isaret = isaret

  // Kart açılışında boyut hesabı bozulmasın
  setTimeout(() => kurulumHaritasi?.invalidateSize(), 60)
}

// ── ADIM 2: ZONALAR ──
function adim2HTML() {
  if (!durum.bolge?.id) {
    return `
      <div class="kurulum-kart">
        <div class="kurulum-ipucu">Zona eklemek için önce 1. adımdan bölgeyi kaydedin.</div>
        <button class="kurulum-btn" onclick="kurulumAdimSec(1)">← Bölgeye dön</button>
      </div>
    `
  }

  const siradaki = durum.zonalar.length === 0
    ? 1
    : Math.max(...durum.zonalar.map(z => z.sira_no || 0)) + 1

  return `
    ${durum.zonalar.length === 0 ? `
      <div class="kurulum-uyari">
        Bu bölgede henüz zona yok. Sulama akışı zonalar üzerinden yürüdüğü için
        <b>en az bir zona</b> tanımlanmalıdır.
      </div>
    ` : ''}

    <div class="kurulum-kart">
      <h3>Zonalar (${durum.zonalar.length})</h3>
      <div class="kurulum-ipucu">Sıra no, sulamanın hangi zonadan başlayıp nasıl ilerleyeceğini belirler.</div>

      ${durum.zonalar.map(z => `
        <div class="kurulum-zona">
          <div class="kurulum-izgara">
            <div>
              <label class="kurulum-etiket">Ad *</label>
              <input id="z-ad-${z.id}" value="${oz(z.ad)}">
            </div>
            <div>
              <label class="kurulum-etiket">Sıra no</label>
              <input id="z-sira-${z.id}" type="number" min="1" inputmode="numeric" value="${oz(z.sira_no ?? 1)}">
            </div>
            <div class="kurulum-genis">
              <label class="kurulum-etiket">Açıklama</label>
              <input id="z-aciklama-${z.id}" value="${oz(z.aciklama)}">
            </div>
          </div>
          <div class="kurulum-zona-alt">
            <span class="kurulum-rozet">${z.hat_sayisi || 0} hat</span>
            <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumZonaKaydet('${z.id}', this)">💾 Kaydet</button>
            <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sil"
                    onclick="kurulumZonaSil('${z.id}')"
                    ${z.hat_sayisi ? 'disabled title="Hattı olan zona silinemez"' : ''}>🗑 Sil</button>
          </div>
        </div>
      `).join('')}

      <div class="kurulum-zona kurulum-zona-yeni">
        <div class="kurulum-izgara">
          <div>
            <label class="kurulum-etiket">Yeni zona adı *</label>
            <input id="z-yeni-ad" placeholder="Zona 3">
          </div>
          <div>
            <label class="kurulum-etiket">Sıra no</label>
            <input id="z-yeni-sira" type="number" min="1" inputmode="numeric" value="${siradaki}">
          </div>
          <div class="kurulum-genis">
            <label class="kurulum-etiket">Açıklama</label>
            <input id="z-yeni-aciklama" placeholder="Kısa not">
          </div>
        </div>
        <div class="kurulum-zona-alt">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumZonaEkle(this)">➕ Zona ekle</button>
        </div>
      </div>
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(1)">← Bölge</button>
    </div>
  `
}

// ── ORTAK PARÇALAR (ADIM 3-4) ──
function bolgeGerekliHTML() {
  return `
    <div class="kurulum-kart">
      <div class="kurulum-ipucu">Bu adım için önce 1. adımdan bölgeyi kaydedin.</div>
      <button class="kurulum-btn" onclick="kurulumAdimSec(1)">← Bölgeye dön</button>
    </div>
  `
}

function zonaSecenekleri(secili) {
  return `<option value="">(zona yok)</option>` + durum.zonalar.map(z => `
    <option value="${z.id}" ${z.id === secili ? 'selected' : ''}>${oz(z.ad)}</option>
  `).join('')
}

function isaretli(id) {
  return !!document.getElementById(id)?.checked
}

// KML yükleme alanı (adım 3 ve 4'te aynı bileşen)
function kmlYukleHTML(tur) {
  const ne = tur === 'parsel'
    ? 'Poligonlar (&lt;Polygon&gt;) parsel adayı olarak listelenir.'
    : 'Çizgiler (&lt;LineString&gt;) boru, noktalar (&lt;Point&gt;) saha noktası adayı olur.'

  return `
    <div class="kurulum-kart">
      <h3>KML yükle</h3>
      <div class="kurulum-ipucu">
        Google Earth'ten "KML olarak kaydet" ile dışa aktardığınız dosyayı yükleyin. ${ne}
        <br>KMZ desteklenmez — Google Earth'te KML olarak kaydedin.
      </div>
      <div class="kurulum-birak" id="k-birak"
           ondragover="event.preventDefault(); this.classList.add('uzerinde')"
           ondragleave="this.classList.remove('uzerinde')"
           ondrop="kurulumKmlBirak(event, '${tur}')">
        <div class="kurulum-birak-metin">📄 KML dosyasını buraya sürükleyin</div>
        <input type="file" id="k-kml-dosya" accept=".kml,.xml"
               onchange="kurulumKmlSec(event, '${tur}')" style="display:none">
        <button class="kurulum-btn kurulum-btn-sade kurulum-btn-kucuk"
                onclick="document.getElementById('k-kml-dosya').click()">Dosya seç</button>
      </div>
    </div>
  `
}

// ── ADIM 3: PARSELLER ──
function adim3HTML() {
  if (!durum.bolge?.id) return bolgeGerekliHTML()

  const toplamAlan = durum.parseller.reduce((t, p) => t + Number(p.alan_m2 || 0), 0)
  const adaylar = durum.kmlAdaylari?.parseller || []
  const mevcutAdlar = durum.parseller.map(p => p.ad)

  return `
    ${kmlYukleHTML('parsel')}

    ${adaylar.length > 0 ? `
      <div class="kurulum-kart">
        <h3>İçe aktarılacak parseller — ${oz(durum.kmlAdaylari.dosya)}</h3>
        <div class="kurulum-ipucu">
          ${adaylar.length} poligon bulundu. Aktarmak istediklerinizi işaretleyin;
          adı ve zonasını burada düzeltebilirsiniz.
        </div>
        <div class="kurulum-tablo-sar">
          <table class="kurulum-tablo">
            <thead>
              <tr><th></th><th>Ad</th><th>Nokta</th><th>Alan</th><th>Zona</th></tr>
            </thead>
            <tbody>
              ${adaylar.map((a, i) => {
                const varOlan = mevcutAdlar.includes(a.ad)
                return `
                  <tr class="${varOlan ? 'kurulum-satir-uyari' : ''}">
                    <td><input type="checkbox" id="kp-sec-${i}" ${varOlan ? '' : 'checked'}></td>
                    <td><input id="kp-ad-${i}" value="${oz(a.ad)}">
                        ${varOlan ? '<div class="kurulum-kucuk-uyari">bu ad zaten var</div>' : ''}</td>
                    <td>${a.nokta_sayisi}</td>
                    <td>${alanBicimle(a.alan_m2)}<div class="kurulum-kucuk">${dekarBicimle(a.alan_m2)}</div></td>
                    <td><select id="kp-zona-${i}">${zonaSecenekleri(null)}</select></td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="kurulum-zona-alt">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumKmlIceAktar(this, 'parsel')">⬇ İçe aktar</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumKmlTemizle()">Vazgeç</button>
        </div>
      </div>
    ` : ''}

    <div class="kurulum-kart">
      <h3>Harita</h3>
      <div class="kurulum-ipucu">
        Kayıtlı parseller haritada görünür. Yeni parsel için "Haritada çiz"e basıp
        köşeleri sırayla tıklayın.
      </div>
      <div id="kurulum-harita" class="kurulum-harita kurulum-harita-buyuk"></div>
      <div id="k-cizim-bar" class="kurulum-cizim-bar" style="display:none"></div>
      <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimBaslat('parsel')">✏️ Haritada parsel çiz</button>
    </div>

    <div class="kurulum-kart">
      <h3>Parseller (${durum.parseller.length})</h3>
      ${durum.parseller.length === 0
        ? '<div class="kurulum-ipucu">Henüz parsel yok. KML yükleyin veya haritada çizin.</div>'
        : `<div class="kurulum-ipucu">Toplam alan: <b>${alanBicimle(toplamAlan)}</b> (${dekarBicimle(toplamAlan)})</div>`}

      ${durum.parseller.map(p => `
        <div class="kurulum-zona">
          <div class="kurulum-izgara">
            <div>
              <label class="kurulum-etiket">Ad *</label>
              <input id="p-ad-${p.id}" value="${oz(p.ad)}">
            </div>
            <div>
              <label class="kurulum-etiket">Zona</label>
              <select id="p-zona-${p.id}">${zonaSecenekleri(p.zona_id)}</select>
            </div>
            <div>
              <label class="kurulum-etiket">Sıra no</label>
              <input id="p-sira-${p.id}" type="number" min="1" inputmode="numeric" value="${oz(p.sira_no ?? 1)}">
            </div>
            <div>
              <label class="kurulum-etiket">Renk</label>
              <input id="p-renk-${p.id}" type="color" value="${oz(p.renk || '#3fae4a')}">
            </div>
          </div>
          <div class="kurulum-zona-alt">
            <span class="kurulum-rozet">${alanBicimle(p.alan_m2)}</span>
            <span class="kurulum-rozet">${dekarBicimle(p.alan_m2)}</span>
            <span class="kurulum-rozet">${(p.koordinatlar || []).length} nokta</span>
            <span class="kurulum-rozet">${p.vana_sayisi || 0} vana</span>
            <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumParselKaydet('${p.id}', this)">💾 Kaydet</button>
            <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sil"
                    onclick="kurulumParselSil('${p.id}')"
                    ${p.vana_sayisi ? 'disabled title="Vanaya bağlı parsel silinemez"' : ''}>🗑 Sil</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(2)">← Zonalar</button>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(4)">Boru ve noktalar →</button>
    </div>
  `
}

// ── ADIM 4: BORU HATLARI VE SAHA NOKTALARI ──
function adim4HTML() {
  if (!durum.bolge?.id) return bolgeGerekliHTML()

  const cizgiAdaylari = durum.kmlAdaylari?.cizgiler || []
  const noktaAdaylari = durum.kmlAdaylari?.noktalar || []
  const mevcutBoruAdlari = durum.borular.map(b => b.ad)

  return `
    ${kmlYukleHTML('saha')}

    ${(cizgiAdaylari.length > 0 || noktaAdaylari.length > 0) ? `
      <div class="kurulum-kart">
        <h3>İçe aktarılacaklar — ${oz(durum.kmlAdaylari.dosya)}</h3>

        ${cizgiAdaylari.length > 0 ? `
          <div class="kurulum-ipucu">${cizgiAdaylari.length} çizgi (boru segmenti) bulundu.</div>
          <div class="kurulum-tablo-sar">
            <table class="kurulum-tablo">
              <thead><tr><th></th><th>Ad</th><th>Nokta</th><th>Uzunluk</th><th>Tip</th><th>Renk</th><th>Kesikli</th></tr></thead>
              <tbody>
                ${cizgiAdaylari.map((c, i) => {
                  const varOlan = mevcutBoruAdlari.includes(c.ad)
                  return `
                    <tr class="${varOlan ? 'kurulum-satir-uyari' : ''}">
                      <td><input type="checkbox" id="kc-sec-${i}" ${varOlan ? '' : 'checked'}></td>
                      <td><input id="kc-ad-${i}" value="${oz(c.ad)}">
                          ${varOlan ? '<div class="kurulum-kucuk-uyari">bu ad zaten var</div>' : ''}</td>
                      <td>${c.nokta_sayisi}</td>
                      <td>${uzunlukBicimle(c.uzunluk_m)}</td>
                      <td><select id="kc-tip-${i}"><option value="ana">ana</option><option value="yan">yan</option></select></td>
                      <td><input type="color" id="kc-renk-${i}" value="#2196f3"></td>
                      <td><input type="checkbox" id="kc-kesikli-${i}"></td>
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${noktaAdaylari.length > 0 ? `
          <div class="kurulum-ipucu" style="margin-top:14px;">
            ${noktaAdaylari.length} nokta bulundu. Tip adından tahmin edildi — kontrol edin.
          </div>
          <div class="kurulum-tablo-sar">
            <table class="kurulum-tablo">
              <thead><tr><th></th><th>Ad</th><th>Tip</th><th>Konum</th></tr></thead>
              <tbody>
                ${noktaAdaylari.map((n, i) => `
                  <tr>
                    <td><input type="checkbox" id="kn-sec-${i}" checked></td>
                    <td><input id="kn-ad-${i}" value="${oz(n.ad)}"></td>
                    <td><select id="kn-tip-${i}">
                      ${Object.entries(NOKTA_TIPLERI).map(([k, v]) => `
                        <option value="${k}" ${k === n.tip ? 'selected' : ''}>${v}</option>
                      `).join('')}
                    </select></td>
                    <td class="kurulum-kucuk">${n.lat.toFixed(6)}, ${n.lng.toFixed(6)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="kurulum-zona-alt">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumKmlIceAktar(this, 'saha')">⬇ İçe aktar</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumKmlTemizle()">Vazgeç</button>
        </div>
      </div>
    ` : ''}

    <div class="kurulum-kart">
      <h3>Harita</h3>
      <div class="kurulum-ipucu">
        Boru için "Boru çiz"e basıp güzergâhı sırayla tıklayın; nokta için
        "Nokta ekle"ye basıp konumu tıklayın.
      </div>
      <div id="kurulum-harita" class="kurulum-harita kurulum-harita-buyuk"></div>
      <div id="k-cizim-bar" class="kurulum-cizim-bar" style="display:none"></div>
      <div class="kurulum-zona-alt">
        <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimBaslat('boru')">✏️ Boru çiz</button>
        <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimBaslat('nokta')">📍 Nokta ekle</button>
      </div>
    </div>

    <div class="kurulum-kart">
      <h3>Boru hatları (${durum.borular.length})</h3>
      ${durum.borular.length === 0
        ? '<div class="kurulum-ipucu">Henüz boru hattı yok.</div>' : ''}
      ${durum.borular.map(h => `
        <div class="kurulum-zona">
          <div class="kurulum-izgara">
            <div>
              <label class="kurulum-etiket">Ad *</label>
              <input id="b-ad-${h.id}" value="${oz(h.ad)}">
            </div>
            <div>
              <label class="kurulum-etiket">Tip</label>
              <select id="b-tip-${h.id}">
                <option value="ana" ${h.tip === 'ana' ? 'selected' : ''}>ana</option>
                <option value="yan" ${h.tip === 'yan' ? 'selected' : ''}>yan</option>
              </select>
            </div>
            <div>
              <label class="kurulum-etiket">Sıra no</label>
              <input id="b-sira-${h.id}" type="number" min="1" inputmode="numeric" value="${oz(h.sira_no ?? 1)}">
            </div>
            <div>
              <label class="kurulum-etiket">Renk</label>
              <input id="b-renk-${h.id}" type="color" value="${oz(h.renk || '#2196f3')}">
            </div>
          </div>
          <div class="kurulum-zona-alt">
            <label class="kurulum-onay">
              <input type="checkbox" id="b-kesikli-${h.id}" ${h.kesikli ? 'checked' : ''}> kesikli çizgi
            </label>
            <span class="kurulum-rozet">${(h.koordinatlar || []).length} nokta</span>
            <span class="kurulum-rozet">${uzunlukBicimle(cizgiUzunlukM(h.koordinatlar))}</span>
            <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumBoruKaydet('${h.id}', this)">💾 Kaydet</button>
            <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sil" onclick="kurulumBoruSil('${h.id}')">🗑 Sil</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="kurulum-kart">
      <h3>Saha noktaları (${durum.noktalar.length})</h3>
      ${durum.noktalar.length === 0
        ? '<div class="kurulum-ipucu">Henüz saha noktası yok. Kuyu konumu haritanın "görünümü sıfırla" merkezidir — eklemeniz önerilir.</div>' : ''}
      ${durum.noktalar.map(n => `
        <div class="kurulum-zona">
          <div class="kurulum-izgara">
            <div>
              <label class="kurulum-etiket">Tip</label>
              <select id="n-tip-${n.id}">
                ${Object.entries(NOKTA_TIPLERI).map(([k, v]) => `
                  <option value="${k}" ${k === n.tip ? 'selected' : ''}>${v}</option>
                `).join('')}
              </select>
            </div>
            <div>
              <label class="kurulum-etiket">Ad</label>
              <input id="n-ad-${n.id}" value="${oz(n.ad)}">
            </div>
            <div>
              <label class="kurulum-etiket">Enlem</label>
              <input id="n-lat-${n.id}" type="number" step="0.000001" inputmode="decimal" value="${oz(n.lat)}">
            </div>
            <div>
              <label class="kurulum-etiket">Boylam</label>
              <input id="n-lng-${n.id}" type="number" step="0.000001" inputmode="decimal" value="${oz(n.lng)}">
            </div>
          </div>
          <div class="kurulum-zona-alt">
            <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumNoktaKaydet('${n.id}', this)">💾 Kaydet</button>
            <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sil" onclick="kurulumNoktaSil('${n.id}')">🗑 Sil</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(3)">← Parseller</button>
    </div>
  `
}

// ── ADIM 5: VANALAR ──
function vanaEtiketi(v) {
  return `${v.isaretci_no}${v.yon ? ' ' + v.yon : ''}`
}

// Filtreye uyan vanalar
function filtreliVanalar() {
  const f = durum.vanaFiltre.trim().toLocaleLowerCase('tr')
  return durum.vanalar.filter(v => {
    if (durum.sadeceEksik && v.ekim_yonu_derece && v.hat_id) return false
    if (!f) return true
    return [v.isaretci_no, v.parsel, v.boru_hatti, v.yon, v.notlar]
      .map(x => String(x ?? '').toLocaleLowerCase('tr'))
      .some(x => x.includes(f))
  })
}

function hatSecenekleri(secili) {
  return `<option value="">(hat yok)</option>` + durum.hatlar.map(h => `
    <option value="${h.id}" ${h.id === secili ? 'selected' : ''}>Hat-${h.hat_no}</option>
  `).join('')
}

function adim5HTML() {
  if (!durum.bolge?.id) return bolgeGerekliHTML()

  const adaylar = durum.kmlAdaylari?.vanaSatirlari || []
  const liste = filtreliVanalar()
  const toplamFiskiye = durum.vanalar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  const eksikYon = durum.vanalar.filter(v => !v.ekim_yonu_derece).length
  const hatsiz = durum.vanalar.filter(v => !v.hat_id).length
  const secili = durum.vanaSecili.size

  return `
    ${kmlYukleHTML('vana')}

    ${adaylar.length > 0 ? `
      <div class="kurulum-kart">
        <h3>İçe aktarılacak vanalar — ${oz(durum.kmlAdaylari.dosya)}</h3>
        <div class="kurulum-ipucu">
          ${adaylar.length} satır çözüldü.
          ${durum.kmlAdaylari.hataliSayisi > 0
            ? `<b style="color:#ff4757">${durum.kmlAdaylari.hataliSayisi} satır ayrıştırılamadı</b> — kırmızı satırları elle doldurun.`
            : 'Sahada yazılan açıklamalardan fıskiye sayısı ve yön çıkarıldı; kontrol edin.'}
        </div>
        <div class="kurulum-tablo-sar">
          <table class="kurulum-tablo">
            <thead>
              <tr><th></th><th>İşaretçi</th><th>Yön</th><th>Fıskiye</th><th>Parsel</th>
                  <th>Ekim yönü</th><th>Hat</th><th>Kaynak metin</th></tr>
            </thead>
            <tbody>
              ${adaylar.map((a, i) => `
                <tr class="${a.hata ? 'kurulum-satir-hata' : ''}">
                  <td><input type="checkbox" id="kv-sec-${i}" ${a.hata ? '' : 'checked'}></td>
                  <td><input id="kv-no-${i}" type="number" inputmode="numeric" value="${oz(a.isaretci_no ?? '')}" style="width:70px"></td>
                  <td><select id="kv-yon-${i}">
                    <option value="" ${!a.yon ? 'selected' : ''}>tek</option>
                    <option value="alt" ${a.yon === 'alt' ? 'selected' : ''}>alt</option>
                    <option value="ust" ${a.yon === 'ust' ? 'selected' : ''}>üst</option>
                  </select></td>
                  <td><input id="kv-fiskiye-${i}" type="number" inputmode="numeric" value="${oz(a.fiskiye ?? '')}" style="width:70px"></td>
                  <td><input id="kv-parsel-${i}" list="k-parsel-listesi" value="${oz(a.parsel || '')}" style="width:120px"></td>
                  <td><input id="kv-ekim-${i}" type="number" inputmode="numeric" value="${oz(a.ekim_yonu_derece ?? '')}" style="width:80px"></td>
                  <td><select id="kv-hat-${i}">${hatSecenekleri(null)}</select></td>
                  <td class="kurulum-kucuk">${oz(a.ham || '-')}
                    ${a.oneri === 'yan_sira' ? `
                      <div><label class="kurulum-onay">
                        <input type="checkbox" id="kv-yansira-${i}" checked> yan sıra kuralı
                      </label></div>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${parselListesiHTML()}
        <div class="kurulum-zona-alt">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumKmlIceAktar(this, 'vana')">⬇ İçe aktar</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumKmlTemizle()">Vazgeç</button>
        </div>
      </div>
    ` : ''}

    <div class="kurulum-kart">
      <h3>Harita</h3>
      <div class="kurulum-ipucu">
        Vanalar sürüklenerek konumları düzeltilebilir. Fıskiyeleri görmek için
        "Fıskiyeleri göster"e basın.
      </div>
      <div id="kurulum-harita" class="kurulum-harita kurulum-harita-buyuk"></div>
      <div id="k-cizim-bar" class="kurulum-cizim-bar" style="display:none"></div>
      <div class="kurulum-zona-alt">
        <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimBaslat('vana')">📍 Haritaya vana ekle</button>
        <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumFiskiyeleriGoster(this)">💧 Fıskiyeleri göster</button>
      </div>
    </div>

    ${durum.kuralVanaId ? kuralEditoruHTML() : ''}

    <div class="kurulum-kart">
      <h3>Vanalar (${durum.vanalar.length} kayıt · ${toplamFiskiye} fıskiye)</h3>
      <div class="kurulum-ipucu">
        ${eksikYon > 0 ? `<b style="color:#f5cd79">${eksikYon} vanada ekim yönü yok</b> — fıskiyeleri çizilmez. ` : ''}
        ${hatsiz > 0 ? `${hatsiz} vana hiçbir hatta atanmamış.` : 'Tüm vanalar bir hatta atanmış.'}
      </div>

      <div class="kurulum-zona-alt" style="margin-bottom:10px;">
        <input id="k-vana-filtre" placeholder="Ara: işaretçi no, parsel, boru hattı"
               value="${oz(durum.vanaFiltre)}" onchange="kurulumVanaFiltre(this.value)" style="max-width:280px">
        <label class="kurulum-onay">
          <input type="checkbox" ${durum.sadeceEksik ? 'checked' : ''} onchange="kurulumEksikFiltre(this.checked)">
          sadece eksikler
        </label>
        <span class="kurulum-rozet">${liste.length} satır gösteriliyor</span>
      </div>

      ${secili > 0 ? `
        <div class="kurulum-toplu">
          <b><span id="k-secili-sayi">${secili}</span> vana seçili</b>
          <input id="k-toplu-ekim" type="number" inputmode="numeric" placeholder="ekim yönü" style="width:110px">
          <input id="k-toplu-parsel" list="k-parsel-listesi" placeholder="parsel" style="width:130px">
          <select id="k-toplu-hat">${hatSecenekleri(null)}</select>
          <input id="k-toplu-boru" placeholder="boru hattı" style="width:130px">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumTopluUygula(this)">Seçililere uygula</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumSecimTemizle()">Seçimi bırak</button>
        </div>
      ` : ''}

      <div class="kurulum-tablo-sar">
        <table class="kurulum-tablo">
          <thead>
            <tr><th></th><th>No</th><th>Yön</th><th>Fıskiye</th><th>Parsel</th>
                <th>Ekim yönü</th><th>Hat</th><th>Kural</th><th></th></tr>
          </thead>
          <tbody>
            ${liste.map(v => `
              <tr class="${!v.ekim_yonu_derece ? 'kurulum-satir-uyari' : ''}">
                <td><input type="checkbox" ${durum.vanaSecili.has(v.id) ? 'checked' : ''}
                           onchange="kurulumVanaSec('${v.id}', this.checked)"></td>
                <td><input id="v-no-${v.id}" type="number" inputmode="numeric" value="${oz(v.isaretci_no)}" style="width:64px"></td>
                <td><select id="v-yon-${v.id}">
                  <option value="" ${!v.yon ? 'selected' : ''}>tek</option>
                  <option value="alt" ${v.yon === 'alt' ? 'selected' : ''}>alt</option>
                  <option value="ust" ${v.yon === 'ust' ? 'selected' : ''}>üst</option>
                  <option value="kismi" ${v.yon === 'kismi' ? 'selected' : ''}>kısmi</option>
                </select></td>
                <td><input id="v-fiskiye-${v.id}" type="number" inputmode="numeric" value="${oz(v.fiskiye_sayisi)}" style="width:70px"></td>
                <td><input id="v-parsel-${v.id}" list="k-parsel-listesi" value="${oz(v.parsel || '')}" style="width:130px"></td>
                <td class="kurulum-yon-hucre">
                  <input id="v-ekim-${v.id}" type="number" inputmode="numeric" value="${oz(v.ekim_yonu_derece ?? '')}" style="width:74px">
                  <button class="kurulum-mini" title="Haritadan iki nokta seçerek hesapla"
                          onclick="kurulumYonYardimcisi('v-ekim-${v.id}')">🧭</button>
                </td>
                <td><select id="v-hat-${v.id}">${hatSecenekleri(v.hat_id)}</select></td>
                <td>
                  <button class="kurulum-mini ${v.cizim_kurali ? 'kurulum-mini-dolu' : ''}"
                          title="${v.cizim_kurali ? KURAL_TIPLERI[v.cizim_kurali.tip] || v.cizim_kurali.tip : 'Özel kural tanımla'}"
                          onclick="kurulumKuralAc('${v.id}')">⚙</button>
                  ${v.cizim_kurali ? `<div class="kurulum-kucuk">${oz(v.cizim_kurali.tip)}</div>` : ''}
                </td>
                <td class="kurulum-satir-butonlar">
                  <button class="kurulum-mini" title="Kaydet" onclick="kurulumVanaKaydet('${v.id}', this)">💾</button>
                  <button class="kurulum-mini kurulum-mini-sil" title="Sil" onclick="kurulumVanaSil('${v.id}')">🗑</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${parselListesiHTML()}
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(4)">← Boru ve noktalar</button>
    </div>
  `
}

function parselListesiHTML() {
  return `<datalist id="k-parsel-listesi">
    ${durum.parseller.map(p => `<option value="${oz(p.ad)}"></option>`).join('')}
  </datalist>`
}

// ── KURAL EDİTÖRÜ (spec 3.5 — 7 tip) ──
function kuralAlanlariHTML(tip, k) {
  const alan = (id, etiket, deger, ek = '') => `
    <div>
      <label class="kurulum-etiket">${etiket}</label>
      <input id="${id}" value="${oz(deger ?? '')}" ${ek} onchange="kurulumKuralOnizle()">
    </div>`

  if (tip === 'bosluk') return `
    ${alan('kr-sonra', 'Kaçıncı fıskiyeden sonra', k.sonra ?? 16, 'type="number" inputmode="numeric"')}
    ${alan('kr-atlama', 'Kaç aralık atlanacak', k.atlama ?? 3, 'type="number" inputmode="numeric"')}`

  if (tip === 'uzat') return alan('kr-maks', 'En fazla kaç pozisyon denensin', k.maks ?? 80, 'type="number" inputmode="numeric"')

  if (tip === 'sabit') return alan('kr-adet', 'Sabit fıskiye sayısı (kırpma yok)', k.adet ?? 33, 'type="number" inputmode="numeric"')

  if (tip === 'yan_sira') return `
    ${alan('kr-ana', 'Ana sıradaki fıskiye', k.ana ?? 8, 'type="number" inputmode="numeric"')}
    ${alan('kr-komsu', 'Yön referansı: komşu işaretçi no', k.yon_referans?.komsu_isaretci ?? '', 'type="number" inputmode="numeric"')}
    ${alan('kr-s1-kaydirma', '1. yan sıra kaydırma (m)', k.siralar?.[0]?.kaydirma_m ?? 12, 'type="number" inputmode="numeric"')}
    ${alan('kr-s1-adet', '1. yan sıra fıskiye', k.siralar?.[0]?.adet ?? '', 'type="number" inputmode="numeric"')}
    ${alan('kr-s2-kaydirma', '2. yan sıra kaydırma (m)', k.siralar?.[1]?.kaydirma_m ?? 24, 'type="number" inputmode="numeric"')}
    ${alan('kr-s2-adet', '2. yan sıra fıskiye', k.siralar?.[1]?.adet ?? '', 'type="number" inputmode="numeric"')}`

  if (tip === 'kenar') return `
    <div>
      <label class="kurulum-etiket">Takip edilecek parsel</label>
      <select id="kr-parsel" onchange="kurulumKuralOnizle()">
        ${durum.parseller.map(p => `
          <option value="${oz(p.ad)}" ${p.ad === k.parsel_ad ? 'selected' : ''}>${oz(p.ad)}</option>
        `).join('')}
      </select>
    </div>
    ${alan('kr-kaydirma', 'Başlangıç kaydırma (pozisyon)', k.baslangic_kaydirma ?? 0, 'type="number" inputmode="numeric"')}`

  if (tip === 'alan_doldur') return `
    <div>
      <label class="kurulum-etiket">Doldurulacak parsel</label>
      <select id="kr-parsel" onchange="kurulumKuralOnizle()">
        ${durum.parseller.map(p => `
          <option value="${oz(p.ad)}" ${p.ad === k.parsel_ad ? 'selected' : ''}>${oz(p.ad)}</option>
        `).join('')}
      </select>
    </div>
    ${alan('kr-boru-yonu', 'Boru doğrultusu (derece)', k.boru_yonu ?? '', 'type="number" inputmode="numeric"')}
    ${alan('kr-sira-araligi', 'Sıra aralığı (m)', k.sira_araligi_m ?? 12, 'type="number" inputmode="numeric"')}
    ${alan('kr-maks-sira', 'En fazla sıra', k.maks_sira ?? 45, 'type="number" inputmode="numeric"')}
    ${alan('kr-maks-fiskiye', 'Sıra başına en fazla fıskiye', k.maks_fiskiye ?? 60, 'type="number" inputmode="numeric"')}`

  return '<div class="kurulum-ipucu">Vanadan ekim yönünde düz sıra çizilir, parsel sınırında kırpılır.</div>'
}

function kuralEditoruHTML() {
  const v = durum.vanalar.find(x => x.id === durum.kuralVanaId)
  if (!v) return ''

  const kayitli = v.cizim_kurali || {}
  // Kullanıcı tipi değiştirdiyse onu göster; alanlar ancak aynı tipte
  // kayıtlı değerlerle dolar, farklı tipte varsayılanlarla açılır
  const tip = durum.kuralTip ?? (kayitli.tip || '')
  const k = tip === kayitli.tip ? kayitli : {}

  return `
    <div class="kurulum-kart kurulum-kural-kart">
      <h3>⚙ Özel dizilim kuralı — Vana ${vanaEtiketi(v)}</h3>
      <div class="kurulum-ipucu">
        Değişiklikler haritada <b style="color:#f9ca24">sarı</b> olarak anında önizlenir.
        Kaydetmeden harita çizimi değişmez.
      </div>

      <div class="kurulum-izgara">
        <div>
          <label class="kurulum-etiket">Kural tipi</label>
          <select id="kr-tip" onchange="kurulumKuralTipDegis(this.value)">
            ${Object.entries(KURAL_TIPLERI).map(([k2, ad]) => `
              <option value="${k2}" ${k2 === tip ? 'selected' : ''}>${ad}</option>
            `).join('')}
          </select>
        </div>
        ${kuralAlanlariHTML(tip, k)}
      </div>

      <div class="kurulum-zona-alt">
        <span id="k-kural-bilgi" class="kurulum-rozet">—</span>
        <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumKuralKaydet(this)">💾 Kuralı kaydet</button>
        ${v.cizim_kurali ? '<button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sil" onclick="kurulumKuralKaldir()">Kuralı kaldır</button>' : ''}
        <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumKuralKapat()">Kapat</button>
      </div>
    </div>
  `
}

// Editördeki alanlardan kural nesnesini üretir
function kuraliOku() {
  const tip = deger('kr-tip')
  if (!tip) return null

  if (tip === 'bosluk') return { tip, sonra: sayi('kr-sonra', 16), atlama: sayi('kr-atlama', 3) }
  if (tip === 'uzat') return { tip, maks: sayi('kr-maks', 80) }
  if (tip === 'sabit') return { tip, adet: sayi('kr-adet', 33) }
  if (tip === 'kenar') return {
    tip, parsel_ad: deger('kr-parsel'), baslangic_kaydirma: sayi('kr-kaydirma', 0)
  }
  if (tip === 'alan_doldur') return {
    tip,
    parsel_ad: deger('kr-parsel'),
    boru_yonu: sayi('kr-boru-yonu', 0),
    sira_araligi_m: sayi('kr-sira-araligi', 12),
    maks_sira: sayi('kr-maks-sira', 45),
    maks_fiskiye: sayi('kr-maks-fiskiye', 60)
  }
  if (tip === 'yan_sira') {
    const siralar = []
    const s1 = sayi('kr-s1-adet'); const s2 = sayi('kr-s2-adet')
    if (s1) siralar.push({ kaydirma_m: sayi('kr-s1-kaydirma', 12), adet: s1 })
    if (s2) siralar.push({ kaydirma_m: sayi('kr-s2-kaydirma', 24), adet: s2 })
    return {
      tip,
      ana: sayi('kr-ana', 0),
      yon_referans: { komsu_isaretci: sayi('kr-komsu') },
      siralar
    }
  }
  return null
}

// Kuralın sonucunu haritada sarı noktalarla gösterir
function kuralOnizle() {
  if (!onizlemeKatmani) return
  onizlemeKatmani.clearLayers()

  const v = durum.vanalar.find(x => x.id === durum.kuralVanaId)
  if (!v) return

  const denemeVana = { ...v, cizim_kurali: kuraliOku() }
  const noktalar = fiskiyeKonumlari(denemeVana, durum.vanalar, sahaVerisi())

  noktalar.forEach(n => {
    L.circleMarker([n.lat, n.lng], {
      radius: 3.5, stroke: false, fillColor: '#f9ca24', fillOpacity: 0.95
    }).addTo(onizlemeKatmani)
  })

  const bilgi = document.getElementById('k-kural-bilgi')
  if (bilgi) {
    bilgi.textContent = `${noktalar.length} fıskiye çizilecek (kayıtlı sayı: ${v.fiskiye_sayisi})`
  }
}

// ── ADIM 6: HATLAR ──

// Hat kapasitesi bandı (spec adım 6: yeşil 75-95, sarı 60-75/95-110, kırmızı dışı)
function fiskiyeBandRengi(n) {
  if (n >= HAT_BAND_YESIL[0] && n <= HAT_BAND_YESIL[1]) return { renk: '#26de81', etiket: 'ideal (75-95)' }
  if (n >= HAT_BAND_SARI[0] && n <= HAT_BAND_SARI[1]) return { renk: '#f9ca24', etiket: 'kabul edilebilir' }
  return { renk: '#ff4757', etiket: 'bant dışı' }
}

function adim6HTML() {
  if (!durum.bolge?.id) return bolgeGerekliHTML()

  if (durum.zonalar.length === 0) {
    return `
      <div class="kurulum-kart">
        <div class="kurulum-ipucu">Hat tanımlamak için önce 2. adımdan en az bir zona ekleyin.</div>
        <button class="kurulum-btn" onclick="kurulumAdimSec(2)">← Zonalara git</button>
      </div>
    `
  }

  return `
    <div class="kurulum-kart">
      <h3>Harita</h3>
      <div class="kurulum-ipucu">
        ${durum.hatDuzenleId
          ? 'Vana tıklayarak düzenlenen hatta ekleyin/çıkarın. Mavi = seçili, sarı = başka hatta, gri = boşta.'
          : 'Yeşil = bir hatta atanmış, kırmızı = hat atanmamış. Düzenlemek için aşağıdan bir hat seçin.'}
      </div>
      <div id="kurulum-harita" class="kurulum-harita kurulum-harita-buyuk"></div>
    </div>

    ${durum.hatDuzenleId ? hatEditoruHTML() : ''}

    ${hatListesiHTML()}

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumAdimSec(5)">← Vanalar</button>
      <button class="kurulum-btn" onclick="kurulumOzetGoster()">📋 Kurulum özeti →</button>
    </div>
  `
}

function hatListesiHTML() {
  return durum.zonalar.map(zona => {
    const hatlar = durum.hatlar
      .filter(h => h.zona_id === zona.id)
      .sort((a, b) => (a.sira_no || 0) - (b.sira_no || 0))

    return `
      <div class="kurulum-kart">
        <h3>${oz(zona.ad)} — hatlar (${hatlar.length})</h3>
        <div class="kurulum-zona-alt" style="margin-bottom:10px;">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumHatYeni('${zona.id}')">➕ Yeni hat</button>
          <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade"
                  onclick="kurulumKuyuyaSirala('${zona.id}', this)"
                  ${hatlar.length < 2 ? 'disabled title="Sıralamak için en az 2 hat gerekli"' : ''}
          >🧭 Kuyuya yakınlığa göre sırala</button>
        </div>

        ${hatlar.length === 0 ? '<div class="kurulum-ipucu">Bu zonada henüz hat yok.</div>' : `
          <div class="kurulum-tablo-sar">
            <table class="kurulum-tablo">
              <thead>
                <tr><th>Sıra</th><th>Hat no</th><th>Vana · Fıskiye</th><th>Süre (dk)</th><th>Parsel</th><th></th></tr>
              </thead>
              <tbody>
                ${hatlar.map((h, i) => {
                  const bant = fiskiyeBandRengi(h.gercek_fiskiye)
                  const kilitli = aktifHatKilitli(h.id)
                  return `
                  <tr>
                    <td class="kurulum-sira-hucre">
                      <button class="kurulum-mini" ${i === 0 ? 'disabled' : ''}
                              onclick="kurulumHatSiraDegis('${h.id}', -1)">▲</button>
                      <input id="h-sira-${h.id}" type="number" inputmode="numeric" value="${oz(h.sira_no ?? 1)}" style="width:52px">
                      <button class="kurulum-mini" ${i === hatlar.length - 1 ? 'disabled' : ''}
                              onclick="kurulumHatSiraDegis('${h.id}', 1)">▼</button>
                    </td>
                    <td><input id="h-no-${h.id}" type="number" inputmode="numeric" value="${oz(h.hat_no)}" style="width:60px"></td>
                    <td><span class="kurulum-rozet" style="border-color:${bant.renk};color:${bant.renk}">
                      ${h.vana_sayisi} vana · ${h.gercek_fiskiye} fıskiye</span>
                      ${kilitli ? '<div class="kurulum-kucuk-uyari">🔒 şu anda sulanıyor</div>' : ''}</td>
                    <td><input id="h-sure-${h.id}" type="number" inputmode="numeric" value="${oz(h.varsayilan_sure_dk ?? 480)}" style="width:70px"></td>
                    <td><input id="h-parsel-${h.id}" value="${oz(h.parsel_bilgisi || '')}" style="width:110px"></td>
                    <td class="kurulum-satir-butonlar">
                      <button class="kurulum-mini" title="Kaydet" onclick="kurulumHatKaydet('${h.id}', this)">💾</button>
                      <button class="kurulum-mini" title="Vana seç" onclick="kurulumHatDuzenle('${h.id}')">🚰</button>
                      <button class="kurulum-mini kurulum-mini-sil"
                              title="${kilitli ? 'Şu anda sulanan hat silinemez'
                                     : h.kayit_sayisi ? 'Sulama kaydı olan hat silinemez' : 'Sil'}"
                              onclick="kurulumHatSil('${h.id}')"
                              ${(h.kayit_sayisi || kilitli) ? 'disabled' : ''}>🗑</button>
                    </td>
                  </tr>`
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `
  }).join('')
}

// Hat editörü: vana seçimiyle birlikte hat bilgileri (spec adım 6 — en kritik ekran)
function hatEditoruHTML() {
  const yeniMi = durum.hatDuzenleId === 'yeni'
  const h = yeniMi ? null : durum.hatlar.find(x => x.id === durum.hatDuzenleId)
  if (!yeniMi && !h) return ''

  const zonaId = yeniMi ? durum.hatYeniZona : h.zona_id
  const zonaHatlari = durum.hatlar.filter(x => x.zona_id === zonaId)
  const oneriHatNo = yeniMi
    ? (zonaHatlari.length ? Math.max(...zonaHatlari.map(x => x.hat_no || 0)) + 1 : 1)
    : h.hat_no
  const oneriSiraNo = yeniMi
    ? (zonaHatlari.length ? Math.max(...zonaHatlari.map(x => x.sira_no || 0)) + 1 : 1)
    : h.sira_no

  const seciliVanalar = durum.vanalar.filter(v => durum.hatVanaSecili.has(v.id))
  const toplamFiskiye = seciliVanalar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  const bant = fiskiyeBandRengi(toplamFiskiye)

  const filtre = durum.hatVanaFiltre.trim().toLocaleLowerCase('tr')
  const vanaListesi = durum.vanalar.filter(v => {
    if (!filtre) return true
    return [v.isaretci_no, v.parsel, v.yon]
      .map(x => String(x ?? '').toLocaleLowerCase('tr'))
      .some(x => x.includes(filtre))
  })

  return `
    <div class="kurulum-kart kurulum-kural-kart">
      <h3>${yeniMi ? '➕ Yeni hat' : `✎ Hat-${h.hat_no} düzenleniyor`}</h3>

      <div class="kurulum-izgara">
        <div>
          <label class="kurulum-etiket">Zona</label>
          <select id="he-zona">
            ${durum.zonalar.map(z => `
              <option value="${z.id}" ${z.id === zonaId ? 'selected' : ''}>${oz(z.ad)}</option>
            `).join('')}
          </select>
        </div>
        <div><label class="kurulum-etiket">Hat no *</label>
          <input id="he-no" type="number" inputmode="numeric" value="${oz(oneriHatNo)}"></div>
        <div><label class="kurulum-etiket">Sıra no</label>
          <input id="he-sira" type="number" inputmode="numeric" value="${oz(oneriSiraNo)}"></div>
        <div><label class="kurulum-etiket">Varsayılan süre (dk)</label>
          <input id="he-sure" type="number" inputmode="numeric"
                 value="${oz(h?.varsayilan_sure_dk ?? durum.bolge.varsayilan_sure_dk ?? 480)}"></div>
        <div class="kurulum-genis"><label class="kurulum-etiket">Parsel bilgisi</label>
          <input id="he-parsel" value="${oz(h?.parsel_bilgisi || '')}" placeholder="boş bırakılırsa seçili vanalardan otomatik doldurulur"></div>
      </div>

      <div class="kurulum-hat-ozet" style="border-color:${bant.renk}">
        <b>${seciliVanalar.length} vana seçili · ${toplamFiskiye} fıskiye</b>
        <span style="color:${bant.renk}">${bant.etiket}</span>
      </div>
      <div class="kurulum-ipucu">Haritadan vana tıklayarak seçin/çıkarın, ya da aşağıdaki listeden işaretleyin.</div>

      <input id="he-filtre" placeholder="Ara: işaretçi no, parsel" value="${oz(durum.hatVanaFiltre)}"
             onchange="kurulumHatVanaFiltre(this.value)" style="max-width:280px; margin-bottom:8px;">

      <div class="kurulum-tablo-sar kurulum-tablo-scroll">
        <table class="kurulum-tablo">
          <thead><tr><th></th><th>No</th><th>Yön</th><th>Fıskiye</th><th>Parsel</th><th>Mevcut hat</th></tr></thead>
          <tbody>
            ${vanaListesi.map(v => {
              const baskaHatta = v.hat_id && v.hat_id !== durum.hatDuzenleId && !durum.hatVanaSecili.has(v.id)
              const mevcutHatAd = v.hat_id ? (durum.hatlar.find(x => x.id === v.hat_id)?.hat_no ?? '?') : null
              return `
              <tr class="${baskaHatta ? 'kurulum-satir-uyari' : ''}">
                <td><input type="checkbox" ${durum.hatVanaSecili.has(v.id) ? 'checked' : ''}
                    onchange="kurulumHatVanaSec('${v.id}', this.checked)"></td>
                <td>${v.isaretci_no}</td>
                <td>${v.yon || 'tek'}</td>
                <td>${v.fiskiye_sayisi || 0}</td>
                <td>${oz(v.parsel || '-')}</td>
                <td>${baskaHatta
                  ? `<span class="kurulum-kucuk-uyari">Hat-${mevcutHatAd}</span>`
                  : (mevcutHatAd ? 'bu hat' : '-')}</td>
              </tr>`
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="kurulum-zona-alt">
        <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumHatEditoruKaydet(this)">💾 Hattı kaydet</button>
        <button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumHatEditoruKapat()">✕ Vazgeç</button>
      </div>
    </div>
  `
}

// ── ADIM 6 ÖZETİ (kurulum sonu) ──
function ozetHTML() {
  const toplamAlan = durum.parseller.reduce((t, p) => t + Number(p.alan_m2 || 0), 0)
  const toplamFiskiye = durum.vanalar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  const farkliVana = new Set(durum.vanalar.map(v => v.isaretci_no)).size

  const hatsizVanalar = durum.vanalar.filter(v => !v.hat_id)
  const ekimYonuBosVanalar = durum.vanalar.filter(v => !v.ekim_yonu_derece)
  const bantDisiHatlar = durum.hatlar.filter(h => fiskiyeBandRengi(h.gercek_fiskiye).renk === '#ff4757')
  const vanasizHatlar = durum.hatlar.filter(h => h.vana_sayisi === 0)

  const uyarilar = [
    hatsizVanalar.length > 0 && uyariSatiriHTML(
      `${hatsizVanalar.length} vana hiçbir hatta atanmamış`,
      hatsizVanalar.map(v => v.isaretci_no).join(', ')),
    ekimYonuBosVanalar.length > 0 && uyariSatiriHTML(
      `${ekimYonuBosVanalar.length} vanada ekim yönü girilmemiş — fıskiyeleri çizilmez`,
      ekimYonuBosVanalar.map(v => v.isaretci_no).join(', ')),
    bantDisiHatlar.length > 0 && uyariSatiriHTML(
      `${bantDisiHatlar.length} hat 60-110 fıskiye bandının dışında`,
      bantDisiHatlar.map(h => `Hat-${h.hat_no} (${h.gercek_fiskiye})`).join(', ')),
    vanasizHatlar.length > 0 && uyariSatiriHTML(
      `${vanasizHatlar.length} hatta hiç vana atanmamış`,
      vanasizHatlar.map(h => `Hat-${h.hat_no}`).join(', '))
  ].filter(Boolean).join('')

  return `
    <div class="kurulum-kart">
      <h3>📋 Kurulum Özeti — ${oz(durum.bolge.ad)}</h3>
      <div class="kurulum-ozet-izgara">
        <div class="kurulum-ozet-kutu"><b>${durum.parseller.length}</b><span>parsel</span></div>
        <div class="kurulum-ozet-kutu"><b>${farkliVana}</b><span>vana</span></div>
        <div class="kurulum-ozet-kutu"><b>${durum.hatlar.length}</b><span>hat</span></div>
        <div class="kurulum-ozet-kutu"><b>${toplamFiskiye}</b><span>fıskiye</span></div>
        <div class="kurulum-ozet-kutu"><b>${dekarBicimle(toplamAlan)}</b><span>toplam alan</span></div>
      </div>
    </div>

    <div class="kurulum-kart">
      <h3>Eksik ve uyarılar</h3>
      ${uyarilar || '<div class="kurulum-ozet-temiz">✓ Eksik bulunamadı.</div>'}
    </div>

    <div class="kurulum-kart">
      <h3>Dışa aktar</h3>
      <div class="kurulum-ipucu">
        Kurulmuş sahayı KML olarak indirip Google Earth ile yerinde kontrol edebilirsiniz.
      </div>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumKmlIndir(this)">⬇ KML olarak indir</button>
    </div>

    <div class="kurulum-kart">
      <h3>Kurulumu tamamla</h3>
      <div class="kurulum-ipucu">
        "Kurulumu tamamla" bölgeyi bölge seçicide görünür yapar. Eksikler varken de
        tamamlanabilir — sonradan her adımdan düzenlemeye devam edebilirsiniz.
      </div>
      ${durum.bolge.kurulum_tamam
        ? '<div class="kurulum-ozet-temiz">✓ Bu bölgenin kurulumu tamamlanmış olarak işaretli.</div>'
        : '<button class="kurulum-btn" onclick="kurulumTamamla(this)">✅ Kurulumu tamamla</button>'}
    </div>

    <div class="kurulum-alt-cubuk">
      <span id="k-mesaj" class="kurulum-mesaj"></span>
      <button class="kurulum-btn kurulum-btn-sade" onclick="kurulumOzetKapat()">← Hatlara dön</button>
    </div>
  `
}

function uyariSatiriHTML(baslik, detay) {
  return `<div class="kurulum-uyari-satir"><b>${oz(baslik)}</b><div class="kurulum-kucuk">${oz(detay)}</div></div>`
}

// ── ADIM 3-4 HARİTASI ──
function sahaHaritasiKur() {
  const el = document.getElementById('kurulum-harita')
  if (!el) return

  const b = durum.bolge
  kurulumHaritasi = L.map('kurulum-harita', {
    center: [Number(b.merkez_lat ?? 38.6295), Number(b.merkez_lng ?? 36.2460)],
    zoom: Number(b.varsayilan_zoom) || VARSAYILAN.varsayilan_zoom,
    zoomControl: true
  })

  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Google Satellite',
    maxZoom: 21
  }).addTo(kurulumHaritasi)

  mevcutKatman = L.layerGroup().addTo(kurulumHaritasi)
  onizlemeKatmani = L.layerGroup().addTo(kurulumHaritasi)
  cizimKatmani = L.layerGroup().addTo(kurulumHaritasi)
  mevcutlariCiz()
  if (durum.adim === 5) vanalariCiz()
  if (durum.adim === 6) vanalariCizAdim6()

  kurulumHaritasi.on('click', e => {
    if (!cizim) return
    const k = [e.latlng.lat, e.latlng.lng]
    // Tek konumlu modlar önceki tıklamayı değiştirir; 'yon' iki nokta toplar
    if (cizim.tip === 'nokta' || cizim.tip === 'vana') cizim.noktalar = [k]
    else if (cizim.tip === 'yon' && cizim.noktalar.length >= 2) cizim.noktalar = [k]
    else cizim.noktalar.push(k)
    cizimGuncelle()
  })

  const sinirlar = tumSinirlar()
  if (sinirlar.length > 0) kurulumHaritasi.fitBounds(sinirlar, { padding: [25, 25] })

  setTimeout(() => kurulumHaritasi?.invalidateSize(), 60)
}

function tumSinirlar() {
  const s = []
  durum.parseller.forEach(p => (p.koordinatlar || []).forEach(c => s.push([c[1], c[0]])))
  durum.borular.forEach(h => (h.koordinatlar || []).forEach(c => s.push(c)))
  durum.noktalar.forEach(n => s.push([n.lat, n.lng]))
  if (durum.adim === 5 || durum.adim === 6) durum.vanalar.forEach(v => s.push([v.lat, v.lng]))
  return s
}

// Vanaları sürüklenebilir işaretlerle çizer (adım 5)
function vanalariCiz() {
  const gruplar = {}
  durum.vanalar.forEach(v => {
    const anahtar = `${v.lat},${v.lng}`
    ;(gruplar[anahtar] ||= []).push(v)
  })

  Object.values(gruplar).forEach(grup => {
    const v = grup[0]
    const eksik = grup.some(x => !x.ekim_yonu_derece)
    const isaret = L.marker([v.lat, v.lng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: `<div style="width:11px;height:11px;background:${eksik ? '#f5cd79' : '#e74c3c'};
               border:2px solid #0f1923;transform:rotate(45deg);box-sizing:border-box;"></div>`,
        iconSize: [11, 11],
        iconAnchor: [5, 5]
      })
    })

    isaret.bindTooltip(String(v.isaretci_no), {
      permanent: true, direction: 'top', offset: [0, -7], className: 'vana-etiket'
    })

    // Sürükleyip bırakınca bu konumdaki tüm kayıtlar (alt/üst) birlikte taşınır
    isaret.on('dragend', async () => {
      const k = isaret.getLatLng()
      if (!confirm(`Vana ${v.isaretci_no} yeni konuma taşınsın mı?\n${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}`)) {
        isaret.setLatLng([v.lat, v.lng])
        return
      }
      for (const x of grup) {
        await supabase.from('vanalar').update({ lat: k.lat, lng: k.lng }).eq('id', x.id)
      }
      await logKaydet('kurulum',
        `Vana ${v.isaretci_no} konumu güncellendi (${durum.bolge.ad})`, durum.bolge.id)
      await bolgeAyrintilariYukle()
      ciz()
      mesaj(`✓ Vana ${v.isaretci_no} taşındı.`, 'basari')
    })

    isaret.addTo(mevcutKatman)
  })
}

function mevcutlariCiz() {
  if (!mevcutKatman) return
  mevcutKatman.clearLayers()

  durum.parseller.forEach(p => {
    const latlngs = (p.koordinatlar || []).map(c => [c[1], c[0]])
    if (latlngs.length < 3) return
    const renk = p.renk || '#3fae4a'
    L.polygon(latlngs, { color: renk, weight: 2, fillColor: renk, fillOpacity: 0.2 })
      .bindPopup(`<b>${oz(p.ad)}</b><br>${alanBicimle(p.alan_m2)}`)
      .addTo(mevcutKatman)
  })

  durum.borular.forEach(h => {
    if (!h.koordinatlar?.length) return
    L.polyline(h.koordinatlar, {
      color: h.renk || '#2196f3',
      weight: 4,
      opacity: 0.9,
      dashArray: h.kesikli ? '8,6' : null
    }).bindPopup(oz(h.ad)).addTo(mevcutKatman)
  })

  durum.noktalar.forEach(n => {
    L.circleMarker([n.lat, n.lng], {
      radius: n.tip === 'kuyu' ? 9 : 6,
      color: n.tip === 'kuyu' ? '#00e5ff' : '#ff5252',
      weight: 2,
      fillColor: n.tip === 'kuyu' ? '#003344' : '#ff5252',
      fillOpacity: 0.9
    }).bindPopup(`<b>${oz(n.ad || NOKTA_TIPLERI[n.tip])}</b><br>${NOKTA_TIPLERI[n.tip] || n.tip}`)
      .addTo(mevcutKatman)
  })
}

// Vanaları tıklanabilir noktalarla çizer (adım 6 — hat ataması)
// Editör kapalıyken: yeşil=hat atanmış, kırmızı=atanmamış (bilgi amaçlı).
// Editör açıkken: mavi=seçili, sarı=başka hatta (uyarı), gri=boşta (tıklanabilir).
function vanalariCizAdim6() {
  const gruplar = {}
  durum.vanalar.forEach(v => {
    const anahtar = `${v.lat},${v.lng}`
    ;(gruplar[anahtar] ||= []).push(v)
  })

  const editorAcik = durum.hatDuzenleId != null

  Object.values(gruplar).forEach(grup => {
    const v = grup[0]
    const grupIdleri = grup.map(x => x.id)
    const secili = editorAcik && grup.some(x => durum.hatVanaSecili.has(x.id))
    const baskaHatta = editorAcik && !secili && grup.some(x => x.hat_id && x.hat_id !== durum.hatDuzenleId)

    let renk = '#e74c3c'
    if (editorAcik) renk = secili ? '#1450b8' : (baskaHatta ? '#f5cd79' : '#7f8c8d')
    else if (grup.some(x => x.hat_id)) renk = '#26de81'

    const toplamF = grup.reduce((t, x) => t + (x.fiskiye_sayisi || 0), 0)

    const isaret = L.circleMarker([v.lat, v.lng], {
      radius: secili ? 8 : 6,
      color: '#0f1923',
      weight: 2,
      fillColor: renk,
      fillOpacity: 0.9
    })

    isaret.bindTooltip(String(v.isaretci_no), {
      permanent: true, direction: 'top', offset: [0, -9], className: 'vana-etiket'
    })
    isaret.bindPopup(`<b>Vana ${v.isaretci_no}</b><br>${toplamF} fıskiye`)

    if (editorAcik) {
      isaret.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        const hepsiSecili = grupIdleri.every(id => durum.hatVanaSecili.has(id))
        grupIdleri.forEach(id => {
          if (hepsiSecili) durum.hatVanaSecili.delete(id)
          else durum.hatVanaSecili.add(id)
        })
        ciz()
      })
    }

    isaret.addTo(mevcutKatman)
  })
}

// ── HARİTADA ÇİZİM ──
function cizimBariAc(tip) {
  const bar = document.getElementById('k-cizim-bar')
  if (!bar) return

  const baslik = {
    parsel: 'Parsel çizimi', boru: 'Boru çizimi', nokta: 'Nokta ekleme',
    vana: 'Vana ekleme', yon: 'Ekim yönü yardımcısı'
  }[tip]

  const iptal = '<button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumCizimIptal()">✕ İptal</button>'
  const bilgi = `<span id="k-cizim-bilgi" class="kurulum-cizim-bilgi">haritaya tıklayın</span>`

  // Ekim yönü yardımcısı: iki nokta seç, pusula açısını hesapla
  if (tip === 'yon') {
    bar.innerHTML = `
      <span class="kurulum-cizim-baslik">${baslik}</span>
      ${bilgi}
      <span class="kurulum-kucuk">Ekim doğrultusunda önce başlangıç, sonra bitiş noktasını tıklayın.</span>
      <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumYonUygula()">✓ Alana yaz</button>
      ${iptal}
    `
    bar.style.display = 'flex'
    return
  }

  if (tip === 'vana') {
    bar.innerHTML = `
      <span class="kurulum-cizim-baslik">${baslik}</span>
      ${bilgi}
      <input id="k-vana-no" type="number" inputmode="numeric" placeholder="işaretçi no" style="width:110px">
      <input id="k-vana-fiskiye" type="number" inputmode="numeric" placeholder="fıskiye" style="width:90px">
      <select id="k-vana-yon">
        <option value="">tek</option><option value="alt">alt</option><option value="ust">üst</option>
      </select>
      <input id="k-vana-ekim" type="number" inputmode="numeric" placeholder="ekim yönü" style="width:110px">
      <input id="k-vana-parsel" list="k-parsel-listesi" placeholder="parsel" style="width:120px">
      <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimKaydet(this)">💾 Kaydet</button>
      ${iptal}
    `
    bar.style.display = 'flex'
    return
  }

  bar.innerHTML = `
    <span class="kurulum-cizim-baslik">${baslik}</span>
    ${bilgi}
    <input id="k-cizim-ad" placeholder="Ad" class="kurulum-cizim-ad">
    ${tip === 'nokta' ? `
      <select id="k-cizim-tip">
        ${Object.entries(NOKTA_TIPLERI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
    ` : `
      <input type="color" id="k-cizim-renk" value="${tip === 'parsel' ? '#3fae4a' : '#2196f3'}">
    `}
    ${tip === 'boru' ? '<label class="kurulum-onay"><input type="checkbox" id="k-cizim-kesikli"> kesikli</label>' : ''}
    ${tip !== 'nokta' ? '<button class="kurulum-btn kurulum-btn-kucuk kurulum-btn-sade" onclick="kurulumCizimGeriAl()">↶ Geri al</button>' : ''}
    <button class="kurulum-btn kurulum-btn-kucuk" onclick="kurulumCizimKaydet(this)">💾 Kaydet</button>
    ${iptal}
  `
  bar.style.display = 'flex'
}

function cizimGuncelle() {
  if (!cizimKatmani || !cizim) return
  cizimKatmani.clearLayers()

  const n = cizim.noktalar
  n.forEach((k, i) => {
    L.circleMarker(k, { radius: 4, color: '#f9ca24', weight: 2, fillColor: '#f9ca24', fillOpacity: 1 })
      .bindTooltip(String(i + 1), { direction: 'top' })
      .addTo(cizimKatmani)
  })

  if (cizim.tip === 'parsel' && n.length >= 3) {
    L.polygon(n, { color: '#f9ca24', weight: 2, dashArray: '6,4', fillOpacity: 0.15 }).addTo(cizimKatmani)
  } else if ((cizim.tip === 'boru' || cizim.tip === 'yon') && n.length >= 2) {
    L.polyline(n, { color: '#f9ca24', weight: 3, dashArray: '6,4' }).addTo(cizimKatmani)
  }

  const bilgi = document.getElementById('k-cizim-bilgi')
  if (!bilgi) return
  if (n.length === 0) {
    bilgi.textContent = 'haritaya tıklayın'
  } else if (cizim.tip === 'parsel') {
    const alan = n.length >= 3 ? poligonAlanM2(n.map(([lat, lng]) => [lng, lat])) : 0
    bilgi.textContent = `${n.length} köşe · ${n.length >= 3 ? dekarBicimle(alan) : 'en az 3 köşe gerekli'}`
  } else if (cizim.tip === 'boru') {
    bilgi.textContent = `${n.length} nokta · ${uzunlukBicimle(cizgiUzunlukM(n))}`
  } else if (cizim.tip === 'yon') {
    bilgi.textContent = n.length < 2
      ? '1. nokta seçildi — bitiş noktasını tıklayın'
      : `Ekim yönü: ${cizimYonu()}° · ${uzunlukBicimle(cizgiUzunlukM(n))}`
  } else {
    bilgi.textContent = `${n[0][0].toFixed(6)}, ${n[0][1].toFixed(6)}`
  }
}

// Yön yardımcısında seçilen iki noktanın pusula açısı
function cizimYonu() {
  const n = cizim?.noktalar || []
  if (n.length < 2) return null
  return Math.round(yonHesapla(n[0][0], n[0][1], n[1][0], n[1][1]))
}

// ── MESAJ ──
function mesaj(metin, tip = 'bilgi') {
  const el = document.getElementById('k-mesaj')
  if (!el) return
  el.textContent = metin
  el.className = 'kurulum-mesaj kurulum-mesaj-' + tip
}

// ── GLOBAL FONKSİYONLAR ──
window.kurulumAdimSec = (no) => {
  const adim = ADIMLAR.find(a => a.no === no)
  if (!adim?.hazir) return
  durum.adim = no
  durum.kmlAdaylari = null   // her adım kendi yüklemesiyle başlasın
  durum.ozetAcik = false
  ciz()
}

window.kurulumBolgeSec = async (bolgeId) => {
  durum.bolge = durum.bolgeler.find(b => b.id === bolgeId) || null
  durum.kmlAdaylari = null
  await bolgeAyrintilariYukle()
  ciz()
}

window.kurulumKodOner = () => {
  const kodEl = document.getElementById('k-kod')
  // Kayıtlı bölgenin kodu değişmez; yalnızca yeni bölgede ad'dan türetilir
  if (!kodEl || kodEl.readOnly || kodEl.dataset.elle === '1') return
  kodEl.value = slugYap(deger('k-ad'))
}

window.kurulumMerkeziUygula = () => {
  const lat = sayi('k-lat')
  const lng = sayi('k-lng')
  if (lat == null || lng == null || !kurulumHaritasi?._isaret) return
  kurulumHaritasi._isaret.setLatLng([lat, lng])
  kurulumHaritasi.setView([lat, lng])
}

window.kurulumBolgeKaydet = async (btn) => {
  const ad = deger('k-ad')
  const kod = slugYap(deger('k-kod'))

  if (!ad) return mesaj('Bölge adı zorunlu.', 'hata')
  if (!kod) return mesaj('Kod (slug) zorunlu.', 'hata')

  const lat = sayi('k-lat')
  const lng = sayi('k-lng')
  if ((lat == null) !== (lng == null)) {
    return mesaj('Enlem ve boylam birlikte girilmeli.', 'hata')
  }

  const kayit = {
    ad,
    il: deger('k-il') || null,
    ilce: deger('k-ilce') || null,
    aciklama: deger('k-aciklama') || null,
    merkez_lat: lat,
    merkez_lng: lng,
    varsayilan_zoom: sayi('k-zoom', VARSAYILAN.varsayilan_zoom),
    fiskiye_araligi_m: sayi('k-aralik', VARSAYILAN.fiskiye_araligi_m),
    fiskiye_kapsama_m: sayi('k-kapsama', VARSAYILAN.fiskiye_kapsama_m),
    fiskiye_alan_m2: sayi('k-alan', VARSAYILAN.fiskiye_alan_m2),
    varsayilan_sure_dk: sayi('k-sure', VARSAYILAN.varsayilan_sure_dk)
  }

  btn.disabled = true
  mesaj('Kaydediliyor...')

  const yeniMi = !durum.bolge?.id
  let sonuc

  if (yeniMi) {
    // sistem_durumu satırı trigger ile otomatik oluşur
    const siraNo = durum.bolgeler.length > 0
      ? Math.max(...durum.bolgeler.map(b => b.sira_no || 0)) + 1
      : 1
    sonuc = await supabase
      .from('bolgeler')
      .insert({ ...kayit, kod, sira_no: siraNo, aktif: true })
      .select()
      .single()
  } else {
    sonuc = await supabase
      .from('bolgeler')
      .update(kayit)
      .eq('id', durum.bolge.id)
      .select()
      .single()
  }

  btn.disabled = false

  if (sonuc.error) {
    const m = sonuc.error.message || ''
    mesaj(m.includes('duplicate') || m.includes('unique')
      ? `"${kod}" kodu başka bir bölgede kullanılıyor.`
      : 'Kaydedilemedi: ' + m, 'hata')
    return
  }

  await logKaydet('kurulum',
    yeniMi ? `Bölge oluşturuldu: ${ad} (${kod})` : `Bölge güncellendi: ${ad}`,
    sonuc.data.id)

  const bolgeId = sonuc.data.id
  await verileriYukle(bolgeId)
  durum.adim = yeniMi ? 2 : 1
  ciz()
  mesaj(yeniMi ? '✓ Bölge oluşturuldu — şimdi zona ekleyin.' : '✓ Kaydedildi.', 'basari')
}

window.kurulumZonaEkle = async (btn) => {
  const ad = deger('z-yeni-ad')
  if (!ad) return mesaj('Zona adı zorunlu.', 'hata')

  btn.disabled = true
  const { error } = await supabase.from('zonalar').insert({
    bolge_id: durum.bolge.id,
    ad,
    aciklama: deger('z-yeni-aciklama') || null,
    sira_no: sayi('z-yeni-sira', durum.zonalar.length + 1)
  })
  btn.disabled = false

  if (error) return mesaj('Eklenemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Zona eklendi: ${ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Zona eklendi.', 'basari')
}

window.kurulumZonaKaydet = async (zonaId, btn) => {
  const ad = deger(`z-ad-${zonaId}`)
  if (!ad) return mesaj('Zona adı zorunlu.', 'hata')

  btn.disabled = true
  const { error } = await supabase
    .from('zonalar')
    .update({
      ad,
      aciklama: deger(`z-aciklama-${zonaId}`) || null,
      sira_no: sayi(`z-sira-${zonaId}`, 1)
    })
    .eq('id', zonaId)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Zona güncellendi: ${ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Zona kaydedildi.', 'basari')
}

window.kurulumZonaSil = async (zonaId) => {
  const zona = durum.zonalar.find(z => z.id === zonaId)
  if (!zona) return

  // Geçmiş kayıtları koru: hattı olan zona silinmez
  if (zona.hat_sayisi > 0) {
    alert(`"${zona.ad}" zonasında ${zona.hat_sayisi} hat var.\nÖnce hatları başka zonaya taşıyın veya silin.`)
    return
  }
  if (!confirm(`"${zona.ad}" zonası silinsin mi?`)) return

  const { error } = await supabase.from('zonalar').delete().eq('id', zonaId)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Zona silindi: ${zona.ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Zona silindi.', 'basari')
}

// ── KML YÜKLEME ──
async function kmlDosyayiIsle(dosya, tur) {
  if (!dosya) return

  if (/\.kmz$/i.test(dosya.name)) {
    return mesaj('KMZ desteklenmiyor. Google Earth\'te "KML olarak kaydet" seçin.', 'hata')
  }

  let metin
  try {
    metin = await dosya.text()
  } catch (e) {
    return mesaj('Dosya okunamadı: ' + e.message, 'hata')
  }

  const sonuc = kmlAyristir(metin)
  if (sonuc.hata) {
    durum.kmlAdaylari = null
    ciz()
    return mesaj(sonuc.hata, 'hata')
  }

  durum.kmlAdaylari = { dosya: dosya.name, ...sonuc }
  if (tur === 'vana') vanaAdaylariniHazirla()
  ciz()

  const parca = tur === 'parsel'
    ? `${sonuc.parseller.length} poligon`
    : tur === 'vana'
      ? `${durum.kmlAdaylari.vanaSatirlari.length} vana satırı`
      : `${sonuc.cizgiler.length} çizgi, ${sonuc.noktalar.length} nokta`
  mesaj(`✓ ${dosya.name} okundu — ${parca}. İşaretleyip içe aktarın.`, 'basari')
}

/*
 * KML noktalarını vana satırlarına çevirir.
 * Bir işaretçi açıklamasında birden fazla yön varsa ("31 alt / 25 üst")
 * her biri ayrı satır olur — veritabanı düzeni de böyle.
 */
function vanaAdaylariniHazirla() {
  const satirlar = []
  let hataliSayisi = 0

  for (const nokta of durum.kmlAdaylari.noktalar) {
    const no = isaretciNoAyristir(nokta.ad)
    const coz = vanaAciklamaAyristir(nokta.aciklama)

    // "9 normal / 7 artırma / 4 hortum" → tek vana + yan sıra kuralı
    if (coz.oneri === 'yan_sira') {
      const toplam = coz.satirlar.reduce((t, s) => t + (s.fiskiye || 0), 0)
      satirlar.push({
        isaretci_no: no, lat: nokta.lat, lng: nokta.lng, yon: null,
        fiskiye: toplam, parsel: '', ekim_yonu_derece: null,
        notlar: coz.notlar, ham: nokta.aciklama, hata: coz.hataliSayisi > 0,
        oneri: 'yan_sira',
        kural: {
          tip: 'yan_sira',
          ana: coz.satirlar[0]?.fiskiye || 0,
          // Komşu bilinmiyor: bir önceki işaretçi varsayılır, editörden düzeltilir
          yon_referans: { komsu_isaretci: no != null ? no - 1 : null },
          siralar: coz.satirlar.slice(1).map((s, i) => ({
            kaydirma_m: (i + 1) * 12, adet: s.fiskiye || 0
          }))
        }
      })
      if (coz.hataliSayisi > 0) hataliSayisi++
      continue
    }

    for (const s of coz.satirlar) {
      satirlar.push({
        isaretci_no: no, lat: nokta.lat, lng: nokta.lng,
        yon: s.yon, fiskiye: s.fiskiye, parsel: '', ekim_yonu_derece: null,
        notlar: coz.notlar, ham: s.ham || nokta.aciklama || nokta.ad,
        hata: s.hata || no == null, oneri: null, kural: null
      })
      if (s.hata || no == null) hataliSayisi++
    }
  }

  durum.kmlAdaylari.vanaSatirlari = satirlar
  durum.kmlAdaylari.hataliSayisi = hataliSayisi
}

// Vananın parsel metnini parsel_id + vana_parselleri ile eşler
// (harita.js kırpma alanını bu ilişkiden okur — iki gösterim ayrışmamalı)
async function vanaParselleriniEsle(vanaId, parselMetni) {
  const eslesen = parselMetni
    ? durum.parseller.filter(p => parselMetni.includes(p.ad))
    : []

  await supabase.from('vana_parselleri').delete().eq('vana_id', vanaId)
  if (eslesen.length > 0) {
    await supabase.from('vana_parselleri').insert(
      eslesen.map(p => ({ vana_id: vanaId, parsel_id: p.id }))
    )
  }
  return eslesen[0]?.id || null
}

window.kurulumKmlSec = (e, tur) => kmlDosyayiIsle(e.target.files?.[0], tur)

window.kurulumKmlBirak = (e, tur) => {
  e.preventDefault()
  e.currentTarget.classList.remove('uzerinde')
  kmlDosyayiIsle(e.dataTransfer?.files?.[0], tur)
}

window.kurulumKmlTemizle = () => {
  durum.kmlAdaylari = null
  ciz()
}

window.kurulumKmlIceAktar = async (btn, tur) => {
  const a = durum.kmlAdaylari
  if (!a) return

  btn.disabled = true
  mesaj('İçe aktarılıyor...')

  let eklenen = 0
  const hatalar = []

  if (tur === 'parsel') {
    let sira = durum.parseller.length
    for (let i = 0; i < a.parseller.length; i++) {
      if (!isaretli(`kp-sec-${i}`)) continue
      const ad = deger(`kp-ad-${i}`) || a.parseller[i].ad
      const { error } = await supabase.from('parseller').insert({
        bolge_id: durum.bolge.id,
        zona_id: deger(`kp-zona-${i}`) || null,
        ad,
        alan_m2: a.parseller[i].alan_m2,
        koordinatlar: a.parseller[i].koordinatlar,
        renk: '#3fae4a',
        sira_no: ++sira
      })
      if (error) hatalar.push(`${ad}: ${error.message}`)
      else eklenen++
    }
  } else if (tur === 'vana') {
    for (let i = 0; i < (a.vanaSatirlari || []).length; i++) {
      if (!isaretli(`kv-sec-${i}`)) continue
      const s = a.vanaSatirlari[i]
      const no = sayi(`kv-no-${i}`)
      const fiskiye = sayi(`kv-fiskiye-${i}`)
      if (no == null) { hatalar.push('İşaretçi no boş bırakılamaz'); continue }

      const parselMetni = deger(`kv-parsel-${i}`) || null
      // Yan sıra önerisi kullanıcı onayına bağlı (spec adım 5)
      const kural = (s.oneri === 'yan_sira' && isaretli(`kv-yansira-${i}`)) ? s.kural : null

      const { data, error } = await supabase.from('vanalar').insert({
        bolge_id: durum.bolge.id,
        isaretci_no: no,
        lat: s.lat,
        lng: s.lng,
        fiskiye_sayisi: fiskiye ?? 0,
        yon: deger(`kv-yon-${i}`) || null,
        parsel: parselMetni,
        ekim_yonu_derece: sayi(`kv-ekim-${i}`),
        hat_id: deger(`kv-hat-${i}`) || null,
        notlar: s.notlar || null,
        cizim_kurali: kural
      }).select('id').single()

      if (error) { hatalar.push(`İşaretçi ${no}: ${error.message}`); continue }

      // Kırpma alanı ilişkisini kur (parsel metni ile aynı sonucu verir)
      if (parselMetni) {
        const birincil = await vanaParselleriniEsle(data.id, parselMetni)
        if (birincil) await supabase.from('vanalar').update({ parsel_id: birincil }).eq('id', data.id)
      }
      eklenen++
    }
  } else {
    let siraB = durum.borular.length
    for (let i = 0; i < a.cizgiler.length; i++) {
      if (!isaretli(`kc-sec-${i}`)) continue
      const ad = deger(`kc-ad-${i}`) || a.cizgiler[i].ad
      const { error } = await supabase.from('boru_hatlari').insert({
        bolge_id: durum.bolge.id,
        ad,
        tip: deger(`kc-tip-${i}`) || 'ana',
        koordinatlar: a.cizgiler[i].koordinatlar,
        renk: deger(`kc-renk-${i}`) || '#2196f3',
        kesikli: isaretli(`kc-kesikli-${i}`),
        sira_no: ++siraB
      })
      if (error) hatalar.push(`${ad}: ${error.message}`)
      else eklenen++
    }

    for (let i = 0; i < a.noktalar.length; i++) {
      if (!isaretli(`kn-sec-${i}`)) continue
      const ad = deger(`kn-ad-${i}`) || a.noktalar[i].ad
      const { error } = await supabase.from('saha_noktalari').insert({
        bolge_id: durum.bolge.id,
        tip: deger(`kn-tip-${i}`) || 'diger',
        ad,
        lat: a.noktalar[i].lat,
        lng: a.noktalar[i].lng,
        notlar: a.noktalar[i].aciklama || null
      })
      if (error) hatalar.push(`${ad}: ${error.message}`)
      else eklenen++
    }
  }

  btn.disabled = false

  if (eklenen > 0) {
    await logKaydet('kurulum',
      `KML içe aktarıldı: ${a.dosya} — ${eklenen} kayıt (${durum.bolge.ad})`, durum.bolge.id)
  }

  durum.kmlAdaylari = null
  await bolgeAyrintilariYukle()
  ciz()

  if (hatalar.length > 0) {
    mesaj(`${eklenen} kayıt eklendi, ${hatalar.length} tanesi eklenemedi: ${hatalar[0]}`, 'hata')
  } else if (eklenen === 0) {
    mesaj('Hiçbir satır işaretlenmemişti.', 'hata')
  } else {
    mesaj(`✓ ${eklenen} kayıt içe aktarıldı.`, 'basari')
  }
}

// ── HARİTADA ÇİZİM ──
window.kurulumCizimBaslat = (tip) => {
  if (!kurulumHaritasi) return
  cizim = { tip, noktalar: [] }
  cizimBariAc(tip)
  cizimGuncelle()
}

window.kurulumCizimGeriAl = () => {
  if (!cizim) return
  cizim.noktalar.pop()
  cizimGuncelle()
}

window.kurulumCizimIptal = () => {
  cizim = null
  cizimKatmani?.clearLayers()
  const bar = document.getElementById('k-cizim-bar')
  if (bar) { bar.style.display = 'none'; bar.innerHTML = '' }
}

window.kurulumCizimKaydet = async (btn) => {
  if (!cizim) return
  const n = cizim.noktalar

  // Haritadan tekil vana ekleme (adım 5)
  if (cizim.tip === 'vana') {
    if (n.length < 1) return mesaj('Haritadan vana konumunu tıklayın.', 'hata')
    const no = sayi('k-vana-no')
    if (no == null) return mesaj('İşaretçi no zorunlu.', 'hata')

    btn.disabled = true
    const parselMetni = deger('k-vana-parsel') || null
    const { data, error } = await supabase.from('vanalar').insert({
      bolge_id: durum.bolge.id,
      isaretci_no: no,
      lat: n[0][0],
      lng: n[0][1],
      fiskiye_sayisi: sayi('k-vana-fiskiye', 0),
      yon: deger('k-vana-yon') || null,
      parsel: parselMetni,
      ekim_yonu_derece: sayi('k-vana-ekim')
    }).select('id').single()
    btn.disabled = false

    if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')

    if (parselMetni) {
      const birincil = await vanaParselleriniEsle(data.id, parselMetni)
      if (birincil) await supabase.from('vanalar').update({ parsel_id: birincil }).eq('id', data.id)
    }

    await logKaydet('kurulum', `Haritadan vana eklendi: ${no} (${durum.bolge.ad})`, durum.bolge.id)
    cizim = null
    await bolgeAyrintilariYukle()
    ciz()
    return mesaj(`✓ Vana ${no} eklendi.`, 'basari')
  }

  const ad = deger('k-cizim-ad')

  if (!ad) return mesaj('Ad zorunlu.', 'hata')
  if (cizim.tip === 'parsel' && n.length < 3) return mesaj('Parsel için en az 3 köşe gerekli.', 'hata')
  if (cizim.tip === 'boru' && n.length < 2) return mesaj('Boru için en az 2 nokta gerekli.', 'hata')
  if (cizim.tip === 'nokta' && n.length < 1) return mesaj('Haritadan konum seçin.', 'hata')

  btn.disabled = true
  let hata = null

  if (cizim.tip === 'parsel') {
    // Poligonu kapat (KML/mevcut veri düzeni: ilk nokta sonda tekrar eder)
    const halka = n.map(([lat, lng]) => [lng, lat])
    halka.push([...halka[0]])
    const sonuc = await supabase.from('parseller').insert({
      bolge_id: durum.bolge.id,
      ad,
      alan_m2: poligonAlanM2(halka),
      koordinatlar: halka,
      renk: deger('k-cizim-renk') || '#3fae4a',
      sira_no: durum.parseller.length + 1
    })
    hata = sonuc.error
  } else if (cizim.tip === 'boru') {
    const sonuc = await supabase.from('boru_hatlari').insert({
      bolge_id: durum.bolge.id,
      ad,
      tip: 'ana',
      koordinatlar: n,
      renk: deger('k-cizim-renk') || '#2196f3',
      kesikli: isaretli('k-cizim-kesikli'),
      sira_no: durum.borular.length + 1
    })
    hata = sonuc.error
  } else {
    const sonuc = await supabase.from('saha_noktalari').insert({
      bolge_id: durum.bolge.id,
      tip: deger('k-cizim-tip') || 'diger',
      ad,
      lat: n[0][0],
      lng: n[0][1]
    })
    hata = sonuc.error
  }

  btn.disabled = false
  if (hata) return mesaj('Kaydedilemedi: ' + hata.message, 'hata')

  await logKaydet('kurulum', `Haritadan ${cizim.tip} eklendi: ${ad} (${durum.bolge.ad})`, durum.bolge.id)
  cizim = null
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Kaydedildi.', 'basari')
}

// ── PARSEL / BORU / NOKTA DÜZENLEME ──
window.kurulumParselKaydet = async (id, btn) => {
  const ad = deger(`p-ad-${id}`)
  if (!ad) return mesaj('Parsel adı zorunlu.', 'hata')

  btn.disabled = true
  const { error } = await supabase.from('parseller').update({
    ad,
    zona_id: deger(`p-zona-${id}`) || null,
    sira_no: sayi(`p-sira-${id}`, 1),
    renk: deger(`p-renk-${id}`) || '#3fae4a'
  }).eq('id', id)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')
  await logKaydet('kurulum', `Parsel güncellendi: ${ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Parsel kaydedildi.', 'basari')
}

window.kurulumParselSil = async (id) => {
  const p = durum.parseller.find(x => x.id === id)
  if (!p) return

  // Vanaların kırpma alanı bu parsele bağlıysa silme engellenir
  if (p.vana_sayisi > 0) {
    alert(`"${p.ad}" parseline ${p.vana_sayisi} vana bağlı.\nÖnce vanaların parsel bağlantısını değiştirin.`)
    return
  }
  if (!confirm(`"${p.ad}" parseli silinsin mi?`)) return

  const { error } = await supabase.from('parseller').delete().eq('id', id)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Parsel silindi: ${p.ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Parsel silindi.', 'basari')
}

window.kurulumBoruKaydet = async (id, btn) => {
  const ad = deger(`b-ad-${id}`)
  if (!ad) return mesaj('Boru adı zorunlu.', 'hata')

  btn.disabled = true
  const { error } = await supabase.from('boru_hatlari').update({
    ad,
    tip: deger(`b-tip-${id}`) || 'ana',
    sira_no: sayi(`b-sira-${id}`, 1),
    renk: deger(`b-renk-${id}`) || '#2196f3',
    kesikli: isaretli(`b-kesikli-${id}`)
  }).eq('id', id)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')
  await logKaydet('kurulum', `Boru hattı güncellendi: ${ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Boru hattı kaydedildi.', 'basari')
}

window.kurulumBoruSil = async (id) => {
  const h = durum.borular.find(x => x.id === id)
  if (!h || !confirm(`"${h.ad}" boru hattı silinsin mi?`)) return

  const { error } = await supabase.from('boru_hatlari').delete().eq('id', id)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Boru hattı silindi: ${h.ad} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Boru hattı silindi.', 'basari')
}

window.kurulumNoktaKaydet = async (id, btn) => {
  const lat = sayi(`n-lat-${id}`)
  const lng = sayi(`n-lng-${id}`)
  if (lat == null || lng == null) return mesaj('Enlem ve boylam zorunlu.', 'hata')

  btn.disabled = true
  const ad = deger(`n-ad-${id}`)
  const { error } = await supabase.from('saha_noktalari').update({
    tip: deger(`n-tip-${id}`) || 'diger',
    ad: ad || null,
    lat,
    lng
  }).eq('id', id)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')
  await logKaydet('kurulum', `Saha noktası güncellendi: ${ad || id} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Nokta kaydedildi.', 'basari')
}

window.kurulumNoktaSil = async (id) => {
  const n = durum.noktalar.find(x => x.id === id)
  if (!n || !confirm(`"${n.ad || NOKTA_TIPLERI[n.tip]}" noktası silinsin mi?`)) return

  const { error } = await supabase.from('saha_noktalari').delete().eq('id', id)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Saha noktası silindi: ${n.ad || n.tip} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Nokta silindi.', 'basari')
}

// ── VANA LİSTESİ (ADIM 5) ──
window.kurulumVanaFiltre = (metin) => {
  durum.vanaFiltre = metin || ''
  ciz()
}

window.kurulumEksikFiltre = (acik) => {
  durum.sadeceEksik = !!acik
  ciz()
}

window.kurulumVanaSec = (id, secili) => {
  const onceki = durum.vanaSecili.size
  if (secili) durum.vanaSecili.add(id)
  else durum.vanaSecili.delete(id)
  const simdi = durum.vanaSecili.size

  // Toplu düzenleme çubuğu ilk seçimde açılır, son seçim kalkınca kapanır.
  // Aradaki tıklamalarda tam çizim yerine yalnızca sayaç güncellenir
  // (136 satırlık tabloyu her kutucukta yeniden çizmek gereksiz).
  if (onceki === 0 || simdi === 0) { ciz(); return }
  const sayac = document.getElementById('k-secili-sayi')
  if (sayac) sayac.textContent = String(simdi)
}

window.kurulumSecimTemizle = () => {
  durum.vanaSecili.clear()
  ciz()
}

window.kurulumTopluUygula = async (btn) => {
  const idler = [...durum.vanaSecili]
  if (idler.length === 0) return

  const ekim = sayi('k-toplu-ekim')
  const parselMetni = deger('k-toplu-parsel')
  const hatId = deger('k-toplu-hat')
  const boru = deger('k-toplu-boru')

  const guncelleme = {}
  if (ekim != null) guncelleme.ekim_yonu_derece = ekim
  if (parselMetni) guncelleme.parsel = parselMetni
  if (hatId) guncelleme.hat_id = hatId
  if (boru) guncelleme.boru_hatti = boru

  if (Object.keys(guncelleme).length === 0) {
    return mesaj('Uygulanacak bir alan doldurun.', 'hata')
  }

  btn.disabled = true
  mesaj(`${idler.length} vana güncelleniyor...`)

  const { error } = await supabase.from('vanalar').update(guncelleme).in('id', idler)
  if (error) { btn.disabled = false; return mesaj('Güncellenemedi: ' + error.message, 'hata') }

  // Parsel değiştiyse kırpma ilişkisi de yenilenmeli
  if (parselMetni) {
    for (const id of idler) {
      const birincil = await vanaParselleriniEsle(id, parselMetni)
      await supabase.from('vanalar').update({ parsel_id: birincil }).eq('id', id)
    }
  }
  btn.disabled = false

  await logKaydet('kurulum',
    `${idler.length} vana toplu güncellendi: ${Object.keys(guncelleme).join(', ')} (${durum.bolge.ad})`,
    durum.bolge.id)

  durum.vanaSecili.clear()
  await bolgeAyrintilariYukle()
  ciz()
  mesaj(`✓ ${idler.length} vana güncellendi.`, 'basari')
}

window.kurulumVanaKaydet = async (id, btn) => {
  const no = sayi(`v-no-${id}`)
  if (no == null) return mesaj('İşaretçi no zorunlu.', 'hata')

  btn.disabled = true
  const parselMetni = deger(`v-parsel-${id}`) || null
  const { error } = await supabase.from('vanalar').update({
    isaretci_no: no,
    yon: deger(`v-yon-${id}`) || null,
    fiskiye_sayisi: sayi(`v-fiskiye-${id}`, 0),
    parsel: parselMetni,
    ekim_yonu_derece: sayi(`v-ekim-${id}`),
    hat_id: deger(`v-hat-${id}`) || null
  }).eq('id', id)

  if (error) { btn.disabled = false; return mesaj('Kaydedilemedi: ' + error.message, 'hata') }

  const birincil = await vanaParselleriniEsle(id, parselMetni)
  await supabase.from('vanalar').update({ parsel_id: birincil }).eq('id', id)
  btn.disabled = false

  await logKaydet('kurulum', `Vana ${no} güncellendi (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj(`✓ Vana ${no} kaydedildi.`, 'basari')
}

window.kurulumVanaSil = async (id) => {
  const v = durum.vanalar.find(x => x.id === id)
  if (!v) return

  // Sulanan hattın vanası silinemez (kurulum kilidi — spec 5.3)
  if (aktifHatKilitli(v.hat_id)) return kilitUyarisi('vana silme')

  if (!confirm(`Vana ${vanaEtiketi(v)} silinsin mi?\nBu kayıt bir hatta atanmışsa hattın fıskiye toplamı değişir.`)) return

  const { error } = await supabase.from('vanalar').delete().eq('id', id)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Vana ${vanaEtiketi(v)} silindi (${durum.bolge.ad})`, durum.bolge.id)
  durum.vanaSecili.delete(id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Vana silindi.', 'basari')
}

// ── ÖZEL KURAL EDİTÖRÜ ──
window.kurulumKuralAc = (id) => {
  durum.kuralVanaId = id
  durum.kuralTip = null   // vananın kayıtlı tipiyle aç
  ciz()
}

window.kurulumKuralKapat = () => {
  durum.kuralVanaId = null
  durum.kuralTip = null
  ciz()
}

window.kurulumKuralTipDegis = (tip) => {
  // Tip değişince alanlar yeniden çizilir; seçim durumda tutulmazsa
  // yeniden çizim kayıtlı tipe geri döner
  durum.kuralTip = tip
  ciz()
}

window.kurulumKuralOnizle = () => kuralOnizle()

window.kurulumKuralKaydet = async (btn) => {
  const v = durum.vanalar.find(x => x.id === durum.kuralVanaId)
  if (!v) return

  const kural = kuraliOku()
  if (kural?.tip === 'yan_sira' && !kural.yon_referans?.komsu_isaretci) {
    return mesaj('Yan sıra kuralı için komşu işaretçi no gerekli (yön ondan hesaplanır).', 'hata')
  }

  btn.disabled = true
  const { error } = await supabase.from('vanalar')
    .update({ cizim_kurali: kural })
    .eq('id', v.id)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')

  await logKaydet('kurulum',
    `Vana ${vanaEtiketi(v)} çizim kuralı: ${kural ? kural.tip : 'kaldırıldı'} (${durum.bolge.ad})`,
    durum.bolge.id)
  durum.kuralTip = null   // artık kayıtlı hâl gösterilsin
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Kural kaydedildi.', 'basari')
}

window.kurulumKuralKaldir = async () => {
  const v = durum.vanalar.find(x => x.id === durum.kuralVanaId)
  if (!v || !confirm(`Vana ${vanaEtiketi(v)} özel kuralı kaldırılsın mı?\nFıskiyeler normal düz sıra olarak çizilir.`)) return

  const { error } = await supabase.from('vanalar').update({ cizim_kurali: null }).eq('id', v.id)
  if (error) return mesaj('Kaldırılamadı: ' + error.message, 'hata')

  await logKaydet('kurulum', `Vana ${vanaEtiketi(v)} çizim kuralı kaldırıldı (${durum.bolge.ad})`, durum.bolge.id)
  durum.kuralTip = null
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Kural kaldırıldı.', 'basari')
}

// ── EKİM YÖNÜ YARDIMCISI ──
window.kurulumYonYardimcisi = (hedefId) => {
  if (!kurulumHaritasi) return
  cizim = { tip: 'yon', noktalar: [], hedef: hedefId }
  cizimBariAc('yon')
  cizimGuncelle()
  // Harita ekranın üstünde; kullanıcı tıklamaya başlayabilsin
  document.getElementById('kurulum-harita')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  mesaj('Haritada ekim doğrultusunda iki nokta tıklayın.')
}

window.kurulumYonUygula = () => {
  const derece = cizimYonu()
  if (derece == null) return mesaj('Önce haritada iki nokta seçin.', 'hata')

  const hedef = document.getElementById(cizim.hedef)
  if (hedef) hedef.value = String(derece)

  window.kurulumCizimIptal()
  mesaj(`✓ Ekim yönü ${derece}° yazıldı — satırı kaydetmeyi unutmayın.`, 'basari')
}

// ── FISKIYE ÖNİZLEME ──
window.kurulumFiskiyeleriGoster = (btn) => {
  if (!onizlemeKatmani) return

  // Kural editörü açıkken onun önizlemesi öncelikli
  if (durum.kuralVanaId) return mesaj('Kural editörü açıkken tüm fıskiyeler gösterilmez.', 'hata')

  if (btn.dataset.acik === '1') {
    onizlemeKatmani.clearLayers()
    btn.dataset.acik = '0'
    btn.textContent = '💧 Fıskiyeleri göster'
    return
  }

  const sv = sahaVerisi()
  let toplam = 0
  durum.vanalar.forEach(v => {
    fiskiyeKonumlari(v, durum.vanalar, sv).forEach(n => {
      toplam++
      L.circleMarker([n.lat, n.lng], {
        radius: 2.5, stroke: false, fillColor: '#00e5ff', fillOpacity: 0.8
      }).addTo(onizlemeKatmani)
    })
  })

  btn.dataset.acik = '1'
  btn.textContent = '💧 Fıskiyeleri gizle'
  mesaj(`${toplam} fıskiye çizildi (kayıtlı toplam: ${durum.vanalar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)}).`)
}

// ── ADIM 6: HATLAR ──
window.kurulumHatYeni = (zonaId) => {
  durum.hatDuzenleId = 'yeni'
  durum.hatYeniZona = zonaId
  durum.hatVanaSecili = new Set()
  durum.hatVanaFiltre = ''
  ciz()
}

window.kurulumHatDuzenle = (id) => {
  durum.hatDuzenleId = id
  durum.hatYeniZona = null
  durum.hatVanaSecili = new Set(durum.vanalar.filter(v => v.hat_id === id).map(v => v.id))
  durum.hatVanaFiltre = ''
  ciz()
}

window.kurulumHatEditoruKapat = () => {
  durum.hatDuzenleId = null
  durum.hatYeniZona = null
  durum.hatVanaSecili = new Set()
  ciz()
}

window.kurulumHatVanaFiltre = (metin) => {
  durum.hatVanaFiltre = metin || ''
  ciz()
}

window.kurulumHatVanaSec = (id, secili) => {
  if (secili) durum.hatVanaSecili.add(id)
  else durum.hatVanaSecili.delete(id)
  ciz()
}

window.kurulumHatEditoruKaydet = async (btn) => {
  const hatNo = sayi('he-no')
  if (hatNo == null) return mesaj('Hat no zorunlu.', 'hata')

  const zonaId = deger('he-zona')
  if (!zonaId) return mesaj('Zona seçilmeli.', 'hata')

  // Sulanan hattın vana bileşimi değiştirilemez (kurulum kilidi — spec 5.3)
  if (aktifHatKilitli(durum.hatDuzenleId)) return kilitUyarisi('vana ataması değişikliği')

  btn.disabled = true

  const seciliIdler = [...durum.hatVanaSecili]
  const seciliVanalar = durum.vanalar.filter(v => seciliIdler.includes(v.id))
  const fiskiyeToplam = seciliVanalar.reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  const parselMetni = deger('he-parsel')
    || [...new Set(seciliVanalar.map(v => v.parsel).filter(Boolean))].join('-')
    || null

  let hatId = durum.hatDuzenleId
  if (hatId === 'yeni') {
    const { data, error } = await supabase.from('hatlar').insert({
      zona_id: zonaId,
      hat_no: hatNo,
      sira_no: sayi('he-sira', 1),
      parsel_bilgisi: parselMetni,
      fiskiye_sayisi: fiskiyeToplam,
      varsayilan_sure_dk: sayi('he-sure', durum.bolge.varsayilan_sure_dk || 480)
    }).select('id').single()
    if (error) { btn.disabled = false; return mesaj('Kaydedilemedi: ' + error.message, 'hata') }
    hatId = data.id
  } else {
    const { error } = await supabase.from('hatlar').update({
      zona_id: zonaId,
      hat_no: hatNo,
      sira_no: sayi('he-sira', 1),
      parsel_bilgisi: parselMetni,
      varsayilan_sure_dk: sayi('he-sure', durum.bolge.varsayilan_sure_dk || 480)
    }).eq('id', hatId)
    if (error) { btn.disabled = false; return mesaj('Kaydedilemedi: ' + error.message, 'hata') }
  }

  // Vana atamaları: bu hatta olup artık seçili olmayanları bırak, seçilileri ata
  // (bir vana başka hattaysa da buraya taşınır — hat_id tek yönlü sahiplik)
  const oncekiHatlilar = durum.vanalar.filter(v => v.hat_id === hatId).map(v => v.id)
  const birakilacak = oncekiHatlilar.filter(id => !durum.hatVanaSecili.has(id))
  const atanacak = seciliIdler.filter(id => !oncekiHatlilar.includes(id))

  if (birakilacak.length > 0) await supabase.from('vanalar').update({ hat_id: null }).in('id', birakilacak)
  if (atanacak.length > 0) await supabase.from('vanalar').update({ hat_id: hatId }).in('id', atanacak)

  // fiskiye_sayisi daima vana toplamından yazılır — elle girilmez (spec adım 6)
  await supabase.from('hatlar').update({ fiskiye_sayisi: fiskiyeToplam }).eq('id', hatId)

  btn.disabled = false
  await logKaydet('kurulum',
    `Hat-${hatNo} kaydedildi: ${seciliIdler.length} vana, ${fiskiyeToplam} fıskiye (${durum.bolge.ad})`,
    durum.bolge.id)

  durum.hatDuzenleId = null
  durum.hatYeniZona = null
  durum.hatVanaSecili = new Set()
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Hat kaydedildi.', 'basari')
}

window.kurulumHatKaydet = async (id, btn) => {
  const hatNo = sayi(`h-no-${id}`)
  if (hatNo == null) return mesaj('Hat no zorunlu.', 'hata')

  btn.disabled = true
  const { error } = await supabase.from('hatlar').update({
    hat_no: hatNo,
    sira_no: sayi(`h-sira-${id}`, 1),
    parsel_bilgisi: deger(`h-parsel-${id}`) || null,
    varsayilan_sure_dk: sayi(`h-sure-${id}`, 480)
  }).eq('id', id)
  btn.disabled = false

  if (error) return mesaj('Kaydedilemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Hat-${hatNo} güncellendi (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Hat kaydedildi.', 'basari')
}

window.kurulumHatSil = async (id) => {
  const h = durum.hatlar.find(x => x.id === id)
  if (!h) return

  // Şu anda sulanan hat silinemez (kurulum kilidi — spec 5.3)
  if (aktifHatKilitli(id)) return kilitUyarisi('silme işlemi')

  // Gerçek sulama kaydı olan hat silinemez (geçmiş veri korunur — spec 5.3)
  if (h.kayit_sayisi > 0) {
    alert(`Hat-${h.hat_no} için ${h.kayit_sayisi} sulama kaydı var.\nGeçmiş veri korunduğu için bu hat silinemez.`)
    return
  }
  if (!confirm(`Hat-${h.hat_no} silinsin mi?\nBağlı ${h.vana_sayisi} vananın hat ataması kaldırılır.`)) return

  await supabase.from('vanalar').update({ hat_id: null }).eq('hat_id', id)
  const { error } = await supabase.from('hatlar').delete().eq('id', id)
  if (error) return mesaj('Silinemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Hat-${h.hat_no} silindi (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Hat silindi.', 'basari')
}

// Yukarı/aşağı butonları: aynı zonadaki komşu hatla sıra no'yu değiştirir
window.kurulumHatSiraDegis = async (id, yon) => {
  const h = durum.hatlar.find(x => x.id === id)
  if (!h) return

  const grup = durum.hatlar
    .filter(x => x.zona_id === h.zona_id)
    .sort((a, b) => (a.sira_no || 0) - (b.sira_no || 0))
  const idx = grup.findIndex(x => x.id === id)
  const komsu = grup[idx + yon]
  if (!komsu) return

  const s1 = h.sira_no, s2 = komsu.sira_no
  await supabase.from('hatlar').update({ sira_no: s2 }).eq('id', h.id)
  await supabase.from('hatlar').update({ sira_no: s1 }).eq('id', komsu.id)

  await logKaydet('kurulum',
    `Hat-${h.hat_no} ve Hat-${komsu.hat_no} sırası değiştirildi (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
}

// Hatları kuyuya yakınlığa göre sıralar (her hattın konumu: bağlı
// vanalarının ortalama konumu). Kullanıcı önerilen sırayı onaylar veya
// vazgeçip sira_no alanlarından elle düzeltmeye devam eder.
window.kurulumKuyuyaSirala = async (zonaId, btn) => {
  const kuyu = durum.noktalar.find(n => n.tip === 'kuyu')
  if (!kuyu) return mesaj('Kuyu konumu tanımlı değil (4. adımdan ekleyin).', 'hata')

  const zonaHatlari = durum.hatlar.filter(h => h.zona_id === zonaId)
  if (zonaHatlari.length < 2) return mesaj('Sıralamak için en az 2 hat gerekli.', 'hata')

  const mesafeli = zonaHatlari.map(h => {
    const baglilar = durum.vanalar.filter(v => v.hat_id === h.id)
    if (baglilar.length === 0) return { h, mesafe: Infinity }
    const ortLat = baglilar.reduce((t, v) => t + v.lat, 0) / baglilar.length
    const ortLng = baglilar.reduce((t, v) => t + v.lng, 0) / baglilar.length
    return { h, mesafe: mesafeM(kuyu.lat, kuyu.lng, ortLat, ortLng) }
  }).sort((a, b) => a.mesafe - b.mesafe)

  const onizleme = mesafeli.map(x => `Hat-${x.h.hat_no}`).join(' → ')
  if (!confirm(`Önerilen sıra (kuyuya yakından uzağa):\n${onizleme}\n\nUygulansın mı?`)) return

  btn.disabled = true
  for (let i = 0; i < mesafeli.length; i++) {
    await supabase.from('hatlar').update({ sira_no: i + 1 }).eq('id', mesafeli[i].h.id)
  }
  btn.disabled = false

  await logKaydet('kurulum',
    `Hat sırası kuyuya yakınlığa göre düzenlendi: ${onizleme} (${durum.bolge.ad})`, durum.bolge.id)
  await bolgeAyrintilariYukle()
  ciz()
  mesaj('✓ Sıra güncellendi — gerekirse elle düzeltebilirsiniz.', 'basari')
}

// ── KML DIŞA AKTARMA (spec 5.2) ──
window.kurulumKmlIndir = (btn) => {
  if (!durum.bolge?.id) return

  const metin = kmlUret(durum.bolge, {
    parseller: durum.parseller,
    borular: durum.borular,
    noktalar: durum.noktalar,
    vanalar: durum.vanalar
  })

  const dosyaAdi = `${durum.bolge.kod || 'saha'}_${new Date().toISOString().slice(0, 10)}.kml`
  const blob = new Blob([metin], { type: 'application/vnd.google-earth.kml+xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = dosyaAdi
  a.click()
  URL.revokeObjectURL(a.href)

  logKaydet('kurulum', `KML dışa aktarıldı: ${dosyaAdi}`, durum.bolge.id)
  mesaj(`✓ ${dosyaAdi} indirildi.`, 'basari')
}

/*
 * BÖLGE KOPYALAMA (spec 5.1)
 * Yapıyı kopyalar: zonalar, parseller, boru hatları, saha noktaları,
 * hatlar, vanalar (çizim kuralları ve parsel ilişkileriyle birlikte).
 * Kopyalanmaz: sulama kayıtları, turlar, gübre uygulamaları, olay logları.
 *
 * Koordinatlar olduğu gibi kopyalanır — yeni tarla başka yerdeyse
 * parselleri/vanaları haritadan taşımak gerekir. Şablonun değeri
 * yapıda (hat düzeni, kurallar, ölçüler), konumda değil.
 */
window.kurulumBolgeKopyala = async (btn) => {
  const kaynak = durum.bolge
  if (!kaynak?.id) return

  const ad = prompt('Yeni bölgenin adı:', `${kaynak.ad} (kopya)`)
  if (!ad?.trim()) return

  const kod = slugYap(prompt('Yeni bölgenin kodu (slug):', slugYap(ad)) || '')
  if (!kod) return mesaj('Kod zorunlu.', 'hata')

  if (!confirm(
    `"${ad}" oluşturulacak ve şu yapı kopyalanacak:\n` +
    `• ${durum.zonalar.length} zona\n• ${durum.parseller.length} parsel\n` +
    `• ${durum.borular.length} boru hattı\n• ${durum.noktalar.length} saha noktası\n` +
    `• ${durum.hatlar.length} hat\n• ${durum.vanalar.length} vana kaydı\n\n` +
    `Sulama kayıtları, turlar ve gübre girişleri KOPYALANMAZ.\n` +
    `Koordinatlar aynı kalır; yeni sahaya göre taşımanız gerekir.`
  )) return

  btn.disabled = true
  mesaj('Bölge kopyalanıyor...')

  try {
    // 1) Bölge (sistem_durumu satırı trigger ile otomatik oluşur)
    const siraNo = durum.bolgeler.length > 0
      ? Math.max(...durum.bolgeler.map(x => x.sira_no || 0)) + 1
      : 1
    const { data: yeniBolge, error: bolgeHata } = await supabase.from('bolgeler').insert({
      kod, ad: ad.trim(),
      il: kaynak.il, ilce: kaynak.ilce,
      aciklama: `${kaynak.ad} şablonundan kopyalandı`,
      merkez_lat: kaynak.merkez_lat, merkez_lng: kaynak.merkez_lng,
      varsayilan_zoom: kaynak.varsayilan_zoom,
      fiskiye_araligi_m: kaynak.fiskiye_araligi_m,
      fiskiye_kapsama_m: kaynak.fiskiye_kapsama_m,
      fiskiye_alan_m2: kaynak.fiskiye_alan_m2,
      varsayilan_sure_dk: kaynak.varsayilan_sure_dk,
      kurulum_tamam: false,   // kopya her zaman "kurulum sürüyor" başlar
      sira_no: siraNo, aktif: true
    }).select().single()

    if (bolgeHata) throw new Error(
      /duplicate|unique/.test(bolgeHata.message) ? `"${kod}" kodu zaten kullanılıyor.` : bolgeHata.message)

    const yeniId = yeniBolge.id

    // 2) Zonalar — eski id'den yenisine eşleme tut (alt kayıtlar buna bağlanır)
    const zonaEsleme = {}
    for (const z of durum.zonalar) {
      const { data, error } = await supabase.from('zonalar').insert({
        bolge_id: yeniId, ad: z.ad, aciklama: z.aciklama, sira_no: z.sira_no
      }).select('id').single()
      if (error) throw new Error('Zona kopyalanamadı: ' + error.message)
      zonaEsleme[z.id] = data.id
    }

    // 3) Parseller
    const parselEsleme = {}
    for (const p of durum.parseller) {
      const { data, error } = await supabase.from('parseller').insert({
        bolge_id: yeniId, zona_id: zonaEsleme[p.zona_id] || null,
        ad: p.ad, alan_m2: p.alan_m2, koordinatlar: p.koordinatlar,
        renk: p.renk, sira_no: p.sira_no
      }).select('id').single()
      if (error) throw new Error('Parsel kopyalanamadı: ' + error.message)
      parselEsleme[p.id] = data.id
    }

    // 4) Boru hatları ve saha noktaları (bağımlılıkları yok)
    for (const h of durum.borular) {
      await supabase.from('boru_hatlari').insert({
        bolge_id: yeniId, ad: h.ad, tip: h.tip, koordinatlar: h.koordinatlar,
        renk: h.renk, kesikli: h.kesikli, sira_no: h.sira_no
      })
    }
    for (const n of durum.noktalar) {
      await supabase.from('saha_noktalari').insert({
        bolge_id: yeniId, tip: n.tip, ad: n.ad, lat: n.lat, lng: n.lng,
        ikon: n.ikon, notlar: n.notlar
      })
    }

    // 5) Hatlar (kayıtsız — fıskiye toplamı vanalardan geldiği için aynen taşınır)
    const hatEsleme = {}
    for (const h of durum.hatlar) {
      const { data, error } = await supabase.from('hatlar').insert({
        zona_id: zonaEsleme[h.zona_id], hat_no: h.hat_no, sira_no: h.sira_no,
        parsel_bilgisi: h.parsel_bilgisi, fiskiye_sayisi: h.fiskiye_sayisi,
        varsayilan_sure_dk: h.varsayilan_sure_dk
      }).select('id').single()
      if (error) throw new Error('Hat kopyalanamadı: ' + error.message)
      hatEsleme[h.id] = data.id
    }

    // 6) Vanalar + parsel ilişkileri
    for (const v of durum.vanalar) {
      const { data, error } = await supabase.from('vanalar').insert({
        bolge_id: yeniId,
        hat_id: hatEsleme[v.hat_id] || null,
        isaretci_no: v.isaretci_no, lat: v.lat, lng: v.lng,
        fiskiye_sayisi: v.fiskiye_sayisi, yon: v.yon, parsel: v.parsel,
        parsel_id: parselEsleme[v.parsel_id] || null,
        ekim_yonu_derece: v.ekim_yonu_derece, boru_hatti: v.boru_hatti,
        notlar: v.notlar, cizim_kurali: v.cizim_kurali
      }).select('id').single()

      if (error) {
        throw new Error(/duplicate|unique/.test(error.message)
          ? `Vana ${v.isaretci_no} kopyalanamadı — işaretçi numaraları bölgeye göre ` +
            `tekil değil. sql/supabase_duzeltme_vana_tekil_bolgeye_gore.sql dosyasını çalıştırın.`
          : 'Vana kopyalanamadı: ' + error.message)
      }

      const iliskiler = (v.vana_parselleri || [])
        .map(x => parselEsleme[x.parsel_id])
        .filter(Boolean)
        .map(pid => ({ vana_id: data.id, parsel_id: pid }))
      if (iliskiler.length > 0) await supabase.from('vana_parselleri').insert(iliskiler)
    }

    await logKaydet('kurulum',
      `Bölge kopyalandı: ${kaynak.ad} → ${ad.trim()} (${durum.vanalar.length} vana, ${durum.hatlar.length} hat)`,
      yeniId)

    btn.disabled = false
    await verileriYukle(yeniId)   // yeni bölgeye geç
    durum.adim = 1
    ciz()
    mesaj(`✓ "${ad.trim()}" oluşturuldu. Koordinatları yeni sahaya göre düzenleyin.`, 'basari')

  } catch (e) {
    btn.disabled = false
    mesaj('Kopyalama durdu: ' + e.message, 'hata')
  }
}

// ── KURULUM ÖZETİ ──
window.kurulumOzetGoster = () => {
  durum.ozetAcik = true
  ciz()
}

window.kurulumOzetKapat = () => {
  durum.ozetAcik = false
  ciz()
}

window.kurulumTamamla = async (btn) => {
  if (!confirm(`"${durum.bolge.ad}" kurulumu tamamlandı olarak işaretlensin mi?\nBölge, bölge seçicide görünür olacak.`)) return

  btn.disabled = true
  const { error } = await supabase.from('bolgeler').update({ kurulum_tamam: true }).eq('id', durum.bolge.id)
  btn.disabled = false

  if (error) return mesaj('İşaretlenemedi: ' + error.message, 'hata')

  await logKaydet('kurulum', `Kurulum tamamlandı: ${durum.bolge.ad}`, durum.bolge.id)
  durum.bolge.kurulum_tamam = true
  durum.bolgeler = durum.bolgeler.map(b => b.id === durum.bolge.id ? { ...b, kurulum_tamam: true } : b)
  ciz()
  mesaj('✓ Kurulum tamamlandı olarak işaretlendi.', 'basari')
}

window.kurulumCik = () => {
  if (kurulumHaritasi) {
    kurulumHaritasi.remove()
    kurulumHaritasi = null
  }
  durum.geriDon?.()
}
