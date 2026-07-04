import L from 'leaflet'
import { supabase } from './supabase.js'
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />import { supabase } from './supabase.js'

let harita = null

export function haritaOlustur(elementId) {
  if (harita) {
    harita.remove()
    harita = null
  }

  // Tarlanın merkez koordinatı (Tomarza/Kayseri bölgesi)
  // Gerçek koordinatlar hat verileri gelince güncellenecek
  harita = L.map(elementId, {
    center: [38.6295458, 36.2450411],
    zoom: 16,
    zoomControl: true
  })

  // Uydu görüntüsü katmanı
  L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Google Satellite',
    maxZoom: 21
  }).addTo(harita)

  // 119/6 parseli
  L.polygon([
    [38.630709, 36.244776],
    [38.631531, 36.247061],
    [38.631723, 36.246793],
    [38.631329, 36.246064],
    [38.632997, 36.244454],
    [38.632536, 36.243746],
    [38.631774, 36.244433],
    [38.630988, 36.245066],
    [38.630948, 36.244701],
  ], {
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.3,
    weight: 2
  }).bindPopup('119/6 — 66.944 m²').addTo(harita)
  return harita
}

export async function hatlariHaritayaCiz(sistemDurumu, tamamlananlar = []) {
  if (!harita) return

  const { data: hatlar } = await supabase
    .from('hatlar')
    .select('*, zonalar(ad)')
    .not('baslangic_lat', 'is', null)
    .order('sira_no')

  if (!hatlar || hatlar.length === 0) return

  hatlar.forEach(hat => {
    const renk = hatRengiGetir(hat, sistemDurumu, tamamlananlar)
    
    if (!hat.baslangic_lat || !hat.bitis_lat) return

    const baslangic = [hat.baslangic_lat, hat.baslangic_lng]
    const bitis = [hat.bitis_lat, hat.bitis_lng]
    const serit = seritOlustur(baslangic, bitis, 0.00006)

    L.polygon(serit, {
      color: renk,
      fillColor: renk,
      fillOpacity: renk === '#3d3d3d' ? 0.3 : 0.5,
      weight: 2
    })
    .bindPopup(`
      <b>Hat-${hat.hat_no}</b><br>
      Parsel: ${hat.parsel_bilgisi || '-'}<br>
      Zona: ${hat.zonalar?.ad || '-'}<br>
      Fıskiye: ${hat.fiskiye_sayisi || '-'}
    `)
    .addTo(harita)
  })
}

function hatRengiGetir(hat, sistemDurumu, tamamlananlar) {
  if (tamamlananlar.includes(hat.id)) return '#26de81'
  if (!sistemDurumu?.sistem_acik) return '#3d3d3d'
  if (hat.id === sistemDurumu.aktif_hat_id) return '#2e86de'
  if (hat.id === sistemDurumu.siradaki_hat_id) return '#f9ca24'
  return '#3d3d3d'
}

function seritOlustur(baslangic, bitis, genislik) {
  const dy = bitis[0] - baslangic[0]
  const dx = bitis[1] - baslangic[1]
  const uzunluk = Math.sqrt(dx * dx + dy * dy)
  const nx = (-dy / uzunluk) * genislik
  const ny = (dx / uzunluk) * genislik

  return [
    [baslangic[0] + nx, baslangic[1] + ny],
    [bitis[0] + nx, bitis[1] + ny],
    [bitis[0] - nx, bitis[1] - ny],
    [baslangic[0] - nx, baslangic[1] - ny],
  ]
}

export function koordinatSeciciBaslat() {
  if (!harita) return

  harita.on('click', (e) => {
    const { lat, lng } = e.latlng
    console.log(`Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    
    L.marker([lat, lng])
      .addTo(harita)
      .bindPopup(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      .openPopup()
  })
}