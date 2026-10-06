# Production Requirements Document (PRD)

**Zweck:** Was wird gebaut, für wen, warum — und woran erkennt man Erfolg.
**Datei:** `docs/PRD.md` · **Rolle:** `planner` schreibt, `reviewer` prüft.

## Pflichtabschnitte

1. **Problem** — der heutige Zustand, der Schmerz, der belegte Anlass. Keine Lösung.
2. **Zielgruppe** — wer nutzt es, in welcher Situation, mit welchem Vorwissen. Rollen
   unterscheiden (z. B. Gast, angemeldeter Nutzer, Administrator).
3. **Ziel und Nutzen** — was sich nach dem Projekt messbar ändert.
4. **Kernfunktionen** — nummeriert (`F1`, `F2`, …), je mit Priorität
   (`muss` / `soll` / `kann`), Nutzerbeschreibung und einem Satz zum Nutzen.
   Eine Funktion ist eine Fähigkeit des Produkts, keine Implementierungsaufgabe.
5. **Nutzerreisen** — je Zielgruppe der kürzeste Weg zum Nutzen, in Schritten
   (Ausführliche Fassung gehört in den App-Flow).
6. **Nicht-Ziele** — was ausdrücklich nicht dazugehört. Verhindert Scope-Wachstum.
7. **Randbedingungen** — Recht, Datenschutz, Barrierefreiheit, Sprachen, Budget,
   Termine, bestehende Systeme.
8. **Erfolgskriterien** — messbar: Kennzahl, Zielwert, Messweise, Zeitpunkt.
9. **Offene Fragen** — nummeriert (`Q1`, `Q2`, …), je mit Auswirkung.
10. **Akzeptanzkriterien** — überprüfbare Aussagen (`AK1`, `AK2`, …), die der
    `reviewer` ohne Rückfrage prüfen kann.

## Qualitätslatte

- Jede Funktion hat eine Priorität und ein Akzeptanzkriterium.
- Jedes Erfolgskriterium nennt Kennzahl **und** Zielwert.
- Keine Technologie-Entscheidung im PRD (das ist die TRD).
- Keine Funktion ohne Zielgruppe.
