---
name: analyse
description: Systematische Analyse von Codebasen, Websites und Logdateien. Liefert deterministische Fakten (Struktur, Abhängigkeiten, Git-Spuren, Inhalts- und Strukturwerte einer Seite, Fehlerbilder und Häufigkeiten in Logs) und daraus abgeleitete Befunde. Nutzt eine eigene Node-CLI ohne Abhängigkeiten sowie optional markitdown und gitingest über uvx.
whenToUse: Wenn ein fremdes oder eigenes Projekt verstanden, eine Website untersucht, ein Fehler oder eine fehlerhafte Stelle eingegrenzt werden soll. Auslöser sind unter anderem "analysiere dieses Repo", "was macht dieses Projekt", "schau dir diese Website an", "warum schlägt das fehl", "hier ist ein Log", "Codebase prüfen", "wo fange ich an zu lesen", "Fehleranalyse", "Bestandsaufnahme", "Audit".
---

# Analyse — Codebase, Website, Logs

Drei Modi, ein Werkzeug. **Erst messen, dann deuten:** Die CLI liefert Fakten
(Dateizahlen, Grösse, Muster, Häufigkeiten, Zeiträume). Die Bewertung machst du danach —
und du trennst in deinem Bericht sichtbar zwischen **gemessen** und **abgeleitet**.

## Werkzeug prüfen

```pwsh
node "$env:USERPROFILE\.dsh\skills\analyse\scripts\analyse.mjs" check
```

Zeigt, was auf dem Rechner verfügbar ist: `node`, `git`, `docker`, `rg`, `uv` sowie
`markitdown` und `gitingest` über `uvx`. Fehlende Zusatzwerkzeuge werden von `uvx` bei
Bedarf geladen — **kein Docker und keine Installation nötig.**

## Modus 1: Codebase

```pwsh
node $analyse codebase <pfad>            # Markdown-Bericht
node $analyse codebase <pfad> --json     # Rohdaten für eigene Auswertung
node $analyse codebase <pfad> --top 15   # mehr Treffer in den Listen
```

Liefert: Umfang und Sprachen, Projektbild (Tests, CI, Docker, README, Lizenz, Lockfile,
`.env.example`), `package.json` mit Skripten und Abhängigkeitszahl, Git-Zustand inkl.
**am häufigsten geänderter Dateien** (Brennpunkte), Auffälligkeiten im Quelltext
(Konsolenausgaben, `debugger`, TODO/FIXME, `eval`, Shell-Aufrufe mit Variablen,
`innerHTML`, mögliche Geheimnisse im Code, unverschlüsselte URLs, leere Catch-Blöcke),
grösste und längste Dateien sowie eine Liste **«wo zuerst lesen»**.

Direkt danach gezielt nachlesen — nicht raten:

```
grep   Muster im Code          (Tool `grep`)
read   Datei mit Zeilennummern (Tool `read`)
glob   Dateien nach Muster     (Tool `glob`)
```

**Optionaler Turbo für grosse Repos:** ein Digest statt vieler Einzeldateien.

```pwsh
uvx --from gitingest gitingest <pfad-oder-github-url> --output digest.txt
```

Bei grossen Repos **immer** in eine Datei schreiben und dann mit `grep`/`read` ausschnittsweise
lesen — sonst läuft der Kontext über.

## Modus 2: Website

```pwsh
node $analyse website <url>            # Markdown-Bericht
node $analyse website <url> --json
```

Liefert: HTTP-Status, Grösse, Antwortzeit, Titel und Beschreibung, Sprache (`lang`),
Überschriften-Hierarchie (h1–h3), Links intern/extern, Bilder **mit fehlendem alt-Text**,
Skripte/Stylesheets/Formulare, strukturierte Daten (JSON-LD mit Typen), kanonische URL,
**fremde Hosts** (Datenschutz und Ladezeit), Sicherheits-Kopfzeilen (HSTS, CSP,
X-Content-Type-Options, Referrer-Policy), erkennbares CMS über `generator`.

**Wichtig:** Ist die Textmenge sehr klein und gibt es viele Skripte, ist die Seite eine
JavaScript-Anwendung — rohes HTML genügt dann nicht. In diesem Fall:

- **Firecrawl** (`mcp__firecrawl__firecrawl_scrape`, `formats: ["markdown"]`) für gerenderte Inhalte,
- **Browser über DevTools-Protokoll** (chrome-devtools MCP) für echte Interaktion und Konsolenfehler,
- `firecrawl_map` für die Seitenliste einer Domain.

**Dokumente und Dateien umwandeln:**

```pwsh
uvx --from markitdown markitdown <datei> > ausgabe.md
```

Kann PDF, Word, PowerPoint, Excel, Bilder (mit OCR), HTML, CSV/XML und mehr nach Markdown.
Ideal, wenn Unterlagen, Angebote oder Screenshots ausgewertet werden sollen.

## Modus 3: Logs und Fehler

```pwsh
node $analyse logs <datei>             # auch:  Get-Content x.log | node $analyse logs -
node $analyse logs <datei> --top 20
```

Liefert: Zeitraum (Minimum/Maximum), Verteilung der Ebenen (fatal/error/warn/info/debug),
**normalisierte Fehlerbilder mit Häufigkeit und Erst-/Letztauftreten** (Zahlen, IDs, IPs und
Zeitstempel werden zu Platzhaltern, damit gleiche Fehler gruppiert werden), Ausnahmen,
HTTP-Statuscodes, genannte Dateien mit Zeilennummern (heisse Stellen), beteiligte Adressen
und die Stackrahmen des ersten Fehlers. Unterstützt auch **JSON-Logs** mit `level`/`message`.

Ablauf bei der Fehlersuche:

1. Häufigstes Fehlerbild zuerst — es erklärt meist die meisten Symptome.
2. Die genannten Dateien und Zeilen mit `read` ansehen.
3. Zeitlichen Verlauf prüfen: Ballen sich Fehler in einem Fenster (Deployment, Lastspitze)?
4. Erst danach eine Hypothese formulieren und **eine** Gegenprobe machen.

## Modus 4: Codeprüfung (lokal, ohne Dienst)

```pwsh
node $analyse review                    # nicht committete Änderungen (git diff)
node $analyse review <pfad> --umfang dir       # alle Quelldateien
node $analyse review <pfad> --staged           # vorgemerkte Änderungen
node $analyse review <pfad> --umfang committed:HEAD~3..HEAD
```

Prüft deterministisch gegen 13 eingebaute Regeln und ordnet jeden Treffer einer Schwere zu:

| Schwere | Beispiele |
| --- | --- |
| kritisch | Geheimnis im Code, privater Schlüssel, `eval`, Shell-Aufruf mit Variable, unverschlüsselte Verbindung |
| hoch | `innerHTML` ohne Escaping, leerer `catch`, `JSON.parse` ohne `try`, SQL aus Zeichenketten |
| mittel | `debugger`, Konsolenausgaben |
| niedrig | offene TODO/FIXME, auskommentierter Code, sehr lange Datei |

**Das ist der Ersatz für die CodeRabbit-Skills**, wenn kein CodeRabbit-Konto vorhanden ist:
gleiche Aufgabenteilung (Befunde nach Schwere, dann Vorgehen), aber ohne Anmeldung, ohne
Dienst und ohne Kosten. Die Community-Skills `code-review` und `autofix` verlangen den
CodeRabbit-CLI samt Login und bleiben deshalb aussen vor.

**Jeder Treffer ist ein Verdacht, kein Urteil.** Vor dem Ändern die Stelle mit `read` ansehen.

## Regeln

- **Zahlen kommen aus dem Werkzeug**, nicht aus dem Gedächtnis. Keine Zeilennummer, keine
  Häufigkeit und keine Dateigrösse schätzen.
- **Gemessen und gedeutet trennen.** Im Bericht kennzeichnen: «gemessen: …» / «Vermutung: …».
- **Keine Volltext-Dumps** in die Antwort. Immer verdichten; bei Bedarf die `--json`-Ausgabe
  mit einem kurzen Node-Einzeiler auswerten.
- **Nichts ausführen, was Schaden kann:** Der Modus `codebase` liest nur. Baue, installiere
  oder starte nichts, ohne zu fragen.
- **Bei privaten Daten** (Logs mit IPs, Namen, Token): darauf hinweisen und Inhalte nur
  auszugsweise wiedergeben.
- **Unsicherheit benennen.** Wenn eine Datei fehlt, ein Log unvollständig ist oder eine
  Angabe nicht belegt werden kann, sag es — statt zu füllen.
