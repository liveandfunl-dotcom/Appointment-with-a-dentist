/**
 * ConfirmDialog (docs/specs/ui/screens.md, разделы 1.1 и 3.4) — общий попап подтверждения для
 * AC-UI-LOGOUT-01 (выход), AC-UI-REC-04 (отмена записи) и AC-UI-FORM-03 (подтверждение записи).
 *
 * Фон попапа: спека говорит «клик по фону = Нет», но не задаёт элемент фона. Тест считает фоном
 * родительский элемент `role="dialog"` (оверлей, внутри которого лежит окно диалога).
 */
import { act, screen } from '@testing-library/react';

import { ConfirmDialog } from '../../frontend/src/components/ConfirmDialog/ConfirmDialog';
import { deferred } from './support/api-mock';
import { renderWithI18n } from './support/render';

const TITLE = 'Действительно выйти из системы?';

function setup(props: Partial<{ open: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }> = {}) {
  const onConfirm = jest.fn(props.onConfirm ?? (() => undefined));
  const onCancel = jest.fn(props.onCancel ?? (() => undefined));
  return {
    onConfirm,
    onCancel,
    rendered: renderWithI18n(
      <ConfirmDialog open={props.open ?? true} title={TITLE} onConfirm={onConfirm} onCancel={onCancel} />,
    ),
  };
}

describe('ConfirmDialog', () => {
  test('AC-UI-LOGOUT-01 (ConfirmDialog): при open=false ничего не показывается', async () => {
    const { rendered } = setup({ open: false });
    await rendered;
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Да' })).not.toBeInTheDocument();
  });

  test('AC-UI-LOGOUT-01 (ConfirmDialog): role="dialog", aria-modal="true", доступное имя = title, кнопки «Да» и «Нет»', async () => {
    const { rendered } = setup();
    await rendered;

    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(TITLE);

    const yes = screen.getByRole('button', { name: 'Да' });
    const no = screen.getByRole('button', { name: 'Нет' });
    expect(dialog).toContainElement(yes);
    expect(dialog).toContainElement(no);
  });

  test('AC-UI-LOGOUT-01 (ConfirmDialog): «Да» вызывает onConfirm, «Нет» — onCancel', async () => {
    const { rendered, onConfirm, onCancel } = setup();
    const { user } = await rendered;

    await user.click(screen.getByRole('button', { name: 'Нет' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Да' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('AC-UI-LOGOUT-01 (ConfirmDialog): Esc = «Нет»', async () => {
    const { rendered, onConfirm, onCancel } = setup();
    const { user } = await rendered;

    screen.getByRole('button', { name: 'Нет' }).focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('AC-UI-LOGOUT-01 (ConfirmDialog): клик по фону = «Нет», клик внутри окна — нет', async () => {
    const { rendered, onConfirm, onCancel } = setup();
    const { user, container } = await rendered;

    const dialog = screen.getByRole('dialog', { name: TITLE });
    await user.click(screen.getByText(TITLE));
    expect(onCancel).not.toHaveBeenCalled();

    const backdrop = dialog.parentElement!;
    expect(backdrop).not.toBe(document.body);
    expect(backdrop).not.toBe(container);
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('AC-UI-REC-04 (ConfirmDialog): пока выполняется onConfirm, кнопки «Да» и «Нет» заблокированы', async () => {
    const pending = deferred();
    const { rendered, onConfirm, onCancel } = setup({ onConfirm: () => pending.promise });
    const { user } = await rendered;

    await user.click(screen.getByRole('button', { name: 'Да' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Да' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Нет' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Да' }));
    await user.click(screen.getByRole('button', { name: 'Нет' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
    });
  });

  test('AC-UI-FORM-03 (ConfirmDialog): тексты кнопок локализованы (en)', async () => {
    await renderWithI18n(
      <ConfirmDialog open title="Confirm the appointment" onConfirm={jest.fn()} onCancel={jest.fn()} />,
      { lang: 'en' },
    );
    expect(screen.getByRole('dialog', { name: 'Confirm the appointment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });
});
