# Каркас интерфейса: шапка, меню, i18n, DatePicker, стили

Общая часть frontend, на которой стоят все страницы: шапка с меню и выбором языка, маршрутизация и закрытые маршруты, локализация RU/EN/GR, общие компоненты (`DatePicker`, `ConfirmDialog`), токены стилей и БЭМ.

Статус: реализовано, 2026-11-26. Обзор MVP — [clinic-mvp.md](clinic-mvp.md).

## Что реализовано

- **Каркас**: React 19 + Vite, только CSR. `main.tsx` подключает глобальные стили, `App` создаёт экземпляр i18next и оборачивает приложение в `BrowserRouter` и `AppProviders` (i18n и `AuthProvider`). Vite проксирует `/api` на backend (`BACKEND_URL`, по умолчанию `http://localhost:3000`).
- **Шапка** (`Header`) на всех страницах: горизонтальное меню, выбор языка, кнопка «Войти» или «Выйти».
- **Меню по ролям**: гость — «Карточки врачей»; врач — «Записи», «Запись на приём», «Карточки врачей»; admin и root дополнительно «Добавить врача».
- **Маршруты** (`AppRoutes.tsx`): `/` ведёт вошедшего на `/records`, гостя на `/doctors`; закрытые страницы через `Guard` (гость уходит на `/login`, пользователь с неподходящей ролью на `/doctors`); неизвестный путь ведёт на `/`.
- **i18n**: `react-i18next`, языки `ru` (по умолчанию), `en`, `el` (в селекторе подписи RU, EN, GR). Переводы — `frontend/src/i18n/{ru,en,el}.json`, на backend отдельные `backend/src/i18n/{ru,en,el}.json` (только тексты писем).
- **`DatePicker`** — общий календарь месяца, используется в «Записях» и «Записи на приём».
- **`ConfirmDialog`** — попап «Да» / «Нет» для выхода, отмены записи и подтверждения записи.
- **Стили**: обычный CSS по БЭМ, по файлу на блок рядом с компонентом, токены в `styles/tokens.css`.

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `frontend/src/main.tsx`, `App.tsx`, `AppProviders.tsx`, `AppRoutes.tsx` | запуск, провайдеры, маршруты и `Guard` |
| `frontend/src/components/Header/`, `LanguageSelect/` | шапка, меню, выбор языка |
| `frontend/src/components/DatePicker/` | календарь |
| `frontend/src/components/ConfirmDialog/` | попап подтверждения |
| `frontend/src/i18n/index.ts`, `{ru,en,el}.json` | инициализация i18next и переводы |
| `frontend/src/api/client.ts` | `fetch` с `credentials: 'include'`, ошибки `ApiError {status, code, fields}`, `status: 0` — сетевой сбой |
| `frontend/src/styles/` | `tokens.css`, `base.css`, `button.css`, `form-field.css`, `visually-hidden.css` |
| `frontend/src/app.css`, `components/*/*.css`, `pages/*/*.css` | стили блоков |

## Поведение и решения сверх описания

- **Язык.** Порядок выбора: сохранённый в `localStorage['lang']` → `ru`. Выбор сохраняется при смене; `document.documentElement.lang` обновляется. Недоступный `localStorage` обрабатывается без ошибок (язык просто не сохраняется). Язык запроса `lang` для писем берётся из выбранного языка интерфейса. Названия месяцев и дней недели локализованы ключами `months.*` и `weekdays.*`.
- **Подписи языков** (RU, EN, GR) — константы, не переводятся; label селектора скрыт визуально (`visually-hidden`), но доступен для скринридеров.
- **Меню**: активный пункт подсвечивается `NavLink` (`aria-current="page"`), совпадение точное (`end`). Кнопка «Войти / Выйти» не показывается, пока `GET /api/auth/me` не ответил, чтобы не мигать.
- **`DatePicker`**: сетка месяца с неделей с понедельника, стрелки «‹» и «›» листают месяцы, выбранный день и сегодняшний помечены. Пропсы: `value` (`YYYY-MM-DD` или `null`), `onChange`, `isDateDisabled(date)`; недоступные дни — отключённые кнопки (`aria-disabled`). Каждая кнопка дня имеет `aria-label` с датой ISO (на это опираются тесты). Начальный месяц — месяц `value` или текущий.
- **`ConfirmDialog`**: `role="dialog"`, `aria-modal`, фокус на «Нет», закрытие по Escape и клику по фону, во время выполнения `onConfirm` кнопки заблокированы. Реализован на `div`, а не `<dialog>`, потому что в jsdom нет `showModal`.
- **Токены** (`styles/tokens.css`): тёплая палитра (фон `#FFF7EE`, шапка `#FCE9D6`, основной цвет `#F4B183`, акцент `#A4472A`), тёмные цвета только у текста (`#3B2A20`), поля со скруглением 6px (`--radius-field`), отступ между полями 16px (`--space-field`), label над полем. Фон страницы, шапки, кнопок, полей и попапов не `#fff`.
- **БЭМ**: имя класса — `block`, `block__element`, `block--modifier` или `block__element--modifier` в kebab-case; регулярное выражение — в [screens.md](../specs/ui/screens.md), раздел 8. Состояния дополнительно выражаются псевдоклассами и атрибутами (`:disabled`, `[aria-current="page"]`).
- **Доступность**: сообщения об ошибках — `role="alert"` и `aria-describedby`/`aria-invalid` у поля; на это опираются селекторы тестов (раздел 1.1 спеки UI).

## Критерии приёмки

Unit: `tests/frontend/`. E2E: `tests/e2e/navigation.e2e.spec.ts`, `tests/e2e/style.e2e.spec.ts` (Playwright). Ключи бэкенда: `tests/api/i18n-backend.spec.ts`.

| AC-ID | Что проверяется | Тесты |
|-------|-----------------|-------|
| AC-UI-HEADER-01 | на всех страницах есть шапка: меню, выбор языка, «Войти» или «Выйти» | `tests/frontend/header.spec.tsx`, `tests/frontend/smoke.spec.tsx`, `tests/e2e/navigation.e2e.spec.ts` |
| AC-UI-HEADER-02 | пункты меню по ролям (врач: «Записи», «Запись на приём», «Карточки врачей»; admin и root ещё «Добавить врача») | `tests/frontend/header.spec.tsx`, `tests/e2e/navigation.e2e.spec.ts` |
| AC-UI-HEADER-04 | в меню ни у одной роли нет пункта «Форма записи» и ссылки на `/booking/form` | `tests/frontend/header.spec.tsx`, `tests/e2e/navigation.e2e.spec.ts` |
| AC-UI-HEADER-03 | гость на закрытой странице попадает на `/login` | `tests/frontend/header.spec.tsx`, `tests/e2e/navigation.e2e.spec.ts` |
| AC-I18N-01 | переключение RU/EN/GR меняет все тексты, выбор сохраняется, по умолчанию RU | `tests/frontend/i18n.spec.tsx`, `tests/frontend/i18n-keys.spec.tsx`, `tests/e2e/navigation.e2e.spec.ts` |
| AC-I18N-02 | во всех трёх json одинаковый набор ключей (frontend и backend) | `tests/frontend/i18n.spec.tsx`, `tests/frontend/i18n-keys.spec.tsx`, `tests/api/i18n-backend.spec.ts` |
| AC-UI-DP-01 | сетка месяца, листание, выбор даты, `isDateDisabled`, неделя с понедельника, локализация | `tests/frontend/datepicker.spec.tsx` |
| AC-STYLE-01 | палитра тёплая, фоны светлые (яркость computed style) | `tests/e2e/style.e2e.spec.ts` (гость и вошедший, все страницы и попап) |
| AC-STYLE-02 | скругление полей 4–8px, label над полем, отступ между полями не меньше 12px | `tests/e2e/style.e2e.spec.ts` (вход, карточки, формы врача и записи) |
| AC-STYLE-03 | имена CSS-классов соответствуют БЭМ | `tests/frontend/bem.spec.tsx` (сканирует `frontend/src/**/*.css`) |

Критерии AC-UI-LOGOUT-01 (попап выхода) и поведение `ConfirmDialog` в сценариях отмены и записи описаны в [auth.md](auth.md) и [appointments.md](appointments.md); компонент проверен в `tests/frontend/confirm-dialog.spec.tsx`.

## Спеки

- [docs/specs/ui/screens.md](../specs/ui/screens.md) — разделы 2 (маршруты), 3 (шапка), 4 (`DatePicker`), 6 (тексты интерфейса), 7 (стилистика), 8 (БЭМ), 9–10 (контракт модулей для unit-тестов).

## Ограничения

- Языки только `ru`, `en`, `el`; добавление языка требует нового json на frontend и backend (тест AC-I18N-02 следит за совпадением ключей).
- `<title>` страницы и `<html lang>` синхронизируются в `createI18n` (ключ `common.appTitle`); статичный `<title>` в `frontend/index.html` (ru) нужен только до загрузки скриптов.
- Названия месяцев и дней недели — из json, а не из `Intl`; `DatePicker` считает «сегодня» и неделю по часам браузера.
- Медиа-запросов в CSS нет: вёрстка под узкие экраны отдельно не дорабатывалась (сервис рассчитан на рабочие места клиники).
- Тёмной темы нет: палитра фиксированная светлая.
