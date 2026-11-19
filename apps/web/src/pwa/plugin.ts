import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Pliki z `public/` należące do powłoki (manifest i ikony). */
export const PUBLIC_SHELL = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
] as const;

/** Fragment wyniku bundla, którego potrzebuje lista powłoki. */
export interface ShellChunk {
  readonly type: 'chunk';
  readonly fileName: string;
  readonly isEntry: boolean;
  readonly imports: readonly string[];
  readonly viteMetadata?: { readonly importedCss: ReadonlySet<string> } | undefined;
}

export interface ShellAsset {
  readonly type: 'asset';
  readonly fileName: string;
}

/**
 * Pliki powłoki do wstępnego cache: strona `/` (hosting przekierowuje `/index.html` na `/`),
 * wejście aplikacji z importami statycznymi i ich CSS.
 * Leniwe części (notes, edytor notesu) i fonty trafiają do cache przy pierwszym użyciu.
 */
export function shellFiles(bundle: Readonly<Record<string, ShellChunk | ShellAsset>>): string[] {
  const files = new Set<string>(['/', ...PUBLIC_SHELL]);
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const chunk = bundle[name];
    if (chunk?.type !== 'chunk') return;
    files.add(`/${chunk.fileName}`);
    for (const css of chunk.viteMetadata?.importedCss ?? []) files.add(`/${css}`);
    for (const dep of chunk.imports) visit(dep);
  };
  for (const [name, item] of Object.entries(bundle)) {
    if (item.type === 'chunk' && item.isEntry) visit(name);
  }
  return [...files].sort();
}

/** Treść `sw.js`: szablon z wersją i listą powłoki. */
export function renderServiceWorker(template: string, files: readonly string[], seed: string) {
  const version = createHash('sha256')
    .update(seed)
    .update(template)
    .update(files.join('\n'))
    .digest('hex')
    .slice(0, 12);
  const header =
    `self.__BG_VERSION__ = ${JSON.stringify(version)};\n` +
    `self.__BG_PRECACHE__ = ${JSON.stringify(files)};\n`;
  return { version, source: header + template };
}

/**
 * Generuje `dist/sw.js` przy buildzie. Wersja zależy od listy plików (nazwy
 * z hashem treści), treści `index.html`, manifestu i ikon oraz szablonu workera, więc każde
 * wdrożenie ze zmianą daje nową wersję.
 */
export function pwaPlugin(templatePath: string): Plugin {
  let publicDir = '';
  return {
    name: 'bg-club-pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files = shellFiles(bundle as unknown as Record<string, ShellChunk | ShellAsset>);
      const html = bundle['index.html'];
      if (html?.type !== 'asset') throw new Error('pwa: brak index.html');
      // Pliki z `public/` nie mają hasha w nazwie: wersja zależy też od ich treści.
      const seed = createHash('sha256').update(String(html.source));
      for (const path of PUBLIC_SHELL) seed.update(readFileSync(join(publicDir, path)));
      const { source } = renderServiceWorker(
        readFileSync(templatePath, 'utf8'),
        files,
        seed.digest('hex'),
      );
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
