// ============================================================
// ISCI EKRANI — sahada telefonla kullanilir
//
// Tasarim ilkesi: tarlada, gunes altinda, tek elle ve muhtemelen eldivenle
// kullanilir. Bu yuzden ekranda AZ sey var ve en sik yapilan is (siradaki
// hatta gecmek) en buyuk dugme. Yonetim islemleri (sulamayi baslat/kapat,
// sure degistir, istatistik, bolge secimi) isciye hic gosterilmez —
// yanlislikla basilabilecek bir sey birakmamak icin.
//
// Yetki notu: bu ayrim su an yalnizca arayuz duzeyinde. Ana veri tablolarinda
// RLS kapali oldugu icin (teknik rapor 3. bolum) anon anahtari olan bir istemci
// teknik olarak her seyi yazabilir. Gercek kisitlama RLS acilinca gelecek.
// ============================================================

import { supabase } from './supabase.js'
import { sistemDurumuGetir, sureyiFormatla, sayacFormatla } from './hatlar.js'
import { hatIlerlet } from './sulama.js'
import { haritaOlustur, hatlariHaritayaCiz, vanalariHaritayaCiz } from './harita.js'
import { gecmisKayitlariGetir, gecmisHTML } from './gecmis.js'
import { popupHTML, popupEventleriEkle } from './popup.js'
import { ROL_SEKMELERI, sekmeCubuguHTML, panelHTML, sekmeDogrula } from './kabuk.js'

let sistemDurumu = null
let isciBolge = null
let aktifHatBilgisi = null
let sayacInterval = null

// ── AKTIF HAT + SIRADAKI HAT BILGISI ──
async function hatBilgisiGetir(durum) {
  if (!durum?.aktif_hat_id) return null

  const [{ data: hat }, { data: vanalar }, { data: siradaki }] = await Promise.all([
    supabase.from('hatlar').select('*, zonalar(ad)').eq('id', durum.aktif_hat_id).maybeSingle(),
    supabase.from('vanalar').select('isaretci_no, fiskiye_sayisi').eq('hat_id', durum.aktif_hat_id).order('isaretci_no'),
    durum.siradaki_hat_id
      ? supabase.from('hatlar').select('hat_no, parsel_bilgisi').eq('id', durum.siradaki_hat_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  if (!hat) return null

  return {
    hat,
    siradaki,
    vanaNolar: [...new Set((vanalar || []).map(v => v.isaretci_no))].join(', '),
    fiskiyeToplam: (vanalar || []).reduce((t, v) => t + (v.fiskiye_sayisi || 0), 0)
  }
}

// ── SISTEM KAPALIYKEN ──
function kapaliHTML() {
  return `
    <div class="isci-kapali">
      <div class="isci-kapali-ikon">💤</div>
      <div class="isci-kapali-baslik">Sistem kapalı</div>
      <div class="isci-kapali-metin">
        Şu anda sulama yapılmıyor. Sulamayı yönetici başlatır;
        başladığında bu ekran kendiliğinden güncellenir.
      </div>
    </div>
  `
}

// ── CALISAN HAT KARTI ──
function aktifHatHTML(bilgi) {
  const { hat, siradaki, vanaNolar, fiskiyeToplam } = bilgi
  const alanDekar = Math.round(fiskiyeToplam * 0.12 * 10) / 10  // fiskiye basina ~120 m2

  return `
    <div class="isci-kart">
      <div class="isci-kart-ust">ŞU AN SULANAN</div>
      <div class="isci-hat-no">Hat-${hat.hat_no}</div>
      <div class="isci-hat-yer">
        ${hat.zonalar?.ad || ''}${hat.parsel_bilgisi ? ' • ' + hat.parsel_bilgisi : ''}
      </div>

      <div class="isci-sayac" id="isci-sayac">--:--:--</div>
      <div class="isci-ilerleme"><div class="isci-ilerleme-dolu" id="isci-ilerleme"></div></div>
      <div class="isci-hedef">Hedef süre: ${sureyiFormatla(hat.varsayilan_sure_dk)}</div>

      <div class="isci-detay">
        <div><span>Vanalar</span><b>${vanaNolar || '—'}</b></div>
        <div><span>Fıskiye</span><b>${fiskiyeToplam || '—'}</b></div>
        <div><span>Alan</span><b>~${alanDekar} dk</b></div>
      </div>
    </div>

    <button class="isci-btn isci-btn-ana" onclick="isciHatIlerlet()">
      ⏭ Sıradaki Hatta Geç
    </button>
    <button class="isci-btn isci-btn-ikincil" onclick="isciKayitEkle()">
      📸 Kayıt Ekle (foto / gübre)
    </button>

    ${siradaki ? `
      <div class="isci-siradaki">
        Sıradaki: <b>Hat-${siradaki.hat_no}</b>
        ${siradaki.parsel_bilgisi ? `<span>${siradaki.parsel_bilgisi}</span>` : ''}
      </div>
    ` : `
      <div class="isci-siradaki">
        Bu zonanın <b>son hattı</b> — bitince zona tamamlanır.
      </div>
    `}
  `
}

// ── RENDER ──
export async function isciRender(bolge) {
  const app = document.querySelector('#app')
  if (bolge) isciBolge = bolge

  if (!isciBolge) {
    app.innerHTML = '<div class="loading">Size atanmış bir bölge yok. Yöneticinize bildirin.</div>'
    return
  }

  const durum = await sistemDurumuGetir(isciBolge.id)
  sistemDurumu = durum
  aktifHatBilgisi = await hatBilgisiGetir(durum)

  const acik = durum?.sistem_acik && aktifHatBilgisi
  const sekmeler = ROL_SEKMELERI.isci
  sekmeDogrula(sekmeler)

  app.innerHTML = `
    <div class="uygulama">
      <header class="header">
        <h1>🌾 SULAMA</h1>
        <div class="header-sag">
          <div class="meta" style="color:#5dade2;">📍 ${isciBolge.ad}</div>
          <button
            onclick="cikisYap()"
            style="min-height:44px; padding:6px 14px; background:transparent;
                   border:1px solid #2c3e50; border-radius:8px; color:#7f8c8d;
                   font-size:13px; cursor:pointer;"
          >Çıkış</button>
        </div>
      </header>

      <main class="icerik">
        <div class="container">
          ${panelHTML('simdi', acik ? aktifHatHTML(aktifHatBilgisi) : kapaliHTML())}
          ${panelHTML('harita', '<div id="harita"></div>')}
          ${panelHTML('gecmis', `
            <div class="gecmis-baslik">📋 Son Kayıtlar</div>
            <div id="gecmis-liste">Yükleniyor...</div>
          `)}
        </div>
      </main>
      ${sekmeCubuguHTML(sekmeler)}
    </div>
  `

  let tamamlananlar = []
  if (durum?.aktif_tur_id) {
    const { data } = await supabase
      .from('sulama_kayitlari')
      .select('hat_id')
      .eq('tur_id', durum.aktif_tur_id)
      .eq('durum', 'tamamlandi')
    tamamlananlar = (data || []).map(k => k.hat_id)
  }

  const haritaEl = document.getElementById('harita')
  if (haritaEl) {
    haritaOlustur('harita', isciBolge)
    hatlariHaritayaCiz(durum, tamamlananlar, isciBolge.id)
    vanalariHaritayaCiz(isciBolge.id, durum, tamamlananlar)
  }

  gecmisKayitlariGetir(isciBolge.id).then(kayitlar => {
    const el = document.getElementById('gecmis-liste')
    if (el) el.innerHTML = gecmisHTML(kayitlar)
  })

  if (acik) sayaciBaslat()
  else if (sayacInterval) clearInterval(sayacInterval)
}

// ── SAYAÇ ──
function sayaciBaslat() {
  if (sayacInterval) clearInterval(sayacInterval)

  const limitMs = (aktifHatBilgisi?.hat?.varsayilan_sure_dk || 0) * 60 * 1000

  sayacInterval = setInterval(() => {
    const baslama = sistemDurumu?.aktif_hat_baslangic
    if (!sistemDurumu?.sistem_acik || !baslama) {
      clearInterval(sayacInterval)
      return
    }

    const gecenMs = Date.now() - new Date(baslama).getTime()

    const sayacEl = document.getElementById('isci-sayac')
    if (sayacEl) sayacEl.textContent = sayacFormatla(gecenMs)

    const cubukEl = document.getElementById('isci-ilerleme')
    if (cubukEl && limitMs > 0) {
      cubukEl.style.width = Math.min(100, (gecenMs / limitMs) * 100) + '%'
    }

    // Otomatik gecisi isci ekrani TETIKLEMEZ. Ayni anda acik olan her cihaz
    // tetiklerse gereksiz yaris olusur; hatIlerlet zaten korumali ama isin
    // sahibi yonetici ekrani olsun. Sure dolunca isciye yalnizca isaret verilir.
    if (limitMs > 0 && gecenMs >= limitMs) {
      sayacEl?.classList.add('isci-sayac-doldu')
    }
  }, 1000)
}

// ── EYLEMLER ──
window.isciHatIlerlet = async () => {
  const hatNo = aktifHatBilgisi?.hat?.hat_no
  if (!confirm(`Hat-${hatNo} tamamlandı olarak kaydedilip sıradaki hatta geçilecek.\n\nOnaylıyor musunuz?`)) return

  const sonuc = await hatIlerlet(isciBolge.id, sistemDurumu)

  if (sonuc.sonuc === 'zona_gecildi') {
    alert(`✅ ${sonuc.bitenZona} bitti. ${sonuc.yeniZona} başlıyor.`)
  } else if (sonuc.sonuc === 'tur_bitti') {
    alert(`🎉 ${sonuc.turNo}. Su tamamlandı. Sistem kapandı.`)
  } else if (sonuc.sonuc === 'baskasi_yapti') {
    // Baska bir cihaz ayni gecisi ustlendi — realtime render'i zaten tetikler
    return
  }

  isciRender()
}

window.isciKayitEkle = async () => {
  const hat = aktifHatBilgisi?.hat
  if (!hat) return

  document.body.insertAdjacentHTML('beforeend', popupHTML(hat))
  popupEventleriEkle(hat.id, sistemDurumu?.aktif_tur_id)
}

// ── REALTIME ──
export function isciRealtimeBaslat() {
  supabase
    .channel('isci_sistem')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sistem_durumu'
    }, () => isciRender())
    .subscribe()
}
