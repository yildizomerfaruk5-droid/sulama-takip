// ============================================================
// SULAMA TAKIP — SERVICE WORKER
//
// Amac: uygulamanin ana ekrandan aninda acilmasi ve sinyalin
// zayif oldugu tarlada bos ekran yerine anlamli bir sey gostermesi.
//
// ONEMLI KURAL: Supabase istekleri ONBELLEGE ALINMAZ.
// Sulama durumu onbellekten gelirse telefon "Hat-2 sulaniyor"
// gosterirken tarlada Hat-5 caliisiyor olabilir. Yanlis durum,
// durum yoklugundan daha tehlikelidir; bu yuzden veri her zaman
// agdan gelir, gelemezse arayuz cevrimdisi rozetini gosterir.
// ============================================================

const SURUM = 'v1'
const KABUK_ONBELLEK = `sulama-kabuk-${SURUM}`
const VARLIK_ONBELLEK = `sulama-varlik-${SURUM}`
const HARITA_ONBELLEK = `sulama-harita-${SURUM}`

// Harita karolari sinirsiz birikmesin (yaklasik 40-60 MB'a denk gelir)
const HARITA_KARO_SINIRI = 400

// Vite varlik adlarini derleme sirasinda hash'ler (index-D_ZVnJQH.js), bu yuzden
// burada onceden sayilamazlar — ilk ziyarette yakalanip onbellege alinirlar.
// Onceden yuklenen yalnizca sabit adli kabuk dosyalari.
const KABUK_DOSYALARI = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png'
]

const CEVRIMDISI_SAYFA = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cevrimdisi — Sulama Takip</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1923; color:#e0e0e0; font-family:Arial, sans-serif; padding:24px; }
  .kutu { text-align:center; max-width:320px; }
  h1 { color:#5dade2; font-size:18px; margin:0 0 12px; }
  p { color:#7f8c8d; font-size:14px; line-height:1.5; margin:0 0 20px; }
  button { padding:12px 24px; background:#2e86de; border:none; border-radius:8px;
           color:#fff; font-size:15px; font-weight:bold; }
</style></head>
<body><div class="kutu">
  <h1>Baglanti yok</h1>
  <p>Sulama durumu canli veridir, cevrimdisi gosterilemez.
     Sinyal geldiginde yeniden deneyin.</p>
  <button onclick="location.reload()">Yeniden dene</button>
</div></body></html>`

// ── KURULUM ──
self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches.open(KABUK_ONBELLEK)
      .then(onbellek => onbellek.addAll(KABUK_DOSYALARI))
      .then(() => self.skipWaiting())
  )
})

// ── ETKINLESTIRME: eski surumlerin onbellegini temizle ──
self.addEventListener('activate', (olay) => {
  const guncel = [KABUK_ONBELLEK, VARLIK_ONBELLEK, HARITA_ONBELLEK]
  olay.waitUntil(
    caches.keys()
      .then(adlar => Promise.all(
        adlar.filter(ad => ad.startsWith('sulama-') && !guncel.includes(ad))
             .map(ad => caches.delete(ad))
      ))
      .then(() => self.clients.claim())
  )
})

// ── YARDIMCILAR ──

// Onbellek siniri asilinca en eski kayitlari at (Cache API ekleme sirasini korur)
async function onbellegiKirp(ad, sinir) {
  const onbellek = await caches.open(ad)
  const anahtarlar = await onbellek.keys()
  if (anahtarlar.length <= sinir) return
  await Promise.all(
    anahtarlar.slice(0, anahtarlar.length - sinir).map(a => onbellek.delete(a))
  )
}

// Once onbellek: icerigi degismeyen adresler icin (hash'li varlik, surumlu CDN, harita karosu)
async function onceOnbellek(istek, onbellekAdi, sinir = null) {
  const onbellek = await caches.open(onbellekAdi)
  const eslesen = await onbellek.match(istek)
  if (eslesen) return eslesen

  const yanit = await fetch(istek)
  // Yalnizca saglam yanitlari sakla. CDN/karo yanitlari opak (status 0) gelir;
  // onlar da gecerlidir, ancak hatali olup olmadiklari anlasilamaz.
  if (yanit.ok || yanit.type === 'opaque') {
    await onbellek.put(istek, yanit.clone())
    if (sinir) onbellegiKirp(onbellekAdi, sinir)
  }
  return yanit
}

// ── ISTEK YAKALAMA ──
self.addEventListener('fetch', (olay) => {
  const istek = olay.request
  const url = new URL(istek.url)

  // Yalnizca GET onbelleklenebilir. POST/PATCH (kayit atma, durum guncelleme)
  // asla dokunulmadan gecer.
  if (istek.method !== 'GET') return

  // Supabase: veri, kimlik, storage, realtime — hepsi agdan, onbelleksiz.
  if (url.hostname.endsWith('.supabase.co')) return

  // Sayfa gezinmesi: once ag (yeni surum hemen gelsin), olmazsa onbellekteki kabuk
  if (istek.mode === 'navigate') {
    olay.respondWith(
      fetch(istek)
        .then(yanit => {
          const kopya = yanit.clone()
          caches.open(KABUK_ONBELLEK).then(o => o.put('/', kopya))
          return yanit
        })
        .catch(async () => {
          const onbellek = await caches.open(KABUK_ONBELLEK)
          return (await onbellek.match('/')) ||
            new Response(CEVRIMDISI_SAYFA, {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            })
        })
    )
    return
  }

  // Google uydu karolari: sahada ayni parseller tekrar tekrar goruntulenir,
  // onbellek hem hizlandirir hem mobil veriden tasarruf ettirir.
  if (url.hostname.includes('google.com') && url.pathname.includes('/vt')) {
    olay.respondWith(
      onceOnbellek(istek, HARITA_ONBELLEK, HARITA_KARO_SINIRI).catch(() => Response.error())
    )
    return
  }

  // Surumlu CDN dosyalari (leaflet css, chart.js) — adresleri surum icerir, degismez
  if (url.hostname === 'unpkg.com' || url.hostname === 'cdnjs.cloudflare.com') {
    olay.respondWith(onceOnbellek(istek, VARLIK_ONBELLEK).catch(() => Response.error()))
    return
  }

  // Kendi hash'li varliklarimiz (/assets/index-XXXX.js) — icerik degisirse ad da degisir
  if (url.origin === self.location.origin) {
    olay.respondWith(
      onceOnbellek(istek, VARLIK_ONBELLEK).catch(async () => {
        const onbellek = await caches.open(VARLIK_ONBELLEK)
        return (await onbellek.match(istek)) || Response.error()
      })
    )
  }
})
