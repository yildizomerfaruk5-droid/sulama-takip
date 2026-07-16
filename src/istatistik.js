import { supabase } from './supabase.js'

// ── VERI TOPLAMA ──
export async function istatistikVerileriGetir(bolgeId = null) {
  let kayitSorgu = supabase
    .from('sulama_kayitlari')
    .select(`
      sure_dakika, baslangic_zamani, bitis_zamani, olusturma_zamani,
      durum, islem_turu, fotograf_url,
      hatlar!inner (hat_no, zonalar!inner (ad, bolge_id))
    `)
    .order('olusturma_zamani', { ascending: true })
    .limit(2000)
  if (bolgeId) kayitSorgu = kayitSorgu.eq('hatlar.zonalar.bolge_id', bolgeId)

  let turSorgu = supabase
    .from('turlar')
    .select('tur_no, durum, zonalar!inner (bolge_id)')
    .eq('durum', 'tamamlandi')
  if (bolgeId) turSorgu = turSorgu.eq('zonalar.bolge_id', bolgeId)

  let gubreSorgu = supabase
    .from('gubre_uygulamalari')
    .select(`
      miktar, birim, olcek,
      gubreler (ad),
      sulama_kayitlari!inner (hatlar!inner (zonalar!inner (bolge_id)))
    `)
  if (bolgeId) gubreSorgu = gubreSorgu.eq('sulama_kayitlari.hatlar.zonalar.bolge_id', bolgeId)

  const [k, t, g] = await Promise.all([kayitSorgu, turSorgu, gubreSorgu])
  return {
    kayitlar: k.data || [],
    turlar: t.data || [],
    gubreler: g.data || []
  }
}

// Kaydin dakika cinsinden suresi
function kayitSuresi(k) {
  if (k.sure_dakika) return k.sure_dakika
  if (k.baslangic_zamani && k.bitis_zamani) {
    const fark = (new Date(k.bitis_zamani) - new Date(k.baslangic_zamani)) / 60000
    return fark > 0 ? Math.round(fark) : 0
  }
  return 0
}

function saatFormat(dakika) {
  const saat = Math.floor(dakika / 60)
  const dk = Math.round(dakika % 60)
  if (saat === 0) return `${dk} dk`
  return `${saat} sa ${dk} dk`
}

// ── HTML ISKELETI ──
export function istatistikHTML() {
  return `
    <div id="ist-kartlar" style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    "></div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Hat Bazında Toplam Sulama Süresi (saat)</div>
      <div style="position:relative;"><canvas id="grafik-hat"></canvas></div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Son 30 Gün — Günlük Sulama Süresi (saat)</div>
      <div style="position:relative; height:220px;"><canvas id="grafik-gunluk"></canvas></div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Gübre Kullanım Dağılımı</div>
      <div style="position:relative; height:240px; max-width:420px; margin:0 auto;">
        <canvas id="grafik-gubre"></canvas>
      </div>
    </div>
  `
}

function kart(baslik, deger, renk = '#5dade2') {
  return `
    <div style="
      background: #1a2634;
      border: 1px solid #2c3e50;
      border-radius: 8px;
      padding: 12px 14px;
    ">
      <div style="color:#7f8c8d; font-size:11px; margin-bottom:4px;">${baslik}</div>
      <div style="color:${renk}; font-size:18px; font-weight:bold;">${deger}</div>
    </div>
  `
}

let grafikler = []

// ── CIZIM ──
export function istatistikCiz(veri) {
  const { kayitlar, turlar, gubreler } = veri

  // Eski grafikleri temizle (yeniden render'da)
  grafikler.forEach(g => { try { g.destroy() } catch (e) {} })
  grafikler = []

  const kartlarEl = document.getElementById('ist-kartlar')
  if (!kartlarEl) return

  if (kayitlar.length === 0 && gubreler.length === 0) {
    kartlarEl.parentElement.querySelectorAll('.ist-grafik-kutu').forEach(el => el.style.display = 'none')
    kartlarEl.innerHTML = `
      <div style="grid-column:1/-1; color:#7f8c8d; padding:20px; text-align:center;">
        Henüz veri yok. Sulama kayıtları biriktikçe istatistikler burada şekillenecek.
      </div>
    `
    return
  }

  // ── Ozet kartlar ──
  const toplamDk = kayitlar.reduce((t, k) => t + kayitSuresi(k), 0)
  const sonTur = turlar.reduce((m, t) => Math.max(m, t.tur_no || 0), 0)
  const fotoSayisi = kayitlar.filter(k => k.fotograf_url).length
  const litreToplam = gubreler.filter(g => g.birim === 'litre').reduce((t, g) => t + Number(g.miktar), 0)
  const kgToplam = gubreler.filter(g => g.birim === 'kg').reduce((t, g) => t + Number(g.miktar), 0)

  kartlarEl.innerHTML = [
    kart('Toplam Sulama', saatFormat(toplamDk), '#2e86de'),
    kart('Tamamlanan Su', sonTur > 0 ? `${sonTur}. Su` : '—', '#26de81'),
    kart('Kayıt Sayısı', kayitlar.length, '#e0e0e0'),
    kart('Fotoğraf', fotoSayisi, '#f9ca24'),
    kart('Gübre (sıvı)', `${Math.round(litreToplam * 10) / 10} litre`, '#a29bfe'),
    kart('Gübre (katı)', `${Math.round(kgToplam * 10) / 10} kg`, '#a29bfe')
  ].join('')

  if (typeof Chart === 'undefined') return
  Chart.defaults.color = '#7f8c8d'
  Chart.defaults.borderColor = 'rgba(44, 62, 80, 0.6)'

  // ── 1) Hat bazinda toplam sure ──
  const hatToplam = {}
  kayitlar.forEach(k => {
    const ad = `Hat-${k.hatlar?.hat_no ?? '?'}`
    hatToplam[ad] = (hatToplam[ad] || 0) + kayitSuresi(k)
  })
  const hatAdlari = Object.keys(hatToplam).sort((a, b) =>
    (parseInt(a.split('-')[1]) || 0) - (parseInt(b.split('-')[1]) || 0))

  const hatCanvas = document.getElementById('grafik-hat')
  if (hatCanvas && hatAdlari.length > 0) {
    hatCanvas.parentElement.style.height = Math.max(160, hatAdlari.length * 32 + 60) + 'px'
    grafikler.push(new Chart(hatCanvas, {
      type: 'bar',
      data: {
        labels: hatAdlari,
        datasets: [{
          data: hatAdlari.map(ad => Math.round(hatToplam[ad] / 6) / 10),
          backgroundColor: '#2e86de',
          borderRadius: 4,
          maxBarThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'saat' } }
        }
      }
    }))
  }

  // ── 2) Son 30 gun gunluk sure ──
  const bugun = new Date()
  const gunler = []
  const gunToplam = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(bugun)
    d.setDate(d.getDate() - i)
    const anahtar = d.toISOString().slice(0, 10)
    gunler.push(anahtar)
    gunToplam[anahtar] = 0
  }
  kayitlar.forEach(k => {
    const anahtar = (k.olusturma_zamani || '').slice(0, 10)
    if (anahtar in gunToplam) gunToplam[anahtar] += kayitSuresi(k)
  })

  const gunlukCanvas = document.getElementById('grafik-gunluk')
  if (gunlukCanvas) {
    grafikler.push(new Chart(gunlukCanvas, {
      type: 'bar',
      data: {
        labels: gunler.map(g => g.slice(8, 10) + '.' + g.slice(5, 7)),
        datasets: [{
          data: gunler.map(g => Math.round(gunToplam[g] / 6) / 10),
          backgroundColor: '#26de81',
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: 'saat' } },
          x: { ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 15 } }
        }
      }
    }))
  }

  // ── 3) Gubre dagilimi ──
  const gubreToplam = {}
  gubreler.forEach(g => {
    const ad = `${g.gubreler?.ad || '?'} (${g.birim})`
    gubreToplam[ad] = (gubreToplam[ad] || 0) + Number(g.miktar)
  })
  const gubreAdlari = Object.keys(gubreToplam)

  const gubreCanvas = document.getElementById('grafik-gubre')
  if (gubreCanvas) {
    if (gubreAdlari.length === 0) {
      gubreCanvas.parentElement.innerHTML =
        '<div style="color:#7f8c8d; text-align:center; padding:30px;">Henüz gübre kaydı yok.</div>'
    } else {
      grafikler.push(new Chart(gubreCanvas, {
        type: 'doughnut',
        data: {
          labels: gubreAdlari,
          datasets: [{
            data: gubreAdlari.map(ad => Math.round(gubreToplam[ad] * 10) / 10),
            backgroundColor: ['#2e86de', '#26de81', '#f9ca24', '#a29bfe', '#e17055', '#00cec9', '#fd79a8'],
            borderColor: '#1a2634',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      }))
    }
  }
}
