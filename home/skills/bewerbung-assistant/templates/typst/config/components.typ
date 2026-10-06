// ════════════════════════════════════════════════════════════════════
// KOMPONENTEN & STYLES — wiederverwendbare UI-Bausteine (aus Original)
// ════════════════════════════════════════════════════════════════════

#let blau      = rgb("#1a3a6b")
#let blau-hell = rgb("#2e5fa3")
#let weiss     = white
#let grau-bg   = rgb("#f0f3f8")
#let grau-box  = rgb("#dde3ed")
#let grau-linie = rgb("#ccc")
#let dunkel    = rgb("#1a1a1a")
#let bg-sidebar = rgb("#0f172a")
#let akzent-cyan = rgb("#0ea5e9")
#let tech-blau  = rgb("#1a3a6b")
#let text-main  = rgb("#1e293b")
#let text-light = rgb("#cbd5e1")
#let border-gray = rgb("#94a3b8")

#set text(font: "Liberation Sans", size: 9.5pt, lang: "de", fill: dunkel)
#set par(leading: 0.6em, spacing: 0.6em)

// Abschnitts-Header (Hauptbereich)
#let sek(t) = block(
  width: 100%, fill: blau, radius: 2pt, inset: (x: 6pt, y: 4pt),
  above: 0.65cm, below: 0.3cm, sticky: true
)[#text(weight: "bold", fill: weiss, size: 8.5pt)[#upper(t)]]

// Flexibler Sidebar-Header (Balken oder Linie)
#let sek-sb(t, ausr: left, farbe: none, bg: blau, fett: true) = {
  let txt-weight = if fett == true { "bold" } else { "regular" }
  let txt-color = if farbe != none { farbe } else { if bg != none { weiss } else { dunkel } }
  block(width: 100%, above: 0.45cm, below: 0.2cm, sticky: true)[
    #if bg != none {
      block(width: 100%, fill: bg, radius: 2pt, inset: (x: 5pt, y: 3pt))[
        #align(ausr)[#text(weight: txt-weight, fill: txt-color, size: 8pt)[#upper(t)]]
      ]
    } else {
      line(length: 100%, stroke: (paint: grau-box, thickness: 0.5pt))
      v(0.1cm)
      align(ausr)[#text(weight: txt-weight, fill: txt-color, size: 9pt)[#upper(t)]]
    }
  ]
}

// Daten-Zeile (z. B. Schulbildung)
#let zl(label, wert, farbe: none, fett: none) = block(width: 100%, breakable: false, below: 0.25cm)[
  #grid(columns: (3cm, 1fr), column-gutter: 5pt,
    text(weight: if fett == true { "bold" } else { "regular" }, size: 9pt, fill: if farbe != none { farbe } else { dunkel })[#label],
    text(size: 9pt)[#wert]
  )
]

// Schnupper-Zeile
#let sc(datum, info, farbe: none, fett: none) = block(width: 100%, breakable: false, below: 0.2cm)[
  #grid(columns: (3.2cm, 1fr), column-gutter: 5pt,
    text(weight: if fett == true { "bold" } else { "regular" }, size: 8pt, fill: if farbe != none { farbe } else { dunkel })[#datum],
    text(size: 8pt)[#info]
  )
]

// Kenntnisbalken (Skills)
#let kb(name, filled, total: 10) = block(width: 100%, breakable: false, below: 0.25cm)[
  #text(size: 8pt)[#name]
  #v(0.06cm)
  #grid(columns: (1fr,) * total, gutter: 2pt,
    ..range(total).map(i =>
      rect(height: 5.5pt, width: 100%, radius: 1pt,
        fill: if i < calc.floor(filled) { blau }
              else if i == calc.floor(filled) and filled != calc.floor(filled) { gradient.linear(blau, grau-box) }
              else { grau-box })
    )
  )
]

// PDF-Anhang einfügen (nutzt muchpdf)
#let pdf_seiten(pfad, seiten_oder_anzahl, paper: "a4") = {
  let daten = read(pfad, encoding: none)
  if type(seiten_oder_anzahl) == int {
    for i in range(seiten_oder_anzahl) {
      page(paper: paper, margin: 0pt)[#muchpdf(daten, pages: i, width: 100%, height: 100%)]
    }
  } else if type(seiten_oder_anzahl) == array {
    for s in seiten_oder_anzahl {
      page(paper: paper, margin: 0pt)[#muchpdf(daten, pages: s - 1, width: 100%, height: 100%)]
    }
  } else {
    panic("Ungültiger Typ für 'seiten_oder_anzahl'. Erwartet wird ein 'integer' oder 'array'.")
  }
}

// Timeline-Item (Berufserfahrung)
#let timeline-item(datum, titel, firma, body) = block(
  width: 100%, stroke: (left: 1.5pt + border-gray), inset: (left: 15pt, bottom: 15pt, top: 0pt), breakable: false
)[
  #place(dx: -18pt, dy: 4pt)[#circle(radius: 3pt, fill: bg-sidebar)]
  #text(size: 12pt, weight: "light", fill: text-main)[#datum] \
  #v(0.05cm)
  #text(size: 10.5pt, weight: "bold", fill: tech-blau)[#titel] \
  #if firma != "" [
    #text(size: 9pt, style: "italic", fill: rgb("#64748b"))[#firma] \
  ]
  #v(0.15cm)
  #text(size: 9pt)[#body]
]

// Anschreiben-Seite
#let anschreiben_seite(
  paper: "a4",
  margin_top: 2.5cm, margin_bottom: 2.2cm,
  margin_left: 2.7cm, margin_right: 2.3cm,
) = {
  set page(paper: paper, margin: (top: margin_top, bottom: margin_bottom, left: margin_left, right: margin_right))
  set par(leading: 0.58em, spacing: 0.55em, justify: true)
  grid(columns: (1fr, auto), align: (left, right),
    [
      #text(size: 16pt, weight: "bold", fill: blau)[#VORNAME #NACHNAME]
      #v(0.12cm)
      #text(size: 9pt, fill: text-main)[#ADRESSE \ #PLZ_ORT]
    ],
    [
      #text(size: 9pt, fill: text-main)[#link("mailto:#EMAIL")[#EMAIL] \ #link("tel:#TELEFON")[#TELEFON]]
    ]
  )
  v(0.3cm)
  line(length: 100%, stroke: (paint: blau, thickness: 1.1pt))
  v(0.85cm)
  grid(columns: (1fr, auto), align: (left, right),
    text(size: 9.5pt, fill: dunkel)[#FIRMA_NAME \ #FIRMA_ADR \ #FIRMA_PLZ],
    text(size: 9.5pt, fill: text-main)[#DATUM]
  )
  v(0.95cm)
  block(width: 100%, fill: grau-bg, radius: 2pt, stroke: (left: 3pt + blau), inset: (left: 11pt, right: 9pt, y: 8pt))[
    #text(size: 11.5pt, weight: "bold", fill: blau)[Bewerbung für ein #BEWERBEN als #BERUF]
  ]
  v(0.5cm)
  text(size: 10pt)[#ANREDE]
  v(0.5cm)
  text(size: 10pt)[#BRIEFTEXT]
  v(0.8cm)
  text(size: 10pt)[Freundliche Grüsse]
  v(0.45cm)
  text(size: 10.5pt, weight: "bold", fill: blau)[#VORNAME #NACHNAME]
  pagebreak()
}
