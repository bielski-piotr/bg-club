# BG Club — Design System

Źródło: plik Paper "bg-club" (odczyt 2026-11-12). Wartości pochodzą z get_jsx / get_computed_styles. Czytaj ten plik zamiast ponownie pobierać dane z Paper; aktualizuj go, gdy zmienia się język wizualny. Wzorcowy JSX komponentów: `design/reference-jsx/`.
Paper file id: 01M75APESFSP8980YWVTY0EAXT.
Strony Leaderboard, Game collection, Members i Profile odczytano 2026-11-12; projekty Spotkań (30 artboardów) pochodzą z generatora, nie z odczytu Paper. Source HTML and generator for the Meetings designs are in `design/meetings/` (`_build.mjs`, `manifest.json`, `_PAPER-INSTRUCTIONS.md`).

## 0. Important facts first
- **The file's design tokens are not used anywhere.** The file holds the stock Tailwind v4 token set (gray/blue oklch scales, text-xs…9xl, radius-xs…4xl, `--font-sans: "Inter"`), but `find_nodes` for any `var(--…)` returns 0 hits. Every design uses **hard-coded hex values** and the fonts below. Inter is **not** used. Copy the hex values, not the tokens.
- **Light theme only.** There are no dark artboards and no "Light/Dark" suffix in any name.
- **No section labels or text on the canvas.** Pages hold only artboards.
- **Meetings page** (`p-6-0`): holds 30 artboards for "Aktywne/najbliższe spotkanie" (see §1). They have not been visually reviewed yet. New components are in §8–§11 and §15. The **Club Hub** page (`p-8-0`) is empty.
- One existing reference to meetings is the "Meeting link" row inside "Kolekcja / Karteczka / Desktop": a calendar icon in a #EEF2FF circle, the meeting title "Listopadowe granie" and the subtitle "Spotkanie · 8 lis 2026, 18:00" (see jsx-h-components.txt h8). Removing a member says they "znikną … z zaplanowanych spotkań", so planned meetings have a member list.

## 1. Pages and artboards

| Page | id | Artboards (name — W×H — x,y) |
|---|---|---|
| Leaderboard | p-2-0 | Ranking / Widżet / Desktop — 880×833 — -432,-439 · Ranking / Widżet / Mobile — 375×674 — 964,-359 · Ranking / Popup / Desktop — 1280×900 — -632,528 · Ranking / Popup – filtr roku / Desktop — 1280×900 — -632,1590 · Ranking / Popup / Mobile — 375×812 — 964,600 · Ranking / Popup – filtr roku / Mobile — 375×812 — 964,1634 |
| Game collection | p-3-0 | Kolekcja / Widżet / Desktop — 880×fit — -432,-439 · Kolekcja / Widżet / Mobile — 375×fit — 964,-360 · Kolekcja / Popup / Desktop — 1280×900 — -554,478 · Kolekcja / Popup / Mobile — 375×812 — 905,528 · Kolekcja / Popup – wyszukiwanie / Mobile — 375×812 — 1459,528 · Kolekcja / Usuń grę – potwierdzenie — 480×400 — 1951,734 · Kolekcja / Szczegóły gry / Desktop — 1280×fit — -554,1590 · Kolekcja / Szczegóły gry / Mobile — 375×fit — 964,1590 · Kolekcja / Karteczka / Desktop — 1280×900 — -632,3900 · Kolekcja / Karteczka / Mobile — 375×812 — 964,3944 · Kolekcja / Edytuj grę / Desktop — 1280×900 — -632,4960 · Kolekcja / Dodaj grę / Mobile — 375×812 — 956,5004 |
| Members | p-4-0 | Członkowie / Widżet / Desktop — 880×fit — -432,-439 · Członkowie / Widżet / Mobile — 375×fit — 964,-360 · Członkowie / Widżet – do 5 członków — 375×fit — 1459,-360 · Członkowie / Widżet – pusty stan (admin) — 375×fit — 1954,-360 · Członkowie / Popup / Desktop — 1280×900 — -632,528 · Członkowie / Popup / Mobile — 375×812 — 964,572 · Członkowie / Popup – wyszukiwanie / Mobile — 375×812 — 1459,572 · Członkowie / Usuń członka – potwierdzenie — 480×420 — 1954,778 · Członkowie / Dodaj członka / Desktop — 1280×900 — -632,1590 · Członkowie / Dodaj członka / Mobile — 375×812 — 964,1634 · Członkowie / Konto utworzone / Desktop — 1280×900 — -632,2652 · Członkowie / Konto utworzone / Mobile — 375×812 — 964,2696 |
| Profile | p-7-0 | Profil / Menu awatara — 480×fit — -232,-439 · Profil / Powiadomienia (toasty) — 480×fit — 964,-439 · Profil / Popup / Desktop — 1280×fit — -632,528 · Profil / Popup / Mobile — 375×fit — 964,528 · Profil / Popup – inny gracz / Mobile — 375 — 1459,528 · Profil / Popup – usunięty członek / Mobile — 375 — 1954,528 · Profil / Filtr roku — 480 — 2449,528 · Profil / Osiągnięcie – szczegóły — 480 — 3049,528 · Profil / Ustawienia / Desktop — 1280 — -632,2766 · Profil / Ustawienia / Mobile — 375 — 964,2766 · Profil / Ustawienia – zdjęcie i konto gracza — 480 — 1459,2766 · Profil / Kadrowanie awatara — 480 — 2059,2766 · Profil / Zmiana hasła — 480 — -632,3834 · Profil / Zmiana hasła – błędy — 480 — -32,3834 · Profil / Usuń konto – potwierdzenie hasłem — 480 — 568,3834 · Profil / Pierwsze logowanie – własne hasło — 480 — 1168,3834 |
| Meetings | p-6-0 | Spotkania / Widżet / Desktop — 880×fit — -432,-439 · Spotkania / Widżet / Mobile — 375×fit — 964,-439 · Spotkania / Widżet – gramy w — 375×fit — 1459,-439 · Spotkania / Widżet – w trakcie — 375×fit — 1954,-439 · Spotkania / Widżet – pusty stan (admin) — 375×fit — 2449,-439 · Spotkania / Widżet – pusty stan (gracz) — 375×fit — 2944,-439 · Spotkania / Popup – głosowanie / Desktop — 1280×fit (min 900) — -632,528 · Spotkania / Popup – głosowanie / Mobile — 375×fit (min 812) — 964,528 · Spotkania / Popup – głosowanie (gracz) / Mobile — 375×fit — 1459,528 · Spotkania / Popup – gramy w / Desktop — 1280×fit — -632,1640 · Spotkania / Popup – gramy w / Mobile — 375×fit — 964,1640 · Spotkania / Popup – w trakcie / Desktop — 1280×fit — -632,2752 · Spotkania / Popup – w trakcie / Mobile — 375×fit — 964,2752 · Spotkania / Popup – w trakcie (gracz) / Mobile — 375×fit — 1459,2752 · Spotkania / Zaplanuj spotkanie / Desktop — 1280×fit — -632,4764 · Spotkania / Zaplanuj spotkanie / Mobile — 375×fit — 964,4764 · Spotkania / Zaplanuj spotkanie – wybór daty i godziny — 480×fit — 1459,4764 · Spotkania / Opublikuj gry / Desktop — 1280×fit — -632,6176 · Spotkania / Opublikuj gry / Mobile — 375×fit — 964,6176 · Spotkania / Nowa partia – gracze / Desktop — 1280×fit — -632,7238 · Spotkania / Nowa partia – gracze / Mobile — 375×fit — 964,7238 · Spotkania / Nowa partia – wybór gry — 375×fit — 1459,7238 · Spotkania / Nowa partia – wybór notesu — 375×fit — 1954,7238 · Spotkania / Rozpocznij spotkanie – potwierdzenie — 480×fit — -632,8300 · Spotkania / Zakończ spotkanie – potwierdzenie — 480×fit — -32,8300 · Spotkania / Zakończ spotkanie – partie w toku — 480×fit — 568,8300 · Spotkania / Usuń spotkanie – potwierdzenie — 480×fit — 1168,8300 · Spotkania / Porzuć partię – potwierdzenie — 480×fit — 1768,8300 · Spotkania / Menu spotkania — 480×fit — 2368,8300 · Spotkania / Powiadomienia (toasty) — 480×fit — 2968,8300 |
| Club Hub | p-8-0 | (empty) |

Meetings y rows: **-439** (widgets), **528** (głosowanie), **1640** (gramy w), **2752** (w trakcie), **4764** (zaplanuj), **6176** (opublikuj gry), **7238** (nowa partia), **8300** (dialogi, menu, toasty). Heights are **fit-content** on this page (popups keep min-height 900 / 812, see §2). Mobile artboards are top-aligned with their desktop twin (same y), not vertically centered as on other pages; mobile widgets sit at y -439, not -360.

## 2. Naming and canvas layout conventions
- **Names are in Polish**: `<Feature> / <Surface>[ – <state/variant>] / <Desktop|Mobile>`. The feature names are Ranking, Kolekcja, Członkowie and Profil. The surfaces are `Widżet`, `Popup`, a named flow (`Dodaj członka`, `Edytuj grę`, `Szczegóły gry`, `Karteczka`, `Konto utworzone`), or a dialog name.
  - A variant joins with an en dash and spaces: `Popup – filtr roku`, `Widżet – pusty stan (admin)`, `Usuń członka – potwierdzenie`.
  - Single-size dialogs and state sheets have **no Desktop/Mobile suffix**, e.g. `Członkowie / Usuń członka – potwierdzenie` or `Profil / Zmiana hasła – błędy`.
  - The feature name for Meetings is **"Spotkania"** (e.g. `Spotkania / Widżet / Desktop`).
- **Artboard sizes**:
  - Desktop widget: **880** wide, fit-content height. The artboard is a #F3F4F8 "page" with paddingBlock 64 and a centered card 520 wide.
  - Mobile widget: **375** wide, fit-content height. Artboard bg #F3F4F8, padding 24/16, card 343 wide.
  - Desktop popup or flow: **1280×900**. Artboard bg #F3F4F8 plus an absolute **Scrim** (1280×900, #161A2B80) and a centered Modal.
  - Mobile popup or flow: **375×812**, a white full-screen sheet with no scrim.
  - Small dialog, confirmation or state sheet: **480** wide (480×400/420, or fit). Artboard bg is a flat **#858792**, which stands in for the scrim over the app, with a centered 343-wide dialog.
  - Toast or menu showcase: 480 wide, bg #F3F4F8, paddingBlock 48.
  - **Deviations on the Meetings page:**
    - Desktop popup artboards (1280) use a flat **#858792** background instead of #F3F4F8 plus a Scrim layer (visually identical: ink at 50% over the page color). They have fit-content height, **min-height 900**, paddingBlock 64, and the modal is centered.
    - Mobile sheets (375) are white, fit-content, **min-height 812**.
    - 480-wide dialogs (#858792, paddingBlock 56) are fit-content with no min-height. The menu showcase (gap 16) and toasts (gap 12) are #F3F4F8, paddingBlock 48.
    - The date/time picker artboard is 480 wide, #F3F4F8, padding 48/24, gap 8.
    - Popup modals: 880 wide (meeting popup, two columns with gap 28, right column 300) or 560 wide (forms).
- **Grid on canvas**:
  - Columns:
    - The desktop column has x = **-632** for 1280-wide artboards and x = **-432** for 880-wide widgets, so widgets are centered on the 1280 column.
    - The first mobile column is at x = **964**.
    - Further mobile or 375 variants step **+495** (375 + 120 gap): 1459, 1954, 2449…
    - 480-wide dialogs step **+600** (480 + 120): e.g. -632, -32, 568, 1168 on Profile.
  - Rows:
    - Widgets are at y = **-439** (desktop).
    - The first popup row is at y = **528**.
    - Each following row is **+1062** (900 + 162 gap): 1590, 2652. Larger gaps are used when artboards are taller (e.g. Collection 3900, 4960).
    - A mobile artboard is **vertically centered** against its desktop twin in the same row. For example, a desktop popup at y 528 (h 900) has its mobile twin at y 572 (h 812), +44. The mobile widget is at y -360 vs the desktop widget at -439.
- **Meetings page:** columns as above (desktop x -632 / -432, mobile x 964, variants 1459, 1954, 2449, 2944); rows are listed under §1 and the gaps are larger than on other pages because the artboards are taller. Append new Meetings artboards below y 8300 or to the right of an existing row.

## 3. Color (hard-coded hex)
| Role | Value |
|---|---|
| App/page background (artboard) | **#F3F4F8** |
| Card / modal / sheet / input bg | **#FFFFFF** |
| Card/modal/input border, outline-button border, inactive tab border | **#E4E7F0** (1px) |
| Tinted surface: list tray, icon-button bg, search field, read-only input, neutral chip, "+N" avatar | **#F1F3F9** |
| Text primary / ink, dark active tab bg, toast bg | **#161A2B** |
| Text secondary/muted (labels, meta, placeholders, icon strokes) | **#6B7188** |
| Disabled / removed-member avatar, scrollbar thumb | **#C9CDDA** |
| **Accent / primary** (buttons, links, focus border, current-user row, rank rings) | **#2F54EB** |
| Accent tint: selected menu item bg, icon circle | **#EEF2FF** |
| Accent tint: "Admin" chip bg | **#EAF0FF** |
| Danger (destructive button, error border/text, delete icon) | **#D63A3A** |
| Danger tint (destructive dialog icon circle) | **#FDECEC** |
| Warning banner bg / icon stroke / text | **#FFF4D6** / **#8A5A00** / **#6B4500** |
| Success check in toast | **#7CE0A3** (on dark toast) |
| Error icon in toast | **#FFB4B4** (on dark toast) |
| Scrim (desktop popups) | **#161A2B80** (ink at 50%) |
| White text on accent at 90% | #FFFFFFE6 |
| Avatar / game-cover palette (white monogram on top) | #E09F1F amber · #E4572E vermilion · #C8553D brick · #6C8E3B olive · #2E86AB teal-blue · #8E5BD6 purple · #3A9D6E green · #D9479A pink · #4B6BDB blue · #2A9D8F teal |

| **Success** (live state, "Prowadzi" badge, positive streak, live play card text) | **#1F7A4D** on **#E3F5EA** |
| Dimmed artboard bg (Meetings popups/dialogs) | #858792 |
| Score-sheet thumbnail | paper #FBF7EC, border #E8DFC8, text lines #D9CFB4, top band = game color |
| Neutral-game thumbnail (e.g. Terraformacja Marsa) | bg #F1F3F9 with initial in #6B7188 |

Status vocabulary: accent (#2F54EB on #EAF0FF/#EEF2FF), neutral (#6B7188 on #F1F3F9), warning (#6B4500 on #FFF4D6), danger (#D63A3A on #FDECEC), success (#1F7A4D on #E3F5EA).
Meeting status chips (§11): **Głosowanie otwarte** (voting open) = accent #2F54EB on #EAF0FF; **Gry wybrane** (games chosen) = ink #161A2B on #F1F3F9; **W trakcie** (in progress) = success #1F7A4D on #E3F5EA. Summary badges: win = accent on #EAF0FF, streak up = success, streak broken = danger #D63A3A on #FDECEC, streak unchanged = neutral.

## 4. Typography
Fonts: **Bricolage Grotesque** (display, titles, numbers), **Instrument Sans** (all UI text), **DM Mono** (only the login "hook"). Fallback stacks are `"<font>", system-ui, sans-serif`. The root sets `fontSize 12px / lineHeight 16px`, antialiased. Numbers use `fontFeatureSettings: "tnum"`.

| Role | Font | Size/LH | Weight | Color |
|---|---|---|---|---|
| Widget/Modal title (desktop) | Bricolage | 24/30 | 700 | #161A2B |
| Widget/Sheet title (mobile) | Bricolage | 22/28 | 700 | #161A2B |
| Small dialog title | Bricolage | 20/26 | 700 | #161A2B |
| Featured item title | Bricolage | 28/32 | 700 | #161A2B |
| Big numbers (podium) | Bricolage | 26/30, 20/24 | 700 | #161A2B |
| Row number / score / stepper value | Bricolage | 16/20 (stepper 18/22) | 700 | #161A2B |
| Title count next to title ("12 osób") | Instrument | 14/18 | 500 | #6B7188 |
| Link "Zobacz więcej", button labels, tab labels | Instrument | 14/18 | 600 | #2F54EB / #FFF / #161A2B |
| Row primary text (name) | Instrument | 15/20 | 500 | #161A2B |
| Emphasized line (empty state title, meeting title) | Instrument | 15/20 | 600 | #161A2B |
| Row secondary / meta | Instrument | 13/16 | 500 | #6B7188 |
| Body/description in dialogs | Instrument | 14/20 | 500 | #6B7188 |
| Helper text in empty state / upload | Instrument | 13/18 | 500 | #6B7188 |
| Field label | Instrument | 13/16 | **600** | #6B7188 |
| Input value | Instrument | 15/20 | 500 | #161A2B |
| Hint / error under field | Instrument | 12/16 | 500 | #6B7188 / #D63A3A |
| Eyebrow (accent, e.g. "Ostatnio grana · 8 lis") | Instrument | 13/16 | 600 | #2F54EB |
| Chip (row badge) | Instrument | 11/14 | 600 | — |
| Unit after number ("pkt") | Instrument | 12/16 | 500 | #6B7188 |
| Monogram in avatar | Instrument | 600, scales with the avatar (see §8) | | #FFFFFF |

## 5. Radii, shadows, spacing
- **Radii**: widget card **28** (desktop) / **24** (mobile). Modal **28**. Small dialog **24**. List tray **22**. Toast **16** (achievement toast 20). Dropdown menu **16** with items **10**. Game cover large **18**. Rows, inputs and banners **14**. Game thumbnail 36px uses radius **10**. Pills, buttons, chips, tabs, avatars and the search field are **999**.
- **Shadows** (all tinted navy #1E285A):
  - Widget card: `#1E285A47 0 20px 48px -28px`
  - Modal / dialog: `#1E285A59 0 32px 80px -24px`
  - Dropdown menu: `#1E285A40 0 16px 40px -12px`
  - Toast: `#1E285A59 0 16px 40px -16px`
  - Rows, inputs and buttons have no shadow.
- **Spacing values in use**: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 64.
  - Card padding is 28 (desktop) / 16 (mobile). Modal padding is 28. Small dialog padding is 24.
  - Section gaps are paddingTop 20–24 between header, controls and body, and 28 before the modal footer.
  - Tray padding is 10 with gap 6 between rows. Row padding-inline is 14, with an inner gap of 12.
  - Gap between a label and its input is 8; between fields, 16–20.

## 6. Widget card anatomy (desktop 520 / mobile 343)
- Card: bg #FFF, 1px #E4E7F0, radius 28 (mobile 24), padding 28 (mobile 16), widget shadow.
- **Header row** (space-between):
  - Left: a baseline group with gap 10, holding the title (Bricolage 24/30, mobile 22/28) and an optional count (Instrument 14/18/500 #6B7188).
  - Right: the **"Zobacz więcej" link**, Instrument 14/18/600 #2F54EB, plus a 16px chevron-right (stroke #2F54EB, width 2), gap 2. The link is hidden in empty state.
- Optional **pill tabs** row: paddingTop 20, gap 8 (see §10).
- Body:
  - Ranking: a podium, then a **list tray**: bg #F1F3F9, radius 22, padding 10, gap 6. Its rows are white, radius 14, **h54**, paddingInline 14, gap 12.
  - Collection: a featured game block, then the list tray.
  - Members: an overlapping avatar stack plus a caption line ("**Bartek, Ania, Ewa, Julia** i 8 innych osób", where the names are #161A2B/600 and the rest #6B7188/500, 14/20).
- **Ranking row slots** (all fixed widths): position 28 (Instrument 14/600 #6B7188, tnum), avatar 36, name (flex 1, ellipsis), score 88 (right-aligned, Bricolage 16/700 + "pkt" 12/500 #6B7188).
- **Current-user row**: bg #2F54EB, all text white, avatar with 2px white ring, a white "Ty" chip with #2F54EB text, and the unit at #FFFFFFE6.
- **Mobile widget**: same structure. Card 343, padding 16, radius 24, title 22/28, avatars in the stack 56 (vs 64 on desktop). Artboard padding 24/16.
- **Empty state (admin)**: same header without the link. Then a body row (paddingTop 20, gap 14): a 56px avatar of the current user plus two lines, the title "Na razie jesteś tu tylko Ty" (15/20/600) and a helper (13/18/500 #6B7188). Then the CTA (paddingTop 20): a **full-width primary pill**, h44, + icon, "Dodaj członka".
- **Members widget variant "do 5 członków"** exists (375). It shows the stack without a "+N" counter (not extracted in detail).

## 7. Popup / modal anatomy
- **Desktop (1280×900 artboard)**:
  - Scrim: #161A2B80, full size.
  - Modal: **560 wide** (list/form) or **880 wide** (Edytuj grę, Karteczka, two-column body), height 800 (scrolling list) or fit-content (forms). Padding 28, radius 28, 1px #E4E7F0, shadow `#1E285A59 0 32px 80px -24px`, overflow clip.
  - **Header** (no fixed height; the 36px buttons set it), space-between:
    - Left: the title group (24/30 Bricolage + count 14/18 #6B7188, baseline gap 10). In sub-flows, a **back button** (36 circle #F1F3F9, chevron-left #161A2B) comes before the title, gap 12.
    - Right: actions with gap 8. An optional **primary pill h36** (paddingInline 16, gap 6, + icon) and a **close button** (36 circle #F1F3F9 with an X 16px, stroke #161A2B, width 2).
  - Then optional controls: tabs + select (paddingTop 20) or search (paddingTop 20).
  - Then the list (paddingTop 20; tray as in §6, member rows **h64**).
  - A scrolling list shows a **bottom fade** (absolute, h72, white 0→100% gradient) and a **scrollbar thumb** (4×72, radius 999, #C9CDDA, right 10).
  - **Footer** (forms): paddingTop 28, buttons **right-aligned**, gap 8, Anuluj (secondary) then the primary, both h44, paddingInline 20. There is no divider line and no footer background.
- **Mobile (375×812)**: a full-screen white sheet, no scrim, no radius, no shadow.
  - Header **h60**, padding 12/16, title 22/28 on its own (the count moves to a separate line below the search: 13/16/500 #6B7188, paddingTop 12).
  - Header actions: a short primary pill "Dodaj" (h36) plus a close (36).
  - Search wrapper paddingTop 4, paddingInline 16. The list has paddingInline 16 and paddingTop 12, with the same tray and rows.
  - Bottom fade h56. Mobile forms (Dodaj członka / Mobile) exist with 3 children: header, body, footer (not extracted).
- **Small dialog** (confirmations, password forms):
  - Card 343 wide, padding 24, radius 24, **no border**, modal shadow. Shown on a 480-wide #858792 artboard.
  - No close button.
  - Content: an optional icon circle 44, then the title 20/26 (paddingTop 16), then the description 14/20 #6B7188 (paddingTop 8).
  - Footer paddingTop 24 with **two equal-width buttons** (flex 1, h44, gap 8): Anuluj and the action.
- **Dropdown/context menu**:
  - Panel: 200 wide, white, 1px #E4E7F0, radius 16, padding 6, menu shadow, absolutely positioned near its trigger.
  - Items: h40, radius 10, paddingInline 12, gap 10, a 16px icon (stroke #6B7188, width 1.75) and 14/18/500 #161A2B text.
  - Destructive item: icon and text #D63A3A.
  - Selected item: bg #EEF2FF, text #2F54EB/600, and a check icon on the right.

## 8. Avatars (monogram style)
- A circle (radius 999) filled with a palette color from §3, holding a **white 2-letter monogram** in Instrument Sans 600 (first + last initial, e.g. "BW", "ŁŻ").
- Sizes and monograms:

| Avatar | Monogram |
|---|---|
| 20 | 9/12 (Meetings, voter stack) |
| 24 | 10/12 (winner inline, result rows) |
| 28 | 11/14 (Meetings, live card stack, achievement) |
| 32 | 13/16 (Meetings, seat row) |
| 36 | 14/18 (ranking/game rows) |
| 40 | 15/20 (member rows in popup) |
| 56 | 20/24 (mobile stack / empty state) |
| 64 | 18/22 (desktop stack, with paddingRight 12 so the letters sit left of the overlap) |
| 88 | 30/36 (form upload) |
| podium 80 / 104 | 26/30 and 34/40, inside a 3px #2F54EB ring with a 3px white gap |

- **Avatar stack**: absolute positioning, 64px avatars spaced **52px apart** (12px overlap), each with a **3px white border**.
  - The last bubble is the "+N" counter: bg #F1F3F9, Bricolage 20/24/700 #161A2B.
  - On mobile the avatars are 56px (stack 240 wide).
- **Compact stack (Meetings)**: absolute positioning in a relative container of height = avatar size and width = size + (n−1)·(size−overlap); avatar i at left = i·(size−overlap); each avatar has a **2px white border**. Sizes/overlap: **20/6** (voters), **24/8** (play rows), **28/8** (live card), **36/8** (widget and popup participants). No "+N" bubble.
- Rank badge: a circle 26 (or 30 for 1st) at the bottom center of the ring. It is white with a 2px #2F54EB border and #2F54EB number, or (for 1st) #2F54EB fill with a white border and white number. A crown SVG (36×26, filled #2F54EB) sits above 1st place.
- Removed member: avatar #C9CDDA, name #6B7188 + " (usunięty)", position "–", and the score also in #6B7188.
- **Upload affordance**: a 30px white circle with a 1px #E4E7F0 border at the bottom-right (-2, -2) with an upload arrow. Next to it, an accent link "Dodaj zdjęcie" (15/20/600 #2F54EB) and two helper lines.

## 9. Buttons
| Variant | Style |
|---|---|
| Primary | bg #2F54EB, radius 999, **h44** (footer/CTA) or **h36** (header), paddingInline 20 (h44) / 16 (h36), text Instrument 14/18/600 #FFF, optional 16px leading icon with gap 6 |
| Secondary (outline) | transparent, 1px #E4E7F0, radius 999, h44, paddingInline 20 (16 in small dialogs), text 14/18/600 #161A2B |
| Destructive | bg #D63A3A, otherwise like primary |
| Icon button (close, back, more, stepper ±) | circle, bg #F1F3F9, **36** (header/stepper) or **32** (row "more" ⋯), 16px glyph #161A2B, stroke width 2 |
| Text link | 14/18/600 #2F54EB + chevron-right 16px, gap 2 |
| Full-width CTA | primary h44 with width 100% (empty states) |

Sizes used on Meetings: **h44** (paddingInline 20, text 14/18), **h36** (paddingInline 16, text 14/18, e.g. "Wróć do notesu", "Porzuć"), **h32** vote toggle (see §15). A button with h<36 would use paddingInline 12 and text 13/16, but none is used. On a tinted admin box the outline button gets bg #FFF. In confirmation dialogs both buttons are flex 1 with paddingInline 12. Leading icons used: play, plus, flag, pad (notes), with gap 6.

There are no hover or disabled button variants in the file.

## 10. Inputs and controls
- **Text input**: h48, bg #FFF, 1px #E4E7F0, radius 14, paddingInline 14. Value is 15/20/500 #161A2B. A trailing icon (e.g. eye) is 16px, gap 10.
  - The label sits above, 13/16/**600** #6B7188, paddingBottom 8.
  - Hint below: paddingTop 8, 12/16/500 #6B7188.
- **Focus**: border **1.5px #2F54EB**.
- **Error**: border **1.5px #D63A3A** and a hint in #D63A3A 12/16/500, worded as a plain-language sentence ("Hasła nie są takie same.").
- **Read-only / generated value**: bg #F1F3F9, no border, radius 14, h48 (DM Mono for the hook).
- **Search field**: h44, pill (999), bg #F1F3F9, paddingInline 16, gap 10, magnifier 16px (stroke #6B7188, width 2), placeholder 15/20/500 #6B7188 ending in "…".
- **Stepper**: h48 input frame, paddingInline 6, space-between. It has two 36px #F1F3F9 circular buttons (− / +) and a value in Bricolage 18/22/700, tnum.
- **Pill tabs / segmented filter**: gap 8, each pill padding 8/16, radius 999, 14/18/600.
  - Active: bg and border #161A2B, text #FFF (**dark, not accent**).
  - Inactive: 1px #E4E7F0, text #6B7188.
- **Select trigger** (year filter): pill h36, paddingInline 12, gap 6, a leading calendar icon #6B7188, value 14/18/600 #161A2B, and a chevron.
  - Open: border 1px #2F54EB and a chevron-up in #2F54EB.
  - The options open in the dropdown menu from §7.
- **Warning banner**: bg #FFF4D6, radius 14, padding 12/14, gap 10, alert-triangle 16px #8A5A00, text 13/18/500 #6B4500.
- **Info banner** (accent tint, next to the warning banner): bg #EEF2FF, radius 14, padding 12/14, gap 10, check icon 16px #2F54EB, text 13/18/500 #161A2B.
- **Date / time field**: the standard input (h48) with a leading calendar/clock icon (16px, #6B7188, stroke 1.75); in the picker artboard both are in the focus state (1.5px #2F54EB). Date flexes; time is 160 wide (desktop form), 120 (mobile form), 140 (picker artboard). Optional field: label "Prowadzący (opcjonalnie)" with a leading 24px avatar and a trailing chevron-down.
- Checkbox, radio, date picker calendar, time dropdown, member selection row: see §15. There is still no toggle switch.

## 11. Chips / badges
- **Row badge**: pill, padding 2/8, 11/14/600.
  - Admin: bg #EAF0FF, text #2F54EB.
  - Ty (you): bg #F1F3F9, text #6B7188. On the accent row it is bg #FFF with text #2F54EB.
- **Meta chip** (game details): pill h28, paddingInline 10, bg #F1F3F9, gap 6, optional 14px icon #6B7188, text 13/16/600 #161A2B ("1–5 graczy", "14 partii"). Reused in the meeting popup with the calendar, clock (circle with hands, `circle 8,8 r5.5` + `M8 5V8L10 9.5`) and user icons (stroke 1.75): date, time, "Prowadzi Ania Wiśniewska". Mobile date: "sob., 28 lis 2026".
- **Status chip with dot**: pill h24, paddingInline 10, gap 6, a 6×6 dot plus text 12/16/600, both in the chip's foreground color (colors in §3). Texts: "Głosowanie otwarte", "Gry wybrane", "W trakcie" (popup) / "Trwa" (live widget header). Other badges: "Prowadzi" = #1F7A4D on #E3F5EA (row badge 11/14/600); "Dla 2 graczy" = #6B4500 on #FFF4D6.

## 12. Toasts
- Width 343, radius 16, padding 12/16, gap 10, toast shadow `#1E285A59 0 16px 40px -16px`.
- **Standard toast**: bg **#161A2B** (dark), white 14/18/600 text, a 16px leading icon.
  - Success: check, stroke #7CE0A3.
  - Neutral (copied): copy icon, stroke #FFF.
  - Error: triangle, stroke #FFB4B4.
- **Rich toast** (achievement): white, 1px #E4E7F0, radius 20, padding 12 left / 16 right, gap 12.
  - It has a 44px colored icon circle, an eyebrow 12/16/600 #6B7188, a title in Bricolage 16/20/700, and a trailing "Zobacz ›" link.

## 13. Icons
- All icons are **inline SVG, hand-drawn line icons** on a **16×16 viewBox** (rendered at 14, 16, 20 or 22 px).
- Strokes use `fill="none"`, `strokeLinecap="round"` and `strokeLinejoin="round"`.
- **Stroke width**:
  - **2** for UI glyphs: chevrons, X, +, −, check, search.
  - **1.75** for pictograms: user, trash, calendar, eye, copy, alert.
- Colors: #161A2B on neutral buttons, #6B7188 for decorative/leading icons, #2F54EB for links/accent, #D63A3A for danger, white on fills.
- No icon library is used. Useful existing paths:
  - Calendar: `rect x2.5 y3.5 w11 h10 rx2` + `M2.5 7H13.5M5.5 2V5M10.5 2V5`
  - Chevron-right: `M6 4L10 8L6 12`
  - Plus: `M8 3V13M3 8H13`
  - X: `M4 4L12 12M12 4L4 12`
  - Back: `M10 4L6 8L10 12`
  - Trash: `M3 4.5H13M6.5 4.5V3H9.5V4.5M4.5 4.5L5 13H11L11.5 4.5`
  - User: `circle 8,5.5 r2.5` + `M3.5 13C3.9 10.8 5.7 9.5 8 9.5C10.3 9.5 12.1 10.8 12.5 13`
  - More: 3 dots `r1.25` at x 3.5/8/12.5

## 14. Illustration / imagery style
- There are no photos and no illustrations. "Images" are flat colored tiles.
- **Game cover**: a solid palette color, radius 18 (148px) or 10 (36px thumbnail).
  - Large cover: a soft geometric motif (a large circle #FFFFFF29 and a small dot #FFFFFF99 in the top area) with the game title in white Bricolage 16/18/700 at the bottom-left (inset 12).
  - Small thumbnail: a single white Bricolage initial.
- "Karteczka" (score sheet) is drawn as an SVG paper sheet (300×400) on a 400×540 stage.
- Overall look: airy, rounded and friendly, with a cool gray-lavender page (#F3F4F8), white cards with very soft navy drop shadows, one strong cobalt accent (#2F54EB), dark-ink pills for active tabs, and warm multicolor avatars. Density is medium: rows are 54–64px.

## 15. Meetings components ("Spotkania"; values from `design/meetings/_build.mjs`)
Shared: section head = title 15/20/600 #161A2B + right note 13/16/500 #6B7188 (space-between). Game thumbnail 36 (radius 10, Bricolage 16/20/700 initial; Terraformacja Marsa uses #F1F3F9 with #6B7188 initial); 44 in live cards. Icons added: clock, play, flag, pencil, refresh, trophy, pad (notes), userplus, chevron-down (`M4 6L8 10L12 6`), check (`M3.5 8.5L6.5 11.5L12.5 4.5`).

| Component | Spec |
|---|---|
| Date tile | Desktop 64×72 / mobile 56×64, radius 18, bg #EEF2FF, centered column. Month "LIS" Instrument 11/14/600 #2F54EB, letter-spacing 0.06em. Day Bricolage 700 26/30 (mobile 22/26) #161A2B |
| Widget meeting block | Row paddingTop 20, gap 16 (mobile 14): date tile + title Bricolage 28/32 (mobile 22/28) with a 13/16/500 #6B7188 line "sobota, 28 lis 2026 · 18:00" (gap 4). Next row paddingTop 16, gap 10: avatar stack 36/8 + text 14/20/500 #6B7188 with "5 uczestników" #161A2B/600 · "prowadzi Ania" |
| Widget header (right of "Spotkanie" title) | Countdown "za 16 dni" 14/18/500 #6B7188, or the live chip "Trwa". "Zobacz więcej" link as in §6; absent in the empty state |
| Widget tray head | Row padding 4/6/2, space-between: state chip or label ("Gramy w" 13/16/600 #6B7188, "Partie" + "2 rozegrane · 1 w toku" 13/16/500) + right note ("Twoje głosy: 2"). Rows h54 |
| Widget empty state | 56px #EEF2FF circle with calendar (accent, 22px), title 15/20/600 "Nie ma zaplanowanych spotkań", helper 13/18/500 #6B7188; admin gets full-width primary h44 "Zaplanuj spotkanie" with + icon |
| Voter mini-stack + count | Row gap 6: avatar stack 20/6 + count Bricolage 16/20/700 #161A2B (#C9CDDA when 0), width 16, right-aligned, tnum. Used on widget vote rows (h54: thumb, name 15/20/500 flex, voters) |
| Vote row (popup) | White row h64: thumb 36, two lines (name 15/20/500; then stack 20/6 + "N głosów" 13/16/500 #6B7188 + optional badge "Dla 2 graczy"), then vote toggle. Wording: "Brak głosów", "1 głos", "2–4 głosy", "5+ głosów" |
| Vote toggle | h32 pill. **On** "Twój głos": bg #2F54EB, paddingInline 12, gap 6, check 14px white, text 13/16/600 #FFF. **Off** "Głosuj": 1px #E4E7F0, paddingInline 14, text 13/16/600 #161A2B. Omitted for players who cannot vote |
| Admin action box | Column gap 12, bg #F1F3F9, radius 22, padding 16: explanatory text 13/18/500 #6B7188, then full-width h44 buttons (gap 8): primary + outline with bg #FFF. Variants: głosowanie ("Opublikuj gry" + "Rozpocznij spotkanie"), gramy w ("Rozpocznij spotkanie" + "Otwórz głosowanie ponownie"), w trakcie ("Nowa partia" + "Zakończ spotkanie") |
| Play card | Column gap 12, 1px #E4E7F0, radius 18, padding 14. Head row gap 12: score-sheet thumbnail 44×56, title Bricolage 16/20/700 + sub 13/16/500 #6B7188 ("Partia 1 · 18:10 · 5 graczy"), then 32px "more" button (admin) or chevron-right #C9CDDA. **Result rows** h28, gap 8: place 13/16/600 width 14 (#2F54EB for 1st, else #6B7188), avatar 24, name 14/18 (600 for 1st, else 500) flex, score Bricolage 15/20/700 width 32 right, points "+N" 12/16/600 width 30 right (#2F54EB, or #6B7188 for +0); all tnum |
| Live play card | bg #E3F5EA, radius 18, padding 14, gap 12. Row gap 12: thumb 44 + title Bricolage 16/20/700 + "Trwa partia · od 20:55" 13/16/600 #1F7A4D + stack 28/8. Admin row (gap 8): primary h36 "Wróć do notesu" (pad icon, flex) + outline h36 "Porzuć" bg #FFF |
| Score-sheet thumbnail | 44×56 (36×46 in the notes row), radius 6, bg #FBF7EC, 1px #E8DFC8, rotate(-3deg), overflow hidden, column gap 5. Top band h8 in the game color, then four lines h2 radius 2 #D9CFB4 (widths 28/22/26/16 at 44 wide), each in a row with paddingInline 6 |
| Meeting summary row | In a tray: white, radius 14, padding 10/12, gap 10, top-aligned. Place 13/18/600 #6B7188 width 12 (paddingTop 9), avatar 36, then column gap 4: name 14/18/600 + points Bricolage 16/20/700 with "pkt" 12/16/500 #6B7188 (baseline, gap 3); breakdown 12/16/500 #6B7188 ("Wingspan +6, Azul +10"); badge row (gap 4, wrap). Badges 11/14/600: "1 wygrana · Azul" accent on #EAF0FF; "+1 → seria 2" success; "seria przerwana" #D63A3A on #FDECEC; "seria bez zmian" #6B7188 on #F1F3F9 |
| Achievement row | 1px #E4E7F0, radius 20, padding 12/16/12/12, gap 12: 44px #E09F1F circle with white trophy, eyebrow "Nowe osiągnięcie" 12/16/600 #6B7188 + title Bricolage 16/20/700, avatar 28 |
| Checkbox | 22×22, radius 7. On: bg #2F54EB + white check 14. Off: bg #FFF, 1.5px #C9CDDA |
| Radio | 22×22 circle, bg #FFF. On: 1.5px #2F54EB border + 12px #2F54EB dot. Off: 1.5px #C9CDDA |
| Member selection row | Tray row h52 (white, r14, padding 0 14, gap 12): checkbox, avatar 36, name 15/20/500 flex, optional badges (Admin, Ty). Label row above: "Uczestnicy" with right "Wybrano 5 z 8" 13/16/500 #6B7188 and "Zaznacz wszystkich" 13/16/600 #2F54EB (gap 12) |
| Publish-games row | Row h64: checkbox, thumb, name + votes line (+ badge "Dla 2 graczy"), count Bricolage 16/20/700 width 20 right (#C9CDDA when 0). Footer left "Wybrano 3 gry" 14/18/600 |
| Game / notes pick row | Row h64 (notes h72): radio, thumb (notes: sheet thumbnail 36×46 in padding 0 4), name 15/20/500, sub 13/16/500 #6B7188. Disabled: thumb at opacity 0.45, name #6B7188, reason in #6B4500 |
| Step pills | Row gap 8, "Gra", "Notes", "Gracze". Pill h34, radius 999, gap 6, text 14/18/600, paddingRight 14. **Current**: bg #161A2B, white "N. Nazwa", paddingLeft 14. **Done**: bg #EEF2FF, check 14 + name in #2F54EB (no number), paddingLeft 12. **Upcoming**: 1px #E4E7F0, "N. Nazwa" #6B7188, paddingLeft 14 |
| Seat row | Row gap 12: number circle 28 (bg #F1F3F9, 13/16/600 #6B7188) + field flex h48 radius 14. **Filled**: 1px #E4E7F0, padding 0 14 0 8, gap 10, avatar 32, name 15/20/500, chevron-down #6B7188. **Empty**: 1.5px dashed #C9CDDA, padding 0 14, + icon #6B7188, "Wybierz gracza" 15/20/500 #6B7188. Seats column gap 10; label "Gracze i miejsca w notesie" + right "Zajęte 4 z 5 miejsc". Below: "Poza partią:" 13/16/500 #6B7188 + pill h28 (padding 0 10 0 4, #F1F3F9) with avatar 20 and name 13/16/600 |
| Date picker calendar | 278 wide, white, 1px #E4E7F0, radius 16, padding 12, gap 4, menu shadow. Header: chevron buttons 32 + "Listopad 2026" Bricolage 16/20/700. Weekday cells 36 wide, 12/16/600 #6B7188 ("Pn Wt Śr Cz Pt So Nd"), padding 4/0. Day cell 36×36 circle, 14/18/500 tnum: selected bg #2F54EB + white 600; today 1.5px #2F54EB ring + #2F54EB 600; past #C9CDDA. Footer "Dziś" 14/18/600 #2F54EB centered, paddingTop 8, border-top 1px #E4E7F0 |
| Time dropdown | Menu from §7, 140 wide; half-hour slots 17:00–19:30; selected row #EEF2FF, #2F54EB/600, check |
| Meeting menus | Menu from §7 but 260 wide, icons 16px stroke 1.75: admin menu "Edytuj spotkanie" (pencil), "Otwórz głosowanie ponownie" (refresh), "Usuń spotkanie" (trash, danger); host menu "Dodaj uczestnika" (userplus), "Zmień prowadzącego" (user), "Zakończ spotkanie" (flag) |
| Dialog variants | §7 small dialog with icon circle 44 (icon 20, stroke 1.75): accent play/flag on #EEF2FF (start/end meeting); #8A5A00 alert on #FFF4D6 (plays in progress; includes a tray radius 18 / padding 6 with a row h56); #D63A3A trash on #FDECEC + destructive button (delete meeting, abandon play) |
| Toasts | §12 standard toast. Success texts: "Spotkanie zaplanowane. Głosowanie otwarte.", "Głos zapisany", "Gry opublikowane. Głosowanie zamknięte.", "Spotkanie rozpoczęte", "Partia zapisana", "Spotkanie zakończone". Error (alert icon #FFB4B4): "Trwa już inne spotkanie. Najpierw je zakończ." |

Popup structure: mobile sheet header h60 (padding 12/16, title 22/28, optional back, "more" 36 for admin, close 36); body padding 4/16/24, blocks separated by paddingTop 20; meta row (status chip + date + time, gap 8, wrap), then participants stack row (paddingTop 14). Desktop 880 popup: header (title 24/30 + status chip, more + close), meta chip row paddingTop 14, columns paddingTop 24 (left flex = votes/games/plays, right 300 = admin box + participants or summary). Participants list: rows h48 (avatar 36, name, badges Admin/Ty/Prowadzi).

## 16. Working with Paper (lessons learned)
- Paper does **not inherit text styles** from artboards or frames: every text element must carry its own `font-family`, `font-weight` and `color` (plus size and line-height). The generator emits them on every text node.
- `margin` (including negative) is **not applied**: use gap, padding or absolute positioning (avatar stacks use absolute `left`).
- `create_artboard` ignores position: set `left`/`top` afterwards with `update_styles`. Text properties in the artboard style are dropped on frames.
- `write_html` accepts a whole artboard in one call (verified up to ~34 KB).
- `<x-paper-clone node-id="…">` works for reusing desktop blocks in mobile artboards, and clones stretch to the column width (`manifest.json` `cloneSources` lists the block paths; `*.lite.html` files use them).
- Regeneration: `node design/meetings/_build.mjs` (writes `*.html`, `*.lite.html`, `manifest.json`), then place per `design/meetings/_PAPER-INSTRUCTIONS.md`.
- **Avatar stacks in Paper:** fixed in place on all 12 affected Meetings artboards (32 stacks). Recipe: container gets fixed `width`/`height` and `flexShrink: 0` (Paper ignores `position: relative` on it and keeps flex display); avatar i gets `position: absolute`, `top: 0`, `left: i × step`.
- **Known caveat:** the Meetings artboards were placed before the generator dropped `margin`, so in Paper the score-sheet thumbnail lines may lack their 6px side inset. Only four artboards were spot-checked by screenshot after the stack fix; the rest have not been visually reviewed.
