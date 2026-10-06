# Liefer-Prinzipien: Ziele, Priorisierung, Zeit, Qualität

Elf Prinzipien für Projektleitung und alle, die Arbeit zuschneiden und zusagen. Jedes Dossier:
**Kernaussage · Ursprung · Anwendung (Projektmanager / Programmierer / Researcher) · Beispiel ·
Anti-Pattern · Planner-Regel.**

---

## MoSCoW — Priorisierung

**Kernaussage.** Jede Anforderung wird genau einer von vier Klassen zugeordnet:
**M**ust have (ohne sie ist das Ergebnis unbrauchbar) · **S**hould have (wichtig, es gibt einen
Umweg) · **C**ould have (wünschenswert, erste Streichkandidatin) · **W**on't have (diesmal
ausdrücklich nicht). Die kleinen „o" sind Füllbuchstaben, damit das Wort sprechbar ist.

**Ursprung.** **Dai Clegg** bei Oracle, übernommen in **DSDM** (Dynamic Systems Development
Method). Belegt über DSDM-Handbuch und Fachliteratur.

**Anwendung.**
- *Projektmanager:* Priorisierung entlang des **Nutzwerts**, nicht entlang der Reihenfolge des
  Wunsches. Zusätzlich werden Zeitbudgets je Klasse vereinbart (gängige Praxis: ein Teil des
  Aufwands bleibt für *Could* reserviert).
- *Programmierer:* Implementierungsreihenfolge folgt der Klasse: erst *Must*, dann *Should*.
  „Must" heißt nicht „zuerst gebaut", sondern „nicht verhandelbar".
- *Researcher:* Priorisierung der Forschungsfragen: Welche Frage muss beantwortet werden, damit
  die Arbeit überhaupt etwas wert ist?

**Beispiel.** `F1 Anmeldung` = Must · `F4 Lesezeichen` = Should · `F7 Dunkelmodus` = Could ·
`F9 Mehrsprachigkeit` = Won't (now). Die Liste liegt im PRD und wird bei jeder Änderung
angepasst.

**Anti-Pattern.** **Alles ist Must.** Wenn mehr als etwa ein Drittel „Must" ist, wurde nicht
priorisiert. Zweiter Verstoß: **Won't ohne Begründung** — daraus wird beim nächsten Mal wieder
ein Wunsch.

**Planner-Regel.** Das PRD weist **jeder** Funktion eine MoSCoW-Klasse zu; das Skill
`crew-project-blueprint` verlangt die Priorität als Qualitätsbedingung. Der Implementierungsplan
enthält kein Arbeitspaket für eine *Won't*-Anforderung.

---

## INVEST — Kriterien für gute Arbeitspakete

**Kernaussage.** Ein gutes Arbeitspaket (User Story, Aufgabe, Ticket) ist **I**ndependent
(unabhängig), **N**egotiable (verhandelbar), **V**aluable (wertvoll), **E**stimable
(schätzbar), **S**mall (klein), **T**estable (testbar).

**Ursprung.** **Bill Wake**, 2003 (xp123, „Invest in Good Stories, and SMART Tasks"). Von dort
in Agile Alliance und Scrum-Literatur übernommen.

**Anwendung.**
- *Projektmanager:* Jedes Arbeitspaket im Implementierungsplan wird gegen die sechs Kriterien
  geprüft. Ein Paket, das nicht testbar ist, ist keine Aufgabe, sondern eine Absicht.
- *Programmierer:* „Klein" heißt: in einem Zug erledigbar, mit einem nachvollziehbaren Ergebnis.
  Praktische Obergrenze: ein Arbeitstag bis wenige Tage.
- *Researcher:* Auch ein Auswertungsschritt ist ein Arbeitspaket — „Tabelle 2 erzeugen" ist
  testbar, „Daten analysieren" nicht.

**Beispiel.** Nicht INVEST: „Backend fertig machen". INVEST: „`POST /orders` validiert Pflicht-
felder und antwortet mit 400 und Fehlerobjekt bei fehlendem `customerId` — Test `T-4`."

**Anti-Pattern.** **Epic als Aufgabe.** Ein Paket, das nicht in einem Zug erledigt werden kann,
bleibt ewig „in Arbeit". Zweiter Verstoß: **unabhängig um jeden Preis** — Abhängigkeiten werden
verschwiegen statt benannt; INVEST fordert *unabhängig verhandelbar*, nicht *abhängigkeitsfrei*.

**Planner-Regel.** Die To-do-Liste je Rolle (`crew_todo`) enthält nur INVEST-taugliche Pakete.
Jedes Paket nennt Rolle, Ergebnis und Nachweis. Siehe `references/role-guides.md`.

---

## Definition of Done

**Kernaussage.** „Fertig" ist vorab definiert und gilt für alle gleich: Code geschrieben, geprüft,
Tests grün, Dokumentation aktualisiert, deploybar, Kriterium erfüllt. Ohne gemeinsame Definition
bedeutet „fertig" für jede Rolle etwas anderes.

**Ursprung.** Scrum-Praxis; im Scrum Guide als Verantwortung des Development Teams beschrieben.
In DSH ergänzt um die hausinterne Regel: **jedes Ergebnis mit Nachweis** (Kommando, Test, Datei).

**Anwendung.**
- *Projektmanager:* Die Definition wird **zu Beginn** festgelegt und im Implementierungsplan
  wiederholt — nicht pro Paket neu verhandelt.
- *Programmierer:* Mindestumfang: läuft, getestet, nachvollziehbar (Commit, Nachricht), keine
  offenen Debug-Reste, Doku angepasst.
- *Researcher:* Mindestumfang: Methode dokumentiert, Zahlen mit Quelle und Zeitraum, Grenzen
  benannt, Daten abgelegt.

**Beispiel (DSH-Hausdefinition).** Ein Arbeitspaket ist fertig, wenn: (1) das Artefakt existiert
(Datei/Commit), (2) das Akzeptanzkriterium mit Nachweis erfüllt ist, (3) der `reviewer` es
geprüft hat, (4) die betroffenen Dokumente aktualisiert sind, (5) der Bericht Pfad und Nachweis
nennt.

**Anti-Pattern.** **Fertig ohne Nachweis.** „Ist erledigt" ohne Pfad, Kommando oder Testergebnis.
Zweiter Verstoß: **bewegliche Definition** — der Umfang wird nachträglich so beschnitten, dass
„fertig" passt.

**Planner-Regel.** Der Implementierungsplan enthält einen Abschnitt „Definition of Done" mit
Nachweisform je Pakettyp. Der `reviewer` prüft gegen genau diese Definition.

---

## Akzeptanzkriterien

**Kernaussage.** Ein Akzeptanzkriterium ist eine überprüfbare Aussage darüber, wann ein Ergebnis
als richtig gilt. Gute Kriterien sind **falsifizierbar** (sie können fehlschlagen), **eindeutig**
(kein Auslegungsspielraum) und **nachweisbar** (mit einem Kommando, Test oder Dokument belegbar).

**Ursprung.** Aus der Anforderungsanalyse und dem BDD (Dan North, Given-When-Then-Format); in
DSH Pflichtbestandteil jedes Blueprint-Artefakts.

**Anwendung.**
- *Projektmanager:* Kriterien werden **vor** der Umsetzung geschrieben, nicht danach.
- *Programmierer:* Kriterien werden zu Tests. Given-When-Then eignet sich direkt als Testname.
- *Researcher:* Kriterien für Datenqualität („keine Zeile ohne Zeitstempel; Abweichungen
  protokolliert") gehören in den Auswertungsplan.

**Beispiel.** `AK3: Bei leerer Ergebnismenge zeigt die Liste den Text „Keine Treffer" und keine
leere Fläche. Nachweis: Screenshot + Test T-7.`

**Anti-Pattern.** **Gefühls-Kriterium.** „Die Seite wirkt aufgeräumt." Zweiter Verstoß:
**Kriterium ohne Nachweis** — niemand kann sagen, ob es erfüllt ist.

**Planner-Regel.** Jedes der sechs Blueprint-Artefakte endet mit Akzeptanzkriterien (siehe
`crew-project-blueprint`, Fertig-Bedingung 6). Der `reviewer` prüft als Erstes die ID-Kette
PRD → Plan → Test.

---

## Murphy's Law

**Kernaussage.** „Anything that can go wrong will go wrong." Als Planungsregel: Was schiefgehen
**kann**, wird vorher bedacht — nicht aus Pessimismus, sondern weil Fehlerpfade billiger zu
entwerfen als zu erleben sind.

**Ursprung.** Zugeschrieben **Edward A. Murphy Jr.** (1949, Raketenschlitten-Versuch der US
Air Force); die Formulierung ist älter und vielfach unabhängig entstanden.

**Anwendung.**
- *Projektmanager:* Jeder Fluss hat Fehler- und Abbruchpfade; jedes Risiko hat eine
  Gegenmaßnahme und einen Auslöser für Plan B.
- *Programmierer:* Netzwerk, Zeit, Speicher und Nebenläufigkeit sind Fehlerquellen erster
  Ordnung: Timeouts, Wiederholungen, Idempotenz, Teilerfolge.
- *Researcher:* Geräteausfall, Probandenausfall, Datenverlust. Vor der Erhebung wird geklärt,
  was passiert, wenn 20 % der Daten fehlen.

**Beispiel.** Ein Upload bricht bei 90 % ab. Der Fluss beschreibt: Wiederaufnahme, Teildatei
verwerfen, Nutzer informieren, Protokolleintrag.

**Anti-Pattern.** **Nur der glückliche Pfad.** Der Fluss endet mit „Daten werden gespeichert".
Zweiter Verstoß: **Fehlerbehandlung als Nacharbeit** — sie wird nach dem ersten Vorfall
improvisiert.

**Planner-Regel.** Kein Fluss ohne Fehlerpfad, kein Risiko ohne Gegenmaßnahme (Skill
`crew-project-blueprint`, Qualitätslatte).

---

## Parkinson's Law

**Kernaussage.** „Work expands so as to fill the time available for its completion." Arbeit dehnt
sich auf die Zeit aus, die man ihr gibt. Als Planungsregel: großzügige Zeiträume erzeugen keine
bessere Arbeit, sondern mehr Arbeit am selben Ergebnis.

**Ursprung.** **Cyril Northcote Parkinson**, Essay im *The Economist* (1955), später in
*Parkinson's Law* (1957).

**Anwendung.**
- *Projektmanager:* Kurze Zeiträume mit klarem Ergebnis und Zwischenprüfung statt langer
  Zeiträume ohne Rückmeldung. Meilensteine liefern etwas **Lauffähiges**, nicht einen Bericht.
- *Programmierer:* Zeitboxen für Aufgaben: Was nicht in der Zeit fertig wird, wird bewusst
  beschnitten oder geteilt — nicht stillschweigend verlängert.
- *Researcher:* Schreibzeitboxen; ein Abschnitt pro Sitzung, mit definiertem Ergebnis.

**Beispiel.** Statt „Umbau der Suche, vier Wochen" → „Woche 1: Suchindex mit echter Datenmenge
messbar; Woche 2: Fehltrefferquote unter X". Nach jeder Woche gibt es einen Nachweis.

**Anti-Pattern.** **Offenes Ende.** Aufgaben ohne Zeitbezug werden nie fertig. Zweiter Verstoß:
**Zeitdruck als Methode** — dauerhaft unrealistische Zeiträume erzeugen Pfusch und
Überstundenkultur.

**Planner-Regel.** Jedes Arbeitspaket im Implementierungsplan hat eine Zeitbox oder einen
Meilensteinbezug. Siehe Skill `smart-principles`, SMART-Kriterium *T* (terminiert).

---

## Hofstadter's Law

**Kernaussage.** „It always takes longer than you expect, even when you take into account
Hofstadter's Law." Schätzungen sind systematisch zu optimistisch — auch die korrigierten.

**Ursprung.** **Douglas Hofstadter**, *Gödel, Escher, Bach* (1979).

**Anwendung.**
- *Projektmanager:* Schätzungen werden als **Spanne** geführt (bester / wahrscheinlicher /
  schlechtester Fall) und gegen den tatsächlichen Aufwand nachgeführt, damit die eigene
  Optimismusneigung messbar wird.
- *Programmierer:* Unbekannte Technik, unbekannte Fremdsysteme und „nur noch aufräumen" werden
  ausdrücklich mit Zuschlag geschätzt.
- *Researcher:* Erhebung, Ethikfreigabe und Auswertung laufen selten parallel; Wartezeiten
  gehören in den Zeitplan.

**Beispiel.** „Zwei Tage" werden zu „2–4 Tage, wahrscheinlich 3; Risiko: Fremd-API nicht
dokumentiert". Nach dem Paket steht der Ist-Aufwand daneben — daraus wächst ein belastbarer
Faktor für die nächste Schätzung.

**Anti-Pattern.** **Punkt-Schätzung ohne Spanne.** Eine Zahl ohne Unsicherheit ist eine
Behauptung. Zweiter Verstoß: **Puffer verstecken** — heimliche Zuschläge machen Schätzungen
unbrauchbar, weil niemand mehr weiß, was gemeint ist.

**Planner-Regel.** Zeitschätzungen im Plan stehen als Spanne mit dem größten Unsicherheitstreiber
daneben, markiert als Schätzung („≈, ungeprüft").

---

## Brooks's Law

**Kernaussage.** „Adding manpower to a late software project makes it later." Neue Personen
kosten Einarbeitung und Kommunikation, bevor sie liefern.

**Ursprung.** **Fred Brooks**, *The Mythical Man-Month* (1975).

**Anwendung.**
- *Projektmanager:* Bei Verzug wird zuerst der **Umfang** beschnitten (MoSCoW: *Could*
  streichen), dann die Reihenfolge geändert, erst danach über Personal gesprochen.
- *Programmierer:* Parallele Arbeit an derselben Stelle erzeugt Konflikte; Zerlegung erfolgt
  entlang stabiler Grenzen.
- *Researcher:* Mehr Autoren an einem Text erhöhen die Koordinationskosten; Zuständigkeit je
  Abschnitt mit einer verantwortlichen Person.

**Beispiel.** Ein gefährdeter Meilenstein: zwei *Could*-Funktionen wandern auf *Won't (now)*,
die Zeit fließt in die *Must*-Funktionen. Kein zusätzliches Teammitglied.

**Anti-Pattern.** **Personal als Antwort auf Verzug.** Zweiter Verstoß: **stille Parallelarbeit**
— zwei Rollen ändern dieselbe Datei, ohne dass eine Absprache sichtbar ist.

**Planner-Regel.** Bei Verzug enthält der überarbeitete Plan **explizit**, was gestrichen wurde.
Jedes Paket hat genau eine besitzende Rolle (siehe Conway's Law in
`craft-principles.md`).

---

## Boy Scout Rule

**Kernaussage.** Hinterlasse den Ort sauberer, als du ihn vorgefunden hast. Kleine, stetige
Verbesserung am Rand der eigenen Arbeit — kein Aufräumprojekt.

**Ursprung.** Pfadfinderregel; als Programmierregel popularisiert durch **Robert C. Martin**
(*Clean Code*, 2008). Die Zuschreibung an die Pfadfinderbewegung ist eine Analogie, keine
Quellenangabe für Code.

**Anwendung.**
- *Programmierer:* Beim Ändern einer Datei wird ein Namen, eine irreführende Variable oder eine
  fehlende Prüfung im Umfeld mitkorrigiert — solange es den Änderungsumfang nicht sprengt.
- *Researcher:* Beim Ergänzen einer Tabelle wird die Einheit im Kopf nachgetragen, die fehlte.
- *Projektmanager:* Bei jeder Planüberarbeitung wird ein veralteter Verweis korrigiert.

**Beispiel.** Ein Bugfix in einer Funktion: dabei wird der kopierte `tmp2`-Name zu
`normalizedEmail` und die stille Ausnahme bekommt einen Kommentar. Kein Umbau der Datei.

**Anti-Pattern.** **Aufräum-Kriechen.** Aus einem Bugfix wird ein Refactoring des halben Moduls —
der Review wird unmöglich. Zweiter Verstoß: **Regel als Ausrede** für ungefragte Umbauten.

**Planner-Regel.** Aufräumarbeit am Rand ist erlaubt und wird **nicht** als eigenes Arbeitspaket
geführt; große Aufräumarbeiten brauchen ein Paket mit Anforderungsbezug (sonst YAGNI-Verstoß).

---

## Retrospektive Regel — aus Wiederholung lernen

**Kernaussage.** Nach jedem Meilenstein wird geprüft, was gemessen wurde, was abwich und was
daraus folgt. Ohne Rückblick wiederholt sich derselbe Fehler.

**Ursprung.** Scrum-Retrospektive (Scrum Guide); die operative Fassung in DSH: Nachkalkulation
statt Bauchgefühl.

**Anwendung.**
- *Projektmanager:* Vier Fragen: Was war geplant? Was ist gemessen passiert? Welche Annahme war
  falsch? Was ändert sich konkret am Plan?
- *Programmierer:* Nach jedem Fehler mit Auswirkung auf Nutzer: Ursache, Auslöser, Gegenmaßnahme
  (Test, Wächter, Prozess) — und ob die Gegenmaßnahme messbar greift.
- *Researcher:* Nach jeder Erhebungsrunde: Datenqualität, Ausschöpfung, Störgrößen.

**Beispiel.** Ein Paket dauerte 6 statt 2–4 Tage. Ursache: Fremd-API nicht dokumentiert. Folge:
Für Fremdsysteme wird künftig ein Spikes-Paket von einem Tag eingeplant.

**Anti-Pattern.** **Rückblick ohne Folge.** Es wird besprochen, aber nichts geändert. Zweiter
Verstoß: **Schuldzuweisung** statt Ursachenanalyse (siehe Hanlon's Razor in
`intellectual-principles.md`).

**Planner-Regel.** Jeder Meilenstein im Implementierungsplan hat einen Nachweis und einen
Rückblick-Termin. Ergebnis des Rückblicks ist eine **neue Fassung** des Plans, nicht ein neuer
Plan.
