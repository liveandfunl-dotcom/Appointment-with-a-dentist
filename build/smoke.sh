#!/usr/bin/env bash
# Smoke-тест развёртывания (AC-DEPLOY-01).
# Собирает образ, поднимает стек во временной папке данных, создаёт врача,
# пересоздаёт контейнер app и проверяет, что данные в volume сохранились.
# Хост-порты можно сменить: APP_PORT=3100 MAILPIT_SMTP_PORT=1125 MAILPIT_UI_PORT=8125 bash build/smoke.sh
# Код возврата: 0 — всё прошло, иначе — первый же провал.
set -euo pipefail

BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$BUILD_DIR/docker-compose.yml"

export APP_PORT="${APP_PORT:-3000}"
export MAILPIT_SMTP_PORT="${MAILPIT_SMTP_PORT:-1025}"
export MAILPIT_UI_PORT="${MAILPIT_UI_PORT:-8025}"
export APP_URL="http://localhost:${APP_PORT}"
export SEED_DEV=""
export COMPOSE_PROJECT_NAME="clinic-smoke-$$"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clinic-smoke-data.XXXXXX")"
export DATA_DIR
chmod 777 "$DATA_DIR" # контейнер работает под пользователем node (uid 1000)

BASE="http://localhost:${APP_PORT}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/clinic-smoke-work.XXXXXX")"
COOKIES="$WORK/cookies.txt"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
step() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  code=$?
  set +e
  if [ "$code" -ne 0 ]; then
    echo "--- логи app ---" >&2
    dc logs --tail 50 app >&2
  fi
  step "Очистка"
  dc down -v --rmi local --remove-orphans >/dev/null 2>&1
  rm -rf "$DATA_DIR" "$WORK"
  if [ "$code" -eq 0 ]; then echo "SMOKE OK"; else echo "SMOKE FAILED (код $code)" >&2; fi
  exit "$code"
}
trap cleanup EXIT

wait_health() {
  for _ in $(seq 1 60); do
    if curl -fsS "$BASE/api/health" 2>/dev/null | grep -q '"status":"ok"'; then return 0; fi
    sleep 1
  done
  return 1
}

login_root() {
  rm -f "$COOKIES"
  code=$(curl -sS -o "$WORK/login.json" -w '%{http_code}' -c "$COOKIES" \
    -H 'Content-Type: application/json' \
    -d '{"login":"root","password":"root1234"}' "$BASE/api/auth/login")
  [ "$code" = "200" ] || fail "вход root: HTTP $code ($(cat "$WORK/login.json"))"
}

step "Сборка образа и запуск стека ($COMPOSE_PROJECT_NAME, порт $APP_PORT, данные $DATA_DIR)"
dc up -d --build

step "Ожидание GET /api/health"
wait_health || fail "приложение не ответило на /api/health за 60 с"

step "Вход root/root1234"
login_root

step "Создание врача"
EMAIL="smoke.$$@clinic.local"
code=$(curl -sS -o "$WORK/create.json" -w '%{http_code}' -b "$COOKIES" \
  -H 'Content-Type: application/json' \
  -d "{\"role\":\"doctor\",\"surname\":\"Смоков\",\"name\":\"Сергей\",\"phone\":\"+30 210 000 9999\",\"email\":\"$EMAIL\",\"specialization\":\"Терапевт\",\"room\":999,\"workDays\":[1,2,3,4,5],\"workStart\":\"09:00\",\"workEnd\":\"17:00\"}" \
  "$BASE/api/users")
[ "$code" = "201" ] || fail "создание врача: HTTP $code ($(cat "$WORK/create.json"))"
grep -q 'Смоков' "$WORK/create.json" || fail "в ответе создания нет врача: $(cat "$WORK/create.json")"

step "Пересоздание контейнера app"
dc up -d --force-recreate app
wait_health || fail "после пересоздания приложение не ответило на /api/health"

step "Повторный вход и проверка, что врач на месте"
login_root
curl -fsS -b "$COOKIES" "$BASE/api/users" -o "$WORK/users.json" || fail "GET /api/users не удался"
grep -q 'Смоков' "$WORK/users.json" || fail "врач пропал после пересоздания контейнера: $(cat "$WORK/users.json")"
[ -s "$DATA_DIR/clinic.db" ] || fail "файл clinic.db не найден в $DATA_DIR"

step "Проверка раздачи фронтенда"
curl -fsS "$BASE/" -o "$WORK/index.html" || fail "GET / не удался"
grep -qi '<div id="root"' "$WORK/index.html" || fail "GET / вернул не index.html"
curl -fsS "$BASE/doctors/some/spa/route" -o "$WORK/spa.html" || fail "SPA-fallback не отдал страницу"
cmp -s "$WORK/index.html" "$WORK/spa.html" || fail "SPA-fallback вернул не index.html"
code=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/no-such-route")
[ "$code" = "404" ] || fail "неизвестный /api/... должен давать 404, получен $code"
