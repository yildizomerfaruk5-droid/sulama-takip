import { supabase } from './supabase.js'
import { kuyrugaEkle, agHatasiMi } from './offline.js'
import { fotografiKucult, kucukSurumAdi } from './foto.js'

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
            Not (isteğe bağlı)
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
let gubreYazabilir = false   // yalnızca yonetici/denetleyici yeni tanım ekleyebilir

const ALAN_STILI = `
    padding: 7px 6px;
    background: #0f1923;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
    box-sizing: border-box;
  `

/*
 * "Yeni gübre ekle" bölümü.
 *
 * Bu bir TANIM yazmasıdır, veri girişi değil — çevrimdışı kuyruğa
 * ALINMAZ. gubre_uygulamalari.gubre_id gerçek bir gubreler.id'ye bağlı;
 * çevrimdışı geçici bir id üretilirse kuyruk gönderiminde kırık FK
 * oluşurdu. Bu yüzden bağlantı yoksa bölüm devre dışı kalır.
 *
 * Yetki: gubreler tablosuna yazma RLS'i yonetici/denetleyici ile
 * sınırlı (supabase_migration_rls_guvenlik.sql — isci için insert
 * politikası yok). İşçi bağlantıyı hiç görmez.
 */
function yeniGubreBolumuHTML() {
  if (!gubreYazabilir) return ''

  if (!navigator.onLine) {
    return `
      <div style="padding:8px 2px 2px; color:#7f8c8d; font-size:11.5px; line-height:1.5;">
        📴 Yeni gübre tanımlamak için internet bağlantısı gerekli —
        mevcut gübreleri çevrimdışı da kaydedebilirsiniz.
      </div>
    `
  }

  return `
    <div id="yeni-gubre-bolum" style="padding:8px 2px 2px;">
      <a id="yeni-gubre-ac" href="#" style="
        color:#5dade2; font-size:12.5px; text-decoration:none; cursor:pointer;
      ">➕ Yeni gübre ekle</a>

      <div id="yeni-gubre-form" style="display:none; gap:6px; align-items:center; padding:6px 0 2px;">
        <input id="yeni-gubre-ad" type="text" placeholder="Gübre / ilaç adı" maxlength="60"
          style="flex:1; min-width:0; ${ALAN_STILI}">
        <select id="yeni-gubre-birim" style="width:66px; ${ALAN_STILI}">
          <option value="litre">litre</option>
          <option value="kg">kg</option>
        </select>
        <button id="yeni-gubre-kaydet" type="button" style="
          padding:8px 12px; background:#26de81; border:none; border-radius:6px;
          color:#000; font-size:13px; font-weight:bold; cursor:pointer; flex-shrink:0;
        ">Kaydet</button>
        <button id="yeni-gubre-iptal" type="button" style="
          padding:7px 10px; background:transparent; border:1px solid #2c3e50;
          border-radius:6px; color:#7f8c8d; font-size:13px; cursor:pointer; flex-shrink:0;
        ">✕</button>
      </div>

      <div id="yeni-gubre-mesaj" style="font-size:11.5px; margin-top:4px; min-height:14px;"></div>
    </div>
  `
}

// Tum gubreler sabit liste olarak: tik at, miktarini gir
function gubreListesiOlustur() {
  const liste = document.getElementById('gubre-listesi')
  if (!liste) return

  // Yeniden çizimde kullanıcının seçtikleri kaybolmasın
  const oncekiSecim = {}
  liste.querySelectorAll('.gubre-satir').forEach(satir => {
    const kutu = satir.querySelector('.gubre-sec')
    if (!kutu?.checked) return
    oncekiSecim[satir.dataset.gubre] = {
      miktar: satir.querySelector('.gubre-miktar').value,
      birim: satir.querySelector('.gubre-birim').value,
      olcek: satir.querySelector('.gubre-olcek').value
    }
  })

  if (gubreSecenekleri.length === 0) {
    liste.innerHTML = '<div style="color:#7f8c8d; font-size:12px;">Gübre tanımı bulunamadı.</div>'
      + yeniGubreBolumuHTML()
    yeniGubreOlaylari()
    return
  }

  const stil = ALAN_STILI

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
  `).join('') + yeniGubreBolumuHTML()

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

    // Yeniden çizim öncesi seçili olanları geri yükle
    const onceki = oncekiSecim[satir.dataset.gubre]
    if (onceki) {
      kutu.checked = true
      uygula()
      satir.querySelector('.gubre-miktar').value = onceki.miktar
      satir.querySelector('.gubre-birim').value = onceki.birim
      satir.querySelector('.gubre-olcek').value = onceki.olcek
    }
  })

  yeniGubreOlaylari()
}

// Bir gübreyi işaretleyip miktar alanına odaklan (yeni eklendikten sonra)
function gubreyiIsaretle(gubreId) {
  const satir = document.querySelector(`.gubre-satir[data-gubre="${gubreId}"]`)
  if (!satir) return
  const kutu = satir.querySelector('.gubre-sec')
  kutu.checked = true
  kutu.dispatchEvent(new Event('change'))
  satir.scrollIntoView({ block: 'nearest' })
}

async function gubreleriYukle() {
  const { data } = await supabase
    .from('gubreler')
    .select('*')
    .eq('aktif', true)
    .order('sira_no')
  gubreSecenekleri = data || []
  gubreListesiOlustur()
}

function yeniGubreOlaylari() {
  const ac = document.getElementById('yeni-gubre-ac')
  if (!ac) return

  const form = document.getElementById('yeni-gubre-form')
  const adAlani = document.getElementById('yeni-gubre-ad')
  const mesajEl = document.getElementById('yeni-gubre-mesaj')

  const mesaj = (metin, renk = '#7f8c8d') => {
    mesajEl.style.color = renk
    mesajEl.innerHTML = metin
  }

  ac.addEventListener('click', (e) => {
    e.preventDefault()
    form.style.display = 'flex'
    ac.style.display = 'none'
    adAlani.focus()
  })

  document.getElementById('yeni-gubre-iptal').addEventListener('click', () => {
    form.style.display = 'none'
    ac.style.display = 'inline'
    adAlani.value = ''
    mesaj('')
  })

  adAlani.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); kaydet() }
  })
  document.getElementById('yeni-gubre-kaydet').addEventListener('click', kaydet)

  async function kaydet() {
    const ad = adAlani.value.trim()
    if (!ad) return mesaj('Gübre adı gerekli.', '#ff4757')

    // Tanım yazması: çevrimdışı kuyruğa alınmaz (kırık FK olurdu)
    if (!navigator.onLine) {
      return mesaj('📴 Yeni gübre tanımlamak için internet bağlantısı gerekli.', '#f9ca24')
    }

    const btn = document.getElementById('yeni-gubre-kaydet')
    btn.disabled = true
    mesaj('Kaydediliyor...')

    // Aynı ad var mı? (pasifler dahil — büyük/küçük harf duyarsız)
    const { data: varOlan, error: aramaHatasi } = await supabase
      .from('gubreler')
      .select('id, ad, aktif')
      .ilike('ad', ad)
      .limit(1)

    if (aramaHatasi) {
      btn.disabled = false
      return mesaj(yazmaHatasi(aramaHatasi), '#ff4757')
    }

    if (varOlan?.length > 0) {
      const mevcut = varOlan[0]
      btn.disabled = false

      if (mevcut.aktif) {
        return mesaj(`"${mevcut.ad}" zaten listede.`, '#f9ca24')
      }

      // Pasif kayıt: yeniden eklemek yerine tekrar aktif etmeyi öner
      mesaj(`"${mevcut.ad}" daha önce tanımlanmış ama pasif. ` +
        `<a href="#" id="gubre-aktif-et" style="color:#26de81">Tekrar aktif et</a>`, '#f9ca24')

      document.getElementById('gubre-aktif-et').addEventListener('click', async (e) => {
        e.preventDefault()
        mesaj('Aktifleştiriliyor...')
        const { error } = await supabase.from('gubreler').update({ aktif: true }).eq('id', mevcut.id)
        if (error) return mesaj(yazmaHatasi(error), '#ff4757')
        await gubreleriYukle()
        gubreyiIsaretle(mevcut.id)
      })
      return
    }

    // Sıra no: pasifler dahil en büyüğün bir fazlası
    const { data: sonSira } = await supabase
      .from('gubreler')
      .select('sira_no')
      .order('sira_no', { ascending: false })
      .limit(1)

    const { data: eklenen, error } = await supabase
      .from('gubreler')
      .insert({
        ad,
        varsayilan_birim: document.getElementById('yeni-gubre-birim').value,
        sira_no: (sonSira?.[0]?.sira_no || 0) + 1,
        aktif: true
      })
      .select('id')
      .single()

    btn.disabled = false
    if (error) return mesaj(yazmaHatasi(error), '#ff4757')

    // Kullanıcı bu gübreyi girmek için ekledi: işaretle ve miktara odaklan
    await gubreleriYukle()
    gubreyiIsaretle(eklenen.id)
  }
}

// RLS ve ağ hatalarını sahada anlaşılır dile çevir
function yazmaHatasi(error) {
  const m = String(error?.message || '')
  if (error?.code === '42501' || /row-level security/i.test(m)) {
    return 'Yeni gübre tanımlama yetkiniz yok (yönetici/denetleyici gerekir).'
  }
  if (/duplicate|unique/i.test(m)) return 'Bu gübre zaten listede.'
  if (agHatasiMi(error)) return '📴 Bağlantı yok — yeni tanım internet gerektirir.'
  return 'Kaydedilemedi: ' + m
}

export function popupEventleriEkle(hatId, turId, hatEtiketi = '', rol = 'isci') {
  // Yeni gübre TANIMI yalnızca yazma yetkisi olan rollerde görünür
  // (gubreler RLS'i: yonetici/denetleyici — isci için insert politikası yok)
  gubreYazabilir = rol === 'yonetici' || rol === 'denetleyici'

  gubreleriYukle()

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
    popupKaydet(hatId, turId, hatEtiketi)
  })
}

// Formdaki seçili gübre satırlarını okur (kayit_id gönderim anında eklenir)
function secilenGubreler() {
  return [...document.querySelectorAll('#gubre-listesi .gubre-satir')]
    .filter(satir => satir.querySelector('.gubre-sec')?.checked)
    .map(satir => ({
      gubre_id: satir.dataset.gubre,
      miktar: parseFloat(satir.querySelector('.gubre-miktar').value),
      birim: satir.querySelector('.gubre-birim').value,
      olcek: satir.querySelector('.gubre-olcek').value
    }))
    .filter(g => g.miktar > 0)
}

export async function popupKaydet(hatId, turId, hatEtiketi = '') {
  const mesajEl = document.getElementById('popup-mesaj')
  const kaydetBtn = document.getElementById('popup-kaydet-btn')

  // sure_dakika BİLEREK yok: bu bir "veri girişi" kaydıdır, hat
  // tamamlaması değil. Kuyruk da bu ayrımı zorunlu tutar.
  const veri = {
    hat_id: hatId,
    tur_id: turId || null,
    baslangic_zamani: new Date().toISOString(),
    islem_turu: 'gubreleme',   // Sulama zaten hat akisiyla kaydediliyor
    ilac_gubre_notu: document.getElementById('popup-not').value || null,
    durum: 'tamamlandi'
  }
  const gubreler = secilenGubreler()
  const foto = secilenFoto

  mesajEl.style.color = '#7f8c8d'
  mesajEl.textContent = 'Kaydediliyor...'
  kaydetBtn.disabled = true

  const kuyruklaVeKapat = async (sebep) => {
    try {
      await kuyrugaEkle({ veri, foto, gubreler, etiket: hatEtiketi })
      mesajEl.style.color = '#f9ca24'
      mesajEl.innerHTML = `📴 ${sebep}<br>Kayıt cihazda saklandı, sinyal gelince gönderilecek.`
      setTimeout(() => document.getElementById('popup-overlay')?.remove(), 1800)
    } catch (e) {
      mesajEl.style.color = '#ff4757'
      mesajEl.textContent = 'Kuyruğa alınamadı: ' + e.message
      kaydetBtn.disabled = false
    }
  }

  // Çevrimdışıysa hiç denemeden kuyruğa al
  if (!navigator.onLine) return kuyruklaVeKapat('Çevrimdışısınız.')

  try {
    let fotografUrl = null

    if (foto) {
      // Yuklemeden once kucult: 3-8 MB'lik telefon fotograflari
      // sahada yavas yukleniyordu. EXIF yonu korunur; sikistirma
      // basarisiz olursa orijinal dosya yuklenir (kayit kaybolmaz).
      const { dosya: yuklenecek, kucuk } = await fotografiKucult(foto)

      const uzanti = 'jpg'
      const dosyaAdi = `${hatId}_${Date.now()}.${uzanti}`
      const { error } = await supabase.storage.from('fotograflar')
        .upload(dosyaAdi, yuklenecek, { contentType: 'image/jpeg' })
      if (error) throw new Error(error.message)
      fotografUrl = supabase.storage.from('fotograflar').getPublicUrl(dosyaAdi).data.publicUrl

      // Galeri izgarasi icin kucuk surum. Basarisiz olursa sessizce
      // gecilir — galeri o zaman tam boy surume duser.
      if (kucuk) {
        await supabase.storage.from('fotograflar')
          .upload(kucukSurumAdi(dosyaAdi), kucuk, { contentType: 'image/jpeg' })
          .catch(() => {})
      }
    }

    const { data: kayit, error } = await supabase
      .from('sulama_kayitlari')
      .insert({ ...veri, fotograf_url: fotografUrl })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    if (gubreler.length > 0) {
      const { error: gubreHata } = await supabase
        .from('gubre_uygulamalari')
        .insert(gubreler.map(g => ({ ...g, kayit_id: kayit.id })))
      if (gubreHata) throw new Error(gubreHata.message)
    }

    mesajEl.style.color = '#26de81'
    mesajEl.textContent = '✓ Kaydedildi!'
    setTimeout(() => document.getElementById('popup-overlay')?.remove(), 800)

  } catch (hata) {
    // Ağ koptuysa veri kaybolmasın — kuyruğa al.
    // Sunucu reddettiyse (doğrulama, yetki) kuyruklamak anlamsız,
    // sonsuza dek tekrar denenirdi; kullanıcıya söylenir.
    if (agHatasiMi(hata)) return kuyruklaVeKapat('Bağlantı kesildi.')
    mesajEl.style.color = '#ff4757'
    mesajEl.textContent = 'Hata: ' + hata.message
    kaydetBtn.disabled = false
  }
}