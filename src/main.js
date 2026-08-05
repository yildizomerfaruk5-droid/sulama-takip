/*
 * Sulama Takip Sistemi
 * developed by manco — Ömer Faruk Yıldız
 * 2026 — Kayseri
 */
import './style.css'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, calisanHatPaneliHTML } from './hatlar.js'
import { supabase } from './supabase.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { viewerRender, viewerRealtimeBaslat } from './viewer.js'
import { popupHTML, popupEventleriEkle } from './popup.js'
import { girisYap, cikisYap, mevcutKullanici, loginHTML, girisGecmisiniGetir, girisGecmisiHTML } from './auth.js'
import { haritaOlustur, hatlariHaritayaCiz, koordinatSeciciBaslat, vanalariHaritayaCiz, haritaDurumGuncelle } from './harita.js'
import { bolgeleriGetir, profilGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import { logKaydet, loglariGetir, logHTML, ziyaretcileriGetir, ziyaretciHTML } from './log.js'
import { yedekIndir } from './yedek.js'
import { kurulumEkraniAc } from './kurulum.js'
import {
  offlineBaslat, kuyrukSayisi, kuyrukListesi, kuyruktanSil,
  senkronBaslat, kuyrukRozetiHTML, takiliOgeler
} from './offline.js'


let sayacInterval = null

let sistemDurumu = null
let profil = null      // giriş yapan kullanıcının profili (rol + bölge)
let bolgeler = []      // kullanıcının erişebildiği bölgeler
let aktifBolge = null  // seçili bölge
let kurulumAcik = false // kurulum sihirbazı açıkken panel yeniden çizilmemeli
let bekleyenKayit = 0   // çevrimdışı kuyrukta bekleyen veri girişi sayısı

// Geçiş dönemi: profili olmayan giriş yapmış kullanıcı yönetici sayılır
function aktifRol() {
  return profil?.rol || 'yonetici'
}

// ── RENDER ──
async function render() {
  const app = document.querySelector('#app')
  app.innerHTML = '<div class="loading">Yükleniyor...</div>'

  if (!aktifBolge) {
    app.innerHTML = '<div class="loading">Bölge bulunamadı. Veritabanında en az bir bölge tanımlı olmalı (supabase_migration_bolgeler.sql).</div>'
    return
  }

  const [zonalar, durum] = await Promise.all([
    zonaVeHatlariGetir(aktifBolge.id),
    sistemDurumuGetir(aktifBolge.id)
  ])

  sistemDurumu = durum

  // Bu turdaki tamamlanan hatları getir
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

  // Tur bilgisini getir
  let turBilgisi = null
  if (durum?.aktif_tur_id) {
    const { data: tur } = await supabase
      .from('turlar')
      .select('*, zonalar(ad)')
      .eq('id', durum.aktif_tur_id)
      .single()
    turBilgisi = tur
  }

  const calisanPanel = await calisanHatPaneliHTML(durum)

  app.innerHTML = `
    <div class="container">
      ${header()}
      <div id="durum-bolumu">
        ${duruBanner(durum, turBilgisi)}
        ${calisanPanel}
        ${butonlar(durum)}
      </div>
      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>
      <div class="zona-grid" id="zona-grid">
        ${zonalar.map(zona => zonaKart(zona, durum, tamamlananlar)).join('')}
      </div>

      <details class="bolum">
        <summary>📋 Geçmiş Kayıtlar</summary>
        <div id="gecmis-liste">Yükleniyor...</div>
      </details>

      <details class="bolum">
        <summary>📊 İstatistikler</summary>
        <div id="istatistik-bolum">${istatistikHTML()}</div>
      </details>

      <details class="bolum">
        <summary>📸 Foto Galerisi (hat ve su sırasına göre)</summary>
        <div id="galeri-liste">Yükleniyor...</div>
      </details>

      <details class="bolum">
        <summary>📜 Olay Kayıtları</summary>
        <div style="margin-bottom:10px;">
          <button onclick="yedekAl(this)" style="
            padding: 6px 14px;
            background: #00cec9;
            border: none;
            border-radius: 6px;
            color: #003330;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
          ">💾 Yedek İndir</button>
        </div>
        <div id="olay-log-liste">Yükleniyor...</div>
      </details>

      <details class="bolum">
        <summary>🔐 Giriş Geçmişi</summary>
        <div id="giris-gecmisi-liste">Yükleniyor...</div>
      </details>

      <details class="bolum">
        <summary>👁 Ziyaretçiler (misafir görüntülemeleri)</summary>
        <div id="ziyaretci-liste">Yükleniyor...</div>
      </details>

      <div style="text-align:center; color:#2f4156; font-size:10px; padding:20px 0 10px; letter-spacing:0.4px;">
        developed by Ömer Faruk Yıldız
      </div>
    </div>
  `

  gecmisKayitlariGetir(aktifBolge.id).then(kayitlar => {
    const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    // Harita saha verisini veritabanından getirir; çizimler hazır olunca eklenir
    haritaOlustur('harita', aktifBolge).then(() => {
      hatlariHaritayaCiz(sistemDurumu, tamamlananlar, aktifBolge.id)
      vanalariHaritayaCiz(aktifBolge.id, sistemDurumu, tamamlananlar)
      koordinatSeciciBaslat()
    })
  }
  girisGecmisiniGetir().then(kayitlar => {
    const el = document.getElementById('giris-gecmisi-liste')
    if (el) el.innerHTML = girisGecmisiHTML(kayitlar)
  })
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar, true)
  })

  galeriKayitlariGetir(aktifBolge.id).then(kayitlar => {
    const el = document.getElementById('galeri-liste')
    if (el) el.innerHTML = galeriHTML(kayitlar)
  })

  istatistikVerileriGetir(aktifBolge.id).then(veri => istatistikCiz(veri))

  loglariGetir(aktifBolge.id).then(loglar => {
    const el = document.getElementById('olay-log-liste')
    if (el) el.innerHTML = logHTML(loglar)
  })

  ziyaretcileriGetir().then(kayitlar => {
    const el = document.getElementById('ziyaretci-liste')
    if (el) el.innerHTML = ziyaretciHTML(kayitlar)
  })

  // Sayacı başlat
  if (sistemDurumu?.sistem_acik) {
    sayaciBaslat()
  } else {
    if (sayacInterval) clearInterval(sayacInterval)
  }
}



// ── BÖLGE SEÇİCİ ──
// Kurulumu tamamlanmamış bölgeler listede KALIR ama 🚧 ile işaretlenir.
// Gizlemek tehlikeli olurdu: kurulum_tamam varsayılanı false olduğu için
// bayrağı henüz açılmamış bir bölge (Kayseri dahil) listeden düşer ve
// sulama yapan sistem bölgesiz kalırdı.
function bolgeIsareti(b) {
  return b?.kurulum_tamam === false ? '🚧' : '📍'
}

function bolgeSecici() {
  // Tek bölge varsa (veya denetleyici kilitliyse) sadece adı göster
  if (bolgeler.length <= 1) {
    return `<div class="meta" style="color:#5dade2;"
      ${aktifBolge?.kurulum_tamam === false ? 'title="Kurulum tamamlanmış olarak işaretlenmedi"' : ''}
      >${bolgeIsareti(aktifBolge)} ${aktifBolge?.ad || ''}</div>`
  }
  return `
    <select onchange="bolgeDegistir(this.value)"
      title="🚧 = kurulumu tamamlanmamış bölge" style="
      padding: 6px 10px;
      background: #0f1923;
      border: 1px solid #2c3e50;
      border-radius: 6px;
      color: #5dade2;
      font-size: 13px;
      cursor: pointer;
    ">
      ${bolgeler.map(b => `
        <option value="${b.id}" ${b.id === aktifBolge?.id ? 'selected' : ''}>${bolgeIsareti(b)} ${b.ad}</option>
      `).join('')}
    </select>
  `
}

// ── HEADER ──
function header() {
  return `
    <div class="header">
      <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
      <div style="display:flex; align-items:center; gap:16px;">
        ${bolgeSecici()}
        <div class="meta">${new Date().toLocaleDateString('tr-TR', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}</div>
        <span id="kuyruk-rozet-yuvasi">${kuyrukRozetiHTML(bekleyenKayit)}</span>
        ${aktifRol() === 'yonetici' ? `
          <button
            onclick="kurulumAc()"
            title="Bölge, zona, parsel ve vana tanımları"
            style="
              padding: 6px 14px;
              background: transparent;
              border: 1px solid #2c3e50;
              border-radius: 6px;
              color: #5dade2;
              font-size: 12px;
              cursor: pointer;
            "
          >⚙️ Kurulum</button>
        ` : ''}
        <button
          onclick="cikisYap()"
          style="
            padding: 6px 14px;
            background: transparent;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            color: #7f8c8d;
            font-size: 12px;
            cursor: pointer;
          "
        >Çıkış</button>
      </div>
    </div>
  `
}

// ── DURUM BANNER ──
function duruBanner(durum, turBilgisi) {
  const acik = durum?.sistem_acik
  const turNo = turBilgisi?.tur_no || '-'
  const zonaAd = turBilgisi?.zonalar?.ad || '-'

  return `
    <div class="durum-banner">
      <span class="label">Sistem:</span>
      <span class="value" style="color: ${acik ? '#26de81' : '#ff4757'}">
        ${acik ? '● AKTİF' : '● KAPALI'}
      </span>
      ${acik ? `
        <span class="label">Aktif Tur:</span>
        <span class="value">${turNo}. Su</span>
        <span class="label">Zona:</span>
        <span class="value">${zonaAd}</span>
      ` : ''}
    </div>
  `
}

// ── BUTONLAR ──
function butonlar(durum) {
  const acik = durum?.sistem_acik
  return `
    <div class="btn-group">
      <button class="btn btn-basla" ${acik ? 'disabled' : ''} onclick="sistemiBaslat()">
        ▶ Sulamayı Başlat
      </button>
      <button class="btn btn-durdur" ${!acik ? 'disabled' : ''} onclick="sistemiKapat()">
        ■ Sistemi Kapat
      </button>
      <button class="btn btn-atla" ${!acik ? 'disabled' : ''} onclick="hatAtla()">
        ⏭ Sıradaki Hat
      </button>
      <button class="btn" ${!acik ? 'disabled' : ''} onclick="sureDegistir()" style="background:#8e44ad; color:#fff;">
        ⏱ Süre Değiştir
      </button>
    </div>
  `
}


// ── ZONA KARTI ──
function zonaKart(zona, durum, tamamlananlar = []) {
  const hatlarHTML = zona.hatlar.length === 0
    ? '<div style="color:#7f8c8d; font-size:13px; padding:8px;">Henüz hat eklenmedi.</div>'
    : zona.hatlar.map(hat => hatSatir(hat, durum, tamamlananlar)).join('')

  return `
    <div class="zona-card">
      <h2>${zona.ad}</h2>
      <div style="font-size:12px; color:#7f8c8d; margin-bottom:10px;">${zona.aciklama || ''}</div>
      <div class="hat-listesi">
        ${hatlarHTML}
      </div>
    </div>
  `
}

function hatSatir(hat, durum, tamamlananlar = []) {
  const d = hatDurumuBelirle(hat, durum, tamamlananlar)
  const renkClass = {
    aktif: 'durum-aktif',
    siradaki: 'durum-siradaki',
    tamam: 'durum-tamam',
    pasif: 'durum-pasif'
  }[d] || 'durum-pasif'

  return `
    <div class="hat-satir" onclick="hatTikla('${hat.id}')">
      <div class="durum-badge ${renkClass}"></div>
      <div class="hat-no">Hat-${hat.hat_no}</div>
      <div class="hat-parsel">${hat.parsel_bilgisi || 'Parsel girilmedi'}</div>
      <div class="hat-sure">${sureyiFormatla(hat.varsayilan_sure_dk)}</div>
      <div class="sayac" id="sayac-${hat.id}">
        ${d === 'aktif' ? '⏱ --:--' : ''}
      </div>
    </div>
  `
}

// ── GLOBAL FONKSİYONLAR ──
window.hatTikla = async (hatId) => {
  const { data: hat } = await supabase
    .from('hatlar')
    .select('*')
    .eq('id', hatId)
    .single()

  document.body.insertAdjacentHTML('beforeend', popupHTML(hat))
  popupEventleriEkle(hatId, sistemDurumu?.aktif_tur_id, `Hat-${hat.hat_no}`, aktifRol())
}

window.sistemiBaslat = async () => {
  // Aktif bölgenin zonalarını sırayla getir
  const { data: bolgeZonalari } = await supabase
    .from('zonalar')
    .select('id')
    .eq('bolge_id', aktifBolge.id)
    .order('sira_no')

  const zonaIdler = (bolgeZonalari || []).map(z => z.id)
  if (zonaIdler.length === 0) {
    alert('Bu bölgede zona tanımlı değil.')
    return
  }

  // Bölgenin ilk zonasının hatlarını getir
  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no')
    .in('zona_id', zonaIdler)
    .order('sira_no')

  const ilkZonaId = zonaIdler.find(zid => (tumHatlar || []).some(h => h.zona_id === zid))
  const hatlar = (tumHatlar || []).filter(h => h.zona_id === ilkZonaId)

  if (!hatlar || hatlar.length === 0) {
    alert('Hat bulunamadı.')
    return
  }

  const aktifHat = hatlar[0]
  const siradakiHat = hatlar[1] || null

  // 2. tur sistemi: bu bölgede son tamamlanan turun numarasını bul, bir artır
  const { data: sonTur } = await supabase
    .from('turlar')
    .select('tur_no, zonalar!inner(bolge_id)')
    .eq('durum', 'tamamlandi')
    .eq('zonalar.bolge_id', aktifBolge.id)
    .order('tur_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const yeniTurNo = (sonTur?.tur_no || 0) + 1

  const onay = confirm(`${yeniTurNo}. Su başlatılacak. Onaylıyor musunuz?`)
  if (!onay) return

  logKaydet('sistem_baslatildi', `${yeniTurNo}. Su başlatıldı (${aktifBolge.ad})`, aktifBolge.id)

  // Yeni tur oluştur
  const { data: tur } = await supabase
    .from('turlar')
    .insert({
      zona_id: aktifHat.zona_id,
      tur_no: yeniTurNo,
      baslangic_zamani: new Date().toISOString(),
      durum: 'devam_ediyor'
    })
    .select()
    .single()

  // Sistem durumunu güncelle
  await supabase
    .from('sistem_durumu')
    .update({
      sistem_acik: true,
      aktif_hat_id: aktifHat.id,
      siradaki_hat_id: siradakiHat?.id || null,
      aktif_tur_id: tur.id,
      aktif_zona_id: aktifHat.zona_id,
      hat_baslama_zamani: new Date().toISOString(),
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('bolge_id', aktifBolge.id)

  render()
}

window.sistemiKapat = async () => {
  const onay = confirm('Sistemi kapatmak istediğinizden emin misiniz?')
  if (!onay) return

  logKaydet('sistem_kapatildi', `Sistem kapatıldı (acil durdurma)`, aktifBolge.id)

  await supabase
    .from('sistem_durumu')
    .update({
      sistem_acik: false,
      aktif_hat_id: null,
      siradaki_hat_id: null,
      hat_baslama_zamani: null,
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('bolge_id', aktifBolge.id)

  render()
}

window.hatAtla = async () => {
  if (!sistemDurumu?.sistem_acik) return

  const { data: bolgeZonalari } = await supabase
    .from('zonalar')
    .select('id')
    .eq('bolge_id', aktifBolge.id)

  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no, hat_no')
    .in('zona_id', (bolgeZonalari || []).map(z => z.id))
    .order('sira_no')

  const siradakiHat = tumHatlar.find(h => h.id === sistemDurumu.siradaki_hat_id)

  // Mevcut aktif hattı tamamlandı kaydet — gerçek başlama zamanı ve süreyle
  const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
  const baslama = sistemDurumu.hat_baslama_zamani
    || localStorage.getItem(baslamaKey)
    || new Date().toISOString()
  localStorage.removeItem(baslamaKey)
  const bitis = new Date().toISOString()
  const sureDk = Math.max(0, Math.round((new Date(bitis) - new Date(baslama)) / 60000))

  await supabase
    .from('sulama_kayitlari')
    .insert({
      hat_id: sistemDurumu.aktif_hat_id,
      tur_id: sistemDurumu.aktif_tur_id,
      baslangic_zamani: baslama,
      bitis_zamani: bitis,
      sure_dakika: sureDk,
      durum: 'tamamlandi'
    })

  logKaydet('hat_gecisi',
    `Hat tamamlandı (${Math.floor(sureDk / 60)}sa ${sureDk % 60}dk çalıştı)${siradakiHat ? `, Hat-${siradakiHat.hat_no} başladı` : ''}`,
    aktifBolge.id)

  // Sıradaki hat yoksa — tur tamamlandı
  if (!siradakiHat) {
    await turTamamla()
    return
  }

  // Aynı zonadaki bir sonraki hat
  const ayniZonaHatlar = tumHatlar.filter(h => h.zona_id === siradakiHat.zona_id)
  const siradakiIndex = ayniZonaHatlar.findIndex(h => h.id === siradakiHat.id)
  const yeniSiradaki = ayniZonaHatlar[siradakiIndex + 1] || null

  await supabase
    .from('sistem_durumu')
    .update({
      aktif_hat_id: siradakiHat.id,
      siradaki_hat_id: yeniSiradaki?.id || null,
      hat_baslama_zamani: new Date().toISOString(),
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('bolge_id', aktifBolge.id)

  render()
}

window.sureDegistir = async () => {
  if (!sistemDurumu?.sistem_acik) return

  const yeniSure = prompt('Yeni sulama süresi (dakika olarak girin):\nÖrn: 360 = 6 saat, 480 = 8 saat')
  if (!yeniSure || isNaN(yeniSure)) return

  const sure = parseInt(yeniSure)

  const kapsam = confirm(
    `Süre ${sure} dakika olarak ayarlanacak.\n\nTamam = Sadece aktif hat\nİptal = Bu andan itibaren tüm hatlar`
  )

  if (kapsam) {
    // Sadece aktif hat
    await supabase
      .from('hatlar')
      .update({ varsayilan_sure_dk: sure })
      .eq('id', sistemDurumu.aktif_hat_id)
  } else {
    // Bu bölgedeki tüm hatlar - id'leri tek tek güncelle
    const { data: bolgeZonalari } = await supabase
      .from('zonalar')
      .select('id')
      .eq('bolge_id', aktifBolge.id)

    const { data: tumHatlar } = await supabase
      .from('hatlar')
      .select('id')
      .in('zona_id', (bolgeZonalari || []).map(z => z.id))

    for (const hat of tumHatlar) {
      await supabase
        .from('hatlar')
        .update({ varsayilan_sure_dk: sure })
        .eq('id', hat.id)
    }

    alert(`Tüm hatların süresi ${sure} dakika olarak güncellendi.`)
  }
  logKaydet('sure_degistirildi', `Süre ${sure} dk yapıldı (${kapsam ? 'aktif hat' : 'tüm hatlar'})`, aktifBolge.id)
  render()
}

async function turTamamla() {
  if (sayacInterval) clearInterval(sayacInterval)

  // Aktif zonayı bul, aynı bölgedeki sıradaki zonaya geç
  const { data: zonalar } = await supabase
    .from('zonalar')
    .select('*')
    .eq('bolge_id', aktifBolge.id)
    .order('sira_no')

  const aktifZona = zonalar.find(z => z.id === sistemDurumu.aktif_zona_id)
  const siradakiZona = zonalar.find(z => z.sira_no === aktifZona.sira_no + 1)

  // Mevcut zonanın turunu kapat, tur numarasını al
  const { data: bitenTur } = await supabase
    .from('turlar')
    .update({
      bitis_zamani: new Date().toISOString(),
      durum: 'tamamlandi'
    })
    .eq('id', sistemDurumu.aktif_tur_id)
    .select()
    .single()

  const turNo = bitenTur?.tur_no || 1

  if (siradakiZona) {
    // Sıradaki zonaya geç
    const { data: zonaHatlari } = await supabase
      .from('hatlar')
      .select('id, zona_id, sira_no')
      .eq('zona_id', siradakiZona.id)
      .order('sira_no')

    const yeniAktif = zonaHatlari[0]
    const yeniSiradaki = zonaHatlari[1] || null

    // Yeni tur oluştur — aynı su numarası devam eder (zona geçişi tur değiştirmez)
    const { data: yeniTur } = await supabase
      .from('turlar')
      .insert({
        zona_id: siradakiZona.id,
        tur_no: turNo,
        baslangic_zamani: new Date().toISOString(),
        durum: 'devam_ediyor'
      })
      .select()
      .single()

    await supabase
      .from('sistem_durumu')
      .update({
        sistem_acik: true,
        aktif_hat_id: yeniAktif.id,
        siradaki_hat_id: yeniSiradaki?.id || null,
        aktif_tur_id: yeniTur.id,
        aktif_zona_id: siradakiZona.id,
        hat_baslama_zamani: new Date().toISOString(),
        guncelleme_zamani: new Date().toISOString()
      })
      .eq('bolge_id', aktifBolge.id)

    logKaydet('zona_gecisi', `${aktifZona.ad} tamamlandı, ${siradakiZona.ad} başladı (${turNo}. Su)`, aktifBolge.id)
    alert(`✅ ${aktifZona.ad} tamamlandı! ${siradakiZona.ad} başlıyor.`)
    render()

  } else {
    // Tüm zonalar bitti (tur zaten yukarıda kapatıldı)
    await supabase
      .from('sistem_durumu')
      .update({
        sistem_acik: false,
        aktif_hat_id: null,
        siradaki_hat_id: null,
        aktif_tur_id: null,
        aktif_zona_id: null,
        hat_baslama_zamani: null,
        guncelleme_zamani: new Date().toISOString()
      })
      .eq('bolge_id', aktifBolge.id)

    Object.keys(localStorage)
      .filter(k => k.startsWith('hat_baslama_'))
      .forEach(k => localStorage.removeItem(k))

    logKaydet('tur_tamamlandi', `${turNo}. Su tamamlandı — tüm zonalar bitti`, aktifBolge.id)
    alert(`🎉 Tüm zonalar tamamlandı! ${turNo}. Su bitti.\nYeni tur için "Sulamayı Başlat" butonunu kullanın.`)
    render()
  }
}


/*
 * Durum değişiminde HAFİF güncelleme.
 *
 * Tam render() haritayı yıkıp yeniden kuruyordu: ölçümde 149 ms'nin
 * 138 ms'i 3570 Leaflet nesnesinin yeniden yaratılmasıydı (geometri
 * yalnızca 5 ms). Burada DOM'un yalnızca durum bağımlı bölümleri ve
 * haritanın renkleri güncellenir; harita, fıskiye geometrisi ve
 * katmanlar yerinde kalır.
 */
async function durumGuncelle() {
  if (kurulumAcik || !aktifBolge) return

  const kap = document.getElementById('durum-bolumu')
  const izgara = document.getElementById('zona-grid')
  // Harita henüz kurulmadıysa hafif yol anlamsız — tam çizime düş
  if (!kap || !izgara) return render()

  const [zonalar, durum] = await Promise.all([
    zonaVeHatlariGetir(aktifBolge.id),
    sistemDurumuGetir(aktifBolge.id)
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
      .from('turlar').select('*, zonalar(ad)').eq('id', durum.aktif_tur_id).single()
    turBilgisi = tur
  }

  kap.innerHTML = `
    ${duruBanner(durum, turBilgisi)}
    ${await calisanHatPaneliHTML(durum)}
    ${butonlar(durum)}
  `
  izgara.innerHTML = zonalar.map(z => zonaKart(z, durum, tamamlananlar)).join('')

  // Harita: yalnızca renk/durum — geometri ve katmanlar korunur
  haritaDurumGuncelle(durum, tamamlananlar)

  if (durum?.sistem_acik) sayaciBaslat()
  else if (sayacInterval) clearInterval(sayacInterval)
}

// ── REALTIME ──
supabase
  .channel('sistem_durumu')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'sistem_durumu'
  }, () => { if (!kurulumAcik) durumGuncelle() })
  .subscribe()

// ── SAYAÇ ──
// Aktif hattın süresi sayaç boyunca sabittir; her tikte sorgulanmaz.
// Hat değişince/sayaç yeniden başlayınca sıfırlanır.
let aktifHatSuresiDk = null

function sayaciBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)
  aktifHatSuresiDk = null

  sayacInterval = setInterval(async () => {
    if (!sistemDurumu?.sistem_acik || !sistemDurumu?.aktif_hat_id) {
      clearInterval(sayacInterval)
      return
    }

    const el = document.getElementById(`sayac-${sistemDurumu.aktif_hat_id}`)
    if (!el) return

    // Sayaç kaynağı: veritabanı (cihazlar arası tutarlı); eski kayıtlar için localStorage
    const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
    let baslama = sistemDurumu.hat_baslama_zamani
    if (!baslama) {
      baslama = localStorage.getItem(baslamaKey)
      if (!baslama) {
        baslama = new Date().toISOString()
        localStorage.setItem(baslamaKey, baslama)
      }
    }

    const gecenMs = Date.now() - new Date(baslama).getTime()
    const gecenSn = Math.floor(gecenMs / 1000)
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

    // NOT: Otomatik hat geçişi SUNUCUDA yapılır (pg_cron > hat_gecis_kontrol).
    // Tarayıcı geçiş tetiklemez — iki motorun çakışıp mükerrer kayıt üretmesini
    // önlemek için. Süre dolduğunda yalnızca ekranı tazeleyip sunucuyu bekleriz.
    //
    // Hattın süresi saniyede bir SORGULANMAZ: sabit bir değerdir, sayaç
    // başlarken bir kez okunur. Eskiden her tik bir Supabase isteği
    // atıyordu (saatte 3600 istek) — telefonda pil ve radyo maliyeti.
    if (aktifHatSuresiDk == null) {
      const { data: aktifHat } = await supabase
        .from('hatlar')
        .select('varsayilan_sure_dk')
        .eq('id', sistemDurumu.aktif_hat_id)
        .single()
      aktifHatSuresiDk = aktifHat?.varsayilan_sure_dk ?? null
    }

    if (aktifHatSuresiDk != null) {
      const limitMs = aktifHatSuresiDk * 60 * 1000
      // Sunucunun geçişi yapmasına fırsat ver, sonra ekranı tazele
      if (gecenMs >= limitMs + 90000) {
        clearInterval(sayacInterval)
        if (!kurulumAcik) durumGuncelle()
      }
    }
  }, 1000)
}

window.loginYap = async () => {
  const email = document.getElementById('login-email').value
  const sifre = document.getElementById('login-sifre').value
  const hataEl = document.getElementById('login-hata')

  hataEl.textContent = 'Giriş yapılıyor...'

  const sonuc = await girisYap(email, sifre)

  if (!sonuc.basarili) {
    hataEl.textContent = 'Hatalı e-posta veya şifre.'
    return
  }

  // Girişten sonra rol + bölge bilgileri yüklensin
  uygulamaBaslat()
}

window.cikisYap = async () => {
  await cikisYap()
  document.querySelector('#app').innerHTML = loginHTML()
}

window.misafirDevam = () => {
  localStorage.setItem('goruntuleme_modu', 'viewer')
  window.location.href = '/?viewer'
}

async function uygulamaBaslat() {
  if (window.location.search.includes('viewer')) {
    viewerRealtimeBaslat()
    await viewerRender()
    return
  }

  // Misafir tercihi: uygulama her acilista dogrudan izleme ekranina gitsin
  if (localStorage.getItem('goruntuleme_modu') === 'viewer') {
    const kullaniciVar = await mevcutKullanici()
    if (!kullaniciVar) {
      window.location.href = '/?viewer'
      return
    }
    // Giris yapmis kullanici varsa tercih temizlenir (admin telefonu)
    localStorage.removeItem('goruntuleme_modu')
  }

  const kullanici = await mevcutKullanici()

  if (!kullanici) {
    document.querySelector('#app').innerHTML = loginHTML()
    return
  }

  // Rol ve bölge belirleme
  profil = await profilGetir(kullanici.id)
  // Geçiş dönemi: profili olmayan kullanıcı yönetici sayılır (mevcut admin hesabı için)
  const rol = profil?.rol || 'yonetici'

  if (rol === 'isci') {
    // İşçi arayüzü sonraki aşamada — şimdilik salt görüntüleme
    viewerRealtimeBaslat()
    await viewerRender()
    return
  }

  bolgeler = await bolgeleriGetir()

  // Denetleyici sadece kendi bölgesini görür
  if (rol === 'denetleyici' && profil?.bolge_id) {
    bolgeler = bolgeler.filter(b => b.id === profil.bolge_id)
  }

  const kayitliBolgeId = localStorage.getItem('secili_bolge_id')
  aktifBolge = bolgeler.find(b => b.id === kayitliBolgeId) || bolgeler[0] || null

  render()
}

window.yedekAl = async (btn) => {
  btn.disabled = true
  btn.textContent = 'Hazırlanıyor...'
  try {
    const sonuc = await yedekIndir(aktifBolge)
    btn.textContent = `✓ ${sonuc.kayitToplam} kayıt indirildi`
  } catch (e) {
    btn.textContent = 'Hata: ' + e.message
  }
  setTimeout(() => {
    btn.disabled = false
    btn.textContent = '💾 Yedek İndir'
  }, 3000)
}

window.kayitSil = async (kayitId) => {
  const onay = confirm('Bu kayıt silinsin mi?\nBağlı gübre girişleri ve fotoğraf da silinir.')
  if (!onay) return

  const { data: k } = await supabase
    .from('sulama_kayitlari')
    .select('fotograf_url, ilac_gubre_notu, hatlar(hat_no)')
    .eq('id', kayitId)
    .maybeSingle()

  // Fotograf varsa storage'dan da temizle
  if (k?.fotograf_url) {
    const dosya = k.fotograf_url.split('/fotograflar/')[1]
    if (dosya) {
      await supabase.storage.from('fotograflar').remove([decodeURIComponent(dosya)])
    }
  }

  const { error } = await supabase
    .from('sulama_kayitlari')
    .delete()
    .eq('id', kayitId)

  if (error) {
    alert('Silinemedi: ' + error.message)
    return
  }

  logKaydet('kayit_silindi',
    `Hat-${k?.hatlar?.hat_no ?? '?'} kaydı silindi${k?.ilac_gubre_notu ? ' (' + k.ilac_gubre_notu + ')' : ''}`,
    aktifBolge.id)
  render()
}

// ── ÇEVRİMDIŞI KUYRUK ──
// Rozet tam yeniden çizim beklemeden tazelenir (kuyruk arka planda boşalır)
window.addEventListener('kuyruk-degisti', (e) => {
  bekleyenKayit = e.detail?.adet ?? 0
  const yuva = document.getElementById('kuyruk-rozet-yuvasi')
  if (yuva) yuva.innerHTML = kuyrukRozetiHTML(bekleyenKayit)
  const panel = document.getElementById('kuyruk-panel')
  if (panel) window.kuyrukPaneliAc()   // panel açıksa içeriğini de tazele
})

window.kuyrukPaneliAc = async () => {
  const ogeler = (await kuyrukListesi())
    .sort((a, b) => String(a.olusturma).localeCompare(String(b.olusturma)))
  const takilanlar = takiliOgeler(ogeler)

  const satirlar = ogeler.length === 0
    ? '<div class="kuyruk-bos">✓ Bekleyen kayıt yok.</div>'
    : ogeler.map(o => {
        const z = new Date(o.olusturma)
        const takili = takilanlar.some(t => t.id === o.id)
        return `
          <div class="kuyruk-satir ${takili ? 'takili' : ''}">
            <div>
              <b>${o.etiket || 'Veri girişi'}</b>
              <span class="kuyruk-kucuk">${z.toLocaleDateString('tr-TR')} ${z.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              <div class="kuyruk-kucuk">
                ${o.foto ? '📷 fotoğraf · ' : ''}${o.gubreler?.length ? o.gubreler.length + ' gübre satırı · ' : ''}${o.veri?.ilac_gubre_notu ? 'not var' : 'not yok'}
              </div>
              ${o.deneme ? `<div class="kuyruk-hata">${o.deneme} deneme — ${o.sonHata || 'bilinmeyen hata'}</div>` : ''}
              ${takili ? '<div class="kuyruk-hata">⚠ Uzun süredir gönderilemiyor</div>' : ''}
            </div>
            <button class="kuyruk-sil" onclick="kuyrukOgeSil('${o.id}')" title="Bu kaydı sil">🗑</button>
          </div>
        `
      }).join('')

  document.getElementById('kuyruk-panel')?.remove()
  document.body.insertAdjacentHTML('beforeend', `
    <div id="kuyruk-panel" class="kuyruk-panel-katman" onclick="if(event.target===this) this.remove()">
      <div class="kuyruk-panel">
        <div class="kuyruk-panel-ust">
          <b>📴 Gönderilmeyi bekleyen kayıtlar (${ogeler.length})</b>
          <button class="kurulum-mini" onclick="document.getElementById('kuyruk-panel').remove()">✕</button>
        </div>
        <div class="kuyruk-ipucu">
          Bunlar cihazınızda saklanıyor. Sinyal gelince otomatik gönderilir;
          uygulamayı kapatsanız da kaybolmaz.
        </div>
        ${takilanlar.length ? `<div class="kuyruk-uyari">⚠ ${takilanlar.length} kayıt uzun süredir gönderilemiyor. Bağlantınızı kontrol edin.</div>` : ''}
        ${satirlar}
        <div class="kuyruk-panel-alt">
          <button class="kurulum-btn kurulum-btn-kucuk" onclick="kuyrukSimdiGonder(this)"
                  ${(!navigator.onLine || ogeler.length === 0) ? 'disabled' : ''}>
            ${navigator.onLine ? '⬆ Şimdi gönder' : 'Çevrimdışı'}
          </button>
        </div>
      </div>
    </div>
  `)
}

window.kuyrukSimdiGonder = async (btn) => {
  btn.disabled = true
  btn.textContent = 'Gönderiliyor...'
  const ozet = await senkronBaslat({ hepsiniDene: true })
  btn.textContent = ozet.kesildi ? 'Bağlantı kesildi' : '⬆ Şimdi gönder'
  btn.disabled = false
  window.kuyrukPaneliAc()
}

window.kuyrukOgeSil = async (id) => {
  if (!confirm('Bu bekleyen kayıt silinsin mi?\nCihazdan kalıcı olarak kaldırılır, sisteme gönderilmez.')) return
  await kuyruktanSil(id)
  window.kuyrukPaneliAc()
}

// ── KURULUM SİHİRBAZI (yalnızca yönetici) ──
window.kurulumAc = async () => {
  if (aktifRol() !== 'yonetici') return
  kurulumAcik = true
  if (sayacInterval) clearInterval(sayacInterval)

  await kurulumEkraniAc({
    bolgeId: aktifBolge?.id,
    // Panele dönüşte bölge listesi yeniden okunur (yeni bölge eklenmiş olabilir)
    geriDon: () => {
      kurulumAcik = false
      uygulamaBaslat()
    }
  })
}

window.bolgeDegistir = (bolgeId) => {
  const yeni = bolgeler.find(b => b.id === bolgeId)
  if (!yeni) return
  aktifBolge = yeni
  localStorage.setItem('secili_bolge_id', bolgeId)
  render()
}

window.addEventListener('DOMContentLoaded', () => {
  // Çevrimdışı kuyruk: online/offline dinleyicileri + bekleyenleri gönder
  offlineBaslat()
  kuyrukSayisi().then(n => { bekleyenKayit = n })
  uygulamaBaslat()
})

// Gömülü geliştirici imzası (konsolda, build sonrasında da kalıcı)
console.info('%c🌾 Sulama Takip — developed by Ömer Faruk Yıldız (manco)',
  'color:#5dade2; font-size:11px;')

// ── PWA: Service Worker kaydı ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e =>
      console.error('Service worker kaydedilemedi:', e)
    )
  })
}
