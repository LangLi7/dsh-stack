// dsh-ponytail — der Schalter selbst, ohne Cordis und ohne Seiteneffekte beim
// Import. Alles hier ist rein: Text rein, Text raus, Zustand rein, Zustand raus.
// Der Host-Teil (lib/index.js) verdrahtet das nur mit RPC, Command und Dateisystem.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Die beiden Frontmatter-Schlüssel, die das Harness liest. Beide werden immer
 * explizit geschrieben, damit die Datei den Zustand selbst belegt und nicht
 * durch Abwesenheit raten lässt.
 * @see packages/skill/skill-filesystem/README.md
 */
export const GATE_KEYS = ['disable-model-invocation', 'user-invocable']

/** Namenspräfix, das ein Skill als zu dieser Familie gehörend ausweist. */
export const SKILL_PREFIX = 'ponytail'

/**
 * Das Harness-Heim, aufgelöst wie das Harness selbst es tut: `$DSH_HOME`, dann
 * `~/.dsh`. Nichts hier ist einkompiliert — dasselbe Plugin muss auf jedem
 * Rechner auf die Skills zeigen, die dort tatsächlich liegen.
 * @returns absoluter Pfad des Harness-Heims.
 */
export function resolveDshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.dsh')
}

/**
 * Die Wurzel der geteilten Agent-Konfiguration: `$DSH_AGENTS_HOME`, dann
 * `~/.agents`. DSH liest `agentsHome/skills` als eigene Skill-Wurzel.
 * @returns absoluter Pfad des Agent-Heims.
 */
export function resolveAgentsHome() {
  const configured = process.env.DSH_AGENTS_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  return join(homedir(), '.agents')
}

/**
 * Skill-Wurzeln, die DSH nach Skills absucht (Reihenfolge = Suchreihenfolge).
 * @returns die beiden Wurzeln des laufenden Harness.
 */
export function defaultSkillRoots() {
  return [
    join(resolveAgentsHome(), 'skills'),
    join(resolveDshHome(), 'skills'),
  ]
}

/**
 * Zustandsdatei: die einzige Quelle der Wahrheit für den Schalter.
 * @returns absoluter Pfad der Zustandsdatei im laufenden Harness-Heim.
 */
export function defaultStateFile() {
  return join(resolveDshHome(), 'ponytail.json')
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/

/**
 * Setzt die beiden Aufruf-Schlüssel im YAML-Frontmatter auf den gewünschten
 * Zustand. Nur Zeilen, die auf Spaltenposition 0 beginnen, werden ersetzt:
 * Block-Skalare wie `description: >` rücken ihren Inhalt ein und können so
 * niemals versehentlich getroffen werden.
 * @param source - vollständiger Inhalt einer SKILL.md.
 * @param enabled - true lässt beide Oberflächen zu, false sperrt beide.
 * @returns der neue Inhalt, oder der unveränderte, wenn schon alles stimmt.
 * @throws wenn die Datei kein Frontmatter hat — dann wird nicht geschrieben.
 */
export function applyGate(source, enabled) {
  const match = FRONTMATTER.exec(source)
  if (match === null) throw new Error('SKILL.md ohne YAML-Frontmatter')
  const wanted = enabled
    ? ['disable-model-invocation: false', 'user-invocable: true']
    : ['disable-model-invocation: true', 'user-invocable: false']
  const kept = match[1]
    .split('\n')
    .filter(line => !GATE_KEYS.some(key => line.startsWith(`${key}:`)))
  // Leerzeilen am Blockende fallen weg, damit wiederholtes Schreiben idempotent
  // ist und nicht bei jedem Aufruf eine neue Leerzeile anhängt.
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop()
  const next = `---\n${[...kept, ...wanted].join('\n')}\n---${source.slice(match[0].length)}`
  return next === source ? source : next
}

/**
 * Liest den im Frontmatter belegten Zustand, ohne ihn zu verändern.
 * @param source - vollständiger Inhalt einer SKILL.md.
 * @returns true/false, oder undefined wenn kein Schlüssel den Zustand nennt.
 */
export function readGate(source) {
  const match = FRONTMATTER.exec(source)
  if (match === null) return undefined
  const line = match[1].split('\n').find(entry => entry.startsWith('disable-model-invocation:'))
  if (line === undefined) return undefined
  const value = line.slice('disable-model-invocation:'.length).trim().toLowerCase()
  return value === 'false' || value === 'no' || value === 'off' || value === '0'
}

/**
 * Findet alle Ponytail-Skill-Verzeichnisse unter den Wurzeln — direkte Kinder
 * namens `ponytail*`, die eine SKILL.md enthalten. DSH liest nur direkte
 * Kinder einer Wurzel, deshalb wird hier genauso wenig rekursiert.
 * @param roots - zu durchsuchende Skill-Wurzeln.
 * @returns absolute Pfade der SKILL.md-Dateien, sortiert.
 */
export function findSkillFiles(roots = defaultSkillRoots()) {
  const found = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(SKILL_PREFIX)) continue
      const file = join(root, entry.name, 'SKILL.md')
      if (existsSync(file)) found.push(file)
    }
  }
  return found.sort()
}

/**
 * Wendet den Schalter auf alle gefundenen Skills an.
 * @param enabled - Zielzustand.
 * @param roots - Skill-Wurzeln (Default: {@link defaultSkillRoots}).
 * @returns pro Datei, was passiert ist — `changed` nennt den alten Zustand.
 */
export function writeGate(enabled, roots = defaultSkillRoots()) {
  const results = []
  for (const file of findSkillFiles(roots)) {
    const before = readFileSync(file, 'utf8')
    const after = applyGate(before, enabled)
    if (after !== before) writeFileSync(file, after, 'utf8')
    results.push({
      file,
      skill: file.split(/[\\/]/).slice(-2)[0],
      changed: after !== before,
      was: readGate(before),
    })
  }
  return results
}

/**
 * Fasst den Zustand auf der Platte zusammen: was der Schalter sagt und was die
 * Skills tatsächlich belegen. Beide können auseinanderlaufen, wenn jemand von
 * Hand an einer SKILL.md editiert — dann gewinnt die Datei, und `drift` sagt es.
 * @param stateFile - Pfad der Zustandsdatei.
 * @param roots - Skill-Wurzeln.
 * @returns der Statusbericht für RPC, Command und Chip.
 */
export function readStatus(stateFile = defaultStateFile(), roots = defaultSkillRoots()) {
  let enabled
  let updatedAt
  if (existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
      enabled = typeof parsed.enabled === 'boolean' ? parsed.enabled : undefined
      updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined
    } catch {
      enabled = undefined
    }
  }
  const files = findSkillFiles(roots)
  const gates = files.map(file => ({ skill: file.split(/[\\/]/).slice(-2)[0], file, gate: readGate(readFileSync(file, 'utf8')) })
  )
  const onDisk = gates.length > 0 && gates.every(entry => entry.gate === true)
  const offDisk = gates.length > 0 && gates.every(entry => entry.gate === false)
  const effective = onDisk ? true : offDisk ? false : undefined
  return {
    // Was wirklich gilt, ist der Zustand auf der Platte — er ist es, was das
    // Harness beim Einlesen der Skills liest.
    enabled: effective ?? enabled ?? false,
    effective,
    persisted: enabled,
    drift: enabled !== undefined && effective !== undefined && enabled !== effective,
    updatedAt,
    stateFile,
    roots,
    skills: gates.map(entry => ({ skill: entry.skill, file: entry.file, enabled: entry.gate ?? null })),
  }
}

/**
 * Schreibt den Zustand: erst die Skills, dann die Zustandsdatei. Die
 * Reihenfolge ist Absicht — bricht es dazwischen ab, ist der sichtbare Effekt
 * bereits eingetreten und `drift` meldet die Abweichung, statt dass eine
 * Zustandsdatei einen Zustand behauptet, den keine Datei belegt.
 * @param enabled - Zielzustand.
 * @param options - Zustandsdatei und Skill-Wurzeln.
 * @returns der Statusbericht nach dem Schreiben.
 */
export function setEnabled(enabled, options = {}) {
  const stateFile = options.stateFile ?? defaultStateFile()
  const roots = options.roots ?? defaultSkillRoots()
  const results = writeGate(enabled, roots)
  writeFileSync(
    stateFile,
    `${JSON.stringify({ enabled, updatedAt: new Date().toISOString(), skills: results.map(r => r.skill) }, null, 2)}\n`,
    'utf8',
  )
  return { ...readStatus(stateFile, roots), results }
}
