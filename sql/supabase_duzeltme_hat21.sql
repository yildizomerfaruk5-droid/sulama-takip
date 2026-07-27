-- ============================================================
-- HAT-21 SURE DUZELTMESI + GUBRE YENIDEN YAZIMI (27 Temmuz 2026)
-- Sorun: cron, Hat-21'i gec kapattigi icin kayit ~60 saat cikmisti.
-- Cozum: Hat-22'nin baslangicindan geriye 8 saat sayilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z2 uuid; t2 uuid;
  h21 uuid; h22 uuid; h23 uuid; h24 uuid; h25 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z2 from zonalar where bolge_id = b order by sira_no offset 1 limit 1;
  select id into t2 from turlar where zona_id = z2 and durum = 'devam_ediyor'
   order by baslangic_zamani desc limit 1;

  select id into h21 from hatlar where zona_id = z2 and hat_no = 21;
  select id into h22 from hatlar where zona_id = z2 and hat_no = 22;
  select id into h23 from hatlar where zona_id = z2 and hat_no = 23;
  select id into h24 from hatlar where zona_id = z2 and hat_no = 24;
  select id into h25 from hatlar where zona_id = z2 and hat_no = 25;

  -- 1) Zona 2 kayitlarini kesin tarihlerle yeniden yaz
  delete from sulama_kayitlari
   where sure_dakika is not null and hat_id in (h21, h22, h23, h24, h25);

  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  values
    (h21, t2, '2026-07-25T14:00:00+03:00', '2026-07-25T22:00:00+03:00', 480, 'tamamlandi'),
    (h22, t2, '2026-07-25T22:00:00+03:00', '2026-07-26T06:00:00+03:00', 480, 'tamamlandi'),
    (h23, t2, '2026-07-26T06:00:00+03:00', '2026-07-26T14:00:00+03:00', 480, 'tamamlandi'),
    (h24, t2, '2026-07-26T14:00:00+03:00', '2026-07-26T22:00:00+03:00', 480, 'tamamlandi');

  -- 2) Hat-25 aktif kalsin (bugun 14:00 -> 22:00), siradaki Hat-1
  update sistem_durumu set
    sistem_acik = true,
    aktif_hat_id = h25,
    siradaki_hat_id = (select h.id from hatlar h join zonalar z on z.id = h.zona_id
                        where z.bolge_id = b order by z.sira_no, h.sira_no limit 1),
    aktif_tur_id = t2,
    aktif_zona_id = z2,
    hat_baslama_zamani = '2026-07-27T14:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;
end $$;

-- 3) GUBRELERI YENIDEN YAZ (tum tamamlanan sulamalara ayni set)
--    4 lt/dekar Karboksilik Asit · 2 lt/dekar Hayvansal Aminoasit
--    1 lt/dekar UAN 32 · 50 kg/HAT 33 Nitrat
delete from gubre_uygulamalari;

insert into gubre_uygulamalari (kayit_id, gubre_id, miktar, birim, olcek)
select k.id, g.id, x.miktar, x.birim, x.olcek
from sulama_kayitlari k
cross join (values
    ('Karboksilik Asit',    4::numeric, 'litre', 'dekar'),
    ('Hayvansal Aminoasit', 2::numeric, 'litre', 'dekar'),
    ('UAN 32',              1::numeric, 'litre', 'dekar'),
    ('33 Nitrat',          50::numeric, 'kg',    'hat')
  ) as x(ad, miktar, birim, olcek)
join gubreler g on g.ad = x.ad
where k.sure_dakika is not null;

-- KONTROL 1: tum sulamalar 480 dk olmali
select h.hat_no, k.sure_dakika,
       k.baslangic_zamani at time zone 'Europe/Istanbul' as baslangic,
       k.bitis_zamani at time zone 'Europe/Istanbul' as bitis
from sulama_kayitlari k join hatlar h on h.id = k.hat_id
where k.sure_dakika is not null
order by k.baslangic_zamani;

-- KONTROL 2: 8 saatten farkli kayit var mi? (bos donmeli)
select h.hat_no, k.sure_dakika
from sulama_kayitlari k join hatlar h on h.id = k.hat_id
where k.sure_dakika is not null and k.sure_dakika <> 480;
