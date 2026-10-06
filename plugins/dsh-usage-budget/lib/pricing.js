// dsh-usage-budget — Preis-Engine
//
// Kosten pro Modellaufruf aus Token-Zahlen. Primärquelle ist der offene
// Katalog von models.dev (`https://models.dev/api.json`): über 200 Provider,
// `cost.{input,output,cache_read,cache_write}` in USD pro 1M Tokens.
//
// Zwei Eigenschaften des Katalogs sind für die Korrektheit entscheidend:
//
//  1. models.dev führt für DeepSeek die OFF-PEAK-Preise. DeepSeek verlangt zu
//     Peak-Zeiten den doppelten Preis (01:00-04:00 und 06:00-10:00 UTC, Mo-Fr,
//     ohne chinesische Feiertage). Der Katalog liefert den Zeitplan nicht mit,
//     deshalb wendet `peakMultiplier` ihn aus der Uhrzeit des Aufrufs an.
//  2. `cache_write` ist optional und bedeutet "der Katalog kennt die Größe
//     nicht" — nicht "kostet nichts". Die Engine unterscheidet beides und
//     markiert einen Aufruf als `priced: false`, wenn das Modell unbekannt
//     ist, statt stillschweigend 0 zu buchen.

/**
 * @typedef {object} ModelPrice Preistabelle eines Modells, in USD pro 1M Tokens.
 * @property {number} input Preis je 1M ungecachte Input-Tokens.
 * @property {number} output Preis je 1M Output-Tokens.
 * @property {number} cacheRead Preis je 1M gecachte Input-Tokens.
 * @property {number} cacheWrite Preis je 1M Cache-Schreib-Tokens.
 * @property {boolean} cacheWriteUnknown true, wenn der Katalog `cache_write` nicht nennt.
 */

/**
 * @typedef {object} UsageTokens Token-Zahlen eines Aufrufs.
 *   Die Zahlen sind disjunkt: `inputTokens` ist der ungecachte Anteil.
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} [cacheReadTokens]
 * @property {number} [cacheWriteTokens]
 */

/**
 * @typedef {object} CostBreakdown Aufgeschlüsselte Kosten eines Aufrufs in USD.
 * @property {number} input
 * @property {number} output
 * @property {number} cacheRead
 * @property {number} cacheWrite
 * @property {number} total
 * @property {boolean} priced false = für dieses Modell war kein Preis bekannt.
 * @property {number} peakMultiplier angewandter Peak-Faktor (1 = kein Aufschlag).
 */

/**
 * @typedef {object} PriceTable Normalisierter Preiskatalog.
 * @property {Map<string, ModelPrice>} prices Preise je `providerId/modelId`.
 * @property {Map<string, ModelPrice>} byModelOnly Preise je Modell-ID ohne Provider (Fallback).
 * @property {number} loadedAt Zeitpunkt des Ladens in ms.
 * @property {string} source Quelle, für Diagnose und Anzeige.
 */

/** Provider-Routen-Präfixe auf models.dev-Provider-IDs abbilden. */
const PROVIDER_MAP = {
  deepseek: 'deepseek',
  openrouter: 'openrouter',
  anthropic: 'anthropic',
  openai: 'openai',
  groq: 'groq',
  google: 'google',
  gemini: 'google',
  zai: 'zai',
  zhipu: 'zai',
  zhipuai: 'zai',
  glm: 'zai',
  ollama: 'ollama-cloud',
  lmstudio: 'lmstudio',
  zenmux: 'zenmux',
  opencode: 'opencode',
  nous: 'nous',
  mistral: 'mistral',
}

/**
 * Provider-Route auf eine models.dev-Provider-ID abbilden.
 * Routen heißen in DSH z. B. `deepseek-official`; der erste Präfix-Treffer
 * gewinnt, sonst bleibt der Rohname stehen.
 * @param {string} provider Provider-Route aus `GenerateOptions.provider`.
 * @returns {string} models.dev-Provider-ID (oder der unveränderte Name).
 */
export function mapProviderId(provider) {
  const lower = String(provider ?? '').toLowerCase()
  if (PROVIDER_MAP[lower]) return PROVIDER_MAP[lower]
  for (const [prefix, id] of Object.entries(PROVIDER_MAP)) {
    if (lower.startsWith(prefix)) return id
  }
  return lower
}

/**
 * Liegt der Zeitpunkt in DeepSeeks Peak-Fenster?
 * Peak = 01:00-04:00 und 06:00-10:00 UTC, Montag bis Freitag. Chinesische
 * Feiertage sind NICHT berücksichtigt (sie verschieben einzelne Tage in den
 * Off-Peak-Tarif); dadurch kann der Wert an Feiertagen bis zu 2x zu hoch
 * liegen. Das ist die einzige bewusste Ungenauigkeit der Berechnung.
 * @param {Date} at Zeitpunkt des Aufrufs.
 * @returns {boolean} true, wenn der Peak-Tarif gilt.
 */
export function isDeepseekPeak(at) {
  const day = at.getUTCDay() // 0 = Sonntag, 6 = Samstag
  if (day === 0 || day === 6) return false
  const hour = at.getUTCHours()
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10)
}

/**
 * Peak-Faktor eines Aufrufs.
 * @param {string} provider Provider-Route.
 * @param {Date} at Zeitpunkt des Aufrufs.
 * @returns {number} 2 im DeepSeek-Peak, sonst 1.
 */
export function peakMultiplier(provider, at) {
  return mapProviderId(provider) === 'deepseek' && isDeepseekPeak(at) ? 2 : 1
}

/**
 * Leerer Katalog — gültiger Startzustand, bevor Preise geladen sind.
 * @param {string} [source] Quellbezeichnung.
 * @returns {PriceTable} leere Tabelle.
 */
export function emptyPriceTable(source = 'unloaded') {
  return { prices: new Map(), byModelOnly: new Map(), loadedAt: 0, source }
}

/**
 * models.dev-Rohantwort in eine Preistabelle überführen.
 * @param {unknown} raw geparste `api.json`-Antwort.
 * @param {string} [source] Quellbezeichnung für Diagnose.
 * @param {number} [now] Ladezeitpunkt in ms.
 * @returns {PriceTable} normalisierte Tabelle.
 */
export function parseModelsDev(raw, source = 'models.dev', now = Date.now()) {
  const table = emptyPriceTable(source)
  table.loadedAt = now
  if (!raw || typeof raw !== 'object') return table

  for (const [providerId, providerNode] of Object.entries(raw)) {
    if (!providerNode || typeof providerNode !== 'object') continue
    const models = providerNode.models
    if (!models || typeof models !== 'object') continue
    for (const [modelId, modelNode] of Object.entries(models)) {
      if (!modelNode || typeof modelNode !== 'object') continue
      const cost = modelNode.cost
      if (!cost || typeof cost !== 'object') continue
      if (typeof cost.input !== 'number' || typeof cost.output !== 'number') continue
      const price = {
        input: cost.input,
        output: cost.output,
        cacheRead: typeof cost.cache_read === 'number' ? cost.cache_read : 0,
        cacheWrite: typeof cost.cache_write === 'number' ? cost.cache_write : 0,
        cacheWriteUnknown: typeof cost.cache_write !== 'number',
      }
      table.prices.set(`${providerId}/${modelId}`, price)
      // Erster Treffer gewinnt: die Modell-ID bleibt als providerloser
      // Fallback erhalten, damit unbekannte Routen trotzdem bepreist werden.
      if (!table.byModelOnly.has(modelId)) table.byModelOnly.set(modelId, price)
    }
  }
  return table
}

/**
 * Belegte DeepSeek-Preise in USD pro 1M Tokens, **Off-Peak**.
 *
 * Quelle: DeepSeeks eigener Nutzungsexport des Betreibers (CSV-Paar `cost-` und
 * `amount-` für den 26.08.2026 bis 23.09.2026). Der Export nennt je Position
 * zwei Werte im Verhältnis 2:1 — Off-Peak und Peak. Hier steht der Off-Peak-Wert;
 * `peakMultiplier` verdoppelt ihn im Peak-Fenster.
 *
 * Diese Tabelle hat **Vorrang vor models.dev**, weil der Katalog für dieselben
 * Modelle abweicht: beim Cache-Treffer von `deepseek-v4-pro` um den Faktor 6
 * ($0.003625 statt $0.022). Da Cache-Treffer den Verbrauch dominieren, hätte die
 * Anzeige sonst rund 45 % zu niedrig gerechnet — geprüft gegen die Abrechnung
 * desselben Zeitraums ($23.01 berechnet gegen $42.24 abgerechnet).
 *
 * `cacheWrite` ist 0 und als unbekannt markiert: DeepSeek stellt keine Position
 * für Cache-Schreibvorgänge in Rechnung, der Export führt keine solche Zeile.
 */
export const DEEPSEEK_VERIFIED_PRICES = {
  'deepseek-flash': { input: 0.15, output: 0.60, cacheRead: 0.003 },
  'deepseek-v4-pro': { input: 0.66, output: 1.98, cacheRead: 0.022 },
  'deepseek-v4-flash-vision-exp': { input: 0.22, output: 0.66, cacheRead: 0.007 },
}

/**
 * Belegte DeepSeek-Preise in eine geladene Tabelle übernehmen.
 *
 * Diese Korrektur gehört an die **Ladestelle** des echten Katalogs, nicht in
 * {@link lookupPrice}: Der Auflöser bleibt damit ein reiner Nachschlag, und eine
 * selbst gebaute Tabelle (Tests, eigene Quellen) behält die volle Kontrolle.
 * @param {PriceTable} table geladene Tabelle; wird an Ort und Stelle ergänzt.
 * @returns {PriceTable} dieselbe Tabelle.
 */
export function applyVerifiedPrices(table) {
  for (const [modelId, price] of Object.entries(DEEPSEEK_VERIFIED_PRICES)) {
    const entry = {
      input: price.input,
      output: price.output,
      cacheRead: price.cacheRead,
      cacheWrite: 0,
      cacheWriteUnknown: true,
    }
    table.prices.set(`deepseek/${modelId}`, entry)
    table.byModelOnly.set(modelId, entry)
  }
  return table
}

/**
 * Preis für einen Aufruf auflösen.
 * Suchreihenfolge: exakter Routen-Treffer → providerloser Treffer → manueller
 * Override aus den Settings (überschreibt beide).
 * @param {PriceTable} table geladener Katalog.
 * @param {string} provider Provider-Route des Aufrufs.
 * @param {string} model Modell-ID des Aufrufs.
 * @param {Record<string, object>} [overrides] manuelle Preise, Schlüssel `provider/model` oder `model`.
 * @returns {ModelPrice|undefined} Preis, oder undefined wenn nichts bekannt ist.
 */
export function lookupPrice(table, provider, model, overrides = {}) {
  const providerId = mapProviderId(provider)
  const manual = overrides[`${providerId}/${model}`] ?? overrides[`${provider}/${model}`] ?? overrides[model]
  const base = table.prices.get(`${providerId}/${model}`) ?? table.byModelOnly.get(model)

  if (manual) {
    return {
      input: manual.input ?? base?.input ?? 0,
      output: manual.output ?? base?.output ?? 0,
      cacheRead: manual.cacheRead ?? base?.cacheRead ?? 0,
      cacheWrite: manual.cacheWrite ?? base?.cacheWrite ?? 0,
      cacheWriteUnknown: manual.cacheWrite === undefined && (base?.cacheWriteUnknown ?? true),
    }
  }
  return base
}

/**
 * Kosten eines Aufrufs berechnen.
 *
 * Die Token-Zahlen sind disjunkt (DSH-Kontrakt): `inputTokens` ist der
 * ungecachte Anteil, Cache-Treffer stehen separat. Alle vier Anteile werden
 * einzeln bepreist und summiert.
 * @param {ModelPrice|undefined} price aufgelöster Modellpreis.
 * @param {UsageTokens} tokens Token-Zahlen des Aufrufs.
 * @param {number} [multiplier] Peak-/Tarif-Faktor (1 = keine Anpassung).
 * @returns {CostBreakdown} aufgeschlüsselte Kosten in USD.
 */
export function computeCost(price, tokens, multiplier = 1) {
  if (!price) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, priced: false, peakMultiplier: multiplier }
  }
  const perM = 1_000_000
  const input = ((tokens.inputTokens || 0) / perM) * price.input * multiplier
  const output = ((tokens.outputTokens || 0) / perM) * price.output * multiplier
  const cacheRead = ((tokens.cacheReadTokens || 0) / perM) * price.cacheRead * multiplier
  const cacheWrite = ((tokens.cacheWriteTokens || 0) / perM) * price.cacheWrite * multiplier
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output + cacheRead + cacheWrite,
    priced: true,
    peakMultiplier: multiplier,
  }
}

/** Preisquelle: offener Modellkatalog mit Kosten je Provider und Modell. */
export const MODELS_DEV_URL = 'https://models.dev/api.json'

/**
 * Katalog von models.dev holen und normalisieren.
 * Fehler werden als Quelle in der leeren Tabelle gemeldet, nicht geworfen:
 * ein fehlender Preiskatalog darf das Harness nicht stören.
 * @param {string} [url] Quelle (für Tests überschreibbar).
 * @param {number} [timeoutMs] Zeitlimit des Abrufs.
 * @param {typeof fetch} [fetchImpl] Fetch-Implementierung (Tests).
 * @returns {Promise<PriceTable>} geladene Tabelle, bei Fehlern leer mit Fehlerquelle.
 */
export async function fetchPriceTable(url = MODELS_DEV_URL, timeoutMs = 20_000, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return emptyPriceTable(`models.dev HTTP ${res.status}`)
    const json = await res.json()
    return parseModelsDev(json, 'models.dev')
  } catch (error) {
    return emptyPriceTable(`models.dev Fehler: ${error instanceof Error ? error.message : String(error)}`)
  }
}
