-- ============================================================
-- GUBRE MODULU (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- Yeni kod deploy edilmeden ONCE calistirilmalidir.
-- ============================================================

-- 1. GUBRE TANIMLARI
create table if not exists gubreler (
  id uuid primary key default gen_random_uuid(),
  ad text unique not null,
  varsayilan_birim text not null default 'litre' check (varsayilan_birim in ('litre','kg')),
  sira_no int default 1,
  aktif boolean default true,
  olusturma_zamani timestamptz default now()
);

alter table gubreler enable row level security;
drop policy if exists "gubreler_herkes_okur" on gubreler;
create policy "gubreler_herkes_okur" on gubreler for select using (true);

insert into gubreler (ad, varsayilan_birim, sira_no) values
  ('Karboksilik Asit',   'litre', 1),
  ('Hayvansal Aminoasit','litre', 2),
  ('UAN 32',             'litre', 3),
  ('Sıvı Kükürt',        'litre', 4),
  ('33 Nitrat',          'kg',    5),
  ('Amonyum Tiyosülfat', 'litre', 6)
on conflict (ad) do nothing;

-- 2. GUBRE UYGULAMALARI (her sulama kaydina bagli, birden fazla olabilir)
create table if not exists gubre_uygulamalari (
  id uuid primary key default gen_random_uuid(),
  kayit_id uuid references sulama_kayitlari(id) on delete cascade,
  gubre_id uuid references gubreler(id),
  miktar numeric not null check (miktar > 0),
  birim text not null check (birim in ('litre','kg')),
  olcek text not null check (olcek in ('dekar','hat')),  -- 5 litre/DEKAR veya 5 litre/HAT
  olusturma_zamani timestamptz default now()
);

alter table gubre_uygulamalari enable row level security;
drop policy if exists "gubre_uyg_herkes_okur" on gubre_uygulamalari;
create policy "gubre_uyg_herkes_okur" on gubre_uygulamalari for select using (true);
drop policy if exists "gubre_uyg_ekle" on gubre_uygulamalari;
create policy "gubre_uyg_ekle" on gubre_uygulamalari for insert with check (true);

-- Kontrol: 6 gubre beklenir
select ad, varsayilan_birim from gubreler order by sira_no;
