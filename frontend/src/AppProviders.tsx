import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n as I18n } from 'i18next';

import { AuthProvider } from './auth/AuthContext';
import { ClinicProvider } from './clinic/ClinicContext';

export function AppProviders({ i18n, children }: { i18n: I18n; children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <ClinicProvider>
        <AuthProvider>{children}</AuthProvider>
      </ClinicProvider>
    </I18nextProvider>
  );
}
