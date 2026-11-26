/**
 * Smoke: приложение рендерится по контракту раздела 9 (AppProviders + AppRoutes в MemoryRouter),
 * шапка видна; корневой и неизвестный маршруты редиректят по разделу 2 спеки.
 */
import { screen, waitFor, within } from '@testing-library/react';

import { renderApp } from './support/render';

test('AC-UI-HEADER-01: smoke — приложение рендерится, видна шапка; гость на / попадает на /doctors', async () => {
  const app = await renderApp('/', { me: 'guest' });

  expect(await screen.findByRole('banner')).toBeInTheDocument();
  expect(await within(screen.getByRole('banner')).findByRole('button', { name: 'Войти' })).toBeInTheDocument();
  await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
  expect(await screen.findByRole('heading', { level: 1, name: 'Карточки врачей' })).toBeInTheDocument();
});

test('AC-UI-HEADER-01: smoke — вошедший пользователь на / попадает на /records', async () => {
  const app = await renderApp('/', { me: 'doctor' });

  expect(await within(await screen.findByRole('banner')).findByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  await waitFor(() => expect(app.location().pathname).toBe('/records'));
});

test('AC-UI-HEADER-01: smoke — неизвестный маршрут ведёт на / (гость → /doctors)', async () => {
  const app = await renderApp('/no-such-page', { me: 'guest' });

  await waitFor(() => expect(app.location().pathname).toBe('/doctors'));
  expect(screen.getByRole('banner')).toBeInTheDocument();
});
