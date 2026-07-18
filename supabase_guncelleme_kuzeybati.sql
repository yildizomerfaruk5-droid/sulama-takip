-- ============================================================
-- KUZEYBATI KOLU — YON/PARSEL TEYITLERI (18 Temmuz 2026)
-- Sahadan gelen bilgilere gore:
--   * Ekim ekseni guney koluyla ayni: 60 derece (alt) / 240 (ust)
--   * Boru 119/11 icinde; alt = saginda (119/6 tarafi), ust = solu
--   * 40-46 tek yonluler: sola (240) akar, parsel DISINA gider
--   * +2/+1 ekleri fiskiye sayisina dahil (teyit edildi)
--   * 57: normal esit dagilim, 240 yonunde, 119/11 icinde
--   * 58 DUZELTME: alt=31 (75 uzatma + yol ustu 5 AKILLI), ust=6 (3 atlama)
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

-- 1) Alt/ust kayitlari: ekim 60, parsel 119/11
update vanalar
set ekim_yonu_derece = 60, parsel = '119/11'
where boru_hatti = 'kuzeybati-kolu' and yon in ('alt','ust');

-- 2) 40-46 tek yonluler: 240 yonune, parsel disina (kirpma yok)
update vanalar
set ekim_yonu_derece = 240, parsel = null,
    notlar = 'Ana borunun soluna (240) akar — tapulu parsellerin disindaki alani sular'
where boru_hatti = 'kuzeybati-kolu' and isaretci_no between 40 and 46;

-- 3) 57: normal dagilim, 240 yonunde, 119/11 icinde kirpilir
update vanalar
set ekim_yonu_derece = 240, parsel = '119/11',
    notlar = '75lik uzatma; sahada 4 sira yazildi (12+1/14/13/10) — esit dagilim uygulanir'
where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 57;

-- 4) 58 duzeltmesi: alt=31, ust=6
update vanalar
set fiskiye_sayisi = 31,
    notlar = '75 uzatma; yol ustu 5 AKILLI fiskiye dahil (akilli bilgisi ileride kullanilacak)'
where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'alt';

update vanalar
set fiskiye_sayisi = 6,
    notlar = '6 fiskiye + 3 atlama (bosluk)'
where boru_hatti = 'kuzeybati-kolu' and isaretci_no = 58 and yon = 'ust';

-- 5) +2/+1 teyit notlarini temizle (fiskiye toplamlari kesinlesti)
update vanalar
set notlar = null
where boru_hatti = 'kuzeybati-kolu' and notlar like '%kabul edildi%';

update vanalar
set notlar = null
where boru_hatti = 'kuzeybati-kolu' and notlar like '%yonu teyit edilecek%'
  and isaretci_no not between 40 and 46;

-- KONTROL: kol basina kayit/fiskiye + yonsuz kayit kalmadigini gor
select boru_hatti, yon, count(*) as kayit, sum(fiskiye_sayisi) as fiskiye
from vanalar
group by 1, 2
order by 1, 2;

select count(*) as ekim_yonu_eksik
from vanalar where ekim_yonu_derece is null;
-- Beklenen: 0
