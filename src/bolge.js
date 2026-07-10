import { supabase } from './supabase.js'

// Aktif bölgeleri getirir (sira_no'ya göre)
export async function bolgeleriGetir() {
  const { data, error } = await supabase
    .from('bolgeler')
    .select('*')
    .eq('aktif', true)
    .order('sira_no')

  if (error) {
    console.error('Bölge hatası:', error.message)
    return []
  }
  return data || []
}

// Giriş yapan kullanıcının profilini (rol + bölge) getirir
export async function profilGetir(userId) {
  const { data, error } = await supabase
    .from('profiller')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Profil hatası:', error.message)
    return null
  }
  return data
}
