-- ============================================================
-- 1. SU GECMISI DUZELTMESI (18 Temmuz 2026)
-- Gercek durum:
--   1. Su : 3 Temmuz 20:00 -> 17 Temmuz 08:00 (sistemsiz, sahada)
--            hat basina 12 saat verildi; elektrik kesintileri
--            nedeniyle ~1 gun uzadi
--   2. Su : 18 Temmuz 17:00'de sistemle baslatildi (su an devam ediyor)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare b uuid; z1 uuid;
begin
  select id into b from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;

  -- 1) Su an devam eden turu 2. Su yap
  update turlar set tur_no = 2
  where zona_id = z1 and durum = 'devam_ediyor';

  -- 2) Gecmis 1. Su kaydini ekle (tekrar calistirilirsa cift olusturmaz)
  insert into turlar (zona_id, tur_no, baslangic_zamani, bitis_zamani, durum)
  select z1, 1, '2026-07-03T20:00:00+03:00', '2026-07-17T08:00:00+03:00', 'tamamlandi'
  where not exists (
    select 1 from turlar where zona_id = z1 and tur_no = 1 and durum = 'tamamlandi'
  );

  -- 3) Olay kaydina dus (kalici not)
  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'tur_tamamlandi',
    '1. Su (sistemsiz): 3 Temmuz 20:00 - 17 Temmuz 08:00. Hat basina 12 saat verildi; elektrik kesintileri nedeniyle planlanandan ~1 gun uzun surdu.');
end $$;

-- KONTROL: 1. Su tamamlandi + 2. Su devam ediyor gorunmeli
select tur_no,
       baslangic_zamani at time zone 'Europe/Istanbul' as baslangic,
       bitis_zamani at time zone 'Europe/Istanbul' as bitis,
       durum
from turlar order by tur_no;
