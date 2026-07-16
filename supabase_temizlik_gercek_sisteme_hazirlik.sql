-- ============================================================
-- GERCEK SISTEME HAZIRLIK — TUM TEST KAYITLARINI TEMIZLE
-- (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
--
-- SILINENLER:
--   - Tum sulama kayitlari + bagli gubre uygulamalari
--   - Tum turlar (deneme sulari)
--   - Varsa hat tanimlari (yeniden tanimlanacak)
--   - Giris gecmisi (deneme girisleri)
-- KORUNANLAR (kalici saha verileri):
--   - bolgeler (Kayseri - Ana Saha)
--   - zonalar (2 zona)
--   - vanalar (43 kayit, 1000 fiskiye)
--   - gubreler (6 gubre tanimi)
--   - profiller (kullanici rolleri)
-- ============================================================

-- 1. Sistem durumunu sifirla
update sistem_durumu set
  sistem_acik = false,
  aktif_hat_id = null,
  siradaki_hat_id = null,
  aktif_tur_id = null,
  aktif_zona_id = null,
  guncelleme_zamani = now();

-- 2. Gubre uygulamalari (kayitlarla cascade silinir ama garanti olsun)
delete from gubre_uygulamalari;

-- 3. Sulama kayitlari
delete from sulama_kayitlari;

-- 4. Turlar
delete from turlar;

-- 5. Vana hat atamalarini bosalt + hat tanimlarini sil
update vanalar set hat_id = null;
delete from hatlar;

-- 6. Giris gecmisi
delete from giris_gecmisi;

-- KONTROL: ilk 4 kolon 0, digerleri dolu beklenir
select
  (select count(*) from sulama_kayitlari)   as kayitlar,
  (select count(*) from turlar)             as turlar,
  (select count(*) from hatlar)             as hatlar,
  (select count(*) from giris_gecmisi)      as girisler,
  (select count(*) from vanalar)            as vanalar,
  (select count(*) from gubreler)           as gubreler,
  (select count(*) from bolgeler)           as bolgeler,
  (select count(*) from zonalar)            as zonalar;
