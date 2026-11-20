import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import { t } from './i18n';

// Powłoka dokumentu (zamiast index.html). Trafia tylko do prerenderowanego HTML, bez JS klienta.
export default function Document(props: ParentProps) {
  return (
    <html lang="pl">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#F3F4F8" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0F1220" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>{t.app.name}</title>
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
