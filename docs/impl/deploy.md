# Развёртывание в Docker

Один Docker-образ с backend (NestJS) и собранным frontend, `docker-compose` с приложением и Mailpit, внешний volume для файла БД, smoke-скрипт.

Статус: реализовано, 2026-11-26. Обзор MVP — [clinic-mvp.md](clinic-mvp.md).

## Что реализовано

- **`build/Dockerfile`** — multi-stage сборка на `node:24-slim`:
  1. `build`: `npm ci` и `npm run build` (backend и frontend);
  2. `deps`: только production-зависимости backend;
  3. финальный образ: `node_modules`, `backend/dist`, собранный frontend в `/app/frontend-dist`. Запуск `node backend/dist/main.js`, порт 3000, `VOLUME /data`.
- **`build/docker-compose.yml`** — сервисы `app` (собирается из корня репозитория) и `mailpit` (`axllent/mailpit`, SMTP `:1025`, веб-интерфейс `:8025`). Volume `${DATA_DIR:-./data}:/data` (относительно `build/`), `DB_PATH=/data/clinic.db`. Для `app` задано `restart: unless-stopped`.
- **`build/.env.example`** — шаблон переменных окружения (копируется в `build/.env`).
- **`build/smoke.sh`** — автоматическая проверка развёртывания (AC-DEPLOY-01).
- **Раздача frontend.** Если задан `STATIC_DIR`, backend отдаёт файлы фронтенда и `index.html` для любого GET/HEAD вне `/api` (SPA-fallback). Неизвестные `/api/...` по-прежнему дают 404.
- **Руководства** [docs/guide/](../guide/): запуск для разработки, развёртывание, обновление, бэкап и восстановление БД.

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `build/Dockerfile`, `build/docker-compose.yml`, `build/.env.example`, `.dockerignore` | образ и стек |
| `build/smoke.sh` | smoke-тест развёртывания |
| `backend/src/main.ts` | чтение env (`PORT`, `DB_PATH`, `APP_URL`, `CLINIC_TZ`, `SEED_DEV`, `STATIC_DIR`, `SMTP_*`) |
| `backend/src/app.factory.ts` | статика и SPA-fallback (`staticDir`) |
| `backend/src/mail/mail-transport.ts` | SMTP-транспорт (настройки приходят из env через `main.ts`) |
| `docs/guide/deploy.md`, `update.md`, `backup.md`, `dev-setup.md` | руководства |

## Поведение и решения сверх описания

- **Миграции и сид root** выполняются при каждом старте контейнера и не создают дублей, поэтому обновление — это пересоздание контейнера (`docker compose -f build/docker-compose.yml up -d --build`); данные в volume сохраняются.
- **Пользователь в контейнере** — `node` (uid 1000). На Linux папка с БД на хосте должна принадлежать ему (`chown 1000:1000 build/data`), иначе БД не откроется. `smoke.sh` для временной папки данных выставляет `chmod 777`.
- **`.dockerignore`** исключает `node_modules`, `dist`, `data`, `.env`, `*.db`, `docs` и исходники тестов: образ собирается без них.
- **Почта.** По умолчанию `SMTP_HOST=mailpit`: письма только копятся в Mailpit и пациентам не доставляются. Для реальной отправки задаются `SMTP_HOST/PORT/USER/PASS/FROM` в `build/.env`. Кроме перечисленного в руководстве, транспорт читает `SMTP_SECURE=true` (TLS), но он в compose и `.env.example` не проброшен.
- **Dev-пользователи.** В `.env.example` стоит `SEED_DEV=true`; в рабочей среде значение надо убрать.
- **Порты на хосте** меняются `APP_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`; `APP_URL` должен совпадать с адресом, по которому открывают систему (попадает в ссылки magic link).
- **Smoke** (`bash build/smoke.sh`, код возврата 0 при успехе):
  1. собирает образ и поднимает compose в уникальном проекте `clinic-smoke-<pid>` с временной папкой данных (не трогает `build/data`);
  2. ждёт `GET /api/health`;
  3. входит как `root` / `root1234`, создаёт врача;
  4. пересоздаёт контейнер `app` (`up -d --force-recreate app`), заново входит и проверяет, что врач на месте, а файл `clinic.db` существует;
  5. проверяет раздачу frontend: `GET /` отдаёт `index.html`, глубокий SPA-путь отдаёт тот же файл, неизвестный `/api/...` даёт 404;
  6. при ошибке печатает последние 50 строк лога `app`; в любом случае удаляет стек, образ и временные файлы.
  Порты можно переопределить: `APP_PORT=3100 MAILPIT_SMTP_PORT=1125 MAILPIT_UI_PORT=8125 bash build/smoke.sh`.

## Критерии приёмки

| AC-ID | Что проверяется | Тесты |
|-------|-----------------|-------|
| AC-DEPLOY-01 | после `docker compose up` приложение открывается; после пересоздания контейнера данные БД на месте | `build/smoke.sh` (скрипт, не Jest и не Playwright; запускается вручную, требует Docker) |

## Спеки и руководства

- [docs/specs/system/api.md](../specs/system/api.md) — раздел 7 (переменные окружения).
- [docs/guide/deploy.md](../guide/deploy.md), [update.md](../guide/update.md), [backup.md](../guide/backup.md), [dev-setup.md](../guide/dev-setup.md).

## Ограничения

- HTTPS и прод-харднинг в MVP не входят: приложение слушает обычный HTTP, TLS и ограничение доступа делаются снаружи (обратный прокси или сетевые правила). За прокси rate limit входа считает все запросы с IP прокси (см. [auth.md](auth.md)).
- Учётная запись root со стандартным паролем `root1234` — учебная конфигурация; пароль меняется только заменой хеша в БД.
- Бэкап ручной (копия `clinic.db`); автоматического расписания нет.
- Образ собирается онлайн (нужен реестр npm и Docker Hub); на сервер без интернета образ переносится через `docker save` / `docker load`.
- Smoke не входит в `npm test` и не запускается автоматически.
