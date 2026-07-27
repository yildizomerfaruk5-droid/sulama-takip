-- ============================================================
-- HAT-25 KAYDI + GUBRESI (27 Temmuz 2026)
-- Hat-25 bugun 14:00-22:00 calisiyor. Kaydi simdiden yazilir ki
-- gubre verisi girilebilsin; 22:00'de cron gecisi yapar (kayit
-- zaten var oldugu icin tekrar yazmaz, dogrudan Hat-1'e gecer).
--
-- Not: Otomatik gubre tetikleyicisi KURULMADI — 3. Su'da her bolgeye
--      farkli gubre verilecegi icin girisler elle/popup'tan yapilacak.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

do $$
declare
  b uuid; z2 uuid; t2 uuid; h25 uuid; k25 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z2 from zonalar where bolge_id = b order by sira_no offset 1 limit 1;
  select id into t2 from turlar where zona_id = z2 and durum = 'devam_ediyor'
   order by baslangic_zamani desc limit 1;
  select id into h25 from hatlar where zona_id = z2 and hat_no = 25;

  -- Hat-25 sulama kaydi (14:00 -> 22:00)
  select id into k25 from sulama_kayitlari
   where hat_id = h25 and tur_id = t2 and sure_dakika is not null limit 1;

  if k25 is null then
    insert into sulama_kayitlari
      (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
    values
      (h25, t2, '2026-07-27T14:00:00+03:00', '2026-07-27T22:00:00+03:00', 480, 'tamamlandi')
    returning id into k25;
  end if;

  -- Gubre seti (varsa tekrar eklenmez)
  insert into gubre_uygulamalari (kayit_id, gubre_id, miktar, birim, olcek)
  select k25, g.id, x.miktar, x.birim, x.olcek
  from (values
      ('Karboksilik Asit',    4::numeric, 'litre', 'dekar'),
      ('Hayvansal Aminoasit', 2::numeric, 'litre', 'dekar'),
      ('UAN 32',              1::numeric, 'litre', 'dekar'),
      ('33 Nitrat',          50::numeric, 'kg',    'hat')
    ) as x(ad, miktar, birim, olcek)
  join gubreler g on g.ad = x.ad
  where not exists (
    select 1 from gubre_uygulamalari gu
     where gu.kayit_id = k25 and gu.gubre_id = g.id
  );
end $$;

-- KONTROL: 25 sulama, 100 gubre girisi, 1250 kg nitrat beklenir
select
  (select count(*) from sulama_kayitlari where sure_dakika is not null) as sulama,
  (select count(*) from gubre_uygulamalari) as gubre_girisi,
  (select sum(gu.miktar) from gubre_uygulamalari gu
     join gubreler g on g.id = gu.gubre_id where g.ad = '33 Nitrat') as nitrat_kg;
