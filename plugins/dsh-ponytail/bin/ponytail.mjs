#!/usr/bin/env node
// ponytail — der Schalter von der Kommandozeile.
//
// Derselbe Weg wie der Chip im Composer: dieselben zwei Funktionen aus
// lib/gate.js. Nur ohne Harness, damit der Schalter auch dann funktioniert,
// wenn gerade kein Plugin geladen ist.

import { defaultSkillRoots, defaultStateFile, readStatus, setEnabled } from '../lib/gate.js'

const USAGE = `ponytail — Ponytail-Skills an- oder ausschalten

  ponytail            Zustand zeigen
  ponytail on         Ponytail einschalten
  ponytail off        ausschalten ("arbeite ohne Ponytail")
  ponytail toggle     umschalten
  ponytail --json     Zustand als JSON

Wirkung: schreibt disable-model-invocation / user-invocable im Frontmatter
der Ponytail-Skills. Das Harness liest diese Schluessel selbst und zieht die
Aenderung ueber seinen Dateiwatcher ohne Neustart nach.
`

/** Zielzustand aus dem Argument lesen; `toggle` braucht den Ist-Zustand. */
function target(argument, current) {
  switch ((argument ?? '').toLowerCase()) {
    case 'on': case 'an': case 'true': case '1': return true
    case 'off': case 'aus': case 'false': case '0': return false
    case 'toggle': case 'umschalten': return !current
    default: return undefined
  }
}

const [argument] = process.argv.slice(2)

if (argument === '--help' || argument === '-h') {
  process.stdout.write(USAGE)
  process.exit(0)
}

const wanted = argument === undefined || argument === '' ? undefined : target(argument, readStatus().enabled)

if (argument !== undefined && argument !== '' && wanted === undefined) {
  process.stderr.write(`Unbekanntes Argument "${argument}". Erlaubt: on, off, toggle.\n`)
  process.exit(2)
}

const report = wanted === undefined ? readStatus() : setEnabled(wanted)

if (argument === '--json') {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(0)
}

const state = report.enabled ? 'AN' : 'AUS'
process.stdout.write(`Ponytail ist ${state}${report.enabled ? '' : ' — arbeite ohne Ponytail'}.\n`)
process.stdout.write(`Skills (${report.skills.length}):\n`)
for (const skill of report.skills) {
  process.stdout.write(`  ${skill.enabled === true ? 'an ' : skill.enabled === false ? 'aus' : '?  '}  ${skill.skill}\n`)
}
if (report.skills.length === 0) {
  process.stdout.write(`  keine gefunden. Wurzeln: ${defaultSkillRoots().join(', ')}\n`)
}
if (report.drift) {
  process.stdout.write(`Hinweis: Zustandsdatei (${report.persisted ? 'an' : 'aus'}) und Dateien (${report.effective ? 'an' : 'aus'}) liefen auseinander; die Dateien gelten.\n`)
}
process.stdout.write(`Zustandsdatei: ${defaultStateFile()}\n`)
