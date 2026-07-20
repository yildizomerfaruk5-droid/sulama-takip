import { supabase } from './supabase.js'

// KUYU DEBISI SABITTIR: ~94 m3/saat (94 fiskiye x 1000 lt/sa referans noktasi).
// Hat kac fiskiyeli olursa olsun kuyu ayni suyu basar; basinca gore
// fiskiye basina dusen su 550-1600 lt/sa araliginda degisir.
const KUYU_DEBI_M3_SAAT = 94

function hatAlanDekar(fiskiye) {
  return (fiskiye || 0) * 0.12 // fiskiye basina ~120 m2
}

// Gercek toplam miktar (litre/kg): dekar girisleri hattin alaniyla carpilir
function gubreMutlak(g) {
  const f = g.sulama_kayitlari?.hatlar?.fiskiye_sayisi
  return g.olcek === 'hat' ? Number(g.miktar) : Number(g.miktar) * hatAlanDekar(f)
}

// Dekar basina miktar: hat girisleri hattin alanina bolunur
function gubreDekarBasina(g) {
  const f = g.sulama_kayitlari?.hatlar?.fiskiye_sayisi
  const alan = hatAlanDekar(f)
  return g.olcek === 'dekar' ? Number(g.miktar) : (alan ? Number(g.miktar) / alan : 0)
}

function suM3(kayitlar) {
  return kayitlar.reduce((t, k) => t + (k.sure_dakika / 60) * KUYU_DEBI_M3_SAAT, 0)
}

// ── DURUM ──
let ham = null // { kayitlar, turlar, gubreler }
let secim = { donem: 'sezon', tur: 'tum', kapsam: 'tum' }
let grafikler = []

// ── VERI TOPLAMA ──
export async function istatistikVerileriGetir(bolgeId = null) {
  let kayitSorgu = supabase
    .from('sulama_kayitlari')
    .select(`
      id, sure_dakika, baslangic_zamani, bitis_zamani, olusturma_zamani,
      durum, islem_turu, ilac_gubre_notu, fotograf_url, tur_id,
      hatlar!inner (hat_no, fiskiye_sayisi, zonalar!inner (ad, bolge_id))
    `)
    .order('olusturma_zamani', { ascending: true })
    .limit(5000)
  if (bolgeId) kayitSorgu = kayitSorgu.eq('hatlar.zonalar.bolge_id', bolgeId)

  let turSorgu = supabase
    .from('turlar')
    .select('id, tur_no, baslangic_zamani, bitis_zamani, durum, zonalar!inner (bolge_id)')
  if (bolgeId) turSorgu = turSorgu.eq('zonalar.bolge_id', bolgeId)

  let gubreSorgu = supabase
    .from('gubre_uygulamalari')
    .select(`
      miktar, birim, olcek,
      gubreler (ad),
      sulama_kayitlari!inner (olusturma_zamani, tur_id,
        hatlar!inner (hat_no, fiskiye_sayisi, zonalar!inner (ad, bolge_id)))
    `)
  if (bolgeId) gubreSorgu = gubreSorgu.eq('sulama_kayitlari.hatlar.zonalar.bolge_id', bolgeId)

  const [k, t, g] = await Promise.all([kayitSorgu, turSorgu, gubreSorgu])
  return { kayitlar: k.data || [], turlar: t.data || [], gubreler: g.data || [] }
}

export function istatistikHTML() {
  return '<div id="ist-icerik" style="color:#7f8c8d;">Yükleniyor...</div>'
}

export function istatistikCiz(veri) {
  ham = veri
  bolumCiz()
}

// ── YARDIMCILAR ──
function turNoBul(turId) {
  const t = (ham.turlar || []).find(x => x.id === turId)
  return t ? t.tur_no : null
}

function saatFormat(dk) {
  const sa = Math.floor(dk / 60)
  const kalan = Math.round(dk % 60)
  if (sa === 0) return `${kalan} dk`
  return `${sa} sa ${kalan} dk`
}

function donemSiniri() {
  if (secim.donem === 'hafta') return Date.now() - 7 * 864e5
  if (secim.donem === 'ay') return Date.now() - 30 * 864e5
  return 0
}

function kayitUygun(k) {
  const zaman = k.baslangic_zamani || k.olusturma_zamani
  if (new Date(zaman).getTime() < donemSiniri()) return false
  if (secim.tur !== 'tum' && turNoBul(k.tur_id) !== Number(secim.tur)) return false
  if (secim.kapsam.startsWith('z|') && k.hatlar?.zonalar?.ad !== secim.kapsam.slice(2)) return false
  if (secim.kapsam.startsWith('h|') && String(k.hatlar?.hat_no) !== secim.kapsam.slice(2)) return false
  return true
}

function gubreUygun(g) {
  const k = g.sulama_kayitlari
  if (!k) return false
  if (new Date(k.olusturma_zamani).getTime() < donemSiniri()) return false
  if (secim.tur !== 'tum' && turNoBul(k.tur_id) !== Number(secim.tur)) return false
  if (secim.kapsam.startsWith('z|') && k.hatlar?.zonalar?.ad !== secim.kapsam.slice(2)) return false
  if (secim.kapsam.startsWith('h|') && String(k.hatlar?.hat_no) !== secim.kapsam.slice(2)) return false
  return true
}

// Gercek sulama tamamlama kayitlari (sureli); veri girisleri haric
function sulamalar() {
  return ham.kayitlar.filter(k => kayitUygun(k) && k.sure_dakika != null && k.durum === 'tamamlandi')
}

// ── BOLUM CIZIMI ──
function bolumCiz() {
  const kok = document.getElementById('ist-icerik')
  if (!kok || !ham) return

  grafikler.forEach(g => { try { g.destroy() } catch (e) {} })
  grafikler = []

  const stil = `
    padding: 7px 10px;
    background: #0f1923;
    border: 1px solid #2c3e50;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 13px;
  `

  // Filtre secenekleri veriden
  const turNolar = [...new Set(ham.turlar.map(t => t.tur_no))].sort((a, b) => a - b)
  const zonalar = [...new Set(ham.kayitlar.map(k => k.hatlar?.zonalar?.ad).filter(Boolean))]
  const hatlar = [...new Set(ham.kayitlar.map(k => k.hatlar?.hat_no).filter(x => x != null))].sort((a, b) => a - b)

  kok.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; align-items:center;">
      <select id="ist-donem" style="${stil}">
        <option value="sezon">📅 Tüm Sezon</option>
        <option value="ay">Son 30 Gün</option>
        <option value="hafta">Son 7 Gün</option>
      </select>
      <select id="ist-tur" style="${stil}">
        <option value="tum">💧 Tüm Sular</option>
        ${turNolar.map(n => `<option value="${n}">${n}. Su</option>`).join('')}
      </select>
      <select id="ist-kapsam" style="${stil}">
        <option value="tum">🌾 Tüm Tarlalar</option>
        ${zonalar.map(z => `<option value="z|${z}">${z}</option>`).join('')}
        ${hatlar.map(h => `<option value="h|${h}">Hat-${h}</option>`).join('')}
      </select>
      <span style="flex:1;"></span>
      <button id="ist-csv-kayit" style="${stil} cursor:pointer;">📄 Kayıtlar CSV</button>
      <button id="ist-csv-gubre" style="${stil} cursor:pointer;">🧪 Gübre CSV</button>
      <button id="ist-rapor" style="${stil} cursor:pointer; color:#26de81;">🖨 Sezon Raporu</button>
    </div>

    <div id="ist-kartlar" style="
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    "></div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Su (Tur) Karşılaştırması — toplam süre (saat)</div>
      <div style="position:relative; height:180px;"><canvas id="grafik-tur"></canvas></div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Hat Bazında Toplam Sulama Süresi (saat)</div>
      <div style="position:relative;"><canvas id="grafik-hat"></canvas></div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Günlük Sulama Süresi (saat)</div>
      <div style="position:relative; height:200px;"><canvas id="grafik-gunluk"></canvas></div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Gübre Kullanımı — dekar başına</div>
      <div style="position:relative; height:230px; max-width:420px; margin:0 auto;">
        <canvas id="grafik-gubre"></canvas>
      </div>
    </div>

    <div class="ist-grafik-kutu">
      <div class="ist-grafik-baslik">Hat Detay Tablosu</div>
      <div id="ist-tablo" style="overflow-x:auto;"></div>
    </div>
  `

  // Filtre degerlerini geri yukle + dinle
  document.getElementById('ist-donem').value = secim.donem
  document.getElementById('ist-tur').value = secim.tur
  document.getElementById('ist-kapsam').value = secim.kapsam
  ;['donem', 'tur', 'kapsam'].forEach(ad => {
    document.getElementById('ist-' + ad).addEventListener('change', (e) => {
      secim[ad] = e.target.value
      bolumCiz()
    })
  })
  document.getElementById('ist-csv-kayit').addEventListener('click', kayitCsvIndir)
  document.getElementById('ist-csv-gubre').addEventListener('click', gubreCsvIndir)
  document.getElementById('ist-rapor').addEventListener('click', sezonRaporuYazdir)

  icerikCiz()
}

function kart(baslik, deger, renk = '#5dade2') {
  return `
    <div style="background:#1a2634; border:1px solid #2c3e50; border-radius:8px; padding:12px 14px;">
      <div style="color:#7f8c8d; font-size:11px; margin-bottom:4px;">${baslik}</div>
      <div style="color:${renk}; font-size:18px; font-weight:bold;">${deger}</div>
    </div>
  `
}

function icerikCiz() {
  const sul = sulamalar()
  const girisler = ham.kayitlar.filter(k => kayitUygun(k))
  const gub = ham.gubreler.filter(gubreUygun)

  // ── Kartlar ──
  const toplamDk = sul.reduce((t, k) => t + k.sure_dakika, 0)
  const ortDk = sul.length ? toplamDk / sul.length : 0
  const foto = girisler.filter(k => k.fotograf_url).length
  const litre = gub.filter(g => g.birim === 'litre').reduce((t, g) => t + gubreMutlak(g), 0)
  const kg = gub.filter(g => g.birim === 'kg').reduce((t, g) => t + gubreMutlak(g), 0)

  document.getElementById('ist-kartlar').innerHTML = [
    kart('Toplam Sulama', saatFormat(toplamDk), '#2e86de'),
    kart('Sulama Sayısı', sul.length, '#26de81'),
    kart('Ortalama Süre', sul.length ? saatFormat(ortDk) : '—', '#e0e0e0'),
    kart('Fotoğraf', foto, '#f9ca24'),
    kart('Gübre (sıvı)', `${Math.round(litre * 10) / 10} litre`, '#a29bfe'),
    kart('Gübre (katı)', `${Math.round(kg * 10) / 10} kg`, '#a29bfe'),
    kart('Su Tüketimi', `~${Math.round(suM3(sul)).toLocaleString('tr-TR')} m³`, '#00e5ff')
  ].join('')

  if (typeof Chart === 'undefined') return
  Chart.defaults.color = '#7f8c8d'
  Chart.defaults.borderColor = 'rgba(44, 62, 80, 0.6)'

  // ── 1) Tur karsilastirma (tur filtresinden bagimsiz) ──
  const turToplam = {}
  ham.kayitlar
    .filter(k => k.sure_dakika != null && k.durum === 'tamamlandi')
    .filter(k => {
      if (new Date(k.olusturma_zamani).getTime() < donemSiniri()) return false
      if (secim.kapsam.startsWith('z|') && k.hatlar?.zonalar?.ad !== secim.kapsam.slice(2)) return false
      if (secim.kapsam.startsWith('h|') && String(k.hatlar?.hat_no) !== secim.kapsam.slice(2)) return false
      return true
    })
    .forEach(k => {
      const no = turNoBul(k.tur_id)
      if (no != null) turToplam[no] = (turToplam[no] || 0) + k.sure_dakika
    })
  const turlar = Object.keys(turToplam).map(Number).sort((a, b) => a - b)

  const turCv = document.getElementById('grafik-tur')
  if (turCv) {
    grafikler.push(new Chart(turCv, {
      type: 'bar',
      data: {
        labels: turlar.map(n => `${n}. Su`),
        datasets: [{
          data: turlar.map(n => Math.round(turToplam[n] / 6) / 10),
          backgroundColor: '#00cec9',
          borderRadius: 4,
          maxBarThickness: 60
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: 'saat' } } }
      }
    }))
  }

  // ── 2) Hat bazinda sure ──
  const hatToplam = {}
  sul.forEach(k => {
    const ad = `Hat-${k.hatlar?.hat_no ?? '?'}`
    hatToplam[ad] = (hatToplam[ad] || 0) + k.sure_dakika
  })
  const hatAdlari = Object.keys(hatToplam).sort((a, b) =>
    (parseInt(a.split('-')[1]) || 0) - (parseInt(b.split('-')[1]) || 0))

  const hatCv = document.getElementById('grafik-hat')
  if (hatCv) {
    hatCv.parentElement.style.height = Math.max(140, hatAdlari.length * 32 + 60) + 'px'
    grafikler.push(new Chart(hatCv, {
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
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: true, text: 'saat' } } }
      }
    }))
  }

  // ── 3) Gunluk sure ──
  const gunSayisi = secim.donem === 'hafta' ? 7 : 30
  const bugun = new Date()
  const gunler = []
  const gunToplam = {}
  for (let i = gunSayisi - 1; i >= 0; i--) {
    const d = new Date(bugun); d.setDate(d.getDate() - i)
    const a = d.toISOString().slice(0, 10)
    gunler.push(a); gunToplam[a] = 0
  }
  sul.forEach(k => {
    const a = ((k.baslangic_zamani || k.olusturma_zamani) || '').slice(0, 10)
    if (a in gunToplam) gunToplam[a] += k.sure_dakika
  })

  const gunCv = document.getElementById('grafik-gunluk')
  if (gunCv) {
    grafikler.push(new Chart(gunCv, {
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
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: 'saat' } },
          x: { ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 15 } }
        }
      }
    }))
  }

  // ── 4) Gubre dagilimi ──
  const gubreToplam = {}
  gub.forEach(g => {
    const ad = `${g.gubreler?.ad || '?'} (${g.birim}/dekar)`
    gubreToplam[ad] = (gubreToplam[ad] || 0) + gubreDekarBasina(g)
  })
  const gubreAdlari = Object.keys(gubreToplam)

  const gubCv = document.getElementById('grafik-gubre')
  if (gubCv) {
    if (gubreAdlari.length === 0) {
      gubCv.parentElement.innerHTML =
        '<div style="color:#7f8c8d; text-align:center; padding:30px;">Bu filtrede gübre kaydı yok.</div>'
    } else {
      grafikler.push(new Chart(gubCv, {
        type: 'doughnut',
        data: {
          labels: gubreAdlari,
          datasets: [{
            data: gubreAdlari.map(ad => Math.round(gubreToplam[ad] * 10) / 10),
            backgroundColor: ['#2e86de', '#26de81', '#f9ca24', '#a29bfe', '#e17055', '#00cec9', '#fd79a8'],
            borderColor: '#1a2634', borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      }))
    }
  }

  // ── 5) Hat detay tablosu ──
  tabloCiz(sul, gub)
}

function tabloCiz(sul, gub) {
  const satirlar = {}
  sul.forEach(k => {
    const no = k.hatlar?.hat_no ?? '?'
    if (!satirlar[no]) satirlar[no] = { sayi: 0, dk: 0, son: null, litre: 0, kg: 0, m3: 0 }
    satirlar[no].sayi++
    satirlar[no].dk += k.sure_dakika
    satirlar[no].m3 += (k.sure_dakika / 60) * KUYU_DEBI_M3_SAAT
    const bit = new Date(k.bitis_zamani || k.olusturma_zamani)
    if (!satirlar[no].son || bit > satirlar[no].son) {
      satirlar[no].son = bit
      satirlar[no].sonBas = k.baslangic_zamani ? new Date(k.baslangic_zamani) : null
    }
  })
  gub.forEach(g => {
    const no = g.sulama_kayitlari?.hatlar?.hat_no
    if (no == null) return
    if (!satirlar[no]) satirlar[no] = { sayi: 0, dk: 0, son: null, litre: 0, kg: 0, m3: 0 }
    if (g.birim === 'litre') satirlar[no].litre += gubreMutlak(g)
    else satirlar[no].kg += gubreMutlak(g)
  })

  const nolar = Object.keys(satirlar).map(Number).sort((a, b) => a - b)
  const el = document.getElementById('ist-tablo')
  if (!el) return

  if (nolar.length === 0) {
    el.innerHTML = '<div style="color:#7f8c8d; padding:12px;">Bu filtrede kayıt yok.</div>'
    return
  }

  el.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
      <tr style="color:#5dade2; text-align:left;">
        <th style="padding:6px 8px;">Hat</th>
        <th style="padding:6px 8px;">Sulama</th>
        <th style="padding:6px 8px;">Toplam</th>
        <th style="padding:6px 8px;">Ortalama</th>
        <th style="padding:6px 8px;">Su (m³)</th>
        <th style="padding:6px 8px;">Son Sulama</th>
        <th style="padding:6px 8px;">Gübre</th>
      </tr>
      ${nolar.map(no => {
        const s = satirlar[no]
        const gubreStr = [
          s.litre ? `${Math.round(s.litre * 10) / 10} lt` : '',
          s.kg ? `${Math.round(s.kg * 10) / 10} kg` : ''
        ].filter(Boolean).join(' + ') || '—'
        return `
          <tr style="border-top:1px solid #16222e; color:#e0e0e0;">
            <td style="padding:6px 8px; font-weight:bold;">Hat-${no}</td>
            <td style="padding:6px 8px;">${s.sayi} kez</td>
            <td style="padding:6px 8px;">${saatFormat(s.dk)}</td>
            <td style="padding:6px 8px;">${s.sayi ? saatFormat(s.dk / s.sayi) : '—'}</td>
            <td style="padding:6px 8px;">~${Math.round(s.m3).toLocaleString('tr-TR')}</td>
            <td style="padding:6px 8px;">${s.son
              ? (s.sonBas
                  ? s.sonBas.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) +
                    ' → ' + s.son.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                  : s.son.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))
              : '—'}</td>
            <td style="padding:6px 8px;">${gubreStr}</td>
          </tr>
        `
      }).join('')}
    </table>
  `
}

// ── CSV DISA AKTARIM (tum sezon, filtresiz — arsiv amacli) ──
function csvDosyaIndir(ad, satirlar) {
  const icerik = '﻿' + satirlar.map(s =>
    s.map(h => `"${String(h ?? '').replace(/"/g, '""')}"`).join(';')
  ).join('\r\n')
  const blob = new Blob([icerik], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = ad
  a.click()
  URL.revokeObjectURL(a.href)
}

function kayitCsvIndir() {
  const satirlar = [[
    'Tarih', 'Başlangıç', 'Bitiş', 'Hat', 'Zona', 'Su', 'Durum', 'İşlem', 'Süre (dk)', 'Not', 'Fotoğraf URL'
  ]]
  ham.kayitlar.forEach(k => {
    const t = new Date(k.baslangic_zamani || k.olusturma_zamani)
    satirlar.push([
      t.toLocaleDateString('tr-TR'),
      t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      k.bitis_zamani ? new Date(k.bitis_zamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '',
      'Hat-' + (k.hatlar?.hat_no ?? '?'),
      k.hatlar?.zonalar?.ad || '',
      (turNoBul(k.tur_id) ?? '') + '',
      k.durum || '',
      k.islem_turu || '',
      k.sure_dakika ?? '',
      k.ilac_gubre_notu || '',
      k.fotograf_url || ''
    ])
  })
  csvDosyaIndir(`sulama_kayitlari_${new Date().toISOString().slice(0, 10)}.csv`, satirlar)
}

function gubreCsvIndir() {
  const satirlar = [['Tarih', 'Hat', 'Su', 'Gübre', 'Miktar', 'Birim', 'Ölçek']]
  ham.gubreler.forEach(g => {
    const k = g.sulama_kayitlari
    const t = k ? new Date(k.olusturma_zamani) : null
    satirlar.push([
      t ? t.toLocaleDateString('tr-TR') : '',
      'Hat-' + (k?.hatlar?.hat_no ?? '?'),
      (turNoBul(k?.tur_id) ?? '') + '',
      g.gubreler?.ad || '',
      g.miktar,
      g.birim,
      g.olcek
    ])
  })
  csvDosyaIndir(`gubre_uygulamalari_${new Date().toISOString().slice(0, 10)}.csv`, satirlar)
}

// ── YAZDIRILABILIR SEZON RAPORU ──
function sezonRaporuYazdir() {
  const sul = ham.kayitlar.filter(k => k.sure_dakika != null && k.durum === 'tamamlandi')
  const toplamDk = sul.reduce((t, k) => t + k.sure_dakika, 0)

  const turToplam = {}
  sul.forEach(k => {
    const no = turNoBul(k.tur_id)
    if (no != null) {
      if (!turToplam[no]) turToplam[no] = { dk: 0, sayi: 0 }
      turToplam[no].dk += k.sure_dakika
      turToplam[no].sayi++
    }
  })

  const hatToplam = {}
  sul.forEach(k => {
    const no = k.hatlar?.hat_no ?? '?'
    if (!hatToplam[no]) hatToplam[no] = { dk: 0, sayi: 0 }
    hatToplam[no].dk += k.sure_dakika
    hatToplam[no].sayi++
  })

  const gubreToplam = {}
  ham.gubreler.forEach(g => {
    const ad = `${g.gubreler?.ad || '?'} (${g.birim})`
    gubreToplam[ad] = (gubreToplam[ad] || 0) + gubreMutlak(g)
  })

  const w = window.open('', '_blank')
  w.document.write(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Sezon Raporu</title>
<style>
  body { font-family: Arial, sans-serif; color: #222; margin: 40px; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 24px; color: #1450b8; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #999; padding: 5px 8px; font-size: 12px; text-align: left; }
  th { background: #eef3fa; }
  .ozet { margin-top: 10px; font-size: 13px; }
  @media print { body { margin: 15mm; } }
</style></head><body>
  <h1>🌾 Sulama Takip Sistemi — Sezon Raporu</h1>
  <div class="ozet">
    Rapor tarihi: ${new Date().toLocaleString('tr-TR')}<br>
    Toplam sulama: <b>${saatFormat(toplamDk)}</b> — ${sul.length} hat sulaması —
    Tahmini su tüketimi: <b>~${Math.round(suM3(sul)).toLocaleString('tr-TR')} m³</b> —
    Fotoğraf: ${ham.kayitlar.filter(k => k.fotograf_url).length} adet
    <br><small>(Kuyu debisi sabit ~94 m³/saat kabulüyle hesaplanmıştır; fıskiye başına düşen su hat büyüklüğüne göre 550-1600 lt/sa arasında değişir)</small>
  </div>

  <h2>Su (Tur) Özeti</h2>
  <table><tr><th>Su</th><th>Hat Sulaması</th><th>Toplam Süre</th></tr>
  ${Object.keys(turToplam).map(Number).sort((a, b) => a - b).map(no =>
    `<tr><td>${no}. Su</td><td>${turToplam[no].sayi}</td><td>${saatFormat(turToplam[no].dk)}</td></tr>`
  ).join('')}
  </table>

  <h2>Hat Özeti</h2>
  <table><tr><th>Hat</th><th>Sulama Sayısı</th><th>Toplam Süre</th><th>Ortalama</th></tr>
  ${Object.keys(hatToplam).map(Number).sort((a, b) => a - b).map(no =>
    `<tr><td>Hat-${no}</td><td>${hatToplam[no].sayi}</td><td>${saatFormat(hatToplam[no].dk)}</td><td>${saatFormat(hatToplam[no].dk / hatToplam[no].sayi)}</td></tr>`
  ).join('')}
  </table>

  <h2>Gübre Özeti</h2>
  <table><tr><th>Gübre</th><th>Toplam Miktar</th></tr>
  ${Object.keys(gubreToplam).map(ad =>
    `<tr><td>${ad}</td><td>${Math.round(gubreToplam[ad] * 10) / 10}</td></tr>`
  ).join('')}
  </table>

  <script>window.onload = () => window.print()</` + `script>
</body></html>`)
  w.document.close()
}
