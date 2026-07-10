import { supabase } from './supabase.js'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla } from './hatlar.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { haritaOlustur, hatlariHaritayaCiz } from './harita.js'
import { bolgeleriGetir } from './bolge.js'

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

export async function viewerRender() {
  const app = document.querySelector('#app')
  app.innerHTML = '<div class="loading">Yükleniyor...</div>'

  const bolge = await viewerBolgeBelirle()

  const [zonalar, durum] = await Promise.all([
    zonaVeHatlariGetir(bolge?.id),
    sistemDurumuGetir(bolge?.id)
  ])

  sistemDurumu = durum

  let tamamlananlar = []
  if (durum?.aktif_tur_id) {
    const { data } = await supabase
      .from('sulama_kayitlari')
      .select('hat_id')
      .eq('tur_id', durum.aktif_tur_id)
      .eq('durum', 'tamamlandi')
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

  app.innerHTML = `
    <div class="container">
      <div class="header">
        <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
        <div style="display:flex; align-items:center; gap:16px;">
          ${bolge ? `<div class="meta" style="color:#5dade2;">📍 ${bolge.ad}</div>` : ''}
          <div class="meta">${new Date().toLocaleDateString('tr-TR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}</div>
        </div>
      </div>

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

      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>

      <div class="zona-grid">
        ${zonalar.map(zona => viewerZonaKart(zona, durum, tamamlananlar)).join('')}
      </div>

      <div class="gecmis-baslik">📋 Geçmiş Kayıtlar</div>
      <div id="gecmis-liste">Yükleniyor...</div>
    </div>
  `

  gecmisKayitlariGetir(bolge?.id).then(kayitlar => {
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita', bolge)
    hatlariHaritayaCiz(sistemDurumu, tamamlananlar, bolge?.id)
  }

  if (acik) viewerSayacBaslat()
  else if (sayacInterval) clearInterval(sayacInterval)
}

function viewerZonaKart(zona, durum, tamamlananlar) {
  const hatlarHTML = zona.hatlar.length === 0
    ? '<div style="color:#7f8c8d; font-size:13px; padding:8px;">Henüz hat eklenmedi.</div>'
    : zona.hatlar.map(hat => viewerHatSatir(hat, durum, tamamlananlar)).join('')

  return `
    <div class="zona-card">
      <h2>${zona.ad}</h2>
      <div style="font-size:12px; color:#7f8c8d; margin-bottom:10px;">${zona.aciklama || ''}</div>
      <div class="hat-listesi">${hatlarHTML}</div>
    </div>
  `
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

    const baslamaKey = `hat_baslama_${sistemDurumu.aktif_hat_id}`
    let baslama = localStorage.getItem(baslamaKey)
    if (!baslama) {
      baslama = new Date().toISOString()
      localStorage.setItem(baslamaKey, baslama)
    }

    const gecenSn = Math.floor((Date.now() - new Date(baslama).getTime()) / 1000)
    const saat = Math.floor(gecenSn / 3600)
    const dakika = Math.floor((gecenSn % 3600) / 60)
    const saniye = gecenSn % 60

    el.textContent = `⏱ ${String(saat).padStart(2,'0')}:${String(dakika).padStart(2,'0')}:${String(saniye).padStart(2,'0')}`
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
