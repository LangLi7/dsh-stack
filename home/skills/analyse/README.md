# Skill `analyse` — Aufbau, Herkunft, Betrieb

Teil der Harness-Renovierung. Hier steht, was dieser Skill kann, wie er aufgebaut ist und
welche Mechanismen dabei geklärt wurden.

## Dateien

| Pfad | Zweck |
| --- | --- |
| `SKILL.md` | Anleitung für den Agenten: wann, wie, mit welchen Regeln |
| `scripts/analyse.mjs` | Die CLI. Vier Modi, **null Abhängigkeiten**, Node ≥ 18 |
| `README.md` | Diese Datei: Aufbau, Herkunft, Betrieb, offene Punkte |

## Die vier Modi

```pwsh
$analyse = "$env:USERPROFILE\.dsh\skills\analyse\scripts\analyse.mjs"

node $analyse check                          # was kann dieser Rechner?
node $analyse codebase <pfad>   [--json]     # Struktur, Git-Spuren, Auffälligkeiten
node $analyse website  <url>    [--json]     # Inhalt, Struktur, Kopfzeilen, fremde Hosts
node $analyse logs     <datei>  [--json]     # Fehlerbilder, Häufigkeiten, heisse Stellen
node $analyse review   [pfad]   [--umfang diff|staged|dir|committed:<bereich>]
```

Alle Modi geben Markdown aus (für Menschen und Agenten lesbar) oder mit `--json` Rohdaten.
Bewusst **deterministisch**: keine KI im Werkzeug. Es liefert Fakten — bewertet wird danach.

## Getestete Fälle

| Modus | Testziel | Ergebnis |
| --- | --- | --- |
| `check` | dieser Rechner | node, git, docker, rg, uv, markitdown, gitingest erkannt |
| `codebase` | `asiathai` (34 Dateien, HTML/JS/CSS) | Struktur, fehlende Lizenz und `.gitignore` gefunden |
| `website` | lokaler Server `127.0.0.1:4180` | 488 Wörter, 14 Überschriften, 3 JSON-LD-Typen, fehlende Sicherheits-Kopfzeilen |
| `website` | `asiathai.ch` (Wix, JS-lastig) | 171 Wörter erkannt — Hinweis auf JavaScript-App |
| `logs` | 27-Zeilen-Testlog mit bekannten Fehlern | 12× gruppiertes `TypeError`-Bild, Zeitraum als Min/Max korrekt |
| `review` | DSH-Checkout (46 geänderte Dateien) | 8 Befunde, **0 Fehlalarme** nach Whitelist |
| `review` | `asiathai` ohne Git | 21× `innerHTML` — deckt sich mit dem im Konzept vermerkten Risiko |

## Zusatzwerkzeuge: markitdown und gitingest

Beide laufen **über `uvx`**, also ohne Installation und ohne Docker:

```pwsh
uvx --from markitdown markitdown <datei> > ausgabe.md     # PDF, Word, Excel, Bilder, HTML …
uvx --from gitingest gitingest <pfad-oder-url> --output digest.txt
```

Geprüft: `markitdown 0.1.8` wandelt HTML sauber nach Markdown. `gitingest` erzeugt für den
Skill-Ordner einen 6,3-KB-Digest mit Verzeichnisbaum und geschätzten 1,7k Token.

**Wichtig bei gitingest:** bei grösseren Repos immer `--output` in eine Datei schreiben und
dann ausschnittsweise lesen — sonst läuft der Kontext über.

## Was beim Bauen geklärt wurde

**1. Wie ein Skill registriert wird.** Kein Eintrag in `settings.yaml` nötig. Es genügt,
`SKILL.md` unter `~/.dsh/skills/<name>/` abzulegen — der Harness lädt ihn im Betrieb sofort
nach (nachgewiesen: dieser Skill erschien während der laufenden Sitzung im Katalog).

**2. Warum die `cc-*`-Sammlungen nicht im Katalog stehen — gemessen, nicht vermutet.**

| Messung | Wert |
| --- | --- |
| `SKILL.md` unter `~/.dsh/skills` | 2761 |
| davon `disable-model-invocation` gesetzt | **2748** |
| modell-aufrufbar | **13** |
| dazu in `~/.agents/skills` | 3 |
| = Katalog dieser Sitzung | **16** ✓ |

**Es gibt keine Katalog-Obergrenze.** Der Katalog enthält genau die Skills, deren
Frontmatter den Modellaufruf erlaubt. Die grosse Mehrheit der Sammlungen ist von ihren
Autoren **absichtlich gesperrt**: Es sind konvertierte Claude-Code-*Befehle*
(`x-dsh-cc-command: '.opencode/harness-audit'`), die der Nutzer auslöst, nicht das Modell —
sonst würde jeder Befehl bei jeder Anfrage mitspielen. Eine frühere Version dieser Datei
behauptete eine Grössebegrenzung; **das war falsch.**

Nachweis, dass gesperrte Skills wirklich unerreichbar sind: ein Aufruf von `production-audit`
endet mit *„skill is not available for model invocation"*.

**3. Drei Skills gezielt befördert.** Aus den 101 thematisch passenden, nicht gesperrten
Kandidaten wurden drei ausgewählt, weil sie Lücken schliessen, die `analyse` nicht abdeckt:

| Skill | Herkunft | Warum |
| --- | --- | --- |
| `agent-code-reviewer` | `cc-affaan-m__ECC` | Ausführliche Review mit Begründung — ergänzt die Mustersuche von `review` |
| `agent-security-reviewer` | `cc-affaan-m__ECC` | Sicherheitsprüfung (OWASP, SSRF, Injection, Krypto) |
| `cmd-harness-audit` | `cc-affaan-m__ECC` | Deterministischer Repo-/Harness-Audit mit Scorecard |

**Rezept** (Originale bleiben unberührt, in der Kopie wird nur die Sperre entfernt):

```pwsh
$pack = "$env:USERPROFILE\.dsh\skills\cc-affaan-m__ECC"
$name = 'agent-code-reviewer'
Copy-Item "$pack\$name" "$env:USERPROFILE\.dsh\skills\$name" -Recurse -Force
$f = "$env:USERPROFILE\.dsh\skills\$name\SKILL.md"
(Get-Content $f -Raw) -replace "(?m)^disable-model-invocation:\s*'?true'?\s*\r?\n", '' |
  Set-Content $f -Encoding utf8 -NoNewline
```

**Nachgewiesen:** Nach dem Befördern wuchs der Sitzungskatalog von 16 auf **19 Einträge** —
die drei erschienen sofort, ohne Neustart und ohne `settings.yaml`.

**Zu bedenken:** Damit werden Befehle modell-aufrufbar, die als Nutzerbefehle gedacht waren.
Für drei gezielt ausgewählte ist das ein bewusster, reversibler Eingriff (Ordner löschen
genügt). Für alle 2748 wäre es falsch: Das würde den Systemprompt fluten und die Absicht der
Paketautoren übergehen. Jede Kopie trägt deshalb eine Herkunftsnotiz im Frontmatter.

**Nachbesserung nach dem Laden — und was sie über Skill-Promotion lehrt:**

Beim ersten echten Laden fiel auf, dass `cmd-harness-audit` auf `scripts/harness-audit.js`
verweist — **diese Datei war in der Kopie nicht enthalten**. Ein ladbarer Skill ohne sein
Werkzeug ist wertlos. Nachgeholt aus `cc-sources/affaan-m__ECC/scripts/` (34,5 KB).

Danach lief das Skript immer noch nicht: Es bricht mit `ENOTDIR` ab, weil in unserem Checkout
`.claude/skills` eine **Datei** ist, kein Verzeichnis — das Skript liest Pfade ein, ohne zu
prüfen, ob es Verzeichnisse sind. Behoben mit einer Schutzfunktion und Absicherung an den drei
Lesestellen. Ergebnis:

| Ziel | Vorher | Nachher |
| --- | --- | --- |
| DSH-Checkout | `ENOTDIR`, Abbruch | **23/39**, 7 Befunde, 3 Handlungsempfehlungen |
| ECC-Original | 80/80 | 80/80 (keine Regression) |

**Ehrlicher Vorbehalt:** Das Audit bewertet die **ECC-Anbindung** eines Repos, nicht dessen
Qualität allgemein — die Empfehlungen lauten etwa «ECC-Plugin installieren» und «.claude-Hooks
ergänzen». Als DSH-Note ist die Zahl deshalb wenig aussagekräftig. Nützlich ist die
Kategorienliste als Checkliste, was ein Agenten-Harness üblicherweise mitbringt: Werkzeugabdeckung,
Kontext-Effizienz, Qualitätsschranken, Gedächtnis, Evals, Sicherheitsleitplanken, Kosten,
GitHub-Anbindung.

**Merksatz für künftige Beförderungen:** Ein Skill ist erst nutzbar, wenn (1) die Sperre weg ist,
(2) **alle referenzierten Dateien mitkopiert** sind und (3) er gegen ein echtes Ziel getestet
wurde. Die anderen beiden beförderten Skills (`agent-code-reviewer`, `agent-security-reviewer`)
sind reine Anweisungen ohne Dateibezug — sie brauchen nur Schritt 1.



**3. Docker.** Der Harness *kann* Docker auf diesem Windows-Desktop nutzen: Image gebaut,
Container gestartet, Port veröffentlicht, Persistenz über Neustart geprüft. Was fehlte, war
nicht die Fähigkeit, sondern ein Werkzeug, das sie nutzt. Deshalb ist der Analyse-Skill
**nicht** auf Docker angewiesen: Er läuft mit Node, und Zusatzwerkzeuge kommen über `uvx`.

**4. CodeRabbit ohne Konto.** Die Skills `code-review` und `autofix` (MIT, aus
`coderabbitai/skills`) setzen den CodeRabbit-CLI **mit Anmeldung** voraus und sind ohne
Konto nicht nutzbar. Ihr Ablauf wurde nicht kopiert, sondern nachgebaut: Modus `review`
liefert dieselbe Struktur (Befunde nach Schwere, dann Vorgehen) ohne Dienst.

## Grenzen

- Die Regeln sind **konservativ** — keine Treffer sind kein Freispruch. Was das Werkzeug
  nicht sieht, muss ein Blick in den Code zeigen.
- `review` kennt keine Datenfluss- oder Typprüfung; es ist eine Mustersuche mit Struktur,
  kein Ersatz für Tests, `tsc` oder einen echten Linter.
- `website` liest das ausgelieferte HTML. Bei JavaScript-Anwendungen braucht es Firecrawl
  oder einen Browser (siehe `SKILL.md`).
- `logs` liest bis zur Grösse aus `--maxmb` (Standard 200 MB) und hält nur die ersten
  Vorkommen je Gruppe fest.

## Offene Punkte

1. **`flaky`-Erkennung in Logs** — wiederkehrende Fehler mit zeitlichem Muster (z. B. alle
   5 Minuten) hervorheben.
2. **`review` um Typprüfung erweitern:** `tsc --noEmit`, `ruff`, `shellcheck` automatisch
   mitlaufen lassen, wenn vorhanden.
3. **Digest-Modus:** `gitingest` direkt aus dem Skill aufrufen und die Ausgabe gefiltert
   zurückgeben, statt sie dem Modell zu überlassen.
4. Weitere Werkzeuge aus der Liste sind noch nicht eingebunden: `Graft` und
   `codebase-memory-mcp` (Code-Graph, für grosse Repos), `markitdown`-MCP.
