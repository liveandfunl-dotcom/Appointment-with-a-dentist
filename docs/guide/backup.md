# Бэкап и восстановление БД

Вся база — один файл `clinic.db` в папке данных (`build/data/` для compose из репозитория; внутри контейнера `/data/clinic.db`).

## Бэкап

**Вариант 1. Копия файла при остановленном контейнере** (самый надёжный):

```bash
docker compose -f build/docker-compose.yml stop app
cp build/data/clinic.db "backup/clinic-$(date +%F).db"
docker compose -f build/docker-compose.yml start app
```

**Вариант 2. Без остановки** (нужен установленный `sqlite3`; создаёт согласованную копию даже при работающем приложении):

```bash
sqlite3 build/data/clinic.db ".backup 'backup/clinic-$(date +%F).db'"
```

Простое `cp` при работающем контейнере не гарантирует целостной копии. Папку `backup/` храните на другом диске или сервере и настройте регулярный запуск (cron).

## Восстановление

```bash
docker compose -f build/docker-compose.yml stop app
cp backup/clinic-2026-11-26.db build/data/clinic.db
docker compose -f build/docker-compose.yml start app
```

Если рядом лежат файлы `clinic.db-journal`, `clinic.db-wal`, `clinic.db-shm`, удалите их перед восстановлением. Затем проверьте вход и `/api/health`.
