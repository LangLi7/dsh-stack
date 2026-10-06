# Typst-Template für die Bewerbungsmappe

Dieses Template basiert auf dem bestehenden Projekt des Nutzers
(`E:\2. Dokumente\typst\Bewerbungsdosier`) und ist **parametrisiert**, damit du es pro Bewerbung
einfach neu füllen kannst.

## Dateien

```
templates/typst/
├─ README.md                    ← diese Datei
├─ main.typ                     ← Einstiegspunkt (parametrisiert)
└─ config/
   ├─ variables.typ             ← alle bewertungsrelevanten Variablen
   └─ components.typ            ← wiederverwendbare UI-Bausteine
```

## Anwendung

1. **`config/variables.typ` füllen:** Alle Felder oben (Name, Adresse, Firma, Beruf, `BRIEFTEXT`,
   `ANREDE`, `assets`). `BRIEFTEXT` ist der Fliesstext des Anschreibens — diesen erzeugst du mit
   dem YOU-ME-WE-Aufbau (siehe `reference/anschreiben-struktur.md`).
2. **Assets bereitstellen:** `portrait/full/foto` in `assets/` ablegen; `logo` als SVG; PDF-Unterlagen
   (z. B. Lehrabschluss) in `unterlagen/`.
3. **Kompilieren:**
   ```bash
   typst compile main.typ
   ```
   (Live-Vorschau: `typst watch main.typ`)

> Falls `typst` nicht installiert ist: Die Skill erzeugt zuerst den (Anschreiben-)Text als Markdown/Text
> und weist den Nutzer an, ihn ins Template bzw. Word zu übernehmen. PDF-Kompilierung durch `typst`
> ist der letzte, optionale Schritt.

## Struktur & Komponenten (aus dem Original übernommen)

- `main.typ`: baut Deckblatt (Seite 1), Anschreiben (Seite 2, optional via `ZEIGE_ANSCHREIBEN`),
  Lebenslauf (ab Seite 3) und PDF-Unterlagen zusammen.
- Die Abschnitte `sek()`, `sek-sb()` (Sidebar-Header), `zl()` (Datenzeile), `sc()` (Kurzzeile),
  `kb()` (Kenntnisbalken/Skills), `timeline-item()` (Berufserfahrung) und `pdf_seiten()`
  (PDF-Anhang) sind bewährte, wiederverwendbare Bausteine.
- Farben/Layout in `config/components.typ` anpassbar (Schweizer, seriöses Blau-Schema).
