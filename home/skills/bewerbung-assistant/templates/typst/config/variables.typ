// ════════════════════════════════════════════════════════════════════
// VARIABLEN — hier pro Bewerbung anpassen
// ════════════════════════════════════════════════════════════════════

// ── PERSON ────────────────────────────────────────────
#let VORNAME = "Kittirat"
#let NACHNAME = "Patsaban"
#let ADRESSE = "Hinterdorfstrasse 5"
#let PLZ_ORT = "5417 Untersiggenthal"
#let EMAIL = "kittiratpatsaban@gmail.com"
#let TELEFON = "077 266 18 57"
#let GEBURTSDATUM = "17.11.2003"
#let NATIONALITAET = "Thailand"
#let AUFENTHALTSSTATUS = "Aufenthaltsbewilligung C, in der Schweiz seit 2009"
#let GITHUB = "https://github.com/LangLi7"

// ── BEWERBUNG ─────────────────────────────────────────
#let BEWERBEN = "Praktikum"
#let BERUF    = "Intern IT / Informatik-Praktikum"
#let FIRMA_NAME = "Oniko AG"
#let FIRMA_ADR  = "Taegerhardstrasse 119a"
#let FIRMA_PLZ  = "5430 Wettingen"
#let DATUM = datetime.today().display("[day]. [month repr:long] [year]")
#let ANREDE = "Sehr geehrter Herr Schold"
#let anbei = (
  "Bewerbungsschreiben",
  "Lebenslauf",
  "Zeugnisse",
)

// ── ANSCHREIBEN-TEXT ──────────────────────────────────
// YOU-ME-WE-Aufbau. Dies ist das konkrete Anschreiben für Oniko AG (Initiativbewerbung/Einstieg).
#let BRIEFTEXT = [
Sehr geehrter Herr Schold,

schon während meiner Ausbildung als Montage-Elektriker EFZ hat mich die Verbindung von Elektrotechnik und Informatik begleitet. Neben der Arbeit in Industrie- und sicherheitskritischen Anlagen habe ich mich seit rund sieben Jahren intensiv und selbstständig mit Programmierung und IT-Infrastruktur beschäftigt. Da Oniko AG IT-Fachkräfte für Unternehmen jeder Grösse bereitstellt und junge Talente gezielt fördert, möchte ich meine bisher selbstständig erworbenen Kenntnisse gerne in einem professionellen Umfeld vertiefen und ein Praktikum in der Informatik beginnen.

#v(0.1cm)
Python war meine erste Programmiersprache; unter anderem habe ich mit Pycord eigene Discord-Bot-Anwendungen entwickelt und dabei Datenbanken mit SQLite sowie SQL eingesetzt. Darüber hinaus habe ich eigene Linux-Root-Server aufgesetzt und betrieben, mit Docker gearbeitet und unter Ubuntu einen K3s-Kubernetes-Cluster eingerichtet. Aktuell erweitere ich meine Kenntnisse zusätzlich in Rust und Go. Meine Projekte dokumentiere ich auf GitHub: github.com/LangLi7.

#v(0.1cm)
Besonders reizt mich bei Oniko die Nähe zum operativen IT-Betrieb und zur Beratung für verschiedene Kundinnen und Kunden. Ich bringe technisches Verständnis für elektrische und industrielle Prozesse mit und gleichzeitig praktische IT-Erfahrung — eine Kombination, die mir einen zusätzlichen Blick auf Schnittstellen zwischen Anlagen und IT-Systemen ermöglicht. Ich arbeite gerne im Team, bin selbstständig und lerne schnell Neues.

#v(0.1cm)
Gerne stelle ich Ihnen meine Motivation und meine Fähigkeiten in einem persönlichen Gespräch vor und freue mich auf Ihre Rückmeldung.

Freundliche Grüsse
Kittirat Patsaban
]

// ── LEBENSLAUF: Inhalte ───────────────────────────────
#let sprachen = (
  "Deutsch": 7,
  "Thailändisch": 10,
  "Englisch": 7,
)
#let skills_technik = (
  "Python": 8,
  "Linux / Bash Scripting": 6,
  "SQL / Datenbanken": 7,
  "Automatisierung": 7,
)
#let skills_edv = (
  "Microsoft Office": 8,
  "Abacus ERP": 6,
)
#let berufserfahrung = (
  (zeitraum: "01.08.2023 – 31.07.2026", titel: "Lehre als Montage-Elektriker EFZ", firma: "Thut Elektro AG, Klingnau", punkte: (
    "Mitarbeit bei Elektroinstallationen in Industrie- und Gewerbeobjekten inkl. sicherheitskritischer Anlagen",
    "Installation von Apparaten und Betriebsmitteln gemäss NIN",
    "Verdrahten und Verkabeln von Schaltschränken nach Schaltplan",
    "Arbeiten in Technik- und Serverräumen sowie sicherheitsrelevanten Industrieanlagen",
  )),
  (zeitraum: "09.2021 – 2022", titel: "Befristete Tätigkeit in Dienstleistung & Administration", firma: "SEMO, Verein Lernwerk, Vogelsang AG", punkte: (
    "Bedienung der Telefonzentrale und des Kundenschalters am Empfang",
    "Statistische Datenerfassung in Microsoft Excel 2020",
    "Lagerbewirtschaftung, Stammdatenerfassung via ERP europa3000",
  )),
)
#let ausbildung = (
  (zeitraum: "2023 – 2026", institution: "Berufs- und Weiterbildungszentrum BWZ Brugg"),
  (zeitraum: "2022 – 2023", institution: "Schule KSB, Kantonale Schule Baden"),
  (zeitraum: "2017 – 2021", institution: "Realschule St. Benedikt, Hermetschwil-Staffeln"),
  (zeitraum: "2013 – 2017", institution: "Primarschule St. Benedikt, Hermetschwil-Staffeln"),
)
#let HOBBYS = "Mein Fokus liegt auf dem Programmieren und dem Aufbau eigener IT-Projekte. Ich beschäftige mich intensiv mit Datenbank-Architekturen, Prozess-Automatisierung und dem Betreiben eigener Server-Infrastrukturen. Zudem arbeite ich gerne in Teams und spiele Taktische-Games (Valorant, League of Legends)."

// ── ASSETS ────────────────────────────────────────────
#let assets = (
  full: "full.jpg",
  quadrat: "foto.jpg",
  logo: "logo.svg",
  portrait: "portrait",
)
#let get-asset(key, ext: "png") = {
  let name = assets.at(key)
  let base-path = if name.starts-with("assets/") { name } else { "assets/" + name }
  let final-path = if base-path.contains(".") { base-path } else { base-path + "." + ext }
  image(final-path, width: 100%, height: 100%, fit: "cover")
}

// ── ANHANG (PDF) ──────────────────────────────────────
#let zeugnisse = (
  (datei: "unterlagen/Lehrabschluss.pdf", seiten: 3),
)
