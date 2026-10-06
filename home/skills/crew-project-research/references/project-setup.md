# Projekt-Setup

**Ziel:** Vom leeren Ordner zu einem laufenden, prüfbaren Projekt — in Schritten, die eine
andere Person wiederholen kann.

## Pflichtinhalt

1. **Voraussetzungen** — Werkzeuge mit Mindestversion und Prüfkommando
   (`node --version`, `python --version`, `docker --version`).
2. **Initialisierung** — die tatsächlichen Befehle in Reihenfolge, je mit erwartetem
   Ergebnis. Kein "dann richtet man noch ein …" ohne Befehl oder Dateiinhalt.
3. **Konfigurationsdateien** — welche Datei, welcher Zweck, welche Schlüssel, welche Werte.
   Geheimnisse immer über Umgebungsvariablen plus `.env.example`.
4. **Start** — wie man das Projekt lokal startet, was "läuft" konkret bedeutet (URL, Port,
   erwartete Ausgabe).
5. **Prüfschritte** — je Schritt ein Kommando, das Erfolg belegt: Tests, Typprüfung, Lint,
   Build, Health-Endpunkt.
6. **Häufige Fehler** — Symptom → Ursache → Behebung, mindestens fünf Einträge.
7. **Aufräumen und Zurücksetzen** — wie man den Zustand reproduzierbar neu aufbaut.

## Regeln

- Lockfile committen, Versionen pinnen, Upgrades bewusst und dokumentiert.
- Erst Standardbibliothek und Plattformmittel, dann eine Abhängigkeit.
- Jede Abhängigkeit mit Zweck, Lizenz und Alternativprüfung begründen.
- Ein Skript (`scripts/setup`, `Makefile`, `justfile`) bündelt die Schritte, damit sie
  nicht nur in Prosa existieren.
