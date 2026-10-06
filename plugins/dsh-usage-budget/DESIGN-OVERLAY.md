# Overlay-Design: Guthaben & Budget im DeepSeek Harness

Analyse des bestehenden Overlays und verbindliche Spezifikation für den Umbau.

Grundlage sind **schriftlich vorliegende Anforderungen des Betreibers** sowie die
Theme-Variablen des Harness (`--dsw-alias-*`). Zahlen in den Beispielen unten
stammen aus DeepSeeks eigenem Nutzungsexport (26.08.–23.09.2026), nicht aus
Schätzungen.

## 1. Befund am aktuellen Overlay

Drei Probleme, in dieser Reihenfolge ihrer Wirkung:

**1. Das Overlay steht im Weg.** Es klebt als freies Element über der Oberfläche
(`position: fixed`). In der Seitenleiste verdeckt es den „Session log"-Button und
zwingt zum Wegklicken. Ein Status-Widget darf nichts verdecken.

**2. Die Zahlen waren falsch.** Zwei Ursachen, beide behoben:
   - Die Crew-Route erschien als eigene Zeile `crew/crew-1` mit **exakt denselben
     Werten** wie `deepseek-official/deepseek-v4-flash` (515 Anfragen, 234.71M
     Tokens) — aber mit `$0.00`, weil kein Preiskatalog `crew-1` kennt. Dieselben
     Zahlen zweimal bedeutet: doppelt gezählt. Das verfälschte „Anfragen" und
     „Tokens" um rund die Hälfte und erzeugte den Warnhinweis.
   - Der Warnhinweis „42 % der Aufrufe ohne bekannten Preis" entstand aus diesen
     unbepreisbaren Hüllen, nicht aus echten Wissenslücken.

**3. Die Hierarchie geht an der Frage vorbei.** Das Overlay zeigt zuerst Summen
und dann Modelle. Gefragt ist aber: **Wie viel Budget habe ich pro API-Key, und
wie viel ist noch übrig?** Modellpreise gehören in die Übersicht, nicht ins
Overlay.

## 2. Informationshierarchie (neu)

Das Overlay beantwortet zwei Fragen in dieser Reihenfolge:

| Ebene | Frage | Wann sichtbar |
| --- | --- | --- |
| 1 | Wie viel habe ich insgesamt verbraucht, wie viel ist noch da? | immer (eingeklappt) |
| 2 | Wie verteilt sich das auf meine API-Keys? | beim Überfahren |

Modellaufschlüsselung, Verlauf und Preise wandern in die Settings-Übersicht.

## 3. Aufbau

### 3.1 Eingeklappt: die Summe

Eine kompakte Leiste, die sich in die Oberfläche einfügt statt darüber zu
schweben. Inhalt von links nach rechts:

1. **Statuspunkt** (8 px) — grün, gelb oder rot je nach Budgetlage.
2. **Verbrauch** (`$1.57`) — fett, weiße Farbe, 14 px.
3. **Budget** (`/ $10.00`) — gedämpft, 13 px, nur wenn ein Limit gesetzt ist.
4. **Rest** (`Rest $8.43`) — gedämpft, nur bei gesetztem Limit.
5. **Guthaben** (`Guthaben $5.57`) — gedämpft, nur wenn ein Anbieter es meldet.

Kein Rahmen, kein Schatten: Die Leiste sitzt auf dem Hintergrund der Leiste, in
der sie steht. Das ist der Unterschied zwischen „eingebaut" und „aufgeklebt".

### 3.2 Aufgeklappt: das Budget je API-Key

Ein Panel unter der Leiste, 340 px breit, mit derselben Anmutung wie das
bestehende Overlay:

```
Kosten & Budget                    letzte 30 Tage
─────────────────────────────────────────────────
Gesamt                            $1.57 / $10.00
Rest $8.43 · Guthaben $5.57
[████████░░░░░░░░░░░░]  16 %

NACH API-KEY
DEEPSEEK API KEY                        $1.57
Guthaben $5.57 · Rest $8.43
[███░░░░░░░░░░░░░░░░░]
OPENROUTER_API_KEY                      $0.00
kein Limit gesetzt
```

Je Key eine Zeile mit vier Angaben: **Name**, **Verbrauch** (rechtsbündig),
darunter gedämpft **Guthaben und Rest**, und ein schmaler Fortschrittsbalken,
sobald ein Limit gesetzt ist. Keys ohne Limit erscheinen mit „kein Limit
gesetzt" — sie werden nicht ausgeblendet, sonst fehlt genau der Key, der gerade
Geld kostet.

Keys ohne Verbrauch erscheinen ebenfalls, solange ein Limit gesetzt ist: Ein
Budget, das man nie sieht, kann man nicht steuern.

### 3.3 Warnungen

Nur wenn es etwas zu melden gibt, oberhalb der Summenzeile:

- Budget überschritten → roter Hinweis
- Warnschwelle erreicht → gelber Hinweis
- Kein Preiskatalog geladen → gelber Hinweis

Ein Hinweis über unbepreiste Aufrufe erscheint **nur noch dann**, wenn es
wirklich unbekannte Modelle gibt — nicht mehr durch die Crew-Hülle.

## 4. Farben und Flächen

Alle Flächen, Rahmen und Texte kommen aus den Theme-Variablen des Harness, damit
das Overlay in Dark und Light identisch konsistent bleibt:

| Rolle | Variable |
| --- | --- |
| Panel-Fläche | `--dsw-alias-bg-overlay` |
| Kacheln | `--dsw-alias-bg-layer-2` |
| Rahmen | `--dsw-alias-border-l1` / `-l2` |
| Primärtext | `--dsw-alias-label-primary` |
| Nebentext | `--dsw-alias-label-secondary` |
| Zustand gut | `--dsw-alias-state-success-primary` |
| Zustand Warnung | `#E0A33C` (amber) |
| Zustand überschritten | `#E5484D` (rot) |

Die beiden Zustandsfarben sind literal, weil das Theme dafür keinen eigenen
Alias führt; sie sind aus der Akzentfamilie abgeleitet und funktionieren auf
beiden Hintergründen.

## 5. Typografie und Maße

| Element | Größe | Gewicht | Farbe |
| --- | --- | --- | --- |
| Verbrauch (Leiste) | 14 px | 600 | primär |
| Budget/Rest/Guthaben (Leiste) | 13 px | 400 | sekundär |
| Überschrift (Panel) | 13 px | 600 | primär |
| Zeitraum | 11,5 px | 400 | sekundär |
| Kachelwert | 15 px | 600 | primär |
| Kachelbezeichnung | 10,5 px | 400 | sekundär |
| Abschnittsüberschrift | 10,5 px | 400 | sekundär, gesperrt, Großbuchstaben |
| Zeilenname / Betrag | 12,5 px | 600 | primär |
| Zeilenuntertitel | 11 px | 400 | sekundär |
| Hinweis | 11 px | 400 | Zustandsfarbe |

Maße: Panel 340 px breit, Radius 12 px, Innenabstand 14 px. Kacheln als 2×2
Raster mit 8 px Abstand, Innenabstand 9–10 px, Radius 9 px. Fortschrittsbalken
4 px hoch, Radius 999 px. Zeilen 6 px Abstand, Trennlinie 1 px in
`--dsw-alias-border-l1`.

Alle Beträge sind **rechtsbündig** auf einer gemeinsamen Achse; alle Namen
linksbündig. Zahlen mit Tabulatorziffern (`font-variant-numeric: tabular-nums`),
damit sie beim Aktualisieren nicht springen.

## 6. Position

**Nicht unten rechts, nicht frei schwebend.** Stattdessen in der Struktur der
Oberfläche:

- Das Overlay sitzt **oben rechts**, aber innerhalb einer eigenen Zeile unterhalb
  der Kopfleiste, nicht darüber.
- Bei fehlendem Platz oder schmalem Fenster klappt es auf den Statuspunkt
  zusammen.
- Der Zustand (eingeklappt/ausgeklappt) bleibt im Browser gespeichert.

Ein frei schwebendes Element über fremden Bedienelementen ist die Ursache des
„im Weg"-Problems. Ein Element in der Struktur kann es nicht mehr auslösen.

## 7. Verhalten

- Aktualisierung alle 15 Sekunden, rein lokal — das kostet nichts.
- Das Guthaben kommt vom Anbieter und wird höchstens alle 15 Minuten abgefragt
  (Anbieter melden es ohnehin mit bis zu 5 Minuten Verzögerung).
- Überfahren öffnet das Panel, Verlassen schließt es.
- Ein Klick auf den Statuspunkt klappt dauerhaft ein oder aus.

## 8. Was bewusst nicht im Overlay steht

- **Modellkosten** — gehören in die Settings-Übersicht.
- **Tagesverlauf** — braucht Breite, die ein Overlay nicht hat.
- **Tokens** — bei 470M Tokens ist die Zahl allein nicht handlungsleitend; sie
  steht in der Übersicht.
- **Preisquelle** — eine Fußzeile in der Übersicht genügt.

## 9. Offene Punkte

- **Guthaben je Key ist nur bei zwei Anbietern live abfragbar** (DeepSeek,
  OpenRouter). Für ZenMux, ZAI, Groq, Anthropic und die übrigen meldet kein
  Anbieter ein Guthaben; dort zeigt das Overlay nur Verbrauch und — falls
  gesetzt — Limit und Rest. Ein manuell gesetztes Guthaben ist möglich.
- **Budgets sind derzeit nur in den Settings pflegbar.** Direktes Bearbeiten im
  Overlay wäre der nächste Schritt.
