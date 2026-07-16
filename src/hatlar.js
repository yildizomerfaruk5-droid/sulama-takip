import { supabase } from './supabase.js'

export async function zonaVeHatlariGetir(bolgeId = null) {
  let zonaSorgu = supabase
    .from('zonalar')
    .select('*')
    .order('sira_no')

  if (bolgeId) zonaSorgu = zonaSorgu.eq('bolge_id', bolgeId)

  const { data: zonalar, error: zonaHata } = await zonaSorgu

  if (zonaHata) {
    console.error('Zona hatası:', zonaHata.message)
    return []
  }
  if (!zonalar || zonalar.length === 0) return []

  const { data: hatlar, error: hatHata } = await supabase
    .from('hatlar')
    .select('*')
    .in('zona_id', zonalar.map(z => z.id))
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

export async function sistemDurumuGetir(bolgeId = null) {
  let sorgu = supabase.from('sistem_durumu').select('*')

  // Bölge verilmişse bölgeye göre, verilmemişse eski tek satır (id=1) düzeni
  sorgu = bolgeId ? sorgu.eq('bolge_id', bolgeId) : sorgu.eq('id', 1)

  const { data, error } = await sorgu.maybeSingle()

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

// Calisan hatin anlik bilgi paneli (admin + viewer ust bolumu)
export async function calisanHatPaneliHTML(durum) {
  if (!durum?.sistem_acik || !durum.aktif_hat_id) return ''

  const [{ data: hat }, { data: vanalar }] = await Promise.all([
    supabase
      .from('hatlar')
      .select('*, zonalar(ad)')
      .eq('id', durum.aktif_hat_id)
      .maybeSingle(),
    supabase
      .from('vanalar')
      .select('isaretci_no, fiskiye_sayisi')
      .eq('hat_id', durum.aktif_hat_id)
      .order('isaretci_no')
  ])

  if (!hat) return ''

  const vanaNolar = [...new Set((vanalar || []).map(v => v.isaretci_no))].join(', ')
  const fiskiyeToplam = (vanalar || []).reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  const alanDekar = Math.round(fiskiyeToplam * 0.12 * 10) / 10 // fiskiye basina ~120 m2

  return `
    <div class="calisan-hat-panel">
      <span class="chp-baslik">⚡ ÇALIŞAN HAT: Hat-${hat.hat_no}</span>
      <span>${hat.zonalar?.ad || ''} ${hat.parsel_bilgisi ? '• ' + hat.parsel_bilgisi : ''}</span>
      <span>Vanalar: <span class="chp-deger">${vanaNolar || '—'}</span></span>
      <span>Fıskiye: <span class="chp-deger">${fiskiyeToplam || '—'}</span></span>
      <span>Tahmini alan: <span class="chp-deger">~${alanDekar} dekar</span></span>
      <span>Süre: <span class="chp-deger">${sureyiFormatla(hat.varsayilan_sure_dk)}</span></span>
      <span>Geçen: <span class="chp-sayac" id="panel-sayac">--:--:--</span></span>
    </div>
  `
}
