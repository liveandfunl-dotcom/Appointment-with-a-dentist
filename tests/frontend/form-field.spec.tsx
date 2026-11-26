/** FormField (docs/plans/code-quality.md, AC-REFAC-08). */
import { render, screen } from '@testing-library/react';

import { FormField } from '../../frontend/src/components/FormField/FormField';

describe('FormField', () => {
  test('AC-REFAC-08: label связан с контролом', () => {
    render(<FormField label="Фамилия">{(props) => <input {...props} />}</FormField>);
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument();
  });

  test('AC-REFAC-08: без ошибки нет aria-invalid и aria-describedby', () => {
    render(<FormField label="Фамилия">{(props) => <input {...props} />}</FormField>);
    const input = screen.getByLabelText('Фамилия');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('AC-REFAC-08: при ошибке aria-invalid и ссылка на элемент role="alert"', () => {
    render(
      <FormField label="Фамилия" error="Обязательное поле">
        {(props) => <input {...props} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Фамилия');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Обязательное поле');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Обязательное поле');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  test('AC-REFAC-08: подсказка входит в aria-describedby вместе с ошибкой', () => {
    render(
      <FormField label="Пароль" hint="Оставьте пустым" error="Слишком короткий">
        {(props) => <input {...props} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Пароль')).toHaveAccessibleDescription('Слишком короткий Оставьте пустым');
  });

  test('AC-REFAC-08: подсказка без ошибки описывает контрол', () => {
    render(
      <FormField label="Пароль" hint="Оставьте пустым">
        {(props) => <input {...props} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Пароль')).toHaveAccessibleDescription('Оставьте пустым');
  });

  test('AC-REFAC-08: у двух полей разные id', () => {
    render(
      <>
        <FormField label="A">{(props) => <input {...props} />}</FormField>
        <FormField label="B">{(props) => <input {...props} />}</FormField>
      </>,
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});
