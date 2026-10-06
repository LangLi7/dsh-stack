# Handwerks-Prinzipien: Programmierung, Architektur, Schnittstellen

Zehn Prinzipien für alle, die Code schreiben, prüfen oder strukturieren. Jedes Dossier hat
sechs Felder: **Kernaussage · Ursprung · Anwendung (Programmierer / Researcher / Projektmanager)
· Beispiel · Anti-Pattern · Planner-Regel.**

---

## KISS — Keep It Simple, Stupid

**Kernaussage.** Von zwei Lösungen, die das Problem lösen, wird die einfachere gewählt. Einfach
heißt: weniger Teile, weniger Zustände, weniger Annahmen — nicht „weniger Funktionalität".

**Ursprung.** Die Zuschreibung an **Kelly Johnson** und die Lockheed Skunk Works („Keep it
simple, stupid", sinngemäß: Das Flugzeug muss von einem durchschnittlichen Mechaniker mit
einfachem Werkzeug im Feld zu reparieren sein) ist in der Softwareliteratur verbreitet, aber
nicht mit einem Primärdokument belegt — die Formel tauchte in dieser Form erst später in
Sekundärquellen auf. Der Sache nach greift KISS dasselbe Sparsamkeitsgebot wie **Occam's Razor**
(→ `intellectual-principles.md`). **Ehrliche Formulierung: verbreitete Zuschreibung, nicht
urkundlich belegt.**

**Anwendung.**
- *Programmierer:* Eine Funktion, die man in einem Satz erklären kann. Keine Konfigurierbarkeit
  für Fälle, die niemand hat. Drei Zeilen Wiederholung sind besser als eine Abstraktion, die
  man erklären muss.
- *Researcher:* Ein Versuchsaufbau, bei dem man die Störgrößen aufzählen kann. Ein Diagramm mit
  fünf Kästen statt fünfzehn.
- *Projektmanager:* Ein Plan mit klaren Abhängigkeiten; ein Ziel je Meilenstein. Ein
  Steuerungsgremium statt drei.

**Beispiel.** Ein Import braucht 12 Spalten aus einer CSV. KISS: direkt einlesen, validieren,
schreiben. Anti-KISS: Plugin-System für „beliebige Formate", Konfigurations-DSL und
Spalten-Mapping-Engine — für genau eine Datei.

**Anti-Pattern.** **Komplexität als Statussymbol.** Abstraktionsebenen, Dependency-Injection-
Container und Metaprogrammierung für ein Problem, das 200 Zeilen gebraucht hätte. Erkennungs-
merkmal: Der Autor muss die Lösung erklären, bevor sie benutzt werden kann.

**Planner-Regel.** Jede Technologie-Entscheidung in der TRD nennt die **verworfene einfachere
Alternative und den Grund der Verwerfung**. Wer den einfacheren Weg nicht nennen kann, hat ihn
nicht geprüft. (Siehe auch Skill `crew-project-research`: „Weniger ist mehr".)

---

## DRY — Don't Repeat Yourself

**Kernaussage.** „Every piece of knowledge must have a single, unambiguous, authoritative
representation within a system." Jede **Wissenseinheit** hat genau einen Ort. Nicht: jede
Codezeile darf nur einmal vorkommen.

**Ursprung.** Andrew Hunt und David Thomas, *The Pragmatic Programmer* (1999), Kapitel „The
Evils of Duplication".

**Anwendung.**
- *Programmierer:* Konstanten, Regeln, Validierung und Formatierung je einmal. Zwei Codestellen,
  die zufällig gleich aussehen, aber aus verschiedenen Gründen existieren, sind **keine**
  Duplizierung — sie werden getrennt gehalten.
- *Researcher:* Eine Definition je Begriff, eine Datenquelle je Zahl. Eine Zahl, die in drei
  Dokumenten steht, ist in zwei davon falsch.
- *Projektmanager:* Eine Quelle der Wahrheit für den Plan (das Dokument), nicht Plan im Chat
  plus Plan im Ticket plus Plan im Kopf.

**Beispiel.** Die Umsatzsteuerlogik liegt in `tax.py`. Der Report importiert sie. Korrekt: eine
Regel, ein Ort. Anti-DRY: dieselbe Formel in API, Report und Export — drei Fehlerquellen.

**Anti-Pattern.** **Vorzeitige Zentralisierung.** Aus zwei ähnlichen Blöcken wird eine Funktion
mit sechs Parametern und drei `if`-Zweigen gebaut, die niemand mehr ändern kann. Merksatz:
*Duplizierung ist billiger als die falsche Abstraktion.* Ab wann abstrahiert wird, regelt die
**Regel der Drei**.

**Planner-Regel.** Im Backend-Schema werden berechnete Felder ausdrücklich als *abgeleitet*
markiert, mit Angabe, wo die Berechnung liegt. Kein abgeleiteter Wert wird an zwei Stellen
berechnet.

---

## Regel der Drei — Rule of Three

**Kernaussage.** Erst beim **dritten** Vorkommen wird abstrahiert: Erst dann ist bekannt, was
das Gemeinsame wirklich ist.

**Ursprung.** Populär gemacht durch Martin Fowler in *Refactoring* (1999) unter Verweis auf
Don Roberts („Rule of Three" als Refactoring-Kriterium).

**Anwendung.**
- *Programmierer:* Zweimal kopieren ist erlaubt und oft richtig; beim dritten Mal wird die
  gemeinsame Form extrahiert.
- *Researcher:* Drei Arbeiten mit demselben Muster rechtfertigen eine Synthese; eine einzelne
  Beobachtung nicht.
- *Projektmanager:* Ein Vorgang, der dreimal ähnlich schiefging, wird zur Regel (Checkliste,
  Automatisierung); ein einzelner Vorfall nicht.

**Beispiel.** Drei verschiedene Formulare validieren E-Mail-Adressen unterschiedlich → die
dritte Kopie ist der Auslöser, eine gemeinsame Validierung zu bauen und die Unterschiede
explizit zu machen.

**Anti-Pattern.** **Abstraktion nach dem ersten Fall.** Interface plus zwei Implementierungen
plus Factory, weil „man weiß ja nie". Verwandt mit YAGNI.

**Planner-Regel.** Rituale und Checklisten entstehen aus Wiederholung (drittes Mal), nicht aus
Vorratsdenken. Im Implementierungsplan steht bei gemeinsamer Infrastruktur, **welche drei**
Stellen sie rechtfertigen.

---

## YAGNI — You Aren't Gonna Need It

**Kernaussage.** „Always implement things when you actually need them, never when you just
foresee that you need them." Funktionalität wird erst gebaut, wenn sie gebraucht wird.

**Ursprung.** Entstand im ersten Extreme-Programming-Projekt, geprägt von **Ron Jeffries**
(ab 1998), basierend auf einer Formulierung von Kent Beck. Belegt über Ron Jeffries' eigene
Darstellung und die XP-Literatur.

**Anwendung.**
- *Programmierer:* Keine Konfigurationsoption ohne Aufrufer. Keine Schnittstelle ohne zweiten
  Implementierer. Kein Feld ohne Anforderung. Code ohne Aufrufer ist Hypothek.
- *Researcher:* Keine Datenerhebung „für später" ohne Fragestellung. Kein Zusatzmesswert ohne
  Hypothese — er kostet Ethikantrag, Auswertung und Erklärungspflicht.
- *Projektmanager:* Kein Arbeitspaket ohne Anforderung im PRD. Jedes „nice to have" wandert
  nach MoSCoW auf *Could* oder *Won't (now)*.

**Beispiel.** Ein Suchfeld soll eine Autovervollständigung bekommen; die Anforderung `F3` fordert
nur Suche auf Knopfdruck. YAGNI: jetzt keine Vorschlags-API bauen. Wenn Vorschläge wirklich
gebraucht werden, steht die Anforderung dann im PRD.

**Anti-Pattern.** **Vorratsbau.** „Wir bauen schon mal mehrschichtige Plugin-Architektur, damit
wir später flexibel sind." Ergebnis: mehr Code, mehr Testfläche, keine Anforderung. Zweiter
Verstoß: **Spekulative Generalisierung** — eine Funktion, die „alles" kann, und deshalb für den
einen echten Fall umständlich ist.

**Planner-Regel.** Im Implementierungsplan wird jedes Arbeitspaket auf eine Anforderung
zurückgeführt (`F…`, `NFA-…`). Arbeitspakete ohne Anforderung werden **gestrichen**, nicht
„eingeplant". Ausnahmen (technische Schulden, Sicherheitslücken, Betrieb) werden als eigene
Kategorie mit Begründung geführt.

**Grenze des Prinzips.** YAGNI heißt nicht „spare am Fundament". Dinge, deren nachträgliche
Änderung unverhältnismäßig teuer ist — Datenmodell-Kern, Sicherheit, Lizenz, Schnittstellen
nach außen, Migrationen — werden bewusst vorausschauend entschieden. YAGNI gilt für
**Funktionalität**, nicht für **Tragfähigkeit**.

---

## SOLID

**Kernaussage.** Fünf Regeln, die Code änderbar halten, wenn er objektorientiert (oder
modular) wächst.

**Ursprung.** Akronym und Systematisierung: **Robert C. Martin** (ab 2000, *Design Principles
and Design Patterns*, kompiliert 2017 in *Clean Architecture*). Die einzelnen Regeln haben
eigene Urheber:
- **SRP** Single Responsibility — Martin (2003)
- **OCP** Open/Closed — **Bertrand Meyer**, *Object-Oriented Software Construction* (1988)
- **LSP** Liskov Substitution — **Barbara Liskov** (Keynote 1987), formalisiert mit Jeannette
  Wing (1994)
- **ISP** Interface Segregation — Martin, im Umfeld von Xerox-Printern (1980er/90er)
- **DIP** Dependency Inversion — Martin

**Anwendung.**
- *Programmierer:* SRP — ein Modul, ein Grund zur Änderung. OCP — erweitern durch Hinzufügen,
  nicht durch Ändern. LSP — ein Untertyp darf den Vertrag nicht verschärfen. ISP — schmale
  Schnittstellen statt einer großen. DIP — Abhängigkeit auf Abstraktionen, nicht auf Details.
- *Researcher:* SRP und ISP übertragen sich direkt auf Auswertungsskripte: ein Skript, eine
  Frage; eine Auswertung, eine Tabelle.
- *Projektmanager:* OCP und ISP sind das technische Gegenstück zu offenen vs. geschlossenen
  Arbeitspaketen: Ein Paket, das nur hinzufügt, ist risikoarm; eines, das Bestehendes ändert,
  braucht Regressionstests.

**Beispiel.** Ein `ReportExporter` erzeugt PDF **und** CSV **und** sendet E-Mail (SRP-Verstoß).
Aufgeteilt: `PdfRenderer`, `CsvRenderer`, `MailSender` plus ein Koordinator, der erweitert wird,
ohne bestehende Renderer zu ändern (OCP erfüllt).

**Anti-Pattern.** **Prinzipien-Dekoration.** Für eine 300-Zeilen-Anwendung werden fünf
Interfaces, ein DI-Container und eine Fabrikhierarchie angelegt. SOLID ist eine Antwort auf
Änderungsdruck — ohne Änderungsdruck ist es Ballast (siehe KISS, YAGNI).

**Planner-Regel.** Die TRD nennt die **Änderungsachsen** des Systems (was sich häufig ändern
wird: Preise, Formate, Regeln). Nur entlang dieser Achsen wird modularisiert. Keine
Modularisierung ohne benannte Änderungsachse.

---

## Separation of Concerns

**Kernaussage.** Ein Baustein hat genau eine Zuständigkeit; verschiedene Zuständigkeiten werden
nicht vermischt. „Concern" ist dabei weiter als eine Funktion: Datenhaltung, Darstellung,
Zeitverhalten, Fehlerbehandlung.

**Ursprung.** **Edsger W. Dijkstra**, *On the role of scientific thought* (1974): „the
separation of concerns … is the only available technique for effective ordering of one's
thoughts".

**Anwendung.**
- *Programmierer:* Datenzugriff nicht in der Darstellung; Zeit und Zufall nicht in der
  Geschäftslogik; Fehlerbehandlung nicht im Formatierer.
- *Researcher:* Erhebung, Auswertung und Deutung getrennt dokumentieren. Messwerte werden nicht
  während der Erhebung interpretiert.
- *Projektmanager:* Inhalt, Zeitplan und Budget getrennt führen — sonst verdeckt ein
  Budgetüberzug einen Terminverzug.

**Beispiel.** Ein Modul berechnet, ein Modul formatiert, ein Modul schreibt. Testbar ohne
Netzwerkzugriff, weil das Schreiben eine eigene Zuständigkeit ist.

**Anti-Pattern.** **Gott-Modul** („utils", „helpers", „core"): Alles, was nirgends hingehört,
landet dort — und wird überall importiert. Verwandt: **Schichten ohne Grenze** (Controller
greift direkt in die Datenbank).

**Planner-Regel.** Die Codebase-Struktur im Implementierungsplan benennt je Verzeichnis **eine**
Zuständigkeit in einem Satz und die **Importrichtung** (wer darf wen aufrufen). Verstöße werden
im Code-Review geprüft, nicht im Nachhinein diskutiert.

---

## Postel's Law — Robustness Principle

**Kernaussage.** „Be conservative in what you do, be liberal in what you accept from others."
Sei streng in dem, was du sendest, und tolerant in dem, was du annimmst.

**Ursprung.** **Jon Postel**, RFC 760 (1980) und RFC 793 (TCP, 1981). Heute umstritten:
Sicherheitsforschung und RFC 9413 („Maintaining Robustness in the Internet") zeigen, dass
Toleranz beim Annehmen von Eingaben Angriffsflächen schafft und Fehler verschleiert.

**Anwendung.**
- *Programmierer:* Fremde Datenquellen werden tolerant **gelesen** (fehlende optionale Felder,
  variierende Datumsformate), aber streng **validiert**, bevor sie wirken. Ausgaben strikt nach
  Spezifikation.
- *Researcher:* Eingelesene Rohdaten werden toleriert, aber jede Abweichung wird protokolliert
  („3 Zeilen ohne Datum übersprungen") und im Bericht genannt.
- *Projektmanager:* Berichte entgegennehmen, wie sie kommen; Ergebnisse standardisiert abgeben
  (Format, Frist, Umfang).

**Beispiel.** Ein CSV-Import akzeptiert `TT.MM.JJJJ` und `JJJJ-MM-TT`, protokolliert aber jedes
abweichende Format als Warnung. Die eigene API gibt ausschließlich ISO-8601 aus.

**Anti-Pattern.** **Grenzenlose Toleranz.** „Wir parsen alles irgendwie" — fehlerhafte Daten
werden stillschweigend korrigiert und Fehler damit unsichtbar. Zweiter Verstoß: Toleranz beim
**Senden** (Ausgaben ohne Vertrag, die jede Gegenstelle erraten muss).

**Planner-Regel.** Jede Schnittstelle im Backend-Schema hat ein **striktes Ausgabeformat** und
eine explizite Liste **akzeptierter Eingabevarianten mit Protokollierungspflicht**.

---

## Conway's Law

**Kernaussage.** „Any organization that designs a system … will produce a design whose structure
is a copy of the organization's communication structure."

**Ursprung.** **Melvin Conway**, *How Do Committees Invent?* (1968, Datamation). Martin Fowler
verbreitete die Formulierung; der Begriff **Inverse Conway Maneuver** (Kommunikationsstruktur
ändern, um die gewünschte Architektur zu bekommen) stammt von Jonny LeRoy und Matt Simons.

**Anwendung.**
- *Programmierer:* Modulzuschnitte, die quer zu den Teamgrenzen liegen, erzeugen Reibung: Jede
  Änderung braucht Abstimmung über zwei Teams. Zuschnitt und Teamgrenze werden gemeinsam geplant.
- *Researcher:* Fachgrenzen der Institute prägen die Abschnitte einer Publikation.
- *Projektmanager:* Rollenzuschnitt und Artefaktzuschnitt müssen zusammenpassen. Ein Dokument,
das drei Rollen gleichzeitig besitzen, wird von keiner gepflegt.

**Beispiel.** Zwei Teams („Import", „Export") bauen je eine halbe Pipeline → zwei Schnittstellen,
die ständig nachgezogen werden. Inverse Conway Maneuver: gemeinsames Team für die Pipeline,
Schnittstelle verschwindet.

**Anti-Pattern.** **Schnittstelle als Abbild des Organigramms.** `TeamARequests`, `TeamBRequests`
— technisch bedeutungslose Namen, die den Bauplan der Firma exportieren.

**Planner-Regel.** Der Implementierungsplan ordnet jedes Arbeitspaket genau **einer**
besitzenden Rolle zu. Pakete, die zwei Besitzer brauchen, werden geteilt, bis jeder Teil einen
Besitzer hat.

---

## Gall's Law

**Kernaussage.** „A complex system that works is invariably found to have evolved from a simple
system that worked. … you cannot make a complex system from scratch."

**Ursprung.** **John Gall**, *Systemantics* (1975).

**Anwendung.**
- *Programmierer:* Erst der gerade Weg, dann der zweite Fall — die Architektur wächst aus
  funktionierenden Stücken, nicht aus einem Gesamtentwurf.
- *Researcher:* Erst die kleine, kontrollierte Erhebung; das Instrument wird erweitert, nicht
  vorab vollständig entworfen.
- *Projektmanager:* Meilensteine liefern **laufende** Zwischenstände; kein Großprojekt ohne
  ersten funktionierenden Durchstich („walking skeleton").

**Beispiel.** Ein Durchstich — Datenbank, ein Endpunkt, eine Ansicht, deploybar — in Woche eins.
Danach wird ausgebaut. Anti-Gall: Sechs Monate Fundament, dann Integration mit offenem Ausgang.

**Anti-Pattern.** **Zielarchitektur zuerst.** Alle Schichten, alle Abstraktionen, alle
Umgebungen stehen, bevor eine einzige Funktion nutzbar ist.

**Planner-Regel.** Das erste Arbeitspaket jedes Projekts ist ein **lauffähiger Durchstich** mit
Nachweis („Befehl + erwartete Ausgabe"), noch vor Vollständigkeit. Siehe
`crew-project-blueprint`: Akzeptanzkriterium mit Nachweis.

---

## Last Responsible Moment

**Kernaussage.** Entscheidungen werden so spät getroffen, wie es verantwortbar ist — spät genug,
dass man das Maximum weiß, früh genug, dass man handeln kann.

**Ursprung.** Lean Software Development, **Mary und Tom Poppendieck** (*Implementing Lean
Software Development*, 2006).

**Anwendung.**
- *Programmierer:* Datenbankauswahl, Framework-Version, Caching-Strategie werden entschieden,
  wenn die entscheidenden Fakten vorliegen (Lastprofil, Datenmenge), nicht am Anfang.
- *Researcher:* Analysemethode wird nach der Datensichtung festgelegt — aber **vor** der
  Auswertung; bei präregistrierten Studien vor der Erhebung.
- *Projektmanager:* Personalentscheidungen und Lieferantenwahl spät, aber mit Blick auf die
  Vorlaufzeit. Spät heißt nicht „am Termin".

**Beispiel.** Die Wahl zwischen zwei Suchtechniken wird auf den Zeitpunkt gelegt, an dem ein
Prototyp mit echten Daten gemessen wurde — nicht in der ersten Planungsrunde.

**Anti-Pattern.** **Entscheidung aus Bequemlichkeit.** Die Entscheidung wird so lange
aufgeschoben, dass sie faktisch durch Untätigkeit fällt (Default gewinnt). Zweiter Verstoß:
**Frühe Festlegung** auf Basis von Vermutungen, die später teuer korrigiert werden muss.

**Planner-Regel.** Im Implementierungsplan wird je Entscheidung ein **spätester
Entscheidungszeitpunkt** mit dem dann verfügbaren Kenntnisstand notiert. Jede Entscheidung ohne
Zeitpunkt hat einen Besitzer und ein Datum.

---

## Least Astonishment — Prinzip der geringsten Überraschung

**Kernaussage.** Ein System verhält sich so, wie die Zielgruppe es erwartet. Überraschung ist
ein Fehler, auch wenn das Verhalten dokumentiert ist.

**Ursprung.** Übliches Designprinzip in Mensch-Maschine-Schnittstellen und API-Design ab den
1970er Jahren; im Netzstandard u. a. in RFC 1796 („Not All RFCs are Standards") als
*principle of least astonishment* benannt. Keine einzelne Urheberschaft.

**Anwendung.**
- *Programmierer:* Eine Funktion namens `getUser` verändert nichts. Löschen fragt nach —
  außer bei einem ausdrücklich als Papierkorb gestalteten Element. Fehlermeldungen sagen, was
  zu tun ist.
- *Researcher:* Eine Tabelle zeigt Einheiten im Kopf, nicht im Fließtext; Diagrammachsen sind
  beschriftet, ein Farbverlauf bedeutet überall dasselbe.
- *Projektmanager:* Ein Statusbericht ändert nicht plötzlich seine Gliederung; die gleiche Zahl
  bedeutet in allen Berichten dasselbe.

**Beispiel.** Ein Formular sendet nur bei Klick auf „Speichern" — nicht beim Verlassen eines
Feldes, auch wenn das technisch einfacher wäre.

**Anti-Pattern.** **Clevere Abkürzung.** Eine Aktion tut zwei Dinge, weil es praktisch ist
(„Löschen archiviert und benachrichtigt"). Zweiter Verstoß: **dokumentierte Überraschung** —
„steht doch in der Doku" ist keine Rechtfertigung für ein unerwartetes Verhalten.

**Planner-Regel.** Der UI/UX-Brief legt je Komponente die Erwartung fest (Was passiert bei
Klick? Was bei Fehler?) und der App-Flow nennt je Fluss den **Auslöser** — beides prüft der
`reviewer` gegen die Umsetzung.
