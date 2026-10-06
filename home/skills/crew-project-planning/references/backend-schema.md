# Backend Schema

**Zweck:** Welche Daten existieren, wie sie zusammenhängen und über welche Schnittstellen
sie erreichbar sind.
**Datei:** `docs/BACKEND.md` · **Rolle:** `planner` schreibt, `executor` setzt um,
`reviewer` prüft Vollständigkeit gegen den App-Flow.

## Pflichtabschnitte

1. **Entitäten** — je Entität ein Block:
   - Name (Singular, `PascalCase`)
   - Zweck in einem Satz
   - Felder: Name, Typ, Pflicht?, Standard, Eindeutigkeit, Wertebereich, Beschreibung
   - Schlüssel: Primärschlüssel, Fremdschlüssel, zusammengesetzte Schlüssel
   - Beziehungen: Art (1:1, 1:n, n:m), Gegenstück, Löschverhalten
   - Indizes: welche Abfrage sie bedienen
   - Lebenszyklus: Erzeugung, Änderung, Löschung (hart oder weich)
2. **Beziehungsübersicht** — ein Mermaid-`erDiagram` plus Prosa zu den nicht offensichtlichen.
3. **Schnittstellen (API)** — je Endpunkt: Methode, Pfad, Zweck, Eingabe (Felder, Typen,
   Pflicht), Ausgabe (Form), Fehlerfälle mit Statuscode und Fehlerformat, Berechtigung,
   Idempotenz, Ratenbegrenzung.
4. **Authentifizierung und Autorisierung** — Verfahren, Sitzungen oder Tokens, Rollen und
   Rechte je Entität und Aktion.
5. **Validierung und Fehlerformat** — wo validiert wird, welche Fehlerform zurückkommt,
   welche Fehlercodes es gibt.
6. **Migrationen und Datenhaltung** — Ausgangsschema, Migrationswerkzeug, Umgang mit
   bestehenden Daten, Seed-Daten, Aufbewahrung und Löschung.
7. **Nicht-funktionale Vorgaben** — Konsistenz, Transaktionen, Nebenläufigkeit,
   Zwischenspeicherung, Datenschutz und personenbezogene Felder.
8. **Akzeptanzkriterien** — je Entität und je Endpunkt mindestens eine prüfbare Aussage.

## Form für Felder

Tabelle je Entität:

| Feld | Typ | Pflicht | Standard | Eindeutig | Beschreibung |
|---|---|---|---|---|---|
| `id` | uuid | ja | — | ja | Primärschlüssel |

## Qualitätslatte

- Jede Entität aus dem App-Flow kommt vor, und jede Entität wird von einem Fluss benutzt.
- Jede Beziehung ist auf beiden Seiten beschrieben.
- Jeder Endpunkt hat mindestens einen Fehlerfall.
- Personenbezogene Felder sind markiert, samt Aufbewahrungsfrist.
