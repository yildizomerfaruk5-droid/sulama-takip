-- ============================================================
-- SUNUCU TARAFLI OTOMATIK HAT GECISI (20 Temmuz 2026)
-- Sorun: gecisler tarayicida calisiyordu — sayfa kapaliyken
--        hat degisimi yapilamiyordu.
-- Cozum: pg_cron her dakika kontrol eder; sure dolduysa kaydi
--        yazar, siradaki hatta gecer, zona/tur sonlarini yonetir.
--        Cihazlarin acik olmasina gerek kalmaz.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

create extension if not exists pg_cron;

-- Guvence: ayni hat ayni turda iki kez "tamamlandi" kaydi alamaz
-- (tarayici + sunucu ayni anda davranirsa cift kayit olusmaz)
create unique index if not exists sulama_kayit_hat_tur_tekil
  on sulama_kayitlari (hat_id, tur_id)
  where sure_dakika is not null;

create or replace function public.hat_gecis_kontrol()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  aktif_hat record;
  siradaki record;
  yeni_siradaki uuid;
  gecen_dk int;
  yeni_zona record;
  z_ilk uuid;
  z_iki uuid;
  yeni_tur uuid;
  eski_tur_no int;
begin
  for s in
    select * from sistem_durumu
    where sistem_acik = true
      and aktif_hat_id is not null
      and hat_baslama_zamani is not null
  loop
    select * into aktif_hat from hatlar where id = s.aktif_hat_id;
    if aktif_hat.id is null or aktif_hat.varsayilan_sure_dk is null then
      continue;
    end if;

    -- Sure dolmadiysa dokunma. +1 dk tolerans: tarayici aciksa
    -- saniyesinde o halleder; sunucu yalnizca gecikeni toparlar.
    if now() < s.hat_baslama_zamani
              + make_interval(mins => aktif_hat.varsayilan_sure_dk + 1) then
      continue;
    end if;

    gecen_dk := round(extract(epoch from (now() - s.hat_baslama_zamani)) / 60);

    -- 1) Tamamlama kaydi (cift kayit korumali)
    insert into sulama_kayitlari
      (hat_id, tur_id, baslangic_zamani, bitis_zamani, sure_dakika, durum)
    values
      (s.aktif_hat_id, s.aktif_tur_id, s.hat_baslama_zamani, now(), gecen_dk, 'tamamlandi')
    on conflict (hat_id, tur_id) where sure_dakika is not null do nothing;

    if s.siradaki_hat_id is not null then
      -- 2a) Siradaki hatta gec
      select * into siradaki from hatlar where id = s.siradaki_hat_id;

      select id into yeni_siradaki from hatlar
      where zona_id = siradaki.zona_id and sira_no > siradaki.sira_no
      order by sira_no limit 1;

      update sistem_durumu set
        aktif_hat_id = s.siradaki_hat_id,
        siradaki_hat_id = yeni_siradaki,
        hat_baslama_zamani = now(),
        guncelleme_zamani = now()
      where bolge_id = s.bolge_id;

      insert into olay_loglari (bolge_id, olay, detay)
      values (s.bolge_id, 'hat_gecisi',
        format('Hat-%s tamamlandı (%s sa %s dk), Hat-%s başladı — sunucu otomatik',
               aktif_hat.hat_no, gecen_dk / 60, gecen_dk % 60, siradaki.hat_no));
    else
      -- 2b) Zona bitti: turu kapat, hatli siradaki zonaya gec ya da sistemi kapat
      select tur_no into eski_tur_no from turlar where id = s.aktif_tur_id;

      update turlar set bitis_zamani = now(), durum = 'tamamlandi'
      where id = s.aktif_tur_id;

      select z.* into yeni_zona from zonalar z
      where z.bolge_id = s.bolge_id
        and z.sira_no > (select sira_no from zonalar where id = s.aktif_zona_id)
        and exists (select 1 from hatlar h where h.zona_id = z.id)
      order by z.sira_no limit 1;

      if yeni_zona.id is not null then
        select id into z_ilk from hatlar where zona_id = yeni_zona.id order by sira_no limit 1;
        select id into z_iki from hatlar where zona_id = yeni_zona.id order by sira_no offset 1 limit 1;

        insert into turlar (zona_id, tur_no, baslangic_zamani, durum)
        values (yeni_zona.id, eski_tur_no, now(), 'devam_ediyor')
        returning id into yeni_tur;

        update sistem_durumu set
          aktif_hat_id = z_ilk,
          siradaki_hat_id = z_iki,
          aktif_tur_id = yeni_tur,
          aktif_zona_id = yeni_zona.id,
          hat_baslama_zamani = now(),
          guncelleme_zamani = now()
        where bolge_id = s.bolge_id;

        insert into olay_loglari (bolge_id, olay, detay)
        values (s.bolge_id, 'zona_gecisi',
          format('%s. Su: zona tamamlandı, %s başladı — sunucu otomatik', eski_tur_no, yeni_zona.ad));
      else
        update sistem_durumu set
          sistem_acik = false,
          aktif_hat_id = null,
          siradaki_hat_id = null,
          aktif_tur_id = null,
          aktif_zona_id = null,
          hat_baslama_zamani = null,
          guncelleme_zamani = now()
        where bolge_id = s.bolge_id;

        insert into olay_loglari (bolge_id, olay, detay)
        values (s.bolge_id, 'tur_tamamlandi',
          format('%s. Su tamamlandı — tüm hatlar bitti — sunucu otomatik', eski_tur_no));
      end if;
    end if;
  end loop;
end;
$$;

-- Zamanlayici: her dakika (varsa eskisini kaldir, yeniden kur)
do $$
begin
  perform cron.unschedule('hat-gecis-kontrol');
exception when others then null;
end $$;

select cron.schedule('hat-gecis-kontrol', '* * * * *',
  'select public.hat_gecis_kontrol()');

-- KONTROL: zamanlayici listede gorulmeli
select jobname, schedule, active from cron.job;
