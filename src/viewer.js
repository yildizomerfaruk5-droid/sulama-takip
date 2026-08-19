import { supabase } from './supabase.js'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, calisanHatVerisi , hatTamamlamaSayilari} from './hatlar.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { haritaOlustur, hatlariHaritayaCiz, vanalariHaritayaCiz } from './harita.js'
import { bolgeleriGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import {
  izleyicileriGetir, izleyiciKimligi, izleyiciKimligiKaydet, izleyiciKimligiSil
} from './izleyici.js'

// Her hattin toplam tamamlama sayisi — render sirasinda doldurulur
let hatKezSayilari = {}

let sistemDurumu = null
let sayacInterval = null
let viewerBolge = null

// URL'den bölge belirle: ?viewer&bolge=kayseri-ana (kod veya id)
async function viewerBolgeBelirle() {
  if (viewerBolge) return viewerBolge
  const params = new URLSearchParams(window.location.search)
  const istenen = params.get('bolge')
  const bolgeler = await bolgeleriGetir()
  viewerBolge = bolgeler.find(b => b.kod === istenen || b.id === istenen) || bolgeler[0] || null
  return viewerBolge
}

const IP_SERVISI = 'https://api.ipify.org?format=json'
const IP_ZAMAN_ASIMI_MS = 2500

/*
 * Cihazin genel IP adresini sorar.
 *
 * Bu bilgi ZORUNLU DEGILDIR: servise erisilemezse (çevrimdışı, engelli,
 * yavaş) sessizce null döner. Ziyaret kaydının kendisi her hâlükârda
 * atılmalı — IP alınamaması log kaybına yol açmamalı. Bu yüzden hem
 * zaman aşımı hem de try/catch var.
 *
 * Konum bilgisi ISTENMEZ: navigator.geolocation'a dokunulmaz, izin
 * penceresi çıkmaz.
 */
async function ipAdresiGetir() {
  try {
    if (!navigator.onLine) return null

    const iptal = new AbortController()
    const sayac = setTimeout(() => iptal.abort(), IP_ZAMAN_ASIMI_MS)
    try {
      const cevap = await fetch(IP_SERVISI, { signal: iptal.signal, cache: 'no-store' })
      if (!cevap.ok) return null
      const veri = await cevap.json()
      const ip = typeof veri?.ip === 'string' ? veri.ip.trim() : ''
      return ip ? ip.substring(0, 45) : null   // IPv6 en fazla 45 karakter
    } finally {
      clearTimeout(sayac)
    }
  } catch {
    return null   // servis yok / engelli / zaman aşımı — ziyaret kaydı yine atılır
  }
}

async function ziyaretKaydet(bolgeId) {
  try {
    if (sessionStorage.getItem('ziyaret_loglandi')) return
    sessionStorage.setItem('ziyaret_loglandi', '1')

    const ip = await ipAdresiGetir()

    // Kimlik henüz seçilmemişse null gider — eski (anonim) davranış
    await supabase.from('ziyaretci_loglari').insert({
      bolge_id: bolgeId || null,
      izleyici_id: izleyiciKimligi()?.id || null,
      cihaz: navigator.userAgent.substring(0, 250),
      ip
    })
  } catch (e) {
    console.error('Ziyaret kaydedilemedi:', e)
  }
}

/*
 * "Sen kimsin?" secicisi.
 *
 * Sayfa icerigini ENGELLEMEZ: harita ve listeler normal yuklenir,
 * secici ustte kucuk bir serit olarak durur. Kimse sikismasin diye
 * "Bilmiyorum / Diğer" secenegi vardir — o da kaydedilir ve bir daha
 * sorulmaz, yalnizca izleyici_id null kalir.
 */
function kimlikSeriti(izleyiciler) {
  const kimlik = izleyiciKimligi()

  if (kimlik) {
    return `
      <div id="izleyici-serit" style="
        display:flex; justify-content:flex-end; align-items:center; gap:8px;
        font-size:11.5px; color:var(--metin-soluk); padding:2px 2px 10px;
      ">
        <span>Ben: <strong style="color:var(--metin); font-weight:600;">${kimlik.ad}</strong></span>
        <a href="#" id="izleyici-degistir" style="color:var(--accent); text-decoration:none;">değiştir</a>
      </div>
    `
  }

  const secenekler = izleyiciler.map(i => `
    <button type="button" class="izleyici-sec" data-id="${i.id}" data-ad="${i.ad}" style="
      padding:7px 12px; background:var(--surface-2); border:1px solid var(--kenar);
      border-radius:6px; color:var(--metin); font-size:13px; cursor:pointer;
    ">${i.ad}</button>
  `).join('')

  return `
    <div id="izleyici-serit" style="
      background:var(--surface); border:1px solid var(--kenar); border-radius:8px;
      padding:10px 12px; margin-bottom:14px;
    ">
      <div style="color:var(--metin); font-size:12.5px; margin-bottom:8px;">
        👋 Sen kimsin? (kayıtlarda görünsün diye — bir kez sorulur)
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${secenekler}
        <button type="button" class="izleyici-sec" data-id="" data-ad="Bilmiyorum" style="
          padding:7px 12px; background:transparent; border:1px dashed var(--kenar);
          border-radius:6px; color:var(--metin-soluk); font-size:13px; cursor:pointer;
        ">Bilmiyorum / Diğer</button>
      </div>
    </div>
  `
}

function kimlikOlaylari(bolgeId) {
  const serit = document.getElementById('izleyici-serit')
  if (!serit) return

  serit.querySelectorAll('.izleyici-sec').forEach(btn => {
    btn.addEventListener('click', async () => {
      izleyiciKimligiKaydet(btn.dataset.id || null, btn.dataset.ad)
      // Bu oturumun ziyareti zaten kaydedildi; isim bir sonraki açılıştan
      // itibaren görünür (ziyaretci_loglari'nda update politikası yok —
      // kayıt yalnızca eklenebilir).
      await kimlikSeritiniTazele(bolgeId)
    })
  })

  const degistir = document.getElementById('izleyici-degistir')
  if (degistir) {
    degistir.addEventListener('click', async (e) => {
      e.preventDefault()
      izleyiciKimligiSil()
      await kimlikSeritiniTazele(bolgeId)
    })
  }
}

async function kimlikSeritiniTazele(bolgeId) {
  const serit = document.getElementById('izleyici-serit')
  if (!serit) return
  const izleyiciler = await izleyicileriGetir()
  serit.outerHTML = kimlikSeriti(izleyiciler)
  kimlikOlaylari(bolgeId)
}


export async function viewerRender() {
  const app = document.querySelector('#app')
  app.innerHTML = '<div class="loading">Yükleniyor...</div>'

  const bolge = await viewerBolgeBelirle()
  ziyaretKaydet(bolge?.id)

  const [zonalar, durum, izleyiciler] = await Promise.all([
    zonaVeHatlariGetir(bolge?.id),
    sistemDurumuGetir(bolge?.id),
    izleyicileriGetir()
  ])

  sistemDurumu = durum

  let tamamlananlar = []
  if (durum?.aktif_tur_id) {
    const { data } = await supabase
      .from('sulama_kayitlari')
      .select('hat_id')
      .eq('tur_id', durum.aktif_tur_id)
      .eq('durum', 'tamamlandi')
      .not('sure_dakika', 'is', null)
    tamamlananlar = (data || []).map(k => k.hat_id)
  }

  let turBilgisi = null
  if (durum?.aktif_tur_id) {
    const { data: tur } = await supabase
      .from('turlar')
      .select('*, zonalar(ad)')
      .eq('id', durum.aktif_tur_id)
      .single()
    turBilgisi = tur
  }

  const acik = durum?.sistem_acik
  const turNo = turBilgisi?.tur_no || '-'
  const zonaAd = turBilgisi?.zonalar?.ad || '-'

  // Her hattin toplam tamamlama sayisi ("kacinci su") — salt okunur
  hatKezSayilari = await hatTamamlamaSayilari(
    zonalar.flatMap(z => z.hatlar.map(h => h.id)))

  const calisan = await calisanHatVerisi(durum)

  app.innerHTML = `
    <div class="container">
      <div class="header">
        <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          ${bolge ? `<div class="meta" style="color:var(--accent);">📍 ${bolge.ad}</div>` : ''}
          <a href="/" onclick="localStorage.removeItem('goruntuleme_modu')" style="
            color: var(--metin-soluk);
            font-size: 11px;
            text-decoration: none;
            border: 1px solid var(--kenar);
            border-radius: var(--r-kucuk);
            padding: 4px 10px;
          ">🔑 Yönetici</a>
          <div class="meta">${new Date().toLocaleDateString('tr-TR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}</div>
        </div>
      </div>

      ${kimlikSeriti(izleyiciler)}

      <!-- Yonetici panosuyla ayni gorsel dil; eylem butonlari ve
           kurulum karti YOK (izleme ekrani salt goruntuleme) -->
      ${viewerMetrikKartlari(durum, turBilgisi, calisan)}

      <div class="pano-ana">
        <div class="pano-kart">
          <div id="harita" style="height:420px; border-radius:var(--r-kucuk); border:1px solid var(--kenar);"></div>
        </div>

        <div class="pano-kart">
          <div class="hat-listeleri">
            ${zonalar.map(zona => viewerZonaKart(zona, durum, tamamlananlar)).join('')}
          </div>
        </div>
      </div>

      <div class="alt-kartlar">
        <div class="ozellik-kart">
          <div class="pano-kart-baslik">Geçmiş &amp; Kayıtlar</div>
          <div class="ozellik-baglantilari">
            <button class="ozellik-btn" onclick="viewerBolumAc('bolum-gecmis')">📋 Geçmiş Kayıtlar</button>
          </div>
        </div>
        <div class="ozellik-kart">
          <div class="pano-kart-baslik">Veri Analizi &amp; Galeri</div>
          <div class="ozellik-baglantilari">
            <button class="ozellik-btn" onclick="viewerBolumAc('bolum-istatistik')">📊 İstatistikler</button>
            <button class="ozellik-btn" onclick="viewerBolumAc('bolum-galeri')">📸 Foto Galerisi</button>
          </div>
        </div>
      </div>

      <details class="bolum" id="bolum-gecmis">
        <summary>📋 Geçmiş Kayıtlar</summary>
        <div id="gecmis-liste">Yükleniyor...</div>
      </details>

      <details class="bolum" id="bolum-istatistik">
        <summary>📊 İstatistikler</summary>
        <div id="istatistik-bolum">${istatistikHTML()}</div>
      </details>

      <details class="bolum" id="bolum-galeri">
        <summary>📸 Foto Galerisi (hat ve su sırasına göre)</summary>
        <div id="galeri-liste">Yükleniyor...</div>
      </details>

      <div style="text-align:center; color:var(--metin-silik); font-size:10px; padding:20px 0 10px; letter-spacing:0.4px;">
        developed by Ömer Faruk Yıldız
      </div>
    </div>
  `

  kimlikOlaylari(bolge?.id)

  gecmisKayitlariGetir(bolge?.id).then(kayitlar => {
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  galeriKayitlariGetir(bolge?.id).then(kayitlar => {
    const el = document.getElementById('galeri-liste')
    if (el) el.innerHTML = galeriHTML(kayitlar)
  })

  // İstatistik açılışta hesaplanmaz; bölüm ilk açıldığında tetiklenir
  ;(() => {
    const bolum = document.getElementById('bolum-istatistik')
    if (!bolum) return
    let yuklendi = false
    const yukle = () => {
      if (yuklendi) return
      yuklendi = true
      istatistikVerileriGetir(bolge?.id).then(veri => istatistikCiz(veri))
    }
    bolum.addEventListener('toggle', () => { if (bolum.open) yukle() })
    if (bolum.open) yukle()
  })()

  const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    // Harita saha verisini veritabanından getirir; çizimler hazır olunca eklenir
    haritaOlustur('harita', bolge).then(() => {
      hatlariHaritayaCiz(sistemDurumu, tamamlananlar, bolge?.id)
      vanalariHaritayaCiz(bolge?.id, sistemDurumu, tamamlananlar)
    })
  }

  if (acik) viewerSayacBaslat()
  else if (sayacInterval) clearInterval(sayacInterval)
}

// Yonetici panosuyla ayni metrik kartlari — salt goruntuleme.
// panel-sayac / panel-kalan id'leri korunur: viewerSayacBaslat()
// bunlari her saniye gunceller, sayac mantigina dokunulmadi.
function viewerMetrikKartlari(durum, turBilgisi, calisan) {
  const acik = durum?.sistem_acik
  const kart = (ikon, etiket, deger, alt = '', sinif = '') => `
    <div class="metrik-kart">
      <div class="metrik-ikon">${ikon}</div>
      <div class="metrik-govde">
        <div class="metrik-etiket">${etiket}</div>
        <div class="metrik-deger ${sinif}">${deger}</div>
        ${alt ? `<div class="metrik-alt">${alt}</div>` : ''}
      </div>
    </div>
  `

  return `
    <div class="metrik-grid">
      ${kart('🟢', 'Sistem Durumu', acik ? 'AKTİF' : 'KAPALI',
             calisan ? `Çalışan: Hat-${calisan.hat.hat_no}` +
               (hatKezSayilari[calisan.hat.id] ? ` · ${hatKezSayilari[calisan.hat.id]}. kez` : '')
             : 'Sulama yapılmıyor',
             acik ? 'acik' : 'kapali')}
      ${kart('💧', 'Çalışan Tur', turBilgisi?.tur_no ? `${turBilgisi.tur_no}. Su` : '—',
             calisan?.vanaNolar ? `Vanalar: ${calisan.vanaNolar}` : '')}
      ${kart('📍', 'Aktif Zona', turBilgisi?.zonalar?.ad || calisan?.hat?.zonalar?.ad || '—',
             calisan?.alanDekar ? `~${calisan.alanDekar} dekar • ${calisan.fiskiyeToplam} fıskiye` : '')}
      ${kart('⏱', 'Kalan Süre',
             `<span id="panel-kalan" data-sure="${calisan?.hat?.varsayilan_sure_dk || ''}">--:--:--</span>`,
             `Geçen: <span id="panel-sayac">--:--:--</span>` +
             (calisan?.saatAralik && calisan.saatAralik !== '—' ? ` • ${calisan.saatAralik}` : ''))}
    </div>
  `
}

// Özellik kartından ilgili <details> bölümünü açıp oraya kaydır.
// Bölümler kapalıyken CSS ile gizli (.bolum:not([open])), bu yüzden
// önce açılır, düzen oluştuktan SONRA kaydırılır — aksi halde
// tarayıcı henüz yer kaplamayan elemana kaydırmaya çalışır.
window.viewerBolumAc = (id) => {
  const el = document.getElementById(id)
  if (!el) return
  el.open = true
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function viewerZonaKart(zona, durum, tamamlananlar) {
  const hatlarHTML = zona.hatlar.length === 0
    ? '<div style="color:var(--metin-soluk); font-size:13px; padding:8px;">Henüz hat eklenmedi.</div>'
    : zona.hatlar.map(hat => viewerHatSatir(hat, durum, tamamlananlar)).join('')

  return `
    <div class="hat-listesi-kutu">
      <div class="pano-kart-baslik">${zona.ad} hat listesi</div>
      <div class="hat-listesi hat-listesi-kaydir">${hatlarHTML}</div>
    </div>
  `
}


/*
 * "kacinci su" rozeti — hattin BUGUNE KADARKI toplam tamamlama
 * sayisi. Bolge turundan bagimsizdir (kuyu suyu azalinca hatlar
 * atlanabilir, o zaman ikisi ayrisir).
 */
function kezRozeti(hatId) {
  const n = hatKezSayilari[hatId] || 0
  if (!n) return ''
  return `<span class="hat-kez" title="Bu hat bugüne kadar ${n} kez sulandı">${n}. kez</span>`
}

function viewerHatSatir(hat, durum, tamamlananlar) {
  const d = hatDurumuBelirle(hat, durum, tamamlananlar)
  const renkClass = {
    aktif: 'durum-aktif',
    siradaki: 'durum-siradaki',
    tamam: 'durum-tamam',
    pasif: 'durum-pasif'
  }[d] || 'durum-pasif'

  return `
    <div class="hat-satir">
      <div class="durum-badge ${renkClass}"></div>
      <div class="hat-no">Hat-${hat.hat_no}</div>
      <div class="hat-parsel">${hat.parsel_bilgisi || ''}</div>
      ${kezRozeti(hat.id)}
      <div class="hat-sure">${sureyiFormatla(hat.varsayilan_sure_dk)}</div>
      <div class="sayac" id="vsayac-${hat.id}">
        ${d === 'aktif' ? '⏱ --:--' : ''}
      </div>
    </div>
  `
}

function viewerSayacBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)

  sayacInterval = setInterval(() => {
    if (!sistemDurumu?.sistem_acik || !sistemDurumu?.aktif_hat_id) {
      clearInterval(sayacInterval)
      return
    }

    const el = document.getElementById(`vsayac-${sistemDurumu.aktif_hat_id}`)
    if (!el) return

    let baslama = sistemDurumu.hat_baslama_zamani
    if (!baslama) {
      const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
      baslama = localStorage.getItem(baslamaKey)
      if (!baslama) {
        baslama = new Date().toISOString()
        localStorage.setItem(baslamaKey, baslama)
      }
    }

    const gecenSn = Math.floor((Date.now() - new Date(baslama).getTime()) / 1000)
    const saat = Math.floor(gecenSn / 3600)
    const dakika = Math.floor((gecenSn % 3600) / 60)
    const saniye = gecenSn % 60

    const sayacMetni = `${String(saat).padStart(2,'0')}:${String(dakika).padStart(2,'0')}:${String(saniye).padStart(2,'0')}`
    el.textContent = `⏱ ${sayacMetni}`

    const panelEl = document.getElementById('panel-sayac')
    if (panelEl) panelEl.textContent = sayacMetni

    const kalanEl = document.getElementById('panel-kalan')
    if (kalanEl) {
      const sureDk = parseInt(kalanEl.dataset.sure)
      if (sureDk) {
        const kalanSn = sureDk * 60 - gecenSn
        kalanEl.textContent = kalanSn > 0
          ? `${String(Math.floor(kalanSn / 3600)).padStart(2, '0')}:${String(Math.floor((kalanSn % 3600) / 60)).padStart(2, '0')}:${String(kalanSn % 60).padStart(2, '0')}`
          : 'geçiş bekleniyor...'
      }
    }
  }, 1000)
}

export function viewerRealtimeBaslat() {
  supabase
    .channel('viewer_sistem')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sistem_durumu'
    }, () => viewerRender())
    .subscribe()
}
