-- ============================================================
-- KURULUM SIHIRBAZI — ASAMA 2 KAPANISI (spec 6.7)
-- kayseri-ana artik cizimini tamamen veritabanindan aliyor.
--
-- BU DOSYAYI EN SON CALISTIRIN:
--   1) supabase_migration_kurulum_tablolari.sql
--   2) supabase_seed_kayseri_kurulum.sql
--   3) yeni kod deploy edildi ve harita gorunumu sahada dogrulandi
--   4) ISTE O ZAMAN bu dosya
--
-- kurulum_tamam bayragi kurulum sihirbazinin "kurulum bitti" isaretidir;
-- sulama akisini, hat gecislerini veya mevcut gorunumu ETKILEMEZ.
-- Idempotent: birden fazla kez calistirilabilir.
-- ============================================================

update bolgeler
set kurulum_tamam = true
where kod = 'kayseri-ana';

-- KONTROL
select kod, ad, kurulum_tamam,
       fiskiye_araligi_m, fiskiye_kapsama_m, fiskiye_alan_m2, varsayilan_sure_dk
from bolgeler
order by sira_no;
-- Beklenen: kayseri-ana -> kurulum_tamam = true, 10 / 7 / 120 / 480
