/** Message (docs/plans/code-quality.md, AC-REFAC-09). */
import { render, screen } from '@testing-library/react';

import { Message } from '../../frontend/src/components/Message/Message';

describe('Message', () => {
  test('AC-REFAC-09: error → role="alert" и класс message--error', () => {
    render(<Message variant="error">Ошибка</Message>);
    const node = screen.getByRole('alert');
    expect(node).toHaveTextContent('Ошибка');
    expect(node).toHaveClass('message', 'message--error');
  });

  test('AC-REFAC-09: success → role="status" и класс message--success', () => {
    render(<Message variant="success">Готово</Message>);
    expect(screen.getByRole('status')).toHaveClass('message', 'message--success');
  });

  test('AC-REFAC-09: muted → без роли и класс message--muted', () => {
    render(<Message variant="muted">Пусто</Message>);
    const node = screen.getByText('Пусто');
    expect(node).toHaveClass('message', 'message--muted');
    expect(node).not.toHaveAttribute('role');
  });
});
