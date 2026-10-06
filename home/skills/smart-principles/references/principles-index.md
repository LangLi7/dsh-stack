# Prinzipien-Katalog A–Z

Kurzreferenz für den Alltag. Ausführliche Dossiers (Definition, Ursprung, Anwendung je Rolle,
Beispiel, Anti-Pattern) stehen in `intellectual-principles.md`, `craft-principles.md` und
`delivery-principles.md`. Diese Datei beantwortet nur: **Wie heißt es, was heißt es, wo steht
es, wie erkenne ich den Verstoß.**

| Prinzip | Kurzformel | Herkunft / Beleg | Verstoß erkennt man an … | Dossier |
|---|---|---|---|---|
| **Acceptance Criteria** | Fertig heißt: prüfbare Bedingung erfüllt | BDD / Dan North | „passt schon" statt Kriterium | `delivery-principles.md` |
| **Boy Scout Rule** | Hinterlasse den Code sauberer, als du ihn vorgefunden hast | R. C. Martin / Pfadfinderregel | jeder Commit macht die Datei schlimmer | `craft-principles.md` |
| **Brooks's Law** | Mehr Menschen auf ein spätes Projekt machen es später | Fred Brooks, 1975 | „Wir setzen drei Leute drauf" | `delivery-principles.md` |
| **Conway's Law** | Systemstruktur folgt der Kommunikationsstruktur der Organisation | Melvin Conway, 1968 | Schnittstellen spiegeln Abteilungen | `craft-principles.md` |
| **Curse of Knowledge** | Wer es weiß, kann sich Nichtwissen nicht mehr vorstellen | Cameron 1989, Hinds 1999 | Doku, die nur Eingeweihte verstehen | `intellectual-principles.md` |
| **Definition of Done** | Gemeinsame, vorab vereinbarte Fertig-Definition | Scrum | jede Rolle versteht „fertig" anders | `delivery-principles.md` |
| **DRY** | Jede Wissenseinheit hat genau einen Ort | Hunt & Thomas, 1999 | dieselbe Regel an drei Stellen | `craft-principles.md` |
| **Falsifizierbarkeit** | Eine Aussage gilt nur, wenn sie widerlegbar ist | Karl Popper | Behauptung, die immer stimmt | `intellectual-principles.md` |
| **Gall's Law** | Komplexe Systeme, die funktionieren, entstanden aus einfachen | John Gall, 1975 | „Wir bauen gleich die Zielarchitektur" | `craft-principles.md` |
| **Goodhart's Law** | Wird ein Maß zum Ziel, taugt es nicht mehr als Maß | Charles Goodhart / Strathern | Metrik wird optimiert, Zweck nicht | `intellectual-principles.md` |
| **Hofstadter's Law** | Es dauert immer länger, als du denkst — auch wenn du das einrechnest | Douglas Hofstadter, 1979 | Schätzung ohne Puffer | `delivery-principles.md` |
| **INVEST** | Gute Arbeitspakete sind unabhängig, verhandelbar, wertvoll, schätzbar, klein, testbar | Bill Wake, 2003 | Story, die nicht testbar ist | `delivery-principles.md` |
| **KISS** | Die einfachste Lösung, die funktioniert, gewinnt | Kelly Johnson (Skunk Works) | Lösung, die erklärt werden muss | `craft-principles.md` |
| **Last Responsible Moment** | Entscheide so spät wie verantwortbar, nicht so früh wie möglich | Lean / Poppendieck | Architektur für Anforderungen, die es nicht gibt | `craft-principles.md` |
| **Least Astonishment** | Verhalte dich so, wie der Nutzer es erwartet | UI-/API-Design, 1970er | Funktion, die überrascht | `craft-principles.md` |
| **MoSCoW** | Muss / Sollte / Könnte / Nicht jetzt | Dai Clegg, Oracle, DSDM | alles ist „Must have" | `delivery-principles.md` |
| **Murphy's Law** | Was schiefgehen kann, geht schief | Edward A. Murphy Jr., 1949 | kein Fehlerpfad im Fluss | `delivery-principles.md` |
| **Occam's Razor** | Von zwei Erklärungen nimm die einfachere | William von Ockham | Ursache Nr. 5 wird zuerst geprüft | `intellectual-principles.md` |
| **Pareto-Prinzip (80/20)** | Wenige Ursachen tragen den größten Teil der Wirkung | Pareto / Juran | Aufwand ohne Wirkungsprüfung | `intellectual-principles.md` |
| **Parkinson's Law** | Arbeit dehnt sich auf die Zeit aus, die man ihr gibt | C. N. Parkinson, 1955 | Deadline ohne Zwischenmeilensteine | `delivery-principles.md` |
| **Postel's Law** | Sei streng in dem, was du sendest, tolerant in dem, was du annimmst | Jon Postel, RFC 760/793 | Parser, der jeden Müll akzeptiert | `craft-principles.md` |
| **Regel der Drei** | Erst beim dritten Vorkommen abstrahieren | Don Roberts / Martin Fowler, 1999 | Abstraktion nach dem ersten Fall | `craft-principles.md` |
| **SMART** | Ziele spezifisch, messbar, erreichbar, relevant, terminiert | George T. Doran, 1981 | Ziel ohne Zahl und ohne Datum | `smart-deep-dive.md` |
| **SOLID** | Fünf Regeln für änderbaren objektorientierten Code | R. C. Martin (+ Liskov, Meyer) | eine Änderung bricht fünf Stellen | `craft-principles.md` |
| **Separation of Concerns** | Ein Baustein, eine Zuständigkeit | Edsger Dijkstra, 1974 | Modul, das alles anfasst | `craft-principles.md` |
| **Trennung Messen / Deuten** | Erst messen, dann bewerten, sichtbar getrennt | Forschungsmethodik | Zahl und Meinung im selben Satz | `intellectual-principles.md` |
| **YAGNI** | Bau nicht, was du heute nicht brauchst | Extreme Programming / Ron Jeffries, 1998 | Code ohne Aufrufer | `craft-principles.md` |

Verwandte Nachbar-Skills: `crew-project-planning` (Artefakte und Akzeptanzkriterien),
`crew-project-blueprint` (Reihenfolge und Vorlagen), `analyse` (messen statt schätzen),
`deep-research` (Quellenarbeit).
