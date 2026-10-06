# Bewertungsraster für technische Entscheidungen

Jede Wahl wird gegen dieselben neun Kriterien geprüft und mit einer Note von 1 (schlecht) bis
5 (sehr gut) versehen. Die Summe ist keine Wahrheit, aber sie macht die Diskussion ehrlich.

| Kriterium | Frage | Woran man es prüft |
|---|---|---|
| Reife | Gibt es stabile Versionen und echte Nutzer in Produktion? | Release-Historie, Changelog |
| Wartung | Wer arbeitet daran, wie oft, mit welchem Bus-Faktor? | letzte Commits, Zahl der Betreuenden |
| Ökosystem | Gibt es Bibliotheken, Beispiele, Antworten? | Registry, Doku, Fragenportale |
| Lernkurve | Wie lange bis zur ersten brauchbaren Änderung? | Konzepte, die man vorher verstehen muss |
| Betriebsaufwand | Was kostet Betrieb, Update, Ausfall? | Abhängigkeiten, Konfiguration, Personal |
| Leistung | Reicht sie für das Ziel mit Reserve? | Benchmarks, eigene Messung |
| Sicherheit | Bekannte Schwachstellen, Updateweg, Angriffsfläche? | Schwachstellendatenbank, Release-Praxis |
| Lizenz und Kosten | Vereinbar mit Produkt und Budget? | Lizenztext, Preisseite, Grenzen |
| Ausstiegskosten | Wie teuer ist der Wechsel später? | Kopplung, Datenformate, Eigenheiten |

## Regeln

- Mindestens zwei Kandidaten je Kategorie, sonst ist es keine Entscheidung.
- Der Prüfschritt steht dabei: ein Kommando oder Test, der die getroffene Annahme belegt.
- Die verworfene Option wird mit Grund dokumentiert, nicht gelöscht. Später will man wissen,
  warum.
- Bei Gleichstand gewinnt die Option, die das Team schon kennt.
