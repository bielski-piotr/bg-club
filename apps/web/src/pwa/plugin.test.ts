import { describe, expect, it } from 'vitest';
import { PUBLIC_SHELL, renderServiceWorker, shellFiles, type ShellChunk } from './plugin';

const chunk = (fileName: string, extra: Partial<ShellChunk> = {}): ShellChunk => ({
  type: 'chunk',
  fileName,
  isEntry: false,
  imports: [],
  ...extra,
});

describe('shellFiles (NFR-3)', () => {
  it('bierze wejście z importami statycznymi i CSS, bez leniwych części i map', () => {
    const files = shellFiles({
      'assets/index.js': chunk('assets/index.js', {
        isEntry: true,
        imports: ['assets/vendor.js'],
        viteMetadata: { importedCss: new Set(['assets/index.css']) },
      }),
      'assets/vendor.js': chunk('assets/vendor.js', { imports: ['assets/index.js'] }),
      'assets/pad.js': chunk('assets/pad.js'),
      'assets/index.js.map': { type: 'asset', fileName: 'assets/index.js.map' },
    });
    expect(files).toEqual(
      [
        '/assets/index.css',
        '/assets/index.js',
        '/assets/vendor.js',
        '/index.html',
        ...PUBLIC_SHELL,
      ].sort(),
    );
  });
});

describe('renderServiceWorker', () => {
  it('podstawia listę i wersję zależną od plików, index.html i szablonu', () => {
    const a = renderServiceWorker('/*sw*/', ['/a.js'], '<html>');
    expect(a.source).toContain('self.__BG_PRECACHE__ = ["/a.js"];');
    expect(a.source).toContain(`self.__BG_VERSION__ = "${a.version}";`);
    expect(a.source.endsWith('/*sw*/')).toBe(true);
    expect(renderServiceWorker('/*sw*/', ['/a.js'], '<html>').version).toBe(a.version);
    expect(renderServiceWorker('/*sw*/', ['/b.js'], '<html>').version).not.toBe(a.version);
    expect(renderServiceWorker('/*sw*/', ['/a.js'], '<html2>').version).not.toBe(a.version);
    expect(renderServiceWorker('/*sw2*/', ['/a.js'], '<html>').version).not.toBe(a.version);
  });
});
