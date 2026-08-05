# Yerel (internetsiz) kurulum

Bu belge, sistemi bir işletmenin **kendi donanımında, internet bağlantısı
olmadan** çalıştırmayı anlatır. Bulut (Vercel + Supabase) kurulumu ayrıdır ve
bundan etkilenmez.

Hedef kitle: temel Linux bilgisi olan biri. Kurulum tek script ile yapılır.

---

## 1. Nasıl çalışır

Tek bir cihaz (Raspberry Pi 5 veya eski bir mini PC) üzerinde Docker ile
şunlar çalışır:

| Bileşen | Ne yapar |
|---|---|
| **Postgres** (`supabase/postgres`) | Veritabanı. `pg_cron` hazır gelir — otomatik hat geçişi buna bağlıdır. |
| **GoTrue** | Yönetici/işçi girişleri |
| **PostgREST** | Uygulamanın veri API'si |
| **Realtime** | Aktif hat değişince telefonların anında görmesi |
| **Storage** | Saha fotoğrafları |
| **Kong** | API geçidi (anahtar doğrulama, yönlendirme) |
| **nginx** | Uygulamayı sunar + tüm API yollarını Kong'a yönlendirir |

Her şey **tek porttan (80)** geçer. Uygulamanın `VITE_SUPABASE_URL`'i kendi
adresidir (`http://sulama.local`), bu yüzden ayrı port veya CORS ayarı yoktur.

### Ağ varsayımı

> **Cihaz işletmenin MEVCUT WiFi ağına bağlanır; kendi erişim noktası
> (hotspot) OLMAZ. Telefonlar aynı ağda olmalıdır.**

Cihaz kendi WiFi'ını yayınlamaz. Tarlada ayrı bir ağ isteniyorsa bu ayrı bir
kurulumdur (bu belgenin kapsamı dışında).

`sulama.local` adresi **mDNS** ile çalışır: cihazın LAN IP'si değişse bile
telefonlar aynı adresle erişir. Android'de mDNS bazı eski sürümlerde
çalışmaz — o durumda cihazın IP'sini kullanın (`hostname -I`) ve tercihen
router'dan sabit IP verin.

---

## 2. Donanım hazırlığı

**Raspberry Pi 5** (önerilen: 8 GB RAM + SSD/NVMe)

1. Raspberry Pi Imager ile **Raspberry Pi OS Lite (64-bit)** yazın.
   32-bit sürüm **çalışmaz** — imajlar yalnızca arm64/amd64.
2. Imager'ın gelişmiş ayarlarında: hostname `sulama`, SSH açık, WiFi bilgileri.
3. SD kart yerine SSD/NVMe kullanın — veritabanı yazması SD kartı hızla yorar.
4. Açın ve SSH ile bağlanın: `ssh pi@sulama.local`

**x86_64 mini PC**

Debian 12 (Bookworm) veya Ubuntu Server 22.04+ kurun. Gerisi aynıdır.

Her iki durumda da:

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 3. Kurulum

```bash
git clone <depo-adresi> sulama-takip
cd sulama-takip/docker
chmod +x kur.sh guncelle.sh
./kur.sh --eposta yonetici@ornek.com --sifre 'GucluBirSifre123!'
```

`kur.sh` sırasıyla şunları yapar:

1. Docker yoksa kurar (Debian/Raspberry Pi OS)
2. **Rastgele güvenli anahtarlar üretir** → `docker/.env` (chmod 600)
3. Uygulamayı derler (`dist/`)
4. Tüm servisleri başlatır
5. Veritabanı şemasını kurar (**işletme verisi olmadan**)
6. `fotograflar` deposunu ve ilk yönetici hesabını oluşturur
7. Avahi/mDNS kurar → cihaz ağda `sulama.local` olur
8. **Temiz kurulum doğrulaması** çalıştırır (bkz. bölüm 6)

Seçenekler:

| Seçenek | Anlamı |
|---|---|
| `--ad tarla` | mDNS adı → `tarla.local` (varsayılan `sulama`) |
| `--port 8080` | Web portu (varsayılan 80) |
| `--mdns-yok` | Avahi kurulumunu atla |
| `--docker-yok` | Docker kurulumunu atla |

### ⚠️ Güvenlik

`.env.example` içindeki değerler **bilerek geçersizdir**. Supabase'in
dokümanlarındaki örnek anahtarlarla asla çalıştırmayın — o anahtarlar
herkese açıktır ve sistemi aynı ağdaki herkese açar. `kur.sh` bu değerleri
tespit ederse kurulumu durdurur.

**`docker/.env` dosyasını yedekleyin.** Kaybolursa veritabanına
erişilemez hale gelir.

---

## 4. İlk giriş ve işletme verisinin girilmesi

1. Telefondan `http://sulama.local` adresini açın
2. Kurulumda verdiğiniz e-posta/şifre ile girin
3. **Kurulum Sihirbazı**'nı açın ve 6 adımı sırayla doldurun:
   1. Bölge bilgileri (ad, il, harita merkezi)
   2. Zonalar
   3. Parseller (elle çizim, KML veya TKGM GeoJSON)
   4. Boru hatları ve saha noktaları (kuyu, T noktası)
   5. Vanalar (işaretçi, fıskiye sayısı, ekim yönü, özel çizim kuralları)
   6. Hatlar (vana grupları, sıra, varsayılan süre)

Veritabanı kurulum sonrası **tamamen boştur** — sihirbaz olmadan harita boş
görünür, bu normaldir.

### Telefonları bağlama

Telefon aynı WiFi'da olmalı. Tarayıcıda `http://sulama.local` açılır, sonra
**"Ana ekrana ekle"** ile PWA olarak kurulur. Uygulama simgesiyle açılır,
adres çubuğu görünmez.

İzleme ekranı (girişsiz, salt görüntüleme): `http://sulama.local/?viewer`

---

## 5. Şema/veri ayrımı — **bakım yaparken okuyun**

Depodaki bazı migration dosyaları **şema ile Kayseri referans kurulumunun
verisini bir arada** taşır. Yerel kurulum bunları kullanamaz: yeni işletme
başka bir çiftliğin parsel/vana verisiyle başlamamalıdır.

Çözüm: bu dosyaların yanına **`_sema` son ekli, yalnızca-şema eşleri**
yazıldı. `kur.sh` yalnızca `_sema` sürümlerini çalıştırır.

> ### ⚠️ İKİ DOSYAYI DA GÜNCELLEYİN
> Aşağıdaki tabloların birine **yeni bir kolon** eklerseniz, hem bulut
> orijinalini hem `_sema` eşini güncelleyin. Yalnızca birini güncellerseniz
> bulut ile yerel kurulumların şeması sessizce ayrışır.

| Bulut dosyası (kök dizin) | Yerel eşi | Ne çıkarıldı |
|---|---|---|
| `supabase_migration_bolgeler.sql` | `sql/supabase_migration_bolgeler_sema.sql` | `kayseri-ana` bölgesini oluşturan ve mevcut satırları ona bağlayan blok |
| `supabase_migration_vanalar.sql` | `sql/supabase_migration_vanalar_sema.sql` | 35 Kayseri vanası. Ayrıca tekil indeks doğrudan bölge bazlı kuruluyor |
| `supabase_migration_gubreler.sql` | `sql/supabase_migration_gubreler_sema.sql` | 6 gübre tanımı (Karboksilik Asit, UAN 32, ...) |

### Yeni yazılan dosya

| Dosya | Neden |
|---|---|
| `sql/supabase_migration_00_cekirdek_sema.sql` | `zonalar`, `hatlar`, `turlar`, `sulama_kayitlari`, `sistem_durumu`, `giris_gecmisi` tabloları **hiçbir migration'da tanımlı değildi** — projenin başında Supabase panelinden elle oluşturulmuşlardı. Bulutta sorun çıkarmadı, ama sıfırdan kurulum ilk dosyada patlıyordu. Kolonlar üretimden okunarak birebir yazıldı. |

> **Not:** `sistem_durumu.hat_baslama_zamani` kolonu üretimde bir *veri*
> dosyasının (`supabase_hatlar_1_4.sql`) içine gömülmüştü. `hat_gecis_kontrol()`
> bu kolon olmadan çalışmaz. Artık çekirdek şema dosyasındadır.

### Yerel kurulumda hiç çalıştırılmayan dosyalar

Bunların hepsi Kayseri referans kurulumunun **verisidir**; yeni işletmede
karşılıkları sihirbazdan girilir:

```
supabase_guncelleme_ekim_yonu.sql          supabase_hatlar_1_4.sql
supabase_migration_vanalar_kuzeybati.sql   sql/supabase_hatlar_5_9.sql
supabase_guncelleme_kuzeybati.sql          sql/supabase_hatlar_10_15.sql
sql/supabase_seed_kayseri_kurulum.sql      sql/supabase_hatlar_21_25_zona2.sql
sql/supabase_kurulum_tamam_kayseri.sql     sql/supabase_vanalar_59_78_hatlar_16_20.sql
sql/supabase_dongu_gubre_hat21_25.sql      sql/supabase_duzeltme_hat21.sql
sql/supabase_hat25_gubre.sql               supabase_duzeltme_*.sql
supabase_kesin_duzeltme.sql                supabase_temizlik_*.sql
```

Uygulanan dosyaların tam ve sıralı listesi: **`docker/migrasyon_sirasi.txt`**

---

## 6. Temiz kurulum doğrulaması

`kur.sh` sonunda `docker/temiz_kurulum_kontrol.sql` çalışır ve üç bölüm gösterir:

1. **Veri tabloları boş mu** — kurulumdan hemen sonra hepsi `TEMIZ` (0 satır)
2. **Kayseri'ye özgü isim/veri var mı** — bölge kodu, `119/x`–`120/x` ada
   numaraları, `kuzeydogu-kolu`/`guney-kolu` boru hatları, Kayseri gübre
   listesi, Kayseri koordinat kuşağı (38.6°K / 36.2°D). Hepsi `TEMIZ` olmalı.
3. **Yapı yerinde mi** — tablo sayısı, `pg_cron` işi, `hat_gecis_kontrol`
   fonksiyonu, RLS açık tablo sayısı, yönetici profili → hepsi `TAMAM`

Herhangi biri `KIRLI` çıkarsa kurulum yanlış dosyaları uygulamıştır.

İstediğiniz zaman elle çalıştırabilirsiniz:

```bash
docker compose exec -T db psql -U postgres -f - < temiz_kurulum_kontrol.sql
```

**İkinci bölüm sihirbazdan sonra da `TEMIZ` kalmalıdır** — kendi verinizi
girmeniz o kontrolleri bozmaz, çünkü yalnızca Kayseri'ye özgü değerleri arar.

---

## 7. Yedekleme

### Uygulama içinden (önerilen, günlük kullanım)

Yönetici ekranındaki **"💾 Yedek İndir"** düğmesi tüm kayıtları JSON olarak
indirir. Telefona/bilgisayara iner, ayrı bir yere kopyalayın.

### Tam veritabanı yedeği

```bash
cd sulama-takip/docker
docker compose exec -T db pg_dump -U postgres --clean --if-exists postgres \
  | gzip > yedek_$(date +%F).sql.gz
```

`guncelle.sh` her çalıştığında bunu otomatik yapar (`docker/yedekler/`,
son 10 yedek tutulur).

**Geri yükleme:**

```bash
gunzip -c yedekler/yedek_20260805_143000.sql.gz \
  | docker compose exec -T db psql -U postgres
```

### Fotoğraflar

```bash
docker run --rm -v sulama_storage-veri:/veri -v "$PWD":/yedek alpine \
  tar czf /yedek/fotograflar_$(date +%F).tar.gz -C /veri .
```

> `docker/.env` dosyasını da yedekleyin — anahtarlar orada.

---

## 8. Güncelleme

```bash
cd sulama-takip
git pull
cd docker
./guncelle.sh
```

Sırasıyla: veritabanı yedeği → imajlar → yeni derleme → migration'lar →
yeniden başlatma. Tüm migration'lar idempotenttir, tekrar çalışmaları
zarar vermez. **İşletme verisine dokunulmaz.**

| Seçenek | Anlamı |
|---|---|
| `--imaj-yok` | Docker imajlarını çekme (internetsiz güncelleme) |
| `--yedek-yok` | Yedek almadan güncelle |

Telefonlarda eski sürüm görünürse uygulamayı kapatıp yeniden açın —
service worker yeni sürümü arka planda alır.

---

## 9. Günlük komutlar

`docker/` klasöründen:

```bash
docker compose ps                 # servis durumları
docker compose logs -f            # canlı günlükler
docker compose logs -f db         # yalnızca veritabanı
docker compose restart            # yeniden başlat
docker compose down               # durdur (veri korunur)
docker compose down -v            # ⚠️ VERİYİ DE SİLER
```

Veritabanı paneli (Studio) — gerektiğinde:

```bash
docker compose --profile studio up -d      # http://sulama.local:3000
docker compose --profile studio down
```

Otomatik hat geçişinin çalıştığını görmek için:

```bash
docker compose exec db psql -U postgres \
  -c "select jobname, schedule, active from cron.job;" \
  -c "select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;"
```

---

## 10. Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| `sulama.local` açılmıyor | mDNS yok. `hostname -I` ile IP'yi öğrenip onu kullanın; router'dan sabit IP verin. |
| Servisler sürekli yeniden başlıyor | `docker compose logs <servis>`. En sık sebep: `.env` eksik/bozuk. |
| `password authentication failed` | Veritabanı eski bir `.env` ile oluşturulmuş. `docker compose down -v` ile sıfırlayıp `./kur.sh` (⚠️ veri gider). |
| Hat geçişi olmuyor | `cron.job` boşsa `sql/supabase_migration_sunucu_gecis.sql` uygulanmamıştır. `sistem_durumu.hat_baslama_zamani` boşsa geçiş tetiklenmez. |
| Fotoğraf yüklenmiyor | `fotograflar` deposu yok: `insert into storage.buckets (id,name,public) values ('fotograflar','fotograflar',true);` |
| Telefon eski sürümü gösteriyor | Uygulamayı kapatıp açın; olmazsa tarayıcı ayarlarından site verilerini temizleyin. |
| Pi ısınıyor / yavaş | SD kart yerine SSD kullanın; `--profile studio` kapalı tutun. |

---

## 11. Doğrulanmış olanlar ve olmayanlar

**Doğrulandı** (x86_64, Docker):

- `pg_cron` resmi Supabase imajında hazır geliyor, zamanlanan iş gerçekten tetikleniyor
- `hat_gecis_kontrol()` hat geçişini, tur tamamlamayı ve sistemi kapatmayı yapıyor
- Tüm şema migration'ları temiz bir veritabanına sorunsuz uygulanıyor
- Yönetici hesabı oluşturma, giriş, RLS (anon yazamıyor, yönetici yazabiliyor)
- Sihirbazın kullandığı REST API ile bölge/zona/vana/hat/parsel oluşturma
- İşaretçi numarasının 1'den başlayabilmesi (bölge bazlı tekillik)
- Temiz kurulum doğrulaması: hiçbir tabloda Kayseri verisi yok

**Kısmen doğrulandı (ARM64):**

- Tüm imajların arm64 sürümü yayınlanıyor (manifest kontrolü)
- `supabase/postgres` arm64 emülasyonunda (`aarch64`) çalıştırıldı, `pg_cron`
  kuruldu ve zamanlanan iş **tetiklendi**

**Doğrulanmadı:**

- **Gerçek Raspberry Pi 5 donanımında tam stack.** Emülasyon çalışmanın
  mümkün olduğunu gösterir, performansı göstermez. İlk Pi kurulumunda
  `docker compose ps` ve `cron.job_run_details` çıktısını kontrol edin.
- Uzun süreli saha kullanımı (aylarca kesintisiz çalışma, SD kart aşınması)
