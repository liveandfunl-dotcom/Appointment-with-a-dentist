# Запуск для разработки

Нужны Node.js 24 (см. `.nvmrc`) и Docker (для Mailpit и e2e).

## Шаги

1. Установка зависимостей (npm workspaces, из корня репозитория):

   ```bash
   npm install
   ```

2. Почтовая ловушка Mailpit (SMTP `:1025`, веб-интерфейс http://localhost:8025):

   ```bash
   docker compose -f build/docker-compose.yml up -d mailpit
   ```

3. Backend с тестовыми пользователями (http://localhost:3000):

   ```bash
   SEED_DEV=true SMTP_HOST=localhost npm run dev:backend
   ```

   БД по умолчанию — `./data/clinic.db` (папка `data/` в git не попадает). Путь меняется переменной `DB_PATH`.

4. Frontend в соседнем терминале (http://localhost:5173, запросы `/api` проксируются на backend):

   ```bash
   npm run dev:frontend
   ```

   Если backend на другом адресе: `BACKEND_URL=http://localhost:3100 npm run dev:frontend`.

Письма (magic link, уведомления о записи) смотрите в Mailpit: http://localhost:8025.

## Тестовые пользователи

| Роль | Логин | Пароль | Email |
|------|-------|--------|-------|
| root | `root` | `root1234` | `root@clinic.local` |
| администратор (при `SEED_DEV=true`) | `admin` | `admin1234` | `admin@clinic.local` |
| врачи 1–5 (при `SEED_DEV=true`) | `doctor1` … `doctor5` | `doctor1234` | `doctor1@clinic.local` … `doctor5@clinic.local` |

Root создаётся всегда, остальные — только с `SEED_DEV=true`. Повторный запуск дублей не создаёт.

## Проверки

```bash
npm run lint
npm run build
npm run test:api
npm run test:frontend
npm run test:e2e      # нужен запущенный Mailpit
```
