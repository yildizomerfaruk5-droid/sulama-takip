# Kurulum Sihirbazı — Geliştirme Spesifikasyonu

**Amaç:** Sistemi tek tarlaya özel bir çözümden, **her tarlaya kurulabilir bir ürüne** dönüştürmek.
Yeni bir tarlaya gidildiğinde kod yazmadan, tamamen arayüzden: parseller, ana boru, kuyu,
vanalar, fıskiye dizilim kuralları ve hatlar tanımlanabilmeli.

> Bu doküman Claude Code'a verilmek üzere hazırlanmıştır. Mevcut sistemin tam envanteri,
> taşınacak sabit veriler, hedef veri modeli, ekran tasarımları ve kabul kriterleri içerir.

**Karar verilmiş kısıtlar:**
- Sihirbazı **yalnızca sistem sahibi (yönetici)** kullanacak — çok kiracılı SaaS değil, tek Supabase projesi.
- Veri girişi: **KML yükleme + harita üzerinde düzenleme** (mevcut saha iş akışının otomatikleşmesi).
- Özel fıskiye kuralları **arayüzden girilebilir** olmalı; kodda sabit kural kalmamalı.

---

## 1. Mevcut Sistem (değiştirilmeyecek temel)

### 1.1 Teknoloji
| Katman | Teknoloji |
|---|---|
| Ön yüz | Vite 8 + Vanilla JS (ES Modules, framework yok) |
| Backend | Supabase: PostgreSQL + Auth + Storage + Realtime + pg_cron |
| Harita | Leaflet 1.9 + Google Satellite tile |
| Grafik | Chart.js 4 (CDN) |
| Dağıtım | GitHub → Vercel (push = otomatik deploy) |
| Mobil | PWA (manifest + service worker) |

Sunucu kodu yok; istemci doğrudan Supabase'e bağlanır. Zamanlı hat geçişleri
veritabanı içinde `pg_cron` + `hat_gecis_kontrol()` ile çalışır (dakikada bir).

### 1.2 Dosya haritası (toplam ~3.400 satır)
```
src/
  main.js        842  Admin: render, sulama kontrolleri, bölge seçici, silme, yedek
  harita.js      605  Leaflet: parseller, boru, vanalar, fıskiye çizimi, katmanlar  ← ANA HEDEF
  istatistik.js  550  Filtreli istatistikler, CSV, sezon raporu
  popup.js       353  Hat veri girişi (gübre kontrol listesi + fotoğraf)
  viewer.js      253  Şifresiz izleme sayfası
  auth.js        188  Giriş/çıkış, misafir modu
  galeri.js      135  Foto albümleri
  log.js         129  Olay + ziyaretçi kayıtları
  hatlar.js      118  Zona/hat sorguları, çalışan hat paneli
  gecmis.js       96  Geçmiş kayıtlar
  yedek.js        41  JSON yedek
  bolge.js        31  Bölge/profil sorguları
  supabase.js     14  İstemci
sql/             Tüm migration'lar (sıra: sql/README.md)
```

### 1.3 Mevcut veritabanı (12 tablo)
```
bolgeler ─┬─ zonalar ── hatlar ── sulama_kayitlari ── gubre_uygulamalari
          ├─ vanalar (hat_id ile hatlara bağlı)
          ├─ sistem_durumu (bölge başına 1 satır)
          └─ olay_loglari / ziyaretci_loglari
profiller (roller) · gubreler · turlar · giris_gecmisi
```

**Kritik alanlar:**
- `vanalar`: `isaretci_no, lat, lng, fiskiye_sayisi, yon('alt'|'ust'|'kismi'|null), parsel(text), ekim_yonu_derece, boru_hatti(text), hat_id, notlar`
- `hatlar`: `zona_id, hat_no, sira_no, parsel_bilgisi, fiskiye_sayisi, varsayilan_sure_dk`
- `sistem_durumu`: `bolge_id, sistem_acik, aktif_hat_id, siradaki_hat_id, aktif_tur_id, aktif_zona_id, hat_baslama_zamani`
- `sulama_kayitlari`: **`sure_dakika` DOLU olanlar = gerçek sulama tamamlamaları**; boş olanlar = fotoğraf/gübre veri girişleri. Bu ayrım her yerde kullanılıyor, korunmalı.

### 1.4 İş kuralları (korunacak)
- Hat = vana grubu; hedef 75-95 fıskiye.
- Fıskiye aralığı 10 m, kapsama yarıçapı ~7 m, fıskiye başına ~120 m² alan.
- Renkler durumdan türetilir: aktif = koyu mavi (`#1450b8`, yanıp söner), sıradaki = sarı, bu turda tamamlanan = yeşil, beklemede = hattın palet rengi.
- Aktif hat, kaydı girilmiş olsa bile aktif görünür (`hatlar.js/hatDurumuBelirle`).
- Geçişler **yalnızca sunucuda** (pg_cron) yapılır; tarayıcı geçiş tetiklemez.
- Akış döngüseldir: son hattan sonra ilk hatta döner, tur numarası +1 (3. Su, 4. Su...).
- RLS: okuma herkese açık (viewer şifresiz), yazma rol bazlı (yonetici/denetleyici tam, isci yalnız veri girişi, anon hiçbir şey).

---

## 2. Sorun: Sabit kodlanmış tarla verisi

`src/harita.js` içinde **Kayseri sahasına özel** veriler gömülü. Yeni tarlada bunların hepsi yanlış olur:

| Satır | Sabit | İçerik |
|---|---|---|
| 11 | `PARSELLER` | 7 parselin GeoJSON poligonu (id, alan, coords) |
| 43-44 | `KUYU`, `T_NOKTASI` | Kuyu ve ana dağıtım noktası koordinatları |
| 46 | `ANA_BORU_HATLARI` | 8 boru segmenti (ad, coords, renk, kesikli) |
| 57 | `VANA_NOKTALARI` | 3 ayrım noktası işareti |
| 365-366 | `FISKIYE_ARALIK` (10 m), `FISKIYE_KAPSAMA` (7 m) | Sahaya göre değişebilir |
| 369 | `BOSLUKLU` | `{33: {yon:'alt', sonra:16}, 34: {...}}` — ekilmemiş boşluk |
| 372 | `UZAT` | `{32: 'alt'}` — parsel sonuna kadar uzatma |
| 376 | `KIRPMASIZ_SABIT` | `{12: 33}` — poligon girintisini yok sayıp sabit uzunluk |
| 476 | vana 58 | `kalanParcayiDoldur()` — parselin kalan parçasını 12 m aralıklı sıralarla doldurur |
| 482 | vana 35 | `kenarBoyuncaNoktalar()` — parsel kenar çizgisini takip eder, 4 pozisyon kaydırmalı |
| 496 | vana 1 / 19 | `OZEL_DIZILIM` — ana sıra + komşuya göre hesaplanan yan sıralar (1: 8+5+4, 19: 9+7+4) |
| 61-63 | `haritaOlustur` | `kayseriSahasi = !bolge \|\| bolge.kod === 'kayseri-ana'` — çizim bu kontrole bağlı |

**Hedef:** Bu tabloların tamamı veritabanına taşınacak, `harita.js` veriyi okuyup çizen genel bir motora dönüşecek.

---

## 3. Hedef veri modeli (yeni tablolar)

> Tümü `bolge_id` ile bölgeye bağlı. Mevcut Kayseri verisi migration ile bu tablolara taşınacak
> (bkz. Bölüm 6), böylece hiçbir görüntü bozulmayacak.

### 3.1 `parseller`
```sql
create table parseller (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  zona_id uuid references zonalar(id),          -- opsiyonel gruplama
  ad text not null,                              -- "119/7"
  alan_m2 numeric,
  koordinatlar jsonb not null,                   -- [[lng,lat], ...] GeoJSON sırası
  renk text default '#3fae4a',
  sira_no int default 1,
  olusturma_zamani timestamptz default now()
);
```
**Not:** Mevcut kodda koordinatlar `[lon, lat]` sırasında tutuluyor ve çizimde `[c[1], c[0]]` ile
ters çevriliyor. Aynı konvansiyon korunmalı; yükleyici KML'den bu sırada yazmalı.

### 3.2 `boru_hatlari`
```sql
create table boru_hatlari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  ad text not null,                              -- "Kuyu → T", "Vana 3 - 114 grubu"
  tip text default 'ana' check (tip in ('ana','yan')),
  koordinatlar jsonb not null,                   -- [[lat,lng], ...] polyline
  renk text default '#2196f3',
  kesikli boolean default false,
  sira_no int default 1
);
```

### 3.3 `saha_noktalari`
```sql
create table saha_noktalari (
  id uuid primary key default gen_random_uuid(),
  bolge_id uuid not null references bolgeler(id) on delete cascade,
  tip text not null check (tip in ('kuyu','ayrim','karavan','depo','diger')),
  ad text,
  lat double precision not null,
  lng double precision not null,
  ikon text,                                     -- opsiyonel emoji/simge
  notlar text
);
```
(Kuyu, T noktası, ayrım noktaları ve gelecekte karavan burada tutulur.)

### 3.4 `vanalar` — eklenecek kolonlar
```sql
alter table vanalar add column if not exists parsel_id uuid references parseller(id);
alter table vanalar add column if not exists cizim_kurali jsonb;
```
`parsel` (text) kolonu geriye dönük uyumluluk için kalır; yeni kayıtlarda `parsel_id` kullanılır.
Kırpma çok parselli olabildiğinden (`'119/7-119/6'`) ek olarak:
```sql
create table vana_parselleri (          -- çoklu parsel kırpma alanı
  vana_id uuid references vanalar(id) on delete cascade,
  parsel_id uuid references parseller(id) on delete cascade,
  primary key (vana_id, parsel_id)
);
```

### 3.5 `cizim_kurali` JSON şeması (özel kuralların veri karşılığı)
Her vana kaydında opsiyonel. Motor bu alana bakarak çizer:

```jsonc
// 1) Normal (varsayılan): alan boş → vanadan ekim yönünde 10 m arayla, parselde kırpılarak
null

// 2) Ekilmemiş boşluk (mevcut BOSLUKLU: vana 33, 34)
{ "tip": "bosluk", "sonra": 16, "atlama": 3 }
// 16. fıskiyeden sonra 3 aralık (30 m) boşluk bırak, kalanı kaydırarak çiz

// 3) Parsel sonuna kadar uzat (mevcut UZAT: vana 32)
{ "tip": "uzat", "maks": 80 }

// 4) Kırpmasız sabit uzunluk (mevcut KIRPMASIZ_SABIT: vana 12)
{ "tip": "sabit", "adet": 33 }
// Poligon girintisi yüzünden yanlış kırpılan sıralar için

// 5) Yan sıralar (mevcut OZEL_DIZILIM: vana 1, 19)
{ "tip": "yan_sira",
  "ana": 8,
  "yon_referans": { "komsu_isaretci": 2 },   // yön: komşudan bu vanaya doğru
  "siralar": [ { "kaydirma_m": 12, "adet": 5 }, { "kaydirma_m": 24, "adet": 4 } ] }

// 6) Parsel kenarını takip et (mevcut vana 35)
{ "tip": "kenar", "parsel_ad": "119/7", "baslangic_kaydirma": 4 }

// 7) Alan doldurma (mevcut vana 58 alt)
{ "tip": "alan_doldur", "parsel_ad": "119/11",
  "boru_yonu": 326, "sira_araligi_m": 12, "maks_sira": 45, "maks_fiskiye": 60 }
```

### 3.6 `bolgeler` — eklenecek ayarlar
```sql
alter table bolgeler add column if not exists fiskiye_araligi_m numeric default 10;
alter table bolgeler add column if not exists fiskiye_kapsama_m numeric default 7;
alter table bolgeler add column if not exists fiskiye_alan_m2 numeric default 120;
alter table bolgeler add column if not exists varsayilan_sure_dk int default 480;
alter table bolgeler add column if not exists kurulum_tamam boolean default false;
```

---

## 4. Yapılacak iş — iki parça

### PARÇA A: Çizim motorunu veriye taşı (`harita.js` refactor)

`haritaOlustur(elementId, bolge)` artık sabit dizileri değil, veritabanını okumalı:

```js
export async function haritaOlustur(elementId, bolge) {
  // 1. Harita + katmanlar + kontroller (mevcut kod korunur)
  // 2. parseller  → supabase.from('parseller').select().eq('bolge_id', bolge.id)
  // 3. boru_hatlari → polyline çizimi
  // 4. saha_noktalari → kuyu/ayrım/karavan işaretleri
  // 5. fitBounds: veriden hesapla (sabit koordinat yok)
}
```

`kayseriSahasi` kontrolü **kaldırılacak**; her bölge kendi verisini çizer.
Veri yoksa (yeni bölge) harita boş açılır, sihirbaza yönlendiren bir ipucu gösterilir.

`fiskiyeleriCiz()` içindeki `if (v.isaretci_no === 58)`, `=== 35`, `=== 1 || === 19` gibi
tüm sabit kontroller **`v.cizim_kurali.tip`** üzerinden çalışan bir `switch` yapısına dönüşecek.
Mevcut yardımcı fonksiyonlar (`metreOtele`, `yonHesapla`, `poligonIcinde`, `mesafeM`,
`kenarBoyuncaNoktalar`, `kalanParcayiDoldur`) **korunur**, sadece parametreleri kuraldan gelir.

Katman sistemi, hat renk paleti (`HAT_PALET`), canlı durum renklendirmesi (`HAT_RENK`),
popup içerikleri ve "🎯 görünümü sıfırla" butonu **aynen çalışmaya devam etmeli**.

### PARÇA B: Kurulum sihirbazı arayüzü (`src/kurulum.js` — yeni)

Admin panelde "⚙️ Kurulum" bağlantısı (yalnızca `rol = 'yonetici'`). 6 adımlı sekmeli ekran:

#### Adım 1 — Bölge
- Ad, kod (slug), il/ilçe, açıklama
- Harita merkezi: haritadan tıklayarak veya koordinat girerek
- Varsayılan zoom, fıskiye aralığı/kapsama/alan, varsayılan hat süresi
- Kaydet → `bolgeler` (+ `sistem_durumu` satırı trigger ile otomatik)

#### Adım 2 — Zonalar
- Basit liste: ad, açıklama, sıra no; ekle/düzenle/sil
- En az 1 zona zorunlu

#### Adım 3 — Parseller
- **KML yükle** (dosya seç veya sürükle-bırak):
  - `<Placemark>` içindeki `<Polygon>` → parsel adayı; `<name>` → ad, `<coordinates>` → koordinatlar
  - Ayrıştırma sonrası önizleme tablosu: ad, nokta sayısı, hesaplanan alan (m²)
  - Kullanıcı hangilerinin içe aktarılacağını seçer, ad/zona ataması yapar
- **Haritada çiz**: Leaflet ile poligon çizim aracı (leaflet-draw yerine basit tıklama-noktalama;
  CDN'e yeni bağımlılık eklemeden kendi çizim modunu yazmak tercih edilir)
- Liste: parsel adı, alan, zona, renk; düzenle/sil
- Alan hesabı: küresel poligon alanı (shoelace + enlem düzeltmesi), m² ve dekar göster

#### Adım 4 — Ana boru ve saha noktaları
- KML'den `<LineString>` → boru segmenti; `<Point>` → nokta adayı
- Haritada tıklayarak polyline çizme ve nokta ekleme
- Nokta tipi seçimi: kuyu / ayrım / karavan / depo / diğer
- Boru segmenti: ad, renk, kesikli mi

#### Adım 5 — Vanalar  ← en kritik ekran
- **KML yükle**: `<Point>` işaretçiler → vana adayları
  - `<name>` içinden numara ayrıştır ("İşaretçi 34" → 34)
  - `<description>` içinden fıskiye sayısı ve yön ayrıştırma **önizlemeli** olmalı:
    - `"32 alt"` → alt: 32
    - `"31 alt\n25 üst"` → alt: 31, üst: 25
    - `"6+2 alt"` → alt: 8 (toplama yapılır, orijinal metin nota yazılır)
    - `"50lik 6"` → 6 (çap ifadesi ayıklanır, nota yazılır)
    - `"9 normal\n7 75lik artırma\n4 hortum"` → ana 9 + yan sıralar (kullanıcı onayıyla `yan_sira` kuralı)
  - Ayrıştırılamayan satırlar **kırmızı** işaretlenir, kullanıcı elle düzeltir
  - Her satır için: yön (alt/üst/tek), parsel(ler), ekim yönü, hat ataması
- **Ekim yönü yardımcısı**: haritada iki nokta seçtir → pusula açısını hesapla ve yaz
  (mevcut iş akışında bu hep elle yapıldı; otomatikleşmeli)
- **Toplu düzenleme**: seçili vanalara aynı ekim yönü / parsel / boru hattı ata
- **Özel kural editörü** (satır sonundaki ⚙ ikonu): Bölüm 3.5'teki 7 tipten biri seçilir,
  alanları doldurulur, **canlı önizleme** haritada gösterilir
- Haritaya tıklayarak tekil vana ekleme, sürükleyerek konum düzeltme

#### Adım 6 — Hatlar
- Sol: hat listesi (ekle/sil/sırala), sağ: haritada vanalar
- Vana seçimi haritadan tıklayarak veya listeden çoklu seçimle
- Seçim yapıldıkça **canlı toplam fıskiye** gösterimi + 75-95 bandı uyarısı
  (yeşil: 75-95, sarı: 60-75 veya 95-110, kırmızı: dışında)
- Her hat: no, sıra no, zona, parsel bilgisi, varsayılan süre
- `hatlar.fiskiye_sayisi` daima vana toplamından hesaplanıp yazılır (elle girilmez)
- Kaydet → `hatlar` + `vanalar.hat_id`

#### Kurulum sonu
- Özet ekranı: X parsel, Y vana, Z hat, toplam N fıskiye, toplam alan
- Eksik uyarıları: hatta atanmamış vanalar, kapasitesi bandın dışındaki hatlar, ekim yönü boş vanalar
- "Kurulumu tamamla" → `bolgeler.kurulum_tamam = true`, bölge seçicide görünür olur

---

## 5. Ek özellikler (aynı işin parçası)

1. **Bölge kopyalama**: mevcut bir bölgeyi şablon olarak kopyala (parsel/vana/hat yapısı, kayıtlar hariç).
2. **KML dışa aktarma**: kurulmuş bölgeyi KML olarak indir (sahada Google Earth ile kontrol).
3. **Kurulum kilidi**: sulama aktifken (`sistem_acik = true`) yapısal düzenleme uyarı verir;
   hat/vana silme işlemi geçmiş kayıtları etkilemeyecek şekilde engellenir veya soft-delete olur.
4. **Olay logu**: her kurulum değişikliği `olay_loglari`'na yazılır (`olay = 'kurulum'`).

---

## 6. Migration stratejisi (mevcut Kayseri verisi bozulmamalı)

**Bu en riskli kısım. Sıra önemli:**

1. Yeni tabloları oluştur (Bölüm 3), RLS politikalarını mevcut desene göre kur
   (okuma herkese, yazma yönetici/denetleyici).
2. **Seed migration**: `harita.js`'deki mevcut sabit veriyi SQL'e dök —
   7 parsel, 8 boru segmenti, kuyu + T + 3 ayrım noktası → `kayseri-ana` bölgesine.
3. Mevcut 97 vananın `parsel_id` / `vana_parselleri` eşlemesini `parsel` metninden üret
   (`'119/7-119/6'` → iki satır).
4. Özel kuralları `cizim_kurali` alanına yaz:
   - vana 1 → `yan_sira` (ana 8, komşu 2, sıralar 12m:5, 24m:4)
   - vana 19 → `yan_sira` (ana 9, komşu 18, sıralar 12m:7, 24m:4)
   - vana 12 → `sabit` (33)
   - vana 32 alt → `uzat`
   - vana 33 alt, 34 alt → `bosluk` (sonra 16, atlama 3)
   - vana 35 → `kenar` (119/7, kaydırma 4)
   - vana 58 alt → `alan_doldur` (119/11, boru yönü 326, sıra 12 m)
5. `harita.js`'i yeni motora çevir, `kayseri-ana` görünümünü **eski hâliyle piksel piksel karşılaştır**
   (fıskiye sayısı, konumlar, renkler, popup metinleri aynı olmalı).
6. Sabit dizileri koddan sil.
7. `bolgeler.kurulum_tamam = true` (kayseri-ana).

**Kabul kriteri:** Migration sonrası mevcut harita görünümü, hat renkleri, canlı durum
ve tüm popup içerikleri değişmemiş olmalı; tek fark verinin kaynağı olmalı.

---

## 7. Kabul kriterleri (bitti sayılması için)

- [ ] Sıfırdan yeni bir bölge, **tek satır kod yazmadan**, sadece arayüzden kurulabiliyor.
- [ ] KML yükleyip parsel + vana içe aktarma çalışıyor; ayrıştırılamayan satırlar işaretleniyor.
- [ ] Yedi özel kural tipi arayüzden tanımlanabiliyor ve haritada doğru çiziliyor.
- [ ] Ekim yönü haritadan iki nokta seçilerek hesaplanabiliyor.
- [ ] Hat oluştururken canlı fıskiye toplamı ve kapasite uyarısı görünüyor.
- [ ] Mevcut Kayseri bölgesinin görünümü ve verisi bozulmadı (Bölüm 6 kabul kriteri).
- [ ] Sulama akışı (pg_cron geçişleri, döngüsel tur, sayaç) etkilenmedi.
- [ ] Viewer sayfası ve PWA çalışmaya devam ediyor.
- [ ] `npm run build` hatasız; konsol hatası yok.
- [ ] RLS: `isci` ve `anon` roller kurulum ekranına erişemiyor, yazamıyor.

---

## 8. Uygulama sırası (önerilen)

| Aşama | İş | Neden önce |
|---|---|---|
| 1 | Yeni tablolar + RLS + seed migration (Bölüm 3, 6.1-6.4) | Veri hazır olmadan motor yazılamaz |
| 2 | `harita.js` refactor + Kayseri karşılaştırması (6.5-6.7) | Riskin büyük kısmı burada; erken çözülmeli |
| 3 | Kurulum sihirbazı adım 1-2 (bölge, zona) | En basit ekranlar, iskeleti kurar |
| 4 | Adım 3-4 (parsel, boru, noktalar) + KML yükleyici | Yükleyici altyapısı burada oluşur |
| 5 | Adım 5 (vanalar + özel kural editörü) | En karmaşık ekran, altyapı hazırken yapılmalı |
| 6 | Adım 6 (hatlar) + kurulum özeti | Diğerlerine bağımlı |
| 7 | Ek özellikler (kopyalama, KML dışa aktarma, kilit) | Nice-to-have |

---

## 9. Kod yazarken dikkat edilecekler

- **Framework eklenmeyecek.** Vanilla JS + template literal deseni korunur (mevcut kodun tamamı böyle).
- **Yeni CDN bağımlılığı eklenmemeli**; Leaflet ve Chart.js dışına çıkılmamalı.
- Türkçe kod yorumları ve Türkçe değişken adlandırması mevcut desene uygun sürdürülür.
- Her yeni tablo için RLS **açık** olmalı; yazma yetkisi `public.aktif_rol()` fonksiyonuyla kontrol edilir
  (mevcut desen: `sql/supabase_migration_rls_guvenlik.sql`).
- SQL dosyaları `sql/` klasörüne, `README.md`'deki sıraya eklenir; **idempotent** yazılır
  (tekrar çalıştırılabilir).
- Commit'ler GitHub noreply e-postasıyla atılır (`yildizomerfaruk5-droid@users.noreply.github.com`).
- `sure_dakika` ayrımı (tamamlama vs veri girişi) hiçbir yerde bozulmamalı.
- Mobil öncelikli: sihirbaz ekranları dar ekranda da kullanılabilir olmalı (saha koşulları).

---

*Hazırlayan: sistem geliştiricisi Ömer Faruk Yıldız için — mevcut kod tabanının analizinden çıkarılmıştır.*
