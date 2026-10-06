# Codebase-Struktur

**Ziel:** Ein Verzeichnisbaum, den man nach sechs Monaten noch versteht.

## Vorgehen

1. **Nach Fachlichkeit schneiden, nicht nach Technik.** `billing/`, `orders/`, `auth/`
   schlägt `models/`, `services/`, `utils/`. Ein Feature soll in einem Verzeichnis
   liegen.
2. **Grenzen sichtbar machen.** Je Verzeichnis ein Satz Zweck und die erlaubten
   Abhängigkeitsrichtungen. Verstöße prüfbar machen (Lint-Regel, Test, CI-Schritt).
3. **Tiefe begrenzen.** Zwei bis drei Ebenen reichen; tiefer heißt meist falsch geschnitten.
4. **Einstiegspunkte markieren.** Wo startet die Anwendung, wo liegt die eine Wahrheit pro
   Thema (Konfiguration, Routing, Datenzugriff).
5. **Tests daneben, nicht irgendwo.** Entweder `src/x.test.ts` neben `src/x.ts` oder
   `tests/` spiegelbildlich — eine Regel, konsequent.
6. **Dokumentation am Ort.** `README.md` je großem Verzeichnis mit Zweck und Beispielen;
   Entscheidungen als `docs/adr/NNNN-titel.md`.

## Übliche Muster (mit Wahlgrund)

| Muster | Geeignet für | Kosten |
|---|---|---|
| Ein Paket, nach Feature-Ordnern | kleine und mittlere Apps, ein Team | Grenzen nur per Konvention |
| Monorepo mit Paketen | mehrere Apps, geteilte Bibliotheken | Werkzeugaufwand, Versionierung |
| Schichten (UI / Domäne / Daten) | klare Trennung nötig, viele Mitwirkende | mehr Dateien, mehr Weiterleitung |
| Hexagonal / Ports und Adapter | austauschbare Außenwelt, Tests ohne Infrastruktur | Abstraktion muss sich lohnen |

## Ergebnisformat

- Baum bis Ebene 2–3, je Eintrag ein Satz Zweck.
- Regeln für Benennung (Dateien, Typen, Tests, Zweige).
- Abhängigkeitsregeln und wie sie geprüft werden.
- Wo neue Dateien hingehören — mit zwei Beispielen.
