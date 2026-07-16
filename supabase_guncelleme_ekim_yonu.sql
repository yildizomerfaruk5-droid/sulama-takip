-- ============================================================
-- EKIM YONU DUZELTMESI (16 Temmuz 2026)
-- Sahadan gelen dogrultu koordinatlarina gore hesaplandi:
--   1-19 : 38.630598,36.246460 -> 38.632966,36.244416  = 326 derece
--   20-35: 38 37'47.5"N 36 14'42.1"E -> 38.631041,36.247643 = 60 derece
-- Supabase Dashboard > SQL Editor'da calistirin.
-- ============================================================

update vanalar set ekim_yonu_derece = 326 where boru_hatti = 'kuzeydogu-kolu';
update vanalar set ekim_yonu_derece = 60  where boru_hatti = 'guney-kolu';

-- Kontrol
select boru_hatti, ekim_yonu_derece, count(*)
from vanalar group by 1, 2 order by 1;
