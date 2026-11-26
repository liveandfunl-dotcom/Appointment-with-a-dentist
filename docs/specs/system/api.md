# HTTP API

Спека — контракт для `backend/src` и для API-тестов `tests/api/*.spec.ts`.
Источник: обзор `docs/impl/clinic-mvp.md`. Модель данных — `docs/specs/design/data-model.md`.

Связанные критерии: AC-AUTH-01…13, AC-USERS-01…11, AC-SLOTS-01…04, AC-APPT-01…11, AC-MAIL-01…02, AC-I18N-02 (ключи бэкенда).

## 1. Общие правила

- Все маршруты имеют префикс `/api`. Тела запросов и ответов — JSON (`Content-Type: application/json`).
- Неизвестный маршрут → 404 `NOT_FOUND`.
- **Аутентификация** — cookie `session` (см. 4.3). Уровни доступа:

  | Обозначение | Кто |
  |---|---|
  | guest | любой, в том числе без cookie |
  | auth | любой вошедший: doctor, admin, root |
  | doctor | вошедший врач |
  | admin | вошедший администратор |
  | root | вошедший root |

  Нет действующей сессии на закрытом маршруте → 401 `UNAUTHORIZED`. Есть сессия, но роль не подходит → 403 `FORBIDDEN`.
- **Дата и время** в API — в часовом поясе клиники (`CLINIC_TZ`): дата `YYYY-MM-DD`, время `HH:mm` с шагом 30 минут от `"00:00"` до `"24:00"`. Подробности преобразования — в data-model.md, раздел 1.
- **Строки** обрезаются (`trim`). Пустая после trim строка в обязательном поле — ошибка валидации. `email` приводится к нижнему регистру.
- **Лишние поля** в теле запроса игнорируются.
- **Языки** (`lang`): `ru`, `en`, `el`. Поле необязательное, по умолчанию `ru`; другое значение → 400 `VALIDATION_ERROR` с `fields: ["lang"]`.

### 1.1. Формат ошибки

```json
{ "code": "VALIDATION_ERROR", "fields": ["email", "workDays"] }
```

- `code` — всегда есть. `fields` — только у `VALIDATION_ERROR`, `EMAIL_TAKEN`, `LOGIN_TAKEN`: имена полей тела или query, порядок не гарантирован (тесты проверяют вхождение, например `expect.arrayContaining`).
- Некорректный JSON в теле → 400 `VALIDATION_ERROR`, `fields: []`.

### 1.2. Коды ошибок

| HTTP | code | Когда |
|---|---|---|
| 400 | `VALIDATION_ERROR` | неверный формат или нарушено правило поля |
| 400 | `SLOT_UNAVAILABLE` | запись вне рабочего дня/часов врача, в прошлом, к деактивированному врачу |
| 400 | `NOT_CANCELLABLE` | отмена уже отменённой, прошедшей или текущей записи |
| 401 | `UNAUTHORIZED` | нет cookie, сессия неизвестна, истекла или пользователь деактивирован |
| 401 | `INVALID_CREDENTIALS` | неверный логин/пароль, у пользователя нет пароля, пользователь деактивирован |
| 401 | `LINK_EXPIRED` | magic link просрочена |
| 401 | `LINK_INVALID` | неизвестный или уже использованный токен; пользователь ссылки деактивирован |
| 403 | `FORBIDDEN` | действие запрещено для роли |
| 404 | `USER_NOT_FOUND` | magic-link: email не найден или пользователь деактивирован |
| 404 | `NOT_FOUND` | ресурс по id не найден (пользователь, врач, запись), неизвестный маршрут |
| 409 | `EMAIL_TAKEN` | email занят другим пользователем (`fields: ["email"]`) |
| 409 | `LOGIN_TAKEN` | логин занят другим пользователем (`fields: ["login"]`) |
| 409 | `SLOT_TAKEN` | время пересекается с активной записью врача |
| 429 | `TOO_MANY_REQUESTS` | превышен rate limit входа |
| 500 | `INTERNAL_ERROR` | непредвиденная ошибка сервера |
| 503 | `MAIL_FAILED` | не удалось отправить письмо с magic link |

### 1.3. Порядок проверок

Если запрос нарушает несколько правил, возвращается первая ошибка в порядке: rate limit (429) → аутентификация (401) → роль (403) → валидация (400 `VALIDATION_ERROR`) → существование ресурса (404) → бизнес-правила (400/403/409). Отдельные исключения указаны у маршрутов.

### 1.4. Общие правила валидации

| Поле | Правило |
|---|---|
| `email` | после trim и lowercase соответствует `^[^\s@]+@[^\s@]+\.[^\s@]+$`, длина ≤ 254 |
| `surname`, `name`, `specialization` | строка, 1…100 символов после trim |
| `phone`, `patientPhone` | строка, 1…32 символа после trim |
| `patientName` | строка, 1…200 символов после trim |
| `comment` | необязательная строка ≤ 1000 символов; пустая → хранится `null` |
| `room` | целое число (JSON number) ≥ 1 |
| `workDays` | массив уникальных целых 1…7 (1 = Пн … 7 = Вс), длина ≥ 1. В ответе — по возрастанию |
| время (`workStart`, `workEnd`, `start`, `end`) | строка `HH:mm` с шагом 30 минут от `00:00` до `24:00` (регулярка ниже) |
| `workStart` / `workEnd` | `workStart < workEnd`, иначе ошибка с `fields` ⊇ `["workEnd"]` (AC-USERS-04) |
| `date` | `^\d{4}-\d{2}-\d{2}$` и существующая календарная дата |
| `login` | строка 3…50 символов после trim, `^[A-Za-z0-9._-]+$` |
| `password` | строка ≥ 8 символов (не обрезается) |
| id в пути | целое ≥ 1, иначе 404 `NOT_FOUND` |

Регулярка времени: `^(([01][0-9]|2[0-3]):(00|30)|24:00)$`. `start` не может быть `24:00` (длительность ≥ 60 минут).

## 2. Объекты ответа

### 2.1. `AuthUser`

```json
{ "id": 3, "surname": "Иванов", "name": "Иван", "role": "doctor" }
```

`role`: `"root" | "admin" | "doctor"`.

### 2.2. `UserCard` (элемент `GET /api/users`)

```json
{
  "id": 3,
  "surname": "Иванов",
  "name": "Иван",
  "role": "doctor",
  "specialization": "Терапевт",
  "phone": "+30 210 000 0001",
  "email": "doctor1@clinic.local",
  "room": 101,
  "workDays": [1, 2, 3, 4, 5],
  "workStart": "09:00",
  "workEnd": "17:00",
  "isActive": true
}
```

У администратора: `specialization: null`, `room: null`, `workDays: []`, `workStart: null`, `workEnd: null`. Полей `login` и `pass` в карточке нет (AC-USERS-01).

### 2.3. `UserDetails` (`GET/POST/PATCH /api/users…`)

`UserCard` + `"login": "doctor1"` (`string | null`). Поля `pass`/`password` не отдаются никогда (AC-USERS-11).

### 2.4. `Appointment`

```json
{
  "id": 12,
  "doctorId": 3,
  "date": "2026-11-27",
  "start": "09:00",
  "end": "10:30",
  "doctor": { "id": 3, "surname": "Иванов", "name": "Иван", "room": 101 },
  "patientName": "Мария Кузнецова",
  "patientPhone": "+30 690 000 0000",
  "comment": null,
  "status": "active",
  "canCancel": true,
  "creatorId": 2,
  "createDate": 1795689000,
  "cancelerId": null,
  "cancelDate": null
}
```

- `status`: `"active" | "cancelled"`.
- `canCancel = status === 'active' && appointmentDate > now` и текущий пользователь вправе отменить запись (admin/root — любую, врач — свою).
- `createDate`, `cancelDate` — unix sec; `cancelerId`, `cancelDate` — `null` у активной записи.

## 3. Rate limit входа (AC-AUTH-11, AC-AUTH-12)

- Применяется к `POST /api/auth/magic-link` и `POST /api/auth/login`; у каждого маршрута свои счётчики.
- Ключи: `ip` = `req.ip` (Express, `trust proxy` выключен); идентификатор — `email` (trim + lowercase) для magic-link и `login` (trim) для login. Если идентификатор не строка, считается только IP.
- Окно — скользящее, 15 минут (900 с) по `Clock`. Лимиты: 5 запросов на идентификатор и 20 запросов на IP.
- Каждый принятый запрос (с любым итоговым ответом: 200, 400, 401, 404) записывается в оба счётчика. Если на момент запроса в окне уже 5 запросов по идентификатору **или** 20 по IP, ответ 429 `TOO_MANY_REQUESTS`, запрос не обрабатывается и в счётчики не записывается.
- Пример: 5 запросов на `doctor1@clinic.local` → 6-й 429; запрос на другой email с того же IP → обрабатывается. После того как с первого запроса прошло 15 минут, запросы снова принимаются.
- Хранилище — в памяти процесса; у каждого экземпляра `createApp` свой лимитер.

## 4. Маршруты

### 4.1. `GET /api/health`

Доступ: guest. Ответ 200:

```json
{ "status": "ok" }
```

### 4.2. `POST /api/auth/magic-link` (AC-AUTH-01, 02, 11)

Доступ: guest. Rate limit (раздел 3).

```json
{ "email": "doctor1@clinic.local", "lang": "ru" }
```

- 200 `{ "ok": true }` — пользователь найден и активен. Создаётся запись `MagicLinks` (TTL 30 мин), на `email` пользователя уходит письмо на языке `lang` (шаблон `mail.magicLink.*`, раздел 5) со ссылкой `${APP_URL}/auth/magic?token=<token>`.
- 400 `VALIDATION_ERROR` — `fields: ["email"]` / `["lang"]`.
- 404 `USER_NOT_FOUND` — email не найден или пользователь деактивирован; письмо не отправляется.
- 429 `TOO_MANY_REQUESTS`.
- 503 `MAIL_FAILED` — отправка письма упала; созданная ссылка остаётся в БД, но пользователь её не получил.

### 4.3. `POST /api/auth/magic-link/verify` (AC-AUTH-03, 04, 05)

Доступ: guest. Rate limit не применяется.

```json
{ "token": "q1w2e3…" }
```

- 200 `{ "user": AuthUser }` и заголовок
  `Set-Cookie: session=<token>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax` (допускается дополнительный `Expires`).
  Ссылка помечается использованной (`usedAt = now`), создаётся сессия на 30 дней.
- 400 `VALIDATION_ERROR` `fields: ["token"]` — `token` отсутствует или не строка.
- 401 `LINK_INVALID` — токен неизвестен, уже использован или пользователь деактивирован. Проверка «использован» идёт раньше «просрочен».
- 401 `LINK_EXPIRED` — `now >= expiresAt` (ссылке 30 минут и больше).

Cookie без `Secure` (внутренняя сеть, HTTP; HTTPS вне MVP).

### 4.4. `POST /api/auth/login` (AC-AUTH-06, 07, 12)

Доступ: guest. Rate limit (раздел 3).

```json
{ "login": "root", "password": "root1234" }
```

- 200 `{ "user": AuthUser }` + `Set-Cookie` как в 4.3.
- 400 `VALIDATION_ERROR` — `login` или `password` отсутствует, не строка или пустой (`fields: ["login"]`, `["password"]`). Правила длины из 1.4 здесь не применяются.
- 401 `INVALID_CREDENTIALS` — логин не найден, пароль неверный, у пользователя нет пароля, пользователь деактивирован. Ответ одинаковый во всех случаях.
- 429 `TOO_MANY_REQUESTS`.

### 4.5. `POST /api/auth/logout` (AC-AUTH-10)

Доступ: guest (идемпотентно). Тело не нужно.

- 200 `{ "ok": true }`. Если cookie указывает на сессию, она удаляется из БД. Всегда отдаётся
  `Set-Cookie: session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax` (допускается дополнительный `Expires`).
- Повторный запрос со старой cookie к закрытому маршруту → 401 `UNAUTHORIZED`.

### 4.6. `GET /api/auth/me` (AC-AUTH-08, 09, 13)

Доступ: auth.

- 200 `AuthUser`.
- 401 `UNAUTHORIZED` — нет cookie, сессия не найдена или истекла (`now >= expiresAt`), пользователь деактивирован.

### 4.7. `GET /api/users` (AC-USERS-01, 02)

Доступ: guest. Ответ 200 — `UserCard[]`, сортировка по `surname`, затем `name`, затем `id`.

| Кто запрашивает | Состав |
|---|---|
| guest, doctor | только врачи с `isActive = true` |
| admin | все врачи (активные и деактивированные) |
| root | все врачи и все администраторы |

Root в списке не показывается никому.

### 4.8. `GET /api/users/:id` (AC-USERS-11)

Доступ: admin, root.

- 200 `UserDetails`.
- 401 `UNAUTHORIZED`; 403 `FORBIDDEN` — doctor; admin запрашивает администратора или root.
- 404 `NOT_FOUND` — нет пользователя с таким id.

Root может получить любого пользователя, включая себя.

### 4.9. `POST /api/users` (AC-USERS-03…07)

Доступ: admin, root.

Врач:

```json
{
  "role": "doctor",
  "surname": "Иванов",
  "name": "Иван",
  "phone": "+30 210 000 0001",
  "email": "new.doctor@clinic.local",
  "specialization": "Терапевт",
  "room": 101,
  "workDays": [1, 2, 3, 4, 5],
  "workStart": "09:00",
  "workEnd": "17:00",
  "login": "ivanov",
  "password": "secret123"
}
```

Администратор (только root):

```json
{ "role": "admin", "surname": "Петров", "name": "Пётр", "phone": "+30 210 000 0200", "email": "admin2@clinic.local" }
```

Правила:

- `role` обязателен: `"doctor" | "admin"`, иначе 400 `fields: ["role"]`.
- Обязательные поля для обеих ролей: `surname`, `name`, `phone`, `email`.
- Для `doctor` также обязательны: `specialization`, `room`, `workDays`, `workStart`, `workEnd`. Правила — раздел 1.4.
- Для `admin` поля врача не требуются и игнорируются (в БД NULL).
- `login`, `password` необязательны. Если задан `login` — нужен `password` (иначе `fields` ⊇ `["password"]`). `password` без `login` → `fields` ⊇ `["password"]`. `login: ""` или `null` = логина нет.

Ответы:

- 201 `UserDetails` (`isActive: true`).
- 400 `VALIDATION_ERROR` — `fields` со всеми невалидными полями.
- 401 `UNAUTHORIZED` — guest; 403 `FORBIDDEN` — doctor (AC-USERS-07); admin с `role: "admin"` (AC-USERS-06). Для admin проверка роли создаваемого пользователя идёт после проверки самого поля `role` и до проверки остальных полей.
- 409 `EMAIL_TAKEN` / `LOGIN_TAKEN` (AC-USERS-05). Если заняты оба — `EMAIL_TAKEN`.

### 4.10. `PATCH /api/users/:id` (AC-USERS-07…10, AC-AUTH-13)

Доступ: admin, root.

Тело — любое подмножество полей `surname`, `name`, `phone`, `email`, `specialization`, `room`, `workDays`, `workStart`, `workEnd`, `login`, `password`, `isActive` (boolean).

```json
{ "phone": "+30 210 000 0099", "workEnd": "18:00", "password": "", "isActive": false }
```

Правила:

- Переданные поля проверяются по 1.4. Отсутствующее поле не меняется. `null` или пустая строка в обязательном поле → `VALIDATION_ERROR`.
- `workStart < workEnd` проверяется для итоговых значений (старые + новые).
- Для администратора поля врача игнорируются.
- `role` изменить нельзя — поле игнорируется.
- `password`: отсутствует или `""` → пароль не меняется (AC-USERS-08). Непустой → проверка ≥ 8 символов, сохраняется новый хеш, старый пароль перестаёт работать.
- `login`: `""` или `null` → логин и пароль удаляются (вход только по magic link). Новый `login` у пользователя без пароля требует `password`, иначе `fields` ⊇ `["password"]`. Непустой `password` у пользователя без логина и без `login` в запросе → `fields` ⊇ `["password"]`.
- `isActive: false` — пользователь деактивируется, все его сессии удаляются (AC-AUTH-13, AC-USERS-09). Записи к нему остаются как есть, новые записи к нему невозможны (`SLOT_UNAVAILABLE`), его free-windows → 404. `isActive: true` возвращает доступ.

Порядок проверок и ответы (исключение из 1.3: цель проверяется до тела):

1. 401 `UNAUTHORIZED` — guest.
2. 403 `FORBIDDEN` — doctor (AC-USERS-07).
3. 404 `NOT_FOUND` — пользователь не найден.
4. 403 `FORBIDDEN` — цель root (для всех, включая самого root); admin меняет администратора, в том числе себя (AC-USERS-10).
5. 400 `VALIDATION_ERROR`.
6. 409 `EMAIL_TAKEN` / `LOGIN_TAKEN` — значение занято другим пользователем.
7. 200 `UserDetails`.

### 4.11. `GET /api/doctors/:id/free-windows?date=YYYY-MM-DD` (AC-SLOTS-01…04)

Доступ: auth (любой вошедший, для любого врача).

Ответ 200 — свободные окна, отсортированные по началу:

```json
[ { "start": "09:00", "end": "12:00" }, { "start": "13:30", "end": "17:00" } ]
```

Алгоритм:

1. Рабочий интервал дня — `[workStart, workEnd]` врача.
2. Если `date` раньше сегодняшней даты в `CLINIC_TZ` → `[]` (AC-SLOTS-03).
3. Если день недели `date` не входит в `workDays` → `[]` (AC-SLOTS-02).
4. Если `date` — сегодня, начало интервала сдвигается на `max(workStart, L)`, где `L` — ближайшая отметка, кратная 30 минутам и **строго** большая `now` (10:07 → 10:30; 10:00:00 → 10:30; 09:59 → 10:00). Так окна согласованы с правилом «будущая запись: start > now».
5. Из интервала вычитаются активные записи врача на эту дату (отменённые не учитываются).
6. Остаются отрезки длиной ≥ 60 минут.

Ошибки:

- 400 `VALIDATION_ERROR` `fields: ["date"]` — `date` отсутствует или некорректна.
- 401 `UNAUTHORIZED` — guest (AC-SLOTS-04).
- 404 `NOT_FOUND` — нет пользователя с таким id, он не врач или деактивирован (AC-SLOTS-04).

### 4.12. `GET /api/appointments?date=YYYY-MM-DD&doctorId=3` (AC-APPT-06, 07, 11)

Доступ: auth.

- `date` обязателен. `doctorId` необязателен (целое ≥ 1, иначе `VALIDATION_ERROR` `fields: ["doctorId"]`).
- admin, root: без `doctorId` — записи всех врачей на дату; с `doctorId` — только этого врача (неизвестный id → `[]`).
- doctor: всегда только свои записи, `doctorId` игнорируется (AC-APPT-07).
- В ответ попадают записи, у которых начало приходится на `date` в `CLINIC_TZ`, и активные, и отменённые, в том числе у деактивированных врачей.
- Сортировка по `appointmentDate`, затем `id`.
- 200 `Appointment[]`; 400 `VALIDATION_ERROR` `fields: ["date"]`; 401 `UNAUTHORIZED`.

### 4.13. `POST /api/appointments` (AC-APPT-01…05, 11, AC-MAIL-01, 02)

Доступ: auth.

```json
{
  "doctorId": 3,
  "date": "2026-11-27",
  "start": "09:00",
  "end": "10:30",
  "patientName": "Мария Кузнецова",
  "patientPhone": "+30 690 000 0000",
  "comment": "Болит зуб",
  "lang": "ru"
}
```

Порядок проверок и ответы:

1. 401 `UNAUTHORIZED` — guest.
2. 400 `VALIDATION_ERROR` — `doctorId` не целое ≥ 1, `date` или `start`/`end` некорректны (1.4), `end − start < 60` минут (`fields` ⊇ `["end"]`), пустые `patientName`/`patientPhone`, неверные `comment`/`lang` (AC-APPT-03).
3. 403 `FORBIDDEN` — врач записывает не к себе (AC-APPT-02).
4. 404 `NOT_FOUND` — нет пользователя `doctorId` или он не врач.
5. 400 `SLOT_UNAVAILABLE` (AC-APPT-04) — врач деактивирован; день недели не входит в `workDays`; `start < workStart` или `end > workEnd`; начало в прошлом или сейчас (`appointmentDate <= now`).
6. 409 `SLOT_TAKEN` — пересечение с активной записью врача (AC-APPT-05).
7. 201 — запись сохранена: `status: "active"`, `createDate = now`, `creatorId` = id текущего пользователя (AC-APPT-01). Затем врачу отправляется письмо `mail.appointment.*` на языке `lang` (AC-MAIL-01).

Ответ 201 — `Appointment` + поле `mailSent`:

```json
{ "id": 12, "doctorId": 3, "date": "2026-11-27", "start": "09:00", "end": "10:30", "...": "…", "status": "active", "canCancel": true, "mailSent": true }
```

Если письмо отправить не удалось, запись остаётся сохранённой, ответ всё равно 201, `mailSent: false` (AC-MAIL-02).

### 4.14. `POST /api/appointments/:id/cancel` (AC-APPT-08…11)

Доступ: auth. Тело не нужно.

1. 401 `UNAUTHORIZED` — guest.
2. 404 `NOT_FOUND` — записи нет.
3. 403 `FORBIDDEN` — врач отменяет чужую запись (AC-APPT-10).
4. 400 `NOT_CANCELLABLE` — запись уже отменена или `appointmentDate <= now` (AC-APPT-09).
5. 200 `Appointment` со `status: "cancelled"`, `canCancel: false`, `cancelDate = now`, `cancelerId` = текущий пользователь. Слот снова свободен (AC-APPT-08).

### 4.15. Сводка доступа

| Маршрут | guest | doctor | admin | root |
|---|---|---|---|---|
| `GET health` | ✓ | ✓ | ✓ | ✓ |
| `GET clinic` | ✓ | ✓ | ✓ | ✓ |
| `POST auth/magic-link`, `…/verify`, `auth/login`, `auth/logout` | ✓ | ✓ | ✓ | ✓ |
| `GET auth/me` | 401 | ✓ | ✓ | ✓ |
| `GET users` | активные врачи | активные врачи | все врачи | врачи + админы |
| `GET users/:id` | 401 | 403 | врачи | все |
| `POST users` | 401 | 403 | врач | врач, админ |
| `PATCH users/:id` | 401 | 403 | врачи | врачи, админы (не root) |
| `GET doctors/:id/free-windows` | 401 | ✓ | ✓ | ✓ |
| `GET appointments` | 401 | свои | все | все |
| `POST appointments` | 401 | к себе | к любому | к любому |
| `POST appointments/:id/cancel` | 401 | свои будущие | любые будущие | любые будущие |

### 4.16. `GET /api/clinic` (AC-TZ-01)

Доступ: guest. Ответ 200: часовой пояс клиники (`CLINIC_TZ`, по умолчанию `Europe/Athens`). Frontend берёт отсюда «сегодня» для календарей.

```json
{ "timezone": "Europe/Athens" }
```

В теле только `timezone`; другие настройки не отдаются.

## 5. Письма и переводы бэкенда (AC-AUTH-01, AC-MAIL-01, AC-I18N-02)

Шаблоны лежат в `backend/src/i18n/{ru,en,el}.json`. Набор ключей во всех трёх файлах одинаковый (AC-I18N-02). Подстановки — `{{name}}`. Дата `{{date}}` в письме — `DD.MM.YYYY`, время — `HH:mm`.

```json
{
  "mail": {
    "magicLink": { "subject": "…", "text": "…" },
    "appointment": { "subject": "…", "text": "…" }
  }
}
```

| Ключ | ru | en | el |
|---|---|---|---|
| `mail.magicLink.subject` | Вход в систему записи | Sign in to the appointment system | Σύνδεση στο σύστημα ραντεβού |
| `mail.magicLink.text` | Здравствуйте, {{name}}!\n\nЧтобы войти, перейдите по ссылке: {{link}}\n\nСсылка действует 30 минут и может быть использована один раз. | Hello, {{name}}!\n\nTo sign in, follow the link: {{link}}\n\nThe link is valid for 30 minutes and can be used once. | Γεια σας, {{name}}!\n\nΓια να συνδεθείτε, ακολουθήστε τον σύνδεσμο: {{link}}\n\nΟ σύνδεσμος ισχύει για 30 λεπτά και μπορεί να χρησιμοποιηθεί μία φορά. |
| `mail.appointment.subject` | Новая запись на приём | New appointment | Νέο ραντεβού |
| `mail.appointment.text` | На приём записан {{patientName}}, {{date}} {{start}}–{{end}}. Контактный телефон: {{patientPhone}} | A patient has been booked: {{patientName}}, {{date}} {{start}}–{{end}}. Contact phone: {{patientPhone}} | Νέο ραντεβού για τον/την {{patientName}}, {{date}} {{start}}–{{end}}. Τηλέφωνο επικοινωνίας: {{patientPhone}} |

- `{{name}}` — `name` получателя; `{{link}}` — `${APP_URL}/auth/magic?token=<token>`.
- Письмо о записи уходит на `email` врача. Тесты могут извлекать токен регуляркой `/\/auth\/magic\?token=([A-Za-z0-9_-]+)/`.
- Отправитель — `SMTP_FROM`.

## 6. Тестовый хук

### 6.1. `createApp`

Файл `backend/src/app.factory.ts`:

```ts
export interface CreateAppOptions {
  dbPath: string;                          // путь к файлу SQLite (временный в тестах)
  now?: () => Date;                        // часы; по умолчанию () => new Date()
  mail: 'smtp' | 'memory' | 'failing';
  smtp?: Partial<SmtpOptions>;             // host, port, secure, user, pass, from; по умолчанию localhost:1025
  seedDev?: boolean;                       // по умолчанию false
  appUrl?: string;                         // по умолчанию 'http://localhost:3000'
  timezone?: string;                       // по умолчанию 'Europe/Athens'
}

export function createApp(options: CreateAppOptions): Promise<INestApplication>;
```

- Возвращённое приложение уже настроено: глобальный префикс `/api`, `cookie-parser`, единый фильтр ошибок (формат 1.1), миграции и сиды выполнены, вызван `app.init()`. Тесты используют `request(app.getHttpServer())` (supertest), `listen()` не нужен.
- `now` вызывается при каждом обращении к часам — тест может менять возвращаемое значение между запросами (истечение ссылки, сессии, окна rate limit).
- `createApp` не читает `process.env` для опций выше; значения по умолчанию подставляет `resolveOptions` (`app.options.ts`). `backend/src/main.ts` читает env (в том числе `SMTP_*` → `smtp`), вызывает `createApp({ mail: 'smtp', … })` и `app.listen(PORT)`.
- `app.close()` закрывает соединение с БД; после этого тест может снова вызвать `createApp` на том же `dbPath` (AC-DB-01, AC-DB-02, AC-DB-04).

### 6.2. `MailService`

Файл `backend/src/mail/mail.service.ts`, класс `MailService` (получение в тесте: `app.get(MailService)`). `MailService` делегирует отправку `MailTransport` (`mail/mail-transport.ts`: `SmtpTransport`, `MemoryTransport`, `FailingTransport`); реализацию выбирает фабрика в `AppModule` по `options.mail`:

```ts
export interface MailMessage { to: string; subject: string; text: string }

export class MailService {
  outbox: MailMessage[];
  send(message: MailMessage): Promise<void>;
}
```

| Режим `mail` | Поведение `send` |
|---|---|
| `memory` | добавляет письмо в `outbox`, всегда успешно |
| `failing` | всегда отклоняет промис (`Error('SMTP unavailable')`), `outbox` не меняется. Нужен для AC-MAIL-02 |
| `smtp` | отправка через nodemailer с `SMTP_*`; таймаут соединения 5 с. Если SMTP недоступен — промис отклоняется. `outbox` не используется |

При ошибке `send` для письма о записи — `mailSent: false`, запись сохранена (AC-MAIL-02). Для magic link — 503 `MAIL_FAILED`.

## 7. Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | порт HTTP-сервера |
| `DB_PATH` | `./data/clinic.db` | файл SQLite (в Docker `/data/clinic.db`, volume) |
| `APP_URL` | `http://localhost:3000` | база ссылки в письме magic link |
| `CLINIC_TZ` | `Europe/Athens` | часовой пояс клиники |
| `SEED_DEV` | не задан | `true` — создать dev-пользователей (data-model.md, 4.2) |
| `SMTP_HOST` | `localhost` | SMTP-сервер (в dev/e2e — Mailpit) |
| `SMTP_PORT` | `1025` | порт SMTP (Mailpit) |
| `SMTP_USER` | пусто | логин SMTP; пусто — без авторизации |
| `SMTP_PASS` | пусто | пароль SMTP |
| `SMTP_FROM` | `Clinic <noreply@clinic.local>` | адрес отправителя |
