import { useId, type ReactNode } from 'react';

/** Текст ошибки поля (`role="alert"`); `id` нужен, чтобы сослаться на него из `aria-describedby`. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="form-field__error" id={id} role="alert">
      {children}
    </p>
  );
}

interface ControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

interface FormFieldProps {
  label: string;
  /** Текст ошибки; пусто — поле без ошибки. */
  error?: string | null;
  hint?: string;
  /** Контрол получает `id`, `aria-invalid` и `aria-describedby`: `{(props) => <input {...props} />}`. */
  children: (control: ControlProps) => ReactNode;
}

/** Поле формы: label, контрол, подсказка и ошибка со связями для скринридеров. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint && (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
