import type { ReactNode } from 'react';

import './message.css';

type Variant = 'error' | 'success' | 'muted';

const ROLES: Record<Variant, 'alert' | 'status' | undefined> = {
  error: 'alert',
  success: 'status',
  muted: undefined,
};

interface MessageProps {
  variant: Variant;
  /** Отступ снизу, если за сообщением идёт другой блок (по умолчанию отступов нет). */
  spaced?: boolean;
  children: ReactNode;
}

/** Сообщение на странице: ошибка (`alert`), успех (`status`) или нейтральный текст. */
export function Message({ variant, spaced, children }: MessageProps) {
  return (
    <p className={`message message--${variant}${spaced ? ' message--spaced' : ''}`} role={ROLES[variant]}>
      {children}
    </p>
  );
}
