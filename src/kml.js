/*
 * KML ayrıştırma ve geometri yardımcıları
 * Kurulum sihirbazı adım 3-4-5 bu modülü kullanır.
 *
 * Yeni bağımlılık yok: tarayıcının kendi DOMParser'ı kullanılır.
 * Koordinat sırası KML'de [lng, lat]'tir:
 *   - parseller  → [lng, lat] (GeoJSON sırası, olduğu gibi)
 *   - borular    → [lat, lng] (Leaflet polyline sırası, çevrilir)
 */

const R = 6378137 // WGS84 ekvator yarıçapı (m)
const DER = Math.PI / 180

// Küresel poligon alanı (m²) — [[lng,lat], ...]
// Küresel fazlalık formülü; Google Earth'ün verdiği değerlerle örtüşür.
export function poligonAlanM2(koordinatlar) {
  const k = koordinatlar || []
  if (k.length < 3) return 0

  let toplam = 0
  for (let i = 0; i < k.length; i++) {
    const [lng1, lat1] = k[i]
    const [lng2, lat2] = k[(i + 1) % k.length]
    toplam += (lng2 - lng1) * DER * (2 + Math.sin(lat1 * DER) + Math.sin(lat2 * DER))
  }
  return Math.abs(toplam * R * R / 2)
}

// Polyline uzunluğu (m) — [[lat,lng], ...]
export function cizgiUzunlukM(koordinatlar) {
  const k = koordinatlar || []
  let toplam = 0
  for (let i = 1; i < k.length; i++) {
    const [lat1, lng1] = k[i - 1]
    const [lat2, lng2] = k[i]
    const x = (lng2 - lng1) * DER * Math.cos((lat1 + lat2) / 2 * DER)
    const y = (lat2 - lat1) * DER
    toplam += Math.sqrt(x * x + y * y) * R
  }
  return toplam
}

// Alanı kaynak KML'deki biçimde gösterir ("29,446.94 m²")
export function alanBicimle(alanM2) {
  if (alanM2 == null) return '-'
  return Number(alanM2).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' m²'
}

// Sahada kullanılan birim: dekar (1 dekar = 1.000 m²)
export function dekarBicimle(alanM2) {
  if (alanM2 == null) return '-'
  return (Number(alanM2) / 1000).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }) + ' dekar'
}

export function uzunlukBicimle(metre) {
  if (metre == null) return '-'
  return Math.round(Number(metre)).toLocaleString('tr-TR') + ' m'
}

// ── KML ──

// Etiketin doğrudan çocuğu olan ilk <ad> öğesinin metni
// (Style/ExtendedData içindeki alt öğelere karışmamak için)
function dogrudanMetin(el, ad) {
  for (const c of el.children) {
    if (c.localName === ad) return (c.textContent || '').trim()
  }
  return ''
}

// "lng,lat,yukseklik lng,lat,yukseklik ..." → [[lng,lat], ...]
function koordAyristir(metin) {
  return (metin || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(p => {
      const [lng, lat] = p.split(',').map(Number)
      return [lng, lat]
    })
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
}

function ilkKoordinatlar(kapsayici) {
  const k = kapsayici.getElementsByTagNameNS('*', 'coordinates')[0]
  return k ? koordAyristir(k.textContent) : []
}

// Nokta adından tip tahmini (kullanıcı önizlemede değiştirebilir)
function noktaTipiTahmin(ad) {
  const m = (ad || '').toLocaleLowerCase('tr')
  if (m.includes('kuyu')) return 'kuyu'
  if (m.includes('ayrım') || m.includes('ayrim') || m.includes('dağıtım') || m.includes('dagitim')) return 'ayrim'
  if (m.includes('karavan')) return 'karavan'
  if (m.includes('depo')) return 'depo'
  return 'diger'
}

// ── KML ÜRETME (dışa aktarma) ──

function xmlKacir(metin) {
  return String(metin ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// KML koordinat dizisi: "lng,lat,0 lng,lat,0 ..."
function kmlKoordinat(ciftler) {
  return ciftler.map(([lng, lat]) => `${lng},${lat},0`).join(' ')
}

function isaretPlacemark(ad, aciklama, ic) {
  return `    <Placemark>
      <name>${xmlKacir(ad)}</name>${aciklama ? `
      <description>${xmlKacir(aciklama)}</description>` : ''}
      ${ic}
    </Placemark>`
}

/*
 * Kurulmuş bir bölgeyi KML olarak üretir (sahada Google Earth ile kontrol).
 * veri = { parseller, borular, noktalar, vanalar }
 *
 * Üretilen dosya kmlAyristir() ile geri okunabilir: parsel koordinatları
 * [lng,lat], boru koordinatları [lat,lng] olarak saklandığı için borular
 * yazarken çevrilir.
 */
export function kmlUret(bolge, veri = {}) {
  const { parseller = [], borular = [], noktalar = [], vanalar = [] } = veri

  const klasor = (ad, icerikler) => icerikler.length === 0 ? '' : `  <Folder>
    <name>${xmlKacir(ad)}</name>
${icerikler.join('\n')}
  </Folder>`

  const parselIsaretleri = parseller.map(p => isaretPlacemark(
    p.ad,
    p.alan_m2 != null ? alanBicimle(p.alan_m2) : null,
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlKoordinat(p.koordinatlar || [])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
  ))

  const boruIsaretleri = borular.map(h => isaretPlacemark(
    h.ad,
    h.tip ? `tip: ${h.tip}${h.kesikli ? ' (kesikli)' : ''}` : null,
    // boru_hatlari [lat,lng] tutar; KML [lng,lat] ister
    `<LineString><coordinates>${kmlKoordinat((h.koordinatlar || []).map(([lat, lng]) => [lng, lat]))}</coordinates></LineString>`
  ))

  const noktaIsaretleri = noktalar.map(n => isaretPlacemark(
    n.ad || n.tip,
    n.notlar || n.tip,
    `<Point><coordinates>${n.lng},${n.lat},0</coordinates></Point>`
  ))

  // Aynı konumdaki alt/üst kayıtları tek işaretçide birleştir —
  // geri okunduğunda yine iki satır olarak çözülsün
  const gruplar = {}
  vanalar.forEach(v => {
    const anahtar = `${v.lat},${v.lng}`
    ;(gruplar[anahtar] ||= []).push(v)
  })

  const vanaIsaretleri = Object.values(gruplar).map(grup => {
    const v = grup[0]
    const satirlar = grup
      .map(x => `${x.fiskiye_sayisi || 0}${x.yon ? ' ' + (x.yon === 'ust' ? 'üst' : x.yon) : ''}`)
      .join('\n')
    return isaretPlacemark(`İşaretçi ${v.isaretci_no}`, satirlar,
      `<Point><coordinates>${v.lng},${v.lat},0</coordinates></Point>`)
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xmlKacir(bolge?.ad || 'Sulama sahası')}</name>
  <description>${xmlKacir(`Sulama Takip Sistemi — ${new Date().toLocaleDateString('tr-TR')}`)}</description>
${[
  klasor('Parseller', parselIsaretleri),
  klasor('Boru hatları', boruIsaretleri),
  klasor('Saha noktaları', noktaIsaretleri),
  klasor('Vanalar', vanaIsaretleri)
].filter(Boolean).join('\n')}
</Document>
</kml>
`
}

// ── VANA İŞARETÇİLERİ ──

// "İşaretçi 34" → 34 · "Vana 12" → 12 · "34" → 34
export function isaretciNoAyristir(ad) {
  const m = String(ad || '').toLocaleLowerCase('tr')
  const etiketli = m.match(/(?:işaretçi|isaretci|vana|nokta|no)\s*[:#-]?\s*(\d+)/)
  if (etiketli) return Number(etiketli[1])
  const tum = m.match(/\d+/g)
  return tum ? Number(tum[tum.length - 1]) : null
}

// Sahada yazılan açıklama satırını çözer:
//   "32 alt" · "6+2 alt" · "50lik 6" · "9 normal" · "7 75lik artırma"
function aciklamaSatiriAyristir(ham) {
  const satir = { ham, yon: null, fiskiye: null, toplama: false, cap: null, etiket: null, hata: false }
  let m = ham.toLocaleLowerCase('tr')

  // Çap ifadeleri boru kalınlığıdır, fıskiye sayısı değildir: "50lik", "75'lik"
  const capEsl = m.match(/(\d+)\s*['’]?\s*l[iıuü]k/)
  if (capEsl) {
    satir.cap = capEsl[1]
    m = m.replace(/(\d+)\s*['’]?\s*l[iıuü]k/g, ' ')
  }

  if (/üst|ust/.test(m)) satir.yon = 'ust'
  else if (/alt/.test(m)) satir.yon = 'alt'

  if (/akıllı|akilli/.test(m)) satir.etiket = 'akilli'
  else if (/artır|artir/.test(m)) satir.etiket = 'artirma'
  else if (/hortum/.test(m)) satir.etiket = 'hortum'
  else if (/normal/.test(m)) satir.etiket = 'normal'

  // "(toplam 25)" yazılmışsa o kesindir
  const toplamEsl = m.match(/toplam\s*:?\s*(\d+)/)
  if (toplamEsl) {
    satir.fiskiye = Number(toplamEsl[1])
    return satir
  }

  // "6+2" → 8 (sahada parça parça sayılmış)
  const toplamaEsl = m.match(/\d+(?:\s*\+\s*\d+)+/)
  if (toplamaEsl) {
    satir.fiskiye = toplamaEsl[0].split('+').reduce((t, x) => t + Number(x.trim()), 0)
    satir.toplama = true
    return satir
  }

  const sayi = m.match(/\d+/)
  if (sayi) satir.fiskiye = Number(sayi[0])
  else satir.hata = true

  return satir
}

/*
 * KML <description> alanını vana satırlarına çevirir.
 * Dönen yapı: { satirlar, oneri, notlar, hataliSayisi }
 *   oneri = 'yan_sira' → satırlar yön değil sıra tarifi ("9 normal / 7 artırma / 4 hortum")
 *   notlar → açıklamada sayı dışında bilgi varsa orijinal metin (vana notuna yazılır)
 */
export function vanaAciklamaAyristir(aciklama) {
  const ham = String(aciklama || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')

  const parcalar = ham.split(/[\n;]+/).map(s => s.trim()).filter(Boolean)

  if (parcalar.length === 0) {
    return { satirlar: [{ ham: '', yon: null, fiskiye: null, toplama: false, cap: null, etiket: null, hata: true }],
             oneri: null, notlar: null, hataliSayisi: 1 }
  }

  const satirlar = parcalar.map(aciklamaSatiriAyristir)

  // Hiçbir satırda yön yok ama sıra tarifi varsa: tek vananın yan sıraları
  const yonYok = satirlar.every(s => !s.yon)
  const siraTarifi = satirlar.some(s => s.etiket === 'artirma' || s.etiket === 'hortum')
  const oneri = (satirlar.length > 1 && yonYok && siraTarifi) ? 'yan_sira' : null

  // Sayıdan başka bilgi varsa orijinal metin nota geçsin
  const ozelBilgi = satirlar.some(s => s.toplama || s.cap || s.etiket)
  const notlar = ozelBilgi ? ham.trim().replace(/\s*\n\s*/g, ' / ') : null

  return {
    satirlar,
    oneri,
    notlar,
    hataliSayisi: satirlar.filter(s => s.hata).length
  }
}

/*
 * KML metnini ayrıştırır.
 * Dönen yapı: { parseller, cizgiler, noktalar, hata }
 *   parseller: { ad, koordinatlar:[[lng,lat]], nokta_sayisi, alan_m2 }
 *   cizgiler : { ad, koordinatlar:[[lat,lng]], nokta_sayisi, uzunluk_m }
 *   noktalar : { ad, lat, lng, tip, aciklama }
 */
export function kmlAyristir(metin) {
  const sonuc = { parseller: [], cizgiler: [], noktalar: [], hata: null }

  if (!metin || !metin.trim()) {
    sonuc.hata = 'Dosya boş.'
    return sonuc
  }

  let dok
  try {
    dok = new DOMParser().parseFromString(metin, 'text/xml')
  } catch (e) {
    sonuc.hata = 'Dosya okunamadı: ' + e.message
    return sonuc
  }

  if (dok.getElementsByTagName('parsererror').length > 0) {
    sonuc.hata = 'Geçerli bir KML dosyası değil (XML ayrıştırılamadı).'
    return sonuc
  }

  const isaretler = dok.getElementsByTagNameNS('*', 'Placemark')
  if (isaretler.length === 0) {
    sonuc.hata = 'Dosyada <Placemark> bulunamadı. Google Earth\'ten "KML olarak kaydet" ile dışa aktarın.'
    return sonuc
  }

  for (const im of isaretler) {
    const ad = dogrudanMetin(im, 'name') || 'Adsız'
    const aciklama = dogrudanMetin(im, 'description')

    // Bir işaretçide birden fazla geometri olabilir (MultiGeometry)
    const poligonlar = im.getElementsByTagNameNS('*', 'Polygon')
    for (let i = 0; i < poligonlar.length; i++) {
      const dis = poligonlar[i].getElementsByTagNameNS('*', 'outerBoundaryIs')[0] || poligonlar[i]
      const koordinatlar = ilkKoordinatlar(dis)
      if (koordinatlar.length < 3) continue
      sonuc.parseller.push({
        ad: poligonlar.length > 1 ? `${ad} (${i + 1})` : ad,
        koordinatlar,
        nokta_sayisi: koordinatlar.length,
        alan_m2: poligonAlanM2(koordinatlar)
      })
    }

    const cizgiler = im.getElementsByTagNameNS('*', 'LineString')
    for (let i = 0; i < cizgiler.length; i++) {
      const ham = ilkKoordinatlar(cizgiler[i])
      if (ham.length < 2) continue
      // Leaflet polyline sırası: [lat, lng]
      const koordinatlar = ham.map(([lng, lat]) => [lat, lng])
      sonuc.cizgiler.push({
        ad: cizgiler.length > 1 ? `${ad} (${i + 1})` : ad,
        koordinatlar,
        nokta_sayisi: koordinatlar.length,
        uzunluk_m: cizgiUzunlukM(koordinatlar)
      })
    }

    const noktalar = im.getElementsByTagNameNS('*', 'Point')
    for (let i = 0; i < noktalar.length; i++) {
      const ham = ilkKoordinatlar(noktalar[i])
      if (ham.length === 0) continue
      const [lng, lat] = ham[0]
      sonuc.noktalar.push({
        ad: noktalar.length > 1 ? `${ad} (${i + 1})` : ad,
        lat,
        lng,
        tip: noktaTipiTahmin(ad),
        aciklama
      })
    }
  }

  if (sonuc.parseller.length === 0 && sonuc.cizgiler.length === 0 && sonuc.noktalar.length === 0) {
    sonuc.hata = 'Dosyada içe aktarılabilir alan, çizgi veya nokta bulunamadı.'
  }

  return sonuc
}
