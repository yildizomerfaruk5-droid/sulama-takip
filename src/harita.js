import L from 'leaflet'
import { supabase } from './supabase.js'

let harita = null
let katmanlar = null

// DMS -> ondalık çevirici
function dms(deg, min, sec) { return deg + min/60 + sec/3600 }

// ── PARSEL KOORDİNATLARI (GeoJSON [lon,lat] -> Leaflet [lat,lon]) ──
const PARSELLER = [
  {
    id: "114/20", alan: "29,446.94 m²",
    coords: [[36.25107,38.62688],[36.25097,38.62666],[36.25082,38.6263],[36.25075,38.62605],[36.25086,38.62604],[36.25108,38.62598],[36.25127,38.62596],[36.25149,38.62596],[36.25172,38.62599],[36.25209,38.62608],[36.25237,38.62614],[36.25265,38.62624],[36.25273,38.62668],[36.25279,38.62699],[36.25284,38.6271],[36.25286,38.62723],[36.25283,38.62729],[36.25271,38.62741],[36.25258,38.62754],[36.25245,38.62774],[36.25233,38.62786],[36.25214,38.62794],[36.25195,38.628],[36.2518,38.62803],[36.25172,38.62804],[36.25164,38.62802],[36.25153,38.62796],[36.25141,38.62786],[36.25134,38.62779],[36.25128,38.62772],[36.25124,38.62761],[36.25125,38.62744],[36.25122,38.6273],[36.25109,38.62703],[36.25107,38.62688]]
  },
  {
    id: "114/39", alan: "4,367.45 m²",
    coords: [[36.25107,38.62688],[36.25109,38.62703],[36.25102,38.62694],[36.251,38.62695],[36.25106,38.62714],[36.25112,38.62731],[36.25117,38.62751],[36.25119,38.62767],[36.25123,38.62785],[36.25122,38.62799],[36.2512,38.62801],[36.25117,38.62801],[36.25109,38.62795],[36.25106,38.62793],[36.25103,38.62786],[36.25103,38.62779],[36.25104,38.62763],[36.25104,38.62749],[36.25099,38.62734],[36.25094,38.62718],[36.25088,38.62704],[36.25082,38.62683],[36.25068,38.62655],[36.25064,38.62653],[36.25064,38.62651],[36.25059,38.6264],[36.25052,38.62633],[36.25034,38.62607],[36.25027,38.62595],[36.25024,38.62588],[36.2503,38.62589],[36.25038,38.6259],[36.25047,38.62594],[36.25055,38.62598],[36.25066,38.62603],[36.25075,38.62605],[36.25082,38.6263],[36.25097,38.62666],[36.25107,38.62688]]
  },
  {
    id: "114/21", alan: "7,481.60 m²",
    coords: [[36.25104,38.62749],[36.25104,38.62763],[36.25103,38.62779],[36.25103,38.62786],[36.25106,38.62793],[36.25109,38.62795],[36.25108,38.62805],[36.25106,38.62809],[36.251,38.62813],[36.25081,38.6281],[36.25058,38.62802],[36.2504,38.62797],[36.25029,38.62788],[36.25032,38.62764],[36.25037,38.62731],[36.25046,38.62705],[36.25058,38.62676],[36.25068,38.62655],[36.25082,38.62683],[36.25088,38.62704],[36.25094,38.62718],[36.25099,38.62734],[36.25104,38.62749]]
  },
  {
    id: "119/11", alan: "50,122.28 m²",
    coords: [[36.24374,38.63085],[36.24369,38.63092],[36.24361,38.63099],[36.24369,38.63109],[36.24389,38.63127],[36.24419,38.63154],[36.24429,38.63162],[36.24445,38.63174],[36.24442,38.63181],[36.24437,38.63187],[36.24422,38.63203],[36.24403,38.63223],[36.24385,38.63243],[36.24374,38.63255],[36.24363,38.63248],[36.24358,38.63242],[36.24352,38.63238],[36.24347,38.63232],[36.2437,38.63212],[36.24371,38.63209],[36.24366,38.63204],[36.24354,38.63196],[36.2434,38.63186],[36.2433,38.63176],[36.24318,38.63161],[36.24305,38.63145],[36.24296,38.63134],[36.24287,38.63116],[36.24276,38.63099],[36.2427,38.63094],[36.24262,38.63091],[36.24254,38.63093],[36.24244,38.631],[36.24225,38.63093],[36.24213,38.63091],[36.24193,38.63089],[36.24168,38.63081],[36.24167,38.63077],[36.2416,38.63068],[36.24136,38.6304],[36.24119,38.63023],[36.24119,38.6302],[36.24133,38.63003],[36.24142,38.62994],[36.24152,38.62981],[36.24165,38.62965],[36.24173,38.62953],[36.24177,38.62941],[36.24176,38.6293],[36.24176,38.62907],[36.24172,38.62861],[36.24196,38.62857],[36.24222,38.62853],[36.24251,38.62847],[36.24266,38.62843],[36.24289,38.62832],[36.24322,38.62813],[36.2431,38.62828],[36.24298,38.62843],[36.24284,38.62861],[36.24271,38.62877],[36.2427,38.62879],[36.24315,38.62902],[36.24355,38.62921],[36.24325,38.62942],[36.24303,38.62954],[36.24287,38.62964],[36.24277,38.62972],[36.2428,38.62978],[36.24291,38.62988],[36.243,38.62996],[36.24321,38.63014],[36.24338,38.63031],[36.24358,38.63059],[36.24369,38.63076],[36.24374,38.63085]]
  },
  {
    id: "119/9", alan: "52,776.58 m²",
    coords: [[36.24543,38.62866],[36.2455,38.62874],[36.24544,38.62886],[36.24522,38.62916],[36.24511,38.62934],[36.24502,38.62954],[36.24497,38.62968],[36.24494,38.62981],[36.24459,38.62965],[36.24436,38.62955],[36.24414,38.62946],[36.24392,38.62937],[36.24372,38.62928],[36.24355,38.62921],[36.24315,38.62902],[36.2427,38.62879],[36.24271,38.62877],[36.24284,38.62861],[36.24298,38.62843],[36.2431,38.62828],[36.24322,38.62813],[36.24335,38.62805],[36.24351,38.62797],[36.24379,38.6278],[36.24403,38.62766],[36.24416,38.62756],[36.24434,38.62741],[36.24463,38.62716],[36.24477,38.62704],[36.24498,38.62679],[36.24512,38.62665],[36.24528,38.62651],[36.24533,38.62647],[36.24543,38.62642],[36.24555,38.62637],[36.24573,38.62629],[36.24585,38.62619],[36.24593,38.62608],[36.24597,38.62604],[36.24605,38.62603],[36.24608,38.62616],[36.2461,38.62625],[36.24609,38.62636],[36.24607,38.62651],[36.24604,38.62665],[36.24605,38.62671],[36.24611,38.62675],[36.24613,38.62687],[36.2461,38.627],[36.24603,38.62712],[36.24596,38.6272],[36.24575,38.62739],[36.24555,38.62763],[36.2455,38.62776],[36.24546,38.62793],[36.24544,38.62802],[36.24528,38.62817],[36.24522,38.62829],[36.24524,38.62837],[36.24534,38.62851],[36.24543,38.62866]]
  },
  {
    id: "119/7", alan: "66,944.40 m²",
    coords: [[36.24596,38.62866],[36.24624,38.62874],[36.2465,38.62888],[36.24664,38.62894],[36.24711,38.62912],[36.24732,38.62921],[36.24762,38.62932],[36.24792,38.62941],[36.24816,38.62949],[36.24837,38.62958],[36.24845,38.62963],[36.24857,38.62979],[36.24864,38.6299],[36.24864,38.62999],[36.2486,38.6301],[36.24843,38.63034],[36.24823,38.63062],[36.2481,38.63076],[36.24792,38.63092],[36.24781,38.63102],[36.24764,38.63116],[36.24743,38.63135],[36.24715,38.63151],[36.24678,38.63134],[36.24645,38.63123],[36.24557,38.6309],[36.24492,38.63067],[36.24481,38.63064],[36.24486,38.63041],[36.24497,38.63012],[36.245,38.63005],[36.24501,38.62986],[36.24501,38.6297],[36.24508,38.62949],[36.24517,38.62933],[36.24534,38.6291],[36.24545,38.62893],[36.24551,38.62881],[36.2456,38.62855],[36.24596,38.62866]]
  },
  {
    id: "119/6", alan: "25,368.54 m²",
    coords: [[36.24566,38.63175],[36.24534,38.6321],[36.24498,38.6325],[36.24479,38.6327],[36.24462,38.63289],[36.24446,38.63306],[36.24438,38.63302],[36.24428,38.63295],[36.24404,38.63276],[36.24388,38.63266],[36.24374,38.63255],[36.24385,38.63243],[36.24403,38.63223],[36.24422,38.63203],[36.24437,38.63187],[36.24455,38.63174],[36.24475,38.63152],[36.24484,38.63137],[36.24502,38.63107],[36.24472,38.63099],[36.24475,38.63082],[36.24481,38.63064],[36.24492,38.63067],[36.24557,38.6309],[36.24645,38.63123],[36.24678,38.63134],[36.24715,38.63151],[36.24681,38.63175],[36.24662,38.63164],[36.2464,38.63153],[36.24605,38.63135],[36.2458,38.63162],[36.24566,38.63175]]
  }
]

// ── ANA BORU HATTI ──
const KUYU = [dms(38,37,46.5), dms(36,14,42.1)]
const T_NOKTASI = [dms(38,37,47.1), dms(36,14,42.0)]

const ANA_BORU_HATLARI = [
  { ad: "Kuyu → T", coords: [KUYU, T_NOKTASI], renk: "#00e5ff" },
  { ad: "Vana 1 - ana", coords: [T_NOKTASI, [dms(38,37,45.2), dms(36,14,36.7)]], renk: "#2196f3" },
  { ad: "Vana 1 - kısa kol", coords: [[dms(38,37,45.2), dms(36,14,36.7)], [dms(38,37,43.8), dms(36,14,38.0)]], renk: "#2196f3", kesikli: true },
  { ad: "Vana 1 - uzun kol", coords: [[dms(38,37,45.2), dms(36,14,36.7)], [dms(38,37,46.9), dms(36,14,33.9)], [dms(38,37,50.8), dms(36,14,31.2)]], renk: "#2196f3" },
  { ad: "Vana 2", coords: [T_NOKTASI, [dms(38,37,47.8), dms(36,14,42.1)], [dms(38,37,51.7), dms(36,14,50.6)]], renk: "#2196f3" },
  { ad: "Vana 3 - ana", coords: [T_NOKTASI, [dms(38,37,42.7), dms(36,14,44.1)]], renk: "#2196f3" },
  { ad: "Vana 3 - 119 grubu", coords: [[dms(38,37,42.7), dms(36,14,44.1)], [dms(38,37,41.8), dms(36,14,42.9)], [dms(38,37,40.8), dms(36,14,43.6)], [dms(38,37,36.2), dms(36,14,46.0)]], renk: "#2196f3" },
  { ad: "Vana 3 - 114 grubu", coords: [[dms(38,37,42.7), dms(36,14,44.1)], [dms(38,37,43.0), dms(36,14,47.5)], [dms(38,37,41.6), dms(36,14,51.2)], [dms(38,37,39.2), dms(36,14,55.9)], [dms(38,37,39.7), dms(36,15,1.0)], [dms(38,37,37.7), dms(36,15,10.8)]], renk: "#1565c0" },
]

const VANA_NOKTALARI = [
  { konum: T_NOKTASI, ad: "4'lü T - Ana Dağıtım" },
  { konum: [dms(38,37,45.2), dms(36,14,36.7)], ad: "Vana 1 - Ayrım Noktası" },
  { konum: [dms(38,37,42.7), dms(36,14,44.1)], ad: "Vana 3 - Ayrım Noktası" },
]

export function haritaOlustur(elementId, bolge = null) {
  if (harita) {
    harita.remove()
    harita = null
  }

  // Sabit çizimler (parseller, borular, kuyu) Kayseri ana sahasına ait.
  // Diğer bölgelerde harita sadece bölge merkezine odaklanır;
  // o bölgelerin verileri ileride veritabanından çizilecek.
  const kayseriSahasi = !bolge || bolge.kod === 'kayseri-ana'

  harita = L.map(elementId, {
    center: bolge?.merkez_lat != null
      ? [bolge.merkez_lat, bolge.merkez_lng]
      : [38.6295, 36.2460],
    zoom: bolge?.varsayilan_zoom || 15,
    zoomControl: true
  })

  // Aktif sulama katmanı için yanıp sönen pane
  harita.createPane('aktifSulama')
  harita.getPane('aktifSulama').style.zIndex = 450

  // Uydu katmanı
 L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Google Satellite',
    maxZoom: 21
  }).addTo(harita)

  // ── KATMAN SİSTEMİ ──
  katmanlar = {
    parseller: L.layerGroup(),
    anaBoru: L.layerGroup(),
    kuyu: L.layerGroup(),
    hatSeritleri: L.layerGroup(),
    vanalar: L.layerGroup(),
    fiskiyeler: L.layerGroup()
  }

  const katmanEtiketleri = {
    'Parseller': katmanlar.parseller,
    'Ana boru': katmanlar.anaBoru,
    'Su kuyusu': katmanlar.kuyu,
    'Hat şeritleri': katmanlar.hatSeritleri,
    'Vanalar': katmanlar.vanalar,
    'Fıskiyeler': katmanlar.fiskiyeler
  }

  // Kayıtlı tercihleri uygula (varsayılan: hepsi açık)
  const kayitliTercih = JSON.parse(localStorage.getItem('harita_katmanlari') || '{}')
  Object.entries(katmanEtiketleri).forEach(([ad, grup]) => {
    if (kayitliTercih[ad] !== false) grup.addTo(harita)
  })

  L.control.layers(null, katmanEtiketleri, {
    collapsed: true,
    position: 'topright'
  }).addTo(harita)

  // Katman tercihini hatırla
  const tercihKaydet = (ad, acik) => {
    const t = JSON.parse(localStorage.getItem('harita_katmanlari') || '{}')
    t[ad] = acik
    localStorage.setItem('harita_katmanlari', JSON.stringify(t))
  }
  harita.on('overlayadd', e => tercihKaydet(e.name, true))
  harita.on('overlayremove', e => tercihKaydet(e.name, false))

  // ── GÖRÜNÜMÜ SIFIRLA BUTONU (kuyuya ortala) ──
  const sifirlaKontrol = L.control({ position: 'topleft' })
  sifirlaKontrol.onAdd = () => {
    const btn = L.DomUtil.create('button', 'harita-sifirla-btn')
    btn.innerHTML = '🎯'
    btn.title = 'Görünümü sıfırla — kuyuya ortala'
    btn.type = 'button'
    L.DomEvent.on(btn, 'click', (e) => {
      L.DomEvent.stop(e)
      if (kayseriSahasi) {
        harita.setView(KUYU, 15)
      } else if (bolge?.merkez_lat != null) {
        harita.setView([bolge.merkez_lat, bolge.merkez_lng], bolge.varsayilan_zoom || 15)
      }
    })
    return btn
  }
  sifirlaKontrol.addTo(harita)

  if (!kayseriSahasi) return harita

  // Parselleri çiz
  PARSELLER.forEach(p => {
    const latlngs = p.coords.map(c => [c[1], c[0]])
    const poly = L.polygon(latlngs, {
      color: '#3fae4a',
      weight: 2,
      fillColor: '#3fae4a',
      fillOpacity: 0.25
    }).addTo(katmanlar.parseller)
    poly.bindPopup(`<b>${p.id}</b><br>Alan: ${p.alan}`)

    const center = poly.getBounds().getCenter()
    L.marker(center, {
      icon: L.divIcon({
        className: '',
        html: `<div style="color:#fff;font-weight:700;font-size:12px;text-shadow:0 0 4px #000,0 0 4px #000;">${p.id}</div>`,
        iconSize: [60, 20]
      })
    }).addTo(katmanlar.parseller)
  })

  // Ana boru hatlarını çiz
  ANA_BORU_HATLARI.forEach(hat => {
    L.polyline(hat.coords, {
      color: hat.renk,
      weight: 5,
      opacity: 0.9,
      dashArray: hat.kesikli ? '8,6' : null
    }).addTo(katmanlar.anaBoru).bindPopup(hat.ad)
  })

  // Sulama kuyusu
  L.circleMarker(KUYU, {
    radius: 10,
    color: '#00e5ff',
    weight: 3,
    fillColor: '#003344',
    fillOpacity: 0.9
  }).addTo(katmanlar.kuyu).bindPopup('<b>Sulama Kuyusu</b>')

  // Vana noktaları
  VANA_NOKTALARI.forEach(v => {
    L.circleMarker(v.konum, {
      radius: 7,
      color: '#ff5252',
      weight: 2,
      fillColor: '#ff5252',
      fillOpacity: 0.9
    }).addTo(katmanlar.anaBoru).bindPopup(v.ad)
  })

  // Tüm içeriği kapsayacak şekilde odaklan
  const tumKoordlar = []
  PARSELLER.forEach(p => p.coords.forEach(c => tumKoordlar.push([c[1], c[0]])))
  ANA_BORU_HATLARI.forEach(h => h.coords.forEach(c => tumKoordlar.push(c)))
  if (tumKoordlar.length > 0) {
    harita.fitBounds(tumKoordlar, { padding: [30, 30] })
  }

  return harita
}

export async function hatlariHaritayaCiz(sistemDurumu, tamamlananlar = [], bolgeId = null) {
  if (!harita) return

  let sorgu = supabase
    .from('hatlar')
    .select('*, zonalar!inner(ad, bolge_id)')
    .not('baslangic_lat', 'is', null)
    .order('sira_no')

  if (bolgeId) sorgu = sorgu.eq('zonalar.bolge_id', bolgeId)

  const { data: hatlar } = await sorgu

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
    .addTo(katmanlar.hatSeritleri)
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
  // Sadece Ctrl+tiklama ile calisir — normal tiklama fiskiye/vana popuplarina birakildi
  harita.on('click', (e) => {
    if (!e.originalEvent.ctrlKey) return
    const { lat, lng } = e.latlng
    console.log(`Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    L.marker([lat, lng])
      .addTo(harita)
      .bindPopup(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      .openPopup()
  })
}
// ── VANALAR VE FISKIYELER (KML saha verisi + canli durum renklendirme) ──

function metreOtele(lat, lng, yonDerece, metre) {
  const R = 6378137
  const b = yonDerece * Math.PI / 180
  const dLat = (metre * Math.cos(b)) / R * (180 / Math.PI)
  const dLng = (metre * Math.sin(b)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI)
  return [lat + dLat, lng + dLng]
}

function yonHesapla(lat1, lng1, lat2, lng2) {
  const dLat = lat2 - lat1
  const dLng = (lng2 - lng1) * Math.cos(lat1 * Math.PI / 180)
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
}

function poligonIcinde(lat, lng, coords) {
  let icinde = false
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1]
    const xj = coords[j][0], yj = coords[j][1]
    if (((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      icinde = !icinde
    }
  }
  return icinde
}

function parselPoligonlari(parsel) {
  if (!parsel) return []
  return PARSELLER.filter(p => parsel.includes(p.id)).map(p => p.coords)
}

function mesafeM(lat1, lng1, lat2, lng2) {
  const R = 6378137
  const x = (lng2 - lng1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180)
  const y = (lat2 - lat1) * Math.PI / 180
  return Math.sqrt(x * x + y * y) * R
}

// Vana 35: fiskiyeler 119/7'nin alt kenar cizgisi boyunca dizili
function kenarBoyuncaNoktalar(vana, adet, baslangicKaydirma = 0) {
  const p = PARSELLER.find(x => x.id === '119/7')
  if (!p) return []
  const c = p.coords

  let enYakin = 0, enKucuk = Infinity
  c.forEach((k, i) => {
    const d = mesafeM(vana.lat, vana.lng, k[1], k[0])
    if (d < enKucuk) { enKucuk = d; enYakin = i }
  })

  const yol = [[vana.lat, vana.lng]]
  for (let i = 1; i <= c.length; i++) {
    const k = c[(enYakin + i) % c.length]
    yol.push([k[1], k[0]])
  }

  const noktalar = []
  let hedef = (baslangicKaydirma + 1) * FISKIYE_ARALIK
  let kat = 0
  for (let sgm = 0; sgm < yol.length - 1 && noktalar.length < adet; sgm++) {
    const [aLat, aLng] = yol[sgm]
    const [bLat, bLng] = yol[sgm + 1]
    const segU = mesafeM(aLat, aLng, bLat, bLng)
    if (segU < 0.01) continue
    while (hedef <= kat + segU && noktalar.length < adet) {
      const t = (hedef - kat) / segU
      noktalar.push([aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t])
      hedef += FISKIYE_ARALIK
    }
    kat += segU
  }
  return noktalar
}

const FISKIYE_ARALIK = 10 // metre
const FISKIYE_KAPSAMA = 7 // metre — bir fiskiyenin suladigi tahmini yaricap

// Ortasi ekilmemis vanalar: 16. fiskiyeden sonra 3 araliklik bosluk (33-34 ayni hizada)
const BOSLUKLU = { 33: { yon: 'alt', sonra: 16 }, 34: { yon: 'alt', sonra: 16 } }

// Parsel sonuna kadar uzayan vanalar
const UZAT = { 32: 'alt' }

// Poligon verisindeki girinti yuzunden yanlis kirpilan vanalar:
// kirpma uygulanmaz, sabit pozisyon sayisi cizilir (komsulariyla ayni uzunluk)
const KIRPMASIZ_SABIT = { 12: 33 }

// Hat durumuna gore renkler (hat listesiyle ayni sistem)
// Her hatin kendine ozgu rengi (beklemedeki fiskiyeler bu renkte gorunur;
// calisma renkleri — mavi/yesil/sari — her zaman onceliklidir)
const HAT_PALET = [
  '#cd84f1', '#ff793f', '#34ace0', '#33d9b2', '#ffb8b8',
  '#7d5fff', '#f78fb3', '#e15f41', '#63cdda', '#ea8685',
  '#f5cd79', '#778beb', '#e77f67', '#786fa6', '#40407a'
]

function hatRengi(hatNo) {
  return HAT_PALET[(hatNo - 1) % HAT_PALET.length]
}

const HAT_RENK = {
  aktif: '#1450b8',    // koyu mavi — su anda sulaniyor (yanip soner)
  tamam: '#26de81',    // yesil — bu turda sulandi
  siradaki: '#f9ca24', // sari — siradaki hat
  pasif: '#00e5ff'     // camgobegi — beklemede / hat atanmamis
}

function vanaHatDurumu(hatId, durum, tamamlananlar) {
  if (!hatId) return 'pasif'
  if ((tamamlananlar || []).includes(hatId)) return 'tamam'
  if (!durum || !durum.sistem_acik) return 'pasif'
  if (hatId === durum.aktif_hat_id) return 'aktif'
  if (hatId === durum.siradaki_hat_id) return 'siradaki'
  return 'pasif'
}

function fiskiyeNokta(lat, lng, parsel, vanaNo, siraNo, renderer, renk, kapsamaCiz, hatNo) {
  // Sulanan alani boya (aktif/tamam/siradaki hatlarda)
  if (kapsamaCiz) {
    L.circle([lat, lng], {
      renderer,
      radius: FISKIYE_KAPSAMA,
      stroke: false,
      fillColor: renk,
      fillOpacity: 0.22,
      interactive: false
    }).addTo(katmanlar.fiskiyeler)
  }

  L.circleMarker([lat, lng], {
    renderer,
    radius: 3,
    stroke: false,
    fillColor: renk,
    fillOpacity: 0.9
  })
  .bindPopup(`${hatNo ? `<b>Hat-${hatNo}</b> • ` : ''}${parsel} parselinin ${vanaNo}. vanasının ${siraNo}. fıskiyesi`)
  .addTo(katmanlar.fiskiyeler)
}

// Vana 58 (alt): ana borunun bittigi noktadan sonra 119/11'in kalan
// kuzeybati parcasini doldurur — sira araligi 12m, fiskiye araligi 10m,
// ekim ekseni 60/240, parsel siniriyla kirpilir. Tumu vana 58'e baglidir.
function kalanParcayiDoldur(v, renderer, renk, kapsamaCiz) {
  const poligonlar = parselPoligonlari('119/11')
  if (poligonlar.length === 0) return

  const boruYonu = 326 // ana borunun dogrultusunun devami
  let siraNo = 0

  for (let s = 0; s <= 45; s++) {
    const [bLat, bLng] = metreOtele(v.lat, v.lng, boruYonu, s * 12)

    for (const yon of [60, 240]) {
      // s=0'da 240 tarafini 58'in ust kaydi ciziyor; cift cizim olmasin
      if (s === 0 && yon === 240) continue
      const baslangicIndeks = yon === 60 ? 0 : 1

      for (let i = baslangicIndeks; i <= 60; i++) {
        const [fLat, fLng] = metreOtele(bLat, bLng, yon, i * FISKIYE_ARALIK)
        if (!poligonlar.some(pc => poligonIcinde(fLat, fLng, pc))) break
        siraNo++
        fiskiyeNokta(fLat, fLng, '119/11', v.isaretci_no, siraNo, renderer, renk, kapsamaCiz, v.hatlar?.hat_no)
      }
    }
  }
}

function fiskiyeleriCiz(vanalar, durum, tamamlananlar) {
  const normalRenderer = L.canvas({ padding: 0.5, tolerance: 10 })
  const aktifRenderer = L.canvas({ padding: 0.5, tolerance: 10, pane: 'aktifSulama' })

  vanalar.forEach(v => {
    if (!v.ekim_yonu_derece || !v.fiskiye_sayisi) return
    const parselAd = v.parsel || '?'

    const hatDurumu = vanaHatDurumu(v.hat_id, durum, tamamlananlar)
    let renk = HAT_RENK[hatDurumu]
    if (hatDurumu === 'pasif' && v.hatlar?.hat_no) {
      renk = hatRengi(v.hatlar.hat_no)
    }
    const renderer = hatDurumu === 'aktif' ? aktifRenderer : normalRenderer
    const kapsamaCiz = hatDurumu !== 'pasif'

    // Vana 58 (alt): 119/11'in kalan kuzeybati parcasini doldurur
    if (v.isaretci_no === 58 && v.yon === 'alt') {
      kalanParcayiDoldur(v, renderer, renk, kapsamaCiz)
      return
    }

    // Vana 35: parsel kenari boyunca, basta 4 pozisyon kaydirilmis
    if (v.isaretci_no === 35) {
      kenarBoyuncaNoktalar(v, v.fiskiye_sayisi, 4).forEach((n, idx) => {
        fiskiyeNokta(n[0], n[1], parselAd, v.isaretci_no, idx + 1, renderer, renk, kapsamaCiz, v.hatlar?.hat_no)
      })
      return
    }

    const yon = v.yon === 'ust'
      ? (v.ekim_yonu_derece + 180) % 360
      : v.ekim_yonu_derece

    const poligonlar = parselPoligonlari(v.parsel)

    let siralar = [[null, v.fiskiye_sayisi]]
    if (v.yon === null && (v.isaretci_no === 1 || v.isaretci_no === 19)) {
      const komsu = vanalar.find(x => x.isaretci_no === (v.isaretci_no === 1 ? 2 : 18))
      if (komsu) {
        const disariYon = yonHesapla(komsu.lat, komsu.lng, v.lat, v.lng)
        siralar = v.isaretci_no === 1
          ? [[null, 8], [[disariYon, 12], 5], [[disariYon, 24], 4]]
          : [[null, 9], [[disariYon, 12], 7], [[disariYon, 24], 4]]
      }
    }

    let siraNo = 0
    siralar.forEach(([kaydirma, adet]) => {
      let b = [v.lat, v.lng]
      if (kaydirma) b = metreOtele(v.lat, v.lng, kaydirma[0], kaydirma[1])

      const bosluk = BOSLUKLU[v.isaretci_no]
      const bosluklu = bosluk && bosluk.yon === v.yon
      const kirpmasiz = v.yon === null ? KIRPMASIZ_SABIT[v.isaretci_no] : null
      const cizimAdet = kirpmasiz || (UZAT[v.isaretci_no] === v.yon ? 80 : adet)

      const konumlar = []
      for (let i = 1; i <= cizimAdet; i++) {
        konumlar.push(bosluklu && i > bosluk.sonra ? i + 3 : i)
      }

      konumlar.forEach(ki => {
        const [fLat, fLng] = metreOtele(b[0], b[1], yon, ki * FISKIYE_ARALIK)

        if (!kirpmasiz && poligonlar.length > 0 &&
            !poligonlar.some(pc => poligonIcinde(fLat, fLng, pc))) {
          return
        }

        siraNo++
        fiskiyeNokta(fLat, fLng, parselAd, v.isaretci_no, siraNo, renderer, renk, kapsamaCiz, v.hatlar?.hat_no)
      })
    })
  })
}

export async function vanalariHaritayaCiz(bolgeId = null, sistemDurumu = null, tamamlananlar = []) {
  if (!harita) return

  let sorgu = supabase
    .from('vanalar')
    .select('*, hatlar (hat_no)')
    .order('isaretci_no')

  if (bolgeId) sorgu = sorgu.eq('bolge_id', bolgeId)

  const { data: vanalar, error } = await sorgu
  if (error) {
    console.error('Vana hatası:', error.message)
    return
  }
  if (!vanalar || vanalar.length === 0) return

  fiskiyeleriCiz(vanalar, sistemDurumu, tamamlananlar)

  // ── Vana isaretleri: su gecisi VAR = yesil, YOK = kirmizi ──
  const gruplar = {}
  vanalar.forEach(v => {
    const anahtar = `${v.lat},${v.lng}`
    if (!gruplar[anahtar]) gruplar[anahtar] = []
    gruplar[anahtar].push(v)
  })

  Object.values(gruplar).forEach(grup => {
    const v = grup[0]
    const akiyor = grup.some(x => vanaHatDurumu(x.hat_id, sistemDurumu, tamamlananlar) === 'aktif')
    const renk = akiyor ? '#26de81' : '#e74c3c'
    const toplamF = grup.reduce((t, x) => t + (x.fiskiye_sayisi || 0), 0)

    const satirlar = grup.map(x => `
      ${x.yon ? `<b>${x.yon === 'alt' ? 'Alt' : 'Üst'}</b> (${x.parsel || '-'}):` : `Parsel: ${x.parsel || '-'}`}
      ${x.fiskiye_sayisi} fıskiye —
      ${x.hatlar?.hat_no
        ? `<b style="color:${hatRengi(x.hatlar.hat_no)}">Hat-${x.hatlar.hat_no}</b>`
        : '<span style="color:#7f8c8d">hat atanmadı</span>'}
    `).join('<br>')

    L.marker([v.lat, v.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="
          width: 11px; height: 11px;
          background: ${renk};
          border: 2px solid #0f1923;
          transform: rotate(45deg);
          box-sizing: border-box;
        "></div>`,
        iconSize: [11, 11],
        iconAnchor: [5, 5]
      })
    })
    .bindPopup(`
      <b>Vana ${v.isaretci_no}</b> ${grup.some(x => x.hat_id) ? '' : '(hat atanmadı)'}<br>
      Su geçişi: <b style="color:${akiyor ? '#26de81' : '#e74c3c'}">${akiyor ? 'VAR ✅' : 'YOK ⛔'}</b><br>
      ${satirlar}<br>
      Toplam: <b>${toplamF} fıskiye</b><br>
      Ekim yönü: ${v.ekim_yonu_derece}°<br>
      ${grup.some(x => x.notlar) ? '📝 ' + grup.filter(x => x.notlar).map(x => x.notlar).join(' | ') : ''}
    `)
    .bindTooltip(String(v.isaretci_no), {
      permanent: true, direction: 'top', offset: [0, -7],
      className: 'vana-etiket'
    })
    .addTo(katmanlar.vanalar)
  })
}
