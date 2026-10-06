# Implementation Plan

**Zweck:** Wer macht wann was, in welcher Reihenfolge, und wann ist ein Paket fertig.
**Datei:** `docs/IMPLEMENTATION.md` · **Rolle:** `planner` schreibt und pflegt,
`executor` arbeitet ab, `reviewer` prüft je Paket, `helper` erledigt Konvertierung,
Klassifizierung, Zusammenfassung.

## Pflichtabschnitte

1. **Vorgehen** — warum diese Reihenfolge, welcher Meilenstein liefert wann welchen Nutzen.
2. **Arbeitspakete** — je Paket:
   - `AP<n>`: Titel
   - Ziel in einem Satz
   - Rolle (`executor`, `vision`, `reviewer`, `helper`, `planner`)
   - Eingaben: Dateien, Entscheidungen, Pakete, die vorher fertig sein müssen (`hängt ab von`)
   - Aufgaben: konkrete, überprüfbare Teilschritte
   - Ergebnis: welche Dateien und Artefakte entstehen
   - Definition of Done: Kriterium + Nachweis (Test, Kommando, Screenshot)
   - Aufwandsschätzung: relativ (S/M/L) statt Stunden, wenn die Basis fehlt
3. **Abhängigkeitsgraph** — als Liste plus Mermaid-`flowchart`; unabhängige Pakete werden
   ausdrücklich als parallelisierbar markiert, weil die Crew sie parallel ausführt.
4. **Teststrategie** — welche Testarten (Unit, Integration, Ende-zu-Ende, Abnahme), was sie
   abdecken, womit sie laufen, welche Abdeckung als ausreichend gilt.
5. **Meilensteine** — je Meilenstein: Inhalt, Nachweis, Datum oder Reihenfolge.
6. **Risikoplan** — die TRD-Risiken mit Auslöser, Gegenmaßnahme und Verantwortlicher Rolle.
7. **Definition of Done (Projekt)** — die Gesamtlatte, gegen die der `reviewer` am Ende prüft.
8. **Fortschritt** — der laufende Stand, gespiegelt aus den Crew-To-dos: Paket, Status,
   Rolle, Notiz. Diesen Abschnitt bei jedem Lauf aktualisieren, damit der Plan nicht
   veraltet.

## Rolle der Crew-Tools

Der Implementation Plan ist die menschenlesbare Fassung dessen, was als To-dos je Rolle
persistiert wird:

- Jedes Arbeitspaket wird ein To-do der ausführenden Rolle (`crew_todo`, id `AP<n>`).
- Der Projektstand steht als *ongoing goal* jeder Rolle (`crew_plan`).
- Statusänderungen laufen über `crew_todo_status`, damit nichts doppelt gepflegt wird.

Details: `references/role-state.md`.

## Qualitätslatte

- Jedes Paket hat eine Rolle und eine Definition of Done.
- Kein Paket ohne Eingaben und ohne Abhängigkeiten (auch wenn leer).
- Parallele Pakete sind als solche erkennbar.
- Der Fortschrittsabschnitt ist aktueller als das Gedächtnis der Sitzung.
