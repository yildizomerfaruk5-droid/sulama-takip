import { supabase } from './supabase.js'

export async function zonaVeHatlariGetir(bolgeId = null) {
  let zonaSorgu = supabase
    .from('zonalar')
    .select('id, ad, aciklama, sira_no, bolge_id')
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
    .select('id, zona_id, hat_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk, sira_no, aktif')
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
  let sorgu = supabase.from('sistem_durumu').select('id, bolge_id, aktif_hat_id, siradaki_hat_id, aktif_tur_id, aktif_zona_id, sistem_acik, hat_baslama_zamani, guncelleme_zamani')

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
  // Aktif hat, kaydi onceden girilmis olsa bile AKTIF gorunur
  if (sistemDurumu?.sistem_acik && hat.id === sistemDurumu.aktif_hat_id) return 'aktif'
  if (tamamlananlar.includes(hat.id)) return 'tamam'
  if (!sistemDurumu || !sistemDurumu.sistem_acik) return 'pasif'
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
/*
 * Calisan hattin ozet verisi.
 * Hem eski calisanHatPaneliHTML hem de yeni pano metrik kartlari
 * bunu kullanir — ayni sorgu iki kez yazilmasin diye ayrildi.
 * Doner: null (sistem kapali) veya { hat, vanaNolar, fiskiyeToplam, ... }
 */
export async function calisanHatVerisi(durum) {
  if (!durum?.sistem_acik || !durum.aktif_hat_id) return null

  const [{ data: hat }, { data: vanalar }] = await Promise.all([
    supabase
      .from('hatlar')
      .select('id, hat_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk, zonalar(ad)')
      .eq('id', durum.aktif_hat_id)
      .maybeSingle(),
    supabase
      .from('vanalar')
      .select('isaretci_no, fiskiye_sayisi')
      .eq('hat_id', durum.aktif_hat_id)
      .order('isaretci_no')
  ])

  if (!hat) return null

  // Calisma araligi: baslama -> tahmini bitis
  let saatAralik = '—'
  if (durum.hat_baslama_zamani && hat.varsayilan_sure_dk) {
    const b = new Date(durum.hat_baslama_zamani)
    const e = new Date(b.getTime() + hat.varsayilan_sure_dk * 60000)
    const fmt = t => t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    saatAralik = `${fmt(b)} → ${fmt(e)}`
  }

  const fiskiyeToplam = (vanalar || []).reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)

  return {
    hat,
    saatAralik,
    vanaNolar: [...new Set((vanalar || []).map(v => v.isaretci_no))].join(', '),
    fiskiyeToplam,
    alanDekar: Math.round(fiskiyeToplam * 0.12 * 10) / 10   // fiskiye basina ~120 m2
  }
}

export async function calisanHatPaneliHTML(durum) {
  const v = await calisanHatVerisi(durum)
  if (!v) return ''
  const { hat, saatAralik, vanaNolar, fiskiyeToplam, alanDekar } = v

  return `
    <div class="calisan-hat-panel">
      <span class="chp-baslik">⚡ ÇALIŞAN HAT: Hat-${hat.hat_no}</span>
      <span>${hat.zonalar?.ad || ''} ${hat.parsel_bilgisi ? '• ' + hat.parsel_bilgisi : ''}</span>
      <span>Vanalar: <span class="chp-deger">${vanaNolar || '—'}</span></span>
      <span>Fıskiye: <span class="chp-deger">${fiskiyeToplam || '—'}</span></span>
      <span>Tahmini alan: <span class="chp-deger">~${alanDekar} dekar</span></span>
      <span>Süre: <span class="chp-deger">${sureyiFormatla(hat.varsayilan_sure_dk)}</span></span>
      <span>Saat: <span class="chp-deger">${saatAralik}</span></span>
      <span>Geçen: <span class="chp-sayac" id="panel-sayac">--:--:--</span></span>
      <span>Kalan: <span class="chp-sayac" id="panel-kalan"
        data-sure="${hat.varsayilan_sure_dk || ''}"
        style="color:var(--warning);">--:--:--</span></span>
    </div>
  `
}

/*
 * HER HATTIN TOPLAM TAMAMLAMA SAYISI ("kacinci su")
 *
 * Bolge genelindeki tur ("Su") sayacindan BAGIMSIZDIR: kuyu suyu
 * azalinca hatlar atlanabilir/sira degisebilir, o zaman bir hattin
 * kac kez sulandigi ile turun kacinci su oldugu ayrisir.
 *
 * Kaynak: sulama_kayitlari, sure_dakika DOLU olan satirlar.
 * Bu kural zaten "gercek hat tamamlanmasi"ni isaretler; veri girisi
 * (not/foto/gubre) satirlari sure_dakika BOS oldugu icin sayilmaz.
 * Yeni kolon EKLENMEZ, mevcut veriden turetilir.
 *
 * Doner: { <hat_id>: <adet> }
 */
export async function hatTamamlamaSayilari(hatIdler = []) {
  if (!hatIdler.length) return {}

  const { data, error } = await supabase
    .from('sulama_kayitlari')
    .select('hat_id')
    .in('hat_id', hatIdler)
    .not('sure_dakika', 'is', null)
    .limit(20000)

  if (error) {
    console.error('Hat tamamlama sayısı hatası:', error.message)
    return {}
  }

  const sayim = {}
  for (const k of data || []) sayim[k.hat_id] = (sayim[k.hat_id] || 0) + 1
  return sayim
}
