---
name: crew-project-research
description: "Recherchiert und belegt Projekt-Setup, sinnvolle Codebase-Struktur und eine Technical-Requirements-Liste (Sprachen, Frameworks, Bibliotheken, Tools) mit Alternativen, Versionen, Prüfschritten und Quellen."
whenToUse: "Wenn ein Projekt aufgesetzt, eine Codebasis strukturiert, ein Technologie-Stack gewählt oder eine Technical-Requirements-Liste erstellt werden soll; bei Fragen wie \"wie fange ich an\", \"welche Struktur\", \"welche Bibliothek\", \"welches Framework\", \"welche Sprache\", \"Monorepo oder nicht\", \"welche Tools\"."
metadata: { version: 1.0.0, shippedBy: "@deepseek-ai/dsh-llm-crew" }
---

# Projekt recherchieren: Setup, Struktur, Technical Requirements

Dieser Skill liefert die belegten Fakten, auf denen PRD, TRD und Implementation Plan
aufbauen. Er ist für den `planner` gedacht, Ergebnisse sind für alle Rollen lesbar.

## Grundregeln

1. **Nichts behaupten, was nicht geprüft ist.** Jede Versionsnummer, jeder Paketname und
   jeder Tool-Name wird über eine offizielle Quelle (Registry, Doku, Repository) belegt und
   mit Stand-Datum notiert.
2. **Immer eine Alternative.** Jede Empfehlung nennt mindestens eine verworfene Alternative
   und den Grund (`gewählt: … weil … / verworfen: … weil …`).
3. **Versionen pinnen oder Spannen begründen.** `latest` ist keine Empfehlung.
4. **Prüfschritt statt Vertrauen.** Zu jeder Empfehlung gehört ein Kommando, mit dem man die
   Entscheidung in einer Minute verifizieren kann.
5. **Weniger ist mehr.** Ein Stack aus fünf Teilen, den das Team versteht, schlägt zehn
   Teile, die beeindrucken. Jede Abhängigkeit kostet Wartung.

## Die drei Lieferungen

| Lieferung | Ergebnis | Spezifikation |
|---|---|---|
| Projekt-Setup | Reproduzierbare Schritte vom leeren Ordner zum laufenden Projekt | `references/project-setup.md` |
| Codebase-Struktur | Verzeichnisbaum mit Begründung, Benennung, Grenzen | `references/codebase-structure.md` |
| Technical Requirements List | Sprachen, Frameworks, Bibliotheken, Tools, Infrastruktur | `references/technical-requirements.md` |

Startkatalog bewährter Kandidaten je Kategorie: `references/candidate-catalog.md`.
Bewertungsraster für jede Wahl: `references/evaluation-criteria.md`.

## Ablauf

**Schritt 1 — Randbedingungen sammeln.** Zielplattform(en), Teamgröße und Erfahrung,
Betriebsumgebung, Budget, Zeithorizont, bestehende Systeme, Vorgaben (Sprache, Lizenz,
Datenschutz/DSGVO, Hosting). Fehlt etwas davon, wird es als offene Frage notiert.

**Schritt 2 — Vorhandenes prüfen, nicht raten.** Existiert schon Code? Dann zuerst
`package.json`, `pyproject.toml`, `go.mod`, CI-Dateien, `README`, Verzeichnisbaum lesen.
Der beste Stack für ein bestehendes Projekt ist der, der schon da ist.

**Schritt 3 — Kandidaten erheben.** Für jede Kategorie zwei bis drei Kandidaten aus
`references/candidate-catalog.md` plus, wenn nötig, aktuelle Alternativen über Websuche.
Frische und Wartungszustand prüfen: letzte Veröffentlichung, offene Issues, Bus-Faktor.

**Schritt 4 — Bewerten.** Nach `references/evaluation-criteria.md`: Reife, Ökosystem,
Lernkurve, Betriebsaufwand, Performance, Lizenz, Sicherheitslage, Ausstiegskosten.

**Schritt 5 — Entscheiden und dokumentieren.** Ergebnis ist eine Tabelle mit Kategorie,
Wahl, Version, Alternative, Begründung, Prüfkommando und Quelle. Diese Tabelle ist die
Technical-Requirements-Liste und wandert in `docs/TRD.md` (Abschnitt Technologie) und in
`docs/IMPLEMENTATION.md` (Abschnitt Setup).

**Schritt 6 — Setup reproduzierbar machen.** Kommandos in der richtigen Reihenfolge,
jeweils mit erwartetem Ergebnis und Prüfschritt. Kein "dann konfiguriert man noch …"
ohne konkreten Befehl oder Dateiinhalt. Siehe `references/project-setup.md`.

**Schritt 7 — Struktur festlegen.** Verzeichnisbaum bis zur zweiten oder dritten Ebene,
mit einem Satz je Verzeichnis, plus Regeln für Benennung, Importgrenzen und Tests.
Siehe `references/codebase-structure.md`.

## Quellen und Werkzeuge

- Offizielle Projekt-Dokumentation und Repositories der jeweiligen Technologie.
- Paket-Registries für Version, Downloadzahl und letzte Veröffentlichung.
- [microsoft/markitdown](https://github.com/microsoft/markitdown) — PDF/Office/HTML nach
  Markdown konvertieren, um fremde Anforderungsdokumente auswertbar zu machen. Externes,
  optionales Werkzeug, keine Abhängigkeit dieses Skills.
- [chenglou/pretext](https://github.com/chenglou/pretext) — Textmetriken ohne DOM; hilfreich,
  wenn Layout- oder Textmaße belegt statt geschätzt werden sollen. Ebenfalls extern und
  optional.

## Ergebnisformat

Jede Lieferung endet mit:

1. **Empfehlung** — die Entscheidung in einem Satz.
2. **Tabelle** — Kategorie, Wahl, Version, Alternative, Begründung, Prüfkommando, Quelle,
   Stand-Datum.
3. **Offene Fragen** — was noch entschieden werden muss und von wem.
4. **Risiken** — was die Wahl später teuer machen könnte.
