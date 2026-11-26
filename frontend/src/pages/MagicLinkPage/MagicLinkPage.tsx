import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './magic-link.css';

type Status = 'pending' | 'expired' | 'invalid' | 'error';

export function MagicLinkPage() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'invalid');
  const started = useRef(false);

  useEffect(() => {
    // Один вызов verify даже при двойном запуске эффекта в StrictMode.
    if (!token || started.current) return;
    started.current = true;
    (async () => {
      try {
        await api.post('/api/auth/magic-link/verify', { token });
        await refresh();
        navigate('/records', { replace: true });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'LINK_EXPIRED') setStatus('expired');
        else if (e instanceof ApiError && e.status >= 400 && e.status < 500) setStatus('invalid');
        else setStatus('error');
      }
    })();
  }, [token, refresh, navigate]);

  if (status === 'pending') {
    return (
      <div className="magic-link">
        <p className="magic-link__message">{t('magic.inProgress')}</p>
      </div>
    );
  }

  const message = {
    expired: t('magic.expired'),
    invalid: t('magic.invalid'),
    error: t('common.genericError'),
  }[status];

  return (
    <div className="magic-link">
      <p className="magic-link__message magic-link__message--error" role="alert">
        {message}
      </p>
      <Link className="magic-link__link" to="/login">
        {t('magic.toLogin')}
      </Link>
    </div>
  );
}
