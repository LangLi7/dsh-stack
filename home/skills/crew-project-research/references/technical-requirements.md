# Technical Requirements List

**Ziel:** Eine belegte, vergleichbare Liste aller technischen Entscheidungen — Sprachen,
Frameworks, Bibliotheken, Werkzeuge, Infrastruktur.

## Pflichtspalten

| Kategorie | Wahl | Version | Alternative | Begründung | Prüfkommando | Quelle | Stand |
|---|---|---|---|---|---|---|---|
| Sprache | | | | | | | |
| Laufzeit | | | | | | | |
| Framework | | | | | | | |
| Datenhaltung | | | | | | | |
| Test | | | | | | | |
| Build/Paket | | | | | | | |
| Lint/Format | | | | | | | |
| CI/CD | | | | | | | |
| Beobachtbarkeit | | | | | | | |
| Infrastruktur | | | | | | | |
| Sicherheit | | | | | | | |

## Pflichtabschnitte

1. **Tabelle** wie oben, vollständig — keine Zelle leer, "keine" ist ein gültiger Eintrag.
2. **Nicht-funktionale Anforderungen** — Performance-Ziele mit Zahlen, Verfügbarkeit,
   Sicherheits- und Datenschutzvorgaben, Barrierefreiheitsstandard, Sprachversionen für
   Internationalisierung.
3. **Lizenzen** — je Abhängigkeit die Lizenz und ob sie mit dem Produkt vereinbar ist.
4. **Betrieb** — Umgebungen, Deploymentweg, Backup, Rollback, Kostenrahmen.
5. **Verworfene Optionen** — je Kategorie kurz, warum nicht.
6. **Offene Entscheidungen** — was noch fehlt, wer entscheidet, bis wann.

## Regeln

- Jede Zeile ist mit einer offiziellen Quelle belegt (Doku, Registry, Repository) und mit
  Stand-Datum versehen.
- Versionen pinnen oder die Spanne begründen; `latest` ist keine Empfehlung.
- Wartungszustand prüfen: letzte Veröffentlichung, offene kritische Fehler, Zahl der
  Betreuenden.
- Fünf gut verstandene Teile schlagen zehn beeindruckende.
