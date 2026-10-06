# Ziele und To-dos je Crew-Rolle (Crew-Tools)

Jede Crew-Rolle hat **eigene**, dauerhaft gespeicherte Ziele und To-dos. Sie liegen in einer
JSON-Datei pro Crew (Standard: `$DSH_HOME/crew/goals/<crew-id>.json`) und überleben
Neustarts, neue Sitzungen und Kontext-Verdichtung.

## Die drei Werkzeuge

| Werkzeug | Zweck | Wer ruft es |
|---|---|---|
| `crew_plan` | Zustand aller Rollen lesen (`action: "view"`) und das *ongoing goal* einer Rolle setzen (`action: "set"`) | `planner` |
| `crew_todo` | Die **komplette** To-do-Liste einer Rolle schreiben | `planner` für alle Rollen |
| `crew_todo_status` | Einen einzelnen Eintrag hinzufügen, umstellen oder löschen | jede Rolle für sich |

Ein Aufruf mit `role` ist für den `planner` frei wählbar; jede andere Rolle darf **nur die
eigene** Liste schreiben. So kann niemand den Plan umschreiben, an dem er gemessen wird.

## Regeln für den Planner

1. **Zu Projektbeginn** für jede beteiligte Rolle ein *ongoing goal* setzen — in den Worten
   dieser Rolle:
   - `vision`: langfristig, worauf die Bild- und Dokumentanalyse zielt.
   - `executor`: das laufende Arbeitspaket, konkret und überprüfbar.
   - `reviewer`: die Prüflatte — Kriterien, Grenzwerte, Nachweise.
   - `helper`: welche Format-, Klassifizierungs- und Zusammenfassungsarbeit ansteht.
   - `planner`: der Projektstand und was als Nächstes zu zerlegen ist.
2. **To-dos** sind Arbeitspakete des Implementation Plans: eine überprüfbare Aktion, kurze
   stabile id (`AP1`, `AP2` …), Reihenfolge wie im Plan.
3. **Beim Fortschritt** `crew_todo` erneut aufrufen und nur die noch offenen Punkte senden;
   erledigte Einträge bleiben über `keep_completed` (Standard) erhalten. Bereits bekannte ids
   behalten ihren Status, ein erneuter Plan setzt also keine Arbeit zurück.
4. **Nie** Goals oder To-dos einer Rolle erfinden, die an diesem Projekt nicht beteiligt ist.

## Beispiel

```
crew_plan   { "action": "set", "role": "executor", "goal": "Implementierungsplan AP1-AP4 umsetzen: Datenmodell, API, UI, Tests" }
crew_plan   { "action": "set", "role": "reviewer", "goal": "PRD-Akzeptanzkriterien AK1-AK9 gegen die Lieferung prüfen" }
crew_todo   { "role": "executor", "todos": [
  { "id": "AP1", "text": "Backend-Schema als Migration anlegen" },
  { "id": "AP2", "text": "API-Endpunkte gemaess docs/BACKEND.md implementieren" },
  { "id": "AP3", "text": "UI nach docs/DESIGN-BRIEF.md bauen" }
] }
crew_todo_status { "id": "AP1", "status": "completed" }
```
