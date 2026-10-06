# Prinzipien für Denken, Forschen und Messen

Neun Prinzipien für Researcher — und für alle, die Zahlen, Ursachen und Belege verwenden.
Jedes Dossier: **Kernaussage · Ursprung · Anwendung (Researcher / Programmierer /
Projektmanager) · Beispiel · Anti-Pattern · Planner-Regel.**

---

## Occam's Razor — Sparsamkeitsprinzip

**Kernaussage.** Von zwei Erklärungen mit gleicher Erklärungskraft wird die mit weniger
Annahmen gewählt. Kein Beweis, sondern eine Arbeitsregel: Prüfe die einfache Ursache zuerst.

**Ursprung.** Wilhelm von Ockham († 1347) zugeschrieben, in der heute gebräuchlichen Form
„Entitäten sollen nicht über das Notwendige hinaus vermehrt werden" — die Formulierung selbst
stammt jedoch nicht wörtlich von ihm. In der Statistik als **Parsimonie** (sparsame
Modellwahl) wirksam.

**Anwendung.**
- *Researcher:* Bevor ein komplexer Mechanismus behauptet wird, wird die triviale Erklärung
  ausgeschlossen: Messfehler, Stichprobenverzerrung, Copy-Paste im Skript, falsch zugeordnete
  Spalte.
- *Programmierer:* Ein Fehler nach einem Deployment ist zuerst ein Deployment-Problem, dann ein
  Konfigurationsproblem, dann ein Code-Problem — in dieser Reihenfolge.
- *Projektmanager:* Ein Terminrutsch hat zuerst eine Kapazitäts- oder Abhängigkeitsursache,
  nicht ein Motivationsproblem.

**Beispiel.** „Die Datenbank ist zu langsam" → zuerst: fehlender Index? Dann: falsche Abfrage?
Erst danach: Architekturwechsel.

**Anti-Pattern.** **Karriere-Ursachen.** Die spannendste Erklärung gewinnt, weil sie
publikationswürdig ist. Zweiter Verstoß: **Diagnose per Architektur** — ein Umbau wird
beschlossen, ohne die einfache Ursache geprüft zu haben.

**Planner-Regel.** In TRD und Backend-Schema wird jede Leistungs- oder Fehleraussage an einen
**Messwert** gebunden („gemessen mit …", „gemessen am …"). Vor jeder strukturellen Änderung
steht ein Messwert.

---

## Falsifizierbarkeit

**Kernaussage.** Eine Aussage ist wissenschaftlich nur dann brauchbar, wenn es einen möglichen
Befund gibt, der sie widerlegen würde. Was immer stimmt, sagt nichts.

**Ursprung.** **Karl Popper** (Logik der Forschung, 1934): Abgrenzungskriterium gegenüber
nicht-widerlegbaren Aussagen.

**Anwendung.**
- *Researcher:* Jede Hypothese wird mit dem Befund formuliert, der sie verwerfen würde
  („Wenn X zutrifft, muss Y beobachtbar sein; wird Y nicht beobachtet, gilt X als widerlegt").
  Bei quantitativen Studien vorab: Auswertungsplan, Stichprobenumfang, Ausschlusskriterien
  (Präregistrierung).
- *Programmierer:* Eine Fehlerhypothese wird als **Test** formuliert, der rot ist, bevor der Fix
  kommt. Ein Fix ohne vorher fehlschlagenden Test ist eine Behauptung.
- *Projektmanager:* Ein Erfolgskriterium muss scheitern können. „Zufriedenheit steigern" ist
  nicht falsifizierbar; „Abbruchquote im Checkout < 20 % zum 30.06." ist es.

**Beispiel.** Hypothese: „Nutzer brechen ab, weil die Registrierung zu lang ist." Widerlegend:
Wird bei verkürzter Registrierung (A/B) die Abbruchquote nicht besser, ist die Hypothese
verworfen — nicht „teilweise bestätigt".

**Anti-Pattern.** **Unwiderlegbare Formulierung.** Aussagen mit „kann", „tendenziell",
„im Wesentlichen" — jeder Ausgang bestätigt sie. Zweiter Verstoß: **Hypothese nach Datensicht**,
also eine Erklärung, die genau auf die gefundenen Zahlen zugeschnitten ist (Overfitting).

**Planner-Regel.** Akzeptanzkriterien werden so geschrieben, dass sie **auch fehlschlagen
können** — mit Schwellenwert, Messweise und Zeitpunkt. Siehe Skill `crew-project-blueprint`,
Fertig-Bedingung 6.

---

## Trennung von Messen und Deuten

**Kernaussage.** Erst messen, dann bewerten — und beides im Bericht sichtbar trennen.

**Ursprung.** Grundregel empirischer Methodik; im Projektkontext als Forderung nach
nachvollziehbarer Trennung von Befund und Interpretation (vgl. FINER-Kriterien, die
Machbarkeit und Messbarkeit ausdrücklich verlangen).

**Anwendung.**
- *Researcher:* Abschnitt „Ergebnisse" ohne Interpretation, Abschnitt „Diskussion" mit
  Interpretation. Jede Zahl nennt Quelle, Zeitraum und Ausschlüsse.
- *Programmierer:* Benchmarks werden mit Umgebung, Datenmenge und Messverfahren genannt;
  „fühlt sich schneller an" steht nicht im Pull Request.
- *Projektmanager:* Ist-Zustand (gemessen) und Prognose (abgeleitet) stehen getrennt; jede
  Prognose nennt ihre Grundlage.

**Beispiel.** „Die Suche antwortet im Median in 210 ms (n = 1 000, lokale Datenbank, kalt)"
— danach: „Das reicht für NFA-2 (< 300 ms) nicht mit Sicherheit, weil p95 bei 640 ms liegt."

**Anti-Pattern.** **Meinung als Messung.** „Der Import ist langsam" ohne Zahl. Zweiter Verstoß:
**Zahl als Meinung** — eine vorhandene Zahl wird zur Stützung einer Aussage benutzt, für die sie
nicht erhoben wurde.

**Planner-Regel.** Das Analyse-Skill (`analyse`) liefert Messwerte; die Deutung schreibt der
`planner` oder `reviewer` **getrennt** darunter. Im Bericht: „gemessen" vs. „abgeleitet".

---

## Goodhart's Law

**Kernaussage.** „When a measure becomes a target, it ceases to be a good measure." Wird eine
Kennzahl zum Ziel, wird sie optimiert — nicht der Zweck, den sie abbilden sollte.

**Ursprung.** Ursprünglich von **Charles Goodhart** zur Geldpolitik formuliert; die heute
gebrauchte Fassung stammt von **Marilyn Strathern** (1997). In der Analysepraxis ausführlich
behandelt (u. a. CNA, 2022).

**Anwendung.**
- *Researcher:* Publikationszahl, Zitationszahl und p-Wert sind Maße, die als Ziel ihre
  Aussagekraft verlieren (p-Hacking, Salami-Publikationen). Gegenmittel: Präregistrierung,
  offene Daten, mehrere unabhängige Maße.
- *Programmierer:* „Testabdeckung 90 %" als Ziel erzeugt Tests ohne Zusicherungen.
  „Anzahl geschlossener Tickets" erzeugt kleinteilige Tickets. Gegenmittel: Entscheidungs-
  relevante Maße (Fehlerrate nach Release, Wiedereröffnungsquote, Time-to-Restore).
- *Projektmanager:* „Velocity" als Ziel erzeugt Aufblähung der Schätzungen. Gegenmittel:
  Velocity als Beobachtung, Lieferumfang als Maß, Qualitätsmaße daneben.

**Beispiel.** Ziel „Bearbeitungszeit senken". Gemessen wird die Zeit vom Öffnen bis zum
Schließen — also werden Tickets früher geschlossen und später wieder geöffnet. Der Zweck (weniger
offene Fälle) wurde nicht erreicht.

**Anti-Pattern.** **Doppelnutzung von Kennzahlen** — dieselbe Zahl dient als Steuerungsziel und
als Qualitätsnachweis. Wer steuert, muss getrennt messen (Vier-Augen-Prinzip, unabhängige
Stichprobe).

**Planner-Regel.** Erfolgskriterien im PRD nennen **mindestens zwei** Kennzahlen, davon eine,
die nicht direkt steuerbar ist. Jede Kennzahl bekommt eine Gegenkennzahl („Suchzeit sinkt —
ohne Zunahme von Fehltreffern").

---

## Curse of Knowledge — Fluch des Wissens

**Kernaussage.** Wer etwas weiß, kann sich den Zustand des Nichtwissens kaum noch vorstellen und
erklärt deshalb zu kurz, zu schnell und zu voraussetzungsreich.

**Ursprung.** Empirisch untersucht von **Cameron** (1989, „The curse of expertise" — Experten
überschätzen, wie gut Laien sie verstehen) und **Hinds** (1999). Der Begriff wurde außerhalb der
Forschung populär (u. a. Heath & Heath, *Made to Stick*, 2007).

**Anwendung.**
- *Researcher:* Methodenteil so schreiben, dass jemand ohne Vorwissen es nachvollziehen kann:
  Welche Größe, welche Einheit, welcher Ausschluss, welches Werkzeug. Abkürzungen beim ersten
  Vorkommen erklären.
- *Programmierer:* Fehlermeldungen und Dokumentation richten sich an den Nutzer, nicht an den
  Autor: Was ist passiert, was kann man tun, welche Angabe hilft weiter.
- *Projektmanager:* Statusberichte erklären Fachbegriffe und nennen die Bedeutung, nicht nur die
  Zahl. Onboarding-Unterlagen werden von jemandem geprüft, der neu ist.

**Beispiel.** „Der Worker ist im Backoff" → für den Nutzer: „Die Verarbeitung wurde nach einem
Fehler angehalten und startet automatisch in 5 Minuten neu. Falls das wiederholt passiert: Datei
X prüfen."

**Anti-Pattern.** **Abkürzungs-Dichte.** Ein Dokument, das ohne Glossar nicht lesbar ist.
Zweiter Verstoß: **Doku als Gedächtnisstütze des Autors** — sie beantwortet die Frage, die der
Autor hatte, nicht die, die der Nutzer hat.

**Planner-Regel.** In Skill `crew-project-blueprint` prüft der `reviewer` jedes Dokument auf
Verständlichkeit für eine Rolle **ohne Vorwissen**. Der UI/UX-Brief regelt Fehlertexte und
Mikrotexte ausdrücklich.

---

## Pareto-Prinzip — die 80/20-Regel

**Kernaussage.** Ein kleiner Teil der Ursachen trägt den größten Teil der Wirkung. Die konkrete
Zahl 80/20 ist eine Beobachtung, kein Naturgesetz — der Kern ist die **ungleiche Verteilung**.

**Ursprung.** **Vilfredo Pareto** (Bodennutzung in Italien, um 1896); als Managementregel
popularisiert von **Joseph M. Juran** („vital few and trivial many", ab 1941).

**Anwendung.**
- *Researcher:* Wenige Quellen tragen den Großteil der Belege; wenige Ausreißer erzeugen den
  Großteil der Varianz. Beides wird ausdrücklich geprüft, statt alle Daten gleich zu behandeln.
- *Programmierer:* Wenige Codepfade erzeugen die meisten Fehler; wenige Abfragen die meiste
  Last. Optimiert wird der gemessene Schwerpunkt (Profiler statt Bauchgefühl).
- *Projektmanager:* Wenige Arbeitspakete tragen den Großteil des Risikos. Diese bekommen die
  erfahrenste Besetzung und die genaueste Prüfung.

**Beispiel.** Fehlerprotokoll auswerten: 4 von 18 Fehlerarten erzeugen 82 % der Vorfälle → diese
vier werden zuerst behoben, der Rest dokumentiert.

**Anti-Pattern.** **Alles-gleich-Behandlung.** Jede Anforderung bekommt dieselbe Sorgfalt, jedes
Ticket dieselbe Priorität. Zweiter Verstoß: **80/20 als Ausrede** — der schwierige Rest wird
„unwichtig" genannt und nie erledigt.

**Planner-Regel.** Der Implementierungsplan markiert ausdrücklich die **risikotragenden**
Arbeitspakete („kritisch") und begründet, was sie kritisch macht. Diese erhalten eigene
Akzeptanzkriterien und einen früheren Zeitpunkt.

---

## Sunk Cost — versunkene Kosten

**Kernaussage.** Bereits aufgewendeter Aufwand darf eine Entscheidung über die Zukunft nicht
beeinflussen. Entscheidend ist nur: Was kostet der nächste Schritt, und was bringt er?

**Ursprung.** Ökonomische Entscheidungstheorie (versunkene Kosten sind irreversibel und damit
entscheidungsirrelevant); als Verhaltensphänomen beschrieben u. a. von **Arkes & Blumer** (1985,
„The psychology of sunk cost").

**Anwendung.**
- *Researcher:* Ein Datensatz, der drei Monate gekostet hat, aber die Frage nicht beantwortet,
  wird nicht „irgendwie" ausgewertet. Er wird berichtet und beiseitegelegt.
- *Programmierer:* Eine Bibliothek, in die zwei Wochen flossen, wird ersetzt, wenn sie die
  Anforderung nicht erfüllt. Die zwei Wochen sind vorbei — die Wartungskosten kommen noch.
- *Projektmanager:* Ein Meilenstein, der nicht liefert, wird **abgebrochen**, nicht verlängert,
  wenn die Restkosten den Restnutzen übersteigen (Scheitern ist ein legitimes Ergebnis).

**Beispiel.** Ein Prototyp läuft nicht stabil. Entscheidung: Abbrechen und mit dem zweiten
Ansatz neu anfangen — mit dem Hinweis, was aus dem Prototyp übernommen wird.

**Anti-Pattern.** **Ausbauen statt prüfen.** „Jetzt haben wir schon so viel investiert." Zweiter
Verstoß: **Abbruch ohne Lernertrag** — der abgebrochene Weg wird gelöscht, statt mit Grund
dokumentiert zu werden.

**Planner-Regel.** TRD und Implementierungsplan nennen je Risiko einen **Auslöser für Plan B**
und eine Abbruchbedingung. „Weitermachen" ist keine Option, die begründet werden kann.

---

## Hanlon's Razor

**Kernaussage.** Schreib nicht Bosheit zu, was sich ausreichend durch Nachlässigkeit, Unwissen
oder Zeitdruck erklären lässt.

**Ursprung.** Klassische Aphorismen seit dem 18. Jahrhundert; die heute zitierte Form wird
**Robert J. Hanlon** (1980) zugeschrieben. Genuin ein Heuristik-Spruch, keine Theorie.

**Anwendung.**
- *Researcher:* Ein abweichendes Ergebnis ist zuerst ein Methoden- oder Übertragungsfehler, dann
  ein Effekt. Das schützt vor voreiligen „Überraschungsbefunden".
- *Programmierer:* Ein fehlendes Feld in fremden Daten ist meist Nachlässigkeit, nicht Absicht →
  robust lesen, protokollieren, nachfragen.
- *Projektmanager:* Ein verspätetes Arbeitspaket ist zuerst eine Kapazitäts-, Abhängigkeits- oder
  Kommunikationsursache. Schuldzuweisung ist keine Diagnose.

**Beispiel.** Ein externer Dienst liefert sporadisch leere Felder. Reaktion: Protokollierung und
eine Anfrage beim Anbieter — nicht sofort eine Vertragsdiskussion.

**Anti-Pattern.** **Motivunterstellung.** Fehler werden zu Charakterfragen. Zweiter Verstoß:
**Naivität als Prinzip** — wiederholte, gleichartige Schäden werden weiter als Zufall behandelt.

**Planner-Regel.** In der Risikoliste der TRD steht zu jedem Risiko eine **Ursachenhypothese**
und ein Prüfschritt — keine Bewertung von Personen. Übergaben sind sachlich und enthalten die
Information, die die nächste Rolle braucht.

---

## Nicht schaden — Prüfe die Nebenwirkung

**Kernaussage.** Jede Änderung an einem laufenden System hat Nebenwirkungen. Sie werden vor der
Änderung benannt, nicht nach der Havarie entdeckt.

**Ursprung.** In der Medizin als *primum non nocere* überliefert (Hippokrates zugeschrieben,
in dieser Formulierung nicht wörtlich belegt); im Ingenieurwesen als Regel, dass Eingriffe an
laufenden Systemen reversibel oder beobachtbar sein müssen.

**Anwendung.**
- *Researcher:* Eine Erhebung verändert das Beobachtete (Hawthorne-Effekt, Fragebogen-
  Formulierung). Nebenwirkungen gehören in den Methodenteil.
- *Programmierer:* Migrationen, Caches, Retries und Hintergrundjobs haben Nebenwirkungen
  (Datenverlust, Lastspitzen, Doppelausführung). Jede wird benannt, jede ist rückrollbar.
- *Projektmanager:* Eine Priorisierung ändert Zusagen an andere. Betroffene werden vorher
  informiert, nicht nachher.

**Beispiel.** Ein Cache verkürzt Antwortzeiten und verzögert die Sichtbarkeit von Änderungen.
Der UI/UX-Brief nennt deshalb: „Nach dem Speichern kann die Aktualisierung bis zu 5 Sekunden
dauern."

**Anti-Pattern.** **Unsichtbare Nebenwirkung.** Eine Änderung wird als „reine Verbesserung"
beschrieben. Zweiter Verstoß: **Irreversibler Eingriff ohne Sicherung** — eine Migration ohne
Backup, eine Änderung ohne Rollback-Weg.

**Planner-Regel.** Jede Änderung am Bestand nennt in TRD und Implementierungsplan **(a)**
Nebenwirkungen, **(b)** Rückrollweg, **(c)** Nachweis, dass er funktioniert.
