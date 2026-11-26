import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';

import { useAuth, type Role } from './auth/AuthContext';
import { Header } from './components/Header/Header';
import { BookingFormPage } from './pages/BookingFormPage/BookingFormPage';
import { BookingPage } from './pages/BookingPage/BookingPage';
import { DoctorFormPage } from './pages/DoctorFormPage/DoctorFormPage';
import { DoctorsPage } from './pages/DoctorsPage/DoctorsPage';
import { LoginPage } from './pages/LoginPage/LoginPage';
import { MagicLinkPage } from './pages/MagicLinkPage/MagicLinkPage';
import { RecordsPage } from './pages/RecordsPage/RecordsPage';
import './app.css';

const STAFF: Role[] = ['doctor', 'admin', 'root'];
const ADMINS: Role[] = ['admin', 'root'];

function Loading() {
  const { t } = useTranslation();
  return <p className="app__loading">{t('common.loading')}</p>;
}

/** Закрытый маршрут: пока /api/auth/me не ответил — «Загрузка…» без редиректа. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/doctors" replace />;
  return children;
}

/** `/` — вошедший → /records, гость → /doctors. */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Navigate to={user ? '/records' : '/doctors'} replace />;
}

/** `/login` — вошедший уходит на /records. */
function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/records" replace />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/records" element={<Guard roles={STAFF}><RecordsPage /></Guard>} />
          <Route path="/booking" element={<Guard roles={STAFF}><BookingPage /></Guard>} />
          <Route path="/booking/form" element={<Guard roles={STAFF}><BookingFormPage /></Guard>} />
          <Route path="/doctors" element={<DoctorsPage />} />
          <Route path="/doctors/new" element={<Guard roles={ADMINS}><DoctorFormPage /></Guard>} />
          <Route path="/doctors/:id/edit" element={<Guard roles={ADMINS}><DoctorFormPage /></Guard>} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/auth/magic" element={<MagicLinkPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
