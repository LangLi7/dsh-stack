# App-/Project-Flow

**Zweck:** In welcher Reihenfolge passiert was — für Nutzer und für das System.
**Datei:** `docs/APPFLOW.md` · **Rolle:** `planner` schreibt, `executor` setzt um,
`reviewer` prüft die Abdeckung.

## Inhalt

Für **jeden** Fluss ein eigener Abschnitt:

1. **Name und Auslöser** — was startet den Fluss (`FL1: Anmeldung`).
2. **Beteiligte** — Nutzerrolle, Systemteile, externe Dienste.
3. **Vorbedingungen** — was muss vorher wahr sein.
4. **Schritte** — nummeriert, je Schritt: Akteur, Aktion, Ergebnis, berührte Daten.
5. **Entscheidungen** — Verzweigungen mit Bedingung und beiden Ausgängen.
6. **Fehler- und Abbruchpfade** — pro Schritt: Was passiert bei Fehler, Timeout,
   fehlender Berechtigung, Doppelklick, Verbindungsabbruch? Wie kommt man zurück?
7. **Zustände** — welche Zustände durchläuft das Objekt (z. B. Entwurf → bezahlt →
   versendet → storniert) und welche Übergänge sind erlaubt.
8. **Nachbedingungen** — was gilt nach dem Fluss.
9. **Akzeptanzkriterien** — je Fluss mindestens ein glücklicher Pfad und ein Fehlerpfad.

## Form

- Textuelle Schrittlisten als Quelle der Wahrheit; ein Mermaid-`flowchart` optional zur
  Übersicht, nie als Ersatz für die Schritte.
- Jeder Schritt referenziert die Funktion aus dem PRD (`F3`) und die Entität aus dem
  Backend-Schema (`Order`).
- Kein Fluss ohne Fehlerpfad. Ein Fluss ohne Fehlerpfad ist eine Behauptung, kein Plan.
