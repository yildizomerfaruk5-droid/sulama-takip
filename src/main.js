import './style.css'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, sayacFormatla, calisanHatPaneliHTML } from './hatlar.js'
import { supabase } from './supabase.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { viewerRender, viewerRealtimeBaslat } from './viewer.js'
import { popupHTML, popupEventleriEkle } from './popup.js'
import { girisYap, cikisYap, mevcutKullanici, loginHTML, girisGecmisiniGetir, girisGecmisiHTML } from './auth.js'
import { haritaOlustur, hatlariHaritayaCiz, koordinatSeciciBaslat, vanalariHaritayaCiz } from './harita.js'
import { bolgeleriGetir, profilGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import { pwaBaslat } from './pwa.js'
import { ROL_SEKMELERI, sekmeCubuguHTML, panelHTML, sekmeDegistir, sekmeDogrula } from './kabuk.js'
import { sulamaBaslat, sulamaKapat, hatIlerlet } from './sulama.js'
import { isciRender, isciRealtimeBaslat } from './isci.js'


let sayacInterval = null

let sistemDurumu = null
let profil = null      // giriş yapan kullanıcının profili (rol + bölge)
let bolgeler = []      // kullanıcının erişebildiği bölgeler
let aktifBolge = null  // seçili bölge

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
  const rol = profil?.rol || 'yonetici'
  const sekmeler = ROL_SEKMELERI[rol] || ROL_SEKMELERI.yonetici
  sekmeDogrula(sekmeler)

  app.innerHTML = `
    <div class="uygulama">
      ${header()}
      <main class="icerik">
        <div class="container">
          ${panelHTML('simdi', `
            ${duruBanner(durum, turBilgisi)}
            ${calisanPanel}
            ${butonlar(durum)}
            <div class="gecmis-baslik">📸 Foto Galerisi (hat ve su sırasına göre)</div>
            <div id="galeri-liste">Yükleniyor...</div>
          `)}

          ${panelHTML('harita', '<div id="harita"></div>')}

          ${panelHTML('hatlar', `
            <div class="zona-grid">
              ${zonalar.map(zona => zonaKart(zona, durum, tamamlananlar)).join('')}
            </div>
          `)}

          ${panelHTML('gecmis', `
            <div class="gecmis-baslik">📋 Geçmiş Kayıtlar</div>
            <div id="gecmis-liste">Yükleniyor...</div>
            <div class="gecmis-baslik">🔐 Giriş Geçmişi</div>
            <div id="giris-gecmisi-liste">Yükleniyor...</div>
          `)}

          ${panelHTML('istatistik', `
            <div id="istatistik-bolum">${istatistikHTML()}</div>
          `)}
        </div>
      </main>
      ${sekmeCubuguHTML(sekmeler)}
    </div>
  `

  const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita', aktifBolge)
    hatlariHaritayaCiz(sistemDurumu, tamamlananlar, aktifBolge.id)
    vanalariHaritayaCiz(aktifBolge.id, sistemDurumu, tamamlananlar)
    koordinatSeciciBaslat()
  }

  gecmisKayitlariGetir(aktifBolge.id).then(kayitlar => {
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  girisGecmisiniGetir().then(kayitlar => {
    const el = document.getElementById('giris-gecmisi-liste')
    if (el) el.innerHTML = girisGecmisiHTML(kayitlar)
  })

  galeriKayitlariGetir(aktifBolge.id).then(kayitlar => {
    const el = document.getElementById('galeri-liste')
    if (el) el.innerHTML = galeriHTML(kayitlar)
  })

  istatistikVerileriGetir(aktifBolge.id).then(veri => istatistikCiz(veri))

  // Sayacı başlat
  if (sistemDurumu?.sistem_acik) {
    sayaciBaslat()
  } else {
    if (sayacInterval) clearInterval(sayacInterval)
  }
}



// ── BÖLGE SEÇİCİ ──
function bolgeSecici() {
  // Tek bölge varsa (veya denetleyici kilitliyse) sadece adı göster
  if (bolgeler.length <= 1) {
    return `<div class="meta" style="color:#5dade2;">📍 ${aktifBolge?.ad || ''}</div>`
  }
  return `
    <select onchange="bolgeDegistir(this.value)" style="
      min-height: 44px;
      max-width: 140px;
      padding: 6px 10px;
      background: #0f1923;
      border: 1px solid #2c3e50;
      border-radius: 8px;
      color: #5dade2;
      font-size: 13px;
      cursor: pointer;
    ">
      ${bolgeler.map(b => `
        <option value="${b.id}" ${b.id === aktifBolge?.id ? 'selected' : ''}>📍 ${b.ad}</option>
      `).join('')}
    </select>
  `
}

// ── HEADER ──
function header() {
  return `
    <header class="header">
      <h1>🌾 SULAMA TAKİP</h1>
      <div class="header-sag">
        ${bolgeSecici()}
        <div class="meta meta-tarih">${new Date().toLocaleDateString('tr-TR', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}</div>
        <button
          onclick="cikisYap()"
          style="
            min-height: 44px;
            padding: 6px 14px;
            background: transparent;
            border: 1px solid #2c3e50;
            border-radius: 8px;
            color: #7f8c8d;
            font-size: 13px;
            cursor: pointer;
          "
        >Çıkış</button>
      </div>
    </header>
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
  // Denetleyici izler, mudahale etmez — kontrol butonlarini hic gormez
  if (profil?.rol === 'denetleyici') return ''

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
window.sekmeDegistir = sekmeDegistir

window.hatTikla = async (hatId) => {
  // Denetleyici kayit giremez; hatta dokunmasi bir sey acmaz
  if (profil?.rol === 'denetleyici') return

  const { data: hat } = await supabase
    .from('hatlar')
    .select('*')
    .eq('id', hatId)
    .single()

  document.body.insertAdjacentHTML('beforeend', popupHTML(hat))
  popupEventleriEkle(hatId, sistemDurumu?.aktif_tur_id)
}

window.sistemiBaslat = async () => {
  const { sonuc } = await sulamaBaslat(aktifBolge.id, (turNo) =>
    confirm(`${turNo}. Su başlatılacak. Onaylıyor musunuz?`)
  )

  if (sonuc === 'zona_yok') return alert('Bu bölgede zona tanımlı değil.')
  if (sonuc === 'hat_yok') return alert('Hat bulunamadı.')
  if (sonuc === 'iptal') return

  render()
}

window.sistemiKapat = async () => {
  if (!confirm('Sistemi kapatmak istediğinizden emin misiniz?')) return
  await sulamaKapat(aktifBolge.id)
  render()
}

window.hatAtla = async () => {
  const sonuc = await hatIlerlet(aktifBolge.id, sistemDurumu)

  if (sonuc.sonuc === 'zona_gecildi') {
    alert(`✅ ${sonuc.bitenZona} tamamlandı! ${sonuc.yeniZona} başlıyor.`)
  } else if (sonuc.sonuc === 'tur_bitti') {
    alert(`🎉 Tüm zonalar tamamlandı! ${sonuc.turNo}. Su bitti.\nYeni tur için "Sulamayı Başlat" butonunu kullanın.`)
  }

  // 'baskasi_yapti': gecisi baska bir cihaz ustlendi — realtime zaten render tetikler
  if (sonuc.sonuc !== 'baskasi_yapti') render()
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
  render()
}



// ── REALTIME ──
supabase
  .channel('sistem_durumu')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'sistem_durumu'
  }, () => render())
  .subscribe()

// ── SAYAÇ ──
async function sayaciBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)

  // Hattın süresini bir kez al. Her saniye sorgulamak mobilde boşuna veri ve
  // pil harcar; süre değişirse render() sayacı zaten yeniden kurar.
  const { data: aktifHat } = await supabase
    .from('hatlar')
    .select('varsayilan_sure_dk')
    .eq('id', sistemDurumu.aktif_hat_id)
    .single()

  const limitMs = (aktifHat?.varsayilan_sure_dk || 0) * 60 * 1000

  sayacInterval = setInterval(() => {
    if (!sistemDurumu?.sistem_acik || !sistemDurumu?.aktif_hat_id) {
      clearInterval(sayacInterval)
      return
    }

    // Başlangıç veritabanından gelir — her cihazda aynı sayaç görünür
    const baslama = sistemDurumu.aktif_hat_baslangic
    if (!baslama) return

    const gecenMs = Date.now() - new Date(baslama).getTime()
    const sayacMetni = sayacFormatla(gecenMs)

    const el = document.getElementById(`sayac-${sistemDurumu.aktif_hat_id}`)
    if (el) el.textContent = `⏱ ${sayacMetni}`

    const panelEl = document.getElementById('panel-sayac')
    if (panelEl) panelEl.textContent = sayacMetni

    // Süre dolunca otomatik geçiş
    if (limitMs > 0 && gecenMs >= limitMs) {
      clearInterval(sayacInterval)
      window.hatAtla()
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

async function uygulamaBaslat() {
  if (window.location.search.includes('viewer')) {
    viewerRealtimeBaslat()
    await viewerRender()
    return
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

  bolgeler = await bolgeleriGetir()

  // İşçi kendi sahada kullandığı ekrana gider — bölge seçemez, profiline
  // atanmış bölgede çalışır
  if (rol === 'isci') {
    const isciBolge = bolgeler.find(b => b.id === profil?.bolge_id) || null
    isciRealtimeBaslat()
    await isciRender(isciBolge)
    return
  }

  // Denetleyici sadece kendi bölgesini görür
  if (rol === 'denetleyici' && profil?.bolge_id) {
    bolgeler = bolgeler.filter(b => b.id === profil.bolge_id)
  }

  const kayitliBolgeId = localStorage.getItem('secili_bolge_id')
  aktifBolge = bolgeler.find(b => b.id === kayitliBolgeId) || bolgeler[0] || null

  render()
}

window.bolgeDegistir = (bolgeId) => {
  const yeni = bolgeler.find(b => b.id === bolgeId)
  if (!yeni) return
  aktifBolge = yeni
  localStorage.setItem('secili_bolge_id', bolgeId)
  render()
}

window.addEventListener('DOMContentLoaded', () => {
  // Kabuk giristen bagimsiz: viewer ve login ekraninda da kurulabilir/cevrimdisi calisir
  pwaBaslat()
  uygulamaBaslat()
})
