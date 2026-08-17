/*
 * ============================================================
 * FOTOGRAF SIKISTIRMA
 *
 * Saha telefonlari 3-8 MB'lik JPEG uretiyor. Yuklemeden once
 * canvas ile kucultup yeniden kodluyoruz: hem yukleme suresi
 * hem Storage kullanimi hem galeri acilisi dusuyor.
 *
 * EXIF YONU: tarayici `createImageBitmap(blob, { imageOrientation:
 * 'from-image' })` ile EXIF donusunu kendisi uygular. Desteklemeyen
 * tarayicilarda <img> ogesine dusuyoruz — modern tarayicilar
 * img cozumlemesinde de EXIF yonunu uygular (image-orientation:
 * from-image varsayilanidir). Boylece fotograf YAN YATMAZ.
 * ============================================================
 */

const UZUN_KENAR = 1600     // px — sahada okunakli, dosya kucuk
const KALITE = 0.75         // JPEG kalitesi
const KUCUK_UZUN_KENAR = 400  // galeri izgarasi icin kucuk surum

/*
 * Blob'u EXIF yonu uygulanmis bir goruntu kaynagina cevirir.
 * Doner: { kaynak, genislik, yukseklik, temizle() }
 */
async function goruntuAc(dosya) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(dosya, { imageOrientation: 'from-image' })
      return { kaynak: bmp, genislik: bmp.width, yukseklik: bmp.height, temizle: () => bmp.close?.() }
    } catch {
      // secenek desteklenmiyorsa <img> yoluna dus
    }
  }

  const url = URL.createObjectURL(dosya)
  try {
    const img = await new Promise((coz, red) => {
      const i = new Image()
      i.onload = () => coz(i)
      i.onerror = () => red(new Error('Görsel okunamadı'))
      i.src = url
    })
    return {
      kaynak: img,
      genislik: img.naturalWidth,
      yukseklik: img.naturalHeight,
      temizle: () => URL.revokeObjectURL(url)
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function canvasaCiz(kaynak, gen, yuk, hedefUzun) {
  const olcek = Math.min(1, hedefUzun / Math.max(gen, yuk))
  const g = Math.max(1, Math.round(gen * olcek))
  const y = Math.max(1, Math.round(yuk * olcek))

  const c = document.createElement('canvas')
  c.width = g
  c.height = y
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(kaynak, 0, 0, g, y)
  return c
}

const canvasBlob = (c, kalite) =>
  new Promise(coz => c.toBlob(b => coz(b), 'image/jpeg', kalite))

/*
 * Fotografi kucultur. Basarisiz olursa ORIJINALI dondurur —
 * sikistirma sorunu yuzunden saha kaydi kaybolmasin.
 *
 * Doner: { dosya, kucuk, orijinalBoyut, yeniBoyut }
 *   dosya : yuklenecek ana gorsel (Blob)
 *   kucuk : galeri izgarasi icin kucuk surum (Blob) — uretilemezse null
 */
export async function fotografiKucult(dosya, { kucukDe = true } = {}) {
  const orijinalBoyut = dosya?.size || 0
  if (!dosya || !dosya.type?.startsWith('image/')) {
    return { dosya, kucuk: null, orijinalBoyut, yeniBoyut: orijinalBoyut }
  }

  let g
  try {
    g = await goruntuAc(dosya)
  } catch {
    return { dosya, kucuk: null, orijinalBoyut, yeniBoyut: orijinalBoyut }
  }

  try {
    const buyukBlob = await canvasBlob(canvasaCiz(g.kaynak, g.genislik, g.yukseklik, UZUN_KENAR), KALITE)

    // Sikistirma ise yaramadiysa (zaten kucuk dosya) orijinali koru
    const ana = (buyukBlob && buyukBlob.size < orijinalBoyut) ? buyukBlob : dosya

    let kucuk = null
    if (kucukDe) {
      kucuk = await canvasBlob(canvasaCiz(g.kaynak, g.genislik, g.yukseklik, KUCUK_UZUN_KENAR), 0.7)
    }

    return { dosya: ana, kucuk, orijinalBoyut, yeniBoyut: ana.size }
  } catch {
    return { dosya, kucuk: null, orijinalBoyut, yeniBoyut: orijinalBoyut }
  } finally {
    g.temizle()
  }
}

/*
 * Supabase Storage'in goruntu donusturme ucu (yalnizca ucretli
 * planlarda acik). Acik degilse istek 400 doner ve <img> onerror
 * ile tam boy surume duser — bu yuzden ayrica kucuk surum de
 * yukluyoruz.
 */
export function kucukSurumAdi(dosyaAdi) {
  return dosyaAdi.replace(/(\.[a-z0-9]+)$/i, '_kucuk$1')
}

// Tam boy URL'den kucuk surum URL'i uret (yukleme sirasinda ayni
// kurala gore yazilir).
export function kucukUrl(tamUrl) {
  if (!tamUrl) return null
  return tamUrl.replace(/(\.[a-z0-9]+)(\?|$)/i, '_kucuk$1$2')
}
