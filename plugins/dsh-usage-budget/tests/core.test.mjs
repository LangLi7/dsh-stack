// Tests für Preis-Engine und Usage-Kern (Node-eigener Testrunner, keine Deps).
// Ausführen: node --test tests/
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeCost,
  emptyPriceTable,
  fetchPriceTable,
  isDeepseekPeak,
  lookupPrice,
  mapProviderId,
  parseModelsDev,
  peakMultiplier,
} from '../lib/pricing.js'

import {
  aggregate,
  budgetStatus,
  buildSummary,
  dailySeries,
  dayKey,
  fetchDeepseekBalance,
  fetchOpenrouterBalance,
  groupBy,
  priceRecord,
  resolveKeyRef,
} from '../lib/usage.js'

// ── Preise ──────────────────────────────────────────────────────────────────

test('mapProviderId bildet Routen auf models.dev-IDs ab', () => {
  assert.equal(mapProviderId('deepseek-official'), 'deepseek')
  assert.equal(mapProviderId('deepseek'), 'deepseek')
  assert.equal(mapProviderId('openrouter'), 'openrouter')
  assert.equal(mapProviderId('zai-coding-plan'), 'zai')
  assert.equal(mapProviderId('ollama-cloud'), 'ollama-cloud')
  // Unbekannte Route bleibt stehen, damit man sie in den Overrides findet.
  assert.equal(mapProviderId('voellig-unbekannt'), 'voellig-unbekannt')
})

test('DeepSeek-Peak liegt auf 01-04 und 06-10 UTC an Werktagen', () => {
  // Mittwoch, 02:00 UTC → Peak
  assert.equal(isDeepseekPeak(new Date('2026-09-16T02:00:00Z')), true)
  // Mittwoch, 07:30 UTC → Peak
  assert.equal(isDeepseekPeak(new Date('2026-09-16T07:30:00Z')), true)
  // Mittwoch, 05:00 UTC → Off-Peak (Lücke zwischen den Fenstern)
  assert.equal(isDeepseekPeak(new Date('2026-09-16T05:00:00Z')), false)
  // Mittwoch, 12:00 UTC → Off-Peak
  assert.equal(isDeepseekPeak(new Date('2026-09-16T12:00:00Z')), false)
  // Samstag, 02:00 UTC → Wochenende ist immer Off-Peak
  assert.equal(isDeepseekPeak(new Date('2026-09-19T02:00:00Z')), false)
  // Sonntag, 07:00 UTC → Off-Peak
  assert.equal(isDeepseekPeak(new Date('2026-09-20T07:00:00Z')), false)
})

test('peakMultiplier verdoppelt nur DeepSeek im Peak', () => {
  const peak = new Date('2026-09-16T02:00:00Z')
  const off = new Date('2026-09-16T12:00:00Z')
  assert.equal(peakMultiplier('deepseek-official', peak), 2)
  assert.equal(peakMultiplier('deepseek-official', off), 1)
  // Andere Provider haben keinen Peak-Tarif.
  assert.equal(peakMultiplier('openrouter', peak), 1)
})

test('parseModelsDev liest Kosten und markiert fehlendes cache_write', () => {
  const table = parseModelsDev({
    anthropic: {
      models: {
        'claude-sonnet-4-5': { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
      },
    },
    deepseek: {
      models: {
        'deepseek-flash': { cost: { input: 0.15, output: 0.6, cache_read: 0.003 } },
      },
    },
  })
  const sonnet = table.prices.get('anthropic/claude-sonnet-4-5')
  assert.equal(sonnet.input, 3)
  assert.equal(sonnet.cacheWrite, 3.75)
  assert.equal(sonnet.cacheWriteUnknown, false)

  // DeepSeek liefert kein cache_write: als "unbekannt" markiert, nicht als 0.
  const flash = table.prices.get('deepseek/deepseek-flash')
  assert.equal(flash.cacheWriteUnknown, true)
  assert.equal(flash.cacheRead, 0.003)
})

test('parseModelsDev überspringt Einträge ohne verwertbare Kosten', () => {
  const table = parseModelsDev({
    x: { models: { a: { cost: { input: 1 } }, b: { cost: { input: 1, output: 2 } }, c: {} } },
  })
  assert.equal(table.prices.has('x/a'), false)
  assert.equal(table.prices.has('x/b'), true)
  assert.equal(table.prices.has('x/c'), false)
})

test('lookupPrice findet exakte Route, Fallback und Override', () => {
  const table = parseModelsDev({
    deepseek: { models: { 'deepseek-flash': { cost: { input: 0.15, output: 0.6 } } } },
  })
  // Exakter Treffer über die Route.
  assert.equal(lookupPrice(table, 'deepseek-official', 'deepseek-flash').input, 0.15)
  // Unbekannte Route, aber bekanntes Modell → providerloser Fallback.
  assert.equal(lookupPrice(table, 'irgendeine-route', 'deepseek-flash').input, 0.15)
  // Override gewinnt.
  const overridden = lookupPrice(table, 'deepseek-official', 'deepseek-flash', {
    'deepseek/deepseek-flash': { input: 9 },
  })
  assert.equal(overridden.input, 9)
  assert.equal(overridden.output, 0.6)
  // Unbekanntes Modell → undefined.
  assert.equal(lookupPrice(table, 'deepseek-official', 'gibt-es-nicht'), undefined)
})

test('loadupPrice: Override per bloßer Modell-ID wirkt ebenfalls', () => {
  const table = emptyPriceTable()
  const price = lookupPrice(table, 'p', 'm', { m: { input: 1, output: 2 } })
  assert.equal(price.input, 1)
  assert.equal(price.output, 2)
})

test('computeCost summiert disjunkte Token-Buckets', () => {
  const price = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWriteUnknown: false }
  const cost = computeCost(price, {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 1_000_000,
  })
  assert.equal(Number(cost.input.toFixed(6)), 3)
  assert.equal(Number(cost.output.toFixed(6)), 15)
  assert.equal(Number(cost.cacheRead.toFixed(6)), 0.3)
  assert.equal(Number(cost.cacheWrite.toFixed(6)), 3.75)
  assert.equal(Number(cost.total.toFixed(6)), 22.05)
  assert.equal(cost.priced, true)
})

test('computeCost: unbekanntes Modell kostet 0 und meldet priced=false', () => {
  const cost = computeCost(undefined, { inputTokens: 1000, outputTokens: 1000 })
  assert.equal(cost.total, 0)
  assert.equal(cost.priced, false)
})

test('computeCost wendet den Peak-Faktor auf alle Buckets an', () => {
  const price = { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0, cacheWriteUnknown: true }
  const off = computeCost(price, { inputTokens: 1_000_000, outputTokens: 0 }, 1)
  const peak = computeCost(price, { inputTokens: 1_000_000, outputTokens: 0 }, 2)
  assert.equal(Number(off.total.toFixed(6)), 0.15)
  assert.equal(Number(peak.total.toFixed(6)), 0.3)
  assert.equal(peak.peakMultiplier, 2)
})

test('computeCost behandelt fehlende Cache-Felder als 0', () => {
  const price = { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, cacheWriteUnknown: false }
  const cost = computeCost(price, { inputTokens: 1_000_000, outputTokens: 0 })
  assert.equal(Number(cost.total.toFixed(6)), 1)
})

// ── Verbrauch & Budget ──────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-16T12:00:00Z')
const DAY = 86_400_000

/** Hilfsdatensatz. */
function rec(over = {}) {
  return {
    time: NOW,
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    keyRef: 'DEEPSEEK_API_KEY',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    priced: true,
    ...over,
  }
}

test('resolveKeyRef ordnet Routen Credential-Refs zu, ohne Werte zu kennen', () => {
  assert.equal(resolveKeyRef('deepseek-official'), 'DEEPSEEK_API_KEY')
  assert.equal(resolveKeyRef('openrouter'), 'OPENROUTER_API_KEY')
  assert.equal(resolveKeyRef('zai-coding-plan'), 'ZAI_API_KEY')
  // Aus den Provider-Settings gelesene Zuordnung hat Vorrang.
  assert.equal(resolveKeyRef('deepseek-official', { 'deepseek-official': 'MEIN_KEY' }), 'MEIN_KEY')
  // Unbekannt → Route als eigene Gruppe, damit nichts stillschweigend verschwindet.
  assert.equal(resolveKeyRef('exotisch'), 'exotisch')
})

test('aggregate filtert auf das Zeitfenster und summiert', () => {
  const records = [
    rec({ time: NOW - 1 * DAY, cost: 1, inputTokens: 10, outputTokens: 5 }),
    rec({ time: NOW - 40 * DAY, cost: 99, inputTokens: 1000 }), // außerhalb
    rec({ time: NOW - 2 * DAY, cost: 2, priced: false, inputTokens: 1 }),
  ]
  const agg = aggregate(records, 30, NOW)
  assert.equal(agg.requests, 2)
  assert.equal(agg.totalCostUsd, 3)
  assert.equal(agg.inputTokens, 11)
  assert.equal(agg.outputTokens, 5)
  assert.equal(agg.totalTokens, 16)
  assert.equal(Number(agg.unpricedShare.toFixed(4)), 0.5)
  assert.equal(agg.firstAt, NOW - 2 * DAY)
  assert.equal(agg.lastAt, NOW - 1 * DAY)
})

test('aggregate mit leerer Liste liefert Nullen', () => {
  const agg = aggregate([], 30, NOW)
  assert.equal(agg.requests, 0)
  assert.equal(agg.totalCostUsd, 0)
  assert.equal(agg.unpricedShare, 0)
  assert.equal(agg.firstAt, null)
  assert.equal(agg.lastAt, null)
})

test('groupBy gruppiert und sortiert nach Kosten', () => {
  const records = [
    rec({ keyRef: 'A', cost: 1 }),
    rec({ keyRef: 'B', cost: 5 }),
    rec({ keyRef: 'A', cost: 2, inputTokens: 7 }),
  ]
  const groups = groupBy(records, r => r.keyRef)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].id, 'B') // 5 vor 3
  assert.equal(groups[0].cost, 5)
  assert.equal(groups[1].id, 'A')
  assert.equal(groups[1].cost, 3)
  assert.equal(groups[1].requests, 2)
  assert.equal(groups[1].totalTokens, 7)
})

test('groupBy meldet den Anteil unbepreisbarer Aufrufe', () => {
  const groups = groupBy([
    rec({ keyRef: 'A', cost: 1, priced: true }),
    rec({ keyRef: 'A', cost: 0, priced: false }),
  ], r => r.keyRef)
  assert.equal(Number(groups[0].unpricedShare.toFixed(2)), 0.5)
})

test('dailySeries baut eine lückenlose Reihe der Fensterbreite', () => {
  const series = dailySeries([rec({ time: NOW, cost: 4, inputTokens: 3 })], 7, NOW)
  assert.equal(series.length, 7)
  assert.equal(series[6].day, dayKey(NOW))
  assert.equal(series[6].cost, 4)
  assert.equal(series[6].tokens, 3)
  // Leere Tage bleiben mit 0 erhalten (keine Lücken im Chart).
  assert.equal(series[0].cost, 0)
  assert.equal(series[0].requests, 0)
})

test('budgetStatus: kein Limit bedeutet keine Prozentwerte', () => {
  const status = budgetStatus('k', 'k', undefined, 12.5, undefined, 80)
  assert.equal(status.limitUsd, null)
  assert.equal(status.usedPercent, null)
  assert.equal(status.remainingUsd, null)
  assert.equal(status.warn, false)
  assert.equal(status.exceeded, false)
  assert.equal(status.balanceUsd, null)
  assert.equal(status.balanceSource, 'none')
})

test('budgetStatus warnt an der Schwelle und meldet Überschreitung', () => {
  const status = budgetStatus('k', 'k', { limitUsd: 10, warnPercent: 80 }, 8, undefined, 80)
  assert.equal(status.usedPercent, 80)
  assert.equal(status.warn, true) // Schwelle erreicht
  assert.equal(status.exceeded, false)
  assert.equal(status.remainingUsd, 2)

  const over = budgetStatus('k', 'k', { limitUsd: 10 }, 11.5, undefined, 80)
  assert.equal(over.exceeded, true)
  assert.equal(over.warn, true)
  assert.equal(Number(over.remainingUsd.toFixed(2)), -1.5)
})

test('budgetStatus: manuelles Guthaben hat Vorrang vor dem Provider-Wert', () => {
  const withManual = budgetStatus('k', 'k', { balanceUsd: 50 }, 0,
    { balanceUsd: 10, currency: 'USD', at: NOW }, 80)
  assert.equal(withManual.balanceUsd, 50)
  assert.equal(withManual.balanceSource, 'manual')

  const withProvider = budgetStatus('k', 'k', {}, 0,
    { balanceUsd: 10, currency: 'USD', at: NOW }, 80)
  assert.equal(withProvider.balanceUsd, 10)
  assert.equal(withProvider.balanceSource, 'provider')
})

test('budgetStatus behandelt limitUsd 0 als "kein Limit"', () => {
  const status = budgetStatus('k', 'k', { limitUsd: 0 }, 5, undefined, 80)
  assert.equal(status.limitUsd, null)
  assert.equal(status.exceeded, false)
})

test('priceRecord verbindet Preis, Peak-Regel und Datensatz', () => {
  const table = parseModelsDev({
    deepseek: { models: { 'deepseek-flash': { cost: { input: 0.15, output: 0.6, cache_read: 0.003 } } } },
  })
  // Off-Peak: 1M Input à 0.15 + 1M Output à 0.6
  const off = priceRecord(table, {
    time: Date.parse('2026-09-16T12:00:00Z'),
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    keyRef: 'DEEPSEEK_API_KEY',
    usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
  })
  assert.equal(Number(off.cost.toFixed(6)), 0.75)
  assert.equal(off.priced, true)
  assert.equal(off.keyRef, 'DEEPSEEK_API_KEY')

  // Peak (02:00 UTC, Mittwoch): doppelter Preis
  const peak = priceRecord(table, {
    time: Date.parse('2026-09-16T02:00:00Z'),
    provider: 'deepseek-official',
    model: 'deepseek-flash',
    keyRef: 'DEEPSEEK_API_KEY',
    usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
  })
  assert.equal(Number(peak.cost.toFixed(6)), 1.5)
})

test('priceRecord übernimmt den Aufrufzweck', () => {
  const record = priceRecord(emptyPriceTable(), {
    time: NOW, provider: 'p', model: 'm', keyRef: 'K',
    usage: { inputTokens: 1, outputTokens: 1 }, purpose: 'compaction',
  })
  assert.equal(record.purpose, 'compaction')
  assert.equal(record.priced, false)
})

test('buildSummary führt Gesamt-, Key- und Modellbudgets zusammen', () => {
  const table = parseModelsDev({
    deepseek: { models: { 'deepseek-flash': { cost: { input: 10, output: 10 } } } },
    openrouter: { models: { 'x/y': { cost: { input: 20, output: 20 } } } },
  })
  const records = [
    priceRecord(table, {
      time: NOW - DAY, provider: 'deepseek-official', model: 'deepseek-flash',
      keyRef: 'DEEPSEEK_API_KEY', usage: { inputTokens: 100_000, outputTokens: 0 },
    }), // 1.00 USD
    priceRecord(table, {
      time: NOW - 2 * DAY, provider: 'openrouter', model: 'x/y',
      keyRef: 'OPENROUTER_API_KEY', usage: { inputTokens: 100_000, outputTokens: 0 },
    }), // 2.00 USD
  ]

  const summary = buildSummary(
    records,
    {
      totalLimitUsd: 10,
      keys: { DEEPSEEK_API_KEY: { limitUsd: 0.5 }, OPENROUTER_API_KEY: { limitUsd: 5 } },
      models: { 'openrouter/x/y': { limitUsd: 1 } },
    },
    { source: 'models.dev', loadedAt: NOW, models: 2 },
    { DEEPSEEK_API_KEY: { balanceUsd: 7, currency: 'USD', at: NOW } },
    30,
    NOW,
  )

  assert.equal(Number(summary.totalCostUsd.toFixed(2)), 3)
  assert.equal(summary.requests, 2)
  assert.equal(summary.byKey.length, 2)
  assert.equal(summary.totalTokens, 200_000)

  // DeepSeek-Key: 1.00 von 0.50 → überschritten.
  const ds = summary.keyStatus.find(s => s.id === 'DEEPSEEK_API_KEY')
  assert.equal(ds.spentUsd, 1)
  assert.equal(ds.exceeded, true)
  assert.equal(ds.balanceUsd, 7)
  assert.equal(ds.balanceSource, 'provider')

  // OpenRouter-Key: 2.00 von 5 → nicht überschritten.
  const or = summary.keyStatus.find(s => s.id === 'OPENROUTER_API_KEY')
  assert.equal(or.exceeded, false)
  assert.equal(or.balanceSource, 'none')

  // Modellbudget ist ebenfalls vorhanden und überschritten.
  const model = summary.modelStatus.find(s => s.id === 'openrouter/x/y')
  assert.equal(model.exceeded, true)

  // Gesamt: 3.00 von 10, plus Summe der gemeldeten Guthaben (7).
  assert.equal(summary.totalStatus.limitUsd, 10)
  assert.equal(summary.totalStatus.exceeded, false)
  assert.equal(summary.totalStatus.balanceUsd, 7)
  assert.equal(summary.pricing.models, 2)
  assert.equal(summary.daily.length, 30)
})

test('buildSummary listet Keys ohne Limit aber mit Verbrauch trotzdem auf', () => {
  const records = [rec({ keyRef: 'UNBEKANNTER_KEY', cost: 3 })]
  const summary = buildSummary(records, {}, { source: 'x', loadedAt: NOW, models: 0 }, {}, 30, NOW)
  const row = summary.keyStatus.find(s => s.id === 'UNBEKANNTER_KEY')
  assert.ok(row, 'Key mit Verbrauch muss in der Anzeige erscheinen')
  assert.equal(row.limitUsd, null)
  assert.equal(row.spentUsd, 3)
})

test('buildSummary behandelt leere Datensätze ohne Fehler', () => {
  const summary = buildSummary([], { totalLimitUsd: 5 }, { source: 'unloaded', loadedAt: 0, models: 0 }, {}, 30, NOW)
  assert.equal(summary.totalCostUsd, 0)
  assert.equal(summary.requests, 0)
  assert.equal(summary.totalStatus.limitUsd, 5)
  assert.equal(summary.totalStatus.usedPercent, 0)
  assert.equal(summary.daily.length, 30)
})

// ── Balance-APIs (mit gefälschtem fetch) ────────────────────────────────────

test('fetchDeepseekBalance liest topped_up und bevorzugt USD', async () => {
  const fake = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' },
        { currency: 'USD', total_balance: '15.50', granted_balance: '5.00', topped_up_balance: '10.50' },
      ],
    }),
  })
  const result = await fetchDeepseekBalance('sk-test', fake)
  assert.equal(result.balanceUsd, 10.5)
  assert.equal(result.currency, 'USD')
  assert.match(result.detail, /topped-up/)
})

test('fetchDeepseekBalance fällt auf total_balance zurück, wenn topped_up fehlt', async () => {
  const fake = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ balance_infos: [{ currency: 'USD', total_balance: '3.25' }] }),
  })
  const result = await fetchDeepseekBalance('sk-test', fake)
  assert.equal(result.balanceUsd, 3.25)
})

test('fetchDeepseekBalance meldet HTTP-Fehler statt zu werfen', async () => {
  const fake = async () => ({ ok: false, status: 401, json: async () => ({}) })
  const result = await fetchDeepseekBalance('sk-bad', fake)
  assert.equal(result.balanceUsd, null)
  assert.equal(result.error, 'HTTP 401')
})

test('fetchDeepseekBalance fängt Netzwerkfehler ab', async () => {
  const fake = async () => { throw new Error('Netzwerk weg') }
  const result = await fetchDeepseekBalance('sk-test', fake)
  assert.equal(result.balanceUsd, null)
  assert.match(result.error, /Netzwerk weg/)
})

test('fetchOpenrouterBalance rechnet Credits minus Verbrauch', async () => {
  const fake = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { total_credits: 100.5, total_usage: 25.75 } }),
  })
  const result = await fetchOpenrouterBalance('sk-or-test', fake)
  assert.equal(Number(result.balanceUsd.toFixed(2)), 74.75)
})

test('fetchOpenrouterBalance erklärt den 403 eines Nicht-Management-Keys', async () => {
  const fake = async () => ({ ok: false, status: 403, json: async () => ({}) })
  const result = await fetchOpenrouterBalance('sk-or-normal', fake)
  assert.equal(result.balanceUsd, null)
  assert.match(result.error, /Management-Key/)
})

test('fetchPriceTable meldet Fehler als Quelle statt zu werfen', async () => {
  const fake = async () => ({ ok: false, status: 503, json: async () => ({}) })
  const table = await fetchPriceTable('https://example.invalid/api.json', 1000, fake)
  assert.equal(table.prices.size, 0)
  assert.match(table.source, /HTTP 503/)
})

test('fetchPriceTable normalisiert eine gültige Antwort', async () => {
  const fake = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ deepseek: { models: { m: { cost: { input: 1, output: 2 } } } } }),
  })
  const table = await fetchPriceTable('https://example.invalid/api.json', 1000, fake)
  assert.equal(table.prices.get('deepseek/m').output, 2)
  assert.equal(table.source, 'models.dev')
})
