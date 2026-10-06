---
name: crew-project-planning
description: "Erzeugt aus einer Projektidee oder Anfrage das vollständige Planungsdokument-Set: PRD, TRD, App-/Project-Flow, UI/UX-Design-Brief, Backend-Schema und Implementation Plan — in dieser Reihenfolge, jeder Teil mit Akzeptanzkriterien und Rollen-Zuordnung."
whenToUse: "Wenn ein Projekt, eine App, ein Feature oder eine Codebasis geplant, spezifiziert oder von einer Crew umgesetzt werden soll; wenn Begriffe wie PRD, TRD, Lastenheft, Pflichtenheft, App-Flow, User Flow, Backend-Schema, Datenmodell, Implementation Plan, Roadmap, Meilensteine oder Akzeptanzkriterien fallen."
metadata: { version: 1.0.0, shippedBy: "@deepseek-ai/dsh-llm-crew" }
---

# Projekt planen: vom Wunsch zum ausführbaren Plan

Dieser Skill macht aus einer vagen Anfrage einen Plan, den eine Crew abarbeiten kann. Er gilt
für den `planner` (Projektleitung), die Ergebnisse sind aber für **jede** Rolle lesbar.

## Grundregeln

1. **Erst fragen, dann schreiben.** Unbekannte Fakten werden zu offenen Fragen im Dokument —
   niemals stillschweigend erfunden. Jede Annahme steht explizit als `Annahme:` im Text.
2. **Dokumente sind Dateien.** Jedes Ergebnis wird als echte Datei im Projekt abgelegt
   (`docs/PRD.md`, `docs/TRD.md`, …), nicht nur im Chat. Der Pfad steht im Ergebnisbericht.
3. **Reihenfolge einhalten.** PRD → TRD → Flow → UI/UX → Backend → Implementation Plan.
   Jedes Dokument darf auf die vorherigen verweisen, keines auf ein späteres.
4. **Ein Dokument, eine Frage.** PRD = *was und für wen*. TRD = *womit und unter welchen
   Bedingungen*. Flow = *in welcher Reihenfolge*. UI/UX = *wie es aussieht und sich anfühlt*.
   Backend = *welche Daten und Schnittstellen*. Implementation Plan = *wer macht wann was*.
5. **Jedes Dokument endet mit Akzeptanzkriterien**, die ein Reviewer prüfen kann:
   überprüfbare Aussagen, keine Adjektive.
6. **Rollen explizit zuordnen.** Für jeden Arbeitsschritt steht dabei, welche Crew-Rolle ihn
   ausführt — `executor` (Code/Arbeit), `vision` (Bilder, Screenshots, Dokumente),
   `reviewer` (Prüfung), `helper` (Klassifizieren, Zusammenfassen, Konvertieren), `planner`
   (Zerlegung, Kriterien).
7. **Ziele und To-dos sofort persistieren.** Sobald der Plan steht: für jede Rolle ihr
   *ongoing goal* und ihre To-do-Liste über die Crew-Tools schreiben (`crew_plan`,
   `crew_todo`), damit die Arbeit den nächsten Neustart überlebt. Details:
   `references/role-state.md`.

## Dokumente und Detail-Spezifikationen

| # | Dokument | Datei | Spezifikation |
|---|---|---|---|
| 1 | Production Requirements Document | `docs/PRD.md` | `references/prd.md` |
| 2 | Technical Requirements Document | `docs/TRD.md` | `references/trd.md` |
| 3 | App-/Project-Flow | `docs/APPFLOW.md` | `references/appflow.md` |
| 4 | UI/UX Design Brief | `docs/DESIGN-BRIEF.md` | `references/design-brief.md` |
| 5 | Backend Schema | `docs/BACKEND.md` | `references/backend-schema.md` |
| 6 | Implementation Plan | `docs/IMPLEMENTATION.md` | `references/implementation-plan.md` |

Vorlage für ein neues Dokument: `references/document-template.md`. Ein vollständig
durchgearbeitetes Beispiel (kleine Web-App) liegt in `references/example-walkthrough.md`.

## Ablauf

**Schritt 1 — Auftrag klären.** Anfrage, vorhandene Dateien und Repo-Zustand lesen (read,
grep, glob, Shell). Fehlende Fakten sammeln. Ergebnis: 5–10 Zeilen Auftragsverständnis plus
Liste offener Fragen. Erst danach weiterarbeiten.

**Schritt 2 — Recherche.** Für Technologie-, Setup- und Strukturfragen den Skill
`crew-project-research` laden. Er liefert Projekt-Setup, Codebase-Struktur und eine
Technical-Requirements-Liste (Sprachen, Frameworks, Bibliotheken, Tools) mit Alternativen
und Begründung.

**Schritt 3 — PRD.** Problem, Zielgruppe, Nutzen, Kernfunktionen (mit Priorität),
Nicht-Ziele, Erfolgskriterien. Siehe `references/prd.md`.

**Schritt 4 — TRD.** Architektur, Datenfluss, Technologie-Entscheidungen *mit verworfenen
Alternativen*, Qualitätsanforderungen (Performance, Sicherheit, Barrierefreiheit,
Betrieb), Schnittstellen, Risiken. Siehe `references/trd.md`.

**Schritt 5 — App-/Project-Flow.** Jeder Nutzerfluss und jeder Systemfluss in Schritten,
inklusive Fehler- und Abbruchpfaden, Zuständen und Berechtigungen. Siehe
`references/appflow.md`.

**Schritt 6 — UI/UX Design Brief (nur wenn es eine Oberfläche gibt).** Farbpalette,
Typografie, Spacing, Komponenten, Layout, Zustände, Barrierefreiheit. **Zuerst den Skill
`design-md` laden** und ein bestehendes Design-System wählen, statt Farben zu erfinden;
das Ergebnis ist ein `DESIGN.md` plus der Brief. Siehe `references/design-brief.md`.

**Schritt 7 — Backend-Schema.** Entitäten, Felder, Typen, Beziehungen, Indizes,
Migrationsweg, API-Endpunkte, Auth, Fehlerformat. Siehe `references/backend-schema.md`.

**Schritt 8 — Implementation Plan.** Arbeitspakete mit Reihenfolge und Abhängigkeiten,
Rollen-Zuordnung, Definition of Done je Paket, Teststrategie, Meilensteine, Risikoplan.
Siehe `references/implementation-plan.md`.

**Schritt 9 — Persistieren und übergeben.** Goals und To-dos pro Rolle schreiben
(`crew_plan` + `crew_todo`), dann dem `executor` ein Arbeitspaket geben, das nur die
nötigen Ausschnitte plus Dateiverweise enthält — nie die ganze Konversation.

## Werkzeuge und Konvertierung

- **Markdown ist das Format.** Alle Planungsdokumente sind Markdown, damit sie in Git
  diffbar bleiben und von Menschen wie Modellen gelesen werden können.
- **Fremdformate einlesen.** Liegen Anforderungen als PDF, Word, Excel, PowerPoint oder
  HTML vor, mit [microsoft/markitdown](https://github.com/microsoft/markitdown) nach
  Markdown konvertieren (`pip install markitdown`, dann `markitdown datei.pdf > datei.md`).
  Das ist ein externes Werkzeug und **keine** Abhängigkeit dieses Skills: nur einsetzen,
  wenn es installiert ist, sonst die Datei direkt lesen und die Lücke melden.
- **Text-Layout prüfen.** [chenglou/pretext](https://github.com/chenglou/pretext) misst
  Textmetriken (Zeilenumbruch, Höhe, Position) ohne DOM — nützlich, wenn ein UI-Brief
  konkrete Textmaße oder Zeilenumbrüche festlegen soll. Ebenfalls optional und extern.
- **Technical-Requirements-Listen** (Sprachen, Bibliotheken, Tools mit Alternativen)
  kommen aus `crew-project-research`.

## Qualitätslatte

- Kein Dokument ohne Akzeptanzkriterien.
- Keine Technologie-Entscheidung ohne Alternative und Begründung.
- Keine Funktion ohne Priorität (`muss` / `soll` / `kann`).
- Kein Fluss ohne Fehlerpfad.
- Kein Arbeitsschritt ohne Rolle und Definition of Done.
- Offene Fragen stehen sichtbar im Dokument, nicht im Kopf.
