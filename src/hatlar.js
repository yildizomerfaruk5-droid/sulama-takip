import { supabase } from './supabase.js'

export async function zonaVeHatlariGetir() {
  const { data: zonalar, error: zonaHata } = await supabase
    .from('zonalar')
    .select('*')
    .order('sira_no')

  if (zonaHata) {
    console.error('Zona hatası:', zonaHata.message)
    return []
  }

  const { data: hatlar, error: hatHata } = await supabase
    .from('hatlar')
    .select('*')
    .order('sira_no')

  if (hatHata) {
    console.error('Hat hatası:', hatHata.message)
    return []
  }

  // Zonaları hatlarla birleştir
  return zonalar.map(zona => ({
    ...zona,
    hatlar: hatlar.filter(h => h.zona_id === zona.id)
  }))
}

export async function sistemDurumuGetir() {
  const { data, error } = await supabase
    .from('sistem_durumu')
    .select('*')
    .eq('id', 1)
    .single()

  if (error) {
    console.error('Sistem durumu hatası:', error.message)
    return null
  }

  return data
}

export function hatDurumuBelirle(hat, sistemDurumu, tamamlananlar = []) {
  if (tamamlananlar.includes(hat.id)) return 'tamam'
  if (!sistemDurumu || !sistemDurumu.sistem_acik) return 'pasif'
  if (hat.id === sistemDurumu.aktif_hat_id) return 'aktif'
  if (hat.id === sistemDurumu.siradaki_hat_id) return 'siradaki'
  return 'pasif'
}

export function sureyiFormatla(dakika) {
  if (!dakika) return '-'
  const saat = Math.floor(dakika / 60)
  const dk = dakika % 60
  if (saat === 0) return `${dk}dk`
  if (dk === 0) return `${saat}sa`
  return `${saat}sa ${dk}dk`
}