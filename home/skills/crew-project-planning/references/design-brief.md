# UI/UX Design Brief

**Zweck:** Wie das Produkt aussieht und sich anfühlt — so genau, dass zwei Menschen
dasselbe bauen.
**Datei:** `docs/DESIGN-BRIEF.md` (+ ein `DESIGN.md` aus `design-md`).
**Rolle:** `planner` schreibt, `executor` baut, `vision` liest Screenshots und
Referenzbilder, `reviewer` prüft gegen den Brief.

## Zuerst: bestehendes Design-System wählen

**Nicht raten, nicht erfinden.** Den Skill **`design-md`** laden — er enthält 74 fertige
`DESIGN.md`-Dateien (Vercel, Linear, Stripe, Apple, Notion, Figma, …) im Google-Stitch-
Format mit Farb-, Typografie-, Komponenten- und Layoutregeln. Ablauf:

1. Im Katalog nach Marke **oder Wirkung** suchen (`dark dashboard`, `editorial warm`,
   `monochrome`).
2. Das passende `DESIGN.md` ins Projekt installieren (das Skill-Skript erledigt das).
3. Den Brief darauf aufbauen und **jede** Abweichung begründen.

Existiert ein Marken- oder Kunden-System, gewinnt dieses — dann dessen Werte übernehmen und
die Quelle nennen. Gibt es beides nicht, ein System wählen statt eine Palette zu erfinden.

## Pflichtabschnitte

1. **Designprinzipien** — drei bis fünf Sätze, die jede spätere Entscheidung entscheidbar
   machen ("Dichte vor Dekoration").
2. **Farbpalette** — je Farbe: Name, Hex, OKLCH-Wert, Rolle (Fläche, Text, Rand, Aktion,
   Zustand), Kontrastverhältnis auf dem vorgesehenen Hintergrund. Hell- und Dunkelmodus
   getrennt. Semantische Zustände: Erfolg, Warnung, Fehler, Information.
3. **Typografie** — Schriftfamilie(n) mit Fallback und Lizenz, Skala (z. B. 12/14/16/20/24/32),
   Zeilenhöhe, Laufweite, Gewichte, Rolle je Stufe (Display, Überschrift, Fließtext, Label,
   Code). Maximale Zeilenlänge für Fließtext.
4. **Raster und Abstände** — Grundraster (z. B. 4 px), Abstandsskala, Containerbreiten,
   Breakpoints, Spalten, Seitenränder.
5. **Komponenten** — je Komponente: Anatomie, Varianten, Größen, Zustände
   (Standard, Hover, Fokus, Aktiv, Deaktiviert, Lade, Fehler, Leer), Barrierefreiheits-
   Anforderungen (Rolle, Tastatur, Fokusring, Vorlesetext) und ein Beispiel in Worten.
6. **Layout und Seitenvorlagen** — die wiederkehrenden Seitenmuster (Liste, Detail, Formular,
   Einstellungen, leerer Zustand, Fehlerseite).
7. **Bewegung** — Dauer, Kurven, was sich bewegt und was nicht; Respekt für reduzierte
   Bewegung.
8. **Barrierefreiheit** — Zielstandard, Kontrastmindestwerte, Fokusführung, Zielgrößen,
   Sprachauszeichnung, Testverfahren.
9. **Ton und Sprache** — Anrede, Fehlermeldungen, Mikrotexte, Datums- und Zahlenformat.
10. **Akzeptanzkriterien** — prüfbare Sätze, z. B. "Jeder Text auf Fläche hat mindestens
    Kontrast 4,5:1 im Hellmodus".

## Werkzeuge

- `design-md` für das Design-System (Pflicht, wenn keines vorgegeben ist).
- [chenglou/pretext](https://github.com/chenglou/pretext) (extern, optional), wenn
  Textmaße, Zeilenumbrüche oder Höhen belegt statt geschätzt werden sollen.
