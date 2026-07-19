-- ============================================================
-- HAT-1 GERCEK GECIS DUZELTMESI (19 Temmuz 2026)
-- Sahada: Hat-1, 18 Temmuz 17:00 -> 19 Temmuz 02:00 calisti (9 saat)
--         Hat-2, 02:00'de baslatildi
-- (Sistem yazilim hatasi nedeniyle otomatik gecisi yapamamisti)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z1 uuid; t2 uuid; h1 uuid; h2 uuid; h3 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  select id into t2 from turlar  where zona_id = z1 and durum = 'devam_ediyor' limit 1;
  select id into h1 from hatlar  where zona_id = z1 and hat_no = 1;
  select id into h2 from hatlar  where zona_id = z1 and hat_no = 2;
  select id into h3 from hatlar  where zona_id = z1 and hat_no = 3;

  -- 1) Hat-1'in gercek tamamlanma kaydi (9 saat)
  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  select h1, t2, '2026-07-18T17:00:00+03:00', '2026-07-19T02:00:00+03:00', 540, 'tamamlandi'
  where not exists (
    select 1 from sulama_kayitlari
    where hat_id = h1 and tur_id = t2 and durum = 'tamamlandi' and islem_turu is null
  );

  -- 2) Sistem durumu: Hat-2 aktif (02:00'den beri), Hat-3 sirada
  update sistem_durumu set
    aktif_hat_id = h2,
    siradaki_hat_id = h3,
    hat_baslama_zamani = '2026-07-19T02:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;

  -- 3) Olay kaydi
  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'hat_gecisi',
    'Düzeltme: Hat-1 sahada 19 Temmuz 02:00''de tamamlandı (9 saat çalıştı), Hat-2 başladı');
end $$;

-- KONTROL
select h.hat_no, k.baslangic_zamani at time zone 'Europe/Istanbul' as baslangic,
       k.bitis_zamani at time zone 'Europe/Istanbul' as bitis, k.sure_dakika
from sulama_kayitlari k join hatlar h on h.id = k.hat_id
where k.islem_turu is null
order by k.baslangic_zamani;
