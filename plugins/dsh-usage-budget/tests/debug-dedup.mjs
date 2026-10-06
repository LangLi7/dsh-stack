// Debug: Welcher Datensatz bleibt nach der Dedup unbepreist?
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const mod = await import('../lib/index.js')
const dir = mkdtempSync(join(tmpdir(), 'ub-dbg-'))

const tracker = mod.createTracker({
  dataFile: join(dir, 'x.json'),
  config: () => mod.toBudgetConfig({ fetchBalance: false }),
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
})

const call = (provider, model, time) => ({
  provider, model, time, usage: { inputTokens: 1000, outputTokens: 100 },
})

for (let i = 0; i < 5; i++) {
  const t = 1_790_000_000_000 + i * 1000
  const c = tracker.record(call('crew', 'crew-1', t))
  const p = tracker.record(call('deepseek-official', 'deepseek-chat', t + 2))
  console.log(`Paar ${i + 1}: crew→${c ? c.provider + '/' + c.model + ' priced=' + c.priced : 'verworfen'}`
    + ` | deepseek→${p ? p.provider + '/' + p.model + ' priced=' + p.priced : 'verworfen'}`
    + ` | Datensätze=${tracker.records.length}`)
}

console.log('\nDatensätze im Speicher:')
for (const r of tracker.records) {
  console.log(`  ${r.provider}/${r.model} t=${r.time} in=${r.inputTokens} out=${r.outputTokens} cost=${r.cost} priced=${r.priced}`)
}
const s = tracker.summary(30)
console.log('\nsummary.requests =', s.requests, '| unpricedShare =', s.unpricedShare)
console.log('byKey:', s.byKey.map(k => k.id).join(', '))
console.log('byModel:', s.byModel.map(m => m.id).join(', '))
rmSync(dir, { recursive: true, force: true })
