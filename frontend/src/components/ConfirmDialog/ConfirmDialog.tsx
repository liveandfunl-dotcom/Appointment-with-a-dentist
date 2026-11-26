import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import './confirm-dialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, pending, onCancel]);

  if (!open) return null;

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !pending) onCancel();
  };

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    // Оверлей: клик по нему = «Нет» (div, а не <dialog>: в jsdom нет showModal).
    <div className="confirm-dialog" onClick={onBackdropClick}>
      <div className="confirm-dialog__window" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="confirm-dialog__title" id={titleId}>
          {title}
        </h2>
        <div className="confirm-dialog__actions">
          <button type="button" className="button button--primary" onClick={confirm} disabled={pending}>
            {t('common.yes')}
          </button>
          <button
            type="button"
            className="button button--secondary"
            ref={cancelRef}
            onClick={onCancel}
            disabled={pending}
          >
            {t('common.no')}
          </button>
        </div>
      </div>
    </div>
  );
}
