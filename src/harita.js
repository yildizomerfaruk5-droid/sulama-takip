import L from 'leaflet'
import { supabase } from './supabase.js'

let harita = null
let katmanlar = null

// ── BÖLGENİN SAHA VERİSİ ──
// Parseller, borular ve saha noktaları artık kodda sabit değil; her bölge
// kendi verisini veritabanından getirir (kurulum sihirbazının yazdığı veri).
// haritaOlustur() doldurur, fıskiye çizimi buradan okur.
let saha = {
  parseller: [],   // { id, ad, alan_m2, koordinatlar: [[lng,lat], ...] }  ← GeoJSON sırası
  borular: [],     // { ad, koordinatlar: [[lat,lng], ...], renk, kesikli } ← Leaflet sırası
  noktalar: [],    // { tip, ad, lat, lng }
  aralik: 10,      // fıskiye aralığı (m)
  kapsama: 7       // bir fıskiyenin suladığı tahmini yarıçap (m)
}

// Bölgenin çizim verisini getirir. Bölge yoksa veya veri henüz
// girilmemişse boş döner — harita boş açılır, kuruluma yönlendirilir.
async function sahaVerisiniGetir(bolge) {
  const bos = { parseller: [], borular: [], noktalar: [] }
  if (!bolge?.id) return bos

  const [p, b, n] = await Promise.all([
    supabase.from('parseller').select('*').eq('bolge_id', bolge.id).order('sira_no'),
    supabase.from('boru_hatlari').select('*').eq('bolge_id', bolge.id).order('sira_no'),
    supabase.from('saha_noktalari').select('*').eq('bolge_id', bolge.id)
  ])

  const hata = p.error || b.error || n.error
  if (hata) {
    console.error('Saha verisi hatası:', hata.message)
    return bos
  }

  return { parseller: p.data || [], borular: b.data || [], noktalar: n.data || [] }
}

// Parsel alanını kaynak KML'deki biçimde gösterir ("29,446.94 m²")
function alanMetni(alanM2) {
  if (alanM2 == null) return '-'
  return Number(alanM2).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' m²'
}

export async function haritaOlustur(elementId, bolge = null) {
  if (harita) {
    harita.remove()
    harita = null
  }
  // Katman önbellekleri haritayla birlikte geçersizleşir
  fiskiyeKayitlari = []
  vanaIsaretKayitlari = []
  hatSeritKayitlari = []

  saha = {
    ...(await sahaVerisiniGetir(bolge)),
    aralik: Number(bolge?.fiskiye_araligi_m) || 10,
    kapsama: Number(bolge?.fiskiye_kapsama_m) || 7
  }

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
      const kuyu = saha.noktalar.find(n => n.tip === 'kuyu')
      if (kuyu) {
        harita.setView([kuyu.lat, kuyu.lng], 15)
      } else if (bolge?.merkez_lat != null) {
        harita.setView([bolge.merkez_lat, bolge.merkez_lng], bolge.varsayilan_zoom || 15)
      }
    })
    return btn
  }
  sifirlaKontrol.addTo(harita)

  // Parselleri çiz ([lng,lat] -> Leaflet [lat,lng])
  saha.parseller.forEach(p => {
    const latlngs = (p.koordinatlar || []).map(c => [c[1], c[0]])
    if (latlngs.length === 0) return

    const poly = L.polygon(latlngs, {
      color: p.renk || '#3fae4a',
      weight: 2,
      fillColor: p.renk || '#3fae4a',
      fillOpacity: 0.25
    }).addTo(katmanlar.parseller)
    poly.bindPopup(`<b>${p.ad}</b><br>Alan: ${alanMetni(p.alan_m2)}`)

    const center = poly.getBounds().getCenter()
    L.marker(center, {
      icon: L.divIcon({
        className: '',
        html: `<div style="color:#fff;font-weight:700;font-size:12px;text-shadow:0 0 4px #000,0 0 4px #000;">${p.ad}</div>`,
        iconSize: [60, 20]
      })
    }).addTo(katmanlar.parseller)
  })

  // Boru hatlarını çiz
  saha.borular.forEach(hat => {
    if (!hat.koordinatlar?.length) return
    L.polyline(hat.koordinatlar, {
      color: hat.renk || '#2196f3',
      weight: 5,
      opacity: 0.9,
      dashArray: hat.kesikli ? '8,6' : null
    }).addTo(katmanlar.anaBoru).bindPopup(hat.ad)
  })

  // Saha noktaları: kuyu kendi katmanında, diğerleri ana boru katmanında
  saha.noktalar.forEach(n => {
    if (n.tip === 'kuyu') {
      L.circleMarker([n.lat, n.lng], {
        radius: 10,
        color: '#00e5ff',
        weight: 3,
        fillColor: '#003344',
        fillOpacity: 0.9
      }).addTo(katmanlar.kuyu).bindPopup(`<b>${n.ad || 'Sulama Kuyusu'}</b>`)
    } else {
      L.circleMarker([n.lat, n.lng], {
        radius: 7,
        color: '#ff5252',
        weight: 2,
        fillColor: '#ff5252',
        fillOpacity: 0.9
      }).addTo(katmanlar.anaBoru).bindPopup(n.ad || '')
    }
  })

  // Tüm içeriği kapsayacak şekilde odaklan (sabit koordinat yok)
  const tumKoordlar = []
  saha.parseller.forEach(p => (p.koordinatlar || []).forEach(c => tumKoordlar.push([c[1], c[0]])))
  saha.borular.forEach(h => (h.koordinatlar || []).forEach(c => tumKoordlar.push(c)))
  if (tumKoordlar.length > 0) {
    harita.fitBounds(tumKoordlar, { padding: [30, 30] })
  }

  // Saha çizimi hiç girilmemişse kullanıcıyı kuruluma yönlendir
  if (saha.parseller.length === 0 && saha.borular.length === 0 && saha.noktalar.length === 0) {
    const ipucuKontrol = L.control({ position: 'bottomleft' })
    ipucuKontrol.onAdd = () => {
      const kutu = L.DomUtil.create('div', 'harita-ipucu')
      kutu.innerHTML = '🧭 Bu bölgenin saha çizimi henüz tanımlanmadı.<br>Kurulum ekranından parsel, boru ve vana ekleyin.'
      return kutu
    }
    ipucuKontrol.addTo(harita)
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

  hatSeritKayitlari = []
  hatlar.forEach(hat => {
    const renk = hatRengiGetir(hat, sistemDurumu, tamamlananlar)
    if (!hat.baslangic_lat || !hat.bitis_lat) return

    const baslangic = [hat.baslangic_lat, hat.baslangic_lng]
    const bitis = [hat.bitis_lat, hat.bitis_lng]
    const serit = seritOlustur(baslangic, bitis, 0.00006)

    const sekil = L.polygon(serit, {
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

    hatSeritKayitlari.push({ hat, sekil })
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
// ── VANALAR VE FISKIYELER (saha verisi + canli durum renklendirme) ──

function metreOtele(lat, lng, yonDerece, metre) {
  const R = 6378137
  const b = yonDerece * Math.PI / 180
  const dLat = (metre * Math.cos(b)) / R * (180 / Math.PI)
  const dLng = (metre * Math.sin(b)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI)
  return [lat + dLat, lng + dLng]
}

// İki nokta arasındaki pusula açısı (0=kuzey, 90=doğu)
// Kurulum sihirbazındaki "ekim yönü yardımcısı" da bunu kullanır.
export function yonHesapla(lat1, lng1, lat2, lng2) {
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

// Parsel metnindeki adlari ('119/7-119/6') poligon listesine cevirir
function parselAdiylaPoligonlar(metin, sv) {
  if (!metin) return []
  return (sv.parseller || []).filter(p => metin.includes(p.ad)).map(p => p.koordinatlar)
}

// Vananin kirpma alani: once vana_parselleri iliskisi (kurulum sihirbazinin
// yazdigi veri), yoksa eski `parsel` metni uzerinden eslestirme
function vananinPoligonlari(v, sv) {
  const idler = (v.vana_parselleri || []).map(x => x.parsel_id)
  if (idler.length > 0) {
    const poligonlar = (sv.parseller || [])
      .filter(p => idler.includes(p.id))
      .map(p => p.koordinatlar)
    if (poligonlar.length > 0) return poligonlar
  }
  return parselAdiylaPoligonlar(v.parsel, sv)
}

// İki koordinat arası düz mesafe (m). Kurulum sihirbazındaki
// "kuyuya yakınlığa göre sırala" önerisi de bunu kullanır.
export function mesafeM(lat1, lng1, lat2, lng2) {
  const R = 6378137
  const x = (lng2 - lng1) * Math.PI / 180 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180)
  const y = (lat2 - lat1) * Math.PI / 180
  return Math.sqrt(x * x + y * y) * R
}

// 'kenar' kurali: fiskiyeler bir parselin kenar cizgisi boyunca dizilir
function kenarBoyuncaNoktalar(vana, adet, baslangicKaydirma = 0, parselAd = null, sv = saha) {
  const p = (sv.parseller || []).find(x => x.ad === parselAd)
  if (!p) return []
  const c = p.koordinatlar

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
  let hedef = (baslangicKaydirma + 1) * sv.aralik
  let kat = 0
  for (let sgm = 0; sgm < yol.length - 1 && noktalar.length < adet; sgm++) {
    const [aLat, aLng] = yol[sgm]
    const [bLat, bLng] = yol[sgm + 1]
    const segU = mesafeM(aLat, aLng, bLat, bLng)
    if (segU < 0.01) continue
    while (hedef <= kat + segU && noktalar.length < adet) {
      const t = (hedef - kat) / segU
      noktalar.push([aLat + (bLat - aLat) * t, aLng + (bLng - aLng) * t])
      hedef += sv.aralik
    }
    kat += segU
  }
  return noktalar
}

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

// toplayici verilirse oluşturulan katmanlar oraya da eklenir; durum
// değişiminde o vananın katmanlarına tek tek erişebilmek için gerekli.
function fiskiyeNokta(lat, lng, parsel, vanaNo, siraNo, renderer, renk, kapsamaCiz, hatNo, toplayici = null) {
  // Sulanan alani boya (aktif/tamam/siradaki hatlarda)
  if (kapsamaCiz) {
    const daire = L.circle([lat, lng], {
      renderer,
      radius: saha.kapsama,
      stroke: false,
      fillColor: renk,
      fillOpacity: 0.22,
      interactive: false
    }).addTo(katmanlar.fiskiyeler)
    toplayici?.push(daire)
  }

  const nokta = L.circleMarker([lat, lng], {
    renderer,
    radius: 3,
    stroke: false,
    fillColor: renk,
    fillOpacity: 0.9
  })
  .bindPopup(`${hatNo ? `<b>Hat-${hatNo}</b> • ` : ''}${parsel} parselinin ${vanaNo}. vanasının ${siraNo}. fıskiyesi`)
  .addTo(katmanlar.fiskiyeler)
  toplayici?.push(nokta)
}

// 'alan_doldur' kurali: vanadan boru dogrultusunda ilerleyen siralarla
// parselin kalan parcasini doldurur (sira araligi kuraldan, fiskiye araligi
// bolge ayarindan; ekim ekseni ve karsiti taranir, parsel siniriyla kirpilir).
function kalanParcayiDoldur(v, kural, sv) {
  const noktalar = []
  const poligonlar = parselAdiylaPoligonlar(kural.parsel_ad, sv)
  if (poligonlar.length === 0) return noktalar

  const boruYonu = kural.boru_yonu
  const siraAraligi = kural.sira_araligi_m || 12
  const maksSira = kural.maks_sira ?? 45
  const maksFiskiye = kural.maks_fiskiye ?? 60
  // Ekim ekseni ve tam karsiti (orn. 60 / 240)
  const eksenler = [v.ekim_yonu_derece, (v.ekim_yonu_derece + 180) % 360]

  for (let s = 0; s <= maksSira; s++) {
    const [bLat, bLng] = metreOtele(v.lat, v.lng, boruYonu, s * siraAraligi)

    eksenler.forEach((yon, eksenIndeks) => {
      // s=0'da karsi tarafi vananin diger kaydi ciziyor; cift cizim olmasin
      if (s === 0 && eksenIndeks === 1) return
      const baslangicIndeks = eksenIndeks === 0 ? 0 : 1

      for (let i = baslangicIndeks; i <= maksFiskiye; i++) {
        const [fLat, fLng] = metreOtele(bLat, bLng, yon, i * sv.aralik)
        if (!poligonlar.some(pc => poligonIcinde(fLat, fLng, pc))) break
        noktalar.push({ lat: fLat, lng: fLng, sira: noktalar.length + 1, parsel: kural.parsel_ad })
      }
    })
  }
  return noktalar
}

/*
 * Bir vananin fiskiye konumlarini hesaplar — SAF fonksiyon, cizim yapmaz.
 * Hem haritanin cizimi hem kurulum sihirbazindaki kural onizlemesi bunu kullanir,
 * boylece onizleme ile gercek cizim asla ayrisamaz.
 *   v   : vana kaydi (cizim_kurali dahil)
 *   sv  : { parseller, aralik }
 * Doner: [{ lat, lng, sira, parsel }]
 */
export function fiskiyeKonumlari(v, vanalar = [], sv = saha) {
  if (!v?.ekim_yonu_derece || !v?.fiskiye_sayisi) return []

  const parselAd = v.parsel || '?'
  const kural = v.cizim_kurali || {}

  // Kendi hesap akisi olan kurallar
  if (kural.tip === 'alan_doldur') return kalanParcayiDoldur(v, kural, sv)

  if (kural.tip === 'kenar') {
    return kenarBoyuncaNoktalar(v, v.fiskiye_sayisi, kural.baslangic_kaydirma || 0, kural.parsel_ad, sv)
      .map((n, idx) => ({ lat: n[0], lng: n[1], sira: idx + 1, parsel: parselAd }))
  }

  const yon = v.yon === 'ust'
    ? (v.ekim_yonu_derece + 180) % 360
    : v.ekim_yonu_derece

  const poligonlar = vananinPoligonlari(v, sv)

  // 'yan_sira': ana sıra + komşuya göre hesaplanan dış yönde kaydırılmış sıralar
  let siralar = [[null, v.fiskiye_sayisi]]
  if (kural.tip === 'yan_sira') {
    const komsu = vanalar.find(x => x.isaretci_no === kural.yon_referans?.komsu_isaretci)
    if (komsu) {
      const disariYon = yonHesapla(komsu.lat, komsu.lng, v.lat, v.lng)
      siralar = [
        [null, kural.ana],
        ...(kural.siralar || []).map(s => [[disariYon, s.kaydirma_m], s.adet])
      ]
    }
  }

  const noktalar = []
  siralar.forEach(([kaydirma, adet]) => {
    let b = [v.lat, v.lng]
    if (kaydirma) b = metreOtele(v.lat, v.lng, kaydirma[0], kaydirma[1])

    // 'bosluk': ekilmemiş şerit — belirtilen fıskiyeden sonra atlanır
    // 'sabit' : poligon girintisi yüzünden yanlış kırpılan sıra, kırpma yok
    // 'uzat'  : parsel sonuna kadar dener, kırpma sınırı belirler
    const bosluklu = kural.tip === 'bosluk'
    const kirpmasiz = kural.tip === 'sabit' ? kural.adet : null
    const cizimAdet = kirpmasiz || (kural.tip === 'uzat' ? (kural.maks || 80) : adet)

    const konumlar = []
    for (let i = 1; i <= cizimAdet; i++) {
      konumlar.push(bosluklu && i > kural.sonra ? i + (kural.atlama || 3) : i)
    }

    konumlar.forEach(ki => {
      const [fLat, fLng] = metreOtele(b[0], b[1], yon, ki * sv.aralik)

      if (!kirpmasiz && poligonlar.length > 0 &&
          !poligonlar.some(pc => poligonIcinde(fLat, fLng, pc))) {
        return
      }

      noktalar.push({ lat: fLat, lng: fLng, sira: noktalar.length + 1, parsel: parselAd })
    })
  })

  return noktalar
}

/*
 * GEOMETRİ ve DURUM ayrımı (performans).
 *
 * Ölçüm (1785 fıskiye, masaüstü): geometri hesabı 5 ms, buna karşılık
 * Leaflet katmanlarını yaratmak 138 ms. Yani pahalı olan hesap değil,
 * 3570 nesnenin yeniden kurulması. Bu yüzden katmanlar BİR KEZ kurulur,
 * sonraki durum değişikliklerinde yalnızca renk güncellenir (13 ms).
 *
 * Vananın rengi dışında bir şeyi değişiyorsa (aktif pane'e taşınma,
 * kapsama dairelerinin girip çıkması) yalnızca O VANANIN katmanları
 * yeniden çizilir — geometri yine önbellekten gelir, tekrar hesaplanmaz.
 */
let fiskiyeKayitlari = []   // { vana, noktalar, durum, katmanlar[] }
let vanaIsaretKayitlari = []// { grup, isaret }
let hatSeritKayitlari = []  // { hat, sekil }
let normalRenderer = null
let aktifRenderer = null

// Harita nesnesi var ama container'ı hâlâ belgede mi?
// Yalnızca `harita` değişkenine bakmak yetmez: #app.innerHTML değişince
// nesne truthy kalır, container kopar.
function haritaCanli() {
  const kapsayici = harita?.getContainer?.()
  return !!(kapsayici && kapsayici.isConnected)
}

// Vananın o anki durumundan renk + çizim biçimi
function vanaGorunumu(v, durum, tamamlananlar) {
  const hatDurumu = vanaHatDurumu(v.hat_id, durum, tamamlananlar)
  let renk = HAT_RENK[hatDurumu]
  if (hatDurumu === 'pasif' && v.hatlar?.hat_no) renk = hatRengi(v.hatlar.hat_no)
  return { hatDurumu, renk, kapsamaCiz: hatDurumu !== 'pasif' }
}

// Tek bir vananın fıskiye katmanlarını çizer (önbellekteki konumlardan).
// Hem ilk kurulum hem durum değişimi bu yolu kullanır — çıktı birebir aynı.
function vanaKatmanlariniCiz(kayit, gorunum) {
  const { vana } = kayit
  const renderer = gorunum.hatDurumu === 'aktif' ? aktifRenderer : normalRenderer
  kayit.katmanlar = []

  kayit.noktalar.forEach(n => {
    fiskiyeNokta(n.lat, n.lng, n.parsel, vana.isaretci_no, n.sira,
      renderer, gorunum.renk, gorunum.kapsamaCiz, vana.hatlar?.hat_no, kayit.katmanlar)
  })
  kayit.durum = gorunum.hatDurumu
}

function vanaKatmanlariniKaldir(kayit) {
  kayit.katmanlar.forEach(k => katmanlar.fiskiyeler.removeLayer(k))
  kayit.katmanlar = []
}

function fiskiyeleriCiz(vanalar, durum, tamamlananlar) {
  normalRenderer = L.canvas({ padding: 0.5, tolerance: 10 })
  aktifRenderer = L.canvas({ padding: 0.5, tolerance: 10, pane: 'aktifSulama' })
  fiskiyeKayitlari = []

  vanalar.forEach(v => {
    if (!v.ekim_yonu_derece || !v.fiskiye_sayisi) return

    // Geometri yalnızca burada hesaplanır; sonra önbellekte tutulur
    const kayit = { vana: v, noktalar: fiskiyeKonumlari(v, vanalar, saha), durum: null, katmanlar: [] }
    vanaKatmanlariniCiz(kayit, vanaGorunumu(v, durum, tamamlananlar))
    fiskiyeKayitlari.push(kayit)
  })
}

/*
 * Canlı durum değişiminde çağrılır: geometri yeniden hesaplanmaz,
 * Leaflet katmanları yeniden kurulmaz. Yalnızca gerçekten değişen
 * vanalara dokunulur.
 */
export function haritaDurumGuncelle(durum, tamamlananlar = []) {
  // Harita DOM'dan koptuysa sessizce çık. Bu durum kurulum sihirbazı
  // veya viewer #app'i değiştirdiğinde, ayrıca render()'ın innerHTML
  // yazmasıyla haritaOlustur()'un tamamlanması arasındaki kısa yarış
  // penceresinde oluşur. Leaflet kopuk container'da hata vermiyor
  // (ölçüldü) ama yapılan iş boşa gider: bu katmanlar birazdan atılacak.
  if (!haritaCanli()) return { guncellenen: 0, yenidenCizilen: 0, atlandi: true }
  const ozet = { guncellenen: 0, yenidenCizilen: 0 }

  // ── Fıskiyeler ──
  fiskiyeKayitlari.forEach(kayit => {
    const yeni = vanaGorunumu(kayit.vana, durum, tamamlananlar)
    if (yeni.hatDurumu === kayit.durum) return

    const eskiAktif = kayit.durum === 'aktif'
    const eskiPasif = kayit.durum === 'pasif'
    // Pane (yanıp sönme) veya kapsama daireleri değişiyorsa katman
    // yeniden kurulmalı; sadece renk değişiyorsa setStyle yeter.
    if (eskiAktif !== (yeni.hatDurumu === 'aktif') ||
        eskiPasif !== (yeni.hatDurumu === 'pasif')) {
      vanaKatmanlariniKaldir(kayit)
      vanaKatmanlariniCiz(kayit, yeni)
      ozet.yenidenCizilen++
    } else {
      kayit.katmanlar.forEach(k => k.setStyle && k.setStyle({ fillColor: yeni.renk }))
      kayit.durum = yeni.hatDurumu
      ozet.guncellenen++
    }
  })

  // ── Vana işaretleri (su geçişi var/yok) ──
  vanaIsaretKayitlari.forEach(({ grup, isaret }) => {
    const akiyor = grup.some(x => vanaHatDurumu(x.hat_id, durum, tamamlananlar) === 'aktif')
    isaret.setIcon(vanaIkonu(akiyor))
    isaret.setPopupContent(vanaPopupIcerigi(grup, akiyor))
  })

  // ── Hat şeritleri ──
  hatSeritKayitlari.forEach(({ hat, sekil }) => {
    const renk = hatRengiGetir(hat, durum, tamamlananlar)
    sekil.setStyle({ color: renk, fillColor: renk, fillOpacity: renk === '#3d3d3d' ? 0.3 : 0.5 })
  })

  return ozet
}

export async function vanalariHaritayaCiz(bolgeId = null, sistemDurumu = null, tamamlananlar = []) {
  if (!harita) return

  // vana_parselleri: çoklu parsel kırpma alanı (kurulum sihirbazının verisi).
  // İlişki okunamazsa vanalar yine çizilsin diye ilişkisiz sorguya düşülür.
  const vanalariGetir = (secim) => {
    let sorgu = supabase.from('vanalar').select(secim).order('isaretci_no')
    if (bolgeId) sorgu = sorgu.eq('bolge_id', bolgeId)
    return sorgu
  }

  let { data: vanalar, error } = await vanalariGetir('*, hatlar (hat_no), vana_parselleri (parsel_id)')
  if (error) {
    console.warn('vana_parselleri okunamadı, parsel metnine düşülüyor:', error.message)
    ;({ data: vanalar, error } = await vanalariGetir('*, hatlar (hat_no)'))
  }

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

  vanaIsaretKayitlari = []
  Object.values(gruplar).forEach(grup => {
    const v = grup[0]
    const akiyor = grup.some(x => vanaHatDurumu(x.hat_id, sistemDurumu, tamamlananlar) === 'aktif')

    const isaret = L.marker([v.lat, v.lng], { icon: vanaIkonu(akiyor) })
      .bindPopup(vanaPopupIcerigi(grup, akiyor))
      .bindTooltip(String(v.isaretci_no), {
        permanent: true, direction: 'top', offset: [0, -7],
        className: 'vana-etiket'
      })
      .addTo(katmanlar.vanalar)

    vanaIsaretKayitlari.push({ grup, isaret })
  })
}

// Vana işareti ve popup'ı — durum değişiminde yeniden üretilir,
// böylece ilk çizimle güncelleme birebir aynı çıktıyı verir.
function vanaIkonu(akiyor) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 11px; height: 11px;
      background: ${akiyor ? '#26de81' : '#e74c3c'};
      border: 2px solid #0f1923;
      transform: rotate(45deg);
      box-sizing: border-box;
    "></div>`,
    iconSize: [11, 11],
    iconAnchor: [5, 5]
  })
}

function vanaPopupIcerigi(grup, akiyor) {
  const v = grup[0]
  const toplamF = grup.reduce((t, x) => t + (x.fiskiye_sayisi || 0), 0)

  const satirlar = grup.map(x => `
      ${x.yon ? `<b>${x.yon === 'alt' ? 'Alt' : 'Üst'}</b> (${x.parsel || '-'}):` : `Parsel: ${x.parsel || '-'}`}
      ${x.fiskiye_sayisi} fıskiye —
      ${x.hatlar?.hat_no
        ? `<b style="color:${hatRengi(x.hatlar.hat_no)}">Hat-${x.hatlar.hat_no}</b>`
        : '<span style="color:#7f8c8d">hat atanmadı</span>'}
    `).join('<br>')

  return `
      <b>Vana ${v.isaretci_no}</b> ${grup.some(x => x.hat_id) ? '' : '(hat atanmadı)'}<br>
      Su geçişi: <b style="color:${akiyor ? '#26de81' : '#e74c3c'}">${akiyor ? 'VAR ✅' : 'YOK ⛔'}</b><br>
      ${satirlar}<br>
      Toplam: <b>${toplamF} fıskiye</b><br>
      Ekim yönü: ${v.ekim_yonu_derece}°<br>
      ${grup.some(x => x.notlar) ? '📝 ' + grup.filter(x => x.notlar).map(x => x.notlar).join(' | ') : ''}
    `
}
