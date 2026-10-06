---
name: nl2sql
description: Natural Language to SQL — natürliche Fragen in geprüfte SQL-Abfragen übersetzen. Liest das Schema dynamisch aus der Datenbank (Tabellen, Spalten, Typen, Schlüssel, Beispielwerte), baut daraus den Modellauftrag, übersetzt per OpenAI-kompatiblem Modell ODER im Regelmodus ohne Schlüssel, und prüft das Ergebnis mit einem Query-Guard: nur lesend, nur bekannte Tabellen und Spalten, ausführbar laut EXPLAIN. Architektur angelehnt an LangLi7/go-database (Schema-Erkundung, Query-Guard, Safe-Executor).
whenToUse: Wenn eine Datenbank mit natürlicher Sprache abgefragt werden soll — «wie viele Kunden haben letztes Jahr bestellt», «zeig mir die teuersten Produkte», «welche Bestellungen sind offen». Auch wenn SQL erzeugt, erklärt oder auf Schreibzugriffe geprüft werden soll. Auslöser sind unter anderem "übersetze in SQL", "frag die Datenbank", "NL2SQL", "SQL generieren", "Query bauen".
---

# Natural Language to SQL

Vier Schritte, jeder einzeln aufrufbar. Die Trennung ist der Punkt: Das Schema wird
**gelesen**, nicht geraten; das SQL wird **geprüft**, nicht vertraut.

```
1. schema  →  Tabellen, Spalten, Typen, Schlüssel, Beispielwerte
2. prompt  →  nachvollziehbarer Auftrag für das Modell (Schema + Regeln)
3. ask     →  Modell aufrufen  ODER  Regelmodus ohne Schlüssel
4. check   →  Query-Guard: nur lesend, nur bekannte Objekte, EXPLAIN
```

## Aufrufe

```pwsh
$nl = "$env:USERPROFILE\.dsh\skills\nl2sql\scripts\nl2sql.mjs"

node $nl schema <db-datei>                     # Schema anzeigen (Markdown/Text)
node $nl prompt <db-datei> "Frage"             # Modellauftrag anzeigen
node $nl ask    <db-datei> "Frage" [--json]    # SQL erzeugen (Modell oder Regeln)
node $nl check  <db-datei> "SELECT ..."        # SQL prüfen
node $nl test                                  # Selbsttest mit Test-Schema
```

**Modell konfigurieren** (ohne diese Variablen läuft der Regelmodus):

```pwsh
$env:NL2SQL_BASE_URL = 'https://openrouter.ai/api/v1'   # oder http://localhost:1234/v1 (LM Studio)
$env:NL2SQL_API_KEY  = '...'
$env:NL2SQL_MODEL    = 'qwen2.5-coder-7b-instruct'
```

Damit ist der Skill anbieterneutral — OpenAI, OpenRouter, LM Studio, Ollama mit
OpenAI-kompatibler Schnittstelle. Genau wie im Referenzprojekt.

## Was der Query-Guard prüft

| Stufe | Prüfung | Verhalten |
| --- | --- | --- |
| kritisch | Schreibende Befehle (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `ATTACH`, `PRAGMA` …) | sofort abgelehnt |
| kritisch | Beginnt nicht mit `SELECT`/`WITH` | abgelehnt |
| kritisch | Mehrere Anweisungen in einer Abfrage | abgelehnt |
| hoch | Unbekannte Tabelle in `FROM`/`JOIN` | abgelehnt |
| hoch | `EXPLAIN QUERY PLAN` schlägt fehl | abgelehnt |
| mittel | Spalte nicht im Schema | gemeldet |

Rückgabecode: **0** = geprüft und in Ordnung · **1** = abgelehnt · **2** = laut Modell nicht übersetzbar.

## Regeln

- **Schema immer dynamisch lesen** — kein hartkodiertes Schema, keine erfundenen Spalten.
- **Nie ungeprüft ausführen.** Erst `ask`, dann `check`. Der Guard ist die Sicherheitslinie,
  nicht das Modell.
- **Nur lesend.** Für Änderungen ist der Skill nicht gedacht; dafür gibt es Migrationen.
- **Ohne Schlüssel ist der Regelmodus begrenzt:** Zählen, Auflisten, Summieren, einfache
  Sortierung. Alles darüber braucht ein Modell — dann liefert der Skill Schema und Guard,
  das Modell die Übersetzung.
- **Annahmen sichtbar machen:** Das Modell ergänzt bei Mehrdeutigkeit `-- ANNAHME: …`;
  diese Zeile im Ergebnis weitergeben, nicht verschweigen.
- **Bei „nicht möglich" nicht raten.** Das Modell antwortet `NICHT_MOEGLICH: <Grund>` —
  das ist ein gültiges Ergebnis.

## Selbsttest

`node $nl test` baut ein Test-Schema (Kunden, Produkte, Bestellungen) und prüft
**acht** Fälle: fünf erwartete Übersetzungen und vier, die der Guard **ablehnen muss**
(DROP, DELETE, zwei Anweisungen, unbekannte Tabelle). Der Test läuft ohne Modell und
ohne Kosten — deshalb prüft er die Schutzschicht, nicht die Sprachqualität.

## Grenzen

- Bisher **SQLite** (über `node:sqlite`). PostgreSQL braucht einen anderen Treiber —
  die Schema-Funktion ist die einzige Stelle, die angepasst werden müsste.
- Der Guard ist eine **Textprüfung plus EXPLAIN**, kein vollständiger SQL-Parser.
  Für Schreibschutz reicht er, für formale Korrektheit nicht.
- Er kennt keine Berechtigungen: Wer den Skill aufruft, sieht das ganze Schema.
