/*
 * Çevrimdışı veri girişi kuyruğu
 *
 * Tarlada telefon çoğu zaman çekmiyor. Foto + not + gübre girişi
 * cihazda IndexedDB'de bekler, sinyal gelince otomatik gönderilir.
 *
 * KAPSAM — yalnızca "veri girişi":
 *   • fotoğraf
 *   • gübre/ilaç uygulaması (gubre_uygulamalari)
 *   • not — sure_dakika BOŞ olan sulama_kayitlari satırı
 *
 * KUYRUKLANMAZ: hat başlatma/durdurma, süre değiştirme, sistem aç/kapa,
 * tur/zona geçişleri ve sure_dakika DOLU kayıtlar. Bunlar sunucudaki
 * hat_gecis_kontrol()/pg_cron ile senkron olmak zorunda; gecikmeli
 * oynatılırsa aktif hat/tur durumu bozulur. kuyrugaEkle() bu kuralı
 * kodda zorlar (aşağıdaki hata fırlatma).
 *
 * Üç kayıt tek öğede tutulur çünkü gubre_uygulamalari.kayit_id yeni
 * oluşan sulama_kayitlari.id'ye bağlıdır — çevrimdışıyken o id yoktur,
 * gönderim anında çözülür.
 *
 * Yeni bağımlılık yok: ham IndexedDB.
 */
import { supabase } from './supabase.js'

const DB_ADI = 'sulama-offline'
const DB_SURUM = 1
const DEPO = 'kuyruk'

// Üstel geri çekilme: 5sn, 10sn, 20sn ... en fazla 30 dk
const ILK_BEKLEME_MS = 5000
const MAKS_BEKLEME_MS = 30 * 60 * 1000
// Bu kadar süredir gönderilemeyen kayıt için kullanıcı açıkça uyarılır
export const TAKILI_ESIK_MS = 6 * 60 * 60 * 1000

let dbSozu = null
let senkronSuruyor = false

// ── IndexedDB ──
function dbAc() {
  if (dbSozu) return dbSozu
  dbSozu = new Promise((coz, red) => {
    const istek = indexedDB.open(DB_ADI, DB_SURUM)
    istek.onupgradeneeded = () => {
      const db = istek.result
      if (!db.objectStoreNames.contains(DEPO)) {
        const depo = db.createObjectStore(DEPO, { keyPath: 'id' })
        depo.createIndex('olusturma', 'olusturma')
      }
    }
    istek.onsuccess = () => coz(istek.result)
    istek.onerror = () => red(istek.error)
  })
  return dbSozu
}

function islem(mod, isFn) {
  return dbAc().then(db => new Promise((coz, red) => {
    const t = db.transaction(DEPO, mod)
    const depo = t.objectStore(DEPO)
    let sonuc
    try {
      sonuc = isFn(depo)
    } catch (e) {
      red(e); return
    }
    t.oncomplete = () => coz(sonuc?.result !== undefined ? sonuc.result : sonuc)
    t.onerror = () => red(t.error)
    t.onabort = () => red(t.error)
  }))
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Eski tarayıcı yedeği
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ── KUYRUK ──

/*
 * Kuyruğa bir veri girişi ekler.
 * oge = { veri: {...sulama_kayitlari satırı}, foto: File|Blob|null,
 *         gubreler: [{gubre_id, miktar, birim, olcek}], etiket: 'Hat-3' }
 * Döner: oluşturulan öğe (id = idempotency anahtarı)
 */
export async function kuyrugaEkle({ veri, foto = null, gubreler = [], etiket = '' }) {
  // Kapsam sınırı kodda zorlanır: hat tamamlaması asla kuyruklanmaz
  if (veri?.sure_dakika != null) {
    throw new Error(
      'sure_dakika dolu kayıt çevrimdışı kuyruğa alınamaz — ' +
      'hat tamamlamaları sunucu akışıyla senkron olmak zorundadır.')
  }

  const oge = {
    id: uuid(),
    tip: 'veri_girisi',
    olusturma: new Date().toISOString(),
    etiket,
    veri,
    gubreler,
    foto: foto || null,
    fotoUzanti: foto?.name?.split('.').pop()?.toLowerCase() || 'jpg',
    deneme: 0,
    sonDeneme: 0,
    sonHata: null
  }

  await islem('readwrite', depo => depo.add(oge))
  kuyrukDegisti()
  return oge
}

export function kuyrukListesi() {
  return islem('readonly', depo => depo.getAll())
}

export async function kuyrukSayisi() {
  try {
    return await islem('readonly', depo => depo.count())
  } catch {
    return 0
  }
}

export async function kuyruktanSil(id) {
  await islem('readwrite', depo => depo.delete(id))
  kuyrukDegisti()
}

function ogeGuncelle(oge) {
  return islem('readwrite', depo => depo.put(oge))
}

// Kuyruk değişince arayüz kendini tazelesin diye olay yayınla
function kuyrukDegisti() {
  kuyrukSayisi().then(n => {
    window.dispatchEvent(new CustomEvent('kuyruk-degisti', { detail: { adet: n } }))
  })
}

// ── GÖNDERİM ──

// Ağ kaynaklı hata mı, sunucunun reddi mi? Ağ hatasında kuyrukta tutulur,
// sunucu reddinde kullanıcıya söylenir (sonsuz tekrar anlamsız olurdu).
export function agHatasiMi(hata) {
  if (!navigator.onLine) return true
  const m = String(hata?.message || hata || '').toLowerCase()
  return m.includes('failed to fetch') || m.includes('networkerror') ||
         m.includes('network request failed') || m.includes('load failed') ||
         m.includes('timeout') || m.includes('ağ')
}

/*
 * Tek bir öğeyi gönderir. Her adım idempotenttir:
 *   foto  → dosya adı öğe id'sinden türetilir, upsert ile yazılır
 *   kayıt → istemci_id ile önce aranır, yoksa eklenir
 *   gübre → o kayda ait satır varsa tekrar eklenmez
 */
async function ogeyiGonder(oge) {
  const veri = { ...oge.veri }
  let fotografUrl = veri.fotograf_url || null

  if (oge.foto) {
    const yol = `${veri.hat_id || 'kayit'}_${oge.id}.${oge.fotoUzanti}`
    const { error } = await supabase.storage
      .from('fotograflar')
      .upload(yol, oge.foto, { upsert: true })
    if (error) throw new Error('Fotoğraf yüklenemedi: ' + error.message)

    fotografUrl = supabase.storage.from('fotograflar').getPublicUrl(yol).data.publicUrl
  }

  // Daha önceki bir denemede yazılmış mı?
  const { data: mevcut, error: aramaHatasi } = await supabase
    .from('sulama_kayitlari')
    .select('id')
    .eq('istemci_id', oge.id)
    .maybeSingle()
  if (aramaHatasi) throw new Error('Kayıt kontrolü: ' + aramaHatasi.message)

  let kayitId = mevcut?.id || null

  if (!kayitId) {
    const { data, error } = await supabase
      .from('sulama_kayitlari')
      .insert({ ...veri, fotograf_url: fotografUrl, istemci_id: oge.id })
      .select('id')
      .single()
    if (error) throw new Error('Kayıt eklenemedi: ' + error.message)
    kayitId = data.id
  }

  if (oge.gubreler?.length > 0) {
    const { data: varOlan, error: gHata } = await supabase
      .from('gubre_uygulamalari')
      .select('id')
      .eq('kayit_id', kayitId)
      .limit(1)
    if (gHata) throw new Error('Gübre kontrolü: ' + gHata.message)

    if (!varOlan || varOlan.length === 0) {
      const { error } = await supabase
        .from('gubre_uygulamalari')
        .insert(oge.gubreler.map(g => ({ ...g, kayit_id: kayitId })))
      if (error) throw new Error('Gübre kaydı: ' + error.message)
    }
  }
}

function beklemeSuresi(deneme) {
  return Math.min(ILK_BEKLEME_MS * Math.pow(2, Math.max(0, deneme - 1)), MAKS_BEKLEME_MS)
}

// Öğe şu an denenebilir mi? (üstel geri çekilme)
function denenebilir(oge, simdi = Date.now()) {
  if (!oge.deneme) return true
  return simdi - (oge.sonDeneme || 0) >= beklemeSuresi(oge.deneme)
}

/*
 * Kuyruğu sırayla boşaltır.
 * Bir öğe başarısız olursa diğerleri denenmeye devam eder; başarısız öğe
 * kuyrukta kalır ve üstel geri çekilmeyle sonra tekrar denenir.
 * Bağlantı senkron ortasında kesilirse kalanlar kuyrukta bırakılır.
 */
export async function senkronBaslat({ hepsiniDene = false } = {}) {
  if (senkronSuruyor) return { atlandi: true }
  if (!navigator.onLine) return { cevrimdisi: true }

  senkronSuruyor = true
  const ozet = { gonderilen: 0, basarisiz: 0, kalan: 0, kesildi: false }

  try {
    const ogeler = (await kuyrukListesi())
      .sort((a, b) => String(a.olusturma).localeCompare(String(b.olusturma)))

    for (const oge of ogeler) {
      // Senkron ortasında bağlantı kesildiyse kalanlara dokunma
      if (!navigator.onLine) { ozet.kesildi = true; break }
      if (!hepsiniDene && !denenebilir(oge)) continue

      try {
        await ogeyiGonder(oge)
        await islem('readwrite', depo => depo.delete(oge.id))
        ozet.gonderilen++
      } catch (hata) {
        oge.deneme = (oge.deneme || 0) + 1
        oge.sonDeneme = Date.now()
        oge.sonHata = String(hata?.message || hata)
        await ogeGuncelle(oge)
        ozet.basarisiz++
        // Ağ gittiyse kalanları boşuna deneme
        if (agHatasiMi(hata)) { ozet.kesildi = true; break }
      }
    }

    ozet.kalan = await kuyrukSayisi()
    return ozet
  } finally {
    senkronSuruyor = false
    kuyrukDegisti()
  }
}

// ── OTOMATİK ÇALIŞMA ──
let baslatildi = false

export function offlineBaslat() {
  if (baslatildi) return
  baslatildi = true

  window.addEventListener('online', () => {
    kuyrukDegisti()
    senkronBaslat()
  })
  window.addEventListener('offline', () => kuyrukDegisti())

  // Geri çekilmedeki öğeler için düzenli tekrar (uygulama açıkken)
  setInterval(() => {
    if (navigator.onLine) senkronBaslat()
  }, 60000)

  // Açılışta bekleyen varsa hemen dene
  kuyrukDegisti()
  if (navigator.onLine) senkronBaslat()
}

// ── ARAYÜZ YARDIMCILARI ──

// Uzun süredir gönderilemeyen öğeler (kullanıcı açıkça uyarılmalı)
export function takiliOgeler(ogeler, simdi = Date.now()) {
  return ogeler.filter(o =>
    o.deneme > 0 && simdi - new Date(o.olusturma).getTime() > TAKILI_ESIK_MS)
}

export function kuyrukRozetiHTML(adet, cevrimdisi = !navigator.onLine) {
  if (!adet && !cevrimdisi) return ''
  const metin = cevrimdisi
    ? `📴 Çevrimdışı${adet ? ` — ${adet} kayıt bekliyor` : ''}`
    : `⏳ ${adet} kayıt gönderiliyor`
  return `<button class="kuyruk-rozet ${cevrimdisi ? 'cevrimdisi' : ''}"
    onclick="kuyrukPaneliAc()" title="Bekleyen kayıtları göster">${metin}</button>`
}
