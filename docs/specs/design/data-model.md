# Модель данных (SQLite)

Спека — контракт для модуля `backend/src/db` и для тестов `tests/api/db.spec.ts`.
Источник: обзор `docs/impl/clinic-mvp.md`, исходная модель `описание проекта/структура БД.md`.

Связанные критерии: AC-DB-01, AC-DB-02, AC-DB-03, AC-DB-04, а также AC-AUTH-03…10 (MagicLinks, Sessions), AC-USERS-* (Users), AC-APPT-*, AC-SLOTS-* (Appointments).

## 1. Общие правила

- Драйвер — `DatabaseSync` из `node:sqlite` (Node 24). Путь к файлу задаёт `dbPath` в `createApp` (в Docker — `DB_PATH=/data/clinic.db`).
- При открытии соединения выполняются:
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;   -- один файл clinic.db, бэкап = копия файла
  PRAGMA busy_timeout = 5000;
  ```
- **Время.** Все моменты времени хранятся как `INTEGER` — Unix time в **секундах** (UTC). Текущее время берётся только из провайдера `Clock` (`now()` из `createApp`), а не из `Date.now()` напрямую.
- **Часовой пояс клиники** — `CLINIC_TZ` (опция `timezone` в `createApp`), по умолчанию `Europe/Athens`. Расчёт календарных дат, дня недели и времени суток выполняется через `luxon` в этом поясе:
  - момент начала: `DateTime.fromObject({ year, month, day, hour, minute }, { zone: tz }).toSeconds()` — именно по «настенному» времени, а не прибавлением минут к полуночи (иначе ломаются дни перехода на летнее время);
  - `"24:00"` означает `00:00` следующего календарного дня;
  - обратное преобразование: `DateTime.fromSeconds(ts, { zone: tz })` → `YYYY-MM-DD` и `HH:mm`; конец, равный `00:00` следующего дня, отдаётся как `"24:00"`;
  - день недели — `luxon` `weekday`: 1 = Пн … 7 = Вс.
- **Булевы поля** — `INTEGER` 0/1 с `CHECK`.
- Пользователи никогда не удаляются физически, только деактивируются (`isActive = 0`). Записи (Appointments) тоже не удаляются, только отменяются (`status = 'cancelled'`).
- Строки сохраняются после `trim()`. `email` дополнительно приводится к нижнему регистру (`toLowerCase()`) при записи и при поиске. `login` хранится как введён (после `trim()`), сравнение — точное (регистрозависимое).

## 2. DDL (миграция 1 — `initial`)

```sql
CREATE TABLE schema_migrations (
  version   INTEGER PRIMARY KEY,          -- 1, 2, 3 …
  name      TEXT    NOT NULL,             -- 'initial', …
  appliedAt INTEGER NOT NULL              -- unix sec
);

CREATE TABLE Users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  surname        TEXT    NOT NULL,
  isAdmin        INTEGER NOT NULL DEFAULT 0 CHECK (isAdmin  IN (0, 1)),
  isDoctor       INTEGER NOT NULL DEFAULT 0 CHECK (isDoctor IN (0, 1)),
  isRoot         INTEGER NOT NULL DEFAULT 0 CHECK (isRoot   IN (0, 1)),
  login          TEXT    UNIQUE,                       -- NULL = вход только по magic link
  pass           TEXT,                                 -- scrypt-хеш, NULL если нет login
  room           INTEGER,                              -- номер кабинета, NULL у admin/root
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  isActive       INTEGER NOT NULL DEFAULT 1 CHECK (isActive IN (0, 1)),
  specialization TEXT,                                 -- NULL у admin/root
  phone          TEXT,                                 -- NULL допустим только у root
  workDays       TEXT,                                 -- "1,2,3,4,5"; NULL у admin/root
  workStart      INTEGER CHECK (workStart IS NULL OR (workStart BETWEEN 0 AND 1440 AND workStart % 30 = 0)),
  workEnd        INTEGER CHECK (workEnd   IS NULL OR (workEnd   BETWEEN 0 AND 1440 AND workEnd   % 30 = 0)),
  createDate     INTEGER NOT NULL,                     -- unix sec
  CHECK (isAdmin + isDoctor + isRoot = 1),
  CHECK (workStart IS NULL OR workEnd IS NULL OR workStart < workEnd),
  CHECK (pass IS NULL OR login IS NOT NULL)
);
CREATE INDEX idx_users_name    ON Users(name);
CREATE INDEX idx_users_surname ON Users(surname);

CREATE TABLE Appointments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  doctorId        INTEGER NOT NULL REFERENCES Users(id),
  appointmentDate INTEGER NOT NULL,                    -- unix sec начала
  endDate         INTEGER NOT NULL,                    -- unix sec окончания
  createDate      INTEGER NOT NULL,                    -- unix sec создания
  creatorId       INTEGER NOT NULL REFERENCES Users(id),
  patientName     TEXT    NOT NULL,
  patientPhone    TEXT    NOT NULL,
  comment         TEXT,                                -- NULL, если не задан или пустой
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelDate      INTEGER,                             -- unix sec отмены
  cancelerId      INTEGER REFERENCES Users(id),
  CHECK (endDate > appointmentDate),
  CHECK ((status = 'active'    AND cancelDate IS NULL     AND cancelerId IS NULL) OR
         (status = 'cancelled' AND cancelDate IS NOT NULL AND cancelerId IS NOT NULL))
);
CREATE INDEX idx_appointments_doctor_date ON Appointments(doctorId, appointmentDate);
CREATE INDEX idx_appointments_date        ON Appointments(appointmentDate);

CREATE TABLE MagicLinks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tokenHash  TEXT    NOT NULL UNIQUE,                  -- sha256(token), hex, 64 символа
  userId     INTEGER NOT NULL REFERENCES Users(id),
  expiresAt  INTEGER NOT NULL,                         -- createDate + 1800
  usedAt     INTEGER,                                  -- NULL = не использована
  createDate INTEGER NOT NULL
);
CREATE INDEX idx_magiclinks_user ON MagicLinks(userId);

CREATE TABLE Sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tokenHash  TEXT    NOT NULL UNIQUE,                  -- sha256(token), hex
  userId     INTEGER NOT NULL REFERENCES Users(id),
  expiresAt  INTEGER NOT NULL,                         -- createDate + 2592000 (30 дней)
  createDate INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON Sessions(userId);
```

### 2.1. Users — смысл полей и инварианты

| Поле | Тип | Правило |
|---|---|---|
| `id` | INTEGER PK | автоинкремент |
| `name`, `surname` | TEXT NOT NULL | индексируются; 1…100 символов после trim |
| `isRoot` / `isAdmin` / `isDoctor` | INTEGER 0/1 | ровно один равен 1. Роль: `isRoot` → `root`, `isAdmin` → `admin`, `isDoctor` → `doctor` |
| `login` | TEXT UNIQUE, NULL | NULL — входа по паролю нет |
| `pass` | TEXT, NULL | формат `scrypt$<saltHex>$<hashHex>` (см. 2.5). Не NULL только вместе с `login` |
| `room` | INTEGER, NULL | у врача обязателен (целое ≥ 1), у admin/root — NULL |
| `email` | TEXT NOT NULL UNIQUE | нижний регистр |
| `isActive` | INTEGER 0/1 | по умолчанию 1. Root всегда 1 |
| `specialization` | TEXT, NULL | у врача обязателен, у admin/root — NULL |
| `phone` | TEXT, NULL | обязателен для пользователей, создаваемых через API; у сид-root — NULL |
| `workDays` | TEXT, NULL | у врача: уникальные числа 1…7 по возрастанию через запятую без пробелов, минимум одно (`"1,3,5"`). У admin/root — NULL |
| `workStart`, `workEnd` | INTEGER, NULL | минуты от полуночи 0…1440, кратно 30, `workStart < workEnd`. У admin/root — NULL |
| `createDate` | INTEGER NOT NULL | unix sec |

Поля врача (`specialization`, `room`, `workDays`, `workStart`, `workEnd`) у врача все не NULL, у admin и root все NULL.

### 2.2. Appointments

- `appointmentDate`/`endDate` — границы приёма; длительность ≥ 3600 с, обе границы попадают на отметки `HH:00` / `HH:30` в поясе клиники, приём целиком в пределах одного календарного дня клиники (конец ≤ `24:00`).
- Слот занят, если есть запись того же врача со `status = 'active'` и пересечением `a.appointmentDate < new.endDate AND a.endDate > new.appointmentDate`. Отменённые записи слот не занимают (AC-APPT-05, AC-APPT-08, AC-SLOTS-01).
- Проверка пересечения и вставка выполняются в одной транзакции (`BEGIN IMMEDIATE`).
- «Будущая» запись: `appointmentDate > now`. «Прошедшая или текущая» — `appointmentDate <= now` (AC-APPT-09).
- Отмена: `status = 'cancelled'`, `cancelDate = now`, `cancelerId = id отменившего`.

### 2.3. MagicLinks

- Токен: 32 случайных байта (`crypto.randomBytes`), кодировка base64url (43 символа `[A-Za-z0-9_-]`). В БД — только `tokenHash = sha256(token)` в hex.
- `expiresAt = createDate + 1800` (30 минут). Ссылка действительна, если `usedAt IS NULL AND now < expiresAt` (AC-AUTH-04).
- При успешной проверке выставляется `usedAt = now` — ссылка одноразовая (AC-AUTH-05). Прежние неиспользованные ссылки пользователя не аннулируются, истекают сами.

### 2.4. Sessions

- Токен — как у MagicLinks (32 байта, base64url), в cookie `session` хранится сам токен, в БД — `sha256` hex.
- `expiresAt = createDate + 2592000` (30 дней), без продления при активности. Сессия действительна, если `now < expiresAt` и пользователь `isActive = 1` (AC-AUTH-09).
- Logout удаляет строку сессии (AC-AUTH-10). Деактивация пользователя удаляет все его строки `Sessions` (AC-AUTH-13, AC-USERS-09). Истёкшая сессия удаляется при попытке её использовать.

### 2.5. Хеш пароля (AC-DB-03)

- `crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })`, соль — 16 случайных байт.
- Строка в `pass`: `scrypt$<saltHex>$<hashHex>` (соль 32 hex-символа, хеш 128 hex-символов).
- Проверка — пересчёт с той же солью и `crypto.timingSafeEqual`.
- Открытый пароль нигде не хранится и не отдаётся в API. Тест AC-DB-03 читает файл БД напрямую и проверяет, что `pass` начинается с `scrypt$` и не содержит исходный пароль.

## 3. Миграции (AC-DB-01, AC-DB-04)

- Файлы:
  - `backend/src/db/migrations.ts` — экспортирует `MIGRATIONS: Migration[]`, где `Migration = { version: number; name: string; up: string }` (`up` — SQL). Сейчас один элемент: `{ version: 1, name: 'initial', up: <DDL из раздела 2 без schema_migrations> }`.
  - `backend/src/db/migrator.ts` — экспортирует `runMigrations(db: DatabaseSync, migrations: Migration[], now: () => Date): void`.
- Алгоритм `runMigrations`:
  1. `CREATE TABLE IF NOT EXISTS schema_migrations (...)`.
  2. Для каждой миграции по возрастанию `version`, которой нет в `schema_migrations`: в транзакции выполнить `up` и вставить `(version, name, appliedAt)`. При ошибке — откат транзакции и исключение (приложение не стартует).
  3. Уже применённые миграции пропускаются; данные существующих таблиц не трогаются.
- Миграции и сид root выполняются при каждом старте `createApp` (и `main.ts`) до приёма запросов.
- Новые изменения схемы — только новой миграцией со следующим `version`; применённые миграции не редактируются.
- Тест AC-DB-04 может вызвать `runMigrations` с `[...MIGRATIONS, { version: 2, name: 'test', up: 'ALTER TABLE …' }]` поверх БД с данными и проверить, что данные на месте, а в `schema_migrations` по одной строке на версию.

## 4. Сиды

Сиды выполняются после миграций. Идемпотентность — **по email**: если пользователь с таким email уже есть, он не изменяется (пароль, данные, `isActive` сохраняются); иначе вставляется. Повторный старт не создаёт дублей (AC-DB-01, AC-DB-02). `createDate` = `now()` на момент вставки. Пароли хешируются по 2.5.

### 4.1. Root (всегда)

| surname | name | login | пароль | email | роль | phone | поля врача |
|---|---|---|---|---|---|---|---|
| Root | System | `root` | `root1234` | `root@clinic.local` | `isRoot = 1` | NULL | NULL |

### 4.2. Dev-сид (только при `SEED_DEV=true` / `createApp({ seedDev: true })`)

Пароль всех врачей — `doctor1234`. Графики в пределах 08:00–20:00. Имена и специализации на разных языках — чтобы проверять поиск по кириллице и греческому (AC-UI-CARDS-02). У `doctor5` приём каждый день — e2e может записывать на любую будущую дату.

| email | login | surname | name | specialization | room | phone | workDays | workStart–workEnd (минуты) |
|---|---|---|---|---|---|---|---|---|
| `doctor1@clinic.local` | `doctor1` | Иванов | Иван | Терапевт | 101 | +30 210 000 0001 | `1,2,3,4,5` (Пн–Пт) | 09:00–17:00 (540–1020) |
| `doctor2@clinic.local` | `doctor2` | Петрова | Анна | Хирург | 102 | +30 210 000 0002 | `1,3,5` (Пн, Ср, Пт) | 08:00–14:00 (480–840) |
| `doctor3@clinic.local` | `doctor3` | Παπαδόπουλος | Γιώργος | Ορθοδοντικός | 103 | +30 210 000 0003 | `2,4,6` (Вт, Чт, Сб) | 12:00–20:00 (720–1200) |
| `doctor4@clinic.local` | `doctor4` | Smith | John | Orthopedist | 104 | +30 210 000 0004 | `1,2,3,4,5,6` (Пн–Сб) | 10:00–18:00 (600–1080) |
| `doctor5@clinic.local` | `doctor5` | Νικολάου | Μαρία | Детский стоматолог | 105 | +30 210 000 0005 | `1,2,3,4,5,6,7` (Пн–Вс) | 08:00–20:00 (480–1200) |

Администратор:

| email | login | пароль | surname | name | phone | роль |
|---|---|---|---|---|---|---|
| `admin@clinic.local` | `admin` | `admin1234` | Админова | Елена | +30 210 000 0100 | `isAdmin = 1` |

Итого после dev-сида: 1 root, 1 admin, 5 врачей (7 строк `Users`). Без `SEED_DEV` — только root (1 строка).

## 5. Соответствие полей БД и API

Подробно — в `docs/specs/system/api.md`.

| БД | API |
|---|---|
| флаги `isRoot/isAdmin/isDoctor` | `role: 'root' \| 'admin' \| 'doctor'` |
| `isActive` 0/1 | `isActive: boolean` |
| `workDays` `"1,3,5"` / NULL | `workDays: [1, 3, 5]` / `[]` |
| `workStart`/`workEnd` минуты / NULL | `"HH:mm"` (`"00:00"`…`"24:00"`) / `null` |
| `appointmentDate`, `endDate` | `date: "YYYY-MM-DD"`, `start: "HH:mm"`, `end: "HH:mm"` в `CLINIC_TZ` |
| `pass` | никогда не отдаётся |
