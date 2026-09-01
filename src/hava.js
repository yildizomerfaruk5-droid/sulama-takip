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
const KOLONLAR_TAM = 'zaman, sicaklik_c, nem_yuzde, basinc_hpa, basinc_deniz_hpa, hava_kodu, rakim_m, enlem, boylam'
// 1. asama migration'i calisip 2.'si HENUZ calismamissa yalnizca bunlar vardir.
const KOLONLAR_TEMEL = 'zaman, sicaklik_c, rakim_m, enlem, boylam'

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

  let { data, error } = await sorgu(KOLONLAR_TAM)

  // Nem/basinc kolonlari yoksa (2. asama migration'i henuz calistirilmamis)
  // sicaklikla yetin. Boylece kod ile migration'in calistirilma SIRASI
  // onemli olmaz: kart bos kalmak yerine elindeki veriyi gosterir.
  if (error && /nem_yuzde|basinc_hpa|basinc_deniz_hpa|hava_kodu/.test(error.message || '')) {
    console.warn('Hava: nem/basınç kolonları yok, sıcaklıkla devam ediliyor. ' +
                 'sql/supabase_migration_hava_durumu_2.sql çalıştırılmalı.')
    ;({ data, error } = await sorgu(KOLONLAR_TEMEL))
  }

  if (error) {
    // Tablo henuz kurulmamis olabilir — pano calismaya devam etsin.
    console.warn('Hava durumu okunamadı:', error.message)
    return null
  }
  return havaVeriIsle(data)
}

/**
 * Ham satirlari panonun kullandigi bicime cevirir.
 * Sorgudan AYRI tutuldu: veritabani olmadan gercek satirlarla
 * test edilebilsin diye.
 */
export function havaVeriIsle(data) {
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

  return {
    guncel: {
      sicaklik: Number(son.sicaklik_c),
      nem: son.nem_yuzde != null ? Number(son.nem_yuzde) : null,
      basinc: son.basinc_hpa != null ? Number(son.basinc_hpa) : null,
      basincDeniz: son.basinc_deniz_hpa != null ? Number(son.basinc_deniz_hpa) : null,
      kod: son.hava_kodu != null ? Number(son.hava_kodu) : null,
      rakim: son.rakim_m != null ? Number(son.rakim_m) : null,
      zaman: son.an,
      gunduz: gunduzMu(son.an, enlem, boylam),
      bayat: simdi - son.an.getTime() > BAYATLAMA_SAAT * 3600 * 1000,
      bugunEnYuksek: bugunSic.length ? Math.max(...bugunSic) : null,
      bugunEnDusuk: bugunSic.length ? Math.min(...bugunSic) : null
    },
    saatlik: saatlikSerit(kayitlar, simdi, enlem, boylam),
    gunluk: gunlukOzet(kayitlar),
    gunes: gunesZamanlari(enlem, boylam, new Date()),
    konum: { enlem, boylam }
  }
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

  const saatlikHTML = veri.saatlik.length ? `
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
          ${veri.saatlik.map(s =>
            `<div class="hava-hucre">💧${nemYaz(s.nem)}</div>`).join('')}
        </div>
      </div>
    </div>` : ''

  const detay = (etiket, deger, alt = '') => `
    <div class="hava-detay">
      <div class="hava-detay-etiket">${etiket}</div>
      <div class="hava-detay-deger">${deger}</div>
      ${alt ? `<div class="hava-detay-alt">${alt}</div>` : ''}
    </div>`

  const gunlukHTML = veri.gunluk.length ? `
    <div class="hava-gunluk">
      ${veri.gunluk.map(gun => {
        const bugun = gunAnahtari(gun.tarih) === gunAnahtari(new Date())
        return `
        <div class="hava-gun${bugun ? ' hava-gun-bugun' : ''}">
          <div class="hava-gun-ad">${gunAdi(gun.tarih)}</div>
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
    </div>

    ${gunlukHTML}

    <div class="hava-kaynak">
      Kaynak: Open-Meteo · saat başı otomatik kaydedilir
    </div>
  `
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
