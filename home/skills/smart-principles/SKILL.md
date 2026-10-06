---
name: smart-principles
description: Nachschlagewerk und Prüfverfahren für gute Ziele, Anforderungen und Entscheidungen. Belegt SMART im Detail (Doran 1981, heutige Fassung, Varianten wie SMARTER und FAST, Kritik über Goodhart's Law) und führt über 25 verwandte Prinzipien — YAGNI, KISS, DRY, Regel der Drei, SOLID, Separation of Concerns, Postel's Law, Conway's Law, Gall's Law, Occam's Razor, Falsifizierbarkeit, MoSCoW, INVEST, Definition of Done, Brooks's Law, Parkinson's Law, Hofstadter's Law und weitere — je mit Definition, Ursprung, Anwendung für Programmierer, Researcher und Projektmanager, Beispiel, Anti-Pattern und Planner-Regel.
whenToUse: Wenn Ziele, Anforderungen, Akzeptanzkriterien, Meilensteine oder Erfolgskriterien formuliert oder geprüft werden; wenn ein Ziel zu schwammig ist ("schneller", "besser", "bald"); wenn Prioritäten gesetzt (MoSCoW), Arbeitspakete zugeschnitten (INVEST) oder Aufwände geschätzt werden; wenn über Architektur, Vereinfachung, Duplizierung, Abstraktion oder Umfang gestritten wird; wenn Begriffe wie SMART, YAGNI, KISS, DRY, SOLID, MoSCoW, INVEST, Definition of Done, Goodhart, Falsifizierbarkeit, Occam, Conway oder Brooks fallen; wenn geprüft werden soll, ob eine Kennzahl als Ziel noch taugt.
metadata: { version: 1.0.0, author: crew }
---

# SMART und verwandte Prinzipien

Ein Nachschlagewerk für alle Rollen der Crew — `planner`, `executor`, `reviewer`, `vision`,
`helper` — und für die drei Berufsbilder dahinter: **Programmierer**, **Researcher**,
**Projektmanager**.

Der Zweck ist doppelt: **Ziele prüfen** (SMART) und **Entscheidungen prüfen** (die verwandten
Prinzipien). Beides läuft auf dieselbe Frage hinaus: *Woran erkennt man, dass diese Aussage
trägt — und woran, dass sie nicht trägt?*

## Aufbau

| Datei | Inhalt | Wann laden |
|---|---|---|
| `references/smart-deep-dive.md` | Doran 1981 im Original, Varianten (SMARTER, SMART-C, FAST, OKR), belegte Kritik, SMART je Beruf mit Nachbar-Rastern (ISO/IEC 25010, 29148, FINER, PICOT), Zwei-Minuten-Prüfung, Quellen | bei jeder Ziel-, Anforderungs- oder Kriterienformulierung |
| `references/principles-index.md` | Kurzkatalog A–Z: Name, Kurzformel, Herkunft, Erkennungsmerkmal des Verstoßes | zum schnellen Nachschlagen |
| `references/craft-principles.md` | KISS · DRY · Regel der Drei · YAGNI · SOLID · Separation of Concerns · Postel's Law · Conway's Law · Gall's Law · Last Responsible Moment · Least Astonishment | bei Code, Architektur, Schnittstellen, Abstraktion |
| `references/intellectual-principles.md` | Occam's Razor · Falsifizierbarkeit · Trennung Messen/Deuten · Goodhart's Law · Curse of Knowledge · Pareto · Sunk Cost · Hanlon's Razor · Nicht schaden | bei Ursachen, Messwerten, Belegen, Kennzahlen, Fehlschlägen |
| `references/delivery-principles.md` | MoSCoW · INVEST · Definition of Done · Akzeptanzkriterien · Murphy · Parkinson · Hofstadter · Brooks · Boy Scout Rule · Retrospektive | bei Priorisierung, Zuschnitt, Terminen, Zusagen |
| `references/role-guides.md` | Programmierer / Researcher / Projektmanager: Merkmale eines guten Ziels, tragende Prinzipien je Situation, Vorher-Nachher-Tabellen, typische Selbsttäuschungen | wenn für eine Rolle formuliert oder geprüft wird |

Nachbar-Skills: `crew-project-blueprint` (die sechs Artefakte, in denen diese Prinzipien
angewendet werden), `crew-project-planning`, `crew-project-research` (belegte Technikwahl),
`analyse` (messen statt schätzen).

Für die **praktische Durchsetzung** von YAGNI und KISS am konkreten Code gibt es im Katalog
eigene Skills: `ponytail` (schlägt für jede Aufgabe die kleinste tragfähige Lösung vor — YAGNI
in Reinform), `ponytail-review` (Review nur auf Over-Engineering: was kann weg, was ersetzt die
Standardbibliothek), `ponytail-audit` (ganzes Repository), `ponytail-debt` (Ledger der bewusst
eingegangenen Abkürzungen). Dieses Skill liefert die **Begründung und die Prüffragen**, die
`ponytail`-Familie die **Durchführung**.

## SMART in einem Absatz

**S**pezifisch (ein bestimmter Bereich) · **M**essbar (Zahl **oder** benannter Indikator) ·
**A** (Doran 1981: *Assignable* — wer macht es; heute meist *Achievable* — erreichbar) ·
**R**ealistisch bzw. *Relevant* (dient es dem Zweck?) · **T**ime-related bzw. *Time-bound*
(bis wann?).

Das Original stammt von **George T. Doran**, *There's a S.M.A.R.T. way to write management's
goals and objectives*, Management Review 1981. Zwei Feinheiten, die fast immer verloren gehen:
Dorans „A" war **Assignable** (Zuständigkeit), und für qualitative Ziele ließ Doran
ausdrücklich einen **Indikator** statt einer Zahl zu. Details, Belege und die Kritik:
`references/smart-deep-dive.md`.

## Die sieben Prüffragen (Kurzfassung)

Ein Ziel, eine Anforderung, ein Akzeptanzkriterium oder ein Meilenstein gilt als brauchbar,
wenn **alle** Fragen mit einem Beleg beantwortet werden können:

1. **S** — Was genau ändert sich, für wen, in welchem Bereich? *(Objekt + Zielgruppe)*
2. **M** — Woran wird es gemessen, mit welchem Wert? *(Kennzahl + Zielwert + Verfahren)*
3. **A** — Wer ist zuständig, und ist es mit den Mitteln erreichbar? *(eine Rolle + Nachweis)*
4. **R** — Dient es dem Zweck, ohne anderes zu verschlechtern? *(Bezug zur Anforderung +
   Gegenkennzahl)*
5. **T** — Bis wann, und was ist der nächste Messpunkt? *(Datum + Zwischenmessung)*
6. **Falsifizierbar?** — Was müsste passieren, damit es als **verfehlt** gilt?
7. **Abbruch?** — Was müsste passieren, damit wir aufhören? *(Auslöser für Plan B)*

**Vier Sekunden-Tests:** Zahlentest (keine Zahl/kein Indikator → nicht messbar) · Datums-Test
(kein Datum → nicht terminiert) · Negativ-Test (kann nicht scheitern → keine Zielsetzung) ·
Aufrufer-Test (keine Anforderung, auf die die Arbeit zurückführt → YAGNI-Verdacht).

## Kernprinzipien im Überblick

Elf Prinzipien, die am häufigsten gebraucht werden — die vollständige Liste mit 27 Einträgen
steht in `references/principles-index.md`.

| Prinzip | Merksatz | Verstoß erkennt man an … |
|---|---|---|
| **SMART** | Ziel ohne Zahl und Datum ist ein Wunsch | „bald besser" |
| **YAGNI** | Bau nicht, was du heute nicht brauchst | Code ohne Aufrufer |
| **KISS** | Die einfachste tragfähige Lösung gewinnt | Lösung, die erklärt werden muss |
| **DRY** | Jede Wissenseinheit genau einmal | dieselbe Regel an drei Orten |
| **Regel der Drei** | Abstrahiere erst beim dritten Fall | Abstraktion nach Fall eins |
| **SOLID** | Fünf Regeln für änderbaren Code | eine Änderung bricht fünf Stellen |
| **Separation of Concerns** | Ein Baustein, eine Zuständigkeit | „utils" / Gott-Modul |
| **MoSCoW** | Muss / Sollte / Könnte / Nicht jetzt | alles ist „Must" |
| **INVEST** | Klein, unabhängig, testbar | Paket, das nie fertig wird |
| **Definition of Done** | „Fertig" ist vorab definiert | jede Rolle meint etwas anderes |
| **Goodhart's Law** | Wird ein Maß zum Ziel, taugt es nicht mehr | Metrik steigt, Zweck nicht |

## Vier Prinzipien, die die Crew-Disziplin tragen

Diese vier haben die weiteste Wirkung im Alltag einer Crew; die zugehörigen Planner-Regeln
stehen in den Dossiers.

1. **YAGNI** — kein Arbeitspaket ohne Anforderung. Der Implementierungsplan führt jedes Paket auf
   `F…` oder `NFA-…` zurück. Streichen ist eine Entscheidung, nicht ein Versäumnis.
2. **Trennung von Messen und Deuten** — Befund und Bewertung stehen getrennt; „gemessen" und
   „abgeleitet" sind im Bericht unterscheidbar.
3. **Akzeptanzkriterien mit Nachweis** — jedes Kriterium nennt das Kommando, den Test oder die
   Datei, die es belegt. Ohne Nachweis gilt es als nicht erfüllt.
4. **Goodhart-Wächter** — jede Erfolgskennzahl bekommt eine **Gegenkennzahl**; wer steuert, misst
   nicht mit derselben Zahl.

## Anwendung im Crew-Ablauf

| Zeitpunkt | Prinzipien | Ergebnis |
|---|---|---|
| Auftrag klären | Falsifizierbarkeit, Occam, Curse of Knowledge | offene Fragen statt Annahmen |
| Anforderungen (PRD) | SMART, MoSCoW, Goodhart-Wächter | Funktionen mit Priorität, Kennzahl, Gegenkennzahl |
| Technik (TRD) | KISS, YAGNI, Last Responsible Moment, Nicht schaden | Entscheidung mit verworfener Alternative, Nebenwirkungen, Rückrollweg |
| Struktur (Backend/Code) | DRY, Regel der Drei, SOLID, Separation of Concerns, Conway | Grenzen mit einer Zuständigkeit und Importrichtung |
| Flüsse | Murphy, Least Astonishment | jeder Fluss mit Fehlerpfad und Auslöser |
| Planung | INVEST, Definition of Done, Parkinson, Hofstadter, Brooks | kleine testbare Pakete, Spannen statt Punktwerte |
| Prüfung | Akzeptanzkriterien, Messen/Deuten, Pareto | Befund mit Nachweis, kritische Pakete zuerst |
| Abschluss | Retrospektive, Sunk Cost | neue Fassung des Plans, nicht neuer Plan |

## Wo die Prinzipien sich widersprechen

Prinzipien sind Heuristiken, keine Gesetze. Wo sie kollidieren, wird **begründet entschieden**
und die Begründung aufgeschrieben:

| Spannung | Auflösung |
|---|---|
| **DRY ↔ KISS** | Bei zwei Fällen: Duplizierung behalten (Regel der Drei). Abstraktion erst, wenn die gemeinsame Form erkennbar ist. |
| **YAGNI ↔ Tragfähigkeit** | YAGNI gilt für **Funktionalität**. Was nachträglich unverhältnismäßig teuer wird — Datenmodell-Kern, Sicherheit, Schnittstellen, Migration — wird vorausschauend entschieden. |
| **KISS ↔ SOLID** | SOLID lohnt sich nur bei benannten Änderungsachsen. Ohne Änderungsdruck gewinnt KISS. |
| **Last Responsible Moment ↔ Gall's Law** | Spät entscheiden heißt nicht, ohne Fundaum zu starten: Der Durchstich kommt früh, die Weichenstellung spät. |
| **MoSCoW ↔ Fairness** | „Must" ist eine Aussage über Unbrauchbarkeit, nicht über Lautstärke des Wunsches. Wer alles auf Must setzt, hat nicht priorisiert. |
| **SMART ↔ FAST/OKR** | SMART für die **Formulierung**, FAST/OKR für den **Umgang** (Transparenz, Rhythmus, Anspruch). Kein Gegensatz. |
| **Goodhart ↔ Steuerung** | Wer eine Kennzahl steuert, braucht eine zweite, unabhängige zur Kontrolle. |

## Planner-Regeln (Kurzliste)

1. Jede Funktion im PRD hat Priorität (MoSCoW), Kennzahl und Gegenkennzahl.
2. Jede Technik-Entscheidung in der TRD nennt die **verworfene einfachere** Alternative (KISS)
   und die Nebenwirkungen samt Rückrollweg (Nicht schaden).
3. Jedes Arbeitspaket im Plan ist INVEST-tauglich, hat genau einen Besitzer (Conway) und einen
   Anforderungsbezug (YAGNI).
4. Jedes Akzeptanzkriterium ist falsifizierbar, hat einen Nachweis und steht **vor** der
   Umsetzung.
5. Zeitschätzungen stehen als Spanne mit Unsicherheitstreiber und werden als Schätzung markiert
   (Hofstadter, Parkinson).
6. Bei Verzug wird zuerst der **Umfang** geschnitten (Brooks), und was gestrichen wurde, steht
   ausdrücklich im Plan.
7. Architektur entlang **benannter Änderungsachsen** (SOLID, Separation of Concerns), Wachstum aus
   einem lauffähigen Durchstich (Gall's Law).
8. Kennzahlen werden nicht gleichzeitig gesteuert und als Nachweis verwendet (Goodhart).
9. Jeder Fluss hat einen Fehlerpfad, jedes Risiko eine Gegenmaßnahme und einen Abbruchauslöser
   (Murphy, Sunk Cost).
10. Berichte trennen **gemessen** von **abgeleitet** und nennen je Zahl Quelle und Zeitraum.

## Quellenehrlichkeit

- **Belegt mit Primär- oder belastbarer Sekundärquelle:** Doran 1981 · Sull & Sull 2018 (FAST) ·
  Goodhart/Strathern · FINER · PICOT · ISO/IEC 25010 · INVEST (Bill Wake 2003) · MoSCoW
  (Dai Clegg/DSDM) · Conway 1968 · Popper · Hunt & Thomas 1999 (DRY) · Meyer 1988 bzw. Liskov
  1987 (SOLID-Teilherkünfte) · Fowler 1999 (Regel der Drei) · Brooks 1975 · Parkinson 1955 ·
  Hofstadter 1979 · Postel (RFC 760/793, Kritik RFC 9413) · Dijkstra 1974 · Pareto/Juran.
- **Verbreitete Zuschreibung ohne Primärbeleg:** KISS → Kelly Johnson / Skunk Works ·
  Boy Scout Rule als Code-Regel → Robert C. Martin (die Pfadfinderregel selbst ist keine
  Softwarequelle) · Hanlon's Razor → Robert J. Hanlon (1980) · Least Astonishment (RFC 1796
  benennt die Formel; keine einzelne Urheberschaft) · „primum non nocere" als Hippokrates-Zitat.
- **Konvention ohne Einzelquelle:** die Umdeutung **Assignable → Achievable** und
  **Realistic → Relevant** · SMARTER · SMART-C · SMARTA.
- **Nicht im Volltext geprüft:** PMI/PMBOK, Scrum Guide, Hulley et al. — dort nur allgemeine,
  in der Literatur konsistente Aussagen, nicht als wörtliches Zitat.

Jede Angabe, die eine Zahl oder ein Zitat wäre, ist in den Dossiers mit Quelle versehen. Wo eine
Quelle fehlt, steht das ausdrücklich dabei — eine erfundene Zuschreibung ist schlimmer als eine
Lücke.
