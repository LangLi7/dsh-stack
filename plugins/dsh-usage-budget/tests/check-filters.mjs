// Prüft die neuen Fähigkeiten: Kostenanteile, Filter, Zeitreihe, Facetten, CSV.
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'ub2-'))
process.env.DSH_HOME = dir

const mod = await import('../lib/index.js')
const { priceRecord, filterRecords, buildTimeseries, groupBy } = await import('../lib/usage.js')
const { parseModelsDev } = await import('../lib/pricing.js')

const table = parseModelsDev({
  deepseek: { models: { 'deepseek-flash': { cost: { input: 1, output: 2, cache_read: 0.5 } } } },
  openrouter: { models: { 'x/y': { cost: { input: 10, output: 20 } } } },
})

const NOW = Date.parse('2026-09-16T12:00:00Z') // Mittag UTC = Off-Peak
const DAY = 86_400_000

// Kostenanteile müssen im Datensatz landen.
const rec = priceRecord(table, {
  time: NOW, provider: 'deepseek-official', model: 'deepseek-flash', keyRef: 'DEEPSEEK_API_KEY',
  usage: { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000 },
})
console.log('Kostenanteile: input=' + rec.costInput.toFixed(2), 'output=' + rec.costOutput.toFixed(2), 'cacheRead=' + rec.costCacheRead.toFixed(2))
console.log('Summe stimmt:', Math.abs((rec.costInput + rec.costOutput + rec.costCacheRead + rec.costCacheWrite) - rec.cost) < 1e-9)

// Filter nach Zeitfenster, Key und Modell.
const records = [
  { ...rec, time: NOW - 1 * DAY },
  { ...rec, time: NOW - 40 * DAY, keyRef: 'ALT' },
  priceRecord(table, { time: NOW - 2 * DAY, provider: 'openrouter', model: 'x/y', keyRef: 'OPENROUTER_API_KEY', usage: { inputTokens: 1_000_000, outputTokens: 0 } }),
]
console.log('\nalle:', records.length)
console.log('30 Tage:', filterRecords(records, { days: 30, now: NOW }).length, '(erwartet 2)')
console.log('nur DEEPSEEK_API_KEY:', filterRecords(records, { days: 30, keyRef: 'DEEPSEEK_API_KEY', now: NOW }).length, '(erwartet 1)')
console.log('nur openrouter/x/y:', filterRecords(records, { days: 30, model: 'openrouter/x/y', now: NOW }).length, '(erwartet 1)')
console.log('Filter "all" ignoriert:', filterRecords(records, { days: 30, keyRef: 'all', model: 'all', now: NOW }).length, '(erwartet 2)')

// Zeitreihe nach Modell und nach Key.
const byModel = buildTimeseries(filterRecords(records, { days: 30, now: NOW }), { groupBy: 'model', days: 30, now: NOW })
console.log('\nZeitreihe nach Modell: Gruppen =', byModel.groups.join(' | '))
console.log('Tage:', byModel.days.length, '| letzter Tag Kosten:', byModel.days[29].cost.toFixed(2))
const lastDayGroups = Object.keys(byModel.days[29].groups)
console.log('Gruppen im ersten belegten Tag:', lastDayGroups.join(',') || '(leer)')

const byKey = buildTimeseries(filterRecords(records, { days: 30, now: NOW }), { groupBy: 'key', days: 30, now: NOW })
console.log('Zeitreihe nach Key: Gruppen =', byKey.groups.join(' | '))

// Gruppierung trägt die Kostenanteile für das Stapeln.
const groups = groupBy(filterRecords(records, { days: 30, now: NOW }), r => r.keyRef)
console.log('\nGruppen:', groups.map(g => `${g.id}: cost=${g.cost.toFixed(2)} in=${g.costInput.toFixed(2)} out=${g.costOutput.toFixed(2)}`).join(' | '))

// Tracker: Facetten und CSV-Export.
const tracker = mod.createTracker({
  dataFile: join(dir, 't.json'),
  config: () => mod.toBudgetConfig({ totalLimitUsd: 5, warnPercent: 50 }),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
})
tracker.priceTable = table
for (const r of records) tracker.records.push(r)

const facets = tracker.facets(30)
console.log('\nFacetten Keys:', facets.keys.map(k => `${k.id}($${k.cost.toFixed(2)})`).join(', '))
console.log('Facetten Modelle:', facets.models.map(m => m.id).join(', '))

const csv = tracker.exportCsv({ days: 30 })
const lines = csv.split('\n')
console.log('\nCSV Zeilen:', lines.length, '(1 Kopfzeile + 2 Datensätze)')
console.log('CSV Kopf:', lines[0])
console.log('CSV erste Zeile:', lines[1])

// Übersicht mit Filter.
const s = tracker.summary(30)
console.log('\nÜbersicht: Kosten=' + s.totalCostUsd.toFixed(2), 'Anfragen=' + s.requests, '| Limit=' + s.totalStatus.limitUsd, '| warn(50%)=' + s.totalStatus.warn)

// Optionale Sperre ist standardmäßig AUS.
console.log('\nSperre aktiviert?', tracker.budgetCheck().blocked, '(erwartet false, da blockOnExhausted nicht gesetzt)')
const blocking = mod.createTracker({
  dataFile: join(dir, 't2.json'),
  config: () => mod.toBudgetConfig({ totalLimitUsd: 1, blockOnExhausted: true }),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
})
blocking.priceTable = table
for (const r of records) blocking.records.push(r)
const check = blocking.budgetCheck()
console.log('Sperre bei blockOnExhausted=true:', check.blocked, '|', check.reason)

rmSync(dir, { recursive: true, force: true })
