// Rauchtest des Host-Plugins: Plugin laden, Verbrauch aufzeichnen, den
// RPC-Handler aufrufen und die Antwort prüfen. Läuft ohne Harness.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'ub-'))
process.env.DSH_HOME = dir

const registrations = { events: [], channels: [] }
const settingsValue = {
  totalLimitUsd: 10,
  warnPercent: 80,
  fetchBalance: false,
  keys: { DEEPSEEK_API_KEY: { limitUsd: 5, warnPercent: 50 } },
  models: {},
}

const settingsService = {
  get: ns => (ns === 'llm-deepseek' ? { apiKeyEnv: 'DEEPSEEK_API_KEY' } : {}),
  register: () => ({ get: () => settingsValue, watch: () => () => {}, update: async () => {} }),
}

function makeCtx() {
  const ctx = {
    get: k => (k === 'settings' ? settingsService : k === 'credentials' ? { resolve: async () => ({ value: 'sk-test' }) } : undefined),
    // installSettingsSection injiziert ['settings'] und ruft den Callback mit
    // einem Kontext auf, der den Settings-Dienst trägt.
    inject: (deps, cb) => {
      if (typeof cb !== 'function') return
      cb(deps.includes('settings') ? { ...ctx, settings: settingsService } : ctx)
    },
    on: (ev, handler) => { registrations.events.push({ ev, handler }) },
    effect: fn => { fn() },
    logger: { warn: m => console.log('[warn]', m) },
    connection: {
      rpc: {
        handle: (channel, handler, options) => {
          registrations.channels.push({ channel, handler, options })
          return async () => {}
        },
      },
    },
  }
  return ctx
}

const mod = await import('../lib/index.js')

// ── Teil 1: Verdrahtung des Host-Teils ─────────────────────────────────────
const ctx = makeCtx()
mod.apply(ctx, { dataFile: join(dir, 'usage.json') })

console.log('events:', registrations.events.map(e => e.ev).join(','))
console.log('channels:', registrations.channels.map(c => `${c.channel}:${c.options.authority}`).join(','))

// ── Teil 2: Kostenrechnung gegen einen echten Preiskatalog ─────────────────
// Der Tracker wird direkt gebaut (createTracker), damit die Preise vor der
// Aufzeichnung geladen sind; im Betrieb lädt der Host sie beim Start nach.
const catalog = {
  deepseek: {
    models: {
      'deepseek-flash': { cost: { input: 0.15, output: 0.6, cache_read: 0.003 } },
    },
  },
}
// Abendzeit UTC (kein Peak) und Peak-Zeit für denselben Aufruf.
const OFF_PEAK = Date.parse('2026-09-16T12:00:00Z')
const PEAK = Date.parse('2026-09-16T02:00:00Z')

const tracker = mod.createTracker({
  dataFile: join(dir, 'tracker.json'),
  config: () => mod.toBudgetConfig(settingsValue),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => catalog }),
})
await tracker.start({ withBalance: false })
console.log('\nPreise geladen:', tracker.summary().pricing.models, 'Modelle aus', tracker.summary().pricing.source)

const offPeak = tracker.record({
  time: OFF_PEAK, provider: 'deepseek-official', model: 'deepseek-flash',
  usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
})
const peak = tracker.record({
  time: PEAK, provider: 'deepseek-official', model: 'deepseek-flash',
  usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
})
console.log('Off-Peak-Kosten:', offPeak.cost.toFixed(4), '(erwartet 0.7500)')
console.log('Peak-Kosten:   ', peak.cost.toFixed(4), '(erwartet 1.5000 = doppelter Tarif)')
console.log('bepreisbar:', offPeak.priced, '| Key-Zuordnung:', offPeak.keyRef)

// Aufruf ohne Token-Angabe wird verworfen, nicht als Nullzeile gezählt.
const nothing = tracker.record({
  time: OFF_PEAK, provider: 'deepseek-official', model: 'deepseek-flash', usage: {},
})
console.log('Aufruf ohne Tokens verworfen:', nothing === undefined)

// ── Teil 3: Aufzeichnung über den Waterfall ────────────────────────────────
// Der Waterfall des Host-Teils wird mit demselben Tracker-Modul verdrahtet;
// hier zählt, dass er die Chunks unverändert durchreicht.
const streamHandler = registrations.events.find(e => e.ev === 'llm/stream').handler
const chunks = [
  { type: 'text-delta', index: 0, text: 'hi' },
  { type: 'usage', usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 } },
  { type: 'finish', reason: { kind: 'stop' } },
]
async function* source() { for (const c of chunks) yield c }

const seen = []
for await (const c of streamHandler({ provider: 'unbekannt', model: 'gibt-es-nicht' }, () => source())) seen.push(c.type)
console.log('\ndurchgereichte Chunks:', seen.join(','), '(erwartet: text-delta,usage,finish)')

// ── Teil 4: Übersicht und RPC-Antwort ─────────────────────────────────────
const channel = registrations.channels[0]
const summary = await channel.handler('summary', {}, new AbortController().signal)

const v = tracker.summary()
console.log('\nKosten gesamt USD:', v.totalCostUsd.toFixed(4), '(0.75 + 1.50 = 2.25)')
console.log('Anfragen:', v.requests, '| Tokens:', v.totalTokens)
console.log('unpricedShare:', v.unpricedShare.toFixed(2), '(0 = alle Modelle bekannt)')
console.log('Gesamtlimit:', v.totalStatus.limitUsd, '| verbraucht:', v.totalStatus.spentUsd.toFixed(2), '| exceeded:', v.totalStatus.exceeded)
const ds = v.keyStatus.find(s => s.id === 'DEEPSEEK_API_KEY')
console.log('Key-Zeile:', ds.id, '| Limit:', ds.limitUsd, '| verbraucht:', ds.spentUsd.toFixed(2), '| usedPercent:', ds.usedPercent.toFixed(1), '| warn (>50%):', ds.warn)
console.log('Modellzeilen:', v.byModel.map(m => `${m.id}=${m.cost.toFixed(2)}`).join(', '))
console.log('Tagespunkte:', v.daily.length, '| Preismodelle:', v.pricing.models)

console.log('\nRPC-Antwort ok:', summary.ok)
const bad = await channel.handler('nonsense', {}, new AbortController().signal)
console.log('unbekannter Endpunkt -> ok:', bad.ok, '| code:', bad.error?.code)

rmSync(dir, { recursive: true, force: true })
