import { supabase } from './supabase.js'

export async function gecmisKayitlariGetir(bolgeId = null) {
  let sorgu = supabase
    .from('sulama_kayitlari')
    .select(`
      *,
      hatlar!inner (hat_no, parsel_bilgisi, zona_id,
        zonalar!inner (ad, bolge_id)
      ),
      turlar (tur_no),
      gubre_uygulamalari (miktar, birim, olcek, gubreler (ad))
    `)
    .order('olusturma_zamani', { ascending: false })
    .limit(50)

  if (bolgeId) sorgu = sorgu.eq('hatlar.zonalar.bolge_id', bolgeId)

  const { data, error } = await sorgu

  if (error) {
    console.error('Geçmiş kayıt hatası:', error.message)
    return []
  }

  return data
}

export function gecmisHTML(kayitlar, silinebilir = false) {
  if (kayitlar.length === 0) {
    return '<div style="color:#7f8c8d; padding:20px; text-align:center;">Henüz kayıt yok.</div>'
  }

  return kayitlar.map(k => {
    const hat = k.hatlar
    const tur = k.turlar
    const tarih = new Date(k.olusturma_zamani).toLocaleString('tr-TR')
    const sure = k.sure_dakika
      ? `${Math.floor(k.sure_dakika/60)}sa ${k.sure_dakika%60}dk`
      : '-'

    const durumRenk = {
      tamamlandi: '#26de81',
      atlandi: '#f9ca24',
      iptal: '#ff4757'
    }[k.durum] || '#7f8c8d'

    return `
      <div class="kayit-satir">
        <div class="kayit-sol">
          <div class="kayit-hat">
            Hat-${hat?.hat_no || '?'}
            <span style="color:#7f8c8d; font-size:11px;">
              ${hat?.parsel_bilgisi || ''} — ${hat?.zonalar?.ad || ''}
            </span>
          </div>
          <div class="kayit-meta">
            ${tur?.tur_no || '?'}. Su &nbsp;•&nbsp; ${tarih} &nbsp;•&nbsp; ${sure}
          </div>
          ${k.ilac_gubre_notu ? `
            <div class="kayit-not">📝 ${k.ilac_gubre_notu}</div>
          ` : ''}
          ${(k.gubre_uygulamalari || []).length > 0 ? `
            <div class="kayit-not">🧪 ${k.gubre_uygulamalari.map(g =>
              `${g.gubreler?.ad || '?'}: ${g.miktar} ${g.birim}/${g.olcek}`
            ).join(' &nbsp;•&nbsp; ')}</div>
          ` : ''}
        </div>
        <div class="kayit-sag">
          <span class="kayit-durum" style="color:${durumRenk}">
            ${k.durum === 'tamamlandi' ? '✓ Tamamlandı' :
              k.durum === 'atlandi' ? '⏭ Atlandı' : '✕ İptal'}
          </span>
          <span class="kayit-islem">${k.islem_turu || 'sulama'}</span>
          ${silinebilir ? `
            <button onclick="kayitSil('${k.id}')" title="Kaydı sil" style="
              background: none;
              border: 1px solid #4a2020;
              border-radius: 4px;
              color: #ff4757;
              cursor: pointer;
              font-size: 13px;
              padding: 2px 8px;
              margin-top: 4px;
            ">🗑 Sil</button>
          ` : ''}
        </div>
      </div>
    `
  }).join('')
}
