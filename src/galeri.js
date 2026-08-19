import { supabase } from './supabase.js'
import { kucukUrl } from './foto.js'

// Fotografli kayitlari getir (hat + tur bilgisiyle)
export async function galeriKayitlariGetir(bolgeId = null) {
  let sorgu = supabase
    .from('sulama_kayitlari')
    .select(`
      id, fotograf_url, olusturma_zamani, islem_turu, ilac_gubre_notu,
      hatlar!inner (hat_no, parsel_bilgisi, zonalar!inner (ad, bolge_id)),
      turlar (tur_no)
    `)
    .not('fotograf_url', 'is', null)
    .order('olusturma_zamani', { ascending: true })
    .limit(500)

  if (bolgeId) sorgu = sorgu.eq('hatlar.zonalar.bolge_id', bolgeId)

  const { data, error } = await sorgu
  if (error) {
    console.error('Galeri hatası:', error.message)
    return []
  }
  return data || []
}

export function galeriHTML(kayitlar) {
  if (kayitlar.length === 0) {
    return '<div style="color:var(--metin-soluk); padding:20px; text-align:center;">Henüz fotoğraf yok. Hat popup\'ından fotoğraf ekledikçe burada hat ve su sırasına göre birikecek.</div>'
  }

  // Hat -> Tur -> fotograflar seklinde grupla
  const hatlar = {}
  kayitlar.forEach(k => {
    const hatNo = k.hatlar?.hat_no ?? '?'
    const zona = k.hatlar?.zonalar?.ad || ''
    const anahtar = `${zona}|${hatNo}`
    if (!hatlar[anahtar]) {
      hatlar[anahtar] = { hatNo, zona, parsel: k.hatlar?.parsel_bilgisi || '', turlar: {} }
    }
    const turNo = k.turlar?.tur_no ?? 0
    if (!hatlar[anahtar].turlar[turNo]) hatlar[anahtar].turlar[turNo] = []
    hatlar[anahtar].turlar[turNo].push(k)
  })

  const hatListesi = Object.values(hatlar)
    .sort((a, b) => a.zona.localeCompare(b.zona) || a.hatNo - b.hatNo)

  return hatListesi.map(hat => {
    const turNolar = Object.keys(hat.turlar).map(Number).sort((a, b) => a - b)

    const turlarHTML = turNolar.map(turNo => {
      const fotolar = hat.turlar[turNo].map(k => {
        const zaman = new Date(k.olusturma_zamani)
        const tarih = zaman.toLocaleDateString('tr-TR')
        const saat = zaman.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        const aciklama = `Hat-${hat.hatNo} — ${turNo > 0 ? turNo + '. Su' : 'Tur dışı'} — ${tarih} ${saat}${k.ilac_gubre_notu ? ' — ' + k.ilac_gubre_notu : ''}`
        return `
          <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
            <img
              src="${kucukUrl(k.fotograf_url)}"
              loading="lazy" decoding="async"
              onerror="this.onerror=null; this.src='${k.fotograf_url}'"
              onclick="galeriBuyut('${k.fotograf_url}', '${aciklama.replace(/'/g, '&#39;')}')"
              style="
                width: 96px; height: 96px;
                object-fit: cover;
                border-radius: 6px;
                border: 1px solid var(--kenar);
                cursor: pointer;
              "
            />
            <div style="color:var(--metin-soluk); font-size:10px;">${tarih} ${saat}</div>
          </div>
        `
      }).join('')

      return `
        <div style="margin-bottom:10px;">
          <div style="color:var(--warning); font-size:12px; font-weight:bold; margin-bottom:6px;">
            ${turNo > 0 ? `💧 ${turNo}. Su` : '📌 Tur dışı kayıt'}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">${fotolar}</div>
        </div>
      `
    }).join('')

    return `
      <div style="
        background: var(--surface);
        border: 1px solid var(--kenar);
        border-radius: 8px;
        padding: 14px;
        margin-bottom: 12px;
      ">
        <div style="color:var(--accent); font-weight:bold; font-size:14px; margin-bottom:10px;">
          Hat-${hat.hatNo}
          <span style="color:var(--metin-soluk); font-size:12px; font-weight:normal;">
            ${hat.parsel} ${hat.zona ? '— ' + hat.zona : ''}
          </span>
        </div>
        ${turlarHTML}
      </div>
    `
  }).join('')
}

// Tam ekran buyutme (lightbox)
window.galeriBuyut = (url, aciklama) => {
  document.getElementById('galeri-lightbox')?.remove()
  document.body.insertAdjacentHTML('beforeend', `
    <div id="galeri-lightbox" onclick="this.remove()" style="
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.92);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
      box-sizing: border-box;
      cursor: zoom-out;
    ">
      <img src="${url}" style="
        max-width: 100%;
        max-height: 85vh;
        border-radius: 8px;
      "/>
      <div style="color:var(--metin); font-size:14px; margin-top:12px; text-align:center;">
        ${aciklama}
      </div>
      <div style="color:var(--metin-soluk); font-size:12px; margin-top:4px;">kapatmak için dokun</div>
    </div>
  `)
}
