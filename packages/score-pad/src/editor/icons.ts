// Ikony edytora (24×24, obrys) — wstawiane jako SVG w tekst przycisków.

const P: Record<string, string> = {
  pad: `<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M5 7.5h14" stroke-width="2.6"/><path d="M8.5 11.5h7M8.5 15h4.5"/>`,
  upload: `<path d="M12 15.5V4.5"/><path d="m7.5 9 4.5-4.5L16.5 9"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>`,
  image: `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 16-4.8-4.8a1 1 0 0 0-1.4 0L5 20"/>`,
  rotL: `<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>`,
  rotR: `<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>`,
  full: `<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>`,
  detect: `<path d="M4 8.5v-3A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><path d="m12 7.6 1.1 3.3 3.3 1.1-3.3 1.1L12 16.4l-1.1-3.3L7.6 12l3.3-1.1z"/>`,
  undo: `<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3.5"/>`,
  rect: `<rect x="4.5" y="5.5" width="15" height="13" rx="1.5"/>`,
  smooth: `<path d="M3.5 14.5c2.5 0 3-5 5.7-5s3.1 5 5.6 5 3-5 5.7-5"/>`,
  bindTop: `<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M5.5 6.6h13" stroke-width="3.4"/>`,
  bindLeft: `<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M6.6 5.5v13" stroke-width="3.4"/>`,
  table: `<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9 4.5v15"/>`,
  fields: `<rect x="3.5" y="4" width="7.5" height="6.5" rx="1.2"/><rect x="13" y="4" width="7.5" height="6.5" rx="1.2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.2"/>`,
  cols: `<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M9.2 4.5v15M14.8 4.5v15"/>`,
  rows: `<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17"/>`,
  scanTable: `<path d="M4 8.5v-3A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><path d="M8 10h8M8 14h8M12 8v8"/>`,
  even: `<path d="M4 4.5v15M20 4.5v15"/><rect x="8" y="7" width="3" height="10" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>`,
  trash: `<path d="M4.5 7h15M10 11v5.5M14 11v5.5M6.5 7l.9 11.2A2 2 0 0 0 9.4 20h5.2a2 2 0 0 0 2-1.8L17.5 7M9.5 7V4.5h5V7"/>`,
  copy: `<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>`,
  download: `<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  arrowR: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  arrowL: `<path d="M19 12H5M11 6l-6 6 6 6"/>`,
  plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
  minus: `<path d="M5.5 12h13"/>`,
  x: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  sliders: `<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>`,
  split: `<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 12h16" stroke-dasharray="2.4 2.2"/>`,
  dupNext: `<rect x="3.5" y="5" width="9" height="9" rx="1.5"/><path d="M15 9.5h5.5M18 7l2.5 2.5L18 12"/><rect x="11.5" y="13" width="9" height="6.5" rx="1.5" stroke-dasharray="2.2 2"/>`,
  dupDown: `<rect x="5.5" y="3.5" width="13" height="7" rx="1.5"/><rect x="5.5" y="13.5" width="13" height="7" rx="1.5" stroke-dasharray="2.4 2.1"/>`,
  dupRight: `<rect x="3.5" y="5.5" width="7" height="13" rx="1.5"/><rect x="13.5" y="5.5" width="7" height="13" rx="1.5" stroke-dasharray="2.4 2.1"/>`,
  free: `<rect x="4.5" y="4.5" width="15" height="15" rx="2" stroke-dasharray="2.6 2.2"/>`,
  user: `<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>`,
  alert: `<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>`,
  note: `<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-8.5L6.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6.5A1.5 1.5 0 0 1 5 5z"/><path d="M7.5 9.5h9M7.5 12.5h6"/>`,
  insert: `<path d="M4.5 12h11M11 7.5l4.5 4.5-4.5 4.5"/><rect x="15.5" y="4.5" width="4" height="15" rx="1.2"/>`,
};

/** Ikona SVG o podanej nazwie (dziedziczy kolor tekstu). */
export function icon(name: keyof typeof P | string, cls = ''): string {
  const body = P[name] ?? '';
  return `<svg class="spe-ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
