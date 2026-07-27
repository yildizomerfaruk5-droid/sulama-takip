-- ============================================================
-- OTOMATIK STANDART GUBRE KAYDI (27 Temmuz 2026)
-- Her yeni sulama tamamlama kaydina (sure_dakika dolu) standart
-- gubre seti otomatik eklenir:
--    4 lt/dekar Karboksilik Asit
--    2 lt/dekar Hayvansal Aminoasit
--    1 lt/dekar UAN 32
--   50 kg/HAT  33 Nitrat
-- Boylece Hat-25 bugun 22:00'de bitince gubresi kendiliginden girer;
-- 3. Su ve sonrasinda da elle giris gerekmez.
--
-- NOT: Popup'tan yapilan fotograf/gubre girisleri (sure_dakika bos)
--      tetiklemez — cift kayit olusmaz. Farkli doz uygulanan turda
--      ilgili kaydin gubresi popup'tan duzeltilebilir.
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

create or replace function public.standart_gubre_ekle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sure_dakika is not null then
    insert into gubre_uygulamalari (kayit_id, gubre_id, miktar, birim, olcek)
    select new.id, g.id, x.miktar, x.birim, x.olcek
    from (values
        ('Karboksilik Asit',    4::numeric, 'litre', 'dekar'),
        ('Hayvansal Aminoasit', 2::numeric, 'litre', 'dekar'),
        ('UAN 32',              1::numeric, 'litre', 'dekar'),
        ('33 Nitrat',          50::numeric, 'kg',    'hat')
      ) as x(ad, miktar, birim, olcek)
    join gubreler g on g.ad = x.ad;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_standart_gubre on sulama_kayitlari;
create trigger trg_standart_gubre
  after insert on sulama_kayitlari
  for each row execute function public.standart_gubre_ekle();

-- Mevcut kayitlarda eksik kalan varsa tamamla (idempotent)
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
where k.sure_dakika is not null
  and not exists (
    select 1 from gubre_uygulamalari gu
     where gu.kayit_id = k.id and gu.gubre_id = g.id
  );

-- KONTROL: her sulama kaydinda 4 gubre satiri olmali
select
  (select count(*) from sulama_kayitlari where sure_dakika is not null) as sulama,
  (select count(*) from gubre_uygulamalari) as gubre_girisi,
  (select count(*) from sulama_kayitlari where sure_dakika is not null) * 4 as beklenen,
  (select sum(miktar) from gubre_uygulamalari gu
     join gubreler g on g.id = gu.gubre_id where g.ad = '33 Nitrat') as toplam_nitrat_kg;
