// Sichert die Duplikat-Erkennung ab: Die Crew-Hülle umschließt denselben
// Modellaufruf und darf die Statistik weder verdoppeln noch unbepreist machen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const mod = await import('../lib/index.js')
const { parseModelsDev } = await import('../lib/pricing.js')

/** Preistabelle, damit die Dedup-Prüfung nicht an fehlenden Preisen scheitert. */
const PRICES = parseModelsDev({
  deepseek: { models: { 'deepseek-chat': { cost: { input: 1, output: 2 } } } },
})

/** Tracker mit eigener Datei, geladenen Preisen und fester Budget-Konfiguration. */
function makeTracker(dir, name) {
  const tracker = mod.createTracker({
    dataFile: join(dir, name),
    config: () => mod.toBudgetConfig({ fetchBalance: false }),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  })
  tracker.priceTable = PRICES
  return tracker
}

/** Ein Aufruf, wie ihn der Waterfall liefert. */
const call = (provider, model, over = {}) => ({
  provider, model, time: 1_790_000_000_000, usage: { inputTokens: 1000, outputTokens: 100 }, ...over,
})

test('Crew-Hülle nach der Provider-Route wird verworfen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'a.json')
    // Crew meldet zuerst (kürzere Laufzeit), dann die echte Provider-Route.
    tracker.record(call('crew', 'crew-1', { time: 1_790_000_000_000 }))
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_000_001 }))
    assert.equal(tracker.records.length, 1, 'nur ein Datensatz für einen Aufruf')
    assert.equal(tracker.records[0].provider, 'deepseek-official', 'die bepreisbare Route bleibt')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Crew-Hülle vor der Provider-Route wird von ihr ersetzt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'b.json')
    // Provider meldet zuerst, die Crew-Hülle trifft danach ein.
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_000_000 }))
    tracker.record(call('crew', 'crew-1', { time: 1_790_000_000_002 }))
    assert.equal(tracker.records.length, 1)
    assert.equal(tracker.records[0].provider, 'deepseek-official', 'die Hülle verdrängt die echte Route nicht')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Zwei echte Aufrufe mit gleichen Token-Zahlen bleiben getrennt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'c.json')
    // Gleiche Token-Zahlen, aber zeitlicher Abstand: echte Wiederholungen.
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_000_000 }))
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_060_000 }))
    assert.equal(tracker.records.length, 2, 'auseinanderliegende Aufrufe werden nicht verschmolzen')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Ein Crew-Aufruf wird nie aufgezeichnet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'd.json')
    // Die Crew-Route umschließt den echten Modellaufruf. Gemessen an den
    // Betreiberdaten hatten 616 von 616 Crew-Einträgen einen Provider-Zwilling
    // mit identischen Token-Zahlen im Millisekunden-Abstand — sie ist also eine
    // reine Hülle. Sie wird deshalb gar nicht erst aufgezeichnet: sonst stünde
    // jeder Aufruf doppelt in der Statistik und die Hülle (Modellname `crew-1`,
    // für keinen Preiskatalog bekannt) erschiene als unbepreist.
    tracker.record(call('crew', 'crew-1'))
    assert.equal(tracker.records.length, 0, 'die Hülle erzeugt keinen Datensatz')
    // Ein echter Aufruf daneben wird normal aufgezeichnet.
    tracker.record(call('deepseek-official', 'deepseek-chat'))
    assert.equal(tracker.records.length, 1)
    assert.equal(tracker.records[0].provider, 'deepseek-official')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Bereits gespeicherte Crew-Hüllen werden beim Laden entfernt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  const file = join(dir, 'e.json')
  try {
    // Datei aus der Zeit vor der Korrektur nachbauen: derselbe Aufruf zweimal.
    const base = { keyRef: 'K', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0.5, priced: true }
    writeFileSync(file, JSON.stringify({
      version: 1,
      balances: {},
      balanceFetchedAt: 0,
      records: [
        { ...base, time: 1_790_000_000_000, provider: 'crew', model: 'crew-1', cost: 0, priced: false },
        { ...base, time: 1_790_000_000_002, provider: 'deepseek-official', model: 'deepseek-chat' },
      ],
    }), 'utf8')

    const warnings = []
    const tracker = mod.createTracker({
      dataFile: file,
      config: () => mod.toBudgetConfig({ fetchBalance: false }),
      warn: m => warnings.push(m),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    })
    assert.equal(tracker.records.length, 1, 'die Hülle fällt beim Laden weg')
    assert.equal(tracker.records[0].provider, 'deepseek-official')
    assert.ok(warnings.some(w => w.includes('Crew')), 'die Bereinigung wird gemeldet')

    // Die bereinigte Sicht wird auch gespeichert.
    tracker.persist()
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(saved.records.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Doppelte Crew-Hüllen erzeugen keine doppelten Datensätze', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'f.json')
    // Fünf echte Aufrufe, jeder von einer Crew-Hülle umschlossen. Der Abstand
    // entspricht dem gemessenen Fall: wenige Millisekunden.
    for (let i = 0; i < 5; i++) {
      const t = 1_790_000_000_000 + i * 1000
      tracker.record(call('crew', 'crew-1', { time: t }))
      tracker.record(call('deepseek-official', 'deepseek-chat', { time: t + 2 }))
    }
    assert.equal(tracker.records.length, 5, 'fünf Aufrufe bleiben fünf Datensätze')
    const summary = tracker.summary(30)
    assert.equal(summary.requests, 5)
    // Die bepreisbare Provider-Route setzt sich durch: keine Crew-Hülle bleibt
    // als eigener Aufruf stehen, und damit verschwindet auch der unbepreiste
    // Anteil, den die Hülle sonst erzeugt hätte.
    assert.equal(summary.byKey.length, 1, 'nur die echte Key-Zuordnung zählt')
    assert.equal(summary.byModel.length, 1, 'nur das echte Modell zählt')
    assert.equal(summary.unpricedShare, 0, 'der Aufruf bleibt bepreist')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Gleiche Token-Zahlen auf verschiedenen Routen kurz hintereinander gelten als ein Aufruf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'g.json')
    // Genau das gemessene Muster: Crew-Hülle und Provider-Route melden denselben
    // Aufruf mit identischen Token-Zahlen im Millisekunden-Abstand.
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_000_000 }))
    tracker.record(call('crew', 'crew-1', { time: 1_790_000_000_002 }))
    assert.equal(tracker.records.length, 1, 'die Hülle wird nicht doppelt gezählt')
    assert.equal(tracker.records[0].provider, 'deepseek-official')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Auch eine Crew-Hülle mit abweichendem Verbrauch wird nicht aufgezeichnet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ub-dedup-'))
  try {
    const tracker = makeTracker(dir, 'h.json')
    // Die Hülle trägt den Modellnamen `crew-1`, den kein Preiskatalog kennt.
    // Sie wird unabhängig von ihren Token-Zahlen verworfen: Der Verbrauch des
    // umschlossenen Aufrufs ist bereits über die Provider-Route erfasst, und
    // eine zweite Zeile würde nur Anfragen und Tokens verdoppeln.
    tracker.record(call('deepseek-official', 'deepseek-chat', { time: 1_790_000_000_000 }))
    tracker.record(call('crew', 'crew-1', {
      time: 1_790_000_000_002,
      usage: { inputTokens: 7000, outputTokens: 900 },
    }))
    assert.equal(tracker.records.length, 1, 'nur der echte Aufruf zählt')
    assert.equal(tracker.records[0].provider, 'deepseek-official')
    // Kein unbepreister Datensatz durch die Hülle.
    assert.equal(tracker.summary(30).unpricedShare, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
