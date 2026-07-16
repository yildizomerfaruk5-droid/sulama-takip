import { supabase } from './supabase.js'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, sayacFormatla, calisanHatPaneliHTML } from './hatlar.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { haritaOlustur, hatlariHaritayaCiz, vanalariHaritayaCiz } from './harita.js'
import { bolgeleriGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import { ROL_SEKMELERI, sekmeCubuguHTML, panelHTML, sekmeDegistir, sekmeDogrula } from './kabuk.js'

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

  const calisanPanel = await calisanHatPaneliHTML(durum)

  const sekmeler = ROL_SEKMELERI.viewer
  sekmeDogrula(sekmeler)

  app.innerHTML = `
    <div class="uygulama">
      <header class="header">
        <h1>🌾 SULAMA TAKİP</h1>
        <div class="header-sag">
          ${bolge ? `<div class="meta" style="color:#5dade2;">📍 ${bolge.ad}</div>` : ''}
          <div class="meta meta-tarih">${new Date().toLocaleDateString('tr-TR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}</div>
        </div>
      </header>

      <main class="icerik">
        <div class="container">
          ${panelHTML('simdi', `
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

            ${calisanPanel}

            <div class="zona-grid">
              ${zonalar.map(zona => viewerZonaKart(zona, durum, tamamlananlar)).join('')}
            </div>
          `)}

          ${panelHTML('harita', '<div id="harita"></div>')}

          ${panelHTML('gecmis', `
            <div class="gecmis-baslik">📋 Geçmiş Kayıtlar</div>
            <div id="gecmis-liste">Yükleniyor...</div>

            <div class="gecmis-baslik">📸 Foto Galerisi (hat ve su sırasına göre)</div>
            <div id="galeri-liste">Yükleniyor...</div>

            <div class="gecmis-baslik">📊 İstatistikler</div>
            <div id="istatistik-bolum">${istatistikHTML()}</div>
          `)}
        </div>
      </main>
      ${sekmeCubuguHTML(sekmeler)}
    </div>
  `

  const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita', bolge)
    hatlariHaritayaCiz(sistemDurumu, tamamlananlar, bolge?.id)
    vanalariHaritayaCiz(bolge?.id, sistemDurumu, tamamlananlar)
  }

  gecmisKayitlariGetir(bolge?.id).then(kayitlar => {
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  galeriKayitlariGetir(bolge?.id).then(kayitlar => {
    const el = document.getElementById('galeri-liste')
    if (el) el.innerHTML = galeriHTML(kayitlar)
  })

  istatistikVerileriGetir(bolge?.id).then(veri => istatistikCiz(veri))

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

    // Başlangıç veritabanından gelir — görüntüleyici de aynı sayacı görür.
    // Viewer salt okunurdur: eksik başlangıç yazmaz, otomatik geçiş tetiklemez.
    const baslama = sistemDurumu.aktif_hat_baslangic
    if (!baslama) return

    const sayacMetni = sayacFormatla(Date.now() - new Date(baslama).getTime())

    const el = document.getElementById(`vsayac-${sistemDurumu.aktif_hat_id}`)
    if (el) el.textContent = `⏱ ${sayacMetni}`

    const panelEl = document.getElementById('panel-sayac')
    if (panelEl) panelEl.textContent = sayacMetni
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
