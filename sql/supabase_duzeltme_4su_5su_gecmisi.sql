-- ============================================================
-- 4. SU ve 5. SU GECMISI DUZELTMESI (19 Agustos 2026)
--
-- GERCEK DURUM (sahadan teyitli):
--   4. Su : 05.08 06:32 -> 13.08 14:32   hat basina 8 saat, arka arkaya
--   BOSLUK: 13.08 14:32 -> 14.08 00:00   9 sa 28 dk — SULAMA YAPILMADI
--   5. Su : 14.08 00:00 -> 20.08 06:00   hat basina 6 saat, arka arkaya
--           Hat-23 su an calisiyor: 19.08 12:00 -> 18:00
--   6. Su : 20.08 06:00'da Hat-1'den baslayacak
--
-- SIRA: Zona 1 (Hat-1..20, sira 1..20) sonra Zona 2 (Hat-21..25,
--       sira 1..5). sira_no ZONA BAZINDADIR, global 1..25 degildir.
--
-- Supabase Dashboard > SQL Editor'da calistirin.
-- Bu betik IDEMPOTENT'tir (tekrar calistirilabilir).
--
-- ============================================================
-- ⚠️ PLANDAN SAPMA — GUBRE VERISINI KORUMAK ICIN
--
-- Istenen: "41 tamamlama kaydini ve 3 turlar satirini (134f777c,
--           f92aa048, d0a739c2) sil".
--
-- Bulgu   : tur-4'te 62 kayit var — 41 tamamlama + 21 VERI GIRISI.
--           100 gubre satirinin TAMAMI veri girisi satirlarina bagli
--           (41 tamamlama kaydina bagli gubre: SIFIR).
--           21 veri girisi satirinin hepsi tur_id = 134f777c.
--
-- Sonuc   : 134f777c SILINEMEZ — silinirse 21 kayit ve onlara bagli
--           100 gubre satiri ya FK hatasi verir ya da cascade ile yok
--           olur. Bunun yerine 134f777c ve d0a739c2 YERINDE ONARILIR
--           (baslangic/bitis/durum duzeltilir); yalnizca gercekten
--           mukerrer olan f92aa048 silinir.
--           Boylece gubre satirlarina HIC DOKUNULMAZ, yeniden
--           baglama gerekmez.
-- ============================================================

-- Tek seferlik sure alani gerekli (feature/hat-manuel-gecis)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sistem_durumu'
      and column_name = 'aktif_hat_sure_dk'
  ) then
    raise exception
      'sistem_durumu.aktif_hat_sure_dk yok. Once sql/supabase_migration_hat_manuel_gecis.sql calistirilmali.';
  end if;
end $$;

do $$
declare
  b     uuid;   -- bolge
  z1    uuid;   -- Zona 1 - Ana Blok
  z2    uuid;   -- Zona 2 - Dogu Blok
  t4z1  uuid;   -- 4. Su, Zona 1 dilimi  (onarilan 134f777c)
  t4z2  uuid;   -- 4. Su, Zona 2 dilimi  (onarilan d0a739c2)
  t5z1  uuid;   -- 5. Su, Zona 1 dilimi  (yeni)
  t5z2  uuid;   -- 5. Su, Zona 2 dilimi  (yeni)
  h23   uuid;   -- su an calisan hat
  h24   uuid;   -- siradaki
  silinen int;

  -- Program capalari
  tur4_bas constant timestamptz := '2026-08-05T06:32:00+03:00';
  tur5_bas constant timestamptz := '2026-08-14T00:00:00+03:00';
begin
  select id into b  from bolgeler where kod = 'kayseri-ana';
  select id into z1 from zonalar where bolge_id = b and sira_no = 1;
  select id into z2 from zonalar where bolge_id = b and sira_no = 2;

  if b is null or z1 is null or z2 is null then
    raise exception 'Bolge/zona bulunamadi (bolge=%, z1=%, z2=%)', b, z1, z2;
  end if;

  select id into h23 from hatlar where zona_id = z2 and hat_no = 23;
  select id into h24 from hatlar where zona_id = z2 and hat_no = 24;

  -- ------------------------------------------------------------
  -- 1) Korunacak 4. Su tur satirlarini SEC (silmeden once)
  --    Her zonanin EN ERKEN tur-4 satiri korunur ve yerinde
  --    onarilir; digerleri (mukerrer gecisler) silinir.
  -- ------------------------------------------------------------
  select id into t4z1 from turlar
   where tur_no = 4 and zona_id = z1 order by baslangic_zamani limit 1;
  select id into t4z2 from turlar
   where tur_no = 4 and zona_id = z2 order by baslangic_zamani limit 1;

  -- ------------------------------------------------------------
  -- 2) YALNIZCA HATALI 4. Su tamamlama kayitlarini sil
  --
  --    IDEMPOTENCY: dogru olan kayitlar (dogru tur, 480 dk, dogru
  --    baslangic) BIRAKILIR. Betik ikinci kez calistirilirsa hicbir
  --    dogru satir silinip yeniden yazilmaz — id'ler sabit kalir.
  --    Bu onemli: ileride bu kayitlara foto/gubre baglanirsa
  --    yeniden calistirma onlari cascade ile silmemeli.
  --
  --    Veri girisi satirlarina (sure_dakika BOS) DOKUNULMAZ.
  -- ------------------------------------------------------------
  delete from sulama_kayitlari k
  using turlar t, hatlar h, zonalar zz
  where k.tur_id = t.id
    and h.id = k.hat_id
    and zz.id = h.zona_id
    and t.tur_no = 4
    and t.zona_id in (z1, z2)
    and k.sure_dakika is not null
    and not (
      k.tur_id = (case when zz.sira_no = 1 then t4z1 else t4z2 end)
      and k.sure_dakika = 480
      and k.baslangic_zamani = tur4_bas +
          (((case when zz.sira_no = 1 then h.sira_no else 20 + h.sira_no end) - 1)
           * interval '8 hours')
    );
  get diagnostics silinen = row_count;
  raise notice 'Silinen hatali 4. Su tamamlama kaydi: %', silinen;

  -- ------------------------------------------------------------
  -- 3) Bosalan mukerrer tur-4 satirlarini sil
  --    (korunanlar haric ve hicbir kaydi kalmayanlar)
  -- ------------------------------------------------------------
  delete from turlar t
  where t.tur_no = 4 and t.zona_id in (z1, z2)
    and t.id is distinct from t4z1
    and t.id is distinct from t4z2
    and not exists (select 1 from sulama_kayitlari k where k.tur_id = t.id);

  -- ------------------------------------------------------------
  -- 4) Korunan 4. Su turlarini YERINDE onar
  --    Zona 1: 05.08 06:32 -> 11.08 22:32  (20 hat x 8 sa)
  --    Zona 2: 11.08 22:32 -> 13.08 14:32  ( 5 hat x 8 sa)
  -- ------------------------------------------------------------

  if t4z1 is null then
    insert into turlar (zona_id, tur_no, baslangic_zamani, bitis_zamani, durum)
    values (z1, 4, tur4_bas, tur4_bas + interval '160 hours', 'tamamlandi')
    returning id into t4z1;
  else
    update turlar set
      baslangic_zamani = tur4_bas,
      bitis_zamani     = tur4_bas + interval '160 hours',
      durum            = 'tamamlandi'
    where id = t4z1;
  end if;

  if t4z2 is null then
    insert into turlar (zona_id, tur_no, baslangic_zamani, bitis_zamani, durum)
    values (z2, 4, tur4_bas + interval '160 hours',
                   tur4_bas + interval '200 hours', 'tamamlandi')
    returning id into t4z2;
  else
    update turlar set
      baslangic_zamani = tur4_bas + interval '160 hours',
      bitis_zamani     = tur4_bas + interval '200 hours',
      durum            = 'tamamlandi'
    where id = t4z2;
  end if;

  -- ------------------------------------------------------------
  -- 5) 5. Su turlarini olustur
  --    Zona 1: 14.08 00:00 -> 19.08 00:00  tamamlandi
  --    Zona 2: 19.08 00:00 -> (devam)      devam_ediyor
  -- ------------------------------------------------------------
  select id into t5z1 from turlar where tur_no = 5 and zona_id = z1;
  if t5z1 is null then
    insert into turlar (zona_id, tur_no, baslangic_zamani, bitis_zamani, durum)
    values (z1, 5, tur5_bas, tur5_bas + interval '120 hours', 'tamamlandi')
    returning id into t5z1;
  else
    update turlar set baslangic_zamani = tur5_bas,
                      bitis_zamani = tur5_bas + interval '120 hours',
                      durum = 'tamamlandi'
    where id = t5z1;
  end if;

  select id into t5z2 from turlar where tur_no = 5 and zona_id = z2;
  if t5z2 is null then
    insert into turlar (zona_id, tur_no, baslangic_zamani, bitis_zamani, durum)
    values (z2, 5, tur5_bas + interval '120 hours', null, 'devam_ediyor')
    returning id into t5z2;
  else
    update turlar set baslangic_zamani = tur5_bas + interval '120 hours',
                      bitis_zamani = null,
                      durum = 'devam_ediyor'
    where id = t5z2;
  end if;

  -- ------------------------------------------------------------
  -- 6) 4. Su: 25 hat tamamlama kaydi (her biri 480 dk)
  --    Pozisyon = Zona 1 icin sira_no, Zona 2 icin 20 + sira_no
  -- ------------------------------------------------------------
  insert into sulama_kayitlari
    (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum, islem_turu)
  select
    h.id,
    case when h.zona_id = z1 then t4z1 else t4z2 end,
    tur4_bas + ((p.poz - 1) * interval '8 hours'),
    tur4_bas + (p.poz       * interval '8 hours'),
    480, 'tamamlandi', 'sulama'
  from hatlar h
  join lateral (
    select case when h.zona_id = z1 then h.sira_no else 20 + h.sira_no end as poz
  ) p on true
  where h.zona_id in (z1, z2)
    and not exists (
      select 1 from sulama_kayitlari k
      where k.hat_id = h.id
        and k.tur_id = case when h.zona_id = z1 then t4z1 else t4z2 end
        and k.sure_dakika is not null
    );

  -- ------------------------------------------------------------
  -- 7) 5. Su: tamamlanan 22 hat (her biri 360 dk)
  --    Hat-23 calisiyor, Hat-24/25 henuz sulanmadi -> kayit YOK
  -- ------------------------------------------------------------
  insert into sulama_kayitlari
    (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum, islem_turu)
  select
    h.id,
    case when h.zona_id = z1 then t5z1 else t5z2 end,
    tur5_bas + ((p.poz - 1) * interval '6 hours'),
    tur5_bas + (p.poz       * interval '6 hours'),
    360, 'tamamlandi', 'sulama'
  from hatlar h
  join lateral (
    select case when h.zona_id = z1 then h.sira_no else 20 + h.sira_no end as poz
  ) p on true
  where h.zona_id in (z1, z2)
    and p.poz <= 22                       -- yalnizca tamamlananlar
    and not exists (
      select 1 from sulama_kayitlari k
      where k.hat_id = h.id
        and k.tur_id = case when h.zona_id = z1 then t5z1 else t5z2 end
        and k.sure_dakika is not null
    );

  -- ------------------------------------------------------------
  -- 8) sistem_durumu: gercek anlik durum
  --    Hat-23, 19.08 12:00'de basladi, bu calisma icin 360 dk.
  --    varsayilan_sure_dk'ya DOKUNULMAZ (tek seferlik gecersiz kilma).
  -- ------------------------------------------------------------
  update sistem_durumu set
    sistem_acik        = true,
    aktif_hat_id       = h23,
    siradaki_hat_id    = h24,
    aktif_tur_id       = t5z2,
    aktif_zona_id      = z2,
    hat_baslama_zamani = '2026-08-19T12:00:00+03:00',
    aktif_hat_sure_dk  = 360,
    guncelleme_zamani  = now()
  where bolge_id = b;

  -- ------------------------------------------------------------
  -- 9) Olay kaydi (kalici not)
  -- ------------------------------------------------------------
  insert into olay_loglari (bolge_id, olay, detay)
  select b, 'kurulum',
    '4. ve 5. Su gecmisi elle duzeltildi (19.08.2026). ' ||
    '4. Su: 05.08 06:32 - 13.08 14:32, hat basina 8 sa, 25 hat. ' ||
    'ARA: 13.08 14:32 - 14.08 00:00 (9 sa 28 dk) sulama YAPILMADI — gercek duraklama. ' ||
    '5. Su: 14.08 00:00 basladi, hat basina 6 sa; 22 hat tamamlandi, ' ||
    'Hat-23 19.08 12:00-18:00 calisiyor, 20.08 06:00''da 6. Su baslayacak. ' ||
    'Hatali 4. Su tamamlama kayitlari silinip yeniden yazildi; ' ||
    'gubre uygulamalarina DOKUNULMADI (veri girisi satirlarina bagli, korundu).'
  where not exists (
    select 1 from olay_loglari
    where bolge_id = b and olay = 'kurulum'
      and detay like '4. ve 5. Su gecmisi elle duzeltildi (19.08.2026).%'
  );

  raise notice 'Duzeltme tamam. t4z1=% t4z2=% t5z1=% t5z2=%', t4z1, t4z2, t5z1, t5z2;
end $$;

-- ============================================================
-- KONTROL 1: 25 hat x 4. Su ve 5. Su kayitlari
-- Beklenen: 4. Su'da 25 satir, 5. Su'da 22 satir (Hat-24/25 bos)
-- ============================================================
select
  case when z.sira_no = 1 then h.sira_no else 20 + h.sira_no end as poz,
  h.hat_no,
  z.ad as zona,
  to_char(k4.baslangic_zamani at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') as su4_bas,
  to_char(k4.bitis_zamani     at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') as su4_bit,
  k4.sure_dakika as su4_dk,
  to_char(k5.baslangic_zamani at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') as su5_bas,
  to_char(k5.bitis_zamani     at time zone 'Europe/Istanbul', 'DD.MM HH24:MI') as su5_bit,
  k5.sure_dakika as su5_dk
from hatlar h
join zonalar z on z.id = h.zona_id
left join sulama_kayitlari k4 on k4.hat_id = h.id and k4.sure_dakika is not null
     and k4.tur_id in (select id from turlar where tur_no = 4)
left join sulama_kayitlari k5 on k5.hat_id = h.id and k5.sure_dakika is not null
     and k5.tur_id in (select id from turlar where tur_no = 5)
where z.bolge_id = (select id from bolgeler where kod = 'kayseri-ana')
order by poz;

-- ============================================================
-- KONTROL 2: tur satirlari
-- ============================================================
select t.tur_no, z.ad as zona, t.durum,
       to_char(t.baslangic_zamani at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') as baslangic,
       to_char(t.bitis_zamani     at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') as bitis,
       (select count(*) from sulama_kayitlari k
         where k.tur_id = t.id and k.sure_dakika is not null) as tamamlama,
       (select count(*) from sulama_kayitlari k
         where k.tur_id = t.id and k.sure_dakika is null) as veri_girisi
from turlar t join zonalar z on z.id = t.zona_id
order by t.tur_no, z.sira_no, t.baslangic_zamani;

-- ============================================================
-- KONTROL 3: gubre satirlari korundu mu? (325 olmali, degismemeli)
-- ============================================================
select count(*) as toplam_gubre_satiri,
       count(*) filter (where k.sure_dakika is null) as veri_girisine_bagli,
       count(*) filter (where k.sure_dakika is not null) as tamamlamaya_bagli
from gubre_uygulamalari g
join sulama_kayitlari k on k.id = g.kayit_id;

-- ============================================================
-- KONTROL 4: anlik sistem durumu
-- Beklenen: Hat-23 aktif, baslama 19.08 12:00, tek seferlik sure 360
-- ============================================================
select h.hat_no as aktif_hat,
       (select hat_no from hatlar where id = s.siradaki_hat_id) as siradaki_hat,
       t.tur_no as aktif_tur, z.ad as aktif_zona, s.sistem_acik,
       to_char(s.hat_baslama_zamani at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') as hat_baslama,
       s.aktif_hat_sure_dk as tek_seferlik_sure_dk,
       (select varsayilan_sure_dk from hatlar where id = s.aktif_hat_id) as hattin_varsayilani
from sistem_durumu s
left join hatlar h on h.id = s.aktif_hat_id
left join turlar t on t.id = s.aktif_tur_id
left join zonalar z on z.id = s.aktif_zona_id;

-- ============================================================
-- KONTROL 5: hat basina toplam tamamlama ("kacinci su" rozeti)
-- ============================================================
select h.hat_no,
       count(k.id) filter (where k.sure_dakika is not null) as toplam_kez
from hatlar h
left join sulama_kayitlari k on k.hat_id = h.id
join zonalar z on z.id = h.zona_id
where z.bolge_id = (select id from bolgeler where kod = 'kayseri-ana')
group by h.hat_no order by h.hat_no;
