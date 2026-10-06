---
name: codegraph
description: Code-Graph über codebase-memory-mcp — Repository indexieren und strukturelle Fragen in Millisekunden beantworten: Architektur, wer ruft was, Blast-Radius einer Änderung, Dead Code, Cypher-Abfragen. 162 Sprachen, lokaler SQLite-Graph, kein Schlüssel, kein Cloud-Dienst. Als CLI (codebase-memory-mcp cli …) und als MCP-Werkzeuge (mcp__cbm__*) nutzbar.
whenToUse: Wenn ein Repository strukturell verstanden werden soll statt Datei für Datei — «wer ruft diese Funktion», «was bricht, wenn ich das ändere», «wie hängt das zusammen», «welcher Code wird nirgends benutzt», «Architekturüberblick». Auslöser sind unter anderem "Blast-Radius", "Call-Graph", "wer nutzt das", "Dead Code", "Architektur", "indexiere dieses Projekt", "trace".
---

# Code-Graph mit codebase-memory-mcp

Der Graph ersetzt das Datei-für-Datei-Suchen: eine Abfrage statt Dutzender `grep`/`read`-Runden.
Gemessen laut Projekt: **10× weniger Token, 2,1× weniger Werkzeugaufrufe** gegenüber
dateiweiser Erkundung (Preprint arXiv:2603.27277).

## Zwei Wege — beide ohne Schlüssel, beide lokal

**Als MCP-Werkzeuge** (`mcp__cbm__*`, registriert in `cordis.patch.yml` als `mcp-cbm`):

| Werkzeug | Wofür |
| --- | --- |
| `mcp__cbm__index_repository` | Projekt indexieren (absoluter Pfad!) |
| `mcp__cbm__get_architecture` | Sprachen, Pakete, Einstiegspunkte, Routen, Hotspots, Cluster |
| `mcp__cbm__trace_path` | Wer ruft diese Funktion — oder was ruft sie (`direction`) |
| `mcp__cbm__detect_changes` | Uncommittete Änderungen → betroffene Symbole + Risiko |
| `mcp__cbm__search_graph` | Strukturell/BM25/semantisch suchen |
| `mcp__cbm__query_graph` | Cypher-Teilmenge (lesend) |
| `mcp__cbm__get_code_snippet` | Quelltext einer Funktion über den qualifizierten Namen |
| `mcp__cbm__get_file_outline` | Deklarationen einer Datei in Quelltextreihenfolge |

**Als CLI** — funktioniert auch, wenn der MCP-Server (noch) nicht verbunden ist:

```pwsh
$cbm = "$env:APPDATA\npm\codebase-memory-mcp.cmd"

& $cbm cli list_projects --format json
& $cbm cli index_repository --repo-path "C:\pfad\zum\repo"
& $cbm cli get_architecture --project <name>
& $cbm cli trace_path --project <name> --function-name handleRequest --direction inbound
& $cbm cli query_graph --project <name> --query "MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 20"
```

Den Projektnamen liefert `list_projects` (z. B. `D-.Projekt-heusc` für `D:/.Projekt/heusc`).

## Ablauf

1. **Indexieren** (einmal je Projekt): `index_repository` mit absolutem Pfad. Danach hält ein
   Watcher den Graphen über Git-Änderungen aktuell.
2. **Erst `get_graph_schema`** — es zeigt Knoten- und Kantentypen. Dann gezielt fragen.
3. **Namen zuerst finden:** `search_graph` mit `name_pattern: ".*Teilname.*"`, dann mit dem
   exakten Namen `trace_path` oder `get_code_snippet` aufrufen.
4. **Bei Fehlschlägen:** `check_index_coverage` sagt, ob Pfade überhaupt indexiert sind.
   Ein sauberes Ergebnis heisst «keine Lücke bekannt», nicht «vollständig».

## Bewährte Abfragen

```
Blast-Radius:      detect_changes(scope='impact')      # vor dem Commit
Call-Kette:        trace_path(function_name='X', direction='inbound', depth=3)
Dead Code:         query_graph("MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50")
Architektur:       get_architecture(aspects=['structure','dependencies','routes','hotspots'])
```

## Regeln

- **Der Graph ist ein Index, keine Wahrheit.** Vor dem Ändern die Stelle mit `read` ansehen.
- **`dead_code` heisst «kein Aufruf im Graphen»**, nicht «unbenutzt»: dynamische Aufrufe,
  Reflexion und externe Einstiegspunkte sieht der Graph nicht.
- **`detect_changes` braucht Git.** Ohne Repository bleibt nur der statische Graph.
- **Grosse Projekte:** Index liegt unter `~/.cache/codebase-memory-mcp/` (SQLite, WAL).
  Der Linux-Kernel braucht laut Projekt 3 Minuten — für unsere Projekte Sekunden.
- **Der Daemon** läuft pro Konto einmal. Klemmt etwas:
  `codebase-memory-mcp daemon stop`, dann den blockierenden Prozess beenden und neu starten.
- **Kein Schreiben:** `query_graph` ist lesend. Was der Graph nicht kann, macht `analyse codebase`.
