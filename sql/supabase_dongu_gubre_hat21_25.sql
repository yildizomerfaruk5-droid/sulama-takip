-- ============================================================
-- 3. SU HAZIRLIGI — 27 Temmuz 2026
--  1) DONGUSEL AKIS: son hat bitince basa doner, yeni tur (3. Su)
--     otomatik baslar. Sistem artik kendini kapatmaz.
--  2) GUBRE STANDARDIZASYONU: her sulama kaydina ayni gubre seti.
--  3) HAT 21-25 kayitlari + Hat-25 aktif (bugun 14:00-22:00).
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- ============================================================
-- 1) DONGUSEL OTOMATIK HAT GECISI (cron fonksiyonu guncellemesi)
--    Sira: zona.sira_no, hat.sira_no. Son hattan sonra ILK hatta
--    doner ve tur numarasi 1 artar (3. Su, 4. Su...).
-- ============================================================
create or replace function public.hat_gecis_kontrol()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  aktif_hat record;
  sonraki record;
  sonraki2 uuid;
  gecen_dk int;
  eski_tur_no int;
  yeni_tur uuid;
  basa_dondu boolean;
begin
  for s in
    select * from sistem_durumu
    where sistem_acik = true
      and aktif_hat_id is not null
      and hat_baslama_zamani is not null
  loop
    select h.*, z.sira_no as zona_sira into aktif_hat
      from hatlar h join zonalar z on z.id = h.zona_id
     where h.id = s.aktif_hat_id;

    if aktif_hat.id is null or aktif_hat.varsayilan_sure_dk is null then
      continue;
    end if;

    -- Sure dolmadiysa dokunma (+1 dk tolerans)
    if now() < s.hat_baslama_zamani
              + make_interval(mins => aktif_hat.varsayilan_sure_dk + 1) then
      continue;
    end if;

    gecen_dk := round(extract(epoch from (now() - s.hat_baslama_zamani)) / 60);

    -- Tamamlama kaydi (cift kayit korumali)
    insert into sulama_kayitlari
      (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
    values
      (s.aktif_hat_id, s.aktif_tur_id, s.hat_baslama_zamani, now(), gecen_dk, 'tamamlandi')
    on conflict (hat_id, tur_id) where sure_dakika is not null do nothing;

    -- SONRAKI HAT (dongusel)
    select h.*, z.sira_no as zona_sira into sonraki
      from hatlar h join zonalar z on z.id = h.zona_id
     where z.bolge_id = s.bolge_id
       and (z.sira_no, h.sira_no) > (aktif_hat.zona_sira, aktif_hat.sira_no)
     order by z.sira_no, h.sira_no limit 1;

    basa_dondu := false;
    if sonraki.id is null then
      select h.*, z.sira_no as zona_sira into sonraki
        from hatlar h join zonalar z on z.id = h.zona_id
       where z.bolge_id = s.bolge_id
       order by z.sira_no, h.sira_no limit 1;
      basa_dondu := true;
    end if;

    if sonraki.id is null then continue; end if;

    -- ONDAN SONRAKI (arayuzde "siradaki" olarak gorunur; dongusel)
    select h.id into sonraki2
      from hatlar h join zonalar z on z.id = h.zona_id
     where z.bolge_id = s.bolge_id
       and (z.sira_no, h.sira_no) > (sonraki.zona_sira, sonraki.sira_no)
     order by z.sira_no, h.sira_no limit 1;
    if sonraki2 is null then
      select h.id into sonraki2
        from hatlar h join zonalar z on z.id = h.zona_id
       where z.bolge_id = s.bolge_id
       order by z.sira_no, h.sira_no limit 1;
    end if;

    select tur_no into eski_tur_no from turlar where id = s.aktif_tur_id;

    -- TUR YONETIMI: zona degistiyse yeni tur kaydi; basa donduyse tur_no + 1
    if basa_dondu or sonraki.zona_id <> aktif_hat.zona_id then
      update turlar set bitis_zamani = now(), durum = 'tamamlandi'
       where id = s.aktif_tur_id;

      insert into turlar (zona_id, tur_no, baslangic_zamani, durum)
      values (sonraki.zona_id,
              case when basa_dondu then eski_tur_no + 1 else eski_tur_no end,
              now(), 'devam_ediyor')
      returning id into yeni_tur;
    else
      yeni_tur := s.aktif_tur_id;
    end if;

    update sistem_durumu set
      aktif_hat_id = sonraki.id,
      siradaki_hat_id = sonraki2,
      aktif_tur_id = yeni_tur,
      aktif_zona_id = sonraki.zona_id,
      hat_baslama_zamani = now(),
      guncelleme_zamani = now()
    where bolge_id = s.bolge_id;

    insert into olay_loglari (bolge_id, olay, detay)
    values (s.bolge_id,
      case when basa_dondu then 'tur_tamamlandi' else 'hat_gecisi' end,
      format('Hat-%s tamamlandı (%s sa %s dk), Hat-%s başladı%s — sunucu otomatik',
             aktif_hat.hat_no, gecen_dk / 60, gecen_dk % 60, sonraki.hat_no,
             case when basa_dondu
                  then format(' — %s. Su başladı', eski_tur_no + 1)
                  else '' end));
  end loop;
end;
$$;

-- ============================================================
-- 2) GUBRE STANDARDIZASYONU
--    Her sulama (tamamlama) kaydina ayni set:
--      4 lt/dekar Karboksilik Asit
--      2 lt/dekar Hayvansal Aminoasit
--      1 lt/dekar UAN 32
--      50 kg/hat  33 Nitrat (amonyum nitrat)
-- ============================================================
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

-- ============================================================
-- 3) HAT 21-25 KAYITLARI + HAT-25 AKTIF
-- ============================================================
do $$
declare
  b uuid; z1 uuid; z2 uuid; t2 uuid; ilk_hat uuid;
  h21 uuid; h22 uuid; h23 uuid; h24 uuid; h25 uuid;
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b order by sira_no limit 1;
  select id into z2 from zonalar where bolge_id = b order by sira_no offset 1 limit 1;

  select id into h21 from hatlar where zona_id = z2 and hat_no = 21;
  select id into h22 from hatlar where zona_id = z2 and hat_no = 22;
  select id into h23 from hatlar where zona_id = z2 and hat_no = 23;
  select id into h24 from hatlar where zona_id = z2 and hat_no = 24;
  select id into h25 from hatlar where zona_id = z2 and hat_no = 25;

  select id into t2 from turlar where zona_id = z2 and durum = 'devam_ediyor'
   order by baslangic_zamani desc limit 1;
  if t2 is null then
    raise exception 'Zona 2 turu bulunamadi — once supabase_hatlar_21_25_zona2.sql calistirin';
  end if;

  -- Kayitlar: Hat-21..24 (Hat-25 su an calisiyor, kaydi 22:00''de olusacak)
  delete from sulama_kayitlari
   where tur_id = t2 and sure_dakika is not null
     and hat_id in (h21, h22, h23, h24, h25);

  insert into sulama_kayitlari (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
  values
    (h21, t2, '2026-07-25T14:00:00+03:00', '2026-07-25T22:00:00+03:00', 480, 'tamamlandi'),
    (h22, t2, '2026-07-25T22:00:00+03:00', '2026-07-26T06:00:00+03:00', 480, 'tamamlandi'),
    (h23, t2, '2026-07-26T06:00:00+03:00', '2026-07-26T14:00:00+03:00', 480, 'tamamlandi'),
    (h24, t2, '2026-07-26T14:00:00+03:00', '2026-07-26T22:00:00+03:00', 480, 'tamamlandi');

  -- Bu dort kayda da standart gubre setini ekle
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
  where k.hat_id in (h21, h22, h23, h24) and k.tur_id = t2 and k.sure_dakika is not null;

  -- Hat-25 aktif: bugun 14:00 -> 22:00. Siradaki: Hat-1 (dongu basi)
  select h.id into ilk_hat
    from hatlar h join zonalar z on z.id = h.zona_id
   where z.bolge_id = b order by z.sira_no, h.sira_no limit 1;

  update hatlar set varsayilan_sure_dk = 480 where id = h25;

  update sistem_durumu set
    sistem_acik = true,
    aktif_hat_id = h25,
    siradaki_hat_id = ilk_hat,
    aktif_tur_id = t2,
    aktif_zona_id = z2,
    hat_baslama_zamani = '2026-07-27T14:00:00+03:00',
    guncelleme_zamani = now()
  where bolge_id = b;

  insert into olay_loglari (bolge_id, olay, detay)
  values (b, 'hat_gecisi',
    'Hat-21..24 kayitlari islendi; Hat-25 bugun 14:00-22:00 aktif (2. Su son hatti). Gubreleme standartlastirildi. 22:00''de dongu Hat-1''e donup 3. Su baslayacak.');
end $$;

-- KONTROL 1: sistem — aktif Hat-25, siradaki Hat-1 beklenir
select
  (select h.hat_no from hatlar h join sistem_durumu s on s.aktif_hat_id = h.id) as aktif,
  (select h.hat_no from hatlar h join sistem_durumu s on s.siradaki_hat_id = h.id) as siradaki,
  (select hat_baslama_zamani at time zone 'Europe/Istanbul' from sistem_durumu limit 1) as baslama;

-- KONTROL 2: gubre — her sulama kaydinda 4 satir olmali
select count(*) as gubre_girisi,
       (select count(*) from sulama_kayitlari where sure_dakika is not null) * 4 as beklenen
from gubre_uygulamalari;

-- KONTROL 3: 2. Su hat dokumu
select h.hat_no,
       k.baslangic_zamani at time zone 'Europe/Istanbul' as baslangic,
       k.bitis_zamani at time zone 'Europe/Istanbul' as bitis
from sulama_kayitlari k join hatlar h on h.id = k.hat_id
where k.sure_dakika is not null
order by k.baslangic_zamani;
