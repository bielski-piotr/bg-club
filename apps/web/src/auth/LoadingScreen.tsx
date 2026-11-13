import { t } from '../i18n';
import { Spinner } from '../ui';
import './LoginScreen.css';

/** Ekran wczytywania sesji i profilu: spinner na środku z etykietą dla czytnika ekranu. */
export function LoadingScreen() {
  return (
    <main className="shell">
      <Spinner size={24} label={t.auth.loading} className="loading-screen__spinner" />
    </main>
  );
}
