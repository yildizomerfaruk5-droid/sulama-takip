import { supabase } from './supabase.js'

export function popupHTML(hat) {
  return `
    <div id="popup-overlay" style="
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 16px;
      box-sizing: border-box;
    ">
      <div style="
        background: #1a2634;
        border: 1px solid #2c3e50;
        border-radius: 12px;
        padding: 24px;
        width: 100%;
        max-width: 440px;
        max-height: 90vh;
        overflow-y: auto;
        box-sizing: border-box;
      ">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <h3 style="color:#5dade2; font-size:16px; margin:0;">
            Hat-${hat.hat_no} 
            <span style="color:#7f8c8d; font-size:13px; font-weight:normal;">
              ${hat.parsel_bilgisi || ''}
            </span>
          </h3>
          <button id="popup-kapat-btn" style="
            background: none;
            border: none;
            color: #7f8c8d;
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
          ">✕</button>
        </div>

        <div style="margin-bottom:14px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            İşlem Türü
          </label>
          <select id="popup-islem" style="
            width: 100%;
            padding: 10px 12px;
            background: #0f1923;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
            box-sizing: border-box;
          ">
            <option value="sulama">Sulama</option>
            <option value="ilaclama">İlaçlama</option>
            <option value="gubreleme">Gübreleme</option>
            <option value="kombine">Kombine</option>
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            İlaç / Gübre Notu
          </label>
          <textarea id="popup-not" rows="3" placeholder="Örn: 2 kg Üre + 1 lt İlaç X" style="
            width: 100%;
            padding: 10px 12px;
            background: #0f1923;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
            resize: vertical;
            box-sizing: border-box;
          "></textarea>
        </div>

        <div style="margin-bottom:14px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            Gübre Uygulaması
          </label>
          <div id="gubre-listesi" style="
            background: #0c141d;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            padding: 8px;
          ">Yükleniyor...</div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            Fotoğraf
          </label>
          <div style="display:flex; gap:8px;">
            <button id="foto-kamera-btn" type="button" style="
              flex: 1;
              padding: 10px;
              background: #0f1923;
              border: 1px solid #2c3e50;
              border-radius: 6px;
              color: #e0e0e0;
              font-size: 13px;
              cursor: pointer;
            ">📷 Kamera</button>
            <button id="foto-galeri-btn" type="button" style="
              flex: 1;
              padding: 10px;
              background: #0f1923;
              border: 1px solid #2c3e50;
              border-radius: 6px;
              color: #e0e0e0;
              font-size: 13px;
              cursor: pointer;
            ">🖼 Galeriden Seç</button>
          </div>
          <input id="popup-foto" type="file" accept="image/*" capture="environment" style="display:none;"/>
          <input id="popup-foto-galeri" type="file" accept="image/*" style="display:none;"/>
          <div id="foto-onizleme" style="margin-top:8px;"></div>
        </div>

        <div style="display:flex; gap:10px;">
          <button id="popup-kaydet-btn" style="
            flex: 1;
            padding: 12px;
            background: #26de81;
            border: none;
            border-radius: 6px;
            color: #000;
            font-size: 15px;
            font-weight: bold;
            cursor: pointer;
          ">💾 Kaydet</button>
          <button id="popup-iptal-btn" style="
            flex: 1;
            padding: 12px;
            background: transparent;
            border: 1px solid #2c3e50;
            border-radius: 6px;
            color: #7f8c8d;
            font-size: 15px;
            cursor: pointer;
          ">İptal</button>
        </div>

        <div id="popup-mesaj" style="
          margin-top: 12px;
          font-size: 13px;
          text-align: center;
          min-height: 20px;
        "></div>
      </div>
    </div>
  `
}

let gubreSecenekleri = []
let secilenFoto = null

// Tum gubreler sabit liste olarak: tik at, miktarini gir
function gubreListesiOlustur() {
  const liste = document.getElementById('gubre-listesi')
  if (!liste) return
  if (gubreSecenekleri.length === 0) {
    liste.innerHTML = '<div style="color:#7f8c8d; font-size:12px;">Gübre tanımı bulunamadı.</div>'
    return
  }

  const stil = `
    padding: 7px 6px;
    background: #0f1923;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    box-sizing: border-box;
  `

  liste.innerHTML = gubreSecenekleri.map(g => `
    <div class="gubre-satir" data-gubre="${g.id}" style="
      display:flex; gap:6px; align-items:center; padding:5px 0;
      border-bottom:1px solid #16222e;
    ">
      <input type="checkbox" class="gubre-sec" style="
        width:17px; height:17px; accent-color:#26de81; cursor:pointer; flex-shrink:0;
      ">
      <span class="gubre-adi" style="flex:1; min-width:0; color:#bdc3c7; font-size:13px; cursor:pointer;">
        ${g.ad}
      </span>
      <input class="gubre-miktar" type="number" min="0" step="0.1" placeholder="4" disabled
        style="width:54px; opacity:0.35; ${stil}">
      <select class="gubre-birim" disabled style="width:66px; opacity:0.35; ${stil}">
        <option value="litre" ${g.varsayilan_birim === 'litre' ? 'selected' : ''}>litre</option>
        <option value="kg" ${g.varsayilan_birim === 'kg' ? 'selected' : ''}>kg</option>
      </select>
      <select class="gubre-olcek" disabled style="width:72px; opacity:0.35; ${stil}">
        <option value="dekar">/dekar</option>
        <option value="hat">/hat</option>
      </select>
    </div>
  `).join('')

  liste.querySelectorAll('.gubre-satir').forEach(satir => {
    const kutu = satir.querySelector('.gubre-sec')
    const alanlar = satir.querySelectorAll('.gubre-miktar, .gubre-birim, .gubre-olcek')
    const uygula = () => alanlar.forEach(a => {
      a.disabled = !kutu.checked
      a.style.opacity = kutu.checked ? '1' : '0.35'
    })
    kutu.addEventListener('change', () => {
      uygula()
      if (kutu.checked) satir.querySelector('.gubre-miktar').focus()
    })
    // Gubre adina dokununca da tik atilsin (mobil kolayligi)
    satir.querySelector('.gubre-adi').addEventListener('click', () => {
      kutu.checked = !kutu.checked
      uygula()
      if (kutu.checked) satir.querySelector('.gubre-miktar').focus()
    })
  })
}

export function popupEventleriEkle(hatId, turId) {
  // Gübre seçeneklerini yükle
  supabase
    .from('gubreler')
    .select('*')
    .eq('aktif', true)
    .order('sira_no')
    .then(({ data }) => {
      gubreSecenekleri = data || []
      gubreListesiOlustur()
    })

  // Kapatma butonları
  document.getElementById('popup-kapat-btn').addEventListener('click', () => {
    document.getElementById('popup-overlay')?.remove()
  })
  document.getElementById('popup-iptal-btn').addEventListener('click', () => {
    document.getElementById('popup-overlay')?.remove()
  })

  // Overlay dışına tıklayınca kapat
  document.getElementById('popup-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'popup-overlay') {
      document.getElementById('popup-overlay')?.remove()
    }
  })

  // Fotoğraf: kamera veya galeri
  secilenFoto = null
  document.getElementById('foto-kamera-btn').addEventListener('click', () => {
    document.getElementById('popup-foto').click()
  })
  document.getElementById('foto-galeri-btn').addEventListener('click', () => {
    document.getElementById('popup-foto-galeri').click()
  })

  const fotoSecildi = (e) => {
    const dosya = e.target.files[0]
    if (!dosya) return
    secilenFoto = dosya
    const reader = new FileReader()
    reader.onload = (ev) => {
      document.getElementById('foto-onizleme').innerHTML = `
        <img src="${ev.target.result}" style="width:100%; border-radius:6px; max-height:200px; object-fit:cover;">
        <div style="color:#7f8c8d; font-size:11px; margin-top:4px;">${dosya.name}</div>
      `
    }
    reader.readAsDataURL(dosya)
  }
  document.getElementById('popup-foto').addEventListener('change', fotoSecildi)
  document.getElementById('popup-foto-galeri').addEventListener('change', fotoSecildi)

  // Kaydet butonu
  document.getElementById('popup-kaydet-btn').addEventListener('click', () => {
    popupKaydet(hatId, turId)
  })
}

export async function popupKaydet(hatId, turId) {
  const islem = document.getElementById('popup-islem').value
  const not = document.getElementById('popup-not').value
  const mesajEl = document.getElementById('popup-mesaj')
  const kaydetBtn = document.getElementById('popup-kaydet-btn')

  mesajEl.style.color = '#7f8c8d'
  mesajEl.textContent = 'Kaydediliyor...'
  kaydetBtn.disabled = true

  let fotografUrl = null

  // Fotoğraf varsa yükle (kameradan veya galeriden)
  if (secilenFoto) {
    const dosya = secilenFoto
    const dosyaAdi = `${hatId}_${Date.now()}.${dosya.name.split('.').pop() || 'jpg'}`

    const { error } = await supabase.storage
      .from('fotograflar')
      .upload(dosyaAdi, dosya)

    if (error) {
      mesajEl.style.color = '#ff4757'
      mesajEl.textContent = 'Fotoğraf yüklenemedi: ' + error.message
      kaydetBtn.disabled = false
      return
    }

    const { data: urlData } = supabase.storage
      .from('fotograflar')
      .getPublicUrl(dosyaAdi)

    fotografUrl = urlData.publicUrl
  }

  // Kaydı ekle
  const { data: kayit, error } = await supabase
    .from('sulama_kayitlari')
    .insert({
      hat_id: hatId,
      tur_id: turId || null,
      baslangic_zamani: new Date().toISOString(),
      islem_turu: islem,
      ilac_gubre_notu: not || null,
      fotograf_url: fotografUrl,
      durum: 'tamamlandi'
    })
    .select('id')
    .single()

  if (error) {
    mesajEl.style.color = '#ff4757'
    mesajEl.textContent = 'Hata: ' + error.message
    kaydetBtn.disabled = false
    return
  }

  // Gübre uygulamalarını kaydet
  const gubreSatirlari = [...document.querySelectorAll('#gubre-listesi .gubre-satir')]
    .filter(satir => satir.querySelector('.gubre-sec')?.checked)
    .map(satir => ({
      kayit_id: kayit.id,
      gubre_id: satir.dataset.gubre,
      miktar: parseFloat(satir.querySelector('.gubre-miktar').value),
      birim: satir.querySelector('.gubre-birim').value,
      olcek: satir.querySelector('.gubre-olcek').value
    }))
    .filter(g => g.miktar > 0)

  if (gubreSatirlari.length > 0) {
    const { error: gubreHata } = await supabase
      .from('gubre_uygulamalari')
      .insert(gubreSatirlari)

    if (gubreHata) {
      mesajEl.style.color = '#ff4757'
      mesajEl.textContent = 'Gübre kaydı hatası: ' + gubreHata.message
      kaydetBtn.disabled = false
      return
    }
  }

  mesajEl.style.color = '#26de81'
  mesajEl.textContent = '✓ Kaydedildi!'

  setTimeout(() => {
    document.getElementById('popup-overlay')?.remove()
  }, 800)
}