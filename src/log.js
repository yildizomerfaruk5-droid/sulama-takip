import { supabase } from './supabase.js'

// Olay logu yaz (hata olsa bile uygulamayi durdurmaz)
export async function logKaydet(olay, detay = null, bolgeId = null) {
  try {
    const { data } = await supabase.auth.getSession()
    const email = data.session?.user?.email || null
    await supabase.from('olay_loglari').insert({
      bolge_id: bolgeId,
      kullanici_email: email,
      olay,
      detay
    })
  } catch (e) {
    console.error('Log yazılamadı:', e)
  }
}

export async function loglariGetir(bolgeId = null, limit = 50) {
  let sorgu = supabase
    .from('olay_loglari')
    .select('*')
    .order('olusturma_zamani', { ascending: false })
    .limit(limit)

  if (bolgeId) sorgu = sorgu.or(`bolge_id.eq.${bolgeId},bolge_id.is.null`)

  const { data, error } = await sorgu
  if (error) {
    console.error('Log okuma hatası:', error.message)
    return []
  }
  return data || []
}

const OLAY_GORUNUM = {
  sistem_baslatildi:  ['▶', '#26de81'],
  sistem_kapatildi:   ['■', '#ff4757'],
  hat_gecisi:         ['⏭', '#2e86de'],
  zona_gecisi:        ['⏩', '#2e86de'],
  tur_tamamlandi:     ['🏁', '#f9ca24'],
  sure_degistirildi:  ['⏱', '#8e44ad'],
  kayit_eklendi:      ['📝', '#5dade2'],
  yedek_alindi:       ['💾', '#00cec9']
}

export function logHTML(loglar) {
  if (loglar.length === 0) {
    return '<div style="color:#7f8c8d; font-size:13px; padding:8px;">Henüz olay kaydı yok.</div>'
  }

  return loglar.map(l => {
    const [ikon, renk] = OLAY_GORUNUM[l.olay] || ['•', '#7f8c8d']
    const zaman = new Date(l.olusturma_zamani).toLocaleString('tr-TR')
    return `
      <div style="
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: #0f1923;
        border: 1px solid #2c3e50;
        border-radius: 6px;
        margin-bottom: 5px;
        font-size: 12.5px;
      ">
        <span style="color:${renk}; font-size:14px; width:18px; text-align:center;">${ikon}</span>
        <div style="flex:1; min-width:0;">
          <span style="color:#e0e0e0;">${l.detay || l.olay}</span>
          <div style="color:#7f8c8d; font-size:11px;">
            ${zaman}${l.kullanici_email ? ' • ' + l.kullanici_email : ''}
          </div>
        </div>
      </div>
    `
  }).join('')
}
