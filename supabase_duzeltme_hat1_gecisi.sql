-- ============================================================
-- GERCEK SAHA AKISI DUZELTMESI (19 Temmuz 2026)
-- Sahada yapilanlar (sistem yazilim hatasi nedeniyle isleyememisti):
--   Hat-1 : 18 Tem 17:00 -> 19 Tem 02:00  (9 saat — bilincli +1 saat)
--   Hat-2 : 19 Tem 02:00 -> 19 Tem 10:00  (8 saat)
--   Hat-3 : 19 Tem 10:00'dan beri CALISIYOR
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z1 uuid; t2 uuid; h1 uuid; h2 uuid; h3 uuid; h4 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  select id into t2 from turlar  where zona_id = z1 and durum = 'devam_ediyor' limit 1;
  select id into h1 from hatlar  where zona_id = z1 and hat_no = 1;
  select id into h2 from hatlar  where zona_id = z1 and hat_no = 2;
  select id into h3 from hatlar  where zona_id = z1 and hat_no = 3;
  select id into h4 from hatlar  where zona_id = z1 and hat_no = 4;

  -- 1) Hat-1 kaydi: 17:00 -> 02:00 (540 dk)
  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  select h1, t2, '2026-07-18T17:00:00+03:00', '2026-07-19T02:00:00+03:00', 540, 'tamamlandi'
  where not exists (
    select 1 from sulama_kayitlari
    where hat_id = h1 and tur_id = t2 and durum = 'tamamlandi' and islem_turu is null
  );

  -- 2) Hat-2 kaydi: 02:00 -> 10:00 (480 dk)
  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  select h2, t2, '2026-07-19T02:00:00+03:00', '2026-07-19T10:00:00+03:00', 480, 'tamamlandi'
  where not exists (
    select 1 from sulama_kayitlari
    where hat_id = h2 and tur_id = t2 and durum = 'tamamlandi' and islem_turu is null
  );

  -- 3) Sistem durumu: Hat-3 aktif (10:00'dan beri), Hat-4 sirada
  update sistem_durumu set
    aktif_hat_id = h3,
    siradaki_hat_id = h4,
    hat_baslama_zamani = '2026-07-19T10:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;

  -- 4) Olay kaydi
  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'hat_gecisi',
    'Düzeltme: Hat-1 (17:00-02:00, bilinçli +1 saat) ve Hat-2 (02:00-10:00) tamamlandı; Hat-3 10:00''da başladı');
end $$;

-- KONTROL: iki tamamlanmis kayit gorulmeli
select h.hat_no,
       k.baslangic_zamani at time zone 'Europe/Istanbul' as baslangic,
       k.bitis_zamani at time zone 'Europe/Istanbul' as bitis,
       k.sure_dakika
from sulama_kayitlari k join hatlar h on h.id = k.hat_id
where k.islem_turu is null
order by k.baslangic_zamani;
