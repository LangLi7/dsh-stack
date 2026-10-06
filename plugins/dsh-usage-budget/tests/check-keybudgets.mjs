// Belegt, was die Anzeige für EINZELNE Budgets und für die SUMME liefert.
// Fall A: nur Einzelbudgets gesetzt (der übliche Fall) — wird die Summe gebildet?
// Fall B: zusätzlich ein globales Limit als Obergrenze gesetzt.
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const dir = mkdtempSync(join(tmpdir(), 'ub3-'))
process.env.DSH_HOME = dir

const mod = await import('../lib/index.js')
const { priceRecord } = await import('../lib/usage.js')
const { parseModelsDev } = await import('../lib/pricing.js')

const table = parseModelsDev({
  deepseek: { models: { 'deepseek-chat': { cost: { input: 1, output: 2 } } } },
  openrouter: { models: { 'x/y': { cost: { input: 1, output: 2 } } } },
  zai: { models: { 'glm-4.6': { cost: { input: 1, output: 2 } } } },
})

const NOW = Date.parse('2026-09-16T12:00:00Z')
const DAY = 86_400_000

// Drei Keys mit unterschiedlichem Verbrauch.
function recFor(provider, model, keyRef, cost, daysAgo) {
  return priceRecord(table, {
    time: NOW - daysAgo * DAY, provider, model, keyRef,
    usage: { inputTokens: cost * 1_000_000, outputTokens: 0 },
  })
}
const records = [
  recFor('deepseek-official', 'deepseek-chat', 'DEEPSEEK_API_KEY', 4.2, 1),
  recFor('openrouter', 'x/y', 'OPENROUTER_API_KEY', 11.0, 2),
  recFor('zai', 'glm-4.6', 'ZAI_API_KEY', 0.8, 3),
]

/** Tracker mit gegebener Budget-Konfiguration bauen. */
function trackerWith(budget) {
  const tracker = mod.createTracker({
    dataFile: join(dir, `t-${Math.random().toString(36).slice(2)}.json`),
    config: () => mod.toBudgetConfig(budget),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  })
  tracker.priceTable = table
  tracker.records = records.map(r => ({ ...r }))
  return tracker
}

const perKeyOnly = {
  warnPercent: 80,
  fetchBalance: false,
  keys: {
    DEEPSEEK_API_KEY: { limitUsd: 5 },
    OPENROUTER_API_KEY: { limitUsd: 20 },
    ZAI_API_KEY: { limitUsd: 3 },
  },
}

console.log('=== Fall A: nur Einzelbudgets gesetzt (5 + 20 + 3 = 28 erwartet) ===\n')
const a = trackerWith(perKeyOnly).summary(30)
console.log('Einzelne Keys:')
for (const s of a.keyStatus) {
  console.log('  ' + s.label.padEnd(22)
    + ' Budget=' + (s.limitUsd === null ? '—' : '$' + s.limitUsd.toFixed(2)).padStart(8)
    + '  verbraucht=' + ('$' + s.spentUsd.toFixed(2)).padStart(8)
    + '  Rest=' + (s.remainingUsd === null ? '—' : '$' + s.remainingUsd.toFixed(2)).padStart(8)
    + '  ' + (s.usedPercent === null ? '—' : Math.round(s.usedPercent) + '%'))
}
console.log('\nGesamt-Zeile:')
console.log('  Budget=' + (a.totalStatus.limitUsd === null ? '— (kein Limit)' : '$' + a.totalStatus.limitUsd.toFixed(2)))
console.log('  verbraucht=$' + a.totalStatus.spentUsd.toFixed(2))
console.log('  Rest=' + (a.totalStatus.remainingUsd === null ? '—' : '$' + a.totalStatus.remainingUsd.toFixed(2)))
const einzelSumme = 5 + 20 + 3
console.log('\n  Erwartete Summe der Einzelbudgets: $' + einzelSumme.toFixed(2))
console.log('  Wird sie gezeigt? ' + (a.totalStatus.limitUsd === einzelSumme ? 'JA' : 'NEIN — Lücke!' ))

console.log('\n\n=== Fall B: zusätzlich globales Limit 15 (Obergrenze) ===\n')
const b = trackerWith({ ...perKeyOnly, totalLimitUsd: 15 }).summary(30)
console.log('Gesamt-Budget=' + (b.totalStatus.limitUsd === null ? '—' : '$' + b.totalStatus.limitUsd.toFixed(2))
  + '  verbraucht=$' + b.totalStatus.spentUsd.toFixed(2)
  + '  Rest=' + (b.totalStatus.remainingUsd === null ? '—' : '$' + b.totalStatus.remainingUsd.toFixed(2))
  + '  ' + (b.totalStatus.usedPercent === null ? '' : Math.round(b.totalStatus.usedPercent) + '%'))
console.log('(globales Limit hat Vorrang vor der Summe — so bleibt es eine bewusste Obergrenze)')

console.log('\n=== Keys ohne Budget erscheinen trotzdem ===')
const c = trackerWith({ warnPercent: 80, fetchBalance: false, keys: { DEEPSEEK_API_KEY: { limitUsd: 5 } } }).summary(30)
for (const s of c.keyStatus) {
  console.log('  ' + s.label.padEnd(22) + (s.limitUsd === null ? 'kein Budget gesetzt' : 'Budget $' + s.limitUsd.toFixed(2))
    + '  verbraucht $' + s.spentUsd.toFixed(2))
}

rmSync(dir, { recursive: true, force: true })
