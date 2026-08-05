/*
 * IZLEYICILER — misafir izleme ekranini kimin actigini ayirt etme.
 *
 * Kapsam: yalnizca GECMIS log. Canli "su an kim bakiyor" paneli yoktur.
 *
 * Yetki: izleyiciler tablosuna yazma RLS'i yonetici/denetleyici ile
 * sinirli (sql/supabase_migration_izleyiciler.sql — isci ve anon icin
 * insert politikasi yok). Okuma herkese acik: viewer girissiz calisir
 * ve secici listesini anon olarak okur.
 */
import { supabase } from './supabase.js'

const KIMLIK_ANAHTARI = 'izleyici_kimligi'

// "Bilmiyorum/Diğer" secildiginde de bir daha sorulmaz: kimlik yazilir
// ama izleyici_id null gonderilir (eski anonim davranis korunur).
export const BILINMIYOR = 'bilinmiyor'

export async function izleyicileriGetir({ hepsi = false } = {}) {
  let sorgu = supabase.from('izleyiciler').select('*')
  if (!hepsi) sorgu = sorgu.eq('aktif', true)

  const { data, error } = await sorgu
    .order('sira_no', { ascending: true })
    .order('ad', { ascending: true })

  if (error) {
    console.error('İzleyici okuma hatası:', error.message)
    return []
  }
  return data || []
}

// ── CIHAZDA KAYITLI KIMLIK ──
// { id: uuid|null, ad: string } — id null ise "Bilmiyorum" secilmis demektir.
export function izleyiciKimligi() {
  try {
    const ham = localStorage.getItem(KIMLIK_ANAHTARI)
    if (!ham) return null
    const k = JSON.parse(ham)
    if (typeof k !== 'object' || k === null) return null
    return { id: k.id ?? null, ad: k.ad || 'Bilinmiyor' }
  } catch {
    return null
  }
}

export function izleyiciKimligiKaydet(id, ad) {
  try {
    localStorage.setItem(KIMLIK_ANAHTARI, JSON.stringify({ id: id || null, ad }))
  } catch {
    // Ozel sekme / dolu depolama: secim kalici olmaz, akis yine de surmeli
  }
}

export function izleyiciKimligiSil() {
  try {
    localStorage.removeItem(KIMLIK_ANAHTARI)
  } catch {
    // yoksay
  }
}

/*
 * Yeni izleyici tanimi ekler.
 * Mukerrer ad eklenmez; pasif bir kayit varsa cagirana bildirilir ki
 * yeniden aktif etmeyi onerebilsin (silme yok — gecmis log referansi
 * kopmasin diye).
 *
 * Doner: { durum: 'eklendi'|'zaten_var'|'pasif_var'|'hata', ... }
 */
export async function izleyiciEkle(adHam) {
  const ad = (adHam || '').trim()
  if (!ad) return { durum: 'hata', mesaj: 'İsim gerekli.' }

  const { data: varOlan, error: aramaHatasi } = await supabase
    .from('izleyiciler')
    .select('id, ad, aktif')
    .ilike('ad', ad)
    .limit(1)

  if (aramaHatasi) return { durum: 'hata', mesaj: yazmaHatasi(aramaHatasi) }

  if (varOlan?.length > 0) {
    const mevcut = varOlan[0]
    return mevcut.aktif
      ? { durum: 'zaten_var', izleyici: mevcut }
      : { durum: 'pasif_var', izleyici: mevcut }
  }

  const { data: sonSira } = await supabase
    .from('izleyiciler')
    .select('sira_no')
    .order('sira_no', { ascending: false })
    .limit(1)

  const { data: eklenen, error } = await supabase
    .from('izleyiciler')
    .insert({ ad, sira_no: (sonSira?.[0]?.sira_no || 0) + 1, aktif: true })
    .select('id, ad, aktif')
    .single()

  if (error) return { durum: 'hata', mesaj: yazmaHatasi(error) }
  return { durum: 'eklendi', izleyici: eklenen }
}

export async function izleyiciAdiDegistir(id, adHam) {
  const ad = (adHam || '').trim()
  if (!ad) return { durum: 'hata', mesaj: 'İsim gerekli.' }

  // Baska bir kayit ayni adi kullaniyor mu?
  const { data: varOlan, error: aramaHatasi } = await supabase
    .from('izleyiciler')
    .select('id, ad, aktif')
    .ilike('ad', ad)
    .limit(1)

  if (aramaHatasi) return { durum: 'hata', mesaj: yazmaHatasi(aramaHatasi) }
  if (varOlan?.length > 0 && varOlan[0].id !== id) {
    return { durum: 'zaten_var', izleyici: varOlan[0] }
  }

  const { error } = await supabase.from('izleyiciler').update({ ad }).eq('id', id)
  if (error) return { durum: 'hata', mesaj: yazmaHatasi(error) }
  return { durum: 'guncellendi' }
}

// Silme YOK: gecmis loglardaki isim referansi kopmasin.
export async function izleyiciAktiflik(id, aktif) {
  const { error } = await supabase.from('izleyiciler').update({ aktif }).eq('id', id)
  if (error) return { durum: 'hata', mesaj: yazmaHatasi(error) }
  return { durum: 'guncellendi' }
}

// RLS ve ag hatalarini sahada anlasilir dile cevir
export function yazmaHatasi(error) {
  const m = String(error?.message || '')
  if (error?.code === '42501' || /row-level security/i.test(m)) {
    return 'İzleyici tanımlama yetkiniz yok (yönetici/denetleyici gerekir).'
  }
  if (/duplicate|unique/i.test(m)) return 'Bu isim zaten listede.'
  if (!navigator.onLine || /failed to fetch|network/i.test(m)) {
    return '📴 Bağlantı yok — yeni tanım internet gerektirir.'
  }
  return 'Kaydedilemedi: ' + m
}
