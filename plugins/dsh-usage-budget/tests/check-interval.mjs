// Belegt, dass die Aktualisierungsrate einstellbar ist: Standard 60 s, gültige
// Werte werden übernommen, unsinnige abgelehnt, 0 heißt "nur manuell".
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'ub-interval-'))
process.env.DSH_HOME = dir

// ── Host-Plugin mit Attrappen laden und den RPC-Handler greifen ────────────
const channels = []
const settingsService = {
  get: () => ({}),
  register: () => ({ get: () => ({}), watch: () => () => {}, update: async () => {} }),
}
const ctx = {
  get: k => (k === 'settings' ? settingsService : undefined),
  inject: (deps, cb) => {
    if (typeof cb !== 'function') return
    cb(deps.includes('settings') ? { ...ctx, settings: settingsService } : ctx)
  },
  on: () => {},
  effect: fn => { fn() },
  logger: { warn: () => {} },
  connection: { rpc: { handle: (channel, handler, options) => { channels.push({ channel, handler, options }); return async () => {} } } },
}
const mod = await import('../lib/index.js')
mod.apply(ctx, { dataFile: join(dir, 'usage.json') })
const { handler } = channels[0]
const signal = new AbortController().signal

let pass = 0
let fail = 0
const check = (label, ok, detail) => {
  console.log('  ' + (ok ? 'OK   ' : 'FEHLER') + ' ' + label + (detail ? '  (' + detail + ')' : ''))
  ok ? pass++ : fail++
}

console.log('=== Standard ohne Vorgabe ===')
const c0 = await handler('config', {}, signal)
check('Standardrate ist 60 s', c0.value.refreshSeconds === 60, 'erhalten: ' + c0.value.refreshSeconds)

console.log('\n=== Gültige Werte übernehmen ===')
for (const seconds of [5, 10, 15, 30, 60, 300]) {
  const res = await handler('setInterval', { seconds }, signal)
  const c = await handler('config', {}, signal)
  check(seconds + ' s wird übernommen', res.ok === true && c.value.refreshSeconds === seconds,
    'config meldet ' + c.value.refreshSeconds)
}

console.log('\n=== 0 heißt "nur manuell" ===')
const zero = await handler('setInterval', { seconds: 0 }, signal)
const cZero = await handler('config', {}, signal)
check('0 wird angenommen und gemeldet', zero.ok === true && cZero.value.refreshSeconds === 0,
  'config meldet ' + cZero.value.refreshSeconds)

console.log('\n=== Unsinnige Werte ablehnen ===')
for (const bad of [-1, 99999, 'abc', null, undefined, Number.NaN]) {
  const res = await handler('setInterval', { seconds: bad }, signal)
  check('lehnt ' + JSON.stringify(bad) + ' ab', res.ok === false, res.ok ? 'wurde angenommen!' : res.error.message.slice(0, 60))
}

console.log('\n=== Nach Ablehnung bleibt die Rate gültig ===')
const cAfter = await handler('config', {}, signal)
check('Rate unverändert nach Fehlversuch', cAfter.value.refreshSeconds === 0, 'config meldet ' + cAfter.value.refreshSeconds)

console.log('\n=== Kein fester Abstand mehr im Aktualisierungspfad ===')
const { readFileSync } = await import('node:fs')
const index = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
check('Host kennt die Laufzeit-Vorgabe', index.includes('refreshOverrideSeconds'))
check('Host benutzt sie in refreshBalances', /seconds = this\.refreshOverrideSeconds/.test(index))
check('Host-Takt kurz genug für 5 s', index.includes('}, 2_000)'))
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
check('Client liest die Rate je Takt', client.includes('refreshSeconds === 0) return'))
check('Regler vorhanden', client.includes('Aktualisierungsintervall'))
check('Kein fest verdrahteter 10-s-Takt mehr', !client.includes('load(); }, 10000)'))

console.log('\n' + (fail === 0 ? 'Alle Prüfungen bestanden' : fail + ' Prüfung(en) fehlgeschlagen')
  + '  (' + pass + ' bestanden, ' + fail + ' fehlgeschlagen)')
rmSync(dir, { recursive: true, force: true })
process.exit(fail === 0 ? 0 : 1)
