import { BrowserRouter } from 'react-router';

import { AppProviders } from './AppProviders';
import { AppRoutes } from './AppRoutes';
import { useAsync } from './hooks/useAsync';
import { createI18n } from './i18n/index';

export function App() {
  const i18n = useAsync(() => createI18n(), []);

  if (!i18n.data) return null;
  return (
    <BrowserRouter>
      <AppProviders i18n={i18n.data}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}

export default App;
