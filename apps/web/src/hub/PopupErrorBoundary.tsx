import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import { Banner, Button } from '../ui';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly failed: boolean;
}

/**
 * Granica błędu popupów huba. Bez niej błąd wczytania leniwego fragmentu (np. stary pakiet po
 * wdrożeniu, gdy przeładowanie nie pomogło) odmontowuje całą aplikację i zostaje biały ekran.
 * Hub zostaje widoczny, a nad nim komunikat z przeładowaniem strony.
 */
export class PopupErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="hub__popup-loading hub__popup-error">
        <Banner
          variant="error"
          action={
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              {t.hub.reload}
            </Button>
          }
        >
          {t.hub.popupError}
        </Banner>
      </div>
    );
  }
}
