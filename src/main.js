import './style.css'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla } from './hatlar.js'
import { supabase } from './supabase.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { viewerRender, viewerRealtimeBaslat } from './viewer.js'
import { popupHTML, popupEventleriEkle } from './popup.js'
import { girisYap, cikisYap, mevcutKullanici, loginHTML, girisGecmisiniGetir, girisGecmisiHTML } from './auth.js'
import { haritaOlustur, hatlariHaritayaCiz, koordinatSeciciBaslat } from './harita.js'


let sayacInterval = null

let sistemDurumu = null

// ── RENDER ──
async function render() {
  const app = document.querySelector('#app')
  app.innerHTML = '<div class="loading">Yükleniyor...</div>'

  const [zonalar, durum] = await Promise.all([
    zonaVeHatlariGetir(),
    sistemDurumuGetir()
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

  app.innerHTML = `
    <div class="container">
      ${header()}
      ${duruBanner(durum, turBilgisi)}
      ${butonlar(durum)}
      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>
      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>
      <div class="zona-grid">
        ${zonalar.map(zona => zonaKart(zona, durum, tamamlananlar)).join('')}
      </div>
      
      <div class="gecmis-baslik">🔐 Giriş Geçmişi</div>
      <div id="giris-gecmisi-liste">Yükleniyor...</div>
      <div id="gecmis-liste">Yükleniyor...</div>
    </div>
  `

  gecmisKayitlariGetir().then(kayitlar => {
    const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita')
    hatlariHaritayaCiz(sistemDurumu, tamamlananlar)
    koordinatSeciciBaslat()
  }
  girisGecmisiniGetir().then(kayitlar => {
    const el = document.getElementById('giris-gecmisi-liste')
    if (el) el.innerHTML = girisGecmisiHTML(kayitlar)
  })
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  // Sayacı başlat
  if (sistemDurumu?.sistem_acik) {
    sayaciBaslat()
  } else {
    if (sayacInterval) clearInterval(sayacInterval)
  }
}



// ── HEADER ──
function header() {
  return `
    <div class="header">
      <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
      <div style="display:flex; align-items:center; gap:16px;">
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
  // Zona 1'in ilk iki hatını getir
  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no')
    .order('sira_no')

  // İlk zona'nın hatlarını filtrele
  const ilkZonaId = tumHatlar[0]?.zona_id
  const hatlar = tumHatlar.filter(h => h.zona_id === ilkZonaId)

  if (!hatlar || hatlar.length === 0) {
    alert('Hat bulunamadı.')
    return
  }

  const aktifHat = hatlar[0]
  const siradakiHat = hatlar[1] || null

  // Yeni tur oluştur
  const { data: tur } = await supabase
    .from('turlar')
    .insert({
      zona_id: aktifHat.zona_id,
      tur_no: 1,
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
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('id', 1)

  render()
}

window.sistemiKapat = async () => {
  const onay = confirm('Sistemi kapatmak istediğinizden emin misiniz?')
  if (!onay) return

  await supabase
    .from('sistem_durumu')
    .update({ 
      sistem_acik: false, 
      aktif_hat_id: null, 
      siradaki_hat_id: null,
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('id', 1)

  render()
}

window.hatAtla = async () => {
  if (!sistemDurumu?.sistem_acik) return

  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no, hat_no')
    .order('sira_no')

  const siradakiHat = tumHatlar.find(h => h.id === sistemDurumu.siradaki_hat_id)
  
  // Mevcut aktif hattı tamamlandı kaydet
  localStorage.removeItem(`hat_baslama_${sistemDurumu.aktif_hat_id}`)
  
  await supabase
    .from('sulama_kayitlari')
    .insert({
      hat_id: sistemDurumu.aktif_hat_id,
      tur_id: sistemDurumu.aktif_tur_id,
      baslangic_zamani: new Date().toISOString(),
      bitis_zamani: new Date().toISOString(),
      durum: 'tamamlandi'
    })

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
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('id', 1)

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
    // Tüm hatlar - id'leri tek tek güncelle
    const { data: tumHatlar } = await supabase
      .from('hatlar')
      .select('id')

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

async function turTamamla() {
  if (sayacInterval) clearInterval(sayacInterval)

  // Aktif zonayı bul, sıradaki zonaya geç
  const { data: zonalar } = await supabase
    .from('zonalar')
    .select('*')
    .order('sira_no')

  const aktifZona = zonalar.find(z => z.id === sistemDurumu.aktif_zona_id)
  const siradakiZona = zonalar.find(z => z.sira_no === aktifZona.sira_no + 1)

  if (siradakiZona) {
    // Zona 2'ye geç
    const { data: zonaHatlari } = await supabase
      .from('hatlar')
      .select('id, zona_id, sira_no')
      .eq('zona_id', siradakiZona.id)
      .order('sira_no')

    const yeniAktif = zonaHatlari[0]
    const yeniSiradaki = zonaHatlari[1] || null

    // Yeni tur oluştur
    const { data: yeniTur } = await supabase
      .from('turlar')
      .insert({
        zona_id: siradakiZona.id,
        tur_no: 1,
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
        guncelleme_zamani: new Date().toISOString()
      })
      .eq('id', 1)

    alert(`✅ Zona 1 tamamlandı! Zona 2 - Doğu Blok başlıyor.`)
    render()

  } else {
    // Tüm zonalar bitti
    await supabase
      .from('turlar')
      .update({
        bitis_zamani: new Date().toISOString(),
        durum: 'tamamlandi'
      })
      .eq('id', sistemDurumu.aktif_tur_id)

    await supabase
      .from('sistem_durumu')
      .update({
        sistem_acik: false,
        aktif_hat_id: null,
        siradaki_hat_id: null,
        aktif_tur_id: null,
        aktif_zona_id: null,
        guncelleme_zamani: new Date().toISOString()
      })
      .eq('id', 1)

    Object.keys(localStorage)
      .filter(k => k.startsWith('hat_baslama_'))
      .forEach(k => localStorage.removeItem(k))

    alert('🎉 Tüm zonalar tamamlandı! 1. Su bitti.')
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

// ── BAŞLAT ──
function sayaciBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)
  
  sayacInterval = setInterval(async () => {
    if (!sistemDurumu?.sistem_acik || !sistemDurumu?.aktif_hat_id) {
      clearInterval(sayacInterval)
      return
    }

    const el = document.getElementById(`sayac-${sistemDurumu.aktif_hat_id}`)
    if (!el) return

    const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
    let baslama = localStorage.getItem(baslamaKey)
    
    if (!baslama) {
      baslama = new Date().toISOString()
      localStorage.setItem(baslamaKey, baslama)
    }

    const gecenMs = Date.now() - new Date(baslama).getTime()
    const gecenSn = Math.floor(gecenMs / 1000)
    const saat = Math.floor(gecenSn / 3600)
    const dakika = Math.floor((gecenSn % 3600) / 60)
    const saniye = gecenSn % 60

    el.textContent = `⏱ ${String(saat).padStart(2,'0')}:${String(dakika).padStart(2,'0')}:${String(saniye).padStart(2,'0')}`

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

  render()
}

window.cikisYap = async () => {
  await cikisYap()
  document.querySelector('#app').innerHTML = loginHTML()
}

async function uygulamaBaslat() {
  console.log('URL search:', window.location.search)
  console.log('viewer var mı:', window.location.search.includes('viewer'))
  
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

  render()
}

window.addEventListener('DOMContentLoaded', () => {
  uygulamaBaslat()
})