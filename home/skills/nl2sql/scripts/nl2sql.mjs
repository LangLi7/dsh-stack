#!/usr/bin/env node
/**
 * nl2sql.mjs — Natural Language to SQL.
 *
 * Ablauf in vier Schritten, Vorbild ist die Architektur von LangLi7/go-database
 * (dynamische Schema-Erkundung, Query-Guard, Safe-Executor):
 *
 *   1. schema  — Schema aus der Datenbank lesen (nie hartkodiert)
 *   2. prompt  — daraus den Auftrag für das Sprachmodell bauen (nachvollziehbar)
 *   3. ask     — Modell aufrufen (OpenAI-kompatibel) ODER Regelmodus ohne Schlüssel
 *   4. check   — erzeugtes SQL prüfen: nur lesend, nur bekannte Tabellen/Spalten, Plan ok
 *
 *   node nl2sql.mjs schema <db>                     Schema anzeigen
 *   node nl2sql.mjs prompt <db> "Frage"             Prompt ausgeben (ohne Modellaufruf)
 *   node nl2sql.mjs ask <db> "Frage" [--json]       SQL erzeugen (Modell oder Regeln)
 *   node nl2sql.mjs check <db> "SELECT ..."         SQL prüfen (Guard + EXPLAIN)
 *   node nl2sql.mjs test                            Selbsttest mit Test-Schema
 *
 * Umgebung für den Modellaufruf (optional — ohne läuft der Regelmodus):
 *   NL2SQL_BASE_URL   z. B. https://openrouter.ai/api/v1  (oder http://localhost:1234/v1)
 *   NL2SQL_API_KEY    Schlüssel
 *   NL2SQL_MODEL      Modellname, z. B. qwen2.5-coder-7b-instruct
 *
 * Keine Abhängigkeiten ausser `node:sqlite` (Node >= 22).
 */
import { DatabaseSync } from 'node:sqlite'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const befehl = args[0]
const alsJson = args.includes('--json')

/* ----------------------------- 1) Schema lesen ---------------------------- */

/** Liest Tabellen, Spalten, Typen, Schlüssel und Indizes aus einer SQLite-Datei. */
export function schemaLesen(pfad) {
  const db = new DatabaseSync(pfad, { readOnly: true })
  const tabellen = db.prepare(
    "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all()

  const schema = []
  for (const t of tabellen) {
    const spalten = db.prepare(`PRAGMA table_info(${JSON.stringify(t.name)})`).all()
    let fremd = []
    try { fremd = db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(t.name)})`).all() } catch { /* keine */ }
    const indizes = db.prepare(`PRAGMA index_list(${JSON.stringify(t.name)})`).all()
    // Beispielwerte helfen dem Modell, Wertebereiche zu erkennen (nur 3 je Spalte).
    const beispiele = {}
    for (const s of spalten) {
      try {
        const reihen = db.prepare(`SELECT DISTINCT ${JSON.stringify(s.name)} AS w FROM ${JSON.stringify(t.name)} WHERE ${JSON.stringify(s.name)} IS NOT NULL LIMIT 3`).all()
        if (reihen.length > 0) beispiele[s.name] = reihen.map(r => String(r.w).slice(0, 24))
      } catch { /* ignorieren */ }
    }
    schema.push({
      name: t.name,
      art: t.type,
      spalten: spalten.map(s => ({
        name: s.name, typ: s.type || 'any', schluessel: s.pk === 1 ? 'PK' : null,
        pflicht: s.notnull === 1, beispiele: beispiele[s.name] ?? [],
      })),
      fremdschluessel: fremd.map(f => ({ von: f.from, nach: `${f.table}.${f.to}` })),
      indizes: indizes.map(i => i.name),
    })
  }
  db.close()
  return schema
}

/** Schema als kompakter Text für den Prompt — spart Token gegenüber JSON. */
export function schemaText(schema) {
  const zeilen = []
  for (const t of schema) {
    zeilen.push(`TABELLE ${t.name}`)
    for (const s of t.spalten) {
      const teile = [`  ${s.name} ${s.typ}`]
      if (s.schluessel === 'PK') teile.push('PRIMARY KEY')
      if (s.pflicht) teile.push('NOT NULL')
      for (const f of t.fremdschluessel.filter(f => f.von === s.name)) teile.push(`-> ${f.nach}`)
      if (s.beispiele.length > 0) teile.push(`z. B. ${s.beispiele.join(' | ')}`)
      zeilen.push(teile.join('  '))
    }
  }
  return zeilen.join('\n')
}

/* ------------------------------ 2) Prompt bauen --------------------------- */

export function promptBauen(schema, frage, { dialekt = 'SQLite' } = {}) {
  return `Du übersetzt eine Frage in genau EINE ${dialekt}-Abfrage.

REGELN
- Antworte ausschliesslich mit der Abfrage, ohne Erklärung, ohne Markdown-Zäune.
- Nur lesend: SELECT oder WITH. Niemals INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, PRAGMA.
- Nur Tabellen und Spalten aus dem Schema unten. Erfinde nichts.
- Wenn die Frage nicht beantwortbar ist, antworte mit: NICHT_MOEGLICH: <kurzer Grund>
- Wenn die Frage mehrdeutig ist, wähle die naheliegendste Lesart und ergänze als Kommentar am Ende: -- ANNAHME: <was du angenommen hast>
- Begrenze grosse Ergebnisse mit LIMIT, sofern die Frage keine Aggregation verlangt.
- Datumsangaben im Format YYYY-MM-DD, Zahlen ohne Tausendertrennzeichen.

SCHEMA
${schemaText(schema)}

FRAGE
${frage}

ABFRAGE`
}

/* --------------------------- 3a) Modell aufrufen -------------------------- */

export async function modellFragen(prompt) {
  const basis = process.env.NL2SQL_BASE_URL
  const schluessel = process.env.NL2SQL_API_KEY
  const modell = process.env.NL2SQL_MODEL
  if (basis === undefined || modell === undefined) {
    return { quelle: 'regeln', grund: 'NL2SQL_BASE_URL/NL2SQL_MODEL nicht gesetzt' }
  }
  const antwort = await fetch(`${basis.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(schluessel ? { Authorization: `Bearer ${schluessel}` } : {}),
    },
    body: JSON.stringify({
      model: modell,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!antwort.ok) throw new Error(`Modell antwortete HTTP ${antwort.status}`)
  const daten = await antwort.json()
  const text = daten.choices?.[0]?.message?.content ?? ''
  return { quelle: 'modell', text: text.trim() }
}

/* ------------------------------ 3b) Regelmodus ---------------------------- */
/* Ohne Schlüssel: ein bewusst einfacher, deterministischer Übersetzer.
   Er deckt Zählen, Auflisten, Filtern und Sortieren ab — mehr nicht.
   Das ist ehrlich begrenzt und macht den Skill ohne Kosten testbar. */

const STOPP = new Set(['der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'alle', 'wie', 'viele',
  'welche', 'welcher', 'welches', 'zeige', 'mir', 'bitte', 'list', 'show', 'all', 'the', 'of',
  'and', 'und', 'mit', 'ohne', 'in', 'im', 'von', 'für', 'fuer', 'ist', 'sind', 'gib', 'es',
  'nach', 'aus', 'auf', 'zu', 'zum', 'zur', 'pro', 'je', 'an', 'am', 'bei'])

export function regelUebersetzen(schema, frage) {
  // Umlaute und Endungen normalisieren, damit «Beträge» auf «betrag» trifft.
  // Umlaute und Endungen normalisieren, damit «Beträge» auf die Spalte «betrag» trifft.
  // Zwei Schreibweisen prüfen: «ae»-Form (betraege) UND Umlaut-Entfernung (betrage),
  // weil Spaltennamen in Datenbanken beide Varianten haben.
  const formen = s => {
    const k = s.toLowerCase()
    const mitAe = k.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    const ohne = k.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    return [...new Set([mitAe, ohne])].flatMap(v => [v, v.replace(/(en|er|es|e|n|s)$/, '')])
  }
  const passt = (a, b) => formen(a).some(f => formen(b).some(g => f.length > 2 && g.length > 2 && (f === g || f.includes(g) || g.includes(f))))
  const klein = frage.toLowerCase()
  const woerter = formen(frage.replace(/[?!.,;:()"']/g, ' ').trim()).filter(w => w.length > 2 && !STOPP.has(w))

  // Tabelle suchen: erst über den Namen, dann über passende Spalten.
  let tabelle = schema.find(t => klein.includes(t.name.toLowerCase()))
  if (tabelle === undefined) {
    tabelle = schema.find(t => woerter.some(w => passt(w, t.name)))
  }
  if (tabelle === undefined) {
    // Notnagel: die Tabelle, deren Spaltennamen am besten zur Frage passen.
    let bester = null
    let besteZahl = 0
    for (const t of schema) {
      const treffer = t.spalten.filter(s => woerter.some(w => passt(w, s.name))).length
      if (treffer > besteZahl) { besteZahl = treffer; bester = t }
    }
    if (besteZahl > 0) tabelle = bester
  }
  if (tabelle === undefined) {
    return { fehler: `Keine Tabelle zur Frage gefunden. Vorhanden: ${schema.map(t => t.name).join(', ')}` }
  }

  // Passende Spalte ebenfalls normalisiert suchen (für Summe/Sortierung).
  const spaltenTreffer = tabelle.spalten.find(s => woerter.some(w => passt(w, s.name)))
  const zaehlen = /(wie viele|anzahl|count|wieviele)/.test(klein)
  const summe = /(summe|gesamt|total|sum of)/.test(klein)

  let sql
  if (zaehlen) {
    sql = `SELECT COUNT(*) AS anzahl FROM ${tabelle.name}`
  } else if (summe) {
    // Summe über die erste numerische Spalte, wenn keine genannt wurde.
    const ziel = spaltenTreffer ?? tabelle.spalten.find(s => /int|real|numeric|decimal|float/i.test(s.typ))
    if (ziel === undefined) return { fehler: `Keine numerische Spalte in «${tabelle.name}» für eine Summe gefunden.` }
    sql = `SELECT SUM(${ziel.name}) AS summe FROM ${tabelle.name}`
  } else {
    const spalten = tabelle.spalten.slice(0, 6).map(s => s.name).join(', ')
    sql = `SELECT ${spalten} FROM ${tabelle.name}`
    if (spaltenTreffer !== undefined) sql += ` ORDER BY ${spaltenTreffer.name}`
    sql += ' LIMIT 50'
  }
  return { sql, tabelle: tabelle.name, annahme: 'Regelmodus: einfache Ableitung ohne Sprachmodell' }
}

/* ------------------------------- 4) Guard -------------------------------- */

const VERBOTEN = /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|pragma|vacuum|reindex|grant|revoke)\b/i

/** Prüft SQL: nur lesend, nur bekannte Tabellen/Spalten, Plan ausführbar. */
export function sqlPruefen(pfad, sql, schema) {
  const befunde = []
  const bereinigt = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim()
  const ohneFuehrend = bereinigt.replace(/^\(+/, '').trim()

  if (VERBOTEN.test(bereinigt)) befunde.push({ schwere: 'kritisch', text: 'Schreibender Befehl erkannt — nur lesende Abfragen erlaubt.' })
  if (!/^(select|with)\b/i.test(ohneFuehrend)) befunde.push({ schwere: 'kritisch', text: `Abfrage beginnt nicht mit SELECT/WITH, sondern mit «${ohneFuehrend.slice(0, 20)}».` })
  if (bereinigt.includes(';') && bereinigt.replace(/;+\s*$/, '').includes(';')) {
    befunde.push({ schwere: 'kritisch', text: 'Mehrere Anweisungen in einer Abfrage — nicht erlaubt.' })
  }

  const bekannt = new Set(schema.map(t => t.name.toLowerCase()))
  for (const m of bereinigt.matchAll(/\b(?:from|join)\s+([a-zA-Z_][\w.]*)/gi)) {
    const name = m[1].toLowerCase()
    if (!bekannt.has(name) && !name.startsWith('(')) {
      befunde.push({ schwere: 'hoch', text: `Unbekannte Tabelle «${m[1]}». Vorhanden: ${[...bekannt].join(', ')}` })
    }
  }

  // Spalten prüfen: nur einfache Bezeichner vor Komma/Leerzeichen, keine Funktionen.
  const alleSpalten = new Set(schema.flatMap(t => t.spalten.map(s => s.name.toLowerCase())).concat(['count', 'sum', 'avg', 'min', 'max', 'as', 'distinct', 'select', 'from', 'where', 'order', 'by', 'group', 'limit', 'join', 'on', 'and', 'or', 'not', 'null', 'like', 'in', 'desc', 'asc', 'case', 'when', 'then', 'else', 'end', 'cast', 'round', 'lower', 'upper', 'substr', 'date']))
  const auswahl = bereinigt.match(/^\s*(?:select|with)[\s\S]*?(?=\bfrom\b)/i)?.[0] ?? ''
  for (const m of auswahl.matchAll(/(?:^|,)\s*([a-zA-Z_][\w]*)\s*(?:,|$|AS\b)/gi)) {
    const name = m[1].toLowerCase()
    if (!alleSpalten.has(name) && name !== '*') {
      befunde.push({ schwere: 'mittel', text: `Spalte «${m[1]}» ist im Schema nicht bekannt.` })
    }
  }

  let plan = null
  if (befunde.every(b => b.schwere !== 'kritisch')) {
    try {
      const db = new DatabaseSync(pfad, { readOnly: true })
      plan = db.prepare(`EXPLAIN QUERY PLAN ${bereinigt}`).all().map(z => z.detail).join(' | ')
      db.close()
    } catch (fehler) {
      befunde.push({ schwere: 'hoch', text: `Abfrage ist nicht ausführbar: ${fehler.message.split('\n')[0]}` })
    }
  }

  return { bestanden: befunde.length === 0, befunde, plan, sql: bereinigt }
}

/* -------------------------------- Selbsttest ------------------------------ */

const TESTS = [
  { frage: 'Wie viele Kunden gibt es?', erwartet: /count\(\*\)/i, beschreibung: 'Zählen' },
  { frage: 'Zeige alle Bestellungen', erwartet: /select[\s\S]*bestellungen/i, beschreibung: 'Auflisten' },
  { frage: 'Summe der Beträge', erwartet: /sum\(/i, beschreibung: 'Summieren' },
  { frage: 'Zeige die Produkte', erwartet: /produkte/i, beschreibung: 'Zweite Tabelle' },
  { frage: 'Wie viele Bestellungen gibt es?', erwartet: /count\(\*\)[\s\S]*bestellungen/i, beschreibung: 'Zählen zweite Tabelle' },
]

/* Die Fehlerfälle prüfen die SCHUTZSCHICHT, nicht den Übersetzer: Der Regelmodus
   erzeugt ohnehin nur SELECT. Gefährliches SQL entsteht erst durch ein Modell —
   genau dagegen muss sqlPruefen greifen. Deshalb wird hier SQL direkt eingespeist. */
const FEHLERFAELLE = [
  { sql: 'DROP TABLE kunden', erwartetFehler: /schreibend/i, beschreibung: 'Schreibender Befehl (DROP)' },
  { sql: 'DELETE FROM kunden WHERE id = 1', erwartetFehler: /schreibend/i, beschreibung: 'Schreibender Befehl (DELETE)' },
  { sql: 'SELECT id FROM kunden; DROP TABLE kunden', erwartetFehler: /mehrere anweisungen|schreibend/i, beschreibung: 'Zwei Anweisungen in einer Abfrage' },
  { sql: 'SELECT * FROM raumschiffe', erwartetFehler: /unbekannte tabelle/i, beschreibung: 'Unbekannte Tabelle' },
]

async function selbsttest() {
  const pfad = join(tmpdir(), `nl2sql-test-${Date.now()}.db`)
  const db = new DatabaseSync(pfad)
  db.exec(`
    CREATE TABLE kunden (id INTEGER PRIMARY KEY, name TEXT NOT NULL, ort TEXT, seit TEXT);
    CREATE TABLE produkte (id INTEGER PRIMARY KEY, bezeichnung TEXT NOT NULL, preis REAL);
    CREATE TABLE bestellungen (id INTEGER PRIMARY KEY, kunde_id INTEGER REFERENCES kunden(id), datum TEXT, betrag REAL);
    INSERT INTO kunden (name, ort, seit) VALUES ('Muster AG','Brugg','2024-01-15'), ('Beispiel GmbH','Aarau','2025-03-02');
    INSERT INTO produkte (bezeichnung, preis) VALUES ('Currypaste', 6.50), ('Kokosmilch', 2.90);
    INSERT INTO bestellungen (kunde_id, datum, betrag) VALUES (1,'2026-09-01',57.00), (2,'2026-09-02',19.50);
  `)
  db.close()

  const schema = schemaLesen(pfad)
  const ergebnisse = []
  let bestanden = 0

  for (const t of TESTS) {
    const uebersetzt = regelUebersetzen(schema, t.frage)
    const sql = uebersetzt.sql ?? ''
    const pruefung = sql.length > 0 ? sqlPruefen(pfad, sql, schema) : { bestanden: false, befunde: [{ text: uebersetzt.fehler }] }
    const gut = t.erwartet.test(sql) && pruefung.bestanden
    if (gut) bestanden += 1
    ergebnisse.push({ art: 'erwartet-gut', beschreibung: t.beschreibung, frage: t.frage, sql, gut, befunde: pruefung.befunde })
  }

  for (const t of FEHLERFAELLE) {
    // Direkt gegen den Guard — hier wird nichts übersetzt, sondern geprüft.
    const pruefung = sqlPruefen(pfad, t.sql, schema)
    const gut = !pruefung.bestanden && t.erwartetFehler.test(pruefung.befunde.map(b => b.text).join(' '))
    if (gut) bestanden += 1
    ergebnisse.push({ art: 'erwartet-blockiert', beschreibung: t.beschreibung, frage: t.sql, sql: t.sql, gut, befunde: pruefung.befunde })
  }

  const gesamt = TESTS.length + FEHLERFAELLE.length
  if (alsJson) {
    process.stdout.write(`${JSON.stringify({ bestanden, gesamt, ergebnisse }, null, 2)}\n`)
  } else {
    process.stdout.write(`nl2sql Selbsttest — ${bestanden}/${gesamt}\n\n`)
    for (const e of ergebnisse) {
      process.stdout.write(`${e.gut ? 'OK  ' : 'FEHL'} [${e.beschreibung}] «${e.frage}»\n`)
      process.stdout.write(`       ${e.sql.replace(/\s+/g, ' ').slice(0, 90)}\n`)
      for (const b of e.befunde) process.stdout.write(`       -> ${b.schwere ?? ''} ${b.text.slice(0, 90)}\n`)
    }
  }
  await rm(pfad, { force: true })
  process.exit(bestanden === gesamt ? 0 : 1)
}

/* ---------------------------------- Start --------------------------------- */

async function main() {
  if (befehl === undefined || befehl === 'help') {
    process.stdout.write(await readFile(new URL(import.meta.url), 'utf8').then(t => t.split('*/')[0].replace(/^#![^\n]*\n\/\*\*\n?/, '')))
    return
  }
  if (befehl === 'test') return selbsttest()

  const pfad = args[1]
  if (pfad === undefined || !existsSync(pfad)) throw new Error(`Datenbankdatei nicht gefunden: ${pfad ?? '(fehlt)'}`)
  const schema = schemaLesen(pfad)

  if (befehl === 'schema') {
    process.stdout.write(alsJson ? `${JSON.stringify(schema, null, 2)}\n` : `${schemaText(schema)}\n`)
    return
  }
  const frage = args.slice(2).filter(a => !a.startsWith('--')).join(' ')
  if (frage.length === 0) throw new Error(`Für «${befehl}» fehlt die Frage bzw. das SQL`)

  if (befehl === 'prompt') {
    process.stdout.write(`${promptBauen(schema, frage)}\n`)
    return
  }
  if (befehl === 'check') {
    const ergebnis = sqlPruefen(pfad, frage, schema)
    if (alsJson) process.stdout.write(`${JSON.stringify(ergebnis, null, 2)}\n`)
    else {
      process.stdout.write(`${ergebnis.bestanden ? 'OK' : 'ABGELEHNT'}\n`)
      if (ergebnis.plan !== null) process.stdout.write(`Plan: ${ergebnis.plan}\n`)
      for (const b of ergebnis.befunde) process.stdout.write(`  [${b.schwere}] ${b.text}\n`)
    }
    process.exit(ergebnis.bestanden ? 0 : 1)
  }
  if (befehl === 'ask') {
    const modell = await modellFragen(promptBauen(schema, frage))
    let sql = modell.text ?? ''
    let annahme = null
    if (modell.quelle === 'regeln') {
      const r = regelUebersetzen(schema, frage)
      sql = r.sql ?? ''
      annahme = r.annahme ?? r.fehler ?? null
      if (sql.length === 0) {
        process.stdout.write(alsJson ? `${JSON.stringify({ frage, fehler: r.fehler }, null, 2)}\n` : `Nicht übersetzbar: ${r.fehler}\n`)
        process.exit(1)
      }
    }
    const ausKommentar = sql.match(/--\s*ANNAHME:\s*(.+)/i)?.[1] ?? annahme
    const nichtMoeglich = sql.match(/NICHT_MOEGLICH:\s*(.+)/i)?.[1]
    if (nichtMoeglich !== undefined) {
      process.stdout.write(alsJson ? `${JSON.stringify({ frage, nichtMoeglich }, null, 2)}\n` : `Nicht möglich: ${nichtMoeglich}\n`)
      process.exit(2)
    }
    const pruefung = sqlPruefen(pfad, sql, schema)
    const ergebnis = { frage, quelle: modell.quelle, sql: pruefung.sql, annahme: ausKommentar ?? null, geprueft: pruefung.bestanden, befunde: pruefung.befunde, plan: pruefung.plan }
    if (alsJson) process.stdout.write(`${JSON.stringify(ergebnis, null, 2)}\n`)
    else {
      process.stdout.write(`${pruefung.sql}\n`)
      process.stdout.write(`\nQuelle: ${modell.quelle}${modell.grund ? ` (${modell.grund})` : ''}\n`)
      if (ausKommentar !== null) process.stdout.write(`Annahme: ${ausKommentar}\n`)
      process.stdout.write(`Prüfung: ${pruefung.bestanden ? 'bestanden' : 'ABGELEHNT'}\n`)
      for (const b of pruefung.befunde) process.stdout.write(`  [${b.schwere}] ${b.text}\n`)
      if (pruefung.plan !== null) process.stdout.write(`Plan: ${pruefung.plan}\n`)
    }
    process.exit(pruefung.bestanden ? 0 : 1)
  }
  throw new Error(`Unbekannter Befehl: ${befehl}`)
}

main().catch((fehler) => {
  process.stderr.write(`nl2sql.mjs: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
  process.exit(1)
})
