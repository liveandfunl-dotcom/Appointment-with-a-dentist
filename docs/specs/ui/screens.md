# Экраны и сценарии UI

Спека — контракт для `frontend/src` и для тестов `tests/frontend/*.spec.tsx` (Jest + RTL) и `tests/e2e/*.spec.ts` (Playwright).
Источник: обзор `docs/impl/clinic-mvp.md`. API — `docs/specs/system/api.md`.

Связанные критерии: AC-UI-HEADER-01…04, AC-I18N-01…02, AC-UI-LOGIN-01…05, AC-UI-LOGOUT-01, AC-UI-DP-01, AC-UI-REC-01…04, AC-UI-BOOK-01…05, AC-UI-FORM-01…05, AC-UI-CARDS-01…03, AC-UI-DOC-01…06, AC-STYLE-01…03.

## 1. Общие правила

- SPA, только CSR, React Router. Все запросы — через `frontend/src/api/client.ts` (`fetch`, `credentials: 'include'`). Ошибка API превращается в `ApiError { status, code, fields }` (формат ошибки — api.md, 1.1).
- **AuthContext.** При старте приложения выполняется `GET /api/auth/me`: 200 → пользователь `{ id, surname, name, role }`, 401 → гость. Пока ответа нет, закрытые маршруты показывают `common.loading` и не делают редирект.
- Роль `role`: `guest` (не вошёл), `doctor`, `admin`, `root`.
- **Даты** в интерфейсе — `DD.MM.YYYY`, время — `HH:mm`, интервал — `09:00–10:30` (en dash `–`). «Сегодня» на фронтенде — локальная дата браузера (компьютеры клиники в её часовом поясе).
- **Ошибки без своего текста** (500, сеть, неизвестный `code`) → `common.genericError`. `TOO_MANY_REQUESTS` → `common.tooManyRequests`.

### 1.1. Доступность и селекторы для тестов

- У каждого поля есть `<label htmlFor={id}>`, связанный с `<input|select|textarea id={id}>`; тесты ищут поля через `getByLabelText`. Группы чекбоксов и радиокнопок — `<fieldset>` с `<legend>`.
- Все кнопки — нативные `<button>` (`type="submit"` или `type="button"`). Переходы между страницами — ссылки `<a>` (`Link`/`NavLink`), кроме кнопки «Войти» в шапке.
- Попапы — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` на заголовок (доступное имя диалога = текст вопроса).
- Текст ошибки поля — элемент с `role="alert"` под полем; поле получает `aria-invalid="true"` и `aria-describedby` на этот элемент.
- Сообщения об успехе — `role="status"`.
- Таблица записей — `<table>` с `<caption>`/`<thead>`/`<tbody>`; тесты используют `getByRole('table')`, `getAllByRole('row')`, `within(row)`.
- **`data-testid` не используются**: всё находится по ролям, label и тексту. Если тесту не хватает доступного селектора, исключение сначала добавляется в эту спеку.

## 2. Маршруты

| Путь | Страница (`frontend/src/pages`) | Доступ | Если доступа нет |
|---|---|---|---|
| `/` | — | все | guest → `/doctors`, вошедший → `/records` |
| `/records` | `RecordsPage` | doctor, admin, root | guest → `/login` |
| `/booking` | `BookingPage` | doctor, admin, root | guest → `/login` |
| `/booking/form` | `BookingFormPage` | doctor, admin, root | guest → `/login` |
| `/doctors` | `DoctorsPage` | все | — |
| `/doctors/new` | `DoctorFormPage` (создание) | admin, root | guest → `/login`, doctor → `/doctors` |
| `/doctors/:id/edit` | `DoctorFormPage` (редактирование) | admin, root | guest → `/login`, doctor → `/doctors` |
| `/login` | `LoginPage` | все | вошедший → `/records` |
| `/auth/magic?token=…` | `MagicLinkPage` | все | — |
| любой другой | — | — | редирект на `/` |

Редиректы — с `replace` (AC-UI-HEADER-03, AC-UI-DOC-06).

## 3. Каркас и шапка (AC-UI-HEADER-01, 02, 04, AC-UI-LOGOUT-01, AC-I18N-01)

```
<div class="app">
  <header class="header">            ← role banner
    <nav class="header__nav" aria-label={t('header.navLabel')}> ссылки меню </nav>
    <LanguageSelect/>
    <button>Войти | Выйти</button>
  </header>
  <main class="app__main"> страница </main>
</div>
```

Шапка есть на всех страницах.

### 3.1. Меню

Горизонтальный список ссылок (`NavLink`, активная получает `aria-current="page"`). Порядок и видимость:

| Пункт | Ключ | Путь | guest | doctor | admin, root |
|---|---|---|---|---|---|
| Записи | `header.menu.records` | `/records` | — | ✓ | ✓ |
| Запись на приём | `header.menu.booking` | `/booking` | — | ✓ | ✓ |
| Карточки врачей | `header.menu.doctors` | `/doctors` | ✓ | ✓ | ✓ |
| Добавить врача | `header.menu.addDoctor` | `/doctors/new` | — | — | ✓ |

### 3.2. Выбор языка

- `<select>` с видимо скрытым `<label class="visually-hidden">` (`header.language`). Опции: `RU` (`value="ru"`), `EN` (`value="en"`), `GR` (`value="el"`). Подписи опций — константы, не переводятся.
- По умолчанию `ru`. Выбор сохраняется в `localStorage` под ключом `lang` и восстанавливается при загрузке; неизвестное значение → `ru`. Переключение сразу меняет все тексты; атрибут `<html lang>` = текущий код.
- Текущий язык передаётся как `lang` в `POST /api/auth/magic-link` и `POST /api/appointments`.

### 3.3. Войти / Выйти

- guest: кнопка `header.login` → переход на `/login`.
- Вошедший: кнопка `header.logout` открывает `ConfirmDialog` с вопросом `header.logoutConfirm` и кнопками `common.yes` / `common.no`.
  - «Нет» — диалог закрывается, ничего не происходит.
  - «Да» — `POST /api/auth/logout`, AuthContext → guest, переход на `/doctors`; в шапке видна «Войти».

### 3.4. `ConfirmDialog`

Props: `{ open, title, onConfirm: () => void | Promise<void>, onCancel }`. Разметка — `role="dialog"` с заголовком `title` и двумя кнопками: `common.yes` (подтвердить) и `common.no` (отмена). `Esc` и клик по фону = «Нет». Пока выполняется `onConfirm`, кнопки заблокированы.

Фон — родительский элемент `role="dialog"` (оверлей): клик по нему вызывает `onCancel`, клик внутри диалога — нет. Делается на `div`, не на `<dialog>` (в jsdom нет `showModal`).

## 4. `DatePicker` (AC-UI-DP-01)

Переиспользуемый компонент `frontend/src/components/DatePicker`.

```ts
interface DatePickerProps {
  value: string | null;                       // 'YYYY-MM-DD'
  onChange: (date: string) => void;
  isDateDisabled?: (date: string) => boolean; // true — день недоступен
}
```

- Начальный месяц — месяц `value`, иначе текущий.
- Шапка: кнопка «‹» (`aria-label` = `datePicker.prevMonth`), заголовок `{months.N} {YYYY}` (например «Ноябрь 2026»), кнопка «›» (`aria-label` = `datePicker.nextMonth`). Кнопки листают месяцы без ограничений, в том числе через границу года.
- Строка дней недели — `weekdays.1` … `weekdays.7`, неделя начинается с понедельника.
- Сетка: 7 колонок; ячейки до первого числа и после последнего — пустые (не кнопки). Каждый день месяца — `<button type="button" aria-label="YYYY-MM-DD">D</button>`.
- Недоступный день (`isDateDisabled(date) === true`): атрибуты `disabled` и `aria-disabled="true"`, клик не вызывает `onChange`.
- Выбранный день — `aria-pressed="true"` и модификатор `date-picker__day--selected`; сегодня — `date-picker__day--today`.
- Названия месяцев и дней берутся из i18n и меняются при смене языка.

## 5. Страницы

### 5.1. `/login` — `LoginPage` (AC-UI-LOGIN-01…04)

Заголовок `<h1>` — `login.title`. Два режима.

**Режим email (по умолчанию):**

- Поле `login.email` (`type="email"`).
- Кнопка `login.submit` (`type="submit"`): `disabled`, пока значение после trim не соответствует `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
- Кнопка `login.usePassword` (`type="button"`) → режим логина.
- Отправка → `POST /api/auth/magic-link { email, lang }`:
  - 200 → `role="status"` с текстом `login.linkSent`;
  - 404 `USER_NOT_FOUND` → под полем красный текст `login.userNotFound` (`role="alert"`, цвет `--color-error`);
  - 503 `MAIL_FAILED` → `login.mailFailed`; 429 → `common.tooManyRequests`; прочее → `common.genericError`.
  - Ввод в поле убирает ошибку.

**Режим логина и пароля:**

- Поле email не отображается. Поля `login.login` и `login.password` (`type="password"`) друг под другом.
- Кнопка `login.submit`: `disabled`, пока любое из двух полей пустое.
- Кнопка `login.useEmail` (`type="button"`) → обратно в режим email.
- Отправка → `POST /api/auth/login`:
  - 200 → AuthContext получает `user`, переход на `/records`;
  - 401 `INVALID_CREDENTIALS` → `login.invalidCredentials` (`role="alert"`); 429 → `common.tooManyRequests`; прочее → `common.genericError`.

### 5.2. `/auth/magic?token=…` — `MagicLinkPage` (AC-UI-LOGIN-05)

- При открытии один раз (защита от двойного вызова эффекта в StrictMode через `useRef`) отправляет `POST /api/auth/magic-link/verify { token }` и показывает `magic.inProgress`.
- 200 → AuthContext получает `user`, переход на `/records` (`replace`).
- 401 `LINK_EXPIRED` → `magic.expired` (`role="alert"`) и ссылка `magic.toLogin` на `/login`.
- 401 `LINK_INVALID`, 400 или пустой `token` → `magic.invalid` и та же ссылка.

### 5.3. `/records` — `RecordsPage` (AC-UI-REC-01…04)

Два столбца: `records__aside` (слева) и `records__content` (справа). Заголовок `<h1>` — `records.title`.

**Слева, сверху вниз:**

1. Поле `common.doctor` — `<select>`:
   - admin, root: первая опция `common.all` (`value=""`, выбрана по умолчанию), затем все врачи из `GET /api/users` с `role === 'doctor'` в формате «Фамилия Имя»;
   - doctor: единственная опция — он сам, выбрана.
2. `DatePicker` без `isDateDisabled` (доступны все дни — история и будущее).

**Справа:**

- Дата не выбрана → текст `records.selectDate`.
- Клик по дате или смена врача при выбранной дате → `GET /api/appointments?date=…[&doctorId=…]`.
- Записи есть → `<table class="records-table">`, `<caption>` — выбранная дата `DD.MM.YYYY`. Колонки:

  | Заголовок | Значение |
  |---|---|
  | `records.colTime` | `start–end` |
  | `records.colDoctor` | `doctor.surname doctor.name` |
  | `records.colRoom` | `doctor.room` |
  | `records.colPatient` | `patientName` |
  | `records.colPhone` | `patientPhone` |
  | `records.colActions` | кнопка `records.cancelButton`, если `canCancel`; текст `records.cancelled`, если `status === 'cancelled'`; иначе пусто |

  Строка отменённой записи получает модификатор `records-table__row--cancelled`.
- Записей нет → текст `records.empty`.

**Отмена:** кнопка `records.cancelButton` открывает `ConfirmDialog` с `records.cancelConfirm`. «Да» → `POST /api/appointments/:id/cancel`; при 200 строка заменяется ответом (видна отметка `records.cancelled`, кнопки нет). 400 `NOT_CANCELLABLE` → `records.notCancellable` (`role="alert"`). «Нет» закрывает диалог.

### 5.4. `/booking` — `BookingPage` (AC-UI-BOOK-01…05)

Два столбца: `booking__aside` и `booking__content`. Заголовок `<h1>` — `booking.title`.

**Слева:**

1. Поле `common.doctor` — `<select>` с активными врачами (`role === 'doctor' && isActive`).
   - admin, root: первая опция `booking.selectDoctor` (`value=""`).
   - doctor: выбран он сам, `<select disabled>`.
2. `DatePicker` с `isDateDisabled(date)` = врач не выбран **или** `date` раньше сегодня **или** день недели `date` не входит в `workDays` врача (AC-UI-BOOK-02).

Смена врача сбрасывает выбранную дату и время.

**Справа:**

- Врач или дата не выбраны → правая колонка пуста, а `booking.selectDoctorAndDate` показывается под заголовком страницы (после сообщений об успехе и ошибке), над колонками.
- Врач и дата выбраны → `GET /api/doctors/:id/free-windows?date=…`.
  - `[]` → `booking.noWindows` (AC-UI-BOOK-05).
  - Иначе (AC-UI-BOOK-03):
    - заголовок `booking.windows` и список окон `start–end`;
    - поле `booking.start` — `<select>`: первая опция `—` (`value=""`), затем все отметки с шагом 30 минут, с которых в окне помещается не меньше 60 минут (окно `09:00–11:00` → `09:00`, `09:30`, `10:00`);
    - поле `booking.duration` — `<select>`: 60, 90, … минут до конца окна выбранного начала, подпись `H:mm` (`1:00`, `1:30`, `2:00`). При выборе начала ставится 60. Пока начало не выбрано, поле `disabled`;
    - кнопка `booking.submit`: `disabled`, пока начало не выбрано (AC-UI-BOOK-04).
- Клик «Записать» → `navigate('/booking/form', { state: { doctorId, doctorName: 'Фамилия Имя', date, start, end } })`.

**Сообщение после записи:** если в `location.state` есть `booked: true`, сверху показывается `booking.success` (`role="status"`); если при этом `mailSent === false` — ещё `booking.mailNotSent`.

### 5.5. `/booking/form` — `BookingFormPage` (AC-UI-FORM-01…05)

Заголовок `<h1>` — `bookingForm.title`.

- **Нет слота в `location.state`** (прямой URL, перезагрузка страницы) → `<Navigate to="/booking" replace />`; ни формы, ни подсказки не показывается (AC-UI-FORM-05).
- **Есть слот** (AC-UI-FORM-01):
  - только для чтения (`<input readOnly>`): `bookingForm.doctor` (Фамилия Имя), `bookingForm.date` (`DD.MM.YYYY`), `bookingForm.time` (`start–end`);
  - `bookingForm.patientName` — обязательное;
  - `bookingForm.patientPhone` — обязательное (`type="tel"`);
  - `bookingForm.comment` — `<textarea>`, необязательное;
  - кнопки `bookingForm.submit` (`type="submit"`) и `common.back` (`type="button"`, переход на `/booking`).
- «Записать»: пустые после trim обязательные поля → под каждым `common.requiredField`, диалог не открывается (AC-UI-FORM-02). Иначе `ConfirmDialog` с `bookingForm.confirm` (AC-UI-FORM-03):
  - «Нет» — закрывает диалог;
  - «Да» — `POST /api/appointments { doctorId, date, start, end, patientName, patientPhone, comment, lang }`;
    - 201 → `navigate('/booking', { state: { booked: true, mailSent } })`;
    - 409 `SLOT_TAKEN` → диалог закрывается, на форме `bookingForm.slotTaken` (`role="alert"`), введённые данные сохраняются (AC-UI-FORM-04);
    - 400 `SLOT_UNAVAILABLE` → `bookingForm.slotUnavailable`; прочее → `common.genericError`.

### 5.6. `/doctors` — `DoctorsPage` (AC-UI-CARDS-01…03)

Заголовок `<h1>` — `doctors.title`. Данные — `GET /api/users`.

- **Поиск** над списком: поле `doctors.search` (`type="search"`, placeholder `doctors.searchPlaceholder`). Фильтрация при каждом вводе: запрос после trim, `toLocaleLowerCase()`; карточка подходит, если строка входит в `surname`, `name`, `«surname name»`, `«name surname»` или `specialization` (тоже в нижнем регистре). Работает для латиницы, кириллицы и греческого (AC-UI-CARDS-02). Пустой запрос — все карточки. Ничего не найдено → `doctors.notFound`.
- **Список** `<ul class="doctor-list">`, в каждом `<li>` — `<article class="doctor-card">`:
  - `<h2>` «Фамилия Имя»;
  - для врача: `doctors.specialization`, `doctors.phone`, `doctors.email`, `doctors.room`, `doctors.workDays` (через запятую, `weekdays.N`, например «Пн, Ср, Пт»), `doctors.workHours` (`workStart–workEnd`) — AC-UI-CARDS-01;
  - для админа (видит только root): метка `doctors.roleAdmin`, телефон и email;
  - деактивированный (`isActive === false`): метка `doctors.inactive` и модификатор `doctor-card--inactive` (AC-UI-CARDS-03);
  - admin, root: ссылка-иконка `<a href="/doctors/:id/edit" aria-label={t('doctors.edit')} class="doctor-card__edit">` с символом ✎. Гость и врач иконку не видят.

### 5.7. `/doctors/new`, `/doctors/:id/edit` — `DoctorFormPage` (AC-UI-DOC-01…06)

Заголовок `<h1>`: `doctorForm.titleNew` / `doctorForm.titleEdit`. Форма редактирования заполняется из `GET /api/users/:id`; 404 → `doctorForm.notFound`.

Поля сверху вниз (все с label над полем):

| Поле | Ключ label | Элемент | Когда видно |
|---|---|---|---|
| Роль | `doctorForm.role` (legend) | радио `doctorForm.roleDoctor` / `doctorForm.roleAdmin`, по умолчанию врач | только root; при редактировании `disabled` |
| Фамилия | `doctorForm.surname` | input | всегда |
| Имя | `doctorForm.name` | input | всегда |
| Специализация | `doctorForm.specialization` | input | роль врач |
| Телефон | `doctorForm.phone` | input `type="tel"` | всегда |
| Почта | `doctorForm.email` | input `type="email"` | всегда |
| Кабинет | `doctorForm.room` | input `type="number"`, min 1 | роль врач |
| Приёмные дни | `doctorForm.workDays` (legend) | 7 чекбоксов в ряд, label `weekdays.1`…`weekdays.7` | роль врач |
| Приёмное время | `doctorForm.workTime` (legend) | два `<select>`: `doctorForm.workStart` и `doctorForm.workEnd`, опции `00:00`, `00:30` … `24:00` (49 шт.), по умолчанию `09:00` и `17:00` | роль врач |
| Логин | `doctorForm.login` | input | всегда |
| Пароль | `doctorForm.password` | input `type="password"`; при редактировании подсказка `doctorForm.passwordHint` | всегда |
| Деактивировать | `doctorForm.deactivate` | чекбокс, отмечен = `isActive: false` | только редактирование |

Кнопки: `common.save` (`type="submit"`) и `common.cancel` (`type="button"`, переход на `/doctors` без сохранения).

При роли «Администратор» поля врача не отображаются и не отправляются (AC-UI-DOC-02).

**Проверка перед отправкой** (AC-UI-DOC-03). Ошибки показываются под полями, запрос не отправляется:

| Условие | Текст |
|---|---|
| обязательное поле пустое (фамилия, имя, телефон, почта; для врача ещё специализация, кабинет) | `common.requiredField` |
| email не соответствует `^[^\s@]+@[^\s@]+\.[^\s@]+$` | `doctorForm.invalidEmail` |
| врач без отмеченных дней | `doctorForm.noDays` |
| окончание не позже начала | `doctorForm.endBeforeStart` |
| создание: логин задан, пароль пустой; или пароль короче 8 символов | `doctorForm.passwordTooShort` |
| пароль задан без логина | `doctorForm.loginRequired` |

**Отправка:** создание → `POST /api/users`, редактирование → `PATCH /api/users/:id` (пустой пароль не отправляется — текущий не меняется, AC-UI-DOC-05).

- 201/200 → переход на `/doctors`, новая или изменённая карточка видна (AC-UI-DOC-04).
- 400 `VALIDATION_ERROR` → `common.invalidValue` под каждым полем из `fields`.
- 409 `EMAIL_TAKEN` → `doctorForm.emailTaken` под почтой; `LOGIN_TAKEN` → `doctorForm.loginTaken` под логином.
- 403 → `common.genericError`.

Доступ к странице — раздел 2 (AC-UI-DOC-06).

## 6. Тексты интерфейса (AC-I18N-01, AC-I18N-02)

Файлы `frontend/src/i18n/{ru,en,el}.json`, библиотека `react-i18next`. JSON вложенный, ключ в таблице — путь через точку (`header.menu.records` → `{ "header": { "menu": { "records": … } } }`). Набор ключей во всех трёх файлах одинаковый — тест сравнивает плоские списки ключей. Подстановки — `{{name}}`.

| Ключ | ru | en | el |
|---|---|---|---|
| `common.appTitle` | Запись к стоматологу | Dentist appointments | Ραντεβού στον οδοντίατρο |
| `common.yes` | Да | Yes | Ναι |
| `common.no` | Нет | No | Όχι |
| `common.save` | Сохранить | Save | Αποθήκευση |
| `common.cancel` | Отмена | Cancel | Ακύρωση |
| `common.back` | Назад | Back | Πίσω |
| `common.loading` | Загрузка… | Loading… | Φόρτωση… |
| `common.all` | Все | All | Όλοι |
| `common.doctor` | Врач | Doctor | Γιατρός |
| `common.requiredField` | Обязательное поле | Required field | Υποχρεωτικό πεδίο |
| `common.invalidValue` | Некорректное значение | Invalid value | Μη έγκυρη τιμή |
| `common.genericError` | Произошла ошибка. Попробуйте ещё раз. | Something went wrong. Please try again. | Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά. |
| `common.tooManyRequests` | Слишком много попыток. Попробуйте позже. | Too many attempts. Please try again later. | Πάρα πολλές προσπάθειες. Δοκιμάστε αργότερα. |
| `header.navLabel` | Главное меню | Main menu | Κύριο μενού |
| `header.menu.records` | Записи | Appointments | Ραντεβού |
| `header.menu.booking` | Запись на приём | Book an appointment | Κλείσιμο ραντεβού |
| `header.menu.doctors` | Карточки врачей | Doctors | Κάρτες γιατρών |
| `header.menu.addDoctor` | Добавить врача | Add doctor | Προσθήκη γιατρού |
| `header.language` | Язык | Language | Γλώσσα |
| `header.login` | Войти | Sign in | Σύνδεση |
| `header.logout` | Выйти | Sign out | Αποσύνδεση |
| `header.logoutConfirm` | Действительно выйти из системы? | Do you really want to sign out? | Θέλετε σίγουρα να αποσυνδεθείτε; |
| `login.title` | Вход | Sign in | Σύνδεση |
| `login.email` | Email | Email | Email |
| `login.submit` | Авторизоваться | Log in | Είσοδος |
| `login.usePassword` | Войти по логину и паролю | Sign in with login and password | Είσοδος με όνομα χρήστη και κωδικό |
| `login.useEmail` | Войти по email | Sign in with email | Είσοδος με email |
| `login.login` | Логин | Login | Όνομα χρήστη |
| `login.password` | Пароль | Password | Κωδικός πρόσβασης |
| `login.linkSent` | Ссылка отправлена на почту | The link has been sent to your email | Ο σύνδεσμος στάλθηκε στο email σας |
| `login.userNotFound` | Пользователь с таким email не найден | No user with this email was found | Δεν βρέθηκε χρήστης με αυτό το email |
| `login.invalidCredentials` | Неверный логин или пароль | Invalid login or password | Λάθος όνομα χρήστη ή κωδικός |
| `login.mailFailed` | Не удалось отправить письмо. Попробуйте позже. | Could not send the email. Please try again later. | Δεν ήταν δυνατή η αποστολή του email. Δοκιμάστε αργότερα. |
| `magic.inProgress` | Выполняется вход… | Signing in… | Γίνεται σύνδεση… |
| `magic.expired` | Ссылка устарела. Запросите новую. | The link has expired. Please request a new one. | Ο σύνδεσμος έληξε. Ζητήστε νέο. |
| `magic.invalid` | Ссылка недействительна или уже использована. | The link is invalid or has already been used. | Ο σύνδεσμος δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί. |
| `magic.toLogin` | Перейти ко входу | Go to sign in | Μετάβαση στη σύνδεση |
| `datePicker.prevMonth` | Предыдущий месяц | Previous month | Προηγούμενος μήνας |
| `datePicker.nextMonth` | Следующий месяц | Next month | Επόμενος μήνας |
| `months.1` | Январь | January | Ιανουάριος |
| `months.2` | Февраль | February | Φεβρουάριος |
| `months.3` | Март | March | Μάρτιος |
| `months.4` | Апрель | April | Απρίλιος |
| `months.5` | Май | May | Μάιος |
| `months.6` | Июнь | June | Ιούνιος |
| `months.7` | Июль | July | Ιούλιος |
| `months.8` | Август | August | Αύγουστος |
| `months.9` | Сентябрь | September | Σεπτέμβριος |
| `months.10` | Октябрь | October | Οκτώβριος |
| `months.11` | Ноябрь | November | Νοέμβριος |
| `months.12` | Декабрь | December | Δεκέμβριος |
| `weekdays.1` | Пн | Mon | Δευ |
| `weekdays.2` | Вт | Tue | Τρι |
| `weekdays.3` | Ср | Wed | Τετ |
| `weekdays.4` | Чт | Thu | Πεμ |
| `weekdays.5` | Пт | Fri | Παρ |
| `weekdays.6` | Сб | Sat | Σαβ |
| `weekdays.7` | Вс | Sun | Κυρ |
| `records.title` | Записи | Appointments | Ραντεβού |
| `records.selectDate` | Выберите дату | Select a date | Επιλέξτε ημερομηνία |
| `records.empty` | Записей нет | No appointments | Δεν υπάρχουν ραντεβού |
| `records.colTime` | Время | Time | Ώρα |
| `records.colDoctor` | Врач | Doctor | Γιατρός |
| `records.colRoom` | Кабинет | Room | Αίθουσα |
| `records.colPatient` | Пациент | Patient | Ασθενής |
| `records.colPhone` | Телефон | Phone | Τηλέφωνο |
| `records.colActions` | Действия | Actions | Ενέργειες |
| `records.cancelButton` | Отменить | Cancel | Ακύρωση |
| `records.cancelled` | Отменена | Cancelled | Ακυρώθηκε |
| `records.cancelConfirm` | Отменить запись? | Cancel this appointment? | Ακύρωση αυτού του ραντεβού; |
| `records.notCancellable` | Эту запись уже нельзя отменить | This appointment can no longer be cancelled | Αυτό το ραντεβού δεν μπορεί πλέον να ακυρωθεί |
| `booking.title` | Запись на приём | Book an appointment | Κλείσιμο ραντεβού |
| `booking.selectDoctor` | Выберите врача | Select a doctor | Επιλέξτε γιατρό |
| `booking.selectDoctorAndDate` | Выберите врача и дату | Select a doctor and a date | Επιλέξτε γιατρό και ημερομηνία |
| `booking.windows` | Свободное время | Available time | Διαθέσιμες ώρες |
| `booking.noWindows` | Нет свободного времени | No available time | Δεν υπάρχει διαθέσιμος χρόνος |
| `booking.start` | Время начала | Start time | Ώρα έναρξης |
| `booking.duration` | Длительность | Duration | Διάρκεια |
| `booking.submit` | Записать | Book | Κράτηση |
| `booking.success` | Пациент записан | The patient has been booked | Το ραντεβού καταχωρίστηκε |
| `booking.mailNotSent` | Письмо врачу не отправлено | The email to the doctor was not sent | Το email προς τον γιατρό δεν στάλθηκε |
| `bookingForm.title` | Форма записи | Booking form | Φόρμα ραντεβού |
| `bookingForm.doctor` | Врач | Doctor | Γιατρός |
| `bookingForm.date` | Дата | Date | Ημερομηνία |
| `bookingForm.time` | Время | Time | Ώρα |
| `bookingForm.patientName` | Имя пациента | Patient name | Όνομα ασθενούς |
| `bookingForm.patientPhone` | Телефон | Phone | Τηλέφωνο |
| `bookingForm.comment` | Комментарий | Comment | Σχόλιο |
| `bookingForm.submit` | Записать | Book | Κράτηση |
| `bookingForm.confirm` | Подтвердить запись | Confirm the appointment | Επιβεβαίωση ραντεβού |
| `bookingForm.slotTaken` | Это время уже занято. Выберите другое. | This time is already taken. Please choose another. | Αυτή η ώρα είναι ήδη κρατημένη. Επιλέξτε άλλη. |
| `bookingForm.slotUnavailable` | Это время недоступно для записи. | This time is not available for booking. | Αυτή η ώρα δεν είναι διαθέσιμη για κράτηση. |
| `doctors.title` | Карточки врачей | Doctors | Κάρτες γιατρών |
| `doctors.search` | Поиск | Search | Αναζήτηση |
| `doctors.searchPlaceholder` | Фамилия, имя или специализация | Surname, name or specialization | Επώνυμο, όνομα ή ειδικότητα |
| `doctors.notFound` | Ничего не найдено | Nothing found | Δεν βρέθηκαν αποτελέσματα |
| `doctors.edit` | Редактировать | Edit | Επεξεργασία |
| `doctors.specialization` | Специализация | Specialization | Ειδικότητα |
| `doctors.phone` | Телефон | Phone | Τηλέφωνο |
| `doctors.email` | Email | Email | Email |
| `doctors.room` | Кабинет | Room | Αίθουσα |
| `doctors.workDays` | Дни приёма | Working days | Ημέρες εργασίας |
| `doctors.workHours` | Часы приёма | Working hours | Ώρες εργασίας |
| `doctors.inactive` | Деактивирован | Deactivated | Απενεργοποιημένος |
| `doctors.roleAdmin` | Администратор | Administrator | Διαχειριστής |
| `doctorForm.titleNew` | Добавить врача | Add doctor | Προσθήκη γιατρού |
| `doctorForm.titleEdit` | Редактирование карточки | Edit card | Επεξεργασία κάρτας |
| `doctorForm.role` | Роль | Role | Ρόλος |
| `doctorForm.roleDoctor` | Врач | Doctor | Γιατρός |
| `doctorForm.roleAdmin` | Администратор | Administrator | Διαχειριστής |
| `doctorForm.surname` | Фамилия | Surname | Επώνυμο |
| `doctorForm.name` | Имя | Name | Όνομα |
| `doctorForm.specialization` | Специализация | Specialization | Ειδικότητα |
| `doctorForm.phone` | Телефон | Phone | Τηλέφωνο |
| `doctorForm.email` | Почта | Email | Email |
| `doctorForm.room` | Кабинет | Room | Αίθουσα |
| `doctorForm.workDays` | Приёмные дни | Working days | Ημέρες εργασίας |
| `doctorForm.workTime` | Приёмное время | Working hours | Ώρες εργασίας |
| `doctorForm.workStart` | Начало | Start | Έναρξη |
| `doctorForm.workEnd` | Окончание | End | Λήξη |
| `doctorForm.login` | Логин | Login | Όνομα χρήστη |
| `doctorForm.password` | Пароль | Password | Κωδικός πρόσβασης |
| `doctorForm.passwordHint` | Оставьте пустым, чтобы не менять | Leave empty to keep the current password | Αφήστε κενό για να μην αλλάξει |
| `doctorForm.deactivate` | Деактивировать | Deactivate | Απενεργοποίηση |
| `doctorForm.invalidEmail` | Некорректный email | Invalid email | Μη έγκυρο email |
| `doctorForm.noDays` | Выберите хотя бы один день | Select at least one day | Επιλέξτε τουλάχιστον μία ημέρα |
| `doctorForm.endBeforeStart` | Окончание должно быть позже начала | End must be later than start | Η λήξη πρέπει να είναι μετά την έναρξη |
| `doctorForm.passwordTooShort` | Пароль должен быть не короче 8 символов | The password must be at least 8 characters long | Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες |
| `doctorForm.loginRequired` | Пароль задаётся только вместе с логином | A password can only be set together with a login | Ο κωδικός ορίζεται μόνο μαζί με όνομα χρήστη |
| `doctorForm.emailTaken` | Этот email уже используется | This email is already in use | Αυτό το email χρησιμοποιείται ήδη |
| `doctorForm.loginTaken` | Этот логин уже занят | This login is already taken | Αυτό το όνομα χρήστη χρησιμοποιείται ήδη |
| `doctorForm.notFound` | Пользователь не найден | User not found | Ο χρήστης δεν βρέθηκε |

Подписи языков в селекторе (`RU`, `EN`, `GR`) и символы `‹`, `›`, `✎`, `—` — константы, не ключи i18n.

## 7. Стилистика (AC-STYLE-01, AC-STYLE-02)

### 7.1. Токены — `frontend/src/styles/tokens.css`

```css
:root {
  --color-bg: #FFF7EE;              /* фон страницы, кремовый */
  --color-surface: #FFFDF9;         /* карточки, поля, попапы */
  --color-header: #FCE9D6;          /* шапка, светло-персиковый */
  --color-primary: #F4B183;         /* основная кнопка, персиковый */
  --color-primary-hover: #F7C49F;
  --color-secondary: #FBE3CF;       /* вторичная кнопка */
  --color-secondary-hover: #FDEEDF;
  --color-selected: #F4B183;        /* выбранный день, активный пункт меню */
  --color-disabled-bg: #F3E6DA;
  --color-border: #E6CDB6;
  --color-overlay: rgba(160, 110, 70, 0.25); /* фон под попапом */
  --color-text: #3B2A20;            /* тёмно-коричневый — только текст */
  --color-text-muted: #7A6150;
  --color-text-disabled: #A89484;
  --color-accent: #A4472A;          /* терракотовый — ссылки, акцентный текст, рамка фокуса */
  --color-error: #C62828;           /* текст ошибок */
  --color-success: #2E7D32;         /* текст успеха */

  --radius-field: 6px;
  --radius-card: 10px;
  --space-field: 16px;              /* отступ между полями */
  --space-page: 24px;
  --font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-size: 16px;
}
```

### 7.2. Правила

- Тёмные цвета — только у текста (`color`). Все `background-color` — из светлых токенов: `--color-bg`, `--color-surface`, `--color-header`, `--color-primary`, `--color-primary-hover`, `--color-secondary`, `--color-secondary-hover`, `--color-selected`, `--color-disabled-bg`, `--color-overlay`. Фон никогда не `#fff`.
- `body` — `background-color: var(--color-bg)`. Шапка — `--color-header`. Кнопки — `--color-primary` (основная) / `--color-secondary` (остальные). Поля и попапы — `--color-surface`.
- Поля ввода (`input`, `select`, `textarea`): `border: 1px solid var(--color-border)`, `border-radius: var(--radius-field)`.
- Label над полем (`display: block` у label, поле — следующий блок). Между соседними полями формы — `var(--space-field)` (16px).
- Текст ошибки — `color: var(--color-error)`.

### 7.3. Как проверяется в e2e

- **AC-STYLE-01:** для `body`, `header`, всех видимых `button`, `input`, `select`, `textarea` и `[role="dialog"]` берётся computed `background-color`. Прозрачный фон (alpha = 0) пропускается. Для остальных яркость `0.299·R + 0.587·G + 0.114·B ≥ 170`. Фон `body` ≠ `rgb(255, 255, 255)`, а тёплый: `R > B`.
- **AC-STYLE-02:** для каждого поля внутри `<main>`: computed `border-radius` от 4 до 8px; связанный label находится выше поля (`label.bottom ≤ field.top`); расстояние между соседними полями формы ≥ 12px. Видимо скрытый label селектора языка в шапке под эту проверку не попадает.

## 8. БЭМ (AC-STYLE-03)

- Обычный CSS, по файлу на блок рядом с компонентом (`components/Header/header.css`, `pages/RecordsPage/records.css`, …). Токены — `styles/tokens.css`, сброс и базовые стили элементов (`body`, `h1`, …) — `styles/base.css` без классов.
- Каждое имя класса в `frontend/src/**/*.css` должно соответствовать регулярному выражению:

  ```
  ^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$
  ```

  Блок `block-name`, элемент `block-name__elem-name`, модификатор `block-name--mod` или `block-name__elem--mod`. Элемент элемента (`a__b__c`), camelCase, `_` вместо `__` и утилитарные классы с цифрами в начале не допускаются.
- Jest-тест сканирует все `*.css`, извлекает имена классов из селекторов (`/\.(-?[_a-zA-Z][\w-]*)/g`, игнорируя содержимое строк, комментариев и `url(...)`) и проверяет каждое.
- Модификаторы состояния — классами (`date-picker__day--selected`, `records-table__row--cancelled`, `doctor-card--inactive`), а также псевдоклассами и атрибутами (`:disabled`, `[aria-current="page"]`).

Ориентировочный список блоков: `app`, `header`, `language-select`, `button`, `form-field`, `confirm-dialog`, `date-picker`, `records`, `records-table`, `booking`, `booking-form`, `doctors`, `doctor-list`, `doctor-card`, `doctor-form`, `login`, `magic-link`, `visually-hidden`.

## 9. Контракт модулей для unit-тестов

Unit-тесты (`tests/frontend/*.spec.tsx`) импортируют только модули ниже. Страницы напрямую не импортируются: тест рендерит `AppRoutes` на нужном маршруте.

| Модуль | Экспорт |
|---|---|
| `frontend/src/App.tsx` | `App` — `BrowserRouter` + `AppProviders` + `AppRoutes` (точка входа, используется в `main.tsx`) |
| `frontend/src/AppProviders.tsx` | `AppProviders({ i18n, children })` — `I18nextProvider` + `AuthProvider` |
| `frontend/src/AppRoutes.tsx` | `AppRoutes()` — шапка и `<Routes>` без роутера и провайдеров |
| `frontend/src/i18n/index.ts` | `createI18n(lang?: 'ru' \| 'en' \| 'el'): Promise<i18n>` — новый экземпляр i18next. Язык: аргумент → `localStorage['lang']` → `ru`. При смене языка пишет `localStorage['lang']`. Также `LANGS = ['ru','en','el']`, `LANG_STORAGE_KEY = 'lang'` |
| `frontend/src/i18n/{ru,en,el}.json` | переводы (раздел 6) |
| `frontend/src/auth/AuthContext.tsx` | `AuthProvider`, `useAuth(): { user: Me \| null; loading: boolean; refresh(): Promise<void>; logout(): Promise<void> }` |
| `frontend/src/components/DatePicker/DatePicker.tsx` | `DatePicker` (раздел 4) |
| `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx` | `ConfirmDialog` (раздел 3.4) |

Рендер в тестах:

```tsx
const i18n = await createI18n('ru');
render(
  <MemoryRouter initialEntries={['/records']}>
    <AppProviders i18n={i18n}><AppRoutes /></AppProviders>
  </MemoryRouter>,
);
```

- **Сеть.** Все запросы — `fetch` на относительные пути `/api/...`. Тесты мокают `global.fetch` по методу и пути (без хоста) и возвращают `Response` с JSON.
- **«Сегодня».** Берётся из `new Date()`. Тесты фиксируют дату через `jest.useFakeTimers({ now, doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })` и `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`.
- Слот передаётся из `BookingPage` в `BookingFormPage` через `location.state` вида `{ doctorId, doctorName, date, start, end }`. Тест формы может открыть `/booking/form` с этим state через `initialEntries: [{ pathname: '/booking/form', state }]`.

## 10. Требования к реализации, на которые опираются unit-тесты страниц

- **`noValidate`.** У форм `DoctorFormPage` и `BookingFormPage` атрибут `noValidate`, без нативного `required`: ошибки показываются своими элементами `role="alert"`, а jsdom иначе блокирует отправку невалидного `type="email"`.
- **Дни приёма.** `<fieldset>` с `<legend>` «Приёмные дни» (доступен как `group` с этим именем), семь чекбоксов в порядке Пн…Вс, у каждого доступное имя — сокращение дня (`getByRole('checkbox', { name: 'Пн' })`).
- **Иконка редактирования** на карточке врача — `Link` (навигация внутри SPA) с `href="/doctors/:id/edit"`, текстом `✎` и доступным именем `doctors.edit`.
- **Классы блоков**, на которые ссылаются тесты: `records__aside`, `records__content`, `booking__aside`, `booking__content`, `records-table__row--cancelled`, `doctor-card--inactive`.
- **Список карточек** — единственный `<ul>` внутри `<main>`; карточка — `<article>` внутри `<li>` с заголовком `<h2>`.
- **Тело POST/PATCH `/api/users`.** При создании фронтенд всегда отправляет `role` (`doctor` — когда форму открыл admin или root выбрал врача, `admin` — когда root выбрал администратора). Пустые `login`, `password`, `comment` можно не отправлять или отправлять `""`. При редактировании `isActive: false` уходит, когда чекбокс «Деактивировать» отмечен; пустой пароль не отправляется.
- **Окна для записи** — текст интервала вида `09:00–11:00`; список окон может быть `<ul><li>`.
