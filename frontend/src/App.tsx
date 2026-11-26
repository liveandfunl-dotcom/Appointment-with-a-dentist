import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router';
import type { i18n as I18n } from 'i18next';

import { AppProviders } from './AppProviders';
import { AppRoutes } from './AppRoutes';
import { createI18n } from './i18n/index';

export function App() {
  const [i18n, setI18n] = useState<I18n | null>(null);

  useEffect(() => {
    let cancelled = false;
    createI18n().then((instance) => {
      if (!cancelled) setI18n(instance);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!i18n) return null;
  return (
    <BrowserRouter>
      <AppProviders i18n={i18n}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}

export default App;
