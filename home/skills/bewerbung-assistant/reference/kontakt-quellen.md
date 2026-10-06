# Schweizer Kontakt- & Adress-Quellen (Firmen, Telefon, Anrede)

> Zum **Verifizieren** von Firmen-Adressen, Telefonnummern, Ansprechpersonen und ggf. E-Mail-Adressen,
> bevor man eine (Blind-)Bewerbung schreibt. Öffentlich zugänglich, kein Login für die Basissuche.

## Hauptquellen

1. **search.ch — Telefonbuch Schweiz (`tel.search.ch`)**
   - URL: `https://search.ch/tel/?was=<Firmenname>` (Parameter `was` = Suche).
   - Liefert: **Firmenname, Adresse (Strasse, PLZ/Ort), Telefonnummer, Branche**, oft Kartenlink.
   - Datenquelle: SwisscomDirectories. **2+ Mio. Einträge**, inkl. Firmen (Business/Eintrag).
   - Beispiel: `https://search.ch/tel/?was=Hitachi%20Energy` → Hitachi Energy, Fabrikstrasse 3, 5600 Lenzburg, 058 586 10 00.
   - Erweiterte Suche: `https://search.ch/tel/extended?was=<...>`.
   - Test: `https://search.ch/tel/?was=Oniko` / `?was=BKW` usw.

2. **local.ch — Telefonbuch Schweiz (mit E-Mail + Karte)**
   - URL: `https://www.local.ch/de/tel`
   - Liefert zusätzlich zu Telefon/Adresse oft **E-Mail-Adressen** und **Kartenstandort**.
   - Nützlich für Firmen, die keine eigene Website/öffentliche Mail haben.

3. **Such-URL-Muster (für den Agenten)**
   - `search.ch/tel/?was=<Firma>` → Adresse + Telefon + Branche.
   - `local.ch/de/tel?was=<Firma>` → zusätzlich E-Mail + Karte.
   - Bei Bedarf Ort mit angeben: `/tel/baden/...` (aus Suchergebnis ableitbar).

## Datenschutz & verantwortungsvoller Umgang

- Die Daten stammen aus **öffentlichen Telefonbüchern** (SwisscomDirectories) — legitime Quelle für
  Firmenkontakt. **Zweckgebunden** nur für die Bewerbung nutzen.
- **Kein Spam / kein Massenversand.** Kontaktdaten nicht weitergeben oder für Werbung verwenden.
- **Keine E-Mail-Adressen erfinden** — nur nutzen, was öffentlich belegt ist (Kap. "Anrede/Person nicht erfinden").

## Wann nutzen

- **Firmen-Adresse/Telefon** für das Dossier (Deckblatt/Anschreiben) gegenprüfen.
- **Branche** bestätigen (für den Firmenbezug / "warum diese Firma").
- **Ansprechperson/Zuständigkeit** suchen, falls auf Website/Karriere keine Person genannt ist
  (per Telefon erreichbar → höflich nach der zuständigen Person fragen).
- **Blindbewerbung:** Adresse + zuständige Personal-/Fachabteilung verifizieren, bevor man initiativ schreibt.

## Siehe auch
- `reference/firmen-recherche.md` (Abschnitt "Ansprechperson / Zuständigkeit recherchieren")
- `reference/firmen-scraping.md` (Speichern/Scrapen von Firmendaten)
