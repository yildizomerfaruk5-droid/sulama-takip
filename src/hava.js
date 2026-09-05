/*
 * Hava durumu okuma ve gosterim katmani.
 *
 * VERI NEREDEN GELIR: Tarayici Open-Meteo'ya HICBIR istek atmaz. Saatlik
 * veriyi Supabase icindeki pg_cron isi (hava_durumu_istek /
 * hava_durumu_topla) cekip hava_durumu tablosuna yazar. Burasi yalnizca
 * OKUR. Tablo yoksa veya veri henuz dusmemisse sessizce bos doner;
 * pano bundan etkilenmez.
 *
 * Bkz. sql/supabase_migration_hava_durumu.sql   (sicaklik)
 *      sql/supabase_migration_hava_durumu_2.sql (nem, basinc, hava kodu)
 */
import { supabase } from './supabase.js'

// Saatlik veri saat basi duser. Son kayit bundan eskiyse "guncel" saymayiz.
const BAYATLAMA_SAAT = 3

// Gunluk tabloda kac gun geriye bakilir (veri biriktikce dolar)
const GUNLUK_GERI = 7

// ─────────────────────────────────────────────────────────────
// BICIMLENDIRME
// ─────────────────────────────────────────────────────────────

/** 24.7 -> "24,7 °C" (Turkce ondalik ayraci) */
export function sicaklikYaz(c) {
  if (c == null || Number.isNaN(c)) return '—'
  return `${Number(c).toFixed(1).replace('.', ',')} °C`
}

/** 24.7 -> "25°" (serit ve gunluk tablo icin kisa hali) */
export function dereceKisa(c) {
  if (c == null || Number.isNaN(c)) return '—'
  return `${Math.round(Number(c))}°`
}

/** 41 -> "%41" */
export function nemYaz(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `%${Math.round(Number(n))}`
}

/**
 * Ciy noktasi (Magnus-Tetens). Sicaklik ve bagil nemden TUREYEN bir
 * deger; ayrica cekilmesi gerekmez. Telefondaki hava uygulamasiyla
 * dogrulandi: 18 °C / %48 -> 6,8 °C (uygulama "7°" diyor).
 */
export function ciyNoktasi(t, nem) {
  if (t == null || nem == null || nem <= 0) return null
  const g = Math.log(nem / 100) + (17.625 * t) / (243.04 + t)
  return (243.04 * g) / (17.625 - g)
}

/** Sure araligini "13 sa 1 dk" olarak yazar */
export function sureYaz(ms) {
  if (ms == null || ms < 0) return '—'
  const dk = Math.round(ms / 60000)
  const sa = Math.floor(dk / 60)
  return sa ? `${sa} sa ${dk % 60} dk` : `${dk} dk`
}

/** 1013.7 -> "1013,7 hPa" */
export function basincYaz(b) {
  if (b == null || Number.isNaN(b)) return '—'
  return `${Number(b).toFixed(1).replace('.', ',')} hPa`
}

/** 2.4 -> "2,4 mm" ; 0 -> "0 mm" */
export function yagisYaz(mm) {
  if (mm == null || Number.isNaN(mm)) return '—'
  const v = Number(mm)
  return v === 0 ? '0 mm' : `${v.toFixed(1).replace('.', ',')} mm`
}

/** 7.4 -> "7,4 km/h" */
export function hizYaz(kmh) {
  if (kmh == null || Number.isNaN(kmh)) return '—'
  return `${Number(kmh).toFixed(1).replace('.', ',')} km/h`
}

/** 41560 (metre) -> "41,6 km" */
export function gorunurlukYaz(m) {
  if (m == null || Number.isNaN(m)) return '—'
  return `${(Number(m) / 1000).toFixed(1).replace('.', ',')} km`
}

// Ruzgarin GELDIGI yon. 8 ana yon yeterli; 16'ya bolmek panoda
// okunurluk kazandirmiyor.
const YONLER = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu',
                'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı']
// Ayrilma hali ayri tutuluyor: yon adlari cins isim, kesme isareti almaz
// ("Kuzeyden", "Kuzey'dan" DEGIL) ve unlu uyumu yone gore degisiyor.
const YON_DEN = ['Kuzeyden', 'Kuzeydoğudan', 'Doğudan', 'Güneydoğudan',
                 'Güneyden', 'Güneybatıdan', 'Batıdan', 'Kuzeybatıdan']
const YON_OK = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘']  // ruzgarin GITTIGI yon

/** 68 -> { ad: 'Doğu', den: 'Doğudan', ok: '←' } */
export function ruzgarYonu(derece) {
  if (derece == null || Number.isNaN(derece)) return null
  const i = Math.round(Number(derece) / 45) % 8
  return { ad: YONLER[i], den: YON_DEN[i], ok: YON_OK[i] }
}

// Dunya Saglik Orgutu esikleri
/** 7.25 -> "Yüksek" */
export function uvSeviye(uv) {
  if (uv == null || Number.isNaN(uv)) return null
  const u = Number(uv)
  if (u < 3) return 'Düşük'
  if (u < 6) return 'Orta'
  if (u < 8) return 'Yüksek'
  if (u < 11) return 'Çok yüksek'
  return 'Aşırı'
}

/** 1.15 -> "1,2" */
export function uvYaz(uv) {
  if (uv == null || Number.isNaN(uv)) return '—'
  return Number(uv).toFixed(1).replace('.', ',')
}

// ─────────────────────────────────────────────────────────────
// WMO HAVA KODLARI
// Open-Meteo weather_code alani. Tam liste degil; gruplandirilmis.
// ─────────────────────────────────────────────────────────────
const KODLAR = [
  [[0],            'Açık',              '☀️', '🌙'],
  [[1],            'Az bulutlu',        '🌤️', '🌙'],
  [[2],            'Parçalı bulutlu',   '⛅',  '☁️'],
  [[3],            'Çok bulutlu',       '☁️', '☁️'],
  [[45, 48],       'Sisli',             '🌫️', '🌫️'],
  [[51, 53, 55],   'Çiseliyor',         '🌦️', '🌧️'],
  [[56, 57],       'Donan çiseleme',    '🌧️', '🌧️'],
  [[61, 63, 65],   'Yağmurlu',          '🌧️', '🌧️'],
  [[66, 67],       'Donan yağmur',      '🌧️', '🌧️'],
  [[71, 73, 75],   'Kar yağışlı',       '🌨️', '🌨️'],
  [[77],           'Kar taneli',        '🌨️', '🌨️'],
  [[80, 81, 82],   'Sağanak yağışlı',   '🌦️', '🌧️'],
  [[85, 86],       'Kar sağanağı',      '🌨️', '🌨️'],
  [[95],           'Gök gürültülü',     '⛈️', '⛈️'],
  [[96, 99],       'Dolu / fırtına',    '⛈️', '⛈️']
]

/**
 * WMO kodunu metne ve ikona cevirir.
 * @param {number|null} kod
 * @param {boolean} gunduz gece/gunduz ikonu icin
 */
export function havaKodu(kod, gunduz = true) {
  // Kod yoksa UYDURMA. "Acik/gunesli" demek elimizde olmayan bir bilgiyi
  // iddia etmek olur; null donup her cagri yeri kendi yedegini secer.
  if (kod == null) return { metin: null, ikon: null }
  const k = Number(kod)
  for (const [kodlar, metin, gIkon, geceIkon] of KODLAR) {
    if (kodlar.includes(k)) return { metin, ikon: gunduz ? gIkon : geceIkon }
  }
  return { metin: null, ikon: null }
}

// ─────────────────────────────────────────────────────────────
// GUNES DOGUMU / BATIMI
// Wikipedia "sunrise equation". Tamamen yerel hesap — ag erisimi yok,
// ek veri kolonu gerekmiyor. Kayseri icin telefon uygulamasiyla
// dakika dakika dogrulandi (1 Eylul 2026 -> 06:04 / 19:05).
// ─────────────────────────────────────────────────────────────
export function gunesZamanlari(enlem, boylam, tarih = new Date()) {
  if (enlem == null || boylam == null) return null
  const RAD = Math.PI / 180
  const jd = tarih.getTime() / 86400000 + 2440587.5
  const n = Math.ceil(jd - 2451545.0 + 0.0008)
  const jYildiz = n - boylam / 360                          // ortalama gunes zamani
  const M = (357.5291 + 0.98560028 * jYildiz) % 360         // gunes ortalama anomalisi
  const C = 1.9148 * Math.sin(M * RAD) + 0.0200 * Math.sin(2 * M * RAD)
          + 0.0003 * Math.sin(3 * M * RAD)                  // merkez denklemi
  const lam = (M + C + 180 + 102.9372) % 360                // ekliptik boylam
  const jGecis = 2451545.0 + jYildiz + 0.0053 * Math.sin(M * RAD)
               - 0.0069 * Math.sin(2 * lam * RAD)           // gunes gecisi (ogle)
  const sinD = Math.sin(lam * RAD) * Math.sin(23.4397 * RAD)
  const cosD = Math.cos(Math.asin(sinD))
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(enlem * RAD) * sinD)
             / (Math.cos(enlem * RAD) * cosD)
  if (cosW > 1 || cosW < -1) return null                    // kutup gunu/gecesi
  const w = Math.acos(cosW) / RAD
  const gun = j => new Date((j - 2440587.5) * 86400000)
  return { dogus: gun(jGecis - w / 360), batis: gun(jGecis + w / 360) }
}

/** Verilen an gunduz mu? (ikon secimi icin) */
function gunduzMu(an, enlem, boylam) {
  const g = gunesZamanlari(enlem, boylam, an)
  if (!g) return true
  return an >= g.dogus && an <= g.batis
}

// ─────────────────────────────────────────────────────────────
// VERI OKUMA
// ─────────────────────────────────────────────────────────────

/**
 * Panonun ihtiyaci olan her seyi TEK sorguda getirir.
 * Pencere: son 7 gun + ileriye dogru elde ne varsa (tahmin).
 */
// Kolon kumeleri migration asamalarina karsilik gelir. Sorgu en genisten
// baslar, kolon bulunamazsa bir alt kademeye duser. Boylece kodun ve
// migration'larin calistirilma SIRASI onemli olmaz.
const KOLONLAR = [
  // 5. asama: ET0 ve VPD
  'zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa, hava_kodu, ' +
  'ruzgar_hiz_kmh, ruzgar_yon, ruzgar_hamle_kmh, uv_index, gorunurluk_m, ' +
  'yagis_ihtimal_yuzde, yagis_mm, et0_mm, vpd_kpa, rakim_m, enlem, boylam',
  // 4. asama: yagis ihtimali ve miktari
  'zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa, hava_kodu, ' +
  'ruzgar_hiz_kmh, ruzgar_yon, ruzgar_hamle_kmh, uv_index, gorunurluk_m, ' +
  'yagis_ihtimal_yuzde, yagis_mm, rakim_m, enlem, boylam',
  // 3. asama: ruzgar, uv, gorunurluk
  'zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa, hava_kodu, ' +
  'ruzgar_hiz_kmh, ruzgar_yon, ruzgar_hamle_kmh, uv_index, gorunurluk_m, ' +
  'rakim_m, enlem, boylam',
  // 2. asama: nem, basinc, hava kodu
  'zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa, hava_kodu, rakim_m, enlem, boylam',
  // 1. asama: yalnizca sicaklik
  'zaman, sicaklik_c, rakim_m, enlem, boylam'
]

export async function havaPanoVerisi(bolgeId) {
  if (!bolgeId) return null

  const basla = new Date(Date.now() - GUNLUK_GERI * 86400000).toISOString()

  const sorgu = kolonlar => supabase
    .from('hava_durumu')
    .select(kolonlar)
    .eq('bolge_id', bolgeId)
    .gte('zaman', basla)
    .order('zaman')
    .limit(2000)

  let data = null
  let error = null
  for (let kademe = 0; kademe < KOLONLAR.length; kademe++) {
    ;({ data, error } = await sorgu(KOLONLAR[kademe]))
    if (!error) break
    // "column ... does not exist" -> bir alt kademeyi dene.
    if (!/does not exist|column/i.test(error.message || '')) break
    if (kademe < KOLONLAR.length - 1) {
      console.warn(`Hava: bazı kolonlar yok, daha dar kümeyle deneniyor ` +
                   `(sql/supabase_migration_hava_durumu_${KOLONLAR.length - kademe}.sql çalıştırılmalı).`)
    }
  }

  if (error) {
    // Tablo henuz kurulmamis olabilir — pano calismaya devam etsin.
    console.warn('Hava durumu okunamadı:', error.message)
    return null
  }

  return havaVeriIsle(data, await gunlukGetir(bolgeId))
}

/**
 * Gunluk tahmin tablosu (5. asama). Tablo yoksa null doner ve gunluk
 * ozet eskisi gibi saatlik satirlardan turetilir — pano bozulmaz.
 */
async function gunlukGetir(bolgeId) {
  const bas = new Date(Date.now() - GUNLUK_GERI * 86400000)
  const { data, error } = await supabase
    .from('hava_durumu_gunluk')
    .select('tarih, hava_kodu, sicaklik_max, sicaklik_min, yagis_mm, ' +
            'yagis_ihtimal_max, et0_mm, ruzgar_max_kmh, uv_max, gun_dogumu, gun_batimi')
    .eq('bolge_id', bolgeId)
    .gte('tarih', bas.toISOString().slice(0, 10))
    .order('tarih')
    .limit(60)

  if (error) {
    console.warn('Hava: günlük tahmin tablosu yok, günlük özet saatlik ' +
                 'veriden türetiliyor (sql/supabase_migration_hava_durumu_5.sql).')
    return null
  }
  return data && data.length ? data : null
}

/**
 * Ham satirlari panonun kullandigi bicime cevirir.
 * Sorgudan AYRI tutuldu: veritabani olmadan gercek satirlarla
 * test edilebilsin diye.
 */
export function havaVeriIsle(data, gunlukSatirlar = null) {
  if (!data || data.length === 0) return null

  const kayitlar = data.map(k => ({ ...k, an: new Date(k.zaman) }))
  const simdi = Date.now()

  // Guncel = simdiye kadarki EN SON olcum. Ilerideki satirlar tahmindir,
  // "su anki hava" olarak gosterilmemeli.
  const gecmis = kayitlar.filter(k => k.an.getTime() <= simdi && k.sicaklik_c != null)
  const son = gecmis.length ? gecmis[gecmis.length - 1] : null
  if (!son) return null

  const enlem = son.enlem ?? null
  const boylam = son.boylam ?? null

  // Bugunun (yerel gun) uc degerleri — telefondaki "↑25° / ↓8°" satiri
  const bugunAnahtar = gunAnahtari(new Date())
  const bugun = kayitlar.filter(k => gunAnahtari(k.an) === bugunAnahtar && k.sicaklik_c != null)
  const bugunSic = bugun.map(k => Number(k.sicaklik_c))

  // UV gece 0'dir; "su anki UV" tek basina yaniltici olur. Gunun zirvesi
  // gerekli. Ruzgar hamlesi icin de ayni sey gecerli.
  const enBuyuk = alan => {
    const d = bugun.map(k => k[alan]).filter(v => v != null).map(Number)
    return d.length ? Math.max(...d) : null
  }

  return {
    guncel: {
      sicaklik: Number(son.sicaklik_c),
      nem: son.nem_yuzde != null ? Number(son.nem_yuzde) : null,
      basinc: son.basinc_hpa != null ? Number(son.basinc_hpa) : null,
      basincDeniz: son.basinc_deniz_hpa != null ? Number(son.basinc_deniz_hpa) : null,
      kod: son.hava_kodu != null ? Number(son.hava_kodu) : null,
      ruzgar: son.ruzgar_hiz_kmh != null ? Number(son.ruzgar_hiz_kmh) : null,
      ruzgarYon: son.ruzgar_yon != null ? Number(son.ruzgar_yon) : null,
      ruzgarHamle: son.ruzgar_hamle_kmh != null ? Number(son.ruzgar_hamle_kmh) : null,
      uv: son.uv_index != null ? Number(son.uv_index) : null,
      gorunurluk: son.gorunurluk_m != null ? Number(son.gorunurluk_m) : null,
      yagisIhtimal: son.yagis_ihtimal_yuzde != null ? Number(son.yagis_ihtimal_yuzde) : null,
      // Gecmis 24 saatte tarlaya DUSEN su. Sulama karari icin ihtimalden
      // daha dogrudan bir bilgi: "dogadan ne kadar su aldi?"
      son24Yagis: pencereToplam(kayitlar, simdi - 86400000, simdi),
      // Ilerideki 24 saatin en yuksek ihtimali ve beklenen toplami
      sonraki24Ihtimal: pencereEnBuyuk(kayitlar, simdi, simdi + 86400000, 'yagis_ihtimal_yuzde'),
      sonraki24Yagis: pencereToplam(kayitlar, simdi, simdi + 86400000),
      bugunEnYuksekUv: enBuyuk('uv_index'),
      bugunEnYuksekHamle: enBuyuk('ruzgar_hamle_kmh'),
      rakim: son.rakim_m != null ? Number(son.rakim_m) : null,
      zaman: son.an,
      gunduz: gunduzMu(son.an, enlem, boylam),
      bayat: simdi - son.an.getTime() > BAYATLAMA_SAAT * 3600 * 1000,
      bugunEnYuksek: bugunSic.length ? Math.max(...bugunSic) : null,
      bugunEnDusuk: bugunSic.length ? Math.min(...bugunSic) : null
    },
    saatlik: saatlikSerit(kayitlar, simdi, enlem, boylam),
    // Gunluk tablo varsa ONDAN gelir (15 gun ileri, toplamlari Open-Meteo
    // hesaplamis). Yoksa eskisi gibi saatlik satirlardan turetilir.
    gunluk: gunlukSatirlar ? gunlukTablodan(gunlukSatirlar) : gunlukOzet(kayitlar),
    suDengesi: suDengesiHesapla(gunlukSatirlar),
    // Gunes saatini once API'den al (gunluk tabloda), yoksa yerel hesap.
    // Ikisi Kayseri'de 1 dakika icinde ortusuyor; API olcut kabul edilir.
    gunes: gunesSaatleri(gunlukSatirlar, enlem, boylam),
    konum: { enlem, boylam }
  }
}

/** Gunluk tablo satirlarini panelin bicimine cevirir */
function gunlukTablodan(satirlar) {
  return satirlar.map(g => ({
    // 'YYYY-MM-DD' -> yerel gun. new Date('2026-09-05') UTC gece yarisi
    // demektir ve saat dilimine gore bir onceki gune kayabilir; bu yuzden
    // parcalardan kuruluyor.
    tarih: new Date(...g.tarih.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))),
    enYuksek: g.sicaklik_max != null ? Number(g.sicaklik_max) : null,
    enDusuk: g.sicaklik_min != null ? Number(g.sicaklik_min) : null,
    yagis: g.yagis_mm != null ? Number(g.yagis_mm) : null,
    yagisIhtimal: g.yagis_ihtimal_max != null ? Number(g.yagis_ihtimal_max) : null,
    et0: g.et0_mm != null ? Number(g.et0_mm) : null,
    kod: g.hava_kodu != null ? Number(g.hava_kodu) : null
  }))
}

/**
 * SU DENGESI = dusen yagis − buharlasan su (ET0).
 * Negatif deger tarlanin acigi demektir.
 * Gecmis 7 gun olculen, sonraki 7 gun beklenendir.
 */
function suDengesiHesapla(satirlar) {
  if (!satirlar || !satirlar.length) return null
  const bugun = yerelGunMetni(new Date())

  const topla = (suzgec) => {
    const d = satirlar.filter(suzgec)
    if (!d.length) return null
    const et0 = d.reduce((t, g) => t + (g.et0_mm != null ? Number(g.et0_mm) : 0), 0)
    const yagis = d.reduce((t, g) => t + (g.yagis_mm != null ? Number(g.yagis_mm) : 0), 0)
    return { gun: d.length, et0, yagis, denge: yagis - et0 }
  }

  // Ileri pencere de 7 gun: "son 7 gun" ile karsilastirilabilir olsun.
  // Tabloda 15 gun var ama 16 gunluk bir toplam gecmisle kiyaslanamaz.
  const yediSonra = yerelGunMetni(new Date(Date.now() + 7 * 86400000))

  return {
    gecmis: topla(g => g.tarih < bugun),
    gelecek: topla(g => g.tarih >= bugun && g.tarih < yediSonra)
  }
}

/** Yerel gunu 'YYYY-MM-DD' olarak verir (UTC'ye kaymadan) */
function yerelGunMetni(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Gunes saatleri: once gunluk tablodaki API degeri, sonra yerel hesap */
function gunesSaatleri(satirlar, enlem, boylam) {
  const bugun = satirlar?.find(g => g.tarih === yerelGunMetni(new Date()))
  if (bugun?.gun_dogumu && bugun?.gun_batimi) {
    return { dogus: new Date(bugun.gun_dogumu), batis: new Date(bugun.gun_batimi) }
  }
  return gunesZamanlari(enlem, boylam, new Date())
}

/** Verilen zaman araligindaki toplam yagis (mm) */
function pencereToplam(kayitlar, bas, son) {
  const d = kayitlar.filter(k => k.an.getTime() > bas && k.an.getTime() <= son
                              && k.yagis_mm != null)
  return d.length ? d.reduce((t, k) => t + Number(k.yagis_mm), 0) : null
}

/** Verilen zaman araligindaki en buyuk deger */
function pencereEnBuyuk(kayitlar, bas, son, alan) {
  const d = kayitlar.filter(k => k.an.getTime() > bas && k.an.getTime() <= son
                              && k[alan] != null).map(k => Number(k[alan]))
  return d.length ? Math.max(...d) : null
}

/** Su anki saatten ileriye dogru en fazla 24 saat (tahmin seridi) */
function saatlikSerit(kayitlar, simdi, enlem, boylam) {
  const saatBasi = new Date(simdi)
  saatBasi.setMinutes(0, 0, 0)
  return kayitlar
    .filter(k => k.an >= saatBasi && k.sicaklik_c != null)
    .slice(0, 24)
    .map(k => ({
      an: k.an,
      sicaklik: Number(k.sicaklik_c),
      nem: k.nem_yuzde != null ? Number(k.nem_yuzde) : null,
      yagisIhtimal: k.yagis_ihtimal_yuzde != null ? Number(k.yagis_ihtimal_yuzde) : null,
      kod: k.hava_kodu != null ? Number(k.hava_kodu) : null,
      gunduz: gunduzMu(k.an, enlem, boylam)
    }))
}

/** Yerel gun anahtari — saat dilimi kaymasi olmadan gunleri ayirmak icin */
function gunAnahtari(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * Gunluk en dusuk/en yuksek ozeti.
 * Veri saklandigi icin bu tablo zamanla kendiliginden uzar:
 * ilk gun 2-3 satir, bir hafta sonra 7+ satir.
 */
function gunlukOzet(kayitlar) {
  const gunler = new Map()
  for (const k of kayitlar) {
    if (k.sicaklik_c == null) continue
    const anahtar = gunAnahtari(k.an)
    if (!gunler.has(anahtar)) {
      gunler.set(anahtar, { tarih: new Date(k.an), sicakliklar: [], kodlar: [] })
    }
    const g = gunler.get(anahtar)
    g.sicakliklar.push(Number(k.sicaklik_c))
    if (k.hava_kodu != null) g.kodlar.push(Number(k.hava_kodu))
  }

  return [...gunler.values()]
    // Pencerenin iki ucundaki YARIM gunler elenir. Ornegin ileri ucta
    // yalnizca 2 saati bilinen bir gun "↑15° ↓14°" diye cikar ve serin
    // bir gun sanilir; oysa gunun sicak saatleri henuz veride yoktur.
    .filter(g => g.sicakliklar.length >= 20)
    .map(g => ({
    tarih: g.tarih,
    enYuksek: Math.max(...g.sicakliklar),
    enDusuk: Math.min(...g.sicakliklar),
    // Gunu temsil eden kod: en kotu (en yuksek) kod, cunku yagis gunun
    // tamamini kaplamasa da o gunun belirleyici olayidir.
    kod: g.kodlar.length ? Math.max(...g.kodlar) : null
  })).sort((a, b) => a.tarih - b.tarih)
}

// ─────────────────────────────────────────────────────────────
// METRIK KARTI (ust serit)
// ─────────────────────────────────────────────────────────────

/**
 * Panodaki 🌡 kartini doldurur. Kart yer tutucu olarak render edilir,
 * veri SONRADAN duser; boylece hava sorgusu panonun acilmasini bekletmez.
 * Hata/veri yoklugunda kart sessizce "—" kalir.
 */
export async function havaKartiniDoldur(bolge) {
  const degerEl = document.getElementById('hava-deger')
  if (!degerEl) return

  // Bolge nesnesi de kimlik de kabul edilir. Nesne verilirse gunes kutusu
  // hava verisi HIC olmasa bile calisir (koordinat bolgeden gelir).
  const bolgeId = typeof bolge === 'string' ? bolge : bolge?.id
  const bolgeEnlem = typeof bolge === 'object' ? (bolge?.merkez_lat ?? null) : null
  const bolgeBoylam = typeof bolge === 'object' ? (bolge?.merkez_lng ?? null) : null

  let veri = null
  try {
    veri = await havaPanoVerisi(bolgeId)
  } catch (e) {
    console.warn('Hava kartı doldurulamadı:', e?.message || e)
  }

  // Bu sirada pano yeniden cizilmis olabilir — eleman hala ayakta mi?
  if (!document.body.contains(degerEl)) return

  const yaz = (id, metin) => {
    const el = document.getElementById(id)
    if (el) el.textContent = metin
  }
  const panelEl = document.getElementById('hava-panel')

  // ── GÜNEŞ KUTUSU ──
  // Tamamen yerel hesap; hava verisine BAGLI DEGIL. Koordinat hava
  // kaydindan da bolgeden de gelebilir, ikisi de yoksa kutu "—" kalir.
  const enlem = veri?.konum?.enlem ?? bolgeEnlem
  const boylam = veri?.konum?.boylam ?? bolgeBoylam
  const gunes = veri?.gunes ?? gunesZamanlari(enlem, boylam, new Date())
  if (gunes) {
    yaz('hava-gunes', `${saatYaz(gunes.dogus)} / ${saatYaz(gunes.batis)}`)
    const simdi = Date.now()
    yaz('hava-gunes-alt',
      simdi < gunes.dogus.getTime()
        ? `Doğuşa ${sureYaz(gunes.dogus - simdi)}`
        : simdi < gunes.batis.getTime()
          ? `Batışa ${sureYaz(gunes.batis - simdi)}`
          : `Gündüz ${sureYaz(gunes.batis - gunes.dogus)}`)
  } else {
    yaz('hava-gunes', '—')
    yaz('hava-gunes-alt', 'Konum yok')
  }

  if (!veri) {
    degerEl.textContent = '—'
    yaz('hava-alt', 'Veri yok')
    yaz('hava-nem', '—');    yaz('hava-nem-alt', 'Veri yok')
    yaz('hava-basinc', '—'); yaz('hava-basinc-alt', 'Veri yok')
    if (panelEl) panelEl.innerHTML = havaBosHTML()
    return
  }

  const g = veri.guncel
  const durum = havaKodu(g.kod, g.gunduz)

  // ── SICAKLIK KUTUSU ──
  degerEl.textContent = sicaklikYaz(g.sicaklik)
  yaz('hava-ikon', durum.ikon || '🌡')
  const sicaklikAlt = []
  if (durum.metin) sicaklikAlt.push(durum.metin)
  if (g.bugunEnYuksek != null) {
    sicaklikAlt.push(`↑ ${dereceKisa(g.bugunEnYuksek)} / ↓ ${dereceKisa(g.bugunEnDusuk)}`)
  }
  if (g.bayat) sicaklikAlt.push('(güncel değil)')
  yaz('hava-alt', sicaklikAlt.join(' · ') || '—')

  // ── NEM KUTUSU ──
  yaz('hava-nem', nemYaz(g.nem))
  const ciy = ciyNoktasi(g.sicaklik, g.nem)
  yaz('hava-nem-alt', ciy != null ? `Çiy noktası ${dereceKisa(ciy)}` : 'Ölçüm bekleniyor')

  // ── BASINÇ KUTUSU ──
  // Buyuk deger deniz seviyesine indirgenmis olan (telefon uygulamalariyla
  // ayni), altta sahadaki gercek basinc. Ikisi farklidir; bkz. migration 2.
  yaz('hava-basinc', basincYaz(g.basincDeniz))
  yaz('hava-basinc-alt',
    g.basinc != null
      ? `Sahada ${basincYaz(g.basinc)}${g.rakim != null ? ` · ${Math.round(g.rakim)} m` : ''}`
      : 'Ölçüm bekleniyor')

  if (panelEl) panelEl.innerHTML = havaPanelHTML(veri)
}

// ─────────────────────────────────────────────────────────────
// DETAY PANELI
// ─────────────────────────────────────────────────────────────

function havaBosHTML() {
  return `<div class="hava-bos">Hava verisi henüz düşmedi.
    Toplama işi saat başı çalışır.</div>`
}

const SAAT_GEN = 56   // seritteki bir saat hucresinin genisligi (px)
const CIZGI_YUK = 30  // sicaklik cizgisinin yuksekligi (px)

function saatYaz(d) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

/** Sicaklik egrisi — hucrelerle ayni genislikte, o yuzden hizali kayar. */
function sicaklikCizgisi(saatlik) {
  if (saatlik.length < 2) return ''
  const sic = saatlik.map(s => s.sicaklik)
  const enDusuk = Math.min(...sic)
  const enYuksek = Math.max(...sic)
  const aralik = enYuksek - enDusuk || 1
  const gen = saatlik.length * SAAT_GEN

  const noktalar = saatlik.map((s, i) => {
    const x = i * SAAT_GEN + SAAT_GEN / 2
    // Ust/alt 5px pay birakilir ki noktalar kirpilmasin
    const y = 5 + (1 - (s.sicaklik - enDusuk) / aralik) * (CIZGI_YUK - 10)
    return [x, y]
  })

  return `
    <svg class="hava-cizgi" width="${gen}" height="${CIZGI_YUK}"
         viewBox="0 0 ${gen} ${CIZGI_YUK}" aria-hidden="true">
      <polyline points="${noktalar.map(([x, y]) => `${x},${y}`).join(' ')}"
                fill="none" stroke="var(--accent)" stroke-width="1.5"
                stroke-linejoin="round" stroke-linecap="round"/>
      ${noktalar.map(([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--accent)"/>`).join('')}
    </svg>`
}

export function havaPanelHTML(veri) {
  const g = veri.guncel
  const durum = havaKodu(g.kod, g.gunduz)
  const gen = veri.saatlik.length * SAAT_GEN

  // Yagis satiri yalnizca pencerede yagis BEKLENIYORSA cizilir. Kurak bir
  // gunde 24 tane "%0" gostermek serit yuksekligini bosuna buyutur;
  // bilgi kaybolmaz, "Yagis ihtimali" detay karti her zaman durur.
  const yagisBekleniyor = veri.saatlik.some(s => (s.yagisIhtimal || 0) > 0)

  const saatlikHTML = veri.saatlik.length ? `
    <div class="hava-serit-baslik">
      Saatlik tahmin
      <span>— sıcaklık eğrisi ve <b>bağıl nem</b>${yagisBekleniyor ? ', 💧 yağış ihtimali' : ''}</span>
    </div>
    <div class="hava-serit-sar">
      <div class="hava-serit" style="width:${gen}px">
        <div class="hava-satir">
          ${veri.saatlik.map(s =>
            `<div class="hava-hucre">${saatYaz(s.an)}</div>`).join('')}
        </div>
        <div class="hava-satir hava-satir-ikon">
          ${veri.saatlik.map(s =>
            `<div class="hava-hucre">${havaKodu(s.kod, s.gunduz).ikon || '·'}</div>`).join('')}
        </div>
        <div class="hava-satir hava-satir-derece">
          ${veri.saatlik.map(s =>
            `<div class="hava-hucre">${dereceKisa(s.sicaklik)}</div>`).join('')}
        </div>
        ${sicaklikCizgisi(veri.saatlik)}
        <div class="hava-satir hava-satir-nem">
          ${veri.saatlik.map(s => `
            <div class="hava-hucre hava-nem-hucre">
              <div class="hava-nem-cubuk" title="Bağıl nem ${nemYaz(s.nem)}">
                <i style="height:${s.nem != null ? Math.max(2, Math.min(100, s.nem)) : 0}%"></i>
              </div>
              <span>${nemYaz(s.nem)}</span>
            </div>`).join('')}
        </div>
        ${yagisBekleniyor ? `
        <div class="hava-satir hava-satir-yagis">
          ${veri.saatlik.map(s =>
            `<div class="hava-hucre${(s.yagisIhtimal || 0) > 0 ? ' hava-yagis-var' : ''}"
              >${(s.yagisIhtimal || 0) > 0 ? `💧${nemYaz(s.yagisIhtimal)}` : ''}</div>`).join('')}
        </div>` : ''}
      </div>
    </div>` : ''

  // Degeri olmayan kart HIC cizilmez. Ornegin 3. asama migration'i henuz
  // calistirilmamissa Ruzgar/UV/Gorunurluk kartlari uc tane bos "—" olarak
  // durmak yerine yok olur; migration calisinca kendiliginden belirirler.
  const detay = (etiket, deger, alt = '') => (deger == null || deger === '—') ? '' : `
    <div class="hava-detay">
      <div class="hava-detay-etiket">${etiket}</div>
      <div class="hava-detay-deger">${deger}</div>
      ${alt ? `<div class="hava-detay-alt">${alt}</div>` : ''}
    </div>`

  // Listede dunden itibaren gosterilir. Daha eski gunler tabloda durur
  // ve su dengesi hesabina girer, ama listeye konsaydi bugunu ve 15
  // gunluk tahmini asagi iterdi.
  const dun = new Date(Date.now() - 86400000)
  dun.setHours(0, 0, 0, 0)
  const gosterilecek = veri.gunluk.filter(g => g.tarih >= dun)

  const gunlukHTML = gosterilecek.length ? `
    <div class="hava-gunluk">
      ${gosterilecek.map(gun => {
        const bugun = gunAnahtari(gun.tarih) === gunAnahtari(new Date())
        return `
        <div class="hava-gun${bugun ? ' hava-gun-bugun' : ''}">
          <div class="hava-gun-ad">${gunAdi(gun.tarih)}</div>
          <div class="hava-gun-yagis">${
            gun.yagis > 0 ? `💧${yagisYaz(gun.yagis)}`
            : gun.yagisIhtimal > 0 ? `<span class="hava-soluk">%${Math.round(gun.yagisIhtimal)}</span>`
            : ''}</div>
          <div class="hava-gun-ikon">${havaKodu(gun.kod, true).ikon || '·'}</div>
          <div class="hava-gun-derece">
            <span class="hava-yuksek">${dereceKisa(gun.enYuksek)}</span>
            <span class="hava-dusuk">${dereceKisa(gun.enDusuk)}</span>
          </div>
        </div>`
      }).join('')}
    </div>` : ''

  return `
    <div class="hava-ust">
      <div class="hava-simdi">
        <div class="hava-ikon-buyuk">${durum.ikon || '🌡'}</div>
        <div>
          <div class="hava-derece-buyuk">${dereceKisa(g.sicaklik)}</div>
          ${durum.metin ? `<div class="hava-durum-metin">${durum.metin}</div>` : ''}
        </div>
      </div>
      <div class="hava-ozet">
        ${g.bugunEnYuksek != null
          ? `<div>↑ ${dereceKisa(g.bugunEnYuksek)} / ↓ ${dereceKisa(g.bugunEnDusuk)} <span class="hava-soluk">bugün</span></div>`
          : ''}
        ${veri.gunes
          ? `<div class="hava-soluk">🌅 ${saatYaz(veri.gunes.dogus)} · 🌇 ${saatYaz(veri.gunes.batis)}</div>`
          : ''}
        <div class="hava-soluk">Ölçüm: ${saatYaz(g.zaman)}${g.bayat ? ' — güncel değil' : ''}</div>
      </div>
    </div>

    ${saatlikHTML}

    <div class="hava-detay-grid">
      ${suDengesiKarti(veri.suDengesi)}
      ${detay('Nem', nemYaz(g.nem),
              ciyNoktasi(g.sicaklik, g.nem) != null
                ? `Çiy noktası ${dereceKisa(ciyNoktasi(g.sicaklik, g.nem))}` : '')}
      ${detay('Basınç (deniz sev.)', basincYaz(g.basincDeniz),
              g.basinc != null
                ? `Sahada ${basincYaz(g.basinc)}${g.rakim != null ? ` · ${Math.round(g.rakim)} m` : ''}`
                : '')}
      ${veri.gunes ? detay('Gün doğumu / batımı',
              `${saatYaz(veri.gunes.dogus)} / ${saatYaz(veri.gunes.batis)}`,
              `Gündüz ${sureYaz(veri.gunes.batis - veri.gunes.dogus)}`) : ''}
      ${detay('Bugün', g.bugunEnYuksek != null
                ? `${dereceKisa(g.bugunEnYuksek)} / ${dereceKisa(g.bugunEnDusuk)}` : '—',
              'en yüksek / en düşük')}
      ${detay('Rüzgâr', hizYaz(g.ruzgar), ruzgarAlt(g))}
      ${detay('UV', uvYaz(g.uv), uvAlt(g))}
      ${detay('Görünürlük', gorunurlukYaz(g.gorunurluk))}
      ${detay('Yağış ihtimali',
              g.sonraki24Ihtimal != null ? nemYaz(g.sonraki24Ihtimal) : null,
              '24 saat içinde en yüksek')}
      ${detay('Düşen yağış', g.son24Yagis != null ? yagisYaz(g.son24Yagis) : null,
              `son 24 saat${g.sonraki24Yagis ? ` · 24 saatte ${yagisYaz(g.sonraki24Yagis)} bekleniyor` : ''}`)}
    </div>

    ${gunlukHTML}

    <div class="hava-kaynak">
      Kaynak: Open-Meteo · saat başı otomatik kaydedilir
    </div>
  `
}

/** Ruzgar kartinin alt satiri: geldigi yon + ani hamle */
function ruzgarAlt(g) {
  const p = []
  const yon = ruzgarYonu(g.ruzgarYon)
  if (yon) p.push(`${yon.den} ${yon.ok}`)
  // Hamle, fiskiye dagilimini bozan asil etken; ortalamadan ayri gosterilir.
  if (g.ruzgarHamle != null) p.push(`hamle ${hizYaz(g.ruzgarHamle)}`)
  return p.join(' · ')
}

/** UV kartinin alt satiri: seviye + gunun zirvesi (gece UV 0 oldugu icin) */
function uvAlt(g) {
  const p = []
  const s = uvSeviye(g.uv)
  if (s) p.push(s)
  if (g.bugunEnYuksekUv != null) p.push(`bugün en yüksek ${uvYaz(g.bugunEnYuksekUv)}`)
  return p.join(' · ')
}

/**
 * Su dengesi karti. Aci NEGATIF gosterilir: "-30,4 mm" = tarla bu kadar
 * su borclu. Deger mm cinsindendir; sulama SURESINE cevrilmez cunku
 * fiskiyenin saatte kac mm verdigi (uygulama hizi) sistemde kayitli
 * degil. O deger girilirse cevrim eklenebilir.
 */
function suDengesiKarti(d) {
  if (!d || !d.gecmis) return ''
  const gec = d.gecmis
  const isaret = gec.denge > 0 ? '+' : ''
  const alt = [`Buharlaşma ${yagisYaz(gec.et0)} · Yağış ${yagisYaz(gec.yagis)}`]
  if (d.gelecek) {
    alt.push(`önümüzdeki ${d.gelecek.gun} günde ${yagisYaz(Math.abs(d.gelecek.denge))} daha bekleniyor`)
  }
  return `
    <div class="hava-detay hava-detay-genis">
      <div class="hava-detay-etiket">Su dengesi · son ${gec.gun} gün</div>
      <div class="hava-detay-deger ${gec.denge < 0 ? 'hava-acik-deger' : ''}"
        >${isaret}${yagisYaz(gec.denge)}</div>
      <div class="hava-detay-alt">${alt.join(' · ')}</div>
    </div>`
}

function gunAdi(d) {
  const bugun = new Date()
  const dun = new Date(bugun.getTime() - 86400000)
  const yarin = new Date(bugun.getTime() + 86400000)
  if (gunAnahtari(d) === gunAnahtari(bugun)) return 'Bugün'
  if (gunAnahtari(d) === gunAnahtari(dun)) return 'Dün'
  if (gunAnahtari(d) === gunAnahtari(yarin)) return 'Yarın'
  return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })
}
