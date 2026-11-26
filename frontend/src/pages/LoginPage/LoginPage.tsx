import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { loginWithPassword, requestMagicLink } from '../../api/auth';
import { apiErrorKey } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import { Message } from '../../components/Message/Message';
import { TextField } from '../../components/FormField/TextField';
import { EMAIL_RE } from '../../utils/validation';
import './login.css';

type Mode = 'email' | 'password';

const EMAIL_ERRORS = { USER_NOT_FOUND: 'login.userNotFound', MAIL_FAILED: 'login.mailFailed' };
const PASSWORD_ERRORS = { INVALID_CREDENTIALS: 'login.invalidCredentials' };

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  /** i18n-ключ ошибки: переводится при рендере, поэтому следует за сменой языка. */
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const canSubmit =
    !pending && (mode === 'email' ? EMAIL_RE.test(email.trim()) : login !== '' && password !== '');

  function resetStatus() {
    setErrorKey(null);
    setSent(false);
  }

  const onInput = (setter: (value: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value);
    resetStatus();
  };

  function switchMode(next: Mode) {
    setMode(next);
    resetStatus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    resetStatus();
    try {
      if (mode === 'email') {
        await requestMagicLink(email.trim(), i18n.language);
        setSent(true);
      } else {
        await loginWithPassword(login, password);
        await refresh();
        navigate('/records', { replace: true });
      }
    } catch (e) {
      setErrorKey(apiErrorKey(e, mode === 'email' ? EMAIL_ERRORS : PASSWORD_ERRORS));
    } finally {
      setPending(false);
    }
  }

  const error = errorKey ? t(errorKey) : null;

  return (
    <div className="login">
      <h1>{t('login.title')}</h1>
      <form className="login__form" onSubmit={submit} noValidate>
        {mode === 'email' ? (
          <TextField
            label={t('login.email')}
            type="email"
            autoComplete="email"
            value={email}
            error={error}
            onChange={onInput(setEmail)}
          />
        ) : (
          <>
            <TextField
              label={t('login.login')}
              type="text"
              autoComplete="username"
              value={login}
              onChange={onInput(setLogin)}
            />
            <TextField
              label={t('login.password')}
              type="password"
              autoComplete="current-password"
              value={password}
              error={error}
              onChange={onInput(setPassword)}
            />
          </>
        )}
        {sent && <Message variant="success" spaced>{t('login.linkSent')}</Message>}
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
