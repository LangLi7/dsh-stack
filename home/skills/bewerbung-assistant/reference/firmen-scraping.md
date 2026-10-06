# Firmen- & Inserate-Scraping / Speichern — Leitfaden

Ziel: **Firmenadressen, Stellen/Inserate, Kontaktpersonen und E-Mail-Adressen** aus öffentlich
zugänglichen Quellen sammeln und strukturiert speichern (für die Blindbewerbung).

## Werkzeuge

- `web_search` / `mcp__firecrawl__firecrawl_search` — Auffinden von Firmen, Inseraten, Personen.
- `mcp__firecrawl__firecrawl_scrape` (`formats: ["markdown"]`) — Inhalte einer Firmenseite/Inserat lesen.
- `mcp__firecrawl__firecrawl_map` — Unterseiten einer Firmen-Webseite entdecken (Karriere, Über uns,
  Kontakt/Impressum, Team).
- `mcp__firecrawl__firecrawl_crawl` — mehrere Seiten einer Domain in einem Lauf (Vorsicht: verbraucht
  Credits/Rate-Limit, evtl. `limit` klein halten).
- `read` / `write` / `edit` — strukturierte Speicherung (CSV/JSON).

## Was pro Firma sammeln (Felder für Zielfirmen-Liste)

```
Firma, Adresse (Strasse), PLZ_Ort, Kanton, Branche, Kontaktperson, Position, E-Mail, Telefon,
Website, Quelle, Status (neu/angeschrieben/abgelehnt/eingeladen), Datum, Notizen
```

## Schritt-für-Schritt

1. **Firmen finden.** Quelle wählen (KMU-Aargau.ch / aargau.swiss / Wikipedia-Kategorie / Branche).
   Für jede Firma: Name + Ort notieren. Suche ggf. mit `firecrawl_search` „<Firma> Aargau" bzw.
   „<Firma> [Branche]".
2. **Offizielle Website + Impressum** (Adresse, ggf. E-Mail/Telefon) scrapen.
3. **Kontaktperson suchen:** Karriere-Seite, „Über uns", „Team", LinkedIn, Inserat. Person +
   Position + E-Mail (wenn öffentlich). **Bevorzuge offizielle Kontakte** (`jobs@`, `karriere@`,
   Ausbildungsverantwortliche).
4. **Inserat/Lehrstelle prüfen:** Hat die Firma offene Stellen? Wenn ja → normal bewerben;
   wenn nein → **Spontanbewerbung** (siehe `blindbewerbung.md`).
5. **Speichern:** Zeile in `zielfirmen.example.csv` (oder JSON) eintragen. Status + Datum pflegen.
6. **Ziel gerichtet erweitern:** Pro Kriterium filtern (Branche, Region, Lehrbetrieb?), Liste
   priorisieren.

## Verantwortungsvolles Scraping (Regeln)

- **Nur öffentlich zugängliche Daten** (Impressum, Website, Verzeichnis, LinkedIn-Firmenseite) nutzen.
  Keine "gekaufte"/private Adresslisten, kein Login-Bypass, keine Captcha-Umgehung.
- **Recht zitieren:** Das Schweizer Datenschutzgesetz schützt personenbezogene Daten. Kontaktdaten
  zweckgebunden (nur Bewerbung) verwenden. Quelle:
  [Work-ID – Datenschutz](https://work-id.ch/blog/datenschutz-bei-bewerbungen-was-gilt-und-wie-wird-er-aktuell-umgesetzt/)
- **Kein Spam:** Identische Massen-Mails vermeiden; jedes Anschreiben individuell.
- **Rate-Limit beachten:** Firecrawl hat kontobasiertes req/min & Credits. Bei Limit → `web_search`
  (separates Backend) nutzen oder Scrapes ausdünnen. Zwischen Calls andere Arbeit erledigen.
- **Kontaktperson nicht erfinden.** Wenn du keine reale Person + Adresse findest, nutze eine
  generische Anrede. Nie eine E-Mail-Adresse raten, die du nicht verifiziert hast.

## CSV-Vorlage (Kopfzeile)

```csv
Firma,Adresse,PLZ_Ort,Kanton,Branche,Kontaktperson,Position,E-Mail,Telefon,Website,Quelle,Status,Datum,Notizen
```
