// Prüft, was die API-Antwort über Einzelbudgets und die Summe liefert.
import { buildSummary, priceRecord } from '../lib/usage.js'
import { parseModelsDev } from '../lib/pricing.js'

const table = parseModelsDev({ deepseek: { models: { m: { cost: { input: 1, output: 2 } } } } })
const NOW = Date.parse('2026-09-16T12:00:00Z')

const rec = priceRecord(table, {
  time: NOW, provider: 'deepseek-official', model: 'm', keyRef: 'DEEPSEEK_API_KEY',
  usage: { inputTokens: 4_200_000, outputTokens: 0 },
})

// Nur ein Einzelbudget, kein globales Limit.
const s = buildSummary([rec], { warnPercent: 80, keys: { DEEPSEEK_API_KEY: { limitUsd: 5 } } },
  { source: 'x', loadedAt: 0, models: 1 }, {}, 30, NOW)

console.log('Einzelner Key:')
for (const k of s.keyStatus) {
  console.log('  ' + k.id + ': Budget $' + k.limitUsd + ' | verbraucht $' + k.spentUsd.toFixed(2)
    + ' | Rest $' + k.remainingUsd.toFixed(2) + ' | ' + Math.round(k.usedPercent) + '%'
    + (k.warn ? ' | WARNUNG' : ''))
}
console.log('Summen-Zeile:')
console.log('  Budget=' + (s.totalStatus.limitUsd === null ? '—' : '$' + s.totalStatus.limitUsd.toFixed(2))
  + ' | verbraucht=$' + s.totalStatus.spentUsd.toFixed(2)
  + ' | Rest=' + (s.totalStatus.remainingUsd === null ? '—' : '$' + s.totalStatus.remainingUsd.toFixed(2)))
console.log('\nSumme wird aus dem Einzelbudget gebildet:', s.totalStatus.limitUsd === 5 ? 'JA' : 'NEIN')

// Mehrere Keys: Summe muss addieren.
const multi = buildSummary([rec], {
  warnPercent: 80,
  keys: { DEEPSEEK_API_KEY: { limitUsd: 5 }, OPENROUTER_API_KEY: { limitUsd: 20 }, ZAI_API_KEY: { limitUsd: 3 } },
}, { source: 'x', loadedAt: 0, models: 1 }, {}, 30, NOW)
console.log('\nDrei Keys (5 + 20 + 3):')
console.log('  Keys mit Budget:', multi.keyStatus.filter(k => k.limitUsd !== null).length, 'von', multi.keyStatus.length)
console.log('  Summen-Budget: $' + multi.totalStatus.limitUsd.toFixed(2), multi.totalStatus.limitUsd === 28 ? '(korrekt)' : '(FALSCH)')
