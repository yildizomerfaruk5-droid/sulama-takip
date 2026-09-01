/*
 * Hava durumu okuma katmani.
 *
 * VERI NEREDEN GELIR: Tarayici HICBIR sey cekmez. Saatlik sicaklik
 * verisini Supabase icindeki pg_cron isi (hava_durumu_istek /
 * hava_durumu_topla) Open-Meteo'dan alip hava_durumu tablosuna yazar.
 * Bkz. sql/supabase_migration_hava_durumu.sql
 *
 * Burasi yalnizca OKUR. Tablo yoksa veya veri henuz dusmemisse
 * sessizce null doner; pano bundan etkilenmez.
 */
import { supabase } from './supabase.js'

// Saatlik veri saat basi duser. Son kayit bundan eskiyse "guncel" saymayiz.
const BAYATLAMA_SAAT = 3

/**
 * Bolgenin su ANA en yakin gecmis sicakligi + son 24 saatin uc degerleri.
 * @returns {Promise<null | {sicaklik:number, zaman:Date, enDusuk:number,
 *                           enYuksek:number, bayat:boolean, rakim:number|null}>}
 */
export async function guncelHavaGetir(bolgeId) {
  if (!bolgeId) return null

  const yirmiDortSaatOnce = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const simdi = new Date().toISOString()

  // Gelecek saatler de tabloda var (forecast_days=1). "Guncel" icin
  // gelecegi disarida birakiyoruz, aksi halde tahmin olculmus gibi gorunur.
  const { data, error } = await supabase
    .from('hava_durumu')
    .select('zaman, sicaklik_c, rakim_m')
    .eq('bolge_id', bolgeId)
    .gte('zaman', yirmiDortSaatOnce)
    .lte('zaman', simdi)
    .order('zaman', { ascending: false })
    .limit(24)

  if (error) {
    // Tablo henuz kurulmamis olabilir — pano calismaya devam etsin.
    console.warn('Hava durumu okunamadı:', error.message)
    return null
  }
  if (!data || data.length === 0) return null

  const sicakliklar = data
    .map(k => k.sicaklik_c)
    .filter(s => s != null)
    .map(Number)

  if (sicakliklar.length === 0) return null

  const son = data.find(k => k.sicaklik_c != null)
  const sonZaman = new Date(son.zaman)

  return {
    sicaklik: Number(son.sicaklik_c),
    zaman: sonZaman,
    enDusuk: Math.min(...sicakliklar),
    enYuksek: Math.max(...sicakliklar),
    rakim: son.rakim_m != null ? Number(son.rakim_m) : null,
    bayat: Date.now() - sonZaman.getTime() > BAYATLAMA_SAAT * 3600 * 1000
  }
}

/**
 * Grafik/analiz icin ham saatlik seri.
 * @param {number} saat kac saat geriye bakilacak
 */
export async function havaGecmisiGetir(bolgeId, saat = 48) {
  if (!bolgeId) return []

  const baslangic = new Date(Date.now() - saat * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from('hava_durumu')
    .select('zaman, sicaklik_c')
    .eq('bolge_id', bolgeId)
    .gte('zaman', baslangic)
    .order('zaman')
    .limit(2000)

  if (error) {
    console.warn('Hava geçmişi okunamadı:', error.message)
    return []
  }
  return (data || []).filter(k => k.sicaklik_c != null)
}

/** 24.7 -> "24,7 °C" (Turkce ondalik ayraci) */
export function sicaklikYaz(c) {
  if (c == null || Number.isNaN(c)) return '—'
  return `${c.toFixed(1).replace('.', ',')} °C`
}

// ── PANO KARTINI DOLDUR ──
// Hem yönetici panosu (main.js) hem izleyici panosu (viewer.js) kullanır.
// Kart yer tutucu olarak render edilir, veri SONRADAN düşer; böylece
// hava sorgusu panonun açılmasını bekletmez.
// Hata/veri yokluğunda kart sessizce "—" kalır — pano akışı etkilenmez.
export async function havaKartiniDoldur(bolgeId) {
  const degerEl = document.getElementById('hava-deger')
  const altEl = document.getElementById('hava-alt')
  if (!degerEl) return

  let hava = null
  try {
    hava = await guncelHavaGetir(bolgeId)
  } catch (e) {
    console.warn('Hava kartı doldurulamadı:', e?.message || e)
  }

  // Bu sırada pano yeniden çizilmiş olabilir — eleman hâlâ ayakta mı?
  if (!document.body.contains(degerEl)) return

  if (!hava) {
    degerEl.textContent = '—'
    if (altEl) altEl.textContent = 'Veri yok'
    return
  }

  degerEl.textContent = sicaklikYaz(hava.sicaklik)

  if (altEl) {
    const saat = hava.zaman.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    const uc = `24s: ${sicaklikYaz(hava.enDusuk)} / ${sicaklikYaz(hava.enYuksek)}`
    // "bayat" = son kayıt 3 saatten eski; toplama işi aksamış olabilir.
    altEl.textContent = hava.bayat ? `${uc} • ${saat} (güncel değil)` : `${uc} • ${saat}`
  }
}
