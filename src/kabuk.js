// ============================================================
// MOBIL KABUK — alt sekme cubugu ve panel gecisleri
//
// Sekme degisimi yeniden render ETMEZ: paneller bir kez cizilir, geciste
// yalnizca gorunurluk degisir. Her sekme dokunusunda veriyi yeniden cekmek
// tarlada mobil veriyi ve pili bosuna harcar, ayrica haritayi ve grafikleri
// sifirdan kurmak gecisi gozle gorulur sekilde yavaslatirdi.
// ============================================================

import { haritaBoyutuTazele } from './harita.js'

const SEKMELER = {
  simdi:      { ad: 'Şimdi',      ikon: '💧' },
  harita:     { ad: 'Harita',     ikon: '🗺️' },
  hatlar:     { ad: 'Hatlar',     ikon: '📋' },
  gecmis:     { ad: 'Geçmiş',     ikon: '🕘' },
  istatistik: { ad: 'İstatistik', ikon: '📊' }
}

// Rol basina sekme seti. Isci sahada tek ise odaklanir: ne olduğu, nerede
// oldugu ve kayit girisi — istatistik ve zona yonetimi ona gosterilmez.
export const ROL_SEKMELERI = {
  yonetici:    ['simdi', 'harita', 'hatlar', 'gecmis', 'istatistik'],
  denetleyici: ['simdi', 'harita', 'hatlar', 'gecmis', 'istatistik'],
  isci:        ['simdi', 'harita', 'gecmis'],
  viewer:      ['simdi', 'harita', 'gecmis']
}

let aktifSekme = 'simdi'

export function aktifSekmeGetir() {
  return aktifSekme
}

// render() sonrasi secim korunur; rol degisip sekme kaybolduysa ilkine don
export function sekmeDogrula(anahtarlar) {
  if (!anahtarlar.includes(aktifSekme)) aktifSekme = anahtarlar[0]
}

export function sekmeCubuguHTML(anahtarlar) {
  return `
    <nav class="sekme-cubugu">
      ${anahtarlar.map(a => `
        <button
          class="sekme ${a === aktifSekme ? 'sekme-aktif' : ''}"
          data-sekme-dugme="${a}"
          onclick="sekmeDegistir('${a}')"
        >
          <span class="sekme-ikon">${SEKMELER[a].ikon}</span>
          <span class="sekme-ad">${SEKMELER[a].ad}</span>
        </button>
      `).join('')}
    </nav>
  `
}

export function panelHTML(anahtar, icerik) {
  return `
    <section class="panel ${anahtar === aktifSekme ? 'panel-aktif' : ''}" data-panel="${anahtar}">
      ${icerik}
    </section>
  `
}

export function sekmeDegistir(anahtar) {
  aktifSekme = anahtar

  document.querySelectorAll('[data-panel]').forEach(p =>
    p.classList.toggle('panel-aktif', p.dataset.panel === anahtar)
  )
  document.querySelectorAll('[data-sekme-dugme]').forEach(b =>
    b.classList.toggle('sekme-aktif', b.dataset.sekmeDugme === anahtar)
  )

  // Harita gizliyken olusmus olabilir — gorunur olunca yeniden olcsun
  if (anahtar === 'harita') haritaBoyutuTazele()

  // Yeni sekme basindan gorunsun
  document.querySelector('.icerik')?.scrollTo(0, 0)
}
