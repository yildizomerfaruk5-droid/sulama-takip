import './style.css'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla } from './hatlar.js'
import { supabase } from './supabase.js'

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

  app.innerHTML = `
    <div class="container">
      ${header()}
      ${duruBanner(durum)}
      ${butonlar(durum)}
      <div class="zona-grid">
        ${zonalar.map(zona => zonaKart(zona, durum, tamamlananlar)).join('')}
      </div>
    </div>
  `
}

// ── HEADER ──
function header() {
  return `
    <div class="header">
      <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
      <div class="meta">${new Date().toLocaleDateString('tr-TR', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
      })}</div>
    </div>
  `
}

// ── DURUM BANNER ──
function duruBanner(durum) {
  const acik = durum?.sistem_acik
  return `
    <div class="durum-banner">
      <span class="label">Sistem Durumu:</span>
      <span class="value" style="color: ${acik ? '#26de81' : '#ff4757'}">
        ${acik ? '● AKTİF' : '● KAPALI'}
      </span>
      ${acik ? `
        <span class="label">Aktif Tur:</span>
        <span class="value">Bilgi yükleniyor...</span>
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
window.hatTikla = (hatId) => {
  console.log('Hat tıklandı:', hatId)
  // Pop-up ileride eklenecek
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

  // Mevcut aktif ve sıradaki hatları getir
  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no, hat_no')
    .order('sira_no')

  const siradakiHat = tumHatlar.find(h => h.id === sistemDurumu.siradaki_hat_id)
  if (!siradakiHat) return

  // Aynı zonadaki bir sonraki hat
  const ayniZonaHatlar = tumHatlar.filter(h => h.zona_id === siradakiHat.zona_id)
  const siradakiIndex = ayniZonaHatlar.findIndex(h => h.id === siradakiHat.id)
  const yeniSiradaki = ayniZonaHatlar[siradakiIndex + 1] || null

  // Mevcut aktif hattı tamamlandı olarak kaydet
  await supabase
    .from('sulama_kayitlari')
    .insert({
      hat_id: sistemDurumu.aktif_hat_id,
      tur_id: sistemDurumu.aktif_tur_id,
      baslangic_zamani: new Date().toISOString(),
      bitis_zamani: new Date().toISOString(),
      durum: 'tamamlandi'
    })

  // Sistem durumunu güncelle
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
render()