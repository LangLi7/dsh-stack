---
name: analyse-voll
description: Vollanalyse in einem Durchgang — vereint Codebase-, Website-, Log- und Review-Analyse mit externer Recherche zu einem belegten Dossier. Erklärt und beantwortet "was bedeutet Analyse hier eigentlich", sammelt den nötigen Kontext, prüft deterministisch und trennt Gemessenes von Gedeutetem. Einstieg für "/analyse", "Vollanalyse", "analysiere das gründlich", "mach ein Dossier", "Bestandsaufnahme mit Recherche".
whenToUse: Wenn eine gründliche, mehrgleisige Analyse gewünscht ist statt eines einzelnen Befehls — etwa ein fremdes Projekt verstehen, einen Fehler mit Ursache und Kontext, eine Website samt Wettbewerbsumfeld, oder eine Entscheidungsgrundlage. Auch wenn ausdrücklich "/analyse" aufgerufen wird.
---

# Vollanalyse — der Rahmen um die vier Modi

Diese Skill ist der **Rahmen**, nicht das Werkzeug. Die Messungen macht
`analyse` (`scripts/analyse.mjs`), die externe Recherche `deep-research`.
Hier steht, **was Analyse in diesem Harness bedeutet**, welcher Kontext gesammelt
wird und in welcher Reihenfolge — damit aus vier Aufrufen ein belastbares Dossier wird.

## Was Analyse hier bedeutet

Analyse ist **keine Zusammenfassung und keine Meinung**. Sie ist die Kette:

```
Frage → Kontext sammeln → messen → deuten → gegenprüfen → Empfehlung
```

Vier Grundsätze:

1. **Messen vor deuten.** Jede Zahl, jede Zeilennummer, jede Dateigrösse kommt aus einem
   Werkzeug. Nichts wird geschätzt.
2. **Kontext vor Bewertung.** Ohne Zweck des Projekts, Zielgruppe und Randbedingungen ist
   jede Bewertung wertlos. Fehlt der Kontext, wird er erfragt — nicht erfunden.
3. **Gegenprobe vor Empfehlung.** Jede Hypothese braucht eine Prüfung, die sie auch
   widerlegen könnte. Eine Hypothese ohne Gegenprobe bleibt Hypothese.
4. **Trennung im Bericht.** «Gemessen», «abgeleitet», «Vermutung» werden sichtbar
   unterschieden. Unsicherheit wird benannt, nicht überspielt.

## Welcher Kontext gesammelt wird

| Art | Quelle | Wofür |
| --- | --- | --- |
| Struktur | `analyse codebase` | Grösse, Sprachen, Manifeste, Tests, CI, Lockfile |
| Verlauf | Git-Teil des Codebase-Berichts | Brennpunkte (häufig geänderte Dateien), letzte Commits, offene Änderungen |
| Inhalt | `read`, `grep`, `glob` | Zweck, Rollen, Datenfluss — gezielt, nicht flächendeckend |
| Betrieb | `analyse logs` | Fehlerbilder, Häufigkeiten, heisse Dateien, Zeitfenster |
| Aussenwelt | `analyse website`, `deep-research` | öffentliche Darstellung, Wettbewerb, Normen, bekannte Fallen |
| Risiko | `analyse review` | Sicherheits- und Qualitätsmuster im aktuellen Stand |
| Vorwissen | Gedächtnis (`memory_recall`) | frühere Entscheidungen und Gotchas zu diesem Projekt |
| Umgebung | `analyse check`, `docker-bereit.mjs` | was dieser Rechner kann, was Fallback braucht |

## Der Ablauf

**Schritt 0 — Auftrag schärfen.** Frage, Zweck und Erfolgskriterium notieren. Wenn die
Frage vage ist («schau mal drüber»), **eine** Rückfrage stellen statt loszurennen.
Vorwissen aus dem Gedächtnis holen.

**Schritt 1 — Bestandsaufnahme (immer).**

```pwsh
$analyse = "$env:USERPROFILE\.dsh\skills\analyse\scripts\analyse.mjs"
node $analyse check
node $analyse codebase <pfad>
```

**Schritt 2 — Spur wählen.** Nicht alles messen, sondern was zur Frage passt:

| Frage | Spur |
| --- | --- |
| «Was ist das für ein Projekt?» | codebase + gezieltes Lesen von Einstiegspunkt und README |
| «Warum schlägt es fehl?» | logs + review + die genannten Dateien lesen |
| «Wie tritt der Betrieb nach aussen auf?» | website (+ Firecrawl bei JavaScript-Seiten) |
| «Ist das sicher / sauber?» | review + `agent-security-reviewer` |
| «Was gibt es draussen dazu?» | `deep-research` für Belege und Stand der Technik |

**Schritt 3 — Vertiefen.** Auffälligkeiten aus Schritt 1/2 mit `read` und `grep` nachgehen.
Jede Spur endet mit einer überprüfbaren Aussage oder wird als offen markiert.

**Schritt 4 — Gegenprobe.** Für die wichtigste Aussage eine Prüfung durchführen, die sie
kippen könnte: Test laufen lassen, Log-Zeitfenster vergleichen, zweite Quelle lesen,
Gegenbeispiel suchen. Ergebnis festhalten, auch wenn die Aussage hält.

**Schritt 5 — Dossier schreiben.** Feste Gliederung:

```
1. Frage und Auftrag
2. Kurzantwort (3–5 Sätze, mit den wichtigsten Zahlen)
3. Gemessen  (Fakten mit Quelle: Datei, Zeile, Befehl)
4. Abgeleitet (Bewertung mit Begründung)
5. Offen / unsicher (was nicht geprüft werden konnte und warum)
6. Empfehlung (maximal 3 Schritte, priorisiert)
7. Anhang: ausgeführte Befehle
```

**Schritt 6 — Sichern.** Entscheidungen und Gotchas ins Gedächtnis (`memory_save`).

## Wann abgebrochen wird

- **Zu gross:** Wenn das Ziel mehr als ~50'000 Zeilen Code hat, nicht flächendeckend lesen,
  sondern auf Manifeste, Einstiegspunkte und Brennpunkte konzentrieren (oder gitingest-Digest).
- **Kein Zugang:** Fehlt der Zugang (privates Repo, Seite offline), das **sagen** statt raten.
- **Frage unklar:** Eine Rückfrage ist billiger als ein Dossier am Ziel vorbei.

## Werkzeuge in Reihenfolge

1. `analyse` (CLI, vier Modi) — alle Messungen
2. `grep`, `glob`, `read` — gezielte Vertiefung
3. `deep-research` — externe Belege, Stand der Technik, Normen
4. `agent-code-reviewer`, `agent-security-reviewer` — tiefergehende Bewertung mit Begründung
5. `mcp__firecrawl__*` — JavaScript-Seiten und Seiteninventare
6. `docker-bereit.mjs` — nur wenn ein Schritt wirklich Docker braucht
7. `memory_recall` / `memory_save` — Vorwissen und Sicherung

## Regeln

- **Ein Dossier, kein Datenauswurf.** Zahlen verdichten, nicht ausbreiten.
- **Jede Empfehlung ist prüfbar formuliert**, mit Datei, Zeile oder Befehl.
- **Nicht mehr als drei Empfehlungen.** Mehr heisst: nicht priorisiert.
- **Bei Widersprüchen** zwischen Messung und Erwartung: der Messung glauben, den Widerspruch
  benennen, nicht glattbügeln.
