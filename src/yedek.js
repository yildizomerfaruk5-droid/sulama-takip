import { supabase } from './supabase.js'
import { logKaydet } from './log.js'

const YEDEK_TABLOLARI = [
  'bolgeler', 'zonalar', 'hatlar', 'vanalar', 'turlar',
  'sulama_kayitlari', 'gubreler', 'gubre_uygulamalari',
  'sistem_durumu', 'giris_gecmisi', 'olay_loglari'
]

// Tum veritabanini tek JSON dosyasi olarak indirir
export async function yedekIndir(bolge = null) {
  const yedek = {
    sistem: 'sulama-takip',
    gelistirici: 'Ömer Faruk Yıldız (manco)',
    surum: 1,
    tarih: new Date().toISOString(),
    bolge: bolge?.ad || 'tumu',
    not: 'Fotograf dosyalari Supabase Storage\'dadir; bu dosyada yalnizca URL\'leri bulunur.',
    tablolar: {}
  }

  for (const tablo of YEDEK_TABLOLARI) {
    const { data, error } = await supabase.from(tablo).select('*').limit(10000)
    yedek.tablolar[tablo] = error ? { hata: error.message } : data
  }

  const kayitToplam = Object.values(yedek.tablolar)
    .filter(Array.isArray)
    .reduce((t, d) => t + d.length, 0)

  const dosyaAdi = `sulama_yedek_${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(yedek, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = dosyaAdi
  a.click()
  URL.revokeObjectURL(a.href)

  await logKaydet('yedek_alindi', `Yedek indirildi: ${dosyaAdi} (${kayitToplam} kayıt)`, bolge?.id)
  return { dosyaAdi, kayitToplam }
}
