#!/usr/bin/env bash
# ============================================================
# SULAMA TAKIP — GUNCELLEME
#
# Kullanim:  ./guncelle.sh [--imaj-yok] [--yedek-yok]
#
#   --imaj-yok    Docker imajlarini cekme (yalnizca kod + migration)
#   --yedek-yok   Guncelleme oncesi veritabani yedegini alma
#
# Yaptiklari:
#   1) Veritabani yedegi alir (docker/yedekler/)
#   2) Yeni kodu derler
#   3) Yeni migration'lari uygular (hepsi idempotent — tekrar
#      calisan dosya zarar vermez)
#   4) Servisleri yeniden baslatir
#
# ISLETME VERISINE DOKUNMAZ.
# ============================================================
set -euo pipefail

BETIK_DIZIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPO_DIZIN="$(cd "$BETIK_DIZIN/.." && pwd)"
YEDEK_DIZIN="$BETIK_DIZIN/yedekler"

IMAJ_CEK=1; YEDEK_AL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --imaj-yok)  IMAJ_CEK=0; shift ;;
    --yedek-yok) YEDEK_AL=0; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen secenek: $1"; exit 1 ;;
  esac
done

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
mavi()    { printf '\033[36m\n== %s ==\033[0m\n' "$*"; }

[ -f "$BETIK_DIZIN/.env" ] || { kirmizi "docker/.env yok — once ./kur.sh calistirin."; exit 1; }
set -a; . "$BETIK_DIZIN/.env"; set +a

cd "$BETIK_DIZIN"
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"

# ── 1. YEDEK ──
if [ "$YEDEK_AL" = 1 ]; then
  mavi "1/5  Veritabani yedegi"
  mkdir -p "$YEDEK_DIZIN"
  YEDEK="$YEDEK_DIZIN/yedek_$(date +%Y%m%d_%H%M%S).sql.gz"
  $DC exec -T db pg_dump -U postgres --clean --if-exists postgres | gzip > "$YEDEK"
  yesil "Yedek: $YEDEK ($(du -h "$YEDEK" | cut -f1))"
  # Son 10 yedek tutulur
  ls -1t "$YEDEK_DIZIN"/yedek_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  mavi "1/5  Yedek atlandi (--yedek-yok)"
fi

# ── 2. IMAJLAR ──
if [ "$IMAJ_CEK" = 1 ]; then
  mavi "2/5  Docker imajlari"
  $DC pull --quiet
  yesil "Imajlar guncel"
else
  mavi "2/5  Imaj cekimi atlandi"
fi

# ── 3. UYGULAMA ──
mavi "3/5  Uygulama derleniyor"
cat > "$DEPO_DIZIN/.env.production" <<EOF
VITE_SUPABASE_URL=$GENEL_ADRES
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

if command -v npm >/dev/null 2>&1; then
  (cd "$DEPO_DIZIN" && npm ci --silent && npm run build)
else
  docker run --rm -v "$DEPO_DIZIN":/uyg -w /uyg node:20-alpine \
    sh -c "npm ci --silent && npm run build"
fi
yesil "dist/ guncellendi"

# ── 4. MIGRATIONLAR ──
mavi "4/5  Migrationlar"
$DC up -d db
for _ in $(seq 1 60); do
  $DC exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

hata=0
while IFS= read -r satir; do
  dosya=$(printf '%s' "$satir" | sed 's/#.*//' | xargs)
  [ -z "$dosya" ] && continue
  [ -f "$DEPO_DIZIN/$dosya" ] || { kirmizi "  YOK   $dosya"; hata=$((hata+1)); continue; }
  if $DC exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q \
       < "$DEPO_DIZIN/$dosya" >/dev/null 2>&1; then
    echo "  OK    $dosya"
  else
    kirmizi "  HATA  $dosya"; hata=$((hata+1))
  fi
done < "$BETIK_DIZIN/migrasyon_sirasi.txt"

if [ "$hata" -ne 0 ]; then
  kirmizi "$hata migration basarisiz."
  [ "$YEDEK_AL" = 1 ] && echo "Geri donmek icin:  gunzip -c $YEDEK | $DC exec -T db psql -U postgres"
  exit 1
fi
yesil "Sema guncel"

# ── 5. YENIDEN BASLAT ──
mavi "5/5  Servisler yeniden baslatiliyor"
$DC up -d
sleep 3
$DC ps

yesil ""
yesil "✅ GUNCELLEME TAMAM — ${GENEL_ADRES}"
echo ""
echo "  Telefonlarda eski surum gorunuyorsa uygulamayi kapatip"
echo "  yeniden acin (service worker yeni surumu arka planda alir)."
