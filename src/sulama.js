// ============================================================
// SULAMA OTOMASYONU — tur / zona / hat gecis kurallari
//
// Sunucu olmadigi icin bu kurallar istemcide calisir. Teknik raporun 6.
// bolumu: "sisteme yazan HER yeni istemci su kurallari aynen uygulamalidir".
// Admin ekrani, isci ekrani (ve ileride native uygulama) bu yuzden ayni
// modulu cagirir — mantigi kopyalamak, kopyalarin zamanla birbirinden
// ayrismasi demektir ve tarla verisi bozulur.
//
// Bu modul arayuz bilmez: alert/render yapmaz, ne oldugunu dondurur.
// ============================================================

import { supabase } from './supabase.js'

// Tamamlanan hattin kaydini gercek baslangic/bitis ve sureyle yazar
async function hatKaydiAt(biten, bitis) {
  const baslangic = biten.baslangic || bitis
  const sureDk = Math.max(0, Math.round((new Date(bitis) - new Date(baslangic)) / 60000))

  await supabase
    .from('sulama_kayitlari')
    .insert({
      hat_id: biten.hatId,
      tur_id: biten.turId,
      baslangic_zamani: baslangic,
      bitis_zamani: bitis,
      sure_dakika: sureDk || null,
      durum: 'tamamlandi'
    })
}

async function bolgeHatlariGetir(bolgeId) {
  const { data: zonalar } = await supabase
    .from('zonalar')
    .select('id')
    .eq('bolge_id', bolgeId)

  const { data: hatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no, hat_no')
    .in('zona_id', (zonalar || []).map(z => z.id))
    .order('sira_no')

  return hatlar || []
}

// ── SULAMAYI BASLAT ──
// Donen: { sonuc: 'basladi', turNo } | { sonuc: 'zona_yok' } | { sonuc: 'hat_yok' }
// onayAl: turNo'yu alip boolean donen fonksiyon (arayuz onayi burada sorulur)
export async function sulamaBaslat(bolgeId, onayAl) {
  const { data: bolgeZonalari } = await supabase
    .from('zonalar')
    .select('id')
    .eq('bolge_id', bolgeId)
    .order('sira_no')

  const zonaIdler = (bolgeZonalari || []).map(z => z.id)
  if (zonaIdler.length === 0) return { sonuc: 'zona_yok' }

  const { data: tumHatlar } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no')
    .in('zona_id', zonaIdler)
    .order('sira_no')

  // Bolgenin hat tanimlanmis ILK zonasindan basla
  const ilkZonaId = zonaIdler.find(zid => (tumHatlar || []).some(h => h.zona_id === zid))
  const hatlar = (tumHatlar || []).filter(h => h.zona_id === ilkZonaId)
  if (hatlar.length === 0) return { sonuc: 'hat_yok' }

  const aktifHat = hatlar[0]
  const siradakiHat = hatlar[1] || null

  // Su numarasi bolge bazinda sayilir: son tamamlanan tur + 1
  const { data: sonTur } = await supabase
    .from('turlar')
    .select('tur_no, zonalar!inner(bolge_id)')
    .eq('durum', 'tamamlandi')
    .eq('zonalar.bolge_id', bolgeId)
    .order('tur_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const yeniTurNo = (sonTur?.tur_no || 0) + 1

  if (onayAl && !(await onayAl(yeniTurNo))) return { sonuc: 'iptal' }

  const simdi = new Date().toISOString()
  const { data: tur } = await supabase
    .from('turlar')
    .insert({
      zona_id: aktifHat.zona_id,
      tur_no: yeniTurNo,
      baslangic_zamani: simdi,
      durum: 'devam_ediyor'
    })
    .select()
    .single()

  await supabase
    .from('sistem_durumu')
    .update({
      sistem_acik: true,
      aktif_hat_id: aktifHat.id,
      siradaki_hat_id: siradakiHat?.id || null,
      aktif_tur_id: tur.id,
      aktif_zona_id: aktifHat.zona_id,
      aktif_hat_baslangic: simdi,
      guncelleme_zamani: simdi
    })
    .eq('bolge_id', bolgeId)

  return { sonuc: 'basladi', turNo: yeniTurNo }
}

// ── SISTEMI KAPAT ──
export async function sulamaKapat(bolgeId) {
  await supabase
    .from('sistem_durumu')
    .update({
      sistem_acik: false,
      aktif_hat_id: null,
      siradaki_hat_id: null,
      aktif_hat_baslangic: null,
      guncelleme_zamani: new Date().toISOString()
    })
    .eq('bolge_id', bolgeId)
}

// ── HATTI ILERLET ──
// Donen sonuc:
//   'ilerledi'      → { yeniHatNo }        aynı zonada sonraki hatta gecildi
//   'zona_gecildi'  → { bitenZona, yeniZona }
//   'tur_bitti'     → { turNo }            tum zonalar bitti, sistem kapandi
//   'baskasi_yapti' → gecisi baska bir cihaz ustlendi, bu cihaz bir sey yapmadi
//   'kapali'        → sistem zaten kapali
export async function hatIlerlet(bolgeId, durum) {
  if (!durum?.sistem_acik || !durum.aktif_hat_id) return { sonuc: 'kapali' }

  const biten = {
    hatId: durum.aktif_hat_id,
    turId: durum.aktif_tur_id,
    baslangic: durum.aktif_hat_baslangic
  }

  const tumHatlar = await bolgeHatlariGetir(bolgeId)
  const siradakiHat = tumHatlar.find(h => h.id === durum.siradaki_hat_id)

  // Siradaki hat yoksa zona bitti
  if (!siradakiHat) return zonaTamamla(bolgeId, durum, biten)

  const ayniZonaHatlar = tumHatlar.filter(h => h.zona_id === siradakiHat.zona_id)
  const i = ayniZonaHatlar.findIndex(h => h.id === siradakiHat.id)
  const yeniSiradaki = ayniZonaHatlar[i + 1] || null

  // Gecisi ONCE ustlen: guncelleme yalnizca aktif hat hala bekledigimiz hat
  // ise gecer. Sayac artik ortak kaynaktan okundugu icin acik olan TUM
  // cihazlar sure limitine ayni saniyede ulasir ve hepsi burayi tetikler;
  // koruma olmasa ayni hat icin birden fazla kayit atilirdi.
  const simdi = new Date().toISOString()
  const { data: ustlenildi } = await supabase
    .from('sistem_durumu')
    .update({
      aktif_hat_id: siradakiHat.id,
      siradaki_hat_id: yeniSiradaki?.id || null,
      aktif_hat_baslangic: simdi,
      guncelleme_zamani: simdi
    })
    .eq('bolge_id', bolgeId)
    .eq('aktif_hat_id', biten.hatId)
    .select('bolge_id')

  if (!ustlenildi || ustlenildi.length === 0) return { sonuc: 'baskasi_yapti' }

  await hatKaydiAt(biten, simdi)
  return { sonuc: 'ilerledi', yeniHatNo: siradakiHat.hat_no }
}

// ── ZONA TAMAMLA ──
async function zonaTamamla(bolgeId, durum, biten) {
  // Ayni koruma: aktif hatti bosaltmayi yalnizca bir cihaz ustlenir,
  // boylece tur bir kez kapatilir ve tek kayit atilir.
  const simdi = new Date().toISOString()
  const { data: ustlenildi } = await supabase
    .from('sistem_durumu')
    .update({ aktif_hat_id: null, aktif_hat_baslangic: null, guncelleme_zamani: simdi })
    .eq('bolge_id', bolgeId)
    .eq('aktif_hat_id', biten.hatId)
    .select('bolge_id')

  if (!ustlenildi || ustlenildi.length === 0) return { sonuc: 'baskasi_yapti' }

  await hatKaydiAt(biten, simdi)

  const { data: zonalar } = await supabase
    .from('zonalar')
    .select('*')
    .eq('bolge_id', bolgeId)
    .order('sira_no')

  const aktifZona = zonalar.find(z => z.id === durum.aktif_zona_id)
  const siradakiZona = zonalar.find(z => z.sira_no === aktifZona?.sira_no + 1)

  const { data: bitenTur } = await supabase
    .from('turlar')
    .update({ bitis_zamani: simdi, durum: 'tamamlandi' })
    .eq('id', durum.aktif_tur_id)
    .select()
    .single()

  const turNo = bitenTur?.tur_no || 1

  // Tum zonalar bitti — sistemi kapat
  if (!siradakiZona) {
    await supabase
      .from('sistem_durumu')
      .update({
        sistem_acik: false,
        aktif_hat_id: null,
        siradaki_hat_id: null,
        aktif_tur_id: null,
        aktif_zona_id: null,
        aktif_hat_baslangic: null,
        guncelleme_zamani: new Date().toISOString()
      })
      .eq('bolge_id', bolgeId)

    return { sonuc: 'tur_bitti', turNo }
  }

  // Siradaki zonaya gec — ayni su numarasi devam eder
  const { data: zonaHatlari } = await supabase
    .from('hatlar')
    .select('id, zona_id, sira_no')
    .eq('zona_id', siradakiZona.id)
    .order('sira_no')

  const zonaBaslangic = new Date().toISOString()
  const { data: yeniTur } = await supabase
    .from('turlar')
    .insert({
      zona_id: siradakiZona.id,
      tur_no: turNo,
      baslangic_zamani: zonaBaslangic,
      durum: 'devam_ediyor'
    })
    .select()
    .single()

  await supabase
    .from('sistem_durumu')
    .update({
      sistem_acik: true,
      aktif_hat_id: zonaHatlari[0].id,
      siradaki_hat_id: zonaHatlari[1]?.id || null,
      aktif_tur_id: yeniTur.id,
      aktif_zona_id: siradakiZona.id,
      aktif_hat_baslangic: zonaBaslangic,
      guncelleme_zamani: zonaBaslangic
    })
    .eq('bolge_id', bolgeId)

  return { sonuc: 'zona_gecildi', bitenZona: aktifZona?.ad, yeniZona: siradakiZona.ad }
}
