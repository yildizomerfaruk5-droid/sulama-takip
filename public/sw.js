// Sulama Takip — Service Worker
// Strateji: uygulama kabugu icin network-first (guncel kalir),
// CDN varliklari icin cache-first (hizli acilir).
// Supabase API istekleri ASLA onbellege alinmaz (canli veri).

const SURUM = 'sulama-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(adlar =>
      Promise.all(adlar.filter(ad => ad !== SURUM).map(ad => caches.delete(ad)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Canli veri ve kimlik istekleri: dokunma
  if (e.request.method !== 'GET') return
  if (!url.protocol.startsWith('http')) return // tarayici eklentisi vb. istekler
  if (url.hostname.includes('supabase.co')) return
  if (url.hostname.includes('google.com')) return // uydu tile'lari buyuk, tarayici onbellegine birak

  // Uygulama kabugu (ayni origin): network-first, cevrimdisi ise onbellekten
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(cevap => {
          const kopya = cevap.clone()
          caches.open(SURUM).then(c => c.put(e.request, kopya))
          return cevap
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // CDN varliklari (leaflet css, chart.js): cache-first
  e.respondWith(
    caches.match(e.request).then(bulunan =>
      bulunan || fetch(e.request).then(cevap => {
        const kopya = cevap.clone()
        caches.open(SURUM).then(c => c.put(e.request, kopya))
        return cevap
      })
    )
  )
})
