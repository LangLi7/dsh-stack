# Ablauf, Abhängigkeiten und Übergabe der sechs Artefakte

Diese Datei ist die **verbindliche Verfahrensanweisung** für den `planner`. Sie beantwortet vier
Fragen: In welcher Reihenfolge wird geschrieben? Was darf auf was verweisen? Wann ist ein
Artefakt fertig? Wer arbeitet damit weiter?

## 1. Reihenfolge und Abhängigkeiten

Geschrieben wird streng von oben nach unten. Jedes Artefakt darf nur auf **frühere** verweisen,
**niemals** auf ein späteres — sonst entsteht ein Zirkel, den keine Rolle mehr auflösen kann.

| # | Artefakt | Datei | Braucht Input von | Liefert an |
|---|---|---|---|---|
| 1 | Produkt-Anforderungen (PRD) | `docs/PRD.md` | Auftrag, Nutzer, Randbedingungen | TRD, Flow, UI/UX, Backend, Plan |
| 2 | Technische Anforderungen (TRD) | `docs/TRD.md` | PRD (Funktionen `F1…`, Erfolgskriterien) | UI/UX, Backend, Plan |
| 3 | App-/Projekt-Flow | `docs/APPFLOW.md` | PRD (Funktionen), TRD (Architektur) | UI/UX, Backend, Plan |
| 4 | UI/UX-Design-Brief | `docs/DESIGN-BRIEF.md` | PRD (Zielgruppe), Flow (Schritte) | Plan |
| 5 | Backend-Schema | `docs/BACKEND.md` | PRD (Funktionen), Flow (Zustände), TRD (Stack) | Plan |
| 6 | Implementierungsplan | `docs/IMPLEMENTATION.md` | alle fünf vorherigen | Ausführung durch alle Rollen |

**Warum diese Ordnung?** Jede Ebene beantwortet genau eine Frage und verkleinert den
Entscheidungsspielraum der nächsten: *Was und für wen* → *womit und unter welchen Bedingungen* →
*in welcher Reihenfolge* → *wie es aussieht* → *welche Daten* → *wer macht wann was*. Wer
umsortiert, bezahlt mit Nacharbeit: ein Datenmodell ohne Fluss kennt die Zustände nicht, ein
Implementierungsplan ohne Schema kennt die Arbeitspakete nicht.

**Vorwärts-Anforderung, Rückwärts-Verweis.** Wenn ein früheres Dokument eine Tatsache braucht,
die erst später festgelegt wird, wird sie dort als **Anforderung** formuliert, nicht als
Verweis: In der TRD steht „Der Datenfluss F3→F5 muss wiederaufnehmbar sein (Zustand wird
persistiert)"; im Backend-Schema steht dann, *wie* das geschieht. So bleibt die Leserichtung
eindeutig.

**Abbruch- und Ausnahmefälle.**
- **Keine Oberfläche** (CLI, Bibliothek, Dienst): Artefakt 4 entfällt. Stattdessen ein
  Abschnitt „Schnittstelle für Menschen" in der TRD: Ein-/Ausgabeformat, Fehlermeldungen,
  Hilfe-Text, Beispielaufrufe. Die Lücke wird im Plan ausdrücklich vermerkt.
- **Kein Backend** (reine Client-App, statische Seite): Artefakt 5 wird zum *Datenschema* —
  lokale Persistenz, Dateiformate, Versionierung. Felder, Typen und Migrationen bleiben Pflicht.
- **Bestehendes System**: Zuerst den Ist-Zustand belegen (Dateien lesen, nicht raten), dann nur
  die Artefakte neu schreiben, deren Inhalt sich wirklich ändert. Bestehende Dokumente werden
  ergänzt, nicht überschrieben; die Änderung wird im Kopf des Dokuments vermerkt.

## 2. Wann ein Artefakt fertig ist

Ein Artefakt ist **fertig**, wenn alle sechs Bedingungen erfüllt sind:

1. **Kopf vollständig** — Projekt, Fassung, Stand, Autor, Quellen.
2. **Pflichtabschnitte vorhanden** — laut Spezifikation des Artefakts; gestrichene Abschnitte
   sind begründet, nicht leer.
3. **Jede Aussage prüfbar** — Zahlen statt Adjektive. „Schnell" ist keine Anforderung,
   „Suche antwortet in < 300 ms bei 10 000 Einträgen" ist eine.
4. **Annahmen markiert** — jede Zeile beginnt mit `Annahme:` und nennt die Auswirkung, falls
   sie falsch ist.
5. **Offene Fragen sichtbar** — nummeriert (`Q1`, `Q2`), mit „zu klären von" und „blockiert was".
   Eine offene Frage blockiert nur, wenn sie im Dokument als blockierend markiert ist.
6. **Akzeptanzkriterien am Ende** — nummeriert (`AK1`, `AK2`), je mit Nachweis (Kommando, Test,
   Datei). Ein Kriterium ohne Nachweis ist eine Meinung.

Erst wenn diese sechs Punkte stehen, wird das nächste Artefakt begonnen.

## 3. Übergabe an die Ausführung

Nach Artefakt 6 wird die Arbeit **persistiert** — sonst geht sie beim nächsten Neustart
verloren:

1. `crew_workspace` (nur `planner`): Workspace-Ziel setzen, ein Projekt je Vorhaben anlegen,
   `write_project` mit den Arbeitspaketen als To-dos.
2. `crew_plan`: je Rolle das *ongoing goal* setzen — in der Sprache der Rolle.
3. `crew_todo`: je Rolle die To-do-Liste schreiben, aus den Arbeitspaketen des Plans.
4. `crew_run`: den Lauf starten, oder dem `executor` ein einzelnes Arbeitspaket übergeben.

**Der Arbeitsauftrag an eine Rolle enthält genau drei Dinge:** das Ziel, die relevanten
Ausschnitte der Artefakte plus **Dateiverweise** (nie die ganze Konversation), und die
Erfolgskriterien. Der `reviewer` bekommt zusätzlich die Akzeptanzkriterien, gegen die geprüft
wird.

## 4. Nachverfolgbarkeit — die ID-Kette

Jede Zeile im Plan muss auf eine Anforderung zurückführbar sein. Diese Kette wird eingehalten:

```
PRD F3  →  TRD NFA-2 (Antwortzeit)  →  BACKEND /api/search  →  Plan AP-4  →  Test T-4
```

Bricht die Kette, ist eine der beiden Seiten falsch: Entweder fehlt eine Anforderung im PRD,
oder der Plan enthält Arbeit ohne Auftrag (Streckung — siehe Skill `smart-principles`,
Abschnitt *YAGNI*). Der `reviewer` prüft diese Kette als Erstes.

## 5. Pflege nach dem Start

- **Änderung einer Anforderung** beginnt immer im PRD, dann abwärts: TRD, Flow, Backend, Plan.
  Nie nur den Plan ändern — dann plant das Team gegen ein veraltetes Versprechen.
- **Fassung erhöhen** bei jeder inhaltlichen Änderung (`0.1` → `0.2`), Datum anpassen, Grund
  der Änderung in einer Zeile im Kopf.
- **Verworfene Entscheidungen bleiben stehen** — mit Grund. Wer sie löscht, provoziert die
  Diskussion ein zweites Mal.
- **Nach jedem Meilenstein** wird der Plan gegen den Ist-Zustand abgeglichen: Was ist fertig,
  was rutscht, welche Annahme war falsch. Ergebnis ist eine neue Fassung des Plans, nicht ein
  neuer Plan.
