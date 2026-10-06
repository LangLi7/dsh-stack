#!/usr/bin/env node
/**
 * selbsttest.mjs — prüft den Harness objektiv und liefert eine Scorecard.
 *
 * Zweck: Grundlage für Selbstverbesserung (Skill `self-improve`). Bewusst
 * deterministisch und von aussen — es liest Dateien und führt Befehle aus,
 * statt sich selbst zu benoten. Damit ist Evaluation-Hacking erschwert.
 *
 *   node selbsttest.mjs                  Scorecard als Text
 *   node selbsttest.mjs --json           maschinenlesbar
 *   node selbsttest.mjs --basis x.json   mit früherem Lauf vergleichen
 *   node selbsttest.mjs --schreiben      Ergebnis als Basislinie speichern
 *
 * Rückgabe: 0 alles in Ordnung · 1 mindestens eine kritische Prüfung fehlgeschlagen
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { homedir } from 'node:os'

const execFileP = promisify(execFile)
const args = process.argv.slice(2)
const alsJson = args.includes('--json')
const basisIndex = args.indexOf('--basis')
const basisPfad = basisIndex >= 0 ? args[basisIndex + 1] : null
const schreiben = args.includes('--schreiben')

const SKILLS = join(homedir(), '.dsh', 'skills')
const ANALYSE = join(SKILLS, 'analyse', 'scripts', 'analyse.mjs')
const PRUEFUNGEN = []

const notiere = (gruppe, name, bestanden, detail, schwere = 'mittel') =>
  PRUEFUNGEN.push({ gruppe, name, bestanden, detail: String(detail).slice(0, 160), schwere })

async function befehl(programm, argumente, timeoutMs = 30000) {
  try {
    const { stdout, stderr } = await execFileP(programm, argumente, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 })
    return { ok: true, ausgabe: `${stdout}${stderr}`.trim() }
  } catch (fehler) {
    return { ok: false, ausgabe: `${fehler.stdout ?? ''}${fehler.stderr ?? ''}${fehler.message}`.trim() }
  }
}

/* --------------------------- 1) Skills prüfen ---------------------------- */

async function pruefeSkills() {
  let eintraege = []
  try {
    eintraege = (await readdir(SKILLS, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name)
  } catch (fehler) {
    notiere('Skills', 'Skills-Verzeichnis lesbar', false, fehler.message, 'kritisch')
    return
  }
  notiere('Skills', 'Skills-Verzeichnis lesbar', true, `${eintraege.length} Ordner`)

  const namen = new Map()
  let geprueft = 0
  let uebersprungen = 0
  const kaputt = []

  for (const ordner of eintraege) {
    const datei = join(SKILLS, ordner, 'SKILL.md')
    if (!existsSync(datei)) continue
    let inhalt
    try {
      inhalt = await readFile(datei, 'utf8')
    } catch (fehler) {
      kaputt.push(`${ordner}: nicht lesbar (${fehler.code ?? fehler.message})`)
      continue
    }

    // Gesperrte Skills (die grosse Mehrheit der Sammlungen) gehören nicht uns und
    // werden übersprungen — geprüft wird nur, was das Modell wirklich aufrufen kann.
    if (/disable-model-invocation:\s*'?true'?/.test(inhalt)) { uebersprungen += 1; continue }
    geprueft += 1

    // Frontmatter
    const teile = inhalt.split(/^---\s*$/m)
    if (teile.length < 3) { kaputt.push(`${ordner}: kein vollständiges Frontmatter`); continue }
    const kopf = teile[1]
    const name = /^name:\s*(.+)$/m.exec(kopf)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    const beschreibung = /^description:\s*(.+)$/m.exec(kopf)?.[1]?.trim()
    if (name === undefined || name.length === 0) kaputt.push(`${ordner}: name fehlt`)
    if (beschreibung === undefined || beschreibung.length < 20) kaputt.push(`${ordner}: description fehlt oder zu kurz`)
    if (name !== undefined) {
      if (namen.has(name)) kaputt.push(`${ordner}: Name «${name}» doppelt (auch in ${namen.get(name)})`)
      else namen.set(name, ordner)
    }

    // Referenzierte Dateien müssen existieren — genau dieser Fehler blieb früher unentdeckt.
    // Ein Querverweis auf das Skript eines ANDEREN Skills ist zulässig und kein Fehler.
    for (const treffer of inhalt.matchAll(/(?<![\w/\\.-])(scripts\/[\w.-]+\.(?:mjs|js|ps1|sh)|references\/[\w./-]+|assets\/[\w./-]+)/g)) {
      const rel = treffer[1]
      if (existsSync(join(SKILLS, ordner, rel))) continue
      const woanders = eintraege.some(andere => andere !== ordner && existsSync(join(SKILLS, andere, rel)))
      if (woanders) continue
      kaputt.push(`${ordner}: verweist auf fehlende Datei ${rel}`)
    }
  }

  notiere('Skills', 'SKILL.md mit gültigem Frontmatter', kaputt.length === 0,
    kaputt.length === 0
      ? `${geprueft} aktive Skills geprüft, ${uebersprungen} gesperrte übersprungen`
      : kaputt.slice(0, 5).join(' | '),
    kaputt.length > 0 ? 'hoch' : 'mittel')
  return { geprueft, uebersprungen, kaputt }
}

/* ------------------------- 2) Werkzeuge prüfen --------------------------- */

async function pruefeWerkzeuge() {
  const cli = await befehl(process.execPath, [ANALYSE, 'check', '--json'], 120000)
  if (!cli.ok) {
    notiere('Werkzeuge', 'analyse --check läuft', false, cli.ausgabe.split('\n')[0], 'kritisch')
    return
  }
  notiere('Werkzeuge', 'analyse --check läuft', true, 'Fähigkeitsprüfung antwortet')
  let faehigkeiten = {}
  try { faehigkeiten = JSON.parse(cli.ausgabe) } catch { /* egal */ }
  for (const [name, wert] of Object.entries(faehigkeiten)) {
    if (name === 'hinweis' || typeof wert !== 'object' || wert === null) continue
    const vorhanden = wert.vorhanden === true
    notiere('Werkzeuge', `verfügbar: ${name}`, vorhanden, vorhanden ? (wert.version ?? 'ok') : 'fehlt', vorhanden ? 'mittel' : 'niedrig')
  }

  // Alle vier Modi müssen laufen — sonst ist der Skill nur Papier.
  const ziele = {
    codebase: [SKILLS],
    website: ['http://127.0.0.1:4180/'],
    logs: [join(SKILLS, 'analyse', 'README.md')],
    review: [SKILLS, '--umfang', 'dir'],
  }
  for (const [modus, argumente] of Object.entries(ziele)) {
    const r = await befehl(process.execPath, [ANALYSE, modus, ...argumente], 180000)
    const gut = r.ok && r.ausgabe.startsWith('#')
    notiere('Werkzeuge', `Modus ${modus}`, gut, gut ? 'Bericht erzeugt' : r.ausgabe.split('\n')[0], 'hoch')
  }
}

/* ------------------------ 3) Umgebung und Docker ------------------------- */

async function pruefeUmgebung() {
  const dockerBereit = await befehl(process.execPath, [join(SKILLS, 'analyse', 'scripts', 'docker-bereit.mjs'), '--status'], 60000)
  notiere('Umgebung', 'Docker-Bereitschaftsprüfung', dockerBereit.ok,
    dockerBereit.ausgabe.split('\n')[0], 'niedrig')

  const gitStatus = await befehl('git', ['-C', process.cwd(), 'status', '--porcelain'], 30000)
  if (gitStatus.ok) {
    const anzahl = gitStatus.ausgabe.split('\n').filter(z => z.trim().length > 0).length
    notiere('Umgebung', 'Git-Zustand lesbar', true, `${anzahl} offene Änderungen`)
  } else {
    notiere('Umgebung', 'Git-Zustand lesbar', true, 'kein Repository (kein Fehler)', 'niedrig')
  }
}

/* ---------------------------- 4) Projektstand ---------------------------- */

async function pruefeProjektstand() {
  // Nur die selbst gepflegten Skills prüfen — nicht die 2700 Fremd-Skills.
  const eigene = ['analyse', 'analyse-voll', 'self-improve', 'design-md']
  let dateien = 0
  let befunde = 0
  let kritisch = 0
  const fehler = []

  for (const skill of eigene) {
    const ordner = join(SKILLS, skill)
    if (!existsSync(ordner)) continue
    const review = await befehl(process.execPath, [ANALYSE, 'review', ordner, '--umfang', 'dir', '--json'], 120000)
    if (!review.ok) { fehler.push(`${skill}: ${review.ausgabe.split('\n')[0]}`); continue }
    try {
      const daten = JSON.parse(review.ausgabe)
      dateien += daten.geprueft
      befunde += daten.befunde.length
      kritisch += daten.zaehler.kritisch
    } catch (problem) { fehler.push(`${skill}: Ausgabe unlesbar (${problem.message})`) }
  }

  notiere('Projektstand', 'Review der eigenen Skills läuft', fehler.length === 0,
    fehler.length === 0 ? `${dateien} Dateien geprüft` : fehler.join(' | '), 'mittel')
  notiere('Projektstand', 'keine kritischen Befunde in den eigenen Skills', kritisch === 0,
    `${befunde} Befunde, davon ${kritisch} kritisch`, kritisch > 0 ? 'hoch' : 'mittel')
}

/* --------------------------------- Lauf ---------------------------------- */

async function main() {
  const start = Date.now()
  await pruefeSkills()
  await pruefeWerkzeuge()
  await pruefeUmgebung()
  await pruefeProjektstand()

  const bestanden = PRUEFUNGEN.filter(p => p.bestanden)
  const durchgefallen = PRUEFUNGEN.filter(p => !p.bestanden)
  const kritisch = durchgefallen.filter(p => p.schwere === 'kritisch')
  const ergebnis = {
    zeitpunkt: new Date().toISOString(),
    dauerSekunden: Math.round((Date.now() - start) / 1000),
    punkte: bestanden.length,
    gesamt: PRUEFUNGEN.length,
    note: `${bestanden.length}/${PRUEFUNGEN.length}`,
    kritischFehlgeschlagen: kritisch.length,
    gruppen: [...new Set(PRUEFUNGEN.map(p => p.gruppe))].map(g => ({
      gruppe: g,
      bestanden: PRUEFUNGEN.filter(p => p.gruppe === g && p.bestanden).length,
      gesamt: PRUEFUNGEN.filter(p => p.gruppe === g).length,
    })),
    offenePunkte: durchgefallen.map(p => ({ gruppe: p.gruppe, name: p.name, detail: p.detail, schwere: p.schwere })),
    alle: PRUEFUNGEN,
  }

  if (basisPfad !== null && existsSync(basisPfad)) {
    try {
      const alt = JSON.parse(await readFile(basisPfad, 'utf8'))
      ergebnis.vergleich = {
        vorher: alt.note,
        jetzt: ergebnis.note,
        differenz: ergebnis.punkte - alt.punkte,
        neuDurchgefallen: durchgefallen
          .filter(p => !(alt.alle ?? []).some(a => a.name === p.name && a.bestanden === false))
          .map(p => p.name),
      }
    } catch (fehler) {
      ergebnis.vergleich = { fehler: fehler.message }
    }
  }

  if (alsJson) {
    process.stdout.write(`${JSON.stringify(ergebnis, null, 2)}\n`)
  } else {
    process.stdout.write(`Selbsttest des Harness — ${ergebnis.note} (${ergebnis.dauerSekunden} s)\n\n`)
    for (const g of ergebnis.gruppen) process.stdout.write(`  ${g.gruppe.padEnd(14)} ${g.bestanden}/${g.gesamt}\n`)
    if (ergebnis.vergleich !== undefined) {
      process.stdout.write(`\n  Vergleich zur Basislinie: ${ergebnis.vergleich.vorher} → ${ergebnis.vergleich.jetzt}`
        + ` (${ergebnis.vergleich.differenz >= 0 ? '+' : ''}${ergebnis.vergleich.differenz})\n`)
    }
    if (durchgefallen.length > 0) {
      process.stdout.write('\nOffene Punkte:\n')
      for (const p of durchgefallen) process.stdout.write(`  [${p.schwere}] ${p.gruppe} / ${p.name}: ${p.detail}\n`)
    } else {
      process.stdout.write('\nAlle Prüfungen bestanden.\n')
    }
  }

  if (schreiben) {
    const ziel = join(process.cwd(), 'selbsttest-basis.json')
    await writeFile(ziel, JSON.stringify(ergebnis, null, 2))
    process.stdout.write(`\nBasislinie gespeichert: ${ziel}\n`)
  }

  process.exit(kritisch.length > 0 ? 1 : 0)
}

main().catch((fehler) => {
  process.stderr.write(`selbsttest.mjs: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
  process.exit(1)
})
