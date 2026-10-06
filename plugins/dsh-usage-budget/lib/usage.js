// dsh-usage-budget — Verbrauchs- und Budget-Kern
//
// Reine Logik ohne Cordis-Abhängigkeit: Datensätze, Aggregation, Budgets,
// Balance-Abruf. Das Host-Plugin (`index.js`) sammelt die Ereignisse ein und
// ruft hier hinein; dadurch ist der Kern direkt mit Node testbar.
//
// Begriffe:
//   Datensatz  — ein Modellaufruf mit Token-Zahlen und berechneten Kosten.
//   Budget     — ein Limit in USD, pro API-Key, pro Modell oder global.
//   Balance    — ein vom Provider gemeldetes Guthaben. Nur DeepSeek und
//                OpenRouter bieten dafür eine API; alle anderen Anbieter
//                melden kein Guthaben, dort bleibt nur die eigene Rechnung.

import { computeCost, lookupPrice, peakMultiplier } from './pricing.js'

/**
 * @typedef {object} UsageRecord Ein aufgezeichneter Modellaufruf.
 * @property {number} time Unix-Millisekunden des Aufrufs.
 * @property {string} provider Provider-Route.
 * @property {string} model Modell-ID.
 * @property {string} keyRef Credential-Ref des Providers (nie der Schlüsselwert).
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheWriteTokens
 * @property {number} cost Berechnete Kosten in USD.
 * @property {boolean} priced false = für dieses Modell war kein Preis bekannt.
 * @property {string} [purpose] Aufrufzweck (`compaction`, `session-title`).
 */

/**
 * @typedef {object} BudgetEntry Ein Budget-Limit, wie es in den Settings steht.
 * @property {number} [limitUsd] Limit in USD; 0 oder fehlend = kein Limit.
 * @property {number} [balanceUsd] Manuell gesetztes Guthaben (überschreibt den Provider-Abruf).
 * @property {number} [warnPercent] Warnschwelle in Prozent.
 */

/**
 * @typedef {object} BudgetConfig Budget-Konfiguration aus den Settings.
 * @property {number} [totalLimitUsd] Globales Limit in USD.
 * @property {number} [totalBalanceUsd] Global manuell gesetztes Guthaben in USD.
 * @property {number} [warnPercent] Gesamt-Warnschwelle in Prozent.
 * @property {Record<string, BudgetEntry>} [keys] Limits je Provider-Route bzw. Credential-Ref.
 * @property {Record<string, BudgetEntry>} [models] Limits je Modell (`provider/model` oder `model`).
 * @property {boolean} [fetchBalance] Guthaben automatisch vom Provider holen.
 * @property {number} [balanceRefreshSeconds] Abstand der Balance-Abfrage in Sekunden.
 * @property {Record<string, object>} [priceOverrides] Manuelle Preis-Overrides.
 */

/**
 * @typedef {object} GroupAggregate Aggregat einer Gruppe (Key, Modell oder Gesamt).
 * @property {string} id
 * @property {string} label
 * @property {number} requests
 * @property {number} cost
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheWriteTokens
 * @property {number} totalTokens
 * @property {number} unpricedShare Anteil nicht bepreisbarer Aufrufe (0..1).
 */

/**
 * @typedef {object} BudgetStatus Kosten-/Budget-Zustand einer Budget-Zeile.
 * @property {string} id
 * @property {string} label
 * @property {number|null} limitUsd Limit in USD; null = kein Limit.
 * @property {number} spentUsd
 * @property {number|null} remainingUsd
 * @property {number|null} balanceUsd Gemeldetes oder manuelles Guthaben; null = unbekannt.
 * @property {'provider'|'manual'|'none'} balanceSource
 * @property {number|null} usedPercent
 * @property {number} warnPercent
 * @property {boolean} warn Schwelle erreicht oder überschritten.
 * @property {boolean} exceeded Limit überschritten (nur Anzeige).
 */

/**
 * @typedef {object} BalanceResult Balance-Antwort eines Providers.
 * @property {number|null} balanceUsd Guthaben in USD; null, wenn keins gemeldet wird.
 * @property {string} currency
 * @property {string} [detail] Aufgeschlüsselte Herkunft, für die Anzeige.
 * @property {string} [error] Fehlertext, wenn der Abruf scheiterte.
 * @property {number} at
 */

/**
 * @typedef {object} DailyPoint Ein Tag im Verlauf.
 * @property {string} day Tag als `YYYY-MM-DD` (UTC).
 * @property {number} cost
 * @property {number} requests
 * @property {number} tokens
 */

/** Provider-Route auf die Credential-Ref abbilden, die den Schlüssel liefert. */
export const DEFAULT_KEY_REFS = {
  'deepseek-official': 'DEEPSEEK_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  zai: 'ZAI_API_KEY',
  'zai-coding-plan': 'ZAI_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY',
  nous: 'NOUS_API_KEY',
  zenmux: 'ZENMUX_API_KEY',
  'ollama-cloud': 'OLLAMA_CLOUD_API_KEY',
  lmstudio: 'LMSTUDIO_API_KEY',
  google: 'GEMINI_API_KEY',
}

/**
 * Credential-Ref zu einer Provider-Route bestimmen.
 * DSH führt die Zuordnung in den Provider-Settings (`apiKeyEnv`); `known`
 * enthält die dort gelesenen Werte und hat Vorrang. Der Rückgabewert ist immer
 * ein Name, nie ein Schlüssel.
 * @param {string} provider Provider-Route des Aufrufs.
 * @param {Record<string, string>} [known] aus den Provider-Settings gelesene Zuordnungen.
 * @returns {string} Credential-Ref-Name, sonst die Route selbst.
 */
export function resolveKeyRef(provider, known = {}) {
  const lower = String(provider ?? '').toLowerCase()
  if (known[provider]) return known[provider]
  if (known[lower]) return known[lower]
  if (DEFAULT_KEY_REFS[lower]) return DEFAULT_KEY_REFS[lower]
  for (const [prefix, ref] of Object.entries(DEFAULT_KEY_REFS)) {
    if (lower.startsWith(prefix)) return ref
  }
  // Unbekannte Route wird zur eigenen Gruppe, damit nichts stillschweigend
  // in einem Sammeltopf verschwindet.
  return provider
}

/** Provider, die ein Guthaben über eine API melden. */
export const PROVIDER_BALANCE = {
  deepseek: 'deepseek',
  'deepseek-official': 'deepseek',
  openrouter: 'openrouter',
}

/**
 * DeepSeek-Guthaben abfragen (`GET /user/balance`).
 * @param {string} apiKey aufgelöster Schlüsselwert (nur für diesen Aufruf).
 * @param {typeof fetch} [fetchImpl] Fetch-Implementierung (Tests).
 * @param {string} [baseUrl] Endpunkt-Basis.
 * @returns {Promise<BalanceResult>} Guthaben; `balanceUsd` zählt den aufgeladenen Anteil.
 */
export async function fetchDeepseekBalance(apiKey, fetchImpl = fetch, baseUrl = 'https://api.deepseek.com') {
  const at = Date.now()
  try {
    const res = await fetchImpl(`${baseUrl}/user/balance`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { balanceUsd: null, currency: 'USD', error: `HTTP ${res.status}`, at }
    const body = await res.json()
    const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
    if (infos.length === 0) return { balanceUsd: null, currency: 'USD', error: 'keine balance_infos', at }
    // Der Endpunkt kann mehrere Währungen liefern; USD bevorzugen, sonst den
    // ersten Eintrag nehmen und die Währung mitführen (keine stille Umrechnung).
    const info = infos.find(i => String(i?.currency ?? '').toUpperCase() === 'USD') ?? infos[0]
    const topped = Number.parseFloat(info?.topped_up_balance ?? '')
    const granted = Number.parseFloat(info?.granted_balance ?? '')
    const total = Number.parseFloat(info?.total_balance ?? '')
    const value = Number.isFinite(topped) ? topped : (Number.isFinite(total) ? total : null)
    const grantedText = Number.isFinite(granted) ? ` + ${granted} granted` : ''
    return {
      balanceUsd: value,
      currency: String(info?.currency ?? 'USD').toUpperCase(),
      detail: `topped-up${grantedText}${body?.is_available === false ? ' (Guthaben nicht ausreichend)' : ''}`,
      at,
    }
  } catch (error) {
    return { balanceUsd: null, currency: 'USD', error: error instanceof Error ? error.message : String(error), at }
  }
}

/**
 * OpenRouter-Guthaben abfragen (`GET /credits`).
 * Braucht einen Management-Key; ein normaler Inferenz-Key liefert 403.
 * @param {string} apiKey aufgelöster Schlüsselwert.
 * @param {typeof fetch} [fetchImpl] Fetch-Implementierung (Tests).
 * @param {string} [baseUrl] Endpunkt-Basis.
 * @returns {Promise<BalanceResult>} Restguthaben (`total_credits - total_usage`).
 */
export async function fetchOpenrouterBalance(apiKey, fetchImpl = fetch, baseUrl = 'https://openrouter.ai/api/v1') {
  const at = Date.now()
  try {
    const res = await fetchImpl(`${baseUrl}/credits`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    // Limit und Verbrauch des Schlüssels sind unabhängig vom Kontoguthaben:
    // Sie werden in jedem Fall mitgeholt, damit auch ein Konto ohne
    // Management-Key noch die Schlüsselangaben zeigt.
    const keyInfo = await fetchOpenrouterKeyInfo(apiKey, fetchImpl, baseUrl)
    const keyFields = keyInfoFields(keyInfo)

    if (res.status === 403) {
      return {
        balanceUsd: null,
        currency: 'USD',
        error: 'Kontoguthaben braucht einen Management-Key',
        detail: keyFields.limitUsd !== undefined ? 'Schlüssel-Limit verfügbar' : undefined,
        at,
        ...keyFields,
      }
    }
    if (!res.ok) return { balanceUsd: null, currency: 'USD', error: `HTTP ${res.status}`, at, ...keyFields }
    const body = await res.json()
    const credits = body?.data?.total_credits
    const used = body?.data?.total_usage
    if (typeof credits !== 'number' || typeof used !== 'number') {
      return { balanceUsd: null, currency: 'USD', error: 'unerwartete Antwort', at, ...keyFields }
    }
    return {
      balanceUsd: credits - used,
      currency: 'USD',
      detail: `${credits} Credits − ${used} verbraucht`,
      at,
      ...keyFields,
    }
  } catch (error) {
    return { balanceUsd: null, currency: 'USD', error: error instanceof Error ? error.message : String(error), at }
  }
}

/**
 * Limit und Verbrauch des verwendeten OpenRouter-Schlüssels abfragen (`GET /key`).
 *
 * Das ist die Angabe, die im OpenRouter-Dashboard als „Verwendet / Limit"
 * erscheint — sie gilt **pro Schlüssel**, nicht für das Konto. Der Katalog
 * führt dafür `limit`, `limit_remaining`, `limit_reset` und `usage`.
 * @param {string} apiKey aufgelöster Schlüsselwert.
 * @param {typeof fetch} [fetchImpl] Fetch-Implementierung (Tests).
 * @param {string} [baseUrl] Endpunkt-Basis.
 * @returns {Promise<object>} Schlüsselangaben; `error`, wenn der Abruf scheiterte.
 */
export async function fetchOpenrouterKeyInfo(apiKey, fetchImpl = fetch, baseUrl = 'https://openrouter.ai/api/v1') {
  try {
    const res = await fetchImpl(`${baseUrl}/key`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = (await res.json())?.data
    if (!data || typeof data !== 'object') return { error: 'unerwartete Antwort' }
    return {
      // `limit: null` bedeutet "kein Limit gesetzt" — das wird von 0
      // unterschieden, sonst sähe ein fehlendes Limit wie ein aufgebrauchtes aus.
      limitUsd: typeof data.limit === 'number' ? data.limit : null,
      limitRemainingUsd: typeof data.limit_remaining === 'number' ? data.limit_remaining : null,
      usageUsd: typeof data.usage === 'number' ? data.usage : null,
      limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
      freeModelRequests: typeof data.free_model_daily_requests?.limit === 'number'
        ? {
            used: data.free_model_daily_requests.used ?? 0,
            limit: data.free_model_daily_requests.limit,
            remaining: data.free_model_daily_requests.remaining ?? 0,
          }
        : undefined,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Schlüsselangaben in Felder einer Guthaben-Antwort überführen.
 * Bei einem Fehler bleibt die Antwort unverändert — ein fehlendes Limit darf
 * nicht als Limit 0 erscheinen.
 * @param {object} info Ergebnis von {@link fetchOpenrouterKeyInfo}.
 * @returns {object} Felder zum Einmischen in ein BalanceResult.
 */
function keyInfoFields(info) {
  if (!info || info.error) return {}
  return {
    limitUsd: info.limitUsd,
    limitRemainingUsd: info.limitRemainingUsd,
    usageUsd: info.usageUsd,
    limitReset: info.limitReset,
    freeModelRequests: info.freeModelRequests,
  }
}

/**
 * Guthaben für eine Provider-Route abfragen.
 * @param {string} provider Provider-Route.
 * @param {string|undefined} apiKey aufgelöster Schlüsselwert.
 * @param {typeof fetch} [fetchImpl] Fetch-Implementierung.
 * @returns {Promise<BalanceResult>} Guthaben; `error`, wenn der Provider keins anbietet.
 */
export async function fetchBalance(provider, apiKey, fetchImpl = fetch) {
  const kind = PROVIDER_BALANCE[String(provider ?? '').toLowerCase()]
  if (!kind) {
    return { balanceUsd: null, currency: 'USD', error: 'Provider bietet keine Guthaben-API', at: Date.now() }
  }
  if (!apiKey) {
    return { balanceUsd: null, currency: 'USD', error: 'kein Schlüssel aufgelöst', at: Date.now() }
  }
  return kind === 'deepseek'
    ? fetchDeepseekBalance(apiKey, fetchImpl)
    : fetchOpenrouterBalance(apiKey, fetchImpl)
}

/**
 * Tagesstempel eines Zeitpunkts in UTC.
 * @param {number} time Unix-Millisekunden.
 * @returns {string} `YYYY-MM-DD`.
 */
export function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10)
}

/**
 * Datensätze im Zeitfenster auf Gesamtwerte verdichten.
 * @param {readonly UsageRecord[]} records alle Datensätze.
 * @param {number} windowDays Zeitfenster in Tagen (rückwärts ab `now`).
 * @param {number} [now] Bezugszeitpunkt in ms.
 * @returns {object} gefilterte Datensätze und Aggregat.
 */
export function aggregate(records, windowDays, now = Date.now()) {
  const cutoff = now - windowDays * 86_400_000
  const inWindow = records.filter(r => r.time >= cutoff && r.time <= now)
  let totalCostUsd = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let unpriced = 0
  let firstAt = null
  let lastAt = null

  for (const r of inWindow) {
    totalCostUsd += r.cost
    inputTokens += r.inputTokens
    outputTokens += r.outputTokens
    cacheReadTokens += r.cacheReadTokens
    cacheWriteTokens += r.cacheWriteTokens
    if (!r.priced) unpriced++
    if (firstAt === null || r.time < firstAt) firstAt = r.time
    if (lastAt === null || r.time > lastAt) lastAt = r.time
  }

  return {
    inWindow,
    totalCostUsd,
    requests: inWindow.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    unpricedShare: inWindow.length === 0 ? 0 : unpriced / inWindow.length,
    firstAt,
    lastAt,
  }
}

/**
 * Datensätze nach einem Schlüssel gruppieren und verdichten.
 * @param {readonly UsageRecord[]} records Datensätze eines Zeitfensters.
 * @param {(r: UsageRecord) => string} selector liefert die Gruppen-ID.
 * @param {(id: string) => string} [label] liefert den Anzeigenamen.
 * @returns {GroupAggregate[]} absteigend nach Kosten sortierte Aggregate.
 */
export function groupBy(records, selector, label = id => id) {
  const groups = new Map()
  for (const r of records) {
    const id = selector(r)
    let g = groups.get(id)
    if (!g) {
      g = {
        id,
        label: label(id),
        requests: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        unpricedShare: 0,
        unpriced: 0,
        // Kostenanteile für das gestapelte Balkendiagramm.
        costInput: 0,
        costOutput: 0,
        costCacheRead: 0,
        costCacheWrite: 0,
      }
      groups.set(id, g)
    }
    g.requests++
    g.cost += r.cost
    g.inputTokens += r.inputTokens
    g.outputTokens += r.outputTokens
    g.cacheReadTokens += r.cacheReadTokens
    g.cacheWriteTokens += r.cacheWriteTokens
    g.totalTokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens
    g.costInput += r.costInput ?? 0
    g.costOutput += r.costOutput ?? 0
    g.costCacheRead += r.costCacheRead ?? 0
    g.costCacheWrite += r.costCacheWrite ?? 0
    if (!r.priced) g.unpriced++
  }
  const list = [...groups.values()].map(g => {
    g.unpricedShare = g.requests === 0 ? 0 : g.unpriced / g.requests
    return g
  })
  list.sort((a, b) => b.cost - a.cost || b.requests - a.requests)
  return list
}

/**
 * Tagesverlauf im Zeitfenster aufbauen (lückenlos, UTC).
 * @param {readonly UsageRecord[]} records Datensätze eines Zeitfensters.
 * @param {number} windowDays Anzahl der Tage.
 * @param {number} [now] Bezugszeitpunkt in ms.
 * @returns {DailyPoint[]} eine Reihe je Tag, ältester zuerst.
 */
export function dailySeries(records, windowDays, now = Date.now()) {
  const buckets = new Map()
  for (let i = windowDays - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86_400_000)
    buckets.set(day, { day, cost: 0, requests: 0, tokens: 0 })
  }
  for (const r of records) {
    const bucket = buckets.get(dayKey(r.time))
    // Datensätze außerhalb der aufgebauten Tage entfallen (halbe Tage am
    // Fensterrand) — das hält die Reihe exakt fensterbreit.
    if (!bucket) continue
    bucket.cost += r.cost
    bucket.requests++
    bucket.tokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens
  }
  return [...buckets.values()]
}

/**
 * Budget-Zustand einer Zeile berechnen.
 * `exceeded` und `warn` sind reine Anzeigefakten; hier wird nichts blockiert.
 * @param {string} id Zeilen-ID.
 * @param {string} label Anzeigename.
 * @param {BudgetEntry|undefined} entry Budget-Eintrag aus den Settings.
 * @param {number} spentUsd Verbrauch dieser Zeile.
 * @param {BalanceResult|undefined} balance vom Provider gemeldetes Guthaben.
 * @param {number} [defaultWarnPercent] globale Warnschwelle.
 * @returns {BudgetStatus} Budget-Status.
 */
export function budgetStatus(id, label, entry, spentUsd, balance, defaultWarnPercent = 80) {
  const limit = entry?.limitUsd && entry.limitUsd > 0 ? entry.limitUsd : null
  const warnPercent = entry?.warnPercent ?? defaultWarnPercent
  const manual = entry?.balanceUsd
  const providerBalance = balance?.balanceUsd ?? null
  const balanceUsd = typeof manual === 'number' ? manual : providerBalance
  const balanceSource = typeof manual === 'number' ? 'manual' : (providerBalance === null ? 'none' : 'provider')
  const usedPercent = limit === null ? null : (spentUsd / limit) * 100

  // Vom Anbieter gemeldete Angaben zum Schlüssel selbst (OpenRouter `/key`
  // liefert `limit`, `limit_remaining`, `usage` und `limit_reset`). Das ist ein
  // Limit des Anbieters, nicht das selbst gesetzte Budget — beides wird
  // getrennt geführt, damit die Anzeige sie unterscheiden kann.
  const providerLimitUsd = typeof balance?.limitUsd === 'number' ? balance.limitUsd : null
  const providerLimitRemainingUsd = typeof balance?.limitRemainingUsd === 'number' ? balance.limitRemainingUsd : null
  const providerUsageUsd = typeof balance?.usageUsd === 'number' ? balance.usageUsd : null
  const providerLimitReset = typeof balance?.limitReset === 'string' ? balance.limitReset : null

  // Ein vom Anbieter gemeldetes Limit zählt für Warnung und Auslastung mit,
  // wenn der Nutzer selbst kein Budget gesetzt hat: Sonst stünde bei einem
  // Schlüssel mit hartem Anbieter-Limit „kein Limit gesetzt" da.
  const effectiveLimit = limit ?? (providerLimitUsd !== null && providerLimitUsd > 0 ? providerLimitUsd : null)
  const effectiveSpent = limit !== null ? spentUsd : (providerUsageUsd ?? spentUsd)
  const effectivePercent = effectiveLimit === null ? null : (effectiveSpent / effectiveLimit) * 100

  return {
    id,
    label,
    limitUsd: effectiveLimit,
    /** Woher das Limit stammt: eigenes Budget oder Anbieter-Vorgabe. */
    limitSource: limit !== null ? 'config' : (effectiveLimit !== null ? 'provider' : 'none'),
    spentUsd,
    /** Verbrauch, den der Anbieter selbst meldet (falls vorhanden). */
    providerUsageUsd,
    providerLimitUsd,
    providerLimitRemainingUsd,
    providerLimitReset,
    remainingUsd: effectiveLimit === null ? null : effectiveLimit - effectiveSpent,
    balanceUsd,
    balanceSource,
    usedPercent: effectivePercent,
    warnPercent,
    warn: effectivePercent !== null && effectivePercent >= warnPercent,
    exceeded: effectiveLimit !== null && effectiveSpent > effectiveLimit,
  }
}

/**
 * Vollständige Übersicht für Anzeige und Hover-Panel bauen.
 * @param {readonly UsageRecord[]} records alle Datensätze.
 * @param {BudgetConfig} config Budget-Konfiguration.
 * @param {{source: string, loadedAt: number, models: number}} pricing Zustand der Preistabelle.
 * @param {Record<string, BalanceResult>} balances Guthaben je Credential-Ref.
 * @param {number} [windowDays] Zeitfenster in Tagen.
 * @param {number} [now] Bezugszeitpunkt in ms.
 * @returns {object} Übersicht mit Aggregaten, Budgets und Verlauf.
 */
export function buildSummary(records, config, pricing, balances, windowDays = 30, now = Date.now(), configuredKeys = []) {
  const agg = aggregate(records, windowDays, now)
  const byKey = groupBy(agg.inWindow, r => r.keyRef)
  const byModel = groupBy(agg.inWindow, r => `${r.provider}/${r.model}`)

  const warnPercent = config.warnPercent ?? 80

  // Die Key-Liste ist die Vereinigung aus drei Quellen:
  //   1. ausdrücklich gesetzte Budgets (der Nutzer hat sie benannt),
  //   2. alle konfigurierten Provider-Schlüssel — auch ohne Verbrauch, sonst
  //      fehlt genau die Übersicht, mit der man ein Budget setzen will,
  //   3. Schlüssel mit aufgezeichnetem Verbrauch.
  // Ohne Quelle 2 zeigte die Anzeige nur den einen Anbieter, der schon Geld
  // gekostet hat, und verschwieg alle übrigen.
  const keyIds = new Set([
    ...Object.keys(config.keys ?? {}),
    ...configuredKeys,
    ...byKey.map(g => g.id),
  ])
  const keyStatus = [...keyIds].map(id =>
    budgetStatus(
      id,
      id,
      config.keys?.[id],
      byKey.find(g => g.id === id)?.cost ?? 0,
      balances[id],
      warnPercent,
    ),
  )
  // Aktive zuerst, danach die noch ungenutzten — so stehen die Kosten oben und
  // die vollständige Liste bleibt trotzdem sichtbar.
  keyStatus.sort((a, b) => b.spentUsd - a.spentUsd || a.id.localeCompare(b.id))

  const modelStatus = Object.entries(config.models ?? {}).map(([id, entry]) =>
    budgetStatus(id, id, entry, byModel.find(g => g.id === id)?.cost ?? 0, undefined, warnPercent),
  )

  // Gesamtbudget: ein ausdrücklich gesetztes Limit (`totalLimitUsd`) ist eine
  // bewusste Obergrenze und hat Vorrang. Ist es nicht gesetzt, wird die Summe
  // der Einzelbudgets gebildet — sonst stünde bei gesetzten Key-Budgets
  // "kein Limit" da, obwohl sehr wohl Limits existieren.
  const keyLimitSum = keyStatus.reduce((acc, s) => acc + (s.limitUsd ?? 0), 0)
  const explicitTotal = config.totalLimitUsd
  const derivedTotal = typeof explicitTotal === 'number' && explicitTotal > 0 ? explicitTotal : undefined
  const totalLimitUsd = derivedTotal ?? (keyLimitSum > 0 ? keyLimitSum : undefined)

  const totalEntry = {
    limitUsd: totalLimitUsd,
    balanceUsd: config.totalBalanceUsd,
    warnPercent: config.warnPercent,
  }
  // "Verfügbar" ist die Summe aller bekannten Guthaben — vom Anbieter gemeldet
  // oder manuell gesetzt. Schlüssel ohne Guthaben-API zählen nicht mit und
  // werden namentlich genannt, damit die Summe nicht als vollständig gilt.
  const withBalance = keyStatus.filter(s => s.balanceUsd !== null)
  const availableUsd = withBalance.length > 0
    ? withBalance.reduce((acc, s) => acc + s.balanceUsd, 0)
    : null
  const keysWithoutBalance = keyStatus.filter(s => s.balanceUsd === null).map(s => s.id)
  const sumBalance = availableUsd
  const totalStatus = budgetStatus(
    'total',
    'Gesamt',
    totalEntry,
    agg.totalCostUsd,
    sumBalance === null ? undefined : { balanceUsd: sumBalance, currency: 'USD', at: now },
    warnPercent,
  )

  return {
    totalCostUsd: agg.totalCostUsd,
    requests: agg.requests,
    totalTokens: agg.totalTokens,
    inputTokens: agg.inputTokens,
    outputTokens: agg.outputTokens,
    cacheReadTokens: agg.cacheReadTokens,
    cacheWriteTokens: agg.cacheWriteTokens,
    unpricedShare: agg.unpricedShare,
    windowDays,
    firstAt: agg.firstAt,
    lastAt: agg.lastAt,
    daily: dailySeries(agg.inWindow, windowDays, now),
    byKey,
    byModel,
    keyStatus,
    modelStatus,
    totalStatus,
    // Gesamtsicht über alle APIs: Summe der bekannten Guthaben, Anzahl der
    // Schlüssel mit und ohne Guthaben-Quelle. Die Anzeige braucht beides, um
    // "verfügbar" als Summe zu zeigen und trotzdem ehrlich zu bleiben.
    availableUsd,
    availableKeyCount: withBalance.length,
    keysWithoutBalance,
    configuredKeyCount: keyStatus.length,
    pricing,
    at: now,
  }
}

/**
 * Einen Aufruf bepreisen — die Brücke zwischen Rohdaten und Datensatz.
 * @param {object} table geladene Preistabelle.
 * @param {object} input Rohdaten des Aufrufs.
 * @returns {UsageRecord} fertiger Datensatz.
 */
export function priceRecord(table, input) {
  const price = lookupPrice(table, input.provider, input.model, input.overrides ?? {})
  const multiplier = peakMultiplier(input.provider, new Date(input.time))
  const cost = computeCost(price, input.usage, multiplier)
  return {
    time: input.time,
    provider: input.provider,
    model: input.model,
    keyRef: input.keyRef,
    inputTokens: input.usage.inputTokens || 0,
    outputTokens: input.usage.outputTokens || 0,
    cacheReadTokens: input.usage.cacheReadTokens || 0,
    cacheWriteTokens: input.usage.cacheWriteTokens || 0,
    cost: cost.total,
    // Kostenanteile: das Dashboard stapelt sie im Balkendiagramm.
    costInput: cost.input,
    costOutput: cost.output,
    costCacheRead: cost.cacheRead,
    costCacheWrite: cost.cacheWrite,
    priced: cost.priced,
    ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  }
}

/**
 * Datensätze nach Zeitfenster, API-Key und Modell filtern.
 * Leere Filterwerte (`all`, leerer String, undefined) filtern nicht.
 * @param {readonly UsageRecord[]} records alle Datensätze.
 * @param {object} [filter]
 * @param {number} [filter.days] Zeitfenster in Tagen.
 * @param {string} [filter.keyRef] nur dieser API-Key.
 * @param {string} [filter.model] nur dieses Modell (`provider/model` oder `model`).
 * @param {number} [filter.now] Bezugszeitpunkt in ms.
 * @returns {UsageRecord[]} gefilterte Datensätze.
 */
export function filterRecords(records, filter = {}) {
  const now = filter.now ?? Date.now()
  const days = typeof filter.days === 'number' && filter.days > 0 ? filter.days : 30
  const cutoff = now - days * 86_400_000
  const keyRef = filter.keyRef && filter.keyRef !== 'all' ? filter.keyRef : undefined
  const model = filter.model && filter.model !== 'all' ? filter.model : undefined

  return records.filter(r => {
    if (r.time < cutoff || r.time > now) return false
    if (keyRef !== undefined && r.keyRef !== keyRef) return false
    if (model !== undefined && `${r.provider}/${r.model}` !== model && r.model !== model) return false
    return true
  })
}

/**
 * Tagesreihe für das Balkendiagramm, wahlweise nach Modell oder API-Key
 * aufgeschlüsselt. Jeder Tag trägt seine Gruppen mit Kostenanteilen, damit das
 * Diagramm stapeln kann, ohne die Rohdatensätze zu kennen.
 * @param {readonly UsageRecord[]} records bereits gefilterte Datensätze.
 * @param {object} [options]
 * @param {'model'|'key'} [options.groupBy] Gruppierung.
 * @param {number} [options.days] Zeitfenster in Tagen.
 * @param {number} [options.now] Bezugszeitpunkt in ms.
 * @returns {{groupBy: string, groups: string[], days: object[]}} Reihe und Gruppenschlüssel.
 */
export function buildTimeseries(records, options = {}) {
  const groupBy = options.groupBy === 'key' ? 'key' : 'model'
  const days = typeof options.days === 'number' && options.days > 0 ? options.days : 30
  const now = options.now ?? Date.now()

  /** @type {Map<string, object>} */
  const buckets = new Map()
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(dayKey(now - i * 86_400_000), { day: dayKey(now - i * 86_400_000), cost: 0, requests: 0, tokens: 0, groups: {} })
  }

  const groups = new Set()
  for (const r of records) {
    const bucket = buckets.get(dayKey(r.time))
    if (!bucket) continue
    const id = groupBy === 'key' ? r.keyRef : `${r.provider}/${r.model}`
    groups.add(id)
    let g = bucket.groups[id]
    if (!g) {
      g = { cost: 0, requests: 0, tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      bucket.groups[id] = g
    }
    const tokens = r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens
    g.cost += r.cost
    g.requests++
    g.tokens += tokens
    g.input += r.costInput ?? 0
    g.output += r.costOutput ?? 0
    g.cacheRead += r.costCacheRead ?? 0
    g.cacheWrite += r.costCacheWrite ?? 0
    bucket.cost += r.cost
    bucket.requests++
    bucket.tokens += tokens
  }

  // Gruppen absteigend nach Gesamtkosten: die größten bestimmen die Legende.
  const totals = new Map()
  for (const bucket of buckets.values()) {
    for (const [id, g] of Object.entries(bucket.groups)) {
      totals.set(id, (totals.get(id) ?? 0) + g.cost)
    }
  }
  const ordered = [...groups].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))

  return { groupBy, groups: ordered, days: [...buckets.values()] }
}
