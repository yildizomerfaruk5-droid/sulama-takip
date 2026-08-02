// Sulama Takip — Service Worker
//
// Amac: uygulama tarlada, sinyal yokken de ACILABILMELI.
// Onceki surum network-first idi; cevrimdisi acilista kabuk gelmiyordu.
//
// Strateji:
//   • Gezinme (HTML)      : cache-first + arka planda tazele
//                           (cevrimdisi aninda acilir, sonraki aciliste guncellenir)
//   • Ayni origin varlik  : cache-first (Vite dosya adlarini hash'ler, degismezler)
//   • CDN varliklari      : cache-first (leaflet css, chart.js)
//   • Supabase / harita tile : ASLA onbellege alinmaz (canli veri, buyuk dosya)
//
// Veri girisi kuyrugu IndexedDB'de tutulur (src/offline.js), burada degil.

const SURUM = 'sulama-v2'

// Cevrimdisi acilis icin gereken en kucuk kume
const KABUK = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SURUM)
      // Tek bir dosya 404 olursa tum kurulum dusmesin
      .then(c => Promise.allSettled(KABUK.map(y => c.add(y))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(
        adlar.filter(ad => ad !== SURUM).map(ad => caches.delete(ad))))
      .then(() => self.clients.claim())
  )
})

// Onbellege alinmayacak adresler
function atlanir(url) {
  if (!url.protocol.startsWith('http')) return true      // eklenti vb.
  if (url.hostname.includes('supabase.co')) return true  // canli veri + storage
  if (url.hostname.includes('google.com')) return true   // uydu tile'lari
  return false
}

async function onbellegeYaz(istek, cevap) {
  // Yalnizca basarili ve tam cevaplar saklanir (opaque/hatali olanlar degil)
  if (!cevap || !cevap.ok || cevap.type === 'opaque') return
  const c = await caches.open(SURUM)
  await c.put(istek, cevap.clone())
}

self.addEventListener('fetch', (e) => {
  const istek = e.request
  if (istek.method !== 'GET') return

  const url = new URL(istek.url)
  if (atlanir(url)) return

  // ── Gezinme: cache-first, arka planda tazele ──
  // Cevrimdisi aninda acilir; ag varsa yeni surum sessizce indirilir.
  if (istek.mode === 'navigate') {
    e.respondWith((async () => {
      const onbellek = await caches.open(SURUM)
      const kayitli = await onbellek.match('/index.html')

      const agdan = fetch(istek)
        .then(cevap => { onbellegeYaz('/index.html', cevap); return cevap })
        .catch(() => null)

      // Onbellekte varsa hemen ver, tazeleme arkada dursun
      if (kayitli) { e.waitUntil(agdan); return kayitli }

      // Ilk acilis: agdan gelmeli; o da yoksa kabuk denemesi
      return (await agdan) || (await onbellek.match('/')) ||
        new Response('<h1>Çevrimdışı</h1><p>Uygulama henüz önbelleğe alınmadı. ' +
                     'Bir kez internet bağlantısıyla açın.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 })
    })())
    return
  }

  // ── Varliklar (ayni origin + CDN): cache-first ──
  e.respondWith((async () => {
    const kayitli = await caches.match(istek)
    if (kayitli) return kayitli
    try {
      const cevap = await fetch(istek)
      e.waitUntil(onbellegeYaz(istek, cevap.clone()))
      return cevap
    } catch (hata) {
      // Cevrimdisi ve onbellekte yok: cagirana hata dussun
      return new Response('', { status: 504, statusText: 'Çevrimdışı' })
    }
  })())
})
