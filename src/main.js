import './style.css'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, calisanHatPaneliHTML } from './hatlar.js'
import { supabase } from './supabase.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { viewerRender, viewerRealtimeBaslat } from './viewer.js'
import { popupHTML, popupEventleriEkle } from './popup.js'
import { girisYap, cikisYap, mevcutKullanici, loginHTML, girisGecmisiniGetir, girisGecmisiHTML } from './auth.js'
import { haritaOlustur, hatlariHaritayaCiz, koordinatSeciciBaslat, vanalariHaritayaCiz } from './harita.js'
import { bolgeleriGetir, profilGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import { logKaydet, loglariGetir, logHTML, ziyaretcileriGetir, ziyaretciHTML } from './log.js'
import { yedekIndir } from './yedek.js'


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

  app.innerHTML = `
    <div class="container">
      ${header()}
      ${duruBanner(durum, turBilgisi)}
      ${calisanPanel}
      ${butonlar(durum)}
      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>
      <div class="zona-grid">
        ${zonalar.map(zona => zonaKart(zona, durum, tamamlananlar)).join('')}
      </div>

      <div class="gecmis-baslik" style="display:flex; justify-content:space-between; align-items:center;">
        <span>📜 Olay Kayıtları</span>
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

      <div class="gecmis-baslik">🔐 Giriş Geçmişi</div>
      <div id="giris-gecmisi-liste">Yükleniyor...</div>

      <div class="gecmis-baslik">👁 Ziyaretçiler (misafir görüntülemeleri)</div>
      <div id="ziyaretci-liste">Yükleniyor...</div>
      <div id="gecmis-liste">Yükleniyor...</div>

      <div class="gecmis-baslik">📸 Foto Galerisi (hat ve su sırasına göre)</div>
      <div id="galeri-liste">Yükleniyor...</div>

      <div class="gecmis-baslik">📊 İstatistikler</div>
      <div id="istatistik-bolum">${istatistikHTML()}</div>
    </div>
  `

  gecmisKayitlariGetir(aktifBolge.id).then(kayitlar => {
    const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita', aktifBolge)
    hatlariHaritayaCiz(sistemDurumu, tamamlananlar, aktifBolge.id)
    vanalariHaritayaCiz(aktifBolge.id, sistemDurumu, tamamlananlar)
    koordinatSeciciBaslat()
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
function bolgeSecici() {
  // Tek bölge varsa (veya denetleyici kilitliyse) sadece adı göster
  if (bolgeler.length <= 1) {
    return `<div class="meta" style="color:#5dade2;">📍 ${aktifBolge?.ad || ''}</div>`
  }
  return `
    <select onchange="bolgeDegistir(this.value)" style="
      padding: 6px 10px;
      background: #0f1923;
      border: 1px solid #2c3e50;
      border-radius: 6px;
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
    <div class="header">
      <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
      <div style="display:flex; align-items:center; gap:16px;">
        ${bolgeSecici()}
        <div class="meta">${new Date().toLocaleDateString('tr-TR', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}</div>
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
  popupEventleriEkle(hatId, sistemDurumu?.aktif_tur_id)
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
      sure_dakika: sureDk || null,
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
function sayaciBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)

  sayacInterval = setInterval(async () => {
    if (!sistemDurumu?.sistem_acik || !sistemDurumu?.aktif_hat_id) {
      clearInterval(sayacInterval)
      return
    }

    const el = document.getElementById(`sayac-${sistemDurumu.aktif_hat_id}`)
    if (!el) return

    // Sayaç kaynağı: veritabanı (cihazlar arası tutarlı); eski kayıtlar için localStorage
    let baslama = sistemDurumu.hat_baslama_zamani
    if (!baslama) {
      const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
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

    // Süre kontrolü — aktif hattın varsayılan süresi doldu mu?
    const { data: aktifHat } = await supabase
      .from('hatlar')
      .select('varsayilan_sure_dk')
      .eq('id', sistemDurumu.aktif_hat_id)
      .single()

    if (aktifHat) {
      const limitMs = aktifHat.varsayilan_sure_dk * 60 * 1000
      if (gecenMs >= limitMs) {
        clearInterval(sayacInterval)
        localStorage.removeItem(baslamaKey)
        await hatAtla()
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

window.bolgeDegistir = (bolgeId) => {
  const yeni = bolgeler.find(b => b.id === bolgeId)
  if (!yeni) return
  aktifBolge = yeni
  localStorage.setItem('secili_bolge_id', bolgeId)
  render()
}

window.addEventListener('DOMContentLoaded', () => {
  uygulamaBaslat()
})

// ── PWA: Service Worker kaydı ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e =>
      console.error('Service worker kaydedilemedi:', e)
    )
  })
}
