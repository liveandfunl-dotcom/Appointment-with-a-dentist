import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import './login.css';

type Mode = 'email' | 'password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const ids = useId();
  const errorId = `${ids}-error`;

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const canSubmit =
    !pending && (mode === 'email' ? EMAIL_RE.test(email.trim()) : login !== '' && password !== '');

  function change(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setError(null);
      setSent(false);
    };
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSent(false);
  }

  function errorText(e: unknown, specific: Record<string, string>): string {
    if (e instanceof ApiError) {
      if (specific[e.code]) return specific[e.code];
      if (e.code === 'TOO_MANY_REQUESTS') return t('common.tooManyRequests');
    }
    return t('common.genericError');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setSent(false);
    try {
      if (mode === 'email') {
        await api.post('/api/auth/magic-link', { email: email.trim(), lang: i18n.language });
        setSent(true);
      } else {
        await api.post('/api/auth/login', { login, password });
        await refresh();
        navigate('/records', { replace: true });
      }
    } catch (e) {
      setError(
        mode === 'email'
          ? errorText(e, { USER_NOT_FOUND: t('login.userNotFound'), MAIL_FAILED: t('login.mailFailed') })
          : errorText(e, { INVALID_CREDENTIALS: t('login.invalidCredentials') }),
      );
    } finally {
      setPending(false);
    }
  }

  const invalid = error !== null;
  const describedBy = invalid ? errorId : undefined;
  const errorNode = invalid && (
    <p className="form-field__error" id={errorId} role="alert">
      {error}
    </p>
  );

  return (
    <div className="login">
      <h1>{t('login.title')}</h1>
      <form className="login__form" onSubmit={submit} noValidate>
        {mode === 'email' ? (
          <div className="form-field">
            <label className="form-field__label" htmlFor={`${ids}-email`}>
              {t('login.email')}
            </label>
            <input
              id={`${ids}-email`}
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(e) => change(setEmail)(e.target.value)}
            />
            {errorNode}
          </div>
        ) : (
          <>
            <div className="form-field">
              <label className="form-field__label" htmlFor={`${ids}-login`}>
                {t('login.login')}
              </label>
              <input
                id={`${ids}-login`}
                type="text"
                autoComplete="username"
                value={login}
                onChange={(e) => change(setLogin)(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor={`${ids}-password`}>
                {t('login.password')}
              </label>
              <input
                id={`${ids}-password`}
                type="password"
                autoComplete="current-password"
                value={password}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(e) => change(setPassword)(e.target.value)}
              />
              {errorNode}
            </div>
          </>
        )}
        {sent && (
          <p className="login__status" role="status">
            {t('login.linkSent')}
          </p>
        )}
        <div className="login__actions">
          <button className="button button--primary" type="submit" disabled={!canSubmit}>
            {t('login.submit')}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => switchMode(mode === 'email' ? 'password' : 'email')}
          >
            {mode === 'email' ? t('login.usePassword') : t('login.useEmail')}
          </button>
        </div>
      </form>
    </div>
  );
}
