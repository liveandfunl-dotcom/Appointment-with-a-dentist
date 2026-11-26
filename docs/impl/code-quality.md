# Рефакторинг по итогам код-ревью (SOLID / DRY / KISS)

Рефакторинг backend и frontend без изменения контракта HTTP API, схемы БД, текстов и внешнего вида интерфейса. Попутно исправлен дефект: сообщения об ошибках сервера не меняли язык при переключении языка, а страница «Записи» при смене языка заново запрашивала данные.

Статус: реализовано 2026-11-26. Результаты: API-тесты 260/260, unit-тесты frontend 293/293, `npm run lint`, `tsc --noEmit` и `npm run build` без ошибок. e2e: 53 из 53 (бывшее падение AC-I18N-01 исправлено: из греческой строки теста убран пункт меню «Форма записи», которого нет в приложении).

## Критерии приёмки

| AC-ID | Что проверяет | Тест |
|-------|---------------|------|
| AC-REFAC-01 | все прежние тесты проходят без изменений | `tests/api`, `tests/frontend`, `tests/e2e` |
| AC-REFAC-02 | сообщение об ошибке меняет язык вместе с интерфейсом («Записи», «Форма записи», вход, форма врача) | `tests/frontend/error-language.spec.tsx` |
| AC-REFAC-03 | смена языка не перезапрашивает данные «Записей» | `tests/frontend/error-language.spec.tsx` |
| AC-REFAC-04 | `computeFreeWindows` — чистый алгоритм свободных окон | `tests/api/free-windows.spec.ts` |
| AC-REFAC-05 | `startMarks` и `durationsFor` — метки начала и длительности | `tests/frontend/booking-slots.spec.tsx` |
| AC-REFAC-06 | `apiErrorKey` — код ошибки → i18n-ключ | `tests/frontend/api-errors.spec.tsx` |
| AC-REFAC-07 | `useAsync` — загрузка, ошибка, отбрасывание устаревших ответов | `tests/frontend/use-async.spec.tsx` |
| AC-REFAC-08 | `FormField` — связь label, ошибки и подсказки с контролом | `tests/frontend/form-field.spec.tsx` |
| AC-REFAC-09 | `Message` — роль и класс по варианту | `tests/frontend/message.spec.tsx` |
| AC-REFAC-10 | структура backend: нет дублей и нарушений границ модулей | `tests/api/structure.spec.ts` |
| AC-REFAC-11 | структура frontend: страницы не ходят в API напрямую, нет дублей утилит | `tests/frontend/structure.spec.tsx` |

Структурные тесты (AC-REFAC-10, 11) читают исходники и ловят возврат дублей: например, второй `parseId`, `BEGIN IMMEDIATE` вне `db/transaction.ts` или `api.get` внутри страницы.

## Backend

| Что | Где | Зачем |
|-----|-----|-------|
| Общие парсеры `parseId`, `isPositiveInt`, `nullableNumber`, `boundedText` | `common/validation.ts` | раньше `parseId` жил в `users.service.ts`, а его импортировал модуль appointments |
| `toUnixSec` | `common/time.ts` | единый перевод `Date` → unix-секунды (`Clock`, миграции, сиды) |
| `inTransaction`, `DbService.transaction/get/all/run` | `db/transaction.ts`, `db/db.service.ts` | один `BEGIN IMMEDIATE / COMMIT / ROLLBACK` для миграций и записей; типизированные запросы вместо `as unknown as Row` и россыпи `Number()` |
| `parseWorkDays`, `serializeWorkDays` | `users/work-days.ts` | формат `"1,3,5"` разбирался в трёх местах |
| `insertUser` | `users/insert-user.ts` | единственная вставка в `Users` (сиды и `UsersService.create`) |
| `parseNewAppointment`, `parseAppointmentsQuery`, `parseDateParam` | `appointments/appointment-fields.ts` | разбор входа вынесен из сервиса в контроллер, сервис получает типизированный ввод |
| `computeFreeWindows` | `appointments/free-windows.ts` | алгоритм окон — чистая функция без БД; сервис только выбирает занятое время |
| `MailTransport` + `SmtpTransport`, `MemoryTransport`, `FailingTransport` | `mail/mail-transport.ts` | Strategy: режим почты выбирается фабрикой в `AppModule`, `MailService` не содержит `switch` |
| `ResolvedAppOptions`, `resolveOptions`, `DEFAULT_*` | `app.options.ts` | значения по умолчанию заданы в одном месте, сервисы получают готовые опции без `?? '…'` |
| SMTP-настройки через `AppOptions.smtp` | `main.ts` → `createApp` | `process.env` читается только в `main.ts` (и `NODE_ENV` в `app.factory.ts`) |
| `UPDATABLE_COLUMNS` | `users/users.service.ts` | динамический `UPDATE` падает на колонке вне белого списка |

Решения:
- Разбор тела `users` остаётся в сервисе: по api.md сначала проверяется роль цели (403), потом тело (400), а это зависит от данных БД.
- Cookie сессии сначала оставалась строкой (с неверным обоснованием «`res.cookie()` добавляет `Expires`, чего требуют тесты» — тесты `Expires` не запрещают); позже переведена на `res.cookie()`, см. [review-leftovers.md](review-leftovers.md).
- `runMigrations(db, migrations, now)` сохранил сигнатуру (на неё опирается AC-DB-04), поэтому транзакция вынесена в отдельный модуль, а не передаётся параметром.
- `MailService.outbox` и `MailMessage` остались на прежнем месте: на них опираются API-тесты.

## Frontend

| Что | Где | Зачем |
|-----|-----|-------|
| Типы ответов `Me`, `UserCard`, `UserDetails`, `Appointment`, `FreeWindow` | `api/types.ts` | раньше объявлялись на четырёх страницах по-разному |
| Функции `getMe`, `listUsers`, `listAppointments`, `createAppointment`, … | `api/auth.ts`, `api/users.ts`, `api/appointments.ts` | страницы не знают URL и форму запроса |
| `apiErrorKey` | `api/errors.ts` | общий перевод кода ошибки в i18n-ключ |
| `useAsync(fn, deps)` | `hooks/useAsync.ts` | заменил 8 копий `useEffect + cancelled`; `fn = null` — запрос не нужен; `setData` — локальное обновление |
| `FormField`, `FieldError`, `TextField` | `components/FormField/` | label, контрол, подсказка и ошибка со связями `aria-*` |
| `Message` (`error`, `success`, `muted`) | `components/Message/` | вместо пяти одинаковых классов ошибок и подсказок на страницах |
| `utils/date.ts`, `utils/time.ts`, `utils/validation.ts`, `utils/person.ts` | `utils/` | `pad`, `todayIso`, `formatDate`, `weekdayOf`, `toMinutes`, `toTime`, `TIME_MARKS`, `EMAIL_RE`, `fullName` |
| `STAFF`, `ADMINS`, `canManageUsers` | `auth/roles.ts` | список ролей объявлялся в `AppRoutes` и `Header` |
| `startMarks`, `durationsFor`, `WindowsPanel` | `pages/BookingPage/` | расчёт слотов — чистые функции, выбор времени — подкомпонент |
| `initialValues`, `validate`, `buildBody`, `serverErrors` | `pages/DoctorFormPage/doctor-form.model.ts` | логика формы вне компонента; `Errors` типизирован ключами формы |
| `Guard` как layout-маршрут с `<Outlet />` | `AppRoutes.tsx` | один `Guard` на группу маршрутов |

Решения:
- В state хранится i18n-ключ ошибки, а не переведённая строка; перевод выполняется при рендере. Так исправлен дефект со сменой языка. Так же устроены ошибки валидации формы врача.
- `useAsync` не использует `setState` в эффекте синхронно (правило `react-hooks/set-state-in-effect`): актуальность ответа определяется токеном, который меняется вместе с `deps`. Два `eslint-disable` в хуке объяснены комментарием: список зависимостей приходит от вызывающего.
- Контроллы `FormField` получают `id`, `aria-invalid`, `aria-describedby` через render-prop; `id` теперь из `useId`, а не фиксированные `doctor-form-*` / `booking-*` (тесты ищут поля по подписям).
- Удалены неиспользуемые классы `.booking__hint`, `.doctors__empty`, `.doctors__error`, `.records__hint`, `.records__error`, `.doctor-form__error`, `.doctor-form__status`, `.login__status`. Сообщения оформлены классом `.message` с теми же токенами цвета; нижний отступ `--space-field` включается признаком `spaced` (модификатор `.message--spaced`) только там, где он был раньше: ошибка на «Записях», общая ошибка формы врача, подсказка на «Запись на приём», «Ссылка отправлена» на входе.

## Известные ограничения


## Спеки и связанные документы

- [api.md](../specs/system/api.md) — раздел 6: `createApp`, `MailService` и транспорты.
- [clinic-mvp.md](clinic-mvp.md) — раздел «Архитектура кратко».
