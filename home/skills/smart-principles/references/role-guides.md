# Rollen-Anleitung: Prinzipien anwenden

Wie die Prinzipien in drei Berufen konkret wirken. Jeder Abschnitt beantwortet drei Fragen:
**Woran erkennt man ein gutes Ziel? Welche Prinzipien tragen hier? Wie sieht ein Vorher-Nachher
aus?**

Die allgemeine SMART-Prüfung steht in `../SKILL.md`; die Herleitung und Kritik in
`smart-deep-dive.md`; die Dossiers in `craft-principles.md`, `intellectual-principles.md`,
`delivery-principles.md`.

---

## 1. Programmierer / Softwareentwickler

### Woran erkennt man ein gutes technisches Ziel?

1. **Es ist ein Zustand, keine Tätigkeit.** „Suchindex antwortet unter 300 ms (p95) bei 10 000
   Datensätzen" — nicht „Suche optimieren".
2. **Es hat einen Nachweis.** Ein Kommando, ein Test, eine Messung. Ohne Nachweis ist es ein
   Wunsch.
3. **Es ist falsifizierbar.** Es kann fehlschlagen, und man würde es merken.
4. **Es nennt die Grenze.** Datenmenge, Umgebung, Lastprofil, Version.
5. **Es hat einen Termin oder eine Zeitbox.**
6. **Es ist an eine Anforderung gebunden** (`F…`, `NFA-…`). Arbeit ohne Anforderung ist
   YAGNI-Verdacht.

### Tragende Prinzipien

| Situation | Prinzipien |
|---|---|
| Neue Funktionalität planen | YAGNI (erst bauen, wenn gebraucht) · MoSCoW (Priorität) · INVEST (Zuschnitt) |
| Code strukturieren | SRP, OCP, ISP, DIP · Separation of Concerns · Regel der Drei |
| Duplizierung entfernen | DRY — aber erst beim dritten Fall (Regel der Drei) |
| Fremde Daten lesen | Postel's Law — tolerant lesen, streng validieren, Abweichung protokollieren |
| Schnittstellen entwerfen | Least Astonishment · striktes Ausgabeformat · KISS |
| Leistung verbessern | Occam's Razor (einfache Ursache zuerst) · Pareto (gemessener Schwerpunkt) · Messen vor Deuten |
| Architektur planen | Gall's Law (aus Einfachem wachsen) · Last Responsible Moment · Conway's Law |
| Änderung am Bestand | Nicht schaden: Nebenwirkungen, Rückrollweg, Nachweis |
| „Fertig" definieren | Definition of Done · Akzeptanzkriterien mit Nachweis |

### Vorher → Nachher

| Schlecht | SMART/gut |
|---|---|
| „Code aufräumen und Tests schreiben" | „`payments.ts` hat für die drei Verzweigungen (Erfolg, Karte abgelehnt, Timeout) je einen Test; Abdeckung der Datei ≥ 90 %; `pnpm test payments` grün. Zeitbox: 1 Tag." |
| „Suche schneller machen" | „Suche antwortet bei 10 000 Datensätzen in < 300 ms (p95) auf dem Entwicklungsrechner; gemessen mit `npm run bench:search`. Termin: 12.05." |
| „Bessere Fehlerbehandlung" | „Jeder API-Fehler liefert `{code, message, hint}` mit stabilen `code`-Werten; Test T-4 prüft die drei häufigsten Fälle." |
| „Wir brauchen eine Plugin-Architektur" | „Offen: Welche dritte Erweiterung rechtfertigt das Plugin-System? Ohne drei belegte Fälle wird nicht abstrahiert (YAGNI, Regel der Drei)." |

### Die drei häufigsten Selbsttäuschungen

1. **„Das brauchen wir später sicher."** → YAGNI: kein Aufrufer, kein Bedarf, keine Zeile.
2. **„Nur schnell refactoren."** → Boy Scout Rule erlaubt Randarbeit, nicht Umbau im Bugfix.
3. **„Fühlt sich schneller an."** → Messen vor Deuten; ohne Zahl ist es kein Befund.

---

## 2. Researcher / Wissenschaftler

### Woran erkennt man ein gutes Forschungsziel?

1. **Es ist beantwortbar** mit den verfügbaren Mitteln (FINER: *feasible* — Zeit, Zugang,
   Ethik, Fallzahl).
2. **Es ist nicht bereits beantwortet** (*novel*) — oder es schließt eine ausdrückliche Lücke.
3. **Es ist falsifizierbar** (Popper): Der Befund, der die Hypothese verwirft, ist vorab benannt.
4. **Es ist messbar operationalisiert**: Größe, Einheit, Erhebungsinstrument, Zeitpunkt.
   Im medizinisch-klinischen Bereich über das **PICOT/PICO**-Schema (Population, Intervention,
   Comparison, Outcome, Time) — belegt in der evidenzbasierten Medizin.
5. **Es ist relevant und ethisch vertretbar** (*relevant*, *ethical*).
6. **Es ist terminiert** und gegen alternative Erklärungen abgesichert.

**FINER** (Feasible, Interesting, Novel, Ethical, Relevant) ist im klinischen Bereich als
Kriterienraster etabliert und überschneidet sich in *Feasible*, *Relevant* und *Novel* direkt mit
SMART.

### Tragende Prinzipien

| Situation | Prinzipien |
|---|---|
| Fragestellung schärfen | SMART (M, T) · FINER · PICOT |
| Hypothese formulieren | Falsifizierbarkeit · Occam's Razor (einfachste Erklärung) |
| Auswertungsplan | Präregistrierung · Messen von Deuten trennen |
| Fremde Daten einlesen | Postel's Law — tolerant lesen, Abweichungen protokollieren |
| Datenqualität | Definition of Done für Daten · Akzeptanzkriterien der Datenqualität |
| Überraschungsbefund | Hanlon's Razor (erst Methodenfehler prüfen) · Occam's Razor |
| Ergebnis berichten | Trennung Messen/Deuten · Curse of Knowledge (verständlich schreiben) |
| Publikations- und Zitationszahlen | Goodhart's Law — Maß ≠ Ziel |
| Aufwand im Projekt | Sunk Cost (nicht an toten Daten festhalten) · Hofstadter's Law |

### Vorher → Nachher

| Schlecht | SMART/gut |
|---|---|
| „Wir untersuchen, ob KI die Arbeit verbessert." | „Frage (PICOT): Bei 40 Entwicklern (P) senkt ein Code-Assistent (I) gegenüber keiner Unterstützung (C) die Zeit bis zum ersten grünen Test (O) innerhalb von 4 Wochen (T)." |
| „Die Daten zeigen einen Trend." | „Mittelwert der Bearbeitungszeit steigt von 12,1 min (n=180) auf 14,3 min (n=176); Unterschied 2,2 min, 95 %-KI [0,8; 3,6]. Deutung folgt in Abschnitt 5." |
| „Mehr Daten sammeln, könnte nützlich sein." | „Zusatzmessung nur, wenn sie Hypothese H2 prüft; H2 ist derzeit nicht formuliert → keine Erhebung." |
| „Das Projekt wird großartige Ergebnisse liefern." | „Erfolgskriterium: Nachweis, dass X unter Bedingung Y auftritt — oder belegte Widerlegung. Beides ist ein Ergebnis." |

### Die drei häufigsten Selbsttäuschungen

1. **Die Hypothese nach der Datensicht bauen.** → Präregistrierung; Trennlinie vor der Auswertung.
2. **Aus „nicht signifikant" „kein Effekt" machen.** → Nur behaupten, was der Test trägt.
3. **Nur den glücklichen Pfad planen.** → Murphy's Law: Ausfälle, Ausschöpfung, Datenverlust
   vorher durchdenken.

---

## 3. Projektmanager / Projektleiter

### Woran erkennt man ein gutes Projektziel?

1. **Es nennt Ergebnis, nicht Tätigkeit** („Checkout-Abbruchquote unter 20 %", nicht „Checkout
   verbessern").
2. **Es hat Kennzahl, Zielwert, Messweise, Zeitpunkt** — vier Felder, keine Lücken.
3. **Es hat eine Gegenkennzahl**, damit die Optimierung nicht auf Kosten einer anderen Größe geht
   (Goodhart).
4. **Es ist erreichbar mit der vorhandenen Kapazität** — und der Nachweis dieser Aussage ist eine
   Rechnung, kein Gefühl.
5. **Es ist delegierbar**: jede Rolle kann ihren Beitrag in einem Satz sagen.
6. **Es hat einen Abbruchauslöser**: Was müsste passieren, damit wir aufhören? (Sunk Cost)

### Tragende Prinzipien

| Situation | Prinzipien |
|---|---|
| Ziele setzen | SMART · MoSCoW · Akzeptanzkriterien |
| Arbeit zuschneiden | INVEST · Definition of Done · ein Besitzer je Paket (Conway) |
| Verzug | Brooks (erst Umfang schneiden) · Parkinson (Zeitboxen) · Hofstadter (Spannen) |
| Risiko | Murphy (Fehlerpfade) · Pareto (kritische Pakete) · Nicht schaden |
| Statusbericht | Trennung Messen/Deuten · Curse of Knowledge (verständlich) |
| Kennzahlen | Goodhart (Gegenkennzahl, nicht steuern und messen mit derselben Zahl) |
| Fehlschlag | Sunk Cost (abbrechen dürfen) · Hanlon (Ursachen, keine Schuldigen) |
| Wiederholung | Retrospektive Regel · Regel der Drei (Ritual erst beim dritten Mal) |

### Vorher → Nachher

| Schlecht | SMART/gut |
|---|---|
| „Wir verbessern die Performance." | „p95-Antwortzeit der Produktsuche sinkt von 640 ms auf < 300 ms bis 30.06.; Messung aus dem Lasttest `bench:search` mit 10 000 Datensätzen; Gegenkennzahl: Fehltrefferquote bleibt < 5 %." |
| „Team aufstocken, dann schaffen wir es." | „Umfang schneiden: `F7`, `F11` auf *Won't (now)*; zwei Wochen gewonnen; Personalentscheidung erst nach dem nächsten Messpunkt." |
| „Alles ist wichtig." | „MoSCoW: 5× Must, 3× Should, 4× Could, 3× Won't. Must-Anteil unter einem Drittel des Aufwands." |
| „Der Bericht zeigt Fortschritt." | „Geplant waren 8 Pakete, fertig sind 5; Paket 6 hängt an einer Fremd-API (Ursache belegt); neu terminiert auf 12.05.; Auswirkung auf Meilenstein 2: unwahrscheinlich, weil …" |

### Die drei häufigsten Selbsttäuschungen

1. **„Mehr Leute lösen das."** → Brooks: erst Umfang, dann Reihenfolge, dann Personal.
2. **„Die Schätzung passt schon."** → Hofstadter: Spanne statt Punktwert, Ist nachtragen.
3. **„Die Kennzahl beweist den Erfolg."** → Goodhart: Wer steuert, darf nicht mit derselben
   Zahl messen; immer eine zweite, unabhängige Größe.

---

## 4. Zusammenspiel: wer prüft was

| Rolle | Prüft an einem Ziel | Fragt nach |
|---|---|---|
| `planner` | Vollständigkeit (SMART, MoSCoW, Akzeptanzkriterien) | Kennzahl, Zielwert, Messweise, Zeitpunkt, Gegenkennzahl, Abbruchauslöser? |
| `executor` | Machbarkeit und Aufwand | Ist der Nachweis erbringbar? Wo ist die Unsicherheit? Was ist die einfachere Lösung? |
| `reviewer` | Nachweis und Kette | Gibt es einen Beleg? Führt jede Planzeile auf eine Anforderung zurück? Ist das Kriterium falsifizierbar? |
| `vision` | Dokumente, Bilder, Screenshots | Ist der Beleg sichtbar und lesbar? Wird der Zustand gezeigt oder behauptet? |
| `helper` | Klassifikation, Zusammenfassung, Konvertierung | Bleiben Quellen und Bezüge beim Zusammenfassen erhalten? |
