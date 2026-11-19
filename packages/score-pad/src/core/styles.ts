// Style komponentu (wstrzykiwane do shadow DOM, więc nie mieszają się ze stroną).

export const CSS = String.raw`
:host {
  /* Stół w świetle lampy zza notesu; nakładki to małe przedmioty w rogach: ciemny pasek, karteczka wyboru, notatka z wynikiem. */
  --room: #120d0a;
  --glass: rgba(24, 18, 14, 0.78);
  --glass-line: rgba(255, 228, 196, 0.14);
  --chalk: #f1e8da;
  --chalk-dim: #b6a893;
  --paper: #f7f4ed;
  --paper-line: #ddd5c5;
  --graphite: #2b2622;
  --graphite-dim: #6c6258;
  --ink: #1c2e82;
  --ink-wash: rgba(28, 46, 130, 0.1);
  --accent: #1f4b43;
  --rip: #e0623f;
  --tape: rgba(226, 214, 180, 0.72);
  --f-display: "Alegreya SC", "Palatino Linotype", Georgia, serif;
  --f-ui: "Archivo Narrow", "Arial Narrow", "Roboto Condensed", Arial, sans-serif;
  --f-hand: "Caveat", "Segoe Print", "Bradley Hand", cursive;
  display: block;
  position: relative;
  min-height: 420px;
  color-scheme: dark;
  font-family: var(--f-ui);
  font-size: 15px;
  color: var(--chalk);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font-family: inherit; }
:focus-visible { outline: 2px solid #ffd27a; outline-offset: 2px; }

.sp { position: absolute; inset: 0; overflow: hidden; background: var(--room); border-radius: inherit; }
.stage { position: absolute; inset: 0; }
.stage canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; }
.sp[data-theme="light"] { --room: #d6cec2; }
.sp[data-theme="light"] .vignette { background: radial-gradient(120% 95% at 50% 55%, transparent 60%, rgba(70, 52, 34, 0.22) 100%); }
.vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(120% 95% at 50% 55%, transparent 55%, rgba(6, 4, 2, 0.5) 100%); }

/* pasek */
.bar {
  position: absolute; top: 12px; left: 12px; max-width: calc(100% - 24px);
  display: flex; align-items: center; gap: 6px;
  padding: 5px; z-index: 20;
  background: var(--glass); border: 1px solid var(--glass-line); border-radius: 12px;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.tpl-btn {
  display: grid; grid-template-columns: minmax(0, 1fr) 16px; column-gap: 8px; align-items: center; text-align: left;
  min-width: 0; padding: 6px 10px 6px 10px; border: 0; border-radius: 8px;
  background: none; color: var(--chalk); cursor: pointer;
}
.tpl-btn:hover, .tpl-btn[aria-expanded="true"] { background: rgba(255, 255, 255, 0.08); }
.tpl-name { font: 700 18px/1.1 var(--f-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tpl-sub { grid-column: 1; font-size: 12.5px; color: var(--chalk-dim); letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.tpl-btn svg { grid-column: 2; grid-row: 1 / span 2; width: 16px; height: 16px; color: var(--chalk-dim); }
.icon-btn {
  flex: none; width: 36px; height: 36px; display: grid; place-items: center;
  border-radius: 9px; border: 0; background: rgba(255, 255, 255, 0.07); color: var(--chalk); cursor: pointer;
}
.icon-btn:hover { background: rgba(255, 255, 255, 0.14); }
.icon-btn svg { width: 20px; height: 20px; }
.icon-btn .mute { opacity: 0; }
.icon-btn[aria-pressed="false"] .waves { opacity: 0; }
.icon-btn[aria-pressed="false"] .mute { opacity: 1; }

.menu {
  position: absolute; top: calc(100% + 6px); left: 0; width: 290px; max-width: calc(100vw - 24px);
  padding: 6px; z-index: 30;
  background: #1d1611; border: 1px solid var(--glass-line); border-radius: 12px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
}
.menu ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 260px; overflow-y: auto; }
.menu-item {
  width: 100%; display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: center; text-align: left;
  padding: 6px 8px; border: 0; border-radius: 8px; background: none; color: var(--chalk); cursor: pointer;
}
.menu-item:hover { background: rgba(255, 255, 255, 0.07); }
.menu-item[aria-checked="true"] { background: rgba(255, 255, 255, 0.12); }
.menu-item .sw { width: 34px; height: 34px; border-radius: 6px; background: var(--c); display: grid; place-items: center; font: 700 14px/1 var(--f-display); color: rgba(255,255,255,0.9); background-size: cover; background-position: center; }
.menu-item b { display: block; font: 700 15px/1.2 var(--f-ui); }
.menu-item small { color: var(--chalk-dim); font-size: 12.5px; }
.menu-acts { display: grid; gap: 2px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--glass-line); }
.menu-act { text-align: left; padding: 9px 10px; border: 0; border-radius: 8px; background: none; color: var(--chalk); cursor: pointer; font: 600 14px/1.2 var(--f-ui); }
.menu-act:hover { background: rgba(255, 255, 255, 0.07); }
.menu-act.danger { color: #ffb4a3; }
.menu-confirm { padding: 8px 10px; font-size: 14px; color: var(--chalk); display: grid; gap: 8px; }
.menu-confirm div { display: flex; gap: 8px; }
.menu-confirm button { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--glass-line); background: none; color: var(--chalk); cursor: pointer; font: 600 14px var(--f-ui); }
.menu-confirm button.danger { background: #b3402a; border-color: #b3402a; }

/* wskazówki */
.help {
  position: absolute; left: 12px; bottom: 12px; width: min(300px, calc(100% - 24px));
  padding: 12px 38px 12px 12px; z-index: 20;
  background: var(--glass); border: 1px solid var(--glass-line); border-radius: 12px;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.help ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; counter-reset: step; }
.help li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; font-size: 13.5px; line-height: 1.35; color: var(--chalk-dim); }
.help li::before {
  counter-increment: step; content: counter(step);
  width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255, 228, 196, 0.3);
  font: 700 12px/21px var(--f-ui); text-align: center; color: var(--chalk);
}
.help b { color: var(--chalk); font-weight: 600; }
.help-close, .help-btn { border: 0; cursor: pointer; background: none; color: var(--chalk-dim); font: 400 22px/1 var(--f-ui); }
.help-close { position: absolute; top: 5px; right: 5px; width: 30px; height: 30px; border-radius: 8px; }
.help-close:hover { color: var(--chalk); background: rgba(255, 255, 255, 0.08); }
.help-btn {
  position: absolute; left: 12px; bottom: 12px; width: 38px; height: 38px; border-radius: 50%; z-index: 20;
  background: var(--glass); border: 1px solid var(--glass-line); color: var(--chalk); font: 700 16px/1 var(--f-ui);
}

/* wybór liczby */
.tip {
  position: absolute; z-index: 28; max-width: min(280px, calc(100% - 16px)); padding: 9px 12px 10px;
  color: var(--chalk); background: rgba(30, 23, 18, 0.94); border: 1px solid var(--glass-line); border-radius: 11px;
  font: 400 13.5px/1.38 var(--f-ui); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
  pointer-events: none; opacity: 0; transform: translateY(5px) scale(0.96); transform-origin: var(--ax, 50%) 100%;
  transition: opacity 0.14s ease, transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25);
}
.tip.down { transform: translateY(-5px) scale(0.96); transform-origin: var(--ax, 50%) 0; }
.tip.on { opacity: 1; transform: none; }
.tip b { display: block; margin-bottom: 2px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--chalk-dim); }
.tip::after {
  content: ""; position: absolute; left: var(--ax, 50%); width: 10px; height: 10px; background: inherit;
  border: inherit; border-width: 0 1px 1px 0; transform: translateX(-50%) rotate(45deg);
}
.tip.up::after { bottom: -6px; }
.tip.down::after { top: -6px; border-width: 1px 0 0 1px; }
@media (prefers-reduced-motion: reduce) { .tip { transition: none; } }
.sp canvas { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
.picker {
  position: absolute; z-index: 30; width: 312px; max-width: calc(100% - 24px); padding: 14px 14px 12px;
  color: var(--graphite);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 40%), var(--paper);
  border-radius: 4px 4px 10px 10px;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.25);
  opacity: 0; transform: translateY(8px) rotate(-0.6deg) scale(0.97);
  transition: opacity 0.16s ease, transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25);
}
.picker.open { opacity: 1; transform: rotate(-0.6deg); }
.picker.as-sheet { left: 10px !important; right: 10px; top: 10px !important; bottom: auto; width: auto; max-width: none; transform: translateY(-16px); }
.picker.as-sheet.open { transform: none; }
.pk-head { display: flex; align-items: baseline; gap: 10px; padding-right: 30px; min-width: 0; }
.pk-title { font: 700 20px/1.1 var(--f-display); color: var(--accent); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-who { font: 700 24px/1 var(--f-hand); color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-close { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border: 0; border-radius: 8px; background: none; cursor: pointer; color: var(--graphite-dim); font: 400 22px/1 var(--f-ui); }
.pk-close:hover { background: rgba(0, 0, 0, 0.06); color: var(--graphite); }
.pk-hint { margin: 4px 0 10px; font-size: 13.5px; color: var(--graphite-dim); }
.pk-hint:empty { display: none; }
.pk-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pk-actions:empty { display: none; }
.pk-act { font: 600 14px/1 var(--f-ui); padding: 9px 12px; border-radius: 8px; cursor: pointer; color: var(--graphite); background: rgba(255, 255, 255, 0.7); border: 1px solid var(--paper-line); }
.pk-act:hover { border-color: var(--graphite-dim); }
.pk-act[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); }
.pk-act.subtle { background: none; color: var(--graphite-dim); }
.pk-name { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.pk-name input { min-width: 0; padding: 6px 10px; font: 700 28px/1.1 var(--f-hand); color: var(--ink); background: transparent; border: 0; border-bottom: 1.5px solid var(--paper-line); border-radius: 0; }
.pk-name input:focus { outline: none; border-bottom-color: var(--ink); }
.pk-name button[type="submit"] { font: 600 14px/1 var(--f-ui); padding: 0 14px; border-radius: 8px; cursor: pointer; color: var(--paper); background: var(--ink); border: 0; }

/* wpisywanie punktów bezpośrednio w pole kartki: cyfry rysuje kartka, a pole
   tekstowe leży niewidoczne nad polem kartki, żeby przyjmować klawiaturę systemową i sprzętową */
.entry { position: absolute; inset: 0; z-index: 30; pointer-events: none; }
.en-in {
  position: absolute; left: 0; top: 0; width: 1px; height: 1px; margin: 0; padding: 0;
  /* 16 px: Safari na iOS nie powiększa strony przy fokusie */
  font: 16px/1 var(--f-ui); color: transparent; caret-color: transparent; background: transparent;
  border: 0; outline: none; opacity: 0; pointer-events: none; -webkit-user-select: none; user-select: none;
}
.en-bar {
  position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6px; max-width: calc(100% - 16px);
  /* dotyk poza przyciskami trafia w kartkę pod paskiem (sąsiednie pola) */
  padding: 6px; border-radius: 12px; pointer-events: none;
  background: var(--glass); border: 1px solid var(--glass-line); color: var(--chalk);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}
.en-btn {
  min-width: 44px; height: 40px; padding: 0 12px; border-radius: 9px; cursor: pointer; flex: none;
  font: 600 15px/1 var(--f-ui); color: var(--chalk); background: rgba(255, 255, 255, 0.08); border: 1px solid var(--glass-line);
  touch-action: manipulation; pointer-events: auto;
}
.en-btn:hover { background: rgba(255, 255, 255, 0.16); }
.en-sign { font: 700 22px/1 var(--f-ui); }
.en-scratch[aria-pressed="true"] { background: var(--chalk); color: #1d1611; }
.en-next { background: var(--chalk); color: #1d1611; border-color: transparent; }
.en-next:hover { background: #fff; }
.en-hint { margin: 0 4px; min-width: 0; font-size: 14px; line-height: 1.25; color: var(--chalk-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.en-hint:empty, .entry.bad .en-hint { display: none; }
.en-err { margin: 0 4px; min-width: 0; font-size: 14px; line-height: 1.25; color: #ffb4a6; }
.en-err:empty { display: none; }

/* napięcie przy odrywaniu */
.tension { position: absolute; left: 0; top: 0; z-index: 40; pointer-events: none; display: flex; align-items: center; gap: 8px; }
.tension svg { width: 34px; height: 34px; transform: rotate(-90deg); }
.t-trk { fill: none; stroke: rgba(255, 255, 255, 0.22); stroke-width: 3; }
.t-val { fill: none; stroke: var(--chalk); stroke-width: 3.4; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; transition: stroke 0.15s; }
.tension.tearing .t-val { stroke: var(--rip); }
.tension span { font: 600 13px/1 var(--f-ui); white-space: nowrap; padding: 6px 9px; border-radius: 7px; background: var(--glass); color: var(--chalk); }
.tension.tearing span { color: #ffd9cc; }

/* adnotacja po zapisaniu */
.annot { position: absolute; z-index: 25; right: calc(14px + var(--inset, 0px)); bottom: 14px; width: min(316px, calc(100% - 28px - var(--inset, 0px))); }
.note {
  position: relative; padding: 20px 18px 16px; color: var(--graphite);
  background: repeating-linear-gradient(180deg, transparent 0 27px, rgba(70, 110, 170, 0.12) 27px 28px), linear-gradient(180deg, #fbf9f4, var(--paper));
  background-position: 0 8px, 0 0;
  border-radius: 3px 3px 6px 6px;
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.3);
  opacity: 0; transform-origin: 70% 0%;
}
.note-tape { position: absolute; top: -11px; left: 50%; width: 96px; height: 24px; margin-left: -48px; transform: rotate(-3deg); background: var(--tape); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); clip-path: polygon(2% 8%, 98% 0, 100% 92%, 0 100%); }
.note-top { display: grid; grid-template-columns: 40px 1fr; gap: 10px; align-items: center; }
.note-check { width: 40px; height: 40px; }
.note-check path, .ring path { fill: none; stroke: var(--ink); stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; }
.note-title { margin: 0; font: 700 22px/1.1 var(--f-display); color: var(--graphite); }
.note-title span { display: inline-block; clip-path: inset(0 100% 0 0); }
.note-meta { margin: 3px 0 0; font-size: 13px; color: var(--graphite-dim); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.note-rows { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 7px; }
/* dowolna liczba graczy: długa lista przewija się w karteczce */
.note-rows { max-height: min(300px, calc(100vh - 220px)); overflow: hidden auto; overscroll-behavior: contain; }
.note-rows li { display: grid; grid-template-columns: minmax(0, 80px) 1fr 52px; gap: 10px; align-items: center; opacity: 0; transform: translateX(10px); }
.note-rows .nm { font: 600 15px/1.1 var(--f-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-rows .meter { height: 7px; border-radius: 4px; background: rgba(43, 38, 34, 0.08); overflow: hidden; }
.note-rows .meter i { display: block; height: 100%; border-radius: inherit; background: rgba(43, 38, 34, 0.32); transform: scaleX(0); transform-origin: left; }
.note-rows li.win .meter i { background: var(--ink); }
.note-rows .sc { position: relative; text-align: right; font: 700 26px/1 var(--f-hand); color: var(--ink); font-variant-numeric: tabular-nums; }
.ring { position: absolute; right: -12px; top: 50%; width: 76px; height: 44px; margin-top: -23px; overflow: visible; }
.ring path { stroke-width: 2.4; }
.note-foot { margin: 14px 0 0; font-size: 14px; color: var(--graphite-dim); opacity: 0; }
.note-foot b { color: var(--graphite); font-weight: 700; }
.note.in { animation: note-in 0.75s cubic-bezier(0.2, 0.9, 0.25, 1.12) forwards; }
.note.in .note-check path { animation: draw 0.5s 0.38s ease-out forwards; }
.note.in .note-title span { animation: wipe 0.65s 0.5s cubic-bezier(0.4, 0, 0.3, 1) forwards; }
.note.in .note-rows li { animation: slide 0.45s calc(0.55s + var(--i) * 0.09s) ease-out forwards; }
.note.in .meter i { transition: transform 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) calc(0.65s + var(--i) * 0.09s); transform: scaleX(var(--w)); }
.note.in .ring path { animation: draw 0.7s 1.55s ease-in-out forwards; }
.note.in .note-foot { animation: fade 0.5s 1.4s forwards; }
.note.out { animation: note-out 0.45s ease-in forwards; }
.note.still { animation: none; opacity: 1; transform: rotate(-1deg); }
.note.still .note-title span { clip-path: none; animation: none; }
@keyframes note-in {
  0% { opacity: 0; transform: translate(48px, 42px) rotate(9deg) scale(0.9); }
  55% { opacity: 1; transform: translate(-4px, -6px) rotate(-2.6deg) scale(1.015); }
  78% { transform: translate(1px, 1px) rotate(-0.6deg); }
  100% { opacity: 1; transform: rotate(-1.2deg); }
}
@keyframes note-out { to { opacity: 0; transform: translate(36px, 28px) rotate(6deg) scale(0.9); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes wipe { to { clip-path: inset(0 -4% 0 0); } }
@keyframes slide { to { opacity: 1; transform: none; } }
@keyframes fade { to { opacity: 1; } }
.hist-top { grid-template-columns: 1fr auto; }
.note-close { width: 30px; height: 30px; border: 0; border-radius: 8px; cursor: pointer; background: none; color: var(--graphite-dim); font: 400 22px/1 var(--f-ui); }
.note-close:hover { background: rgba(0, 0, 0, 0.06); color: var(--graphite); }
.hist { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; max-height: 260px; overflow-y: auto; }
.hist li { display: grid; gap: 3px; padding-bottom: 9px; border-bottom: 1px dashed var(--paper-line); }
.hist li:last-child { border-bottom: 0; padding-bottom: 0; }
.h-meta { font-size: 12.5px; color: var(--graphite-dim); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.h-res { display: flex; flex-wrap: wrap; gap: 4px 12px; font: 600 14px/1.3 var(--f-ui); }
.h-res b { font: 700 20px/1 var(--f-hand); color: var(--ink); margin-left: 2px; }
.h-res .w { text-decoration: underline; text-decoration-color: var(--ink); text-underline-offset: 4px; text-decoration-thickness: 1.5px; }
.chip {
  position: absolute; z-index: 24; right: 14px; bottom: 14px;
  display: inline-flex; align-items: center; gap: 9px; padding: 6px 14px 6px 6px;
  font: 600 14px/1 var(--f-ui); color: var(--chalk);
  background: var(--glass); border: 1px solid var(--glass-line); border-radius: 999px;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); cursor: pointer;
}
.chip:hover { border-color: rgba(255, 228, 196, 0.32); }
.chip-n { min-width: 28px; height: 28px; padding: 0 4px; border-radius: 50%; background: var(--paper); color: var(--ink); font: 700 20px/28px var(--f-hand); text-align: center; }
.chip.pop { animation: pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.5); }
@keyframes pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: none; opacity: 1; } }

.loading { position: absolute; inset: 0; display: grid; place-items: center; z-index: 50; background: var(--room); color: var(--chalk-dim); font: 600 16px/1.4 var(--f-ui); letter-spacing: 0.04em; transition: opacity 0.6s ease; text-align: center; padding: 0 24px; }
.sp.ready .loading { opacity: 0; pointer-events: none; }

.sp.narrow .tpl-name { font-size: 16px; }
.sp.narrow .help li { font-size: 12.5px; }
.sp.narrow .annot { right: 10px; bottom: 10px; width: calc(100% - 20px); }

.dlg { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(8, 6, 4, 0.6); }
.dlg-card { width: min(560px, 100%); display: grid; gap: 10px; padding: 18px; border-radius: 12px; background: var(--paper); color: var(--graphite); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
.dlg-card h2 { margin: 0; font: 700 20px/1.1 var(--f-display); }
.dlg-msg { margin: 0; font-size: 14px; color: var(--graphite-dim); }
.dlg textarea { width: 100%; height: 200px; resize: vertical; font: 12px/1.35 ui-monospace, Menlo, monospace; padding: 8px; border: 1px solid var(--paper-line); border-radius: 8px; background: #fff; color: var(--graphite); }
.dlg-acts { display: flex; justify-content: flex-end; gap: 8px; }
.dlg-acts button { font: 600 14px/1 var(--f-ui); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--paper-line); background: #fff; color: var(--graphite); cursor: pointer; }
.dlg-acts button[data-d="copy"] { background: var(--ink); border-color: var(--ink); color: #fff; }

@media (prefers-reduced-motion: reduce) {
  .note.in, .note.out { animation: none; opacity: 1; transform: rotate(-1.2deg); }
  .note.in .note-check path, .note.in .ring path { animation: none; stroke-dashoffset: 0; }
  .note.in .note-title span { animation: none; clip-path: none; }
  .note.in .note-rows li, .note.in .note-foot { animation: none; opacity: 1; transform: none; }
  .note.in .meter i { transition: none; }
  .picker, .chip.pop { transition: none; animation: none; }
}
/* przyciski narzędzi (np. tryb debugowania z pakietu edytora) */
.tools { position: absolute; top: 12px; right: calc(12px + var(--inset, 0px)); z-index: 22; display: flex; gap: 6px; transition: right 0.25s ease; }
.tool-btn {
  width: 40px; height: 40px; display: grid; place-items: center; border-radius: 10px; cursor: pointer;
  background: var(--glass); border: 1px solid var(--glass-line); color: var(--chalk);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.tool-btn svg { width: 20px; height: 20px; }
.tool-btn[aria-pressed="true"] { background: var(--chalk); color: #1d1611; }
`;
