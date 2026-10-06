---
name: crew-project-blueprint
description: Führt ein Vorhaben in sechs verbindlichen Artefakten von der Idee zum ausführbaren Plan — Produkt-Anforderungen (PRD), Technische Anforderungen (TRD), App-/Projekt-Flow, UI/UX-Design-Brief, Backend-Schema und Implementierungsplan. Je Artefakt eine Vorlage mit Pflichtabschnitten, Qualitätslatte, Akzeptanzkriterien und Rollen-Zuordnung, plus Regeln für Reihenfolge, Abhängigkeiten und Übergabe an die Crew.
whenToUse: Wenn ein Projekt, eine App, ein Feature oder eine Änderung an einer bestehenden Codebasis geplant, spezifiziert oder von einer Crew umgesetzt werden soll; wenn Begriffe wie PRD, Lastenheft, Pflichtenheft, TRD, App-Flow, User Flow, Backend-Schema, Datenmodell, UI-Brief, Design-Brief, Implementierungsplan, Roadmap, Meilensteine, Akzeptanzkriterien oder "Blueprint" fallen; wenn der planner ein Vorhaben strukturieren, aufteilen und an Rollen übergeben muss.
metadata: { version: 1.0.0, author: crew }
---

# Projekt-Blueprint: sechs Artefakte von der Idee zum Plan

Dieser Skill ist die Arbeitsanweisung für den `planner` (Projektleitung). Er erzeugt sechs
Dokumente in fester Reihenfolge, jedes mit Vorlage, Prüfliste und Rollen-Zuordnung. Andere
Rollen lesen die Ergebnisse, sie schreiben sie nicht.

Er ergänzt den Skill `crew-project-planning` (Übersicht und Grundregeln) um das **verbindliche
Verfahren** und die **Vorlagen**; die sechs Artefakt-Spezifikationen selbst liegen in dessen
`references/`-Ordner und werden hier nicht doppelt geführt. Für Technologie-, Versions- und
Strukturfragen kommt `crew-project-research` dazu, für Farben und Komponenten `design-md`.

## Die sechs Artefakte

| # | Artefakt | Datei | Vorlage (Pfad relativ zu diesem Skill) |
|---|---|---|---|
| 1 | Produkt-Anforderungen (PRD) | `docs/PRD.md` | `../crew-project-planning/references/prd.md` |
| 2 | Technische Anforderungen (TRD) | `docs/TRD.md` | `../crew-project-planning/references/trd.md` |
| 3 | App-/Projekt-Flow | `docs/APPFLOW.md` | `../crew-project-planning/references/appflow.md` |
| 4 | UI/UX-Design-Brief | `docs/DESIGN-BRIEF.md` | `../crew-project-planning/references/design-brief.md` |
| 5 | Backend-Schema | `docs/BACKEND.md` | `../crew-project-planning/references/backend-schema.md` |
| 6 | Implementierungsplan | `docs/IMPLEMENTATION.md` | `../crew-project-planning/references/implementation-plan.md` |

Dokumentkopf, Annahmen, offene Fragen, Risiken und Akzeptanzkriterien folgen für **alle sechs**
dem Muster in `../crew-project-planning/references/document-template.md`.

Zusätzlich zu diesem Skill geladen werden:

- `references/blueprint-sequence.md` — **Pflichtlektüre vor dem ersten Dokument.** Enthält
  Reihenfolge, Abhängigkeitstabelle, die sechs Fertig-Bedingungen, die Übergabe an die
  Ausführung und die ID-Kette PRD → Plan → Test.
- `references/planner-playbook.md` — Wie der `planner` in jedem Schritt arbeitet: Fragen statt
  Erfinden, Entscheidungen begründen, Annahmen markieren, To-dos schreiben, berichten.

## Ablauf in Kurzform

1. **Auftrag klären.** Anfrage, vorhandene Dateien und Repo-Zustand lesen. Ergebnis:
   5–10 Zeilen Auftragsverständnis und eine Liste offener Fragen. Fehlende Fakten werden
   **Fragen**, niemals stille Annahmen.
2. **Recherche.** `crew-project-research` für Stack, Versionen, Projekt-Setup und
   Codebase-Struktur — mit Alternativen, Prüfkommandos und Quellen.
3. **PRD** — was, für wen, warum, woran man Erfolg erkennt. **Vorher** den Skill
   `smart-principles` laden: seine sieben Prüffragen sind die Abnahmebedingung jeder Funktion,
   jedes Erfolgskriteriums und jedes Akzeptanzkriteriums. Ohne SMART-Prüfung wird kein
   Dokument als fertig gemeldet.
4. **TRD** — womit, unter welchen Qualitätsanforderungen, mit welchen Risiken.
5. **App-/Projekt-Flow** — in welcher Reihenfolge, inklusive Fehler- und Abbruchpfade.
6. **UI/UX-Design-Brief** — wie es aussieht und sich anfühlt (entfällt ohne Oberfläche, dann
   Abschnitt „Schnittstelle für Menschen" in der TRD).
7. **Backend-Schema** — welche Daten, welche Schnittstellen, welche Migrationen.
8. **Implementierungsplan** — Arbeitspakete, Reihenfolge, Rollen, Definition of Done, Tests.
9. **Persistieren und übergeben.** `crew_workspace` (Ziel, Projekt, To-do-Liste),
   `crew_plan` (Ziel je Rolle), `crew_todo` (To-dos je Rolle), dann Arbeitspaket an den
   `executor` — nur relevante Ausschnitte plus Dateiverweise.

Nach jedem Schritt: Fertig-Bedingungen aus `references/blueprint-sequence.md` prüfen. Erst dann
weiter. Ein halbfertiges Dokument, auf dem das nächste aufbaut, kostet später die ganze Kette.

## Rollen

| Rolle | Beitrag zum Blueprint |
|---|---|
| `planner` | schreibt alle sechs Artefakte, zerlegt Arbeit, setzt Kriterien, persistiert Ziele und To-dos |
| `executor` | prüft Realisierbarkeit, liefert Schätzungen, setzt Arbeitspakete um |
| `reviewer` | prüft jedes Dokument gegen seine Akzeptanzkriterien und die ID-Kette |
| `vision` | liest Screenshots, Referenzbilder, fremde Dokumente; liefert Design-Vorlagen |
| `helper` | klassifiziert, fasst zusammen, konvertiert Fremdformate (PDF, Word, Tabellen) |

## Qualitätslatte (gilt für jedes der sechs Artefakte)

- Kein Dokument ohne Akzeptanzkriterien mit Nachweis.
- Keine Technologie-Entscheidung ohne Alternative und Begründung.
- Keine Funktion ohne Priorität (`muss` / `soll` / `kann`).
- Kein Fluss ohne Fehlerpfad.
- Kein Arbeitsschritt ohne Rolle und Definition of Done.
- Keine Zahl, die geschätzt ist, ohne als Schätzung markiert zu sein.
- Offene Fragen stehen sichtbar im Dokument, nicht im Kopf des Planers.
- Jedes Dokument ist eine Datei; der Pfad steht im Ergebnisbericht.
