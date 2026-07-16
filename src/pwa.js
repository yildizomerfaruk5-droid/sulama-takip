// ============================================================
// PWA KABUGU: service worker kaydi, "ana ekrana ekle" istemi,
// cevrimdisi gostergesi.
// ============================================================

const iosMu = /iphone|ipad|ipod/i.test(navigator.userAgent)

// Uygulama ana ekrandan mi acildi? (iOS eski navigator.standalone bayragini kullanir)
function ayaktaMi() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         navigator.standalone === true
}

// ── SERVICE WORKER ──
function swKaydet() {
  if (!('serviceWorker' in navigator)) return

  // Gelistirmede kaydetmiyoruz: onbellek Vite'in sicak yenilemesini golgeler
  // ve "neden degisiklik gorunmuyor" tuzagi yaratir.
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(hata => {
      console.error('Service worker kaydedilemedi:', hata)
    })
  })
}

// ── KURULUM ISTEMI ──
let kurulumOlayi = null

function bannerHTML(icerik) {
  return `
    <div id="pwa-banner" class="pwa-banner">
      <div class="pwa-banner-metin">${icerik}</div>
      <div class="pwa-banner-butonlar">
        ${kurulumOlayi ? '<button id="pwa-kur">Ekle</button>' : ''}
        <button id="pwa-kapat" class="pwa-banner-kapat">Kapat</button>
      </div>
    </div>
  `
}

function bannerGoster(icerik) {
  if (document.getElementById('pwa-banner')) return
  document.body.insertAdjacentHTML('beforeend', bannerHTML(icerik))

  document.getElementById('pwa-kapat').addEventListener('click', () => {
    localStorage.setItem('pwa_istem_kapatildi', '1')
    document.getElementById('pwa-banner')?.remove()
  })

  document.getElementById('pwa-kur')?.addEventListener('click', async () => {
    document.getElementById('pwa-banner')?.remove()
    if (!kurulumOlayi) return
    kurulumOlayi.prompt()
    await kurulumOlayi.userChoice
    kurulumOlayi = null  // istem tek kullanimliktir
  })
}

function kurulumIstemi() {
  if (ayaktaMi() || localStorage.getItem('pwa_istem_kapatildi')) return

  // Android/Chrome: tarayici kurulabilir oldugunda haber verir. Varsayilan
  // istemi bastirip kendi bannerimizi gosteriyoruz ki zamanlamasi bize kalsin.
  window.addEventListener('beforeinstallprompt', (olay) => {
    olay.preventDefault()
    kurulumOlayi = olay
    bannerGoster('Uygulamayi ana ekrana ekleyin — tarlada tek dokunusla acilir.')
  })

  window.addEventListener('appinstalled', () => {
    kurulumOlayi = null
    document.getElementById('pwa-banner')?.remove()
  })

  // iOS beforeinstallprompt olayini hic tetiklemez; tek yol elle yonlendirme.
  if (iosMu) {
    setTimeout(() => {
      bannerGoster('Ana ekrana eklemek icin: Paylas <b>&#8679;</b> → <b>Ana Ekrana Ekle</b>')
    }, 2000)
  }
}

// ── CEVRIMDISI GOSTERGESI ──
// Rozet <body> uzerindeki sinifla cizilir; render() #app icerigini bosaltinca
// kaybolmaz.
function cevrimdisiRozeti() {
  const guncelle = () => document.body.classList.toggle('cevrimdisi', !navigator.onLine)
  window.addEventListener('online', guncelle)
  window.addEventListener('offline', guncelle)
  guncelle()
}

export function pwaBaslat() {
  swKaydet()
  kurulumIstemi()
  cevrimdisiRozeti()
}
