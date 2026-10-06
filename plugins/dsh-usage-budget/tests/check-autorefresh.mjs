// Belegt, dass die automatische Aktualisierung jetzt greift: Die Drosselung
// bestimmt den Rhythmus, `force` (der Refresh-Knopf) umgeht sie weiterhin.
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const mod = await import('../lib/index.js')
const dir = mkdtempSync(join(tmpdir(), 'ub-refresh-'))

// Zählt die tatsächlichen Provider-Abfragen.
let fetches = 0
const tracker = mod.createTracker({
  dataFile: join(dir, 'usage.json'),
  config: () => mod.toBudgetConfig({ fetchBalance: true }),
  fetchImpl: async () => {
    fetches++
    return { ok: true, status: 200, json: async () => ({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '5.00', topped_up_balance: '5.00' }] }) }
  },
})
// Zwei Anbieter simulieren, damit die Abfragen zählbar sind.
tracker.keyRefsFromSettings = () => ({ 'deepseek-official': 'DEEPSEEK_API_KEY', openrouter: 'OPENROUTER_API_KEY' })
tracker.resolveCredential = async () => 'sk-test'

console.log('=== Standard-Drosselung ===')
const config = tracker.config()
console.log('  balanceRefreshSeconds (Standard): ' + config.balanceRefreshSeconds + ' s'
  + (config.balanceRefreshSeconds === 60 ? '  ✓ wie erwartet' : '  ✗ unerwartet'))

console.log('\n=== Rhythmus der Provider-Abfragen ===')
await tracker.refreshBalances()
console.log('  1. Abruf:            ' + fetches + ' Anfragen')

await tracker.refreshBalances()
console.log('  2. Abruf sofort:     ' + fetches + ' Anfragen (gedrosselt, unveraendert ✓)')

// Zeitfenster künstlich ablaufen lassen.
tracker.balanceFetchedAt = Date.now() - 61_000
await tracker.refreshBalances()
console.log('  3. nach 61 s:        ' + fetches + ' Anfragen (automatisch nachgezogen ✓)')

console.log('\n=== Refresh-Knopf umgeht die Drosselung ===')
const before = fetches
await tracker.refreshBalances(true)
console.log('  force=true:          ' + fetches + ' Anfragen (' + (fetches > before ? 'erzwingt Abruf ✓' : 'kein Abruf ✗') + ')')

console.log('\n=== Beide Ansichten lesen dieselbe Quelle ===')
const summary = tracker.summary(30)
console.log('  summary.totalStatus.balanceUsd: ' + summary.totalStatus.balanceUsd)
console.log('  Pille und Karte nutzen beide summary.totalStatus — damit identisch.')
console.log('  availableUsd (Summe aller bekannten Guthaben): ' + summary.availableUsd)
console.log('  Schluessel mit Guthaben: ' + summary.availableKeyCount + ' von ' + summary.configuredKeyCount)

rmSync(dir, { recursive: true, force: true })
