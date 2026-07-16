-- ============================================================
-- VANALAR TABLOSU + KML SAHA VERISI (16 Temmuz 2026)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- Kaynak: export_2026_07_16-13_59_33.kml (35 isaretci)
-- Not: Hat = vana grubu (75-95 fiskiye). hat_id atamalari
--      hatlar tanimlaninca ayrica yapilacak.
-- ============================================================

create table if not exists vanalar (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid references bolgeler(id),
  hat_id uuid references hatlar(id),      -- simdilik NULL, gruplama sonra
  isaretci_no int not null,               -- KML isaretci numarasi
  lat double precision not null,
  lng double precision not null,
  fiskiye_sayisi int not null default 0,
  yon text check (yon in ('alt','ust') or yon is null),  -- guney kolunda cift yonluler
  parsel text,
  ekim_yonu_derece int,                   -- sulama borusu dogrultusu (315=NW, 50=NE)
  boru_hatti text,                        -- 'kuzeydogu-kolu' / 'guney-kolu'
  notlar text,
  olusturma_zamani timestamptz default now()
);

-- Viewer sifresiz calistigi icin okuma herkese acik (bolgeler ile ayni mantik)
alter table vanalar enable row level security;
drop policy if exists "vanalar_herkes_okur" on vanalar;
create policy "vanalar_herkes_okur" on vanalar for select using (true);

-- Ayni isaretci + yon tekrar eklenmesin (migration iki kez calisirsa)
create unique index if not exists vanalar_isaretci_yon_uniq
  on vanalar (isaretci_no, coalesce(yon, '-'));

do $$
declare b_id uuid;
begin
  select id into b_id from bolgeler where kod = 'kayseri-ana';
  if b_id is null then
    raise exception 'kayseri-ana bolgesi bulunamadi — once bolgeler migrationi calistirin';
  end if;

  insert into vanalar (bolge_id, isaretci_no, lat, lng, fiskiye_sayisi, yon, parsel, ekim_yonu_derece, boru_hatti, notlar)
  values
  (b_id, 1, 38.63009842443778, 36.24527467331556, 17, null, '119/7-119/6', 315, 'kuzeydogu-kolu', 'Ozel dizilim: boru hattinda 8 fiskiye + sol tarafta vana araligi mesafede 5 + ayni mesafede 4 daha (toplam 17)'),
  (b_id, 2, 38.630155600001224, 36.245392200000964, 10, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 3, 38.630196999758766, 36.245517200868434, 13, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 4, 38.630250114024484, 36.245635205675356, 15, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 5, 38.6303073, 36.2457697, 19, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 6, 38.630373676375264, 36.24588165703849, 32, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 7, 38.6304162, 36.2460129, 31, null, '119/7-119/6', 315, 'kuzeydogu-kolu', 'Fiskiye sayisi sahada bos kalmisti; 31 olarak teyit edildi'),
  (b_id, 8, 38.6304710502849, 36.24613232457264, 31, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 9, 38.6305359, 36.2462553, 32, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 10, 38.630588999506124, 36.246379000439, 31, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 11, 38.63064501855922, 36.24650023877621, 32, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 12, 38.63069294866659, 36.2466162443161, 32, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 13, 38.6307487, 36.2467458, 10, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 14, 38.6308053, 36.2468551, 9, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 15, 38.63082835759463, 36.24695923179388, 10, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 16, 38.630888999998966, 36.24705970000097, 9, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 17, 38.630948575364755, 36.24718353152275, 10, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 18, 38.631006196011015, 36.247296184301376, 9, null, '119/7-119/6', 315, 'kuzeydogu-kolu', null),
  (b_id, 19, 38.63106166790024, 36.24741081747893, 20, null, '119/7-119/6', 315, 'kuzeydogu-kolu', 'Ozel dizilim: boru hattinda 9 fiskiye + sagda ~12m arayla 7 + ayni mesafede 4 daha (toplam 20)'),
  (b_id, 20, 38.62992527735579, 36.24506592750549, 27, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 22, 38.62980289934629, 36.24503679869257, 28, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 23, 38.62969426674539, 36.24505117551701, 29, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 24, 38.6295901, 36.24507599993982, 30, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 25, 38.629475099999766, 36.245112699998586, 31, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 26, 38.629381700866155, 36.24516439376374, 31, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 27, 38.6292781, 36.2452148, 31, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 28, 38.6291854, 36.2452951, 30, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 29, 38.62909079999999, 36.245370399999956, 32, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 30, 38.6289892, 36.2454294, 32, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 31, 38.62889529999952, 36.245499599998034, 31, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 32, 38.62878829998194, 36.24554400006673, 26, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 33, 38.62869144924961, 36.24560781652922, 26, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 34, 38.628617504684215, 36.24563825608549, 32, 'alt', '119/7', 50, 'guney-kolu', null),
  (b_id, 26, 38.629381700866155, 36.24516439376374, 25, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 27, 38.6292781, 36.2452148, 22, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 28, 38.6291854, 36.2452951, 22, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 29, 38.62909079999999, 36.245370399999956, 21, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 30, 38.6289892, 36.2454294, 21, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 31, 38.62889529999952, 36.245499599998034, 20, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 32, 38.62878829998194, 36.24554400006673, 19, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 33, 38.62869144924961, 36.24560781652922, 19, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 34, 38.628617504684215, 36.24563825608549, 18, 'ust', '119/9', 50, 'guney-kolu', null),
  (b_id, 35, 38.62859370423084, 36.24566936737179, 25, 'alt', '119/7', 50, 'guney-kolu', '15 adet AKILLI fiskiye + 10 normal (toplam 25). Akilli fiskiye bilgisi ileride kullanilacak. Tarlanin sinir hattinda konumlu.')
  on conflict (isaretci_no, coalesce(yon, '-')) do nothing;
end $$;

-- Kontrol: toplam 43 kayit, 1000 fiskiye beklenir
-- select boru_hatti, yon, count(*), sum(fiskiye_sayisi) from vanalar group by 1,2 order by 1,2;

