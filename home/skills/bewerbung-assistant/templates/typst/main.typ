// ════════════════════════════════════════════════════════════════════
// Bewerbungsmappe — parametrisiertes Template
// Basierend auf dem Projekt des Nutzers. Pro Bewerbung nur
// config/variables.typ (und die Anschreiben-placeholder) anpassen.
// ════════════════════════════════════════════════════════════════════
#import "@preview/muchpdf:0.1.2": muchpdf
#import "config/variables.typ": *
#import "config/components.typ": *

// ── AUSGABE-SCHALTER ──────────────────────────────────
// true = Anschreiben-Seite (Seite 2) wird gedruckt
#let ZEIGE_ANSCHREIBEN = true

// ── SEITE 1: DECKBLATT ────────────────────────────────
#page(margin: 0pt)[
  #place(right + top)[
    #rect(width: 4.2cm, height: 29.7cm, fill: blau)[]
  ]
  #pad(left: 3cm, top: 3.2cm, right: 3.5cm, bottom: 2cm)[
    #text(size: 34pt, weight: "bold", fill: blau)[Bewerbung]
    #text(size: 13pt, weight: "bold")[für ein #BEWERBEN im Bereich]
    #linebreak()
    #text(size: 13pt, weight: "bold", fill: blau-hell)[#BERUF]
    #linebreak()
    #v(1.2cm)
    #rect(width: 6.2cm, height: 7.2cm, fill: grau-box)[
      #align(center + horizon)[#text(size: 8pt, fill: rgb("#888"))[#get-asset("full")]]
    ]
    #text(size: 15pt, weight: "bold", fill: blau)[#VORNAME #NACHNAME]
    #v(0.1cm)
    #text[#ADRESSE \ #PLZ_ORT]
    #v(0.3cm)
    #link("mailto:#EMAIL")[#EMAIL]#linebreak()
    #link("tel:#TELEFON")[#TELEFON]
    #v(0.5cm)
    #v(1.8cm)
    #text(weight: "bold", fill: blau-hell)[Anhang:]
    #v(0.2cm)
    #for p in anbei [
      #block(above: 0pt, below: 0.18cm)[– #p]
    ]
  ]
]

// ── SEITE 2: ANSCHREIBEN ──────────────────────────────
#if ZEIGE_ANSCHREIBEN [
  #anschreiben_seite()
]

// ── SEITE 3+: LEBENSLAUF ──────────────────────────────
#set page(
  paper: "a4", margin: 0pt,
  header: block(width: 100%, fill: blau,
    inset: (left: 1.5cm, right: 0pt, top: 0.65cm, bottom: 0.65cm))[
    #text(size: 21pt, weight: "bold", fill: weiss)[#VORNAME #NACHNAME]
  ],
  header-ascent: 0pt,
)
#let sb-breite = 6cm

#place(right + top, dy: 0pt)[
  #block(width: sb-breite, height: 100%, fill: grau-bg,
    inset: (left: 0.55cm, right: 0.55cm, top: 0.75cm, bottom: 0pt), clip: true)[
    #rect(width: 100%, height: 4.8cm, fill: grau-box, radius: 2pt)[
      #align(center + horizon)[#text(size: 8pt, fill: rgb("#aaa"))[#get-asset("quadrat")]]
    ]
    #sek-sb("Sprachkenntnisse")
    #for (name, wert) in sprachen [
      #kb(name, wert)
    ]
    #v(0.3cm)
    #sek-sb("Tech Stack")
    #for (name, wert) in skills_technik [
      #kb(name, wert)
    ]
    #v(0.3cm)
    #align(right)[
      #link(GITHUB)[#underline[#text(size: 8pt)[#GITHUB]]]
    ]
    #sek-sb("EDV / Software")
    #for (name, wert) in skills_edv [
      #kb(name, wert)
    ]
  ]
]

#pad(left: 1.5cm, right: sb-breite + 0.5cm, top: 1cm, bottom: 1cm)[
  #sek("Personalien")
  #zl("Name:", NACHNAME)
  #zl("Vorname:", VORNAME)
  #zl("Adresse:", [ADRESSE \ PLZ_ORT])
  #zl("E-Mail: ", link("mailto:EMAIL")[EMAIL])
  #zl("Telefon:", link("tel:TELEFON")[TELEFON])
  #zl("Geburtsdatum:", GEBURTSDATUM)
  #zl("Nationalität:", NATIONALITAET)
  #block(above: -0.1cm, below: 0.2cm)[
    #grid(columns: (3cm, 1fr), column-gutter: 4pt, [], text(size: 8.5pt, style: "italic")[AUFENTHALTSSTATUS])
  ]

  #sek("Berufliche Tätigkeit")
  #for item in berufserfahrung [
    #timeline-item(item.zeitraum, item.titel, item.firma, [
      #list(
        tight: false,
        marker: text(fill: akzent-cyan)[•],
        ..item.punkte.map(p => text(size: 9pt)[#p])
      )
    ])
  ]

  #sek("Schulbildung")
  #for s in ausbildung [
    #zl(s.zeitraum, s.institution)
  ]

  #sek("Hobbys")
  #block(below: 0.2cm)[
    #text(size: 9pt)[#HOBBYS]
  ]
]

// ── SEITE 4+: PDF-UNTERLAGEN ──────────────────────────
#for u in zeugnisse [
  #pdf_seiten(u.datei, u.seiten)
]
