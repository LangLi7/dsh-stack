---
name: self-improve
description: Selbstverbesserung für Harness und Crew — Aufgaben vorschlagen, Scaffolds bauen, Rollouts laufen lassen, deterministisch bewerten, Ergebnis sichern. Vorbild ist Ornith (Self-Scaffolding 1.0 → Self-Improvement 1.5). Enthält einen ausführbaren Selbsttest, der den Harness objektiv prüft, und Regeln gegen Evaluation-Hacking. Auslöser sind "/self-improve", "selbst verbessern", "Harness prüfen", "Selbsttest", "was können wir besser", "Regression prüfen".
whenToUse: Wenn der Harness, die Crew oder die eigenen Skills messbar besser werden sollen — nach Umbauten (Regression), vor grösseren Änderungen (Ausgangslage), oder wenn eine wiederkehrende Schwäche systematisch statt einzeln behoben werden soll.
---

# Selbstverbesserung — der Loop

Vorbild ist **Ornith** ([ornith.ai](https://ornith.ai/)): Ornith-1.0 führte *Self-Scaffolding*
ein — das Modell baut sich für eine Aufgabe erst das passende Gerüst und löst sie dann.
Ornith-1.5 erweitert das zum geschlossenen Kreis: **Aufgaben vorschlagen → Scaffold bauen →
Lösungen erzeugen → bewerten → zurückfüttern.**

Und Ornith benennt offen die Gefahr, die jeden solchen Kreis zerstört:
**Evaluation-Hacking** — „das selbstlernende System versucht, die Bewertung auszutricksen,
und erzeugt Code, der schneller aussieht, aber keiner ist." ([Blog](https://ornith.ai/defense_kernel_hack.html))
Deshalb steht hier die Bewertung **ausserhalb** des Systems, das verbessert wird.

## Die fünf Schritte

```
1. Aufgaben vorschlagen   aus echten Schwächen, nicht aus Einbildung
2. Scaffold bauen         Skill, Prompt, Werkzeug, Checkliste für genau diese Aufgabe
3. Rollout                Aufgabe unter dem Scaffold wirklich ausführen
4. Bewerten               deterministisch, von aussen, mit Gegenprobe
5. Zurückfüttern          was hielt, wird Regel; was nicht hielt, wird verworfen
```

**Schritt 1 — Aufgaben vorschlagen.** Quellen: wiederkehrende Fehler aus Sitzungen,
Befunde aus `analyse review`, offene Punkte aus Skill-READMEs, Nutzerkorrekturen.
Jede Aufgabe braucht ein **messbares Kriterium** («Die drei Aufrufe in Skill X laufen durch»),
sonst ist sie nicht bewertbar. Maximal drei Aufgaben gleichzeitig.

**Schritt 2 — Scaffold bauen.** Kleinstes Gerüst, das die Aufgabe löst: eine Checkliste,
ein Skript, ein neuer Abschnitt in einer SKILL.md. Kein Umbau auf Vorrat.

**Schritt 3 — Rollout.** Aufgabe ausführen. Bei generativen Aufgaben **mehrfach** laufen
lassen (Ornith: Rollouts) — einmal gelingt vieles zufällig.

**Schritt 4 — Bewerten.** Nur deterministische Signale (siehe unten). Keine Selbstbewertung
des Modells, kein «das sieht gut aus».

**Schritt 5 — Zurückfüttern.** Was sich bewährt hat, wandert als Regel in die SKILL.md
(mit Datum). Was nicht hielt, wird **entfernt** statt liegen gelassen — sonst wächst der
Harness an Ballast.

## Die Bewertung: objektiv, aussen, klein

```pwsh
node "$env:USERPROFILE\.dsh\skills\self-improve\scripts\selbsttest.mjs"
node .../selbsttest.mjs --json          # maschinenlesbar
node .../selbsttest.mjs --basis basis.json   # mit früherem Lauf vergleichen (Regression)
```

Der Selbsttest prüft **von aussen**, was wirklich da ist:

| Gruppe | Prüfungen |
| --- | --- |
| Skills | SKILL.md vorhanden, Frontmatter gültig, **referenzierte Dateien existieren**, Duplikate |
| Werkzeuge | `analyse` in allen vier Modi, `docker-bereit.mjs`, Rückgabecodes |
| Umgebung | node, git, rg, uv, markitdown, gitingest, Docker-Daemon |
| Projektstand | offene Änderungen, Review-Befunde nach Schwere |

Damit ist Evaluation-Hacking strukturell erschwert: Der Prüfer ist ein Skript, das Dateien
liest und Befehle ausführt — nicht das Modell, das sich selbst benotet.

## Regeln gegen Selbstbetrug

1. **Bewertung von aussen.** Wer die Aufgabe löst, bewertet sie nicht.
2. **Dateien lügen nicht.** Geprüft wird, was auf der Platte liegt und was Befehle ausgeben —
   nicht, was behauptet wurde.
3. **Rollouts statt Einzeltreffer.** Mindestens zwei Durchläufe bei allem, was nicht
   deterministisch ist.
4. **Basislinie behalten.** Ohne Vorwert ist «besser» nicht messbar. `--basis` speichern.
5. **Keine Kriterienverschiebung.** Wird eine Prüfung gelockert, muss das im Ergebnis stehen —
   sonst ist der Fortschritt erfunden.
6. **Aufgaben zurückstellen statt umdeuten.** Was nicht bestanden wird, bleibt offen.
7. **Ballast entfernen.** Ein Scaffold, das nichts messbar verbessert, wird gelöscht.

## Was ich zuerst gemessen habe (Ausgangslage)

Der Selbsttest hat beim ersten Lauf echte Funde ergeben — Beispiel aus dieser Sitzung:
Ein beförderter Skill verwies auf `scripts/harness-audit.js`, das in der Kopie fehlte.
Der Skill sah fertig aus, war aber unbrauchbar. Genau solche Lücken findet nur eine Prüfung,
die Dateien liest statt Beschreibungen.

## Verhältnis zu Crew und Harness

- **Harness:** Skill- und Werkzeugbestand, Regressionsschutz durch den Selbsttest.
- **Crew:** Jeder Lauf liefert Rollouts. Ein wiederkehrender Fehltyp wird zur Aufgabe in
  Schritt 1; bewährt sich ein Gegenmittel, wird es zur Regel im Planner-Auftrag.
- **Gedächtnis:** Ergebnisse mit Datum sichern (`memory_save`), damit die nächste Sitzung
  nicht bei null beginnt.
