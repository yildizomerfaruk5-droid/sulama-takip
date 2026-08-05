import { supabase } from './supabase.js'
import { zonaVeHatlariGetir, sistemDurumuGetir, hatDurumuBelirle, sureyiFormatla, calisanHatPaneliHTML } from './hatlar.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { haritaOlustur, hatlariHaritayaCiz, vanalariHaritayaCiz } from './harita.js'
import { bolgeleriGetir } from './bolge.js'
import { galeriKayitlariGetir, galeriHTML } from './galeri.js'
import { istatistikVerileriGetir, istatistikHTML, istatistikCiz } from './istatistik.js'
import {
  izleyicileriGetir, izleyiciKimligi, izleyiciKimligiKaydet, izleyiciKimligiSil
} from './izleyici.js'

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

async function ziyaretKaydet(bolgeId) {
  try {
    if (sessionStorage.getItem('ziyaret_loglandi')) return
    sessionStorage.setItem('ziyaret_loglandi', '1')
    // Kimlik henüz seçilmemişse null gider — eski (anonim) davranış
    await supabase.from('ziyaretci_loglari').insert({
      bolge_id: bolgeId || null,
      izleyici_id: izleyiciKimligi()?.id || null,
      cihaz: navigator.userAgent.substring(0, 250)
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
        font-size:11.5px; color:#7f8c8d; padding:2px 2px 10px;
      ">
        <span>Ben: <strong style="color:#bdc3c7; font-weight:600;">${kimlik.ad}</strong></span>
        <a href="#" id="izleyici-degistir" style="color:#5dade2; text-decoration:none;">değiştir</a>
      </div>
    `
  }

  const secenekler = izleyiciler.map(i => `
    <button type="button" class="izleyici-sec" data-id="${i.id}" data-ad="${i.ad}" style="
      padding:7px 12px; background:#0f1923; border:1px solid #2c3e50;
      border-radius:6px; color:#e0e0e0; font-size:13px; cursor:pointer;
    ">${i.ad}</button>
  `).join('')

  return `
    <div id="izleyici-serit" style="
      background:#16222e; border:1px solid #2c3e50; border-radius:8px;
      padding:10px 12px; margin-bottom:14px;
    ">
      <div style="color:#bdc3c7; font-size:12.5px; margin-bottom:8px;">
        👋 Sen kimsin? (kayıtlarda görünsün diye — bir kez sorulur)
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${secenekler}
        <button type="button" class="izleyici-sec" data-id="" data-ad="Bilmiyorum" style="
          padding:7px 12px; background:transparent; border:1px dashed #2c3e50;
          border-radius:6px; color:#7f8c8d; font-size:13px; cursor:pointer;
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

  const calisanPanel = await calisanHatPaneliHTML(durum)

  app.innerHTML = `
    <div class="container">
      <div class="header">
        <h1>🌾 SULAMA TAKİP SİSTEMİ</h1>
        <div style="display:flex; align-items:center; gap:16px;">
          ${bolge ? `<div class="meta" style="color:#5dade2;">📍 ${bolge.ad}</div>` : ''}
          <a href="/" onclick="localStorage.removeItem('goruntuleme_modu')" style="
            color: #7f8c8d;
            font-size: 11px;
            text-decoration: none;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            padding: 4px 10px;
          ">🔑 Yönetici</a>
          <div class="meta">${new Date().toLocaleDateString('tr-TR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}</div>
        </div>
      </div>

      ${kimlikSeriti(izleyiciler)}

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

      <div id="harita" style="height:400px; border-radius:8px; margin-bottom:24px; border:1px solid #2c3e50;"></div>

      <div class="zona-grid">
        ${zonalar.map(zona => viewerZonaKart(zona, durum, tamamlananlar)).join('')}
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

      <div style="text-align:center; color:#2f4156; font-size:10px; padding:20px 0 10px; letter-spacing:0.4px;">
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

  istatistikVerileriGetir(bolge?.id).then(veri => istatistikCiz(veri))

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
