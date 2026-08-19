-- ============================================================
-- MANUEL HAT GECISI — TEK SEFERLIK SURE GECERSIZ KILMA
--
-- NEDEN GEREKLI:
--   Mevcut "Süre Değiştir" dugmesi TEK SEFERLIK DEGILDIR: dogrudan
--   hatlar.varsayilan_sure_dk'yi yazar, yani hattin kalici
--   varsayilanini degistirir ("sadece aktif hat" secildiginde bile).
--   Manuel gecis ozelliginde istenen "yalnizca bu calisma icin sure"
--   davranisinin karsiligi kodda YOKTU; bu migration onu ekler.
--
--   hat_gecis_kontrol() sureyi aktif hattin varsayilan_sure_dk
--   degerinden okuyordu. Artik once sistem_durumu'ndaki tek seferlik
--   gecersiz kilmaya bakar:
--       coalesce(s.aktif_hat_sure_dk, aktif_hat.varsayilan_sure_dk)
--
--   Gecersiz kilma HAT DEGISINCE TEMIZLENIR (null'a cekilir), boylece
--   bir sonraki hat kendi varsayilanina doner — "yalnizca bu calisma".
--
-- DOKUNULMAYANLAR:
--   • hatlar.sira_no      — manuel gecis SIRAYI DEGISTIRMEZ; hat X
--                           bitince otomatik akis yine orijinal
--                           sira_no duzeninden devam eder.
--   • hatlar.varsayilan_sure_dk — hicbir zaman yazilmaz.
--   • RLS politikalari    — degistirilmez.
--
-- Bu betik IDEMPOTENT'tir.
-- ============================================================

-- 1) Tek seferlik sure alani
alter table sistem_durumu
  add column if not exists aktif_hat_sure_dk int;

comment on column sistem_durumu.aktif_hat_sure_dk is
  'Aktif hattin YALNIZCA BU CALISMA icin gecerli suresi (dakika). '
  'null ise hatlar.varsayilan_sure_dk kullanilir. Hat degisince temizlenir.';

-- 2) hat_gecis_kontrol(): tek seferlik sureyi dikkate al ve
--    hat degisiminde temizle. Geri kalan mantik AYNEN korundu.
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
  gecerli_sure int;      -- YENI: tek seferlik sure varsa o
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

    -- YENI: once tek seferlik sure, yoksa hattin varsayilani
    gecerli_sure := coalesce(s.aktif_hat_sure_dk, aktif_hat.varsayilan_sure_dk);

    if aktif_hat.id is null or gecerli_sure is null then
      continue;
    end if;

    -- Sure dolmadiysa dokunma. +1 dk tolerans: tarayici aciksa
    -- saniyesinde o halleder; sunucu yalnizca gecikeni toparlar.
    if now() < s.hat_baslama_zamani
              + make_interval(mins => gecerli_sure + 1) then
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
      --     siradaki_hat_id, manuel gecis sirasinda da hattin KENDI
      --     sira_no'suna gore hesaplanir; boylece manuel sapmadan
      --     sonra orijinal sira aynen devam eder.
      select * into siradaki from hatlar where id = s.siradaki_hat_id;

      select id into yeni_siradaki from hatlar
      where zona_id = siradaki.zona_id and sira_no > siradaki.sira_no
      order by sira_no limit 1;

      update sistem_durumu set
        aktif_hat_id = s.siradaki_hat_id,
        siradaki_hat_id = yeni_siradaki,
        hat_baslama_zamani = now(),
        aktif_hat_sure_dk = null,        -- YENI: tek seferlik sure biter
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
          aktif_hat_sure_dk = null,      -- YENI
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
          aktif_hat_sure_dk = null,      -- YENI
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

-- ============================================================
-- KONTROL
-- ============================================================
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sistem_durumu'
  and column_name = 'aktif_hat_sure_dk';

select 'manuel hat gecisi hazir' as durum;
