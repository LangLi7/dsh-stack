# Technical Requirements Document (TRD)

**Zweck:** Womit wird es gebaut, unter welchen Qualitätsanforderungen, mit welchen Risiken.
**Datei:** `docs/TRD.md` · **Rolle:** `planner` schreibt, `executor` als Realisierbarkeit,
`reviewer` prüft.

## Pflichtabschnitte

1. **Architekturüberblick** — die Bausteine und ihr Zusammenspiel, als kurzes Diagramm
   (Mermaid) plus drei Sätze Prosa. Genau ein Diagramm, nicht drei.
2. **Technologie-Entscheidungen** — je Entscheidung eine Zeile nach dem Muster:
   *Kategorie · Wahl · Version · Alternative · Begründung · Prüfkommando · Quelle*.
   Herkunft: `crew-project-research`.
3. **Datenfluss** — woher Daten kommen, wie sie transformiert werden, wo sie liegen,
   wer sie lesen darf. Ein Durchlauf von Eingabe bis Ausgabe.
4. **Schnittstellen** — interne und externe APIs, Dateiformate, Protokolle, Fehlerformat.
5. **Qualitätsanforderungen** — je Anforderung mit Zielwert:
   - Performance: Latenz (p50/p95), Durchsatz, Kaltstart
   - Zuverlässigkeit: Fehlerbudget, Wiederanlauf, Datenverlust-Toleranz
   - Sicherheit: Authentifizierung, Autorisierung, Geheimnisse, Eingabevalidierung
   - Barrierefreiheit: Zielstandard (z. B. WCAG 2.2 AA) und Prüfmittel
   - Beobachtbarkeit: Logs, Metriken, Traces, Alarmierung
   - Betrieb: Umgebungen, Deployment, Backup, Rollback
6. **Abhängigkeiten und Grenzen** — externe Dienste, Lizenzen, Rate-Limits, Kosten.
7. **Risiken** — Risiko, Eintrittswahrscheinlichkeit, Auswirkung, Gegenmaßnahme,
   Auslöser für den Plan B.
8. **Offene technische Fragen** — nummeriert, mit der Rolle, die sie klären muss.
9. **Akzeptanzkriterien** — überprüfbar, je mit dem Kommando oder Test, der sie belegt.

## Qualitätslatte

- Keine Entscheidung ohne verworfene Alternative.
- Jede Qualitätsanforderung hat eine Zahl, nicht ein Adjektiv.
- Jedes Risiko hat eine Gegenmaßnahme.
- Die Architektur passt auf eine Seite; Details stehen in den jeweiligen Dokumenten.
