# 🌾 Sulama Takip Sistemi

Tarım arazilerinde sulama faaliyetlerinin canlı harita, otomatik hat geçişi,
gübre/fotoğraf kaydı ve istatistiklerle izlendiği çok bölgeli web uygulaması.

> Geliştirici: **Ömer Faruk Yıldız (manco)** — 2026
> Canlı: https://sulama-takip.vercel.app · Viewer: `/?viewer`

---

## Hızlı Başlangıç (yeni geliştirici)

```bash
npm install
cp .env.example .env        # Supabase URL + publishable key gir
npm run dev                 # http://localhost:5173
```

Yeni bir Supabase ortamı kuruyorsan: `sql/README.md` içindeki sırayla
migration dosyalarını SQL Editor'da çalıştır.

## Teknoloji

| Katman | Teknoloji |
|---|---|
| Ön yüz | Vite 8 + Vanilla JS (framework yok, ES Modules) |
| Backend | Supabase: PostgreSQL + Auth + Storage + Realtime + pg_cron |
| Harita | Leaflet 1.9 + Google Satellite |
| Grafik | Chart.js 4 (CDN) |
| Dağıtım | GitHub → Vercel (push = otomatik deploy) |
| Mobil | PWA (manifest + service worker, "Ana Ekrana Ekle") |

Sunucu kodu YOKTUR: istemci doğrudan Supabase'e bağlanır; zamanlı hat
geçişleri veritabanı içinde `pg_cron` ile çalışır (dakikada bir
`hat_gecis_kontrol()` — cihazlar kapalıyken bile geçiş yapılır).

## Dosya Haritası

```
src/
  main.js        Admin uygulaması: render, sulama otomasyonu, tur/zona yönetimi
  viewer.js      Şifresiz izleme sayfası (?viewer)
  harita.js      Leaflet: parseller, borular, vanalar, fıskiyeler, katmanlar,
                 hat renklendirme, canlı durum (mavi yanıp sönen aktif hat)
  popup.js       Hat veri girişi: işlem, not, gübre kontrol listesi, fotoğraf
  istatistik.js  Filtreli istatistikler, CSV dışa aktarım, sezon raporu
  galeri.js      Hat/su bazlı fotoğraf albümleri
  gecmis.js      Geçmiş kayıtlar listesi (+ yönetici silme)
  hatlar.js      Zona/hat sorguları, çalışan hat paneli
  log.js         Olay logları + ziyaretçi kayıtları
  yedek.js       Tek tuşla JSON tam yedek
  bolge.js       Bölge ve kullanıcı profili sorguları
  auth.js        Giriş/çıkış, misafir modu
  supabase.js    İstemci (env değişkenlerinden)
sql/             Tüm migration/düzeltme SQL'leri (sırası sql/README.md'de)
public/          PWA: manifest, service worker, ikonlar
```

## Veri Modeli (12 tablo)

`bolgeler → zonalar → hatlar → sulama_kayitlari → gubre_uygulamalari`
`vanalar` (GPS envanteri, hat ataması) · `turlar` (1. Su, 2. Su...) ·
`sistem_durumu` (bölge başına aktif hat + hat_baslama_zamani) ·
`gubreler` · `profiller` (roller) · `olay_loglari` · `giris_gecmisi` ·
`ziyaretci_loglari`

Kritik ayrım: **`sure_dakika` dolu kayıtlar = gerçek hat tamamlamaları**;
boş olanlar = fotoğraf/gübre veri girişleri. (`islem_turu` kolonunun DB
varsayılanı 'sulama' olduğu için ayrımda KULLANILMAZ — tarihçe: bkz. commit
`6884787`.)

## İş Kuralları (özet)

- Hat = vana grubu (hedef 75-95 fıskiye; alt sınır ~57, üst basınç limiti)
- Kuyu debisi sabit **~90 m³/saat** → su tüketimi = süre × 90
- Renkler durumdan türetilir: aktif=koyu mavi (yanıp söner), sıradaki=sarı,
  bu turda tamamlanan=yeşil, beklemede=hattın kendi palet rengi
- Tur numarası bölge bazında sayılır; zona geçişi su numarasını değiştirmez
- RLS: okuma herkese açık (viewer şifresiz), yazma rol bazlı
  (yonetici/denetleyici tam, isci yalnız veri girişi, anon hiçbir şey)

## Yol Haritası

- [ ] Kalan hat grupları (güney-üst, kuzeybatı kolu) + Zona 2 envanteri
- [ ] Karavan konumu, harita renk lejantı
- [ ] Gübreleme programı + işçi resimli teyidi
- [ ] Bölge çizimlerinin (parsel/boru) veritabanından okunması
- [ ] **Yerel/çevrimdışı kurulum + yerel yapay zekâ** (aşağıya bak)

## Vizyon: Yerel Makinede Çalışma + Offline Yapay Zekâ

Uzun vadeli hedef: sistemin internetsiz, tek bilgisayarda, veri dışarı
sızmadan çalışması ve kendi verileriyle beslenen bir yapay zekâ asistanı.

Mimari buna şimdiden uygun — plan üç aşamalı:

1. **Yerel barındırma**: Supabase açık kaynaktır; `supabase start`
   (Docker) ile aynı Postgres+Auth+Storage yerelde çalışır. Ön yüz statik
   olduğu için tek değişiklik `.env`'deki URL'dir. Mevcut JSON yedek
   dosyası veri taşıma formatıdır.
2. **Veri disiplini (şu an yapılıyor)**: her sulama, gübre, fotoğraf ve
   olay zaman damgalı ve ilişkisel kaydediliyor; CSV/JSON dışa aktarımlar
   gelecekteki eğitim veri setinin ta kendisi. Ne kadar sezon birikirse
   model o kadar iyi olur — bugünkü titiz kayıt, yarının AI yakıtıdır.
3. **Yerel AI katmanı**: Ollama (veya benzeri) ile yerel LLM +
   veritabanına RAG bağlantısı → "geçen sezon Hat-5 kaç m³ su aldı?"
   gibi doğal dil soruları offline cevaplanır. Sayısal tahminler
   (sulama süresi önerisi, su ihtiyacı) için ayrıca küçük bir
   scikit-learn/TinyML modeli sezon verileriyle eğitilebilir.
   MikroKlima-DSS sensör ağı (toprak nemi) bağlandığında model girdileri
   hazır olur.

---

*developed by manco — Ömer Faruk Yıldız*
