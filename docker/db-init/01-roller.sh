#!/bin/bash
# ============================================================
# SERVIS ROLLERININ SIFRELERI
#
# supabase/postgres imaji yalnizca 'postgres' superuser'inin
# sifresini POSTGRES_PASSWORD'dan alir. GoTrue, PostgREST, Storage
# ve Realtime kendi rolleriyle baglanir; o rollerin sifresi bos
# kalirsa hepsi "password authentication failed" ile doner.
#
# Bu betik yalnizca veritabani ILK kez olusturulurken calisir
# (docker-entrypoint-initdb.d). Sifre degistirmek isterseniz elle:
#   docker compose exec db psql -U postgres \
#     -c "alter user authenticator with password 'YENI';"
# ============================================================
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  do \$\$
  declare r text;
  begin
    foreach r in array array[
      'authenticator',              -- PostgREST
      'supabase_auth_admin',        -- GoTrue
      'supabase_storage_admin',     -- Storage
      'supabase_admin',             -- Realtime + bakim
      'supabase_functions_admin',
      'supabase_read_only_user',
      'dashboard_user',
      'pgbouncer'
    ]
    loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('alter role %I with login password %L', r, '$POSTGRES_PASSWORD');
      end if;
    end loop;
  end \$\$;

  -- Realtime kendi semasini yonetir; yoksa migration'i patlar
  create schema if not exists _realtime;
  alter schema _realtime owner to supabase_admin;
EOSQL

echo "[db-init] servis rollerinin sifreleri ayarlandi"
