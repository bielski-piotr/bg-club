// Style panelu trybu debugowania (w notesie) i edytora notesu (samodzielnego albo w nakładce).

export const DEBUG_CSS = String.raw`
/* tryb debugowania */
.dbg {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 34; width: min(360px, 100%);
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  background: rgba(20, 16, 13, 0.94); border-left: 1px solid var(--glass-line); color: var(--chalk);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  font-size: 13.5px; font-variant-numeric: tabular-nums;
}
.dbg-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 10px 12px 16px; border-bottom: 1px solid var(--glass-line); }
.dbg-head b { font: 700 17px/1.1 var(--f-display); }
.dbg-x { width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; color: var(--chalk-dim); font: 400 22px/1 var(--f-ui); cursor: pointer; }
.dbg-x:hover { color: var(--chalk); background: rgba(255, 255, 255, 0.08); }
.dbg-body { overflow-y: auto; padding: 12px 14px 28px; display: grid; align-content: start; gap: 10px; overscroll-behavior: contain; }
.dbg-box { display: grid; gap: 8px; padding: 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); }
.dbg-box h3, .dbg-sec summary { margin: 0; font: 700 11.5px/1 var(--f-ui); letter-spacing: 0.12em; text-transform: uppercase; color: var(--chalk-dim); }
.dbg button { font: 600 13.5px/1 var(--f-ui); padding: 9px 10px; border-radius: 8px; border: 1px solid var(--glass-line); background: rgba(255, 255, 255, 0.06); color: var(--chalk); cursor: pointer; }
.dbg button:hover { background: rgba(255, 255, 255, 0.12); }
.dbg .dbg-btn-main { background: var(--chalk); color: #1d1611; border-color: var(--chalk); padding: 11px 12px; }
.dbg .dbg-btn-main:hover { background: #fff; }
.dbg button.warn { color: #ffb4a3; }
.dbg-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dbg-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dbg-acts button:last-child { grid-column: 1 / -1; }
.dbg-check { display: flex; gap: 8px; align-items: center; color: var(--chalk-dim); cursor: pointer; }
.dbg-status { margin: 0; font-size: 13px; color: var(--chalk-dim); }
.dbg-status:empty { display: none; }
.dbg-status[data-kind="ok"] { color: #8fe3b0; }
.dbg-status[data-kind="err"] { color: #ffb4a3; }
.dbg-note { margin: 0; font-size: 12.5px; line-height: 1.4; color: var(--chalk-dim); }
.dbg-note code, .dlg code { font: 12px ui-monospace, Menlo, monospace; background: rgba(255, 255, 255, 0.1); padding: 1px 4px; border-radius: 4px; }
.dbg-stats { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; }
.dbg-stats dt { color: var(--chalk-dim); }
.dbg-stats dd { margin: 0; text-align: right; }
.dbg-sec { border-radius: 10px; background: rgba(255, 255, 255, 0.05); }
.dbg-sec summary { padding: 12px; cursor: pointer; list-style-position: inside; }
.dbg-fields { display: grid; gap: 10px; padding: 0 12px 12px; }
.dbg-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 2px 8px; align-items: center; }
.dbg-row label { min-width: 0; }
.dbg-row output { color: var(--chalk); font-weight: 600; }
.dbg-row input[type="range"] { grid-column: 1 / -1; width: 100%; accent-color: #f1e8da; margin: 2px 0 0; }
.dbg-row small { grid-column: 1 / -1; color: var(--chalk-dim); font-size: 12px; }
.dbg-row.bool label { display: flex; gap: 8px; align-items: center; cursor: pointer; }
.dbg-row.bool { grid-template-columns: minmax(0, 1fr) auto; }
.dbg-row.color { grid-template-columns: minmax(0, 1fr) auto auto; }
.dbg-row input[type="color"] { width: 44px; height: 28px; padding: 0; border: 1px solid var(--glass-line); border-radius: 6px; background: none; }
.dbg-row input[type="checkbox"], .dbg-check input { accent-color: #f1e8da; width: 16px; height: 16px; }
.dbg .dbg-reset { visibility: hidden; width: 26px; height: 22px; padding: 0; font-size: 14px; border-color: transparent; background: none; color: var(--chalk-dim); }
.dbg-row.changed .dbg-reset { visibility: visible; }
.dbg-row.changed > label::after, .dbg-row.changed > label span::after { content: " •"; color: #ffd27a; }
`;

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const LIGHT = `
  --font: "Archivo", "Archivo Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-display: "Alegreya SC", "Palatino Linotype", Georgia, serif;
  --bg: #f5f6f8; --surface: #ffffff; --surface-2: #f1f3f6; --line: #e4e7ec; --line-strong: #cfd4dc;
  --fg: #171b24; --muted: #667085; --accent: #2c45c0; --accent-hover: #243aa6; --accent-vivid: #4762ff;
  --accent-soft: rgba(44, 69, 192, 0.09); --accent-line: rgba(44, 69, 192, 0.28); --accent-ring: rgba(44, 69, 192, 0.2);
  --danger: #d23f4a; --danger-soft: rgba(210, 63, 74, 0.1); --ok: #17905f; --warn: #b26a00;
  --stage: #e8ebf0; --stage-dot: rgba(23, 27, 36, 0.09); --dim: rgba(14, 16, 22, 0.56);
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08);
  color-scheme: light;`;
const DARK = `
  --bg: #0e1014; --surface: #161920; --surface-2: #1e222a; --line: #272c35; --line-strong: #363c47;
  --fg: #e8eaee; --muted: #98a1b2; --accent: #7d93ff; --accent-hover: #93a5ff; --accent-vivid: #8ea2ff;
  --accent-soft: rgba(125, 147, 255, 0.12); --accent-line: rgba(125, 147, 255, 0.35); --accent-ring: rgba(125, 147, 255, 0.28);
  --danger: #ff7b84; --danger-soft: rgba(255, 123, 132, 0.12); --ok: #4fd39a; --warn: #f0b44c;
  --stage: #0a0c0f; --stage-dot: rgba(255, 255, 255, 0.06); --dim: rgba(0, 0, 0, 0.62);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  color-scheme: dark;`;

export const EDITOR_CSS = String.raw`
.spe { ${LIGHT}
  position: relative; height: 100%; min-height: 520px; container: spe / inline-size;
  background: var(--bg); color: var(--fg); font: 400 14px/1.45 var(--font); -webkit-font-smoothing: antialiased;
  overflow: hidden; text-align: left; letter-spacing: 0;
}
@media (prefers-color-scheme: dark) { .spe:not(.light) { ${DARK} } }
.spe.dark { ${DARK} }
.spe.overlay { position: absolute; inset: 0; z-index: 40; min-height: 0; animation: spe-in .3s cubic-bezier(.2,.8,.2,1); }
.spe *, .spe *::before, .spe *::after { box-sizing: border-box; }
.spe [hidden] { display: none !important; }
.spe button, .spe input, .spe select { font-family: var(--font); }
.spe :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.spe input:focus-visible, .spe select:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.spe input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
.spe input[type="number"]::-webkit-inner-spin-button, .spe input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.spe-ic { width: 20px; height: 20px; flex: none; display: block; }

.spe-in { display: grid; grid-template-columns: 236px minmax(0, 1fr); height: 100%; min-height: inherit; }

/* pasek kroków */
.spe-rail { display: flex; flex-direction: column; gap: 22px; min-height: 0; padding: 18px 14px 16px; background: var(--surface); border-right: 1px solid var(--line); }
.spe-brand { display: flex; align-items: center; gap: 10px; padding: 2px 6px; }
.spe-brand > .spe-ic { width: 26px; height: 26px; color: var(--accent); }
.spe-brand b { font: 700 18px/1 var(--font-display); letter-spacing: 0.01em; }
.spe-x { margin-left: auto; width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.spe-x:hover { background: var(--surface-2); color: var(--fg); }
.spe-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.spe-step { position: relative; }
.spe-step:not(:last-child)::after { content: ""; position: absolute; left: 25px; top: 46px; bottom: -8px; width: 2px; border-radius: 2px; background: var(--line); transition: background .4s ease; }
.spe-step.done:not(:last-child)::after { background: var(--accent); }
.spe-step button { width: 100%; display: flex; align-items: center; gap: 12px; padding: 9px 10px; border: 0; border-radius: 11px; background: none; color: var(--muted); text-align: left; cursor: pointer; transition: background .2s, color .2s; }
.spe-step button:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); }
.spe-step button:disabled { cursor: default; }
.spe-step button:disabled .spe-step-t { opacity: .6; }
.spe-step.current button { background: var(--accent-soft); color: var(--fg); }
.spe-dot { position: relative; flex: none; width: 31px; height: 31px; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid var(--line-strong); background: var(--surface); font-weight: 650; font-size: 13px; transition: background .3s, border-color .3s, color .3s, box-shadow .3s; }
.spe-dot .n { transition: opacity .2s, transform .25s; }
.spe-dot .ok { position: absolute; width: 17px; height: 17px; stroke-width: 2.6; stroke-dasharray: 24; stroke-dashoffset: 24; transition: stroke-dashoffset .4s .08s cubic-bezier(.65,0,.35,1); }
.spe-step.current .spe-dot { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 4px var(--accent-ring); }
.spe-step.done .spe-dot { border-color: var(--accent); background: var(--accent); color: #fff; box-shadow: none; }
.spe-step.done .spe-dot .n { opacity: 0; transform: scale(.5); }
.spe-step.done .spe-dot .ok { stroke-dashoffset: 0; }
.spe-step-t { min-width: 0; }
.spe-step-t b { display: block; font-size: 14px; font-weight: 600; }
.spe-step-t small { display: block; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spe-nav { margin-top: auto; display: grid; gap: 8px; }
.spe-hint { display: flex; gap: 7px; align-items: flex-start; margin: 2px 2px 0; font-size: 12.5px; line-height: 1.35; color: var(--muted); animation: spe-in .25s ease-out; }
.spe-hint .spe-ic { width: 16px; height: 16px; color: var(--warn); margin-top: 1px; }

/* przyciski */
.spe-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--fg); font: 600 14px/1 var(--font); white-space: nowrap; cursor: pointer; transition: transform .12s, background .2s, border-color .2s, box-shadow .2s, color .2s; }
.spe-btn .spe-ic { width: 18px; height: 18px; transition: transform .2s cubic-bezier(.2,.8,.2,1); }
.spe-btn:hover:not(:disabled) { background: var(--surface-2); }
.spe-btn:active:not(:disabled) { transform: scale(.97); }
.spe-btn:disabled { opacity: .45; cursor: not-allowed; }
.spe-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 1px 2px rgba(16, 24, 40, .1), 0 8px 18px -10px var(--accent); }
.spe-btn.primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.spe-btn.primary:disabled { box-shadow: none; }
.spe-btn.ghost { border-color: transparent; background: none; color: var(--muted); }
.spe-btn.ghost:hover:not(:disabled) { color: var(--fg); }
.spe-btn[data-n="next"]:hover:not(:disabled) .spe-ic { transform: translateX(3px); }
.spe-btn[data-n="back"]:hover .spe-ic { transform: translateX(-3px); }
.spe-btn.did { color: var(--ok); border-color: var(--ok); }
.spe-btn.primary.did { background: var(--ok); border-color: var(--ok); color: #fff; }
.spe-btn.did .spe-ic { animation: spe-pop .35s cubic-bezier(.2,.8,.2,1.5); }

/* obszar roboczy */
.spe-main { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; }
.spe-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; min-height: 58px; padding: 10px 14px; background: var(--surface); border-bottom: 1px solid var(--line); }
.spe[data-step="1"] .spe-toolbar { display: none; }
.spe[data-step="1"] .spe-main { grid-template-rows: minmax(0, 1fr); }
.spe-tb-group { display: flex; align-items: center; gap: 4px; }
.spe-tb-sep { width: 1px; height: 24px; background: var(--line); }
.spe-tb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; min-width: 34px; padding: 0 8px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--fg); font: 500 13.5px/1 var(--font); cursor: pointer; transition: background .15s, color .15s, border-color .15s, transform .12s; }
.spe-tb-btn .spe-ic { width: 19px; height: 19px; }
.spe-tb-btn:hover:not(:disabled) { background: var(--surface-2); }
.spe-tb-btn:active:not(:disabled) { transform: scale(.94); }
.spe-tb-btn:disabled { opacity: .32; cursor: default; }
.spe-tb-btn[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent); }
.spe-tb-btn.danger:hover:not(:disabled) { background: var(--danger-soft); color: var(--danger); }
.spe-seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); }
.spe-seg button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; min-width: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: none; color: var(--muted); font: 500 13px/1 var(--font); white-space: nowrap; cursor: pointer; transition: background .2s, color .2s, box-shadow .2s; }
.spe-seg button:hover:not(:disabled) { color: var(--fg); }
.spe-seg button[aria-checked="true"], .spe-seg button[aria-selected="true"] { background: var(--surface); color: var(--fg); box-shadow: var(--shadow); }
.spe-seg button:disabled { opacity: .4; cursor: not-allowed; }
.spe-seg .spe-ic { width: 17px; height: 17px; }
.spe-seg.mini button { padding: 0 6px; }
.spe-seg button[data-paint="cut"][aria-checked="true"] { color: var(--danger); }
.spe-seg button[data-paint="restore"][aria-checked="true"] { color: var(--ok); }
.spe-dims { display: inline-flex; align-items: center; gap: 2px; height: 34px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); font-size: 12.5px; transition: border-color .15s, box-shadow .15s; }
.spe-dims:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.spe-dims input { width: 44px; height: 30px; border: 0; background: none; color: var(--fg); font: 600 13.5px var(--font); text-align: center; }
.spe-dims input:focus-visible { box-shadow: none; }
.spe-range { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 6px; color: var(--muted); font-size: 12.5px; }
.spe-range .spe-ic { width: 18px; height: 18px; }
.spe-range input[type="range"] { width: 88px; accent-color: var(--accent); cursor: pointer; }
.spe-range output { min-width: 20px; color: var(--fg); font-weight: 650; font-variant-numeric: tabular-nums; }
.spe-stepper { display: inline-flex; align-items: center; gap: 2px; height: 34px; padding: 0 3px 0 10px; border-radius: 8px; border: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
.spe-stepper > span { margin-right: 4px; }
.spe-stepper button { width: 26px; height: 26px; display: grid; place-items: center; border: 0; border-radius: 6px; background: none; color: var(--fg); cursor: pointer; transition: background .15s; }
.spe-stepper button:hover:not(:disabled) { background: var(--surface-2); }
.spe-stepper button:disabled { opacity: .28; cursor: default; }
.spe-stepper .spe-ic { width: 15px; height: 15px; }
.spe-stepper output { min-width: 18px; text-align: center; color: var(--fg); font-weight: 650; font-variant-numeric: tabular-nums; }
.spe-players { gap: 6px; }
.spe-chip { --pc: var(--accent); display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 11px 0 8px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--surface); color: var(--muted); font: 650 13px/1 var(--font); cursor: pointer; transition: border-color .2s, background .2s, color .2s, transform .12s; }
.spe-chip .spe-ic { width: 15px; height: 15px; color: var(--pc); }
.spe-chip:hover { border-color: var(--pc); color: var(--fg); }
.spe-chip:active { transform: scale(.95); }
.spe-chip[aria-checked="true"] { border-color: var(--pc); background: color-mix(in srgb, var(--pc) 13%, var(--surface)); color: var(--fg); }
.spe-pop { animation: spe-in .22s ease-out; }

.spe-work { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); min-height: 0; }
.spe[data-step="3"] .spe-work { grid-template-columns: minmax(0, 1fr) 320px; }
.spe-work.enter .spe-svg, .spe-work.enter .spe-panel, .spe-work.enter .spe-drop { animation: spe-in .36s cubic-bezier(.2,.8,.2,1); }
.spe-stage { position: relative; min-width: 0; min-height: 0; padding: 30px; background-color: var(--stage); background-image: radial-gradient(var(--stage-dot) 1px, transparent 1.2px); background-size: 18px 18px; overflow: hidden; }
.spe-svg { display: block; width: 100%; height: 100%; overflow: visible; outline: none; touch-action: none; user-select: none; -webkit-user-select: none; }
.spe .spe-svg:focus, .spe .spe-svg:focus-visible { outline: none; }
.spe[data-step="1"] .spe-svg { display: none; }

/* krok 1: upuszczanie zdjęcia */
.spe-drop { display: none; }
.spe[data-step="1"] .spe-drop { position: absolute; inset: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 24px; overflow: hidden; border-radius: 20px; border: 2px dashed var(--line-strong); background: color-mix(in srgb, var(--surface) 72%, transparent); text-align: center; cursor: pointer; transition: border-color .25s, background .25s, transform .25s cubic-bezier(.2,.8,.2,1); }
.spe-drop:hover, .spe.dragging .spe-drop { border-color: var(--accent); background: color-mix(in srgb, var(--surface) 82%, var(--accent) 6%); }
.spe.dragging .spe-drop { transform: scale(1.012); }
.spe-drop > *:not(.spe-drop-thumb):not(input) { position: relative; }
.spe-drop-thumb { position: absolute; inset: 0; background: center / contain no-repeat; opacity: 0; transition: opacity .3s; }
.spe-drop.has .spe-drop-thumb { opacity: .14; }
.spe-drop-art { width: 88px; height: 88px; margin-bottom: 10px; display: grid; place-items: center; border-radius: 26px; background: var(--accent-soft); color: var(--accent); transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.spe-drop-art > .spe-ic { width: 42px; height: 42px; stroke-width: 1.5; }
.spe-drop-up { position: absolute; right: -6px; bottom: -6px; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--accent); color: #fff; box-shadow: 0 0 0 4px var(--surface); }
.spe-drop-up .spe-ic { width: 18px; height: 18px; stroke-width: 2.2; }
.spe-drop:hover .spe-drop-art, .spe.dragging .spe-drop-art { transform: translateY(-5px) rotate(-3deg); }
.spe.dragging .spe-drop-up .spe-ic { animation: spe-bob .9s ease-in-out infinite; }
.spe-drop strong { font-size: 18px; font-weight: 650; letter-spacing: -0.015em; }
.spe-drop > span { color: var(--muted); font-size: 13.5px; }
.spe-spin { display: none; width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--accent-soft); border-top-color: var(--accent); animation: spe-rot .75s linear infinite; }
.spe-drop .spe-spin { position: absolute; top: calc(50% - 72px); }
.spe.busy .spe-drop .spe-spin { display: block; }
.spe.busy .spe-drop .spe-drop-art { opacity: 0; }
.spe.busy .spe-drop { cursor: progress; }
.spe-busy { position: absolute; inset: 0; z-index: 3; display: none; place-items: center; background: color-mix(in srgb, var(--stage) 55%, transparent); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); animation: spe-fade .2s ease-out; }
.spe[data-busy="sheet"] .spe-busy { display: grid; }
.spe-busy .spe-spin { display: block; }

/* krok 2: kadr i kształt */
.spe-svg .spe-dim { fill: var(--dim); pointer-events: none; }
.spe-svg .spe-outline { fill: none; stroke: var(--accent-vivid); stroke-width: 2; vector-effect: non-scaling-stroke; pointer-events: none; }
.spe-svg .spe-frame { fill: none; stroke: #fff; stroke-opacity: .75; stroke-width: 1.2; stroke-dasharray: 5 5; vector-effect: non-scaling-stroke; pointer-events: none; }
.spe-svg .spe-spine { stroke-width: 7; stroke-linecap: round; vector-effect: non-scaling-stroke; pointer-events: none; }
.spe-svg .spe-spine.halo { stroke: #fff; stroke-opacity: .75; stroke-width: 11; }
.spe-svg .spe-qh { cursor: grab; }
.spe-svg .spe-qh.on { cursor: grabbing; }
.spe-svg .spe-qh .dot { fill: #fff; stroke: var(--accent-vivid); stroke-width: 2.5; vector-effect: non-scaling-stroke; transform-box: fill-box; transform-origin: center; transition: transform .18s cubic-bezier(.2,.8,.2,1.4); filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .35)); }
.spe-svg .spe-qh:hover .dot, .spe-svg .spe-qh.on .dot { transform: scale(1.35); }
.spe-svg .spe-qh:focus { outline: none; }
.spe-svg .spe-qh:focus-visible .dot { stroke-width: 4; transform: scale(1.35); }
.spe-svg .spe-qh.on .dot { fill: var(--accent-vivid); stroke: #fff; }
.spe-svg .spe-edge { stroke: transparent; stroke-width: 20; vector-effect: non-scaling-stroke; stroke-linecap: round; cursor: copy; }
.spe-svg .spe-raw { fill: none; stroke: #fff; stroke-opacity: .85; stroke-width: 1.2; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; pointer-events: none; }
.spe-svg .spe-loupe { pointer-events: none; animation: spe-fade .15s ease-out; }
.spe-svg .spe-loupe .ring { fill: #fff; filter: drop-shadow(0 12px 32px rgba(22, 26, 43, .22)); }
.spe-svg .spe-loupe .lp, .spe-svg .spe-loupe .cross { fill: none; stroke: var(--accent-vivid); stroke-width: 1.6; vector-effect: non-scaling-stroke; }

/* krok 4 kreatora: kategorie na kartce; kolory
   kartki są stałe w obu motywach, bo kartka to zdjęcie */
.spe-svg .spe-cat-box { fill: transparent; cursor: pointer; stroke: rgba(47, 84, 235, .32); stroke-width: 1; vector-effect: non-scaling-stroke; transition: fill .15s; }
.spe-svg .spe-cat-box:hover { fill: rgba(47, 84, 235, .06); }
.spe-svg .spe-cat-box.tint { fill: rgba(47, 84, 235, .08); }
.spe-svg .spe-cat-box.on { stroke: #2F54EB; stroke-width: 1.5; }
.spe-svg .spe-cat-badge circle { fill: #fff; stroke: #E4E7F0; stroke-width: 1; vector-effect: non-scaling-stroke; filter: drop-shadow(0 1px 1.5px rgba(22, 26, 43, .18)); }
.spe-svg .spe-cat-badge text { fill: #6B7188; font-family: var(--font); font-weight: 600; text-anchor: middle; }
.spe-svg .spe-cat-badge.on circle { fill: #2F54EB; stroke: #2F54EB; }
.spe-svg .spe-cat-badge.on text { fill: #fff; }
.spe-svg .spe-cat-badge.rule text { fill: #2F54EB; font-weight: 700; }

/* krok 3: tabela i pola */
.spe-svg .spe-labels { fill: rgba(70, 76, 90, .1); pointer-events: none; }
.spe-svg .spe-band { cursor: pointer; transition: fill-opacity .2s; }
.spe-svg .spe-band:hover { fill-opacity: .24; }
.spe-svg .spe-band.on { stroke: var(--k); stroke-width: 2.5; vector-effect: non-scaling-stroke; }
.spe-svg .spe-num { fill: #fff; font-family: var(--font); font-weight: 700; text-anchor: middle; pointer-events: none; }
.spe-svg .spe-track { cursor: pointer; }
.spe-svg .spe-track rect { transition: opacity .2s; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .25)); }
.spe-svg .spe-track:hover rect { opacity: .82; }
.spe-svg .spe-gl .hit { stroke: transparent; stroke-width: 18; vector-effect: non-scaling-stroke; }
.spe-svg .spe-gl .vis { stroke: var(--accent-vivid); stroke-width: 1.5; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; transition: stroke-width .15s; }
.spe-svg .spe-gl.outer .vis { stroke-dasharray: none; stroke-width: 2.2; }
.spe-svg .spe-gl:hover .vis, .spe-svg .spe-gl.on .vis { stroke-width: 3.2; }
.spe-svg .spe-gl .knob { fill: #fff; stroke: var(--accent-vivid); stroke-width: 2; vector-effect: non-scaling-stroke; }
.spe-svg .spe-gl:hover .knob, .spe-svg .spe-gl.on .knob { fill: var(--accent-vivid); }
.spe-svg.spe-zoomed { overflow: hidden; }
.spe-svg .spe-gl.x { cursor: ew-resize; }
.spe-svg .spe-gl.y { cursor: ns-resize; }
.spe-svg .spe-ghost-line { stroke: var(--accent-vivid); stroke-opacity: .3; stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.spe-svg.spe-c-draw [data-bg] { cursor: crosshair; }
.spe-svg .spe-f rect, .spe-svg .spe-f ellipse { fill: var(--k); fill-opacity: .16; stroke: var(--k); stroke-width: 1.7; vector-effect: non-scaling-stroke; transition: fill-opacity .15s; }
.spe-svg .spe-f text { fill: var(--k); font-family: var(--font); font-weight: 700; text-anchor: middle; pointer-events: none; paint-order: stroke; stroke: rgba(255, 255, 255, .8); stroke-width: 2.5px; }
.spe-svg .spe-f[data-fid] { cursor: move; }
.spe-svg .spe-f[data-fid]:hover rect, .spe-svg .spe-f[data-fid]:hover ellipse { fill-opacity: .26; }
.spe-svg .spe-f.on rect, .spe-svg .spe-f.on ellipse { fill-opacity: .34; stroke-width: 2.8; }
.spe-svg .spe-f.other { opacity: .36; transition: opacity .25s; }
.spe-svg .spe-f.lost rect { stroke: var(--danger); stroke-dasharray: 5 4; }
.spe-svg .spe-f.fresh { animation: spe-pop .3s cubic-bezier(.2,.8,.2,1.4); transform-box: fill-box; transform-origin: center; }
.spe-svg .spe-ghost { fill: var(--k); fill-opacity: .14; stroke: var(--k); stroke-width: 1.7; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; pointer-events: none; animation: spe-ants .5s linear infinite; }
.spe-svg .spe-resize { fill: #fff; stroke: var(--accent-vivid); stroke-width: 2; vector-effect: non-scaling-stroke; cursor: nwse-resize; }
.spe-svg .spe-spine-r { pointer-events: none; }

/* panel kroku 3 */
.spe-panel { display: none; }
.spe[data-step="3"] .spe-panel { display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 16px 14px; overflow-y: auto; overscroll-behavior: contain; background: var(--surface); border-left: 1px solid var(--line); }
.spe-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.spe-card + .spe-card { padding-top: 14px; border-top: 1px solid var(--line); }
.spe-field { display: grid; gap: 6px; }
.spe-field > span, .spe-color > span:first-child { font-size: 12px; font-weight: 600; color: var(--muted); }
.spe-field input { height: 38px; padding: 0 11px; border-radius: 9px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--fg); font: 500 14px var(--font); transition: border-color .15s, box-shadow .15s; }
.spe-color { display: flex; align-items: center; gap: 10px; }
.spe-color > span:first-child { margin-right: auto; }
.spe-swatch { position: relative; width: 32px; height: 32px; border-radius: 9px; background: var(--c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .14), 0 1px 3px rgba(0, 0, 0, .12); cursor: pointer; transition: transform .15s cubic-bezier(.2,.8,.2,1.4); }
.spe-swatch:hover { transform: scale(1.08); }
.spe-swatch:focus-within { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .14), 0 0 0 3px var(--accent-ring); }
.spe-swatch input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.spe-color code { min-width: 62px; font: 500 12.5px ui-monospace, "SFMono-Regular", Menlo, monospace; color: var(--fg); text-transform: uppercase; }
.spe-card-head { display: flex; align-items: center; gap: 8px; }
.spe-card-head b { font-size: 13px; font-weight: 650; }
.spe-count { padding: 2px 7px; border-radius: 999px; background: var(--surface-2); color: var(--muted); font-size: 11.5px; font-weight: 650; font-variant-numeric: tabular-nums; }
.spe-cats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
.spe-cat { --k: var(--accent); border-radius: 11px; border: 1px solid var(--line); background: var(--surface); transition: border-color .15s, box-shadow .2s; }
.spe-cat:hover { border-color: var(--line-strong); }
.spe-cat.active { border-color: var(--k); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 17%, transparent); }
.spe-cat.fresh { animation: spe-in .3s cubic-bezier(.2,.8,.2,1); }
.spe-cat-row { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 8px; cursor: pointer; }
.spe-cat-tag { flex: none; min-width: 22px; height: 22px; padding: 0 5px; display: grid; place-items: center; border-radius: 6px; background: var(--k); color: #fff; font: 700 11.5px/1 var(--font); font-variant-numeric: tabular-nums; }
.spe-cat-tag.free { background: color-mix(in srgb, var(--k) 14%, transparent); color: var(--k); }
.spe-cat-tag .spe-ic { width: 14px; height: 14px; stroke-width: 2; }
.spe-cat-name { flex: 1 1 0; width: 0; min-width: 0; height: 28px; padding: 0 6px; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--fg); font: 500 13.5px var(--font); transition: background .15s, border-color .15s; }
.spe-cat-name:hover { background: var(--surface-2); }
.spe-cat-hint { flex: none; display: none; width: 20px; height: 20px; place-items: center; color: var(--k); animation: spe-pop .25s ease-out; }
.spe-cat.has-hint .spe-cat-hint { display: grid; }
.spe-cat-hint .spe-ic { width: 15px; height: 15px; }
.spe-note { display: grid; gap: 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.spe-note textarea { min-height: 54px; padding: 7px 9px; resize: vertical; border-radius: 7px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--fg); font: 400 13px/1.38 var(--font); transition: border-color .15s, box-shadow .15s; }
.spe-note textarea::placeholder { color: var(--muted); opacity: .7; }
.spe-note textarea:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.spe-cat-n { flex: none; padding: 4px 7px; border-radius: 999px; background: color-mix(in srgb, var(--k) 13%, transparent); color: var(--k); font: 700 11px/1 var(--font); animation: spe-pop .25s ease-out; }
.spe-cat select { flex: none; width: 92px; height: 28px; padding: 0 22px 0 8px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface-2) ${CHEVRON} no-repeat right 6px center / 12px; color: var(--fg); font: 500 12.5px var(--font); -webkit-appearance: none; appearance: none; cursor: pointer; }
.spe-icon-btn { flex: none; width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 7px; background: none; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.spe-icon-btn:hover { background: var(--surface-2); color: var(--fg); }
.spe-icon-btn[aria-expanded="true"] { background: var(--accent-soft); color: var(--accent); }
.spe-icon-btn .spe-ic { width: 16px; height: 16px; }
.spe-cat-more { display: grid; gap: 10px; padding: 4px 10px 12px 38px; animation: spe-in .25s ease-out; }
.spe-range3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.spe-range3 label { display: grid; gap: 3px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.spe-range3 input { width: 100%; min-width: 0; height: 30px; padding: 0 8px; border-radius: 7px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--fg); font: 500 13px var(--font); }
.spe-switch { position: relative; display: flex; align-items: center; gap: 9px; font-size: 13px; cursor: pointer; }
.spe-switch input { position: absolute; opacity: 0; pointer-events: none; }
.spe-switch span { position: relative; flex: none; width: 30px; height: 18px; border-radius: 999px; background: var(--line-strong); transition: background .2s; }
.spe-switch span::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .22s cubic-bezier(.2,.8,.2,1.3); }
.spe-switch input:checked + span { background: var(--accent); }
.spe-switch input:checked + span::after { transform: translateX(12px); }
.spe-switch input:focus-visible + span { box-shadow: 0 0 0 3px var(--accent-ring); }
.spe-of { display: grid; gap: 3px; }
.spe-of-head { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.spe-check { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 13px; cursor: pointer; }
.spe-check input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
.spe-link { padding: 0; border: 0; background: none; color: var(--accent); font: 600 12px var(--font); cursor: pointer; }
.spe-warn { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12.5px; color: var(--warn); }
.spe-warn .spe-ic { width: 15px; height: 15px; margin-top: 1px; }
.spe-muted { margin: 0; font-size: 12.5px; color: var(--muted); }
.spe-cat-acts { display: flex; gap: 6px; }
.spe-mini { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); font: 500 12.5px var(--font); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.spe-mini:hover:not(:disabled) { background: var(--surface-2); }
.spe-mini.danger { color: var(--danger); }
.spe-mini.danger:hover:not(:disabled) { background: var(--danger-soft); border-color: transparent; }
.spe-mini:disabled { opacity: .4; cursor: not-allowed; }
.spe-mini .spe-ic { width: 15px; height: 15px; }
.spe-add { display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px; border-radius: 11px; border: 1.5px dashed var(--line-strong); background: none; color: var(--muted); font: 600 13px var(--font); cursor: pointer; transition: border-color .2s, color .2s, background .2s; }
.spe-add:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.spe-add .spe-ic { width: 17px; height: 17px; transition: transform .25s cubic-bezier(.2,.8,.2,1.4); }
.spe-add:hover .spe-ic { transform: rotate(90deg); }

/* komunikat */
.spe-toast { position: absolute; left: 50%; bottom: 22px; z-index: 6; display: flex; align-items: center; gap: 9px; max-width: min(480px, calc(100% - 32px)); padding: 11px 15px; border-radius: 12px; background: #1b1f27; color: #fff; font-size: 13.5px; box-shadow: 0 12px 32px rgba(0, 0, 0, .28); opacity: 0; transform: translate(-50%, 16px) scale(.98); pointer-events: none; transition: opacity .25s, transform .35s cubic-bezier(.2,.8,.2,1); }
.spe-toast.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
.spe-toast .spe-ic { width: 17px; height: 17px; }
.spe-toast[data-kind="err"] .spe-ic { color: #ff9ca3; }
.spe-toast[data-kind="ok"] .spe-ic { color: #7ee2b0; }

@keyframes spe-in { from { opacity: 0; transform: translateY(7px); } }
@keyframes spe-fade { from { opacity: 0; } }
@keyframes spe-pop { from { opacity: 0; transform: scale(.8); } }
@keyframes spe-rot { to { transform: rotate(360deg); } }
@keyframes spe-bob { 50% { transform: translateY(-4px); } }
@keyframes spe-ants { to { stroke-dashoffset: -10; } }

/* węższe okno: krótsze etykiety */
@container spe (max-width: 1320px) {
  .spe[data-step="2"] .spe-tb-btn > span { display: none; }
}
@container spe (max-width: 1180px) {
  .spe-in { grid-template-columns: 212px minmax(0, 1fr); }
  .spe[data-step="3"] .spe-work { grid-template-columns: minmax(0, 1fr) 290px; }
  .spe-range input[type="range"] { width: 70px; }
}
@container spe (max-width: 1000px) {
  .spe[data-step="3"] .spe-seg button > span { display: none; }
}
/* telefon: kroki u góry, przyciski na dole, panel pod kartką */
@container spe (max-width: 760px) {
  .spe-in { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; }
  .spe-rail { display: contents; }
  .spe-brand { display: none; }
  .spe-steps { grid-row: 1; display: flex; gap: 4px; padding: 8px 10px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .spe-step { flex: 1; min-width: 0; }
  .spe-step:not(:last-child)::after { display: none; }
  .spe-step button { flex-direction: column; gap: 4px; padding: 6px 4px; text-align: center; }
  .spe-dot { width: 26px; height: 26px; font-size: 12px; }
  .spe-step-t b { font-size: 12.5px; }
  .spe-step-t small { display: none; }
  .spe-main { grid-row: 2; min-height: 0; }
  .spe-nav { grid-row: 3; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px)); background: var(--surface); border-top: 1px solid var(--line); }
  .spe-nav .spe-btn { flex: 1 1 0; min-width: 0; padding: 0 10px; gap: 6px; font-size: 13.5px; }
  .spe-nav .spe-btn.ghost { flex: 0 0 auto; order: -1; }
  .spe[data-step="3"] .spe-nav .spe-btn.ghost { width: 40px; padding: 0; }
  .spe[data-step="3"] .spe-nav .spe-btn.ghost > span { display: none; }
  .spe-hint { flex-basis: 100%; order: -2; margin: 0; }
  .spe-toolbar { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; min-height: 52px; padding: 8px 10px; }
  .spe-toolbar::-webkit-scrollbar { display: none; }
  .spe-tb-group { flex: none; }
  .spe-tb-btn > span, .spe-seg button > span, .spe-range > span { display: none; }
  .spe-stage { padding: 14px; }
  .spe[data-step="1"] .spe-drop { inset: 14px; }
  .spe[data-step="3"] .spe-work { display: block; overflow-y: auto; }
  .spe[data-step="3"] .spe-stage { height: min(64vh, 560px); }
  .spe[data-step="3"] .spe-panel { border-left: 0; border-top: 1px solid var(--line); overflow: visible; }
}
/* kreator w aplikacji: kroki, nawigację i zdjęcie prowadzi aplikacja */
.spe.wizard .spe-rail, .spe.wizard .spe-drop { display: none; }
.spe.wizard .spe-in { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.spe.wizard .spe-main { grid-row: auto; }
/* krok 2 w kreatorze: scena bez paska i panelu edytora (są w aplikacji) */
.spe.wizard { --accent-vivid: #2f54eb; background: transparent; }
.spe.wizard.dark { --accent-vivid: #4064f0; }
@media (prefers-color-scheme: dark) { .spe.wizard:not(.light) { --accent-vivid: #4064f0; } }
.spe.wizard[data-step="2"] .spe-toolbar, .spe.wizard[data-step="2"] .spe-panel { display: none; }
.spe.wizard[data-step="2"] .spe-main { grid-template-rows: minmax(0, 1fr); }
.spe.wizard[data-step="2"] .spe-stage { padding: 16px 16px 76px; background: var(--wizard-stage, #f1f3f9); }
.spe.wizard.dark[data-step="2"] .spe-stage { --wizard-stage: #22273b; }
@media (prefers-color-scheme: dark) { .spe.wizard:not(.light)[data-step="2"] .spe-stage { --wizard-stage: #22273b; } }
/* kroki 3 i 4 w kreatorze: kartka z siatką pól albo z kategoriami;
   pasek i panel są w aplikacji */
.spe.wizard:is([data-step="3"], [data-step="4"]) .spe-toolbar, .spe.wizard:is([data-step="3"], [data-step="4"]) .spe-panel { display: none; }
.spe.wizard:is([data-step="3"], [data-step="4"]) .spe-main { grid-template-rows: minmax(0, 1fr); }
.spe.wizard:is([data-step="3"], [data-step="4"]) .spe-work { display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
.spe.wizard:is([data-step="3"], [data-step="4"]) .spe-stage { height: auto; padding: 28px 16px 76px; background: var(--wizard-stage, #f1f3f9); }
.spe.wizard.dark:is([data-step="3"], [data-step="4"]) .spe-stage { --wizard-stage: #22273b; }
@media (prefers-color-scheme: dark) { .spe.wizard:not(.light):is([data-step="3"], [data-step="4"]) .spe-stage { --wizard-stage: #22273b; } }
.spe.wizard[data-step="3"] .spe-gl .vis { stroke-dasharray: none; stroke-width: 1.5; }
.spe.wizard[data-step="3"] .spe-gl.outer .vis { stroke-width: 2; }
@media (prefers-reduced-motion: reduce) {
  .spe *, .spe *::before, .spe *::after { animation: none !important; transition: none !important; }
}
`;
