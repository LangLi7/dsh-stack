# Firmen-Deep-Research — so findest du echte Anknüpfungspunkte

Ziel ist nicht, die Firmen-Webseite abzuschreiben, sondern **belegbare, spezifische**
Anknüpfungspunkte zu finden, die du im Anschreiben (YOU-Teil) konkret nennst.

## Was du recherchieren sollst

1. **Was macht die Firma?** Kerngeschäft, Produkte/Dienstleistungen, Kundensegmente, Branche.
2. **Worin ist sie besonders/gut?** Spezialisierung, Marktstellung, Innovationen, Alleinstellungsmerkmale.
3. **Kultur & Werte:** Unternehmenswerte, Arbeitsweise, Team- oder Projektstruktur, Standort.
4. **Standort & Region:** Wo sitzt sie? Was bedeutet das für den Berufsalltag?
5. **Aktuelles:** News, neue Projekte, Produkte, Expansion, Auszeichnungen; Wachstum/Stabilität.
6. **Persönlicher Bezug (falls relevant):** Technologie-/Projektfelder, die du selbst schon berührt hast
   (z. B. Server-Infrastruktur, Automatisierung, elektrische Anlagen). Das ist deine Brücke.

## Recherche-Werkzeugkasten

- `web_search` + `mcp__firecrawl__firecrawl_search` zum Auffinden: „[Firma] Über uns", „[Firma] News",
  Geschäftsbericht/Medienmitteilungen.
- `mcp__firecrawl__firecrawl_scrape` (`formats: ["markdown"]` oder `jsonOptions` + Schema) für die
  Firmen-Webseite, „Über uns", Werte, Karriereseite, aktuelle Projekte.
- `mcp__firecrawl__firecrawl_map`, um relevante Unterseiten (Karriere, News, Über uns) zu entdecken.

## Checkliste — das brauchst du für den YOU-Teil

- [ ] Name + Anschrift der Firma und korrekte Anschrift für den Brief.
- [ ] **Ansprechperson** (Name/Abteilung) aus dem Inserat oder der Webseite — wichtig für die Anrede.
- [ ] 1–2 **spezifische** Gründe, die **nur diese Firma** betreffen (aus der Recherche belegbar).
- [ ] Wie **passt deine Erfahrung/Skill** zu deren Tätigkeit/Projekt? (konkreter, kein Allgemeinplatz)

## Ansprechperson / Zuständigkeit recherchieren (für Anrede & Blindbewerbung)

**Ziel:** Eine **reale, öffentlich belegte** Ansprechperson finden — für die persönliche Anrede
**und** um zu wissen, **wer zuständig ist** (Personalabteilung / Talent Acquisition / Bereichsleitung).
**Nie eine Person erfinden.** Wenn keine gefunden wird → "Sehr geehrte Damen und Herren" (richtig, kein
Fehler).

**Typische Zuständigkeiten (wer macht was bei Firmen):**
- **Personalabteilung / HR:** Einstellungen, Bewerbungsprozess → Anrede "Sehr geehrte Damen und Herren"
  oder "Liebes HR-Team" (bei gewünschtem Du). E-Mail oft `jobs@`, `karriere@`, `hr@`, `personal@`.
- **Talent Acquisition / Recruiting (grössere Firmen):** eigene Abteilung; oft über Karriere-Portal,
  Workday/HiNext/ATS. Meist **keine** öffentliche Direkt-Mail; Bewerbung läuft online.
- **Ausbildungs-/Lernendenverantwortliche (bei Lehre/Schnupper):** gezielt ansprechen; oft im
  Inserat genannt.
- **Bereichs-/Teamleitung / Geschäftsführung:** für kleinere Firmen oder Initiativbewerbung.
- **"Talent-Community / Introduce Yourself":** viele Konzerne (z. B. Hitachi Energy) bieten an, sich
  ohne konkrete Stelle zu registrieren = **Initiativbewerbung** über das Portal.

**Wie findet man sie (Reihenfolge):**
1. **Inserat/Stellenausschreibung**: Name + Funktion oft direkt genannt.
2. **Firmen-Website → Karriere:** Ansprechperson, Team, "Über uns", Abteilungen.
3. **LinkedIn:** Firma → "Mitarbeiter" filtern; Recruiter/Talent-Acquisition für die Region/Abteilung.
4. **Impressum/Absender:** ggf. Geschäftsführung/Abteilung.
5. **Telefonbuch Schweiz:** `search.ch/tel/?was=<Firma>` (Adresse + Telefon + Branche),
   `local.ch` (zusätzlich E-Mail + Karte) → `reference/kontakt-quellen.md`. Per Telefon höflich nach
   der zuständigen Person fragen.
6. **Allgemeine Kontakt-Mail** (`jobs@`, `karriere@`) als **offizieller** Weg, wenn keine Person da ist.

**Wichtig (ehrlich):**
- Manche Konzerne (Hitachi Energy u. a.) publizieren **keine** Ansprechperson → die Anrede
  "Sehr geehrte Damen und Herren" ist korrekt; man kann höflich um die zuständige Person bitten oder
  eine generische Abteilungsadresse nutzen.
- **Nicht raten:** Eine E-Mail-Adresse oder ein Name, der nicht verifiziert ist, darf **nicht**
  erfunden werden.

## Typische Fehler (negatives Beispiel)

- „Weil ihr ein grosses, erfolgreiches Unternehmen seid." (gilt für jede Firma → wertlos)
- „Weil der Arbeitsweg 10 Minuten beträgt." (kein Fachargument)
- Firmen-Werbeslogans 1:1 übernehmen. (wirkt wie Copy-Paste)
- Ansprechperson ignorieren, obwohl sie im Inserat steht. (→ sofortige Aussortierung laut Recherche)

## Ausgabeformat für dich

Halte pro Firma kurz fest (für den Anschreiben und für die Übergabe an den Nutzer):

```
Firma:         <Name>
Adresse:       <Strasse, PLZ Ort>
Ansprechperson:<Name/Abteilung>   oder "keine öffentliche Person -> Sehr geehrte Damen und Herren"
Zustaendigkeit:<Personal/HR / Talent Acquisition / Ausbildungsverantwortliche / Bereichsleitung>
Bewerbung:     <Portal / E-Mail / Initiativbewerbung; Quelle verlinkt>
Kerngeschäft:  <1-2 Sätze>
Besonderheit:  <worin spezialisiert / was unterscheidet sie>
Kultur/Werte:  <kurz>
Aktuelles:     <News/Projekt>
Meine Brücke:  <welche meiner Skills/Erfahrungen passt konkret dazu>
```
