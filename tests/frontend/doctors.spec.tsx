/**
 * Карточки врачей — DoctorsPage (/doctors).
 * docs/specs/ui/screens.md, раздел 5.6; api.md, 2.2, 4.7. AC-UI-CARDS-01…03.
 */
import { screen, waitFor, within } from '@testing-library/react';

import { ok } from './support/api-mock';
import { renderApp, type MeOption } from './support/render';
import { ADMIN_CARD, IVANOV, PAPADOPOULOS, PETROVA, SIDOROV, details, type UserCard } from './support/fixtures';

const ACTIVE_DOCTORS = [IVANOV, PETROVA, PAPADOPOULOS];

async function openDoctors(me: MeOption, users: UserCard[]) {
  const app = await renderApp('/doctors', { me, api: { 'GET /api/users': ok(users) } });
  await screen.findByRole('heading', { level: 1, name: 'Карточки врачей' });
  await screen.findAllByRole('article');
  return app;
}

const cards = () => screen.getAllByRole('article');
const cardOf = (title: string) => {
  const card = cards().find((c) => within(c).queryByRole('heading', { level: 2, name: title }));
  if (!card) throw new Error(`нет карточки «${title}»`);
  return card;
};
const cardTitles = () => cards().map((c) => within(c).getByRole('heading', { level: 2 }).textContent);
const searchField = () => screen.getByLabelText('Поиск');

describe('DoctorsPage — карточки', () => {
  test('AC-UI-CARDS-01: карточки показываются списком, по одной на врача, в порядке ответа API', async () => {
    await openDoctors('guest', ACTIVE_DOCTORS);

    const main = screen.getByRole('main');
    const list = within(main).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(cardTitles()).toEqual(['Иванов Иван', 'Петрова Мария', 'Παπαδόπουλος Νίκος']);
    for (const card of cards()) expect(list).toContainElement(card);
  });

  test('AC-UI-CARDS-01: карточка врача — ФИ, специализация, телефон, email, кабинет, дни приёма, часы приёма', async () => {
    await openDoctors('guest', ACTIVE_DOCTORS);

    const card = cardOf('Иванов Иван');
    for (const text of [
      'Специализация',
      'Терапевт',
      'Телефон',
      '+30 210 000 0001',
      'Email',
      'doctor1@clinic.local',
      'Кабинет',
      '101',
      'Дни приёма',
      'Пн, Вт, Ср, Чт, Пт',
      'Часы приёма',
      '09:00–17:00',
    ]) {
      expect(card).toHaveTextContent(text);
    }
    expect(card).not.toHaveTextContent('Деактивирован');
    expect(card).not.toHaveTextContent('Администратор');
  });

  test('AC-UI-CARDS-01: дни приёма перечисляются через запятую по возрастанию, часы — workStart–workEnd', async () => {
    await openDoctors('guest', ACTIVE_DOCTORS);

    const card = cardOf('Петрова Мария');
    expect(card).toHaveTextContent('Пн, Ср, Пт');
    expect(card).not.toHaveTextContent('Вт');
    expect(card).toHaveTextContent('10:00–18:30');
    expect(card).toHaveTextContent('Хирург');
    expect(card).toHaveTextContent('102');
  });

  test('AC-UI-CARDS-01: тексты карточки переводятся (en)', async () => {
    await renderApp('/doctors', { me: 'guest', lang: 'en', api: { 'GET /api/users': ok([IVANOV]) } });

    const card = await screen.findByRole('article');
    for (const text of ['Specialization', 'Phone', 'Room', 'Working days', 'Mon, Tue, Wed, Thu, Fri', 'Working hours']) {
      expect(card).toHaveTextContent(text);
    }
  });

  test('AC-UI-CARDS-01: гость видит карточки, но не видит иконок редактирования', async () => {
    await openDoctors('guest', ACTIVE_DOCTORS);

    expect(cards()).toHaveLength(3);
    expect(screen.queryAllByRole('link', { name: 'Редактировать' })).toHaveLength(0);
  });
});

describe('DoctorsPage — поиск', () => {
  test('AC-UI-CARDS-02: поле «Поиск» (type=search) над списком карточек, с подсказкой', async () => {
    await openDoctors('guest', ACTIVE_DOCTORS);

    const field = searchField();
    expect(field).toHaveAttribute('type', 'search');
    expect(field).toHaveAttribute('placeholder', 'Фамилия, имя или специализация');
    expect(field).toHaveValue('');
    expect(field.compareDocumentPosition(cards()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cards()).toHaveLength(3);
  });

  const ALL_FOUR = [IVANOV, PETROVA, SIDOROV, PAPADOPOULOS];

  test.each<[string, string, string[]]>([
    ['фамилия', 'иванов', ['Иванов Иван']],
    ['фамилия в верхнем регистре', 'ИВАНОВ', ['Иванов Иван']],
    ['часть фамилии', 'анов', ['Иванов Иван']],
    ['пробелы по краям обрезаются', '  иванов  ', ['Иванов Иван']],
    ['имя', 'мария', ['Петрова Мария']],
    ['имя с буквой ё без учёта регистра', 'ПЁТР', ['Сидоров Пётр']],
    ['специализация', 'терапевт', ['Иванов Иван']],
    ['специализация в верхнем регистре', 'ХИРУРГ', ['Петрова Мария']],
    ['часть специализации', 'стомат', ['Сидоров Пётр']],
    ['«фамилия имя»', 'иванов иван', ['Иванов Иван']],
    ['«имя фамилия»', 'иван иванов', ['Иванов Иван']],
    ['общая часть нескольких фамилий', 'ов', ['Иванов Иван', 'Петрова Мария', 'Сидоров Пётр']],
    ['греческая фамилия', 'παπα', ['Παπαδόπουλος Νίκος']],
    ['греческая фамилия в верхнем регистре', 'ΠΑΠΑΔΌΠΟΥΛΟΣ', ['Παπαδόπουλος Νίκος']],
    ['греческое имя', 'νίκος', ['Παπαδόπουλος Νίκος']],
    ['греческая специализация в верхнем регистре', 'ΟΔΟΝΤΊΑΤΡΟΣ', ['Παπαδόπουλος Νίκος']],
  ])('AC-UI-CARDS-02: поиск — %s («%s») оставляет только подходящие карточки', async (_label, query, expected) => {
    const app = await openDoctors('admin', ALL_FOUR);

    await app.user.type(searchField(), query);

    await waitFor(() => expect(cardTitles()).toEqual(expected));
  });

  test('AC-UI-CARDS-02: фильтрация идёт при каждом вводе, пустой запрос возвращает все карточки', async () => {
    const app = await openDoctors('admin', ALL_FOUR);

    await app.user.type(searchField(), 'и');
    await waitFor(() => expect(cardTitles()).toEqual(['Иванов Иван', 'Петрова Мария', 'Сидоров Пётр']));
    await app.user.type(searchField(), 'ван');
    await waitFor(() => expect(cardTitles()).toEqual(['Иванов Иван']));

    await app.user.clear(searchField());
    await waitFor(() => expect(cards()).toHaveLength(4));
  });

  test('AC-UI-CARDS-02: если ничего не найдено — «Ничего не найдено», карточек нет', async () => {
    const app = await openDoctors('guest', ACTIVE_DOCTORS);

    await app.user.type(searchField(), 'яяяя');

    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    await app.user.clear(searchField());
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
  });
});

describe('DoctorsPage — иконка редактирования и пометки', () => {
  test.each<[MeOption]>([['admin'], ['root']])(
    'AC-UI-CARDS-03: %s — у каждой карточки иконка «Редактировать» (✎) со ссылкой /doctors/:id/edit',
    async (me) => {
      await openDoctors(me, ACTIVE_DOCTORS);

      const links = screen.getAllByRole('link', { name: 'Редактировать' });
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['/doctors/3/edit', '/doctors/4/edit', '/doctors/6/edit']);
      for (const link of links) expect(link).toHaveTextContent('✎');
      for (const card of cards()) expect(within(card).getAllByRole('link', { name: 'Редактировать' })).toHaveLength(1);
      expect(within(cardOf('Иванов Иван')).getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', '/doctors/3/edit');
    },
  );

  test('AC-UI-CARDS-03: врач иконок редактирования не видит', async () => {
    await openDoctors('doctor', ACTIVE_DOCTORS);

    expect(cards()).toHaveLength(3);
    expect(screen.queryAllByRole('link', { name: 'Редактировать' })).toHaveLength(0);
    expect(screen.queryByText('✎')).not.toBeInTheDocument();
  });

  test('AC-UI-CARDS-03: клик по иконке открывает форму редактирования', async () => {
    const app = await renderApp('/doctors', {
      me: 'admin',
      api: { 'GET /api/users': ok(ACTIVE_DOCTORS), 'GET /api/users/:id': ok(details(IVANOV, 'doctor1')) },
    });
    await screen.findAllByRole('article');

    await app.user.click(within(cardOf('Иванов Иван')).getByRole('link', { name: 'Редактировать' }));

    expect(app.location().pathname).toBe('/doctors/3/edit');
    expect(await screen.findByRole('heading', { level: 1, name: 'Редактирование карточки' })).toBeInTheDocument();
  });

  test('AC-UI-CARDS-03: деактивированная карточка помечена («Деактивирован», модификатор), активные — нет', async () => {
    await openDoctors('admin', [IVANOV, SIDOROV]);

    const inactive = cardOf('Сидоров Пётр');
    expect(inactive).toHaveClass('doctor-card--inactive');
    expect(inactive).toHaveTextContent('Деактивирован');
    const active = cardOf('Иванов Иван');
    expect(active).not.toHaveClass('doctor-card--inactive');
    expect(active).not.toHaveTextContent('Деактивирован');
  });

  test('AC-UI-CARDS-03: root видит администраторов — карточка помечена «Администратор», с телефоном и email, без полей врача', async () => {
    await openDoctors('root', [ADMIN_CARD, IVANOV]);

    const card = cardOf('Админова Анна');
    expect(card).toHaveTextContent('Администратор');
    expect(card).toHaveTextContent('+30 210 000 0200');
    expect(card).toHaveTextContent('admin1@clinic.local');
    for (const text of ['Специализация', 'Кабинет', 'Дни приёма', 'Часы приёма']) {
      expect(card).not.toHaveTextContent(text);
    }
    expect(within(card).getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', '/doctors/2/edit');
    expect(cardOf('Иванов Иван')).not.toHaveTextContent('Администратор');
  });
});
