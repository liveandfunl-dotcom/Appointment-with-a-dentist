import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router';

import { useAuth, type Role } from '../../auth/AuthContext';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { LanguageSelect } from '../LanguageSelect/LanguageSelect';
import './header.css';

interface MenuItem {
  key: string;
  to: string;
  /** Роли, которым виден пункт; `null` в списке — гость. */
  visibleTo: (Role | null)[];
}

const ANY = [null, 'doctor', 'admin', 'root'] as const;
const STAFF: Role[] = ['doctor', 'admin', 'root'];

const MENU: MenuItem[] = [
  { key: 'records', to: '/records', visibleTo: STAFF },
  { key: 'booking', to: '/booking', visibleTo: STAFF },
  { key: 'doctors', to: '/doctors', visibleTo: [...ANY] },
  { key: 'bookingForm', to: '/booking/form', visibleTo: STAFF },
  { key: 'addDoctor', to: '/doctors/new', visibleTo: ['admin', 'root'] },
];

export function Header() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const role = user?.role ?? null;

  const onConfirmLogout = async () => {
    try {
      await logout();
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <header className="header">
      <nav className="header__nav" aria-label={t('header.navLabel')}>
        <ul className="header__list">
          {MENU.filter((item) => item.visibleTo.includes(role)).map((item) => (
            <li key={item.key} className="header__item">
              <NavLink to={item.to} end className="header__link">
                {t(`header.menu.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="header__controls">
        <LanguageSelect />
        {!loading &&
          (user ? (
            <button type="button" className="button button--secondary" onClick={() => setConfirmOpen(true)}>
              {t('header.logout')}
            </button>
          ) : (
            <button type="button" className="button button--primary" onClick={() => navigate('/login')}>
              {t('header.login')}
            </button>
          ))}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t('header.logoutConfirm')}
        onConfirm={onConfirmLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </header>
  );
}
