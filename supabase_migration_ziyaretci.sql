-- Ziyaretci (misafir) goruntuleme kayitlari
-- Supabase Dashboard > SQL Editor'da calistirin.
create table if not exists ziyaretci_loglari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid references bolgeler(id),
  cihaz text,
  olusturma_zamani timestamptz default now()
);

alter table ziyaretci_loglari enable row level security;

-- Misafirler (anon) yalnizca kayit birakabilir, okuyamaz
drop policy if exists "ziyaret_ekle" on ziyaretci_loglari;
create policy "ziyaret_ekle" on ziyaretci_loglari
  for insert to anon, authenticated with check (true);

-- Yalnizca girisli kullanicilar gorur
drop policy if exists "ziyaret_oku" on ziyaretci_loglari;
create policy "ziyaret_oku" on ziyaretci_loglari
  for select to authenticated using (true);

select 'ziyaretci_loglari hazir' as durum;
