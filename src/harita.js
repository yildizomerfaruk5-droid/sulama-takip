import L from 'leaflet'
import { supabase } from './supabase.js'

let harita = null

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

  // Uydu katmanı
 L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Google Satellite',
    maxZoom: 21
  }).addTo(harita)

  if (!kayseriSahasi) return harita

  // Parselleri çiz
  PARSELLER.forEach(p => {
    const latlngs = p.coords.map(c => [c[1], c[0]])
    const poly = L.polygon(latlngs, {
      color: '#3fae4a',
      weight: 2,
      fillColor: '#3fae4a',
      fillOpacity: 0.25
    }).addTo(harita)
    poly.bindPopup(`<b>${p.id}</b><br>Alan: ${p.alan}`)

    const center = poly.getBounds().getCenter()
    L.marker(center, {
      icon: L.divIcon({
        className: '',
        html: `<div style="color:#fff;font-weight:700;font-size:12px;text-shadow:0 0 4px #000,0 0 4px #000;">${p.id}</div>`,
        iconSize: [60, 20]
      })
    }).addTo(harita)
  })

  // Ana boru hatlarını çiz
  ANA_BORU_HATLARI.forEach(hat => {
    L.polyline(hat.coords, {
      color: hat.renk,
      weight: 5,
      opacity: 0.9,
      dashArray: hat.kesikli ? '8,6' : null
    }).addTo(harita).bindPopup(hat.ad)
  })

  // Sulama kuyusu
  L.circleMarker(KUYU, {
    radius: 10,
    color: '#00e5ff',
    weight: 3,
    fillColor: '#003344',
    fillOpacity: 0.9
  }).addTo(harita).bindPopup('<b>Sulama Kuyusu</b>')

  // Vana noktaları
  VANA_NOKTALARI.forEach(v => {
    L.circleMarker(v.konum, {
      radius: 7,
      color: '#ff5252',
      weight: 2,
      fillColor: '#ff5252',
      fillOpacity: 0.9
    }).addTo(harita).bindPopup(v.ad)
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
// ── VANALAR VE FISKIYELER (KML saha verisi) ──

// Bir noktadan verilen pusula yönünde (derece) verilen metre kadar ötelenmiş koordinat
function metreOtele(lat, lng, yonDerece, metre) {
  const R = 6378137
  const b = yonDerece * Math.PI / 180
  const dLat = (metre * Math.cos(b)) / R * (180 / Math.PI)
  const dLng = (metre * Math.sin(b)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI)
  return [lat + dLat, lng + dLng]
}

const FISKIYE_ARALIK = 10 // metre — ayni vana borusundaki fiskiyeler arasi

// Ozel dizilimler: [boru boyunca yan kayma (m), o siradaki fiskiye sayisi]
// Isaretci 1: ana sirada 8, sola (~225 derece) 12m arayla 5 ve 4
// Isaretci 19: ana sirada 9, saga (~45 derece) 12m arayla 7 ve 4
const OZEL_DIZILIM = {
  1:  { yanYon: 225, siralar: [[0, 8], [12, 5], [24, 4]] },
  19: { yanYon: 45,  siralar: [[0, 9], [12, 7], [24, 4]] }
}

export async function vanalariHaritayaCiz(bolgeId = null) {
  if (!harita) return

  let sorgu = supabase
    .from('vanalar')
    .select('*')
    .order('isaretci_no')

  if (bolgeId) sorgu = sorgu.eq('bolge_id', bolgeId)

  const { data: vanalar, error } = await sorgu
  if (error) {
    console.error('Vana hatası:', error.message)
    return
  }
  if (!vanalar || vanalar.length === 0) return

  // Fiskiye noktalari icin canvas renderer (1000+ nokta performansi)
  const fRenderer = L.canvas({ padding: 0.5 })

  // ── Fiskiye noktalari ──
  vanalar.forEach(v => {
    // Sulama yonu: ust kayitlar ekim yonunun tersine akar
    const yon = v.yon === 'ust'
      ? (v.ekim_yonu_derece + 180) % 360
      : v.ekim_yonu_derece

    // Siralar: ozel dizilim varsa (yalnizca ana kayit, alt/ust degil) onu kullan
    const ozel = (v.yon === null && OZEL_DIZILIM[v.isaretci_no]) || null
    const siralar = ozel ? ozel.siralar : [[0, v.fiskiye_sayisi]]

    siralar.forEach(([yanMesafe, adet]) => {
      let baslangic = [v.lat, v.lng]
      if (yanMesafe > 0) baslangic = metreOtele(v.lat, v.lng, ozel.yanYon, yanMesafe)

      for (let i = 1; i <= adet; i++) {
        const [fLat, fLng] = metreOtele(baslangic[0], baslangic[1], yon, i * FISKIYE_ARALIK)
        L.circleMarker([fLat, fLng], {
          renderer: fRenderer,
          radius: 1.8,
          stroke: false,
          fillColor: '#00e5ff',
          fillOpacity: 0.8,
          interactive: false
        }).addTo(harita)
      }
    })
  })

  // ── Vana isaretleri (baklava/elmas ikon) ──
  const gruplar = {}
  vanalar.forEach(v => {
    const anahtar = `${v.lat},${v.lng}`
    if (!gruplar[anahtar]) gruplar[anahtar] = []
    gruplar[anahtar].push(v)
  })

  Object.values(gruplar).forEach(grup => {
    const v = grup[0]
    const ciftYonlu = grup.length > 1
    const renk = ciftYonlu ? '#e67e22' : '#f1c40f'
    const toplamF = grup.reduce((t, x) => t + (x.fiskiye_sayisi || 0), 0)

    const satirlar = grup.map(x => `
      ${x.yon ? `<b>${x.yon === 'alt' ? 'Alt' : 'Üst'}</b> (${x.parsel || '-'}):` : `Parsel: ${x.parsel || '-'}`}
      ${x.fiskiye_sayisi} fıskiye
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
      ${satirlar}<br>
      Toplam: <b>${toplamF} fıskiye</b><br>
      Ekim yönü: ${v.ekim_yonu_derece}°<br>
      ${grup.some(x => x.notlar) ? '📝 ' + grup.filter(x => x.notlar).map(x => x.notlar).join(' | ') : ''}
    `)
    .bindTooltip(String(v.isaretci_no), {
      permanent: true, direction: 'top', offset: [0, -7],
      className: 'vana-etiket'
    })
    .addTo(harita)
  })
}
