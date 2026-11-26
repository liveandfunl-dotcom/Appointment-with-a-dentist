import type { InputHTMLAttributes } from 'react';

import { FormField } from './FormField';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string | null;
  hint?: string;
};

/** Однострочное поле ввода с подписью, подсказкой и ошибкой. */
export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint}>
      {(control) => <input {...control} {...input} />}
    </FormField>
  );
}
