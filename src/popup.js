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
            <option value="ilacлама">İlaçlama</option>
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

        <div style="margin-bottom:20px;">
          <label style="color:#bdc3c7; font-size:13px; display:block; margin-bottom:6px;">
            Fotoğraf
          </label>
          <input id="popup-foto" type="file" accept="image/*" capture="environment" style="
            color: #e0e0e0;
            font-size: 13px;
            width: 100%;
          "/>
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

export function popupEventleriEkle(hatId, turId) {
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

  // Fotoğraf önizleme
  document.getElementById('popup-foto').addEventListener('change', (e) => {
    const dosya = e.target.files[0]
    if (!dosya) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      document.getElementById('foto-onizleme').innerHTML = `
        <img src="${ev.target.result}" style="width:100%; border-radius:6px; max-height:200px; object-fit:cover;">
      `
    }
    reader.readAsDataURL(dosya)
  })

  // Kaydet butonu
  document.getElementById('popup-kaydet-btn').addEventListener('click', () => {
    popupKaydet(hatId, turId)
  })
}

export async function popupKaydet(hatId, turId) {
  const islem = document.getElementById('popup-islem').value
  const not = document.getElementById('popup-not').value
  const fotoInput = document.getElementById('popup-foto')
  const mesajEl = document.getElementById('popup-mesaj')
  const kaydetBtn = document.getElementById('popup-kaydet-btn')

  mesajEl.style.color = '#7f8c8d'
  mesajEl.textContent = 'Kaydediliyor...'
  kaydetBtn.disabled = true

  let fotografUrl = null

  // Fotoğraf varsa yükle
  if (fotoInput.files.length > 0) {
    const dosya = fotoInput.files[0]
    const dosyaAdi = `${hatId}_${Date.now()}.${dosya.name.split('.').pop()}`

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
  const { error } = await supabase
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

  if (error) {
    mesajEl.style.color = '#ff4757'
    mesajEl.textContent = 'Hata: ' + error.message
    kaydetBtn.disabled = false
    return
  }

  mesajEl.style.color = '#26de81'
  mesajEl.textContent = '✓ Kaydedildi!'

  setTimeout(() => {
    document.getElementById('popup-overlay')?.remove()
  }, 800)
}