/** @jsxImportSource @solidjs/web */
import type { JSX } from '@solidjs/web';
import {
  AuthContext,
  PopupLevelContext,
  PopupsContext,
  QueryClientContext,
  ToastContext,
  type IslandHost,
} from './context';

/*
 * Pole `undefined` daje dostawcę bez wartości, który Solid traktuje jak jego brak
 * (`ContextNotFoundError` przy `useContext`), stąd rzutowania na typ kontekstu.
 */
type Provided<K extends keyof IslandHost> = NonNullable<IslandHost[K]>;

/**
 * Konteksty Solid z wartości hosta (`SolidIsland`, `renderSolid` w testach). Dostawca czyta
 * wartość raz, więc `providers` to stałe obiekty; reaktywne są ich pola (`mountIsland`).
 */
export function Bridge(props: { readonly providers: IslandHost; readonly children: JSX.Element }) {
  return (
    <QueryClientContext value={props.providers.queryClient as Provided<'queryClient'>}>
      <AuthContext value={props.providers.auth as Provided<'auth'>}>
        <PopupsContext value={props.providers.popups as Provided<'popups'>}>
          <PopupLevelContext value={props.providers.popupLevel as Provided<'popupLevel'>}>
            <ToastContext value={props.providers.toast as Provided<'toast'>}>
              {props.children}
            </ToastContext>
          </PopupLevelContext>
        </PopupsContext>
      </AuthContext>
    </QueryClientContext>
  );
}
