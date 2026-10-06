---
name: design-md
description: Design-System-Skill auf Basis von VoltAgent/awesome-design-md — 74 offline gebündelte DESIGN.md-Dateien (Vercel, Linear, Stripe, Apple, Notion, Figma, SpaceX, Tesla, Retro-Web …) im Google-Stitch-Format. Wähle ein Design-System, installiere die DESIGN.md ins Projekt und baue UI, die exakt dessen Farb-, Typo-, Komponenten- und Layoutregeln folgt. Enthält Katalog, Such-/Install-Skript und Upstream-Sync.
whenToUse: Wenn der Nutzer eine Website/App/ein UI "im Stil von" einer bekannten Marke oder einem Design-System bauen will, ein DESIGN.md braucht, Design-Tokens (Farben, Typografie, Spacing, Schatten, Radien) definieren möchte, oder wenn ein Projekt ein konsistentes visuelles System statt zufälliger Styles braucht. Auch bei Stichworten wie DESIGN.md, Design-System, Design-Tokens, Look wie Vercel/Linear/Stripe/Apple/Notion, Landingpage-Design, UI-Redesign oder "mach das schöner".
---

# Design-Systeme mit DESIGN.md

Dieser Skill bündelt die komplette Sammlung [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
**offline** — 74 `DESIGN.md`-Dateien aus echten Websites (Vercel, Linear, Stripe, Apple, Notion,
Figma, Shopify, SpaceX, Tesla, BMW, Retro-Web 1996/2001 …). Kein npm, kein Build, kein Netz nötig.

`DESIGN.md` ist ein Konzept von Google Stitch: eine Klartext-Design-System-Dokumentation, die
KI-Agenten lesen, um konsistente UI zu erzeugen. Sie ist die **Design-Schwester von `AGENTS.md`**:

| Datei | Wer liest sie | Was sie festlegt |
| --- | --- | --- |
| `AGENTS.md` | Coding-Agents | *Wie* das Projekt gebaut wird |
| `DESIGN.md` | Design-Agents | *Wie* das Projekt aussieht und sich anfühlt |

## Dateien dieses Skills

- `references/INDEX.md` — der ganze Katalog (Kategorie, Name, Slug, Kurzbeschreibung, Pfad, Upstream-Link).
- `references/catalog.json` — dasselbe maschinenlesbar (`slug`, `name`, `category`, `description`, `path`, `url`).
- `design-md/<slug>/DESIGN.md` — die 74 Design-Systeme (z. B. `design-md/vercel/DESIGN.md`).
- `scripts/design-md.mjs` — suchen, anzeigen, installieren, verifizieren (Node, keine Abhängigkeiten).
- `scripts/sync-upstream.mjs` — Upstream aktualisieren und Katalog neu erzeugen.

Jede `DESIGN.md` hat YAML-Frontmatter (`version`, `name`, `description`, `colors`, `typography`, …)
und danach 9 Abschnitte: Visual Theme & Atmosphere, Color Palette & Roles, Typography Rules,
Component Stylings, Layout Principles, Depth & Elevation, Do's and Don'ts, Responsive Behavior,
Agent Prompt Guide.

## Ablauf

**1. Passendes Design-System wählen.** Nie raten, sondern im Katalog suchen — nach Marke *oder*
Wirkung ("dark dashboard", "editorial warm", "playful gradient", "monochrome"):

```pwsh
$dm = "$env:USERPROFILE\.dsh\skills\design-md\scripts\design-md.mjs"
node $dm categories                    # Kategorien mit Anzahl
node $dm search dark dashboard         # Volltextsuche über Slug/Name/Kategorie/Beschreibung
node $dm search editorial warm         # Suche nach Wirkung statt Marke (mehrere Begriffe = UND)
node $dm list --category Fintech       # Kategorie auflisten
node $dm show linear.app               # DESIGN.md komplett anzeigen
node $dm show linear.app --path        # nur den lokalen Pfad ausgeben
```

Alternativ ohne Skript: `references/INDEX.md` lesen und die passende Datei direkt öffnen —
z. B. `design-md/vercel/DESIGN.md`.

Wenn nichts exakt passt: das **nächstliegende** System wählen und dem Nutzer sagen, welches und
warum. Bei Unsicherheit zwischen 2–3 Kandidaten kurz nachfragen, statt still zu entscheiden.

**2. DESIGN.md ins Projekt installieren.** Das ist der offizielle Weg aus dem Upstream-Repo
("Copy a site's `DESIGN.md` into your project root"):

```pwsh
node $dm install vercel --destination .              # -> ./DESIGN.md
node $dm install linear.app --destination . --force  # überschreibt vorhandene DESIGN.md
```

Die Datei gehört ins **Projekt-Root** (oder dorthin, wo `AGENTS.md` liegt) — dort finden sie
Coding-Agents, Stitch und andere Design-Tools automatisch. Existiert schon eine `DESIGN.md`,
zuerst lesen und **nicht** blind überschreiben: entweder gezielt ergänzen oder den Nutzer fragen.

**3. Die DESIGN.md wirklich befolgen.** Vor dem ersten UI-Code die installierte Datei lesen — die
Frontmatter (Tokens) **und** die 9 Abschnitte. Sie ist die einzige Design-Wahrheit im Projekt:

- Farben, Fonts, Größen, Radien, Schatten und Abstände **wörtlich** aus den Tokens übernehmen
  (Hex-Werte und `{typography.*}` / `{spacing.*}`-Referenzen), nicht "ungefähr ähnlich" erfinden.
- Die **Do's and Don'ts** sind verbindlich: sie enthalten die Marken-Regeln (z. B. "kein zweiter
  Akzent", "keine All-Caps-Headlines", "kein schwerer Drop-Shadow") — die machen den Look aus.
- Tokens als CSS-Variablen / Theme-Objekt anlegen (eine Quelle, überall referenziert), statt
  Werte im Code zu verstreuen.
- Bei Dark-Mode-Anforderung: die Polarität umdrehen, wie im Abschnitt *Depth & Elevation* und in
  den `canvas`/`on-*`-Rollen beschrieben — keine beliebigen eigenen Dunkelfarben.
- Responsive Behavior (Breakpoints, Touch-Targets, Kollaps-Strategie) aus Abschnitt 8 umsetzen.

**4. Kurz berichten:** welches Design-System installiert wurde, wo die Datei liegt und welche
Tokens/Regeln das Ergebnis prägen.

## Regeln

- **Tokens nicht erfinden.** Fehlt ein Wert in der DESIGN.md, aus den vorhandenen Tokens ableiten
  und die Ableitung im Ergebnis kennzeichnen — nie stillschweigend neue Markenfarben einführen.
- **Kein Marken-Missbrauch.** Die Dateien sind Analysen öffentlich sichtbarer CSS-Werte, keine
  offiziellen Brand-Assets und ohne Gewähr. Sie sind Inspiration für UI-Generierung — keine
  Logos, keine Marken-Claims und keine Behauptung, im Auftrag der Marke zu handeln.
- **Eine DESIGN.md pro Projekt.** Mehrere Systeme gleichzeitig mischen zerstört die Konsistenz.
- **Bei vorhandenem Projekt-Design:** bestehende DESIGN.md/AGENTS.md/Konventionen haben Vorrang
  vor dem Katalog.
- **Aktualisieren statt raten**, wenn ein System fehlt oder veraltet wirkt:
  `node scripts/sync-upstream.mjs` (klont Upstream, aktualisiert `design-md/`, `catalog.json`, `INDEX.md`).
- **Integrität prüfen:** `node $dm verify` bestätigt, dass zu jedem Katalogeintrag eine lokale
  DESIGN.md existiert.
