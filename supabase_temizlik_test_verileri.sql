-- ============================================================
-- TEST VERILERINI TEMIZLEME (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
--
-- Silinenler (hepsi deneme/gosterimlikti):
--   - Tum sulama kayitlari
--   - Tum turlar (1. Su, 2. Su... denemeleri)
--   - Eski 19 hat tanimi (yeni hatlar vana gruplarindan olusturulacak)
-- Korunanlar:
--   - bolgeler, zonalar, vanalar (43 kayit), profiller, giris_gecmisi
-- ============================================================

-- 1. Sistem durumunu sifirla (hat/tur referanslarini birak)
update sistem_durumu set
  sistem_acik = false,
  aktif_hat_id = null,
  siradaki_hat_id = null,
  aktif_tur_id = null,
  aktif_zona_id = null,
  guncelleme_zamani = now();

-- 2. Test sulama kayitlarini sil
delete from sulama_kayitlari;

-- 3. Test turlarini sil
delete from turlar;

-- 4. Vanalardaki hat atamalarini bosalt (garanti icin; zaten bos)
update vanalar set hat_id = null;

-- 5. Eski hat tanimlarini sil
delete from hatlar;

-- Kontrol: hatlar=0, turlar=0, sulama_kayitlari=0, vanalar=43 beklenir
select
  (select count(*) from hatlar) as hatlar,
  (select count(*) from turlar) as turlar,
  (select count(*) from sulama_kayitlari) as kayitlar,
  (select count(*) from vanalar) as vanalar;
