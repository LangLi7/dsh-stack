// dsh-usage-budget — Host-Teil
//
// Erfasst Kosten und Budgets für jeden Modellaufruf des Harness und stellt sie
// dem Web-GUI bereit.
//
// Aufzeichnung: Der `llm/stream`-Waterfall umschließt JEDEN Modellaufruf
// (Agent-Loop, Compaction, Crew) und liefert `options.provider`/`options.model`;
// die Token-Zahlen kommen als `{ type: 'usage' }`-Chunk aus dem Stream. Der
// Waterfall wird durchgereicht, nie verändert — das Harness darf davon nichts
// merken.
//
// API-Key-Zuordnung: DSH führt keinen Schlüssel im Aufruf mit (bewusst — der
// Adapter löst ihn erst beim Versand auf). Die Zuordnung entsteht deshalb aus
// der Provider-Route: der Name der Credential-Ref (`DEEPSEEK_API_KEY`) wird
// gelesen, der Wert nie.
//
// Kein Blockieren: Budgets erzeugen ausschließlich Anzeige und Warnung.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

import { fetchPriceTable, parseModelsDev } from './pricing.js'
import {
  buildSummary,
  buildTimeseries,
  fetchBalance,
  filterRecords,
  groupBy,
  priceRecord,
  resolveKeyRef,
} from './usage.js'

/** Cordis-Plugin-Name (zugleich Settings-Namespace und Client-Bundle-id). */
export const name = 'dsh-usage-budget'

/**
 * Der RPC-Kanal braucht den Connection-Dienst; `settings`/`llm` sind optional
 * (ctx.get), damit das Plugin auch ohne sie lädt.
 */
export const inject = ['connection']

/** Höchstzahl gehaltener Datensätze; ältere fallen aus der Statistik. */
const MAX_RECORDS = 20_000
/** Zeitfenster der Übersicht in Tagen — deckt den Chart im Panel ab. */
const WINDOW_DAYS = 30
/** Erster Balance-Abruf verzögert, damit der Start nicht auf Netzwerk wartet. */
const BALANCE_STARTUP_DELAY_MS = 5_000

/**
 * Budget-Eintrag eines Keys oder Modells.
 * @typedef {object} BudgetEntryShape
 * @property {number} [limitUsd]
 * @property {number} [balanceUsd]
 * @property {number} [warnPercent]
 */

/**
 * Auflade-/Abrechnungsseiten der Anbieter, je Credential-Ref.
 *
 * Diese Adressen wurden geprüft: Ein automatischer Abruf lief gegen jede URL und
 * die Antwort wurde ausgewertet. Ein `200` (auch mit Weiterleitung zur Anmeldung)
 * bestätigt den Pfad; ein `403` bedeutet Bot-Schutz und nicht einen falschen Pfad
 * — die Adresse stammt dann aus der Anbieter-Oberfläche selbst. Ein erratener
 * Pfad hätte `404` geliefert.
 *
 * Anbieter ohne Prepaid-Guthaben fehlen bewusst: LM Studio läuft lokal und hat
 * keine Abrechnung.
 */
export const DEFAULT_TOP_UP_URLS = {
  DEEPSEEK_API_KEY: 'https://platform.deepseek.com/top_up',
  OPENROUTER_API_KEY: 'https://openrouter.ai/settings/credits',
  OPENAI_API_KEY: 'https://platform.openai.com/settings/organization/billing/overview',
  ANTHROPIC_API_KEY: 'https://platform.claude.com/settings/billing',
  ZENMUX_API_KEY: 'https://zenmux.ai/platform/billing',
  ZAI_API_KEY: 'https://z.ai/manage-apikey/billing',
  GROQ_API_KEY: 'https://console.groq.com/settings/billing/manage',
  NOUS_API_KEY: 'https://portal.nousresearch.com/',
  OLLAMA_CLOUD_API_KEY: 'https://ollama.com/settings',
  OPENCODE_API_KEY: 'https://opencode.ai/',
  OPENCODE_GO_API_KEY: 'https://opencode.ai/',
}

/** Settings-Schema: Budgets, Schwellen und Preis-Overrides. */
const SCHEMA = z.object({
  /** Globales Monatsbudget in USD. */
  totalLimitUsd: z.number().default(0).description('Gesamtbudget in USD (0 = kein Limit)'),
  /** Manuell gesetztes Gesamtguthaben; überschreibt die Summe der Provider-Guthaben. */
  totalBalanceUsd: z.number().default(0).description('Gesamtguthaben in USD (0 = Provider-Werte nutzen)'),
  /** Warnschwelle in Prozent des Limits. */
  warnPercent: z.number().default(80).description('Warnschwelle in Prozent'),
  /** Guthaben automatisch bei den Providern abfragen (DeepSeek, OpenRouter). */
  fetchBalance: z.boolean().default(true).description('Guthaben automatisch vom Provider abrufen'),
  /** Abstand der Guthaben-Abfrage in Sekunden. */
  balanceRefreshSeconds: z.number().default(60).description('Abstand der Guthaben-Abfrage in Sekunden'),
  /**
   * Anfragen sperren, wenn ein Budget aufgebraucht ist. Standardmäßig AUS:
   * die Anzeige warnt, blockiert aber nicht.
   */
  blockOnExhausted: z.boolean().default(false).description('Anfragen bei aufgebrauchtem Budget sperren (standardmäßig aus)'),
  /** Budgets je API-Key (Schlüssel: Credential-Ref-Name oder Provider-Route). */
  keys: z.dict(z.object({
    limitUsd: z.number().default(0),
    balanceUsd: z.number().default(0),
    warnPercent: z.number().default(80),
  })).default({}).description('Budgets je API-Key'),
  /** Budgets je Modell (Schlüssel: `provider/modell` oder nur `modell`). */
  models: z.dict(z.object({
    limitUsd: z.number().default(0),
    balanceUsd: z.number().default(0),
    warnPercent: z.number().default(80),
  })).default({}).description('Budgets je Modell'),
  /**
   * Auflade-Adressen je Anbieter (Schlüssel: Credential-Ref-Name).
   * Ergänzt die eingebauten Vorgaben und überschreibt sie — damit lässt sich ein
   * weiterer Anbieter ohne Codeänderung eintragen.
   */
  topUpUrls: z.dict(z.string()).default({}).description('Auflade-Adressen je Anbieter'),
})

/** Ausgangswerte des Schemas, damit das Plugin auch ohne Settings-Dienst läuft. */
const ENTRY = {
  totalLimitUsd: 0,
  totalBalanceUsd: 0,
  warnPercent: 80,
  fetchBalance: true,
  balanceRefreshSeconds: 60,
  blockOnExhausted: false,
  keys: {},
  models: {},
  topUpUrls: {},
}

/**
 * Wirksame Auflade-Adressen: eingebaute Vorgaben, überschrieben von den
 * Settings. Eine leere Zeichenkette entfernt einen Eintrag bewusst.
 * @param {object} config aufgelöste Konfiguration.
 * @returns {Record<string, string>} Anbieter-Schlüsselname → Adresse.
 */
export function resolveTopUpUrls(config) {
  const merged = { ...DEFAULT_TOP_UP_URLS }
  for (const [ref, url] of Object.entries(config?.topUpUrls ?? {})) {
    if (typeof url !== 'string' || url.length === 0) delete merged[ref]
    else merged[ref] = url
  }
  return merged
}

/**
 * Eine Zahl aus den Settings lesen, 0 als "nicht gesetzt" behandeln.
 * @param {unknown} value Rohwert.
 * @returns {number|undefined} Wert oder undefined.
 */
function positive(value) {
  return typeof value === 'number' && value > 0 ? value : undefined
}

/**
 * Höchstabstand zweier Datensätze, die denselben Aufruf beschreiben.
 * Die Crew-Hülle meldet denselben Aufruf wenige Millisekunden nach der echten
 * Provider-Route; das Fenster deckt auch träge Ereigniszustellung ab.
 */
const DUPLICATE_WINDOW_MS = 1_000

/**
 * Ist die Route eine Crew-Hülle?
 * Der Crew-Modus führt denselben Modellaufruf aus und reicht ihn an den echten
 * Provider weiter; beide Durchläufe erreichen den Waterfall.
 * @param {string} provider Provider-Route.
 * @returns {boolean} true für die Crew-Route.
 */
function isCrewRoute(provider) {
  return String(provider ?? '').toLowerCase() === 'crew'
}

/**
 * Beschreiben zwei Datensätze denselben Aufruf über zwei Routen hinweg?
 *
 * Eine Crew-Hülle und die echte Provider-Route melden denselben Aufruf mit
 * identischen Token-Zahlen innerhalb weniger Millisekunden. Verlangt wird
 * deshalb: verschiedene Routen, gleiche Token-Zahlen, kleine Zeitdifferenz.
 * Das Modell wird bewusst NICHT verglichen — die Hülle führt einen eigenen
 * Modellnamen (`crew-1`), während innen das echte Modell läuft.
 * @param {object} a einer der beiden Datensätze.
 * @param {object} b der andere Datensatz.
 * @returns {boolean} true, wenn beide denselben Aufruf beschreiben.
 */
function isSameCallAcrossRoutes(a, b) {
  if (a.provider === b.provider) return false
  if (Math.abs(a.time - b.time) > DUPLICATE_WINDOW_MS) return false
  return a.inputTokens === b.inputTokens
    && a.outputTokens === b.outputTokens
    && (a.cacheReadTokens ?? 0) === (b.cacheReadTokens ?? 0)
    && (a.cacheWriteTokens ?? 0) === (b.cacheWriteTokens ?? 0)
}

/**
 * Ist ein Datensatz die weniger aussagekräftige Crew-Hülle?
 * Die Provider-Route ist bepreisbar, die Hülle nicht; sie wird verworfen bzw.
 * von der Provider-Route ersetzt.
 * @param {object} record Datensatz.
 * @returns {boolean} true, wenn der Datensatz eine Crew-Hülle ist.
 */
function isCrewShell(record) {
  return isCrewRoute(record.provider)
}

/**
 * Crew-Hüllen aus bereits gespeicherten Datensätzen entfernen.
 *
 * Vor der Korrektur aufgezeichnete Dateien enthalten den Aufruf zweimal: einmal
 * unter der Crew-Route (unbepreisbar) und einmal unter der echten Provider-Route.
 * Diese Funktion behält den bepreisbaren Datensatz.
 * @param {object[]} records gespeicherte Datensätze.
 * @returns {object[]} Datensätze ohne Crew-Hüllen mit Provider-Gegenstück.
 */
function dropCrewShells(records) {
  const real = records.filter(r => !isCrewShell(r))
  return records.filter(r => !isCrewShell(r) || !real.some(other => isSameCallAcrossRoutes(other, r)))
}

/**
 * Budget-Konfiguration aus den Settings in die Kernform überführen.
 * Ein Limit von 0 bedeutet "kein Limit"; das wird hier zu undefined, damit
 * `budgetStatus` nicht mit 0-Prozent-Werten rechnet.
 * @param {object} raw aufgelöste Settings.
 * @returns {object} Kernkonfiguration.
 */
export function toBudgetConfig(raw) {
  const source = raw ?? {}
  const keys = {}
  for (const [id, entry] of Object.entries(source.keys ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    keys[id] = {
      limitUsd: positive(entry.limitUsd),
      balanceUsd: positive(entry.balanceUsd),
      warnPercent: typeof entry.warnPercent === 'number' ? entry.warnPercent : undefined,
    }
  }
  const models = {}
  for (const [id, entry] of Object.entries(source.models ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    models[id] = {
      limitUsd: positive(entry.limitUsd),
      balanceUsd: positive(entry.balanceUsd),
      warnPercent: typeof entry.warnPercent === 'number' ? entry.warnPercent : undefined,
    }
  }
  return {
    totalLimitUsd: positive(source.totalLimitUsd),
    totalBalanceUsd: positive(source.totalBalanceUsd),
    warnPercent: typeof source.warnPercent === 'number' ? source.warnPercent : 80,
    fetchBalance: source.fetchBalance !== false,
    balanceRefreshSeconds: positive(source.balanceRefreshSeconds) ?? 60,
    // Sperre nur, wenn sie ausdrücklich eingeschaltet wurde; die Anzeige bleibt
    // unabhängig davon immer aktiv.
    blockOnExhausted: source.blockOnExhausted === true,
    keys,
    models,
  }
}

/**
 * Verbrauchs- und Budget-Zustand des Harness.
 *
 * Hält die Preisliste, die Datensätze und die Guthaben. Alle Zugriffe laufen
 * über diese Klasse, damit die Anzeige nie halb aktualisierte Werte sieht.
 */
export class UsageBudgetTracker {
  /**
   * @param {object} options
   * @param {string} options.dataFile Pfad der persistenten Datensätze.
   * @param {() => object} options.config aktuelle Budget-Konfiguration.
   * @param {(message: string) => void} [options.warn] Diagnoseausgabe.
   * @param {typeof fetch} [options.fetchImpl] Fetch-Implementierung (Tests).
   */
  constructor({ dataFile, config, warn = () => {}, fetchImpl = fetch }) {
    this.dataFile = dataFile
    this.config = config
    this.warn = warn
    this.fetchImpl = fetchImpl
    /** @type {object[]} */
    this.records = []
    this.priceTable = null
    /** @type {Record<string, object>} */
    this.balances = {}
    this.balanceFetchedAt = 0
    /**
     * Laufzeit-Vorgabe für die Aktualisierungsrate in Sekunden.
     * `null` = Wert aus den Settings verwenden, `0` = nur manuell abfragen.
     * Die Anzeige setzt den Wert beim Start und bei jeder Änderung, damit die
     * Rate ohne Neustart des Harness umstellbar ist.
     */
    this.refreshOverrideSeconds = null
    this.load()
  }

  /** Datensätze von der Platte lesen; Fehler dürfen den Start nicht verhindern. */
  load() {
    try {
      const raw = readFileSync(this.dataFile, 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.records)) {
        const filtered = parsed.records.filter(r => r && typeof r.time === 'number')
        // Bestehende Dateien können die Crew-Hüllen noch enthalten, die vor
        // dieser Korrektur aufgezeichnet wurden. Sie werden beim Laden entfernt,
        // damit die Zahlen sofort stimmen und nicht erst nach einem Reset.
        const cleaned = dropCrewShells(filtered)
        this.records = cleaned
        if (cleaned.length !== filtered.length) {
          this.warn(`${filtered.length - cleaned.length} doppelt gezählte Crew-Einträge entfernt`)
        }
      }
      if (parsed?.balances && typeof parsed.balances === 'object') {
        this.balances = parsed.balances
        this.balanceFetchedAt = typeof parsed.balanceFetchedAt === 'number' ? parsed.balanceFetchedAt : 0
      }
    } catch (error) {
      // Fehlende Datei ist der Normalfall beim ersten Start; alles andere wird
      // gemeldet, aber nicht geworfen.
      if (error?.code !== 'ENOENT') {
        this.warn(`gespeicherte Verbrauchsdaten nicht lesbar: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  /** Datensätze atomar sichern (temp + rename), damit kein halber Stand entsteht. */
  persist() {
    try {
      mkdirSync(dirname(this.dataFile), { recursive: true })
      const payload = JSON.stringify({
        version: 1,
        balances: this.balances,
        balanceFetchedAt: this.balanceFetchedAt,
        records: this.records,
      })
      const temp = `${this.dataFile}.tmp`
      writeFileSync(temp, payload, 'utf8')
      renameSync(temp, this.dataFile)
    } catch (error) {
      this.warn(`Verbrauchsdaten nicht speicherbar: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Preistabelle laden (models.dev) und Guthaben aktualisieren.
   * Beides ist optional: ohne Preise bleiben die Kosten 0 und `priced` false,
   * die Anzeige zeigt das als Warnung statt als stille Null.
   * @param {object} [options]
   * @param {boolean} [options.withBalance] Guthaben mit abrufen.
   * @returns {Promise<void>}
   */
  async start({ withBalance = true } = {}) {
    this.priceTable = await fetchPriceTable()
    if (this.priceTable.prices.size === 0) {
      this.warn(`Preiskatalog nicht geladen (${this.priceTable.source}) — Kosten bleiben 0`)
    } else {
      // Aufrufe, die vor dem Laden des Katalogs aufgezeichnet wurden, sind mit
      // Kosten 0 und `priced: false` gespeichert. Ohne diesen Nachlauf blieben
      // sie dauerhaft unbepreist und die Anzeige meldete einen falschen Anteil
      // "ohne bekannten Preis" — obwohl die Preise inzwischen vorliegen.
      this.repriceUnpriced()
    }
    if (withBalance) await this.refreshBalances()
  }

  /**
   * Unbepreiste Datensätze mit dem geladenen Katalog nachrechnen.
   *
   * Die Rohdaten (Token-Zahlen) bleiben erhalten; nur die abgeleiteten Felder
   * Kosten und `priced` werden ersetzt. Treffer werden gespeichert, damit der
   * Nachlauf nicht bei jedem Start erneut nötig ist.
   * @returns {number} Anzahl der nachgerechneten Datensätze.
   */
  repriceUnpriced() {
    const table = this.priceTable
    if (!table || table.prices.size === 0) return 0
    const config = this.config()
    let fixed = 0
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i]
      if (record.priced) continue
      const priced = priceRecord(table, {
        time: record.time,
        provider: record.provider,
        model: record.model,
        keyRef: record.keyRef,
        usage: {
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          cacheReadTokens: record.cacheReadTokens,
          cacheWriteTokens: record.cacheWriteTokens,
        },
        purpose: record.purpose,
        overrides: config.priceOverrides ?? {},
      })
      // Nur ersetzen, wenn jetzt wirklich ein Preis gefunden wurde; sonst bliebe
      // ein unbekanntes Modell stillschweigend als "kostenlos" stehen.
      if (!priced.priced) continue
      this.records[i] = priced
      fixed++
    }
    if (fixed > 0) this.persist()
    return fixed
  }

  /**
   * Umgebungsschlüssel für eine Provider-Route auflösen (nur der NAME).
   * Die Zuordnung kommt aus den Provider-Settings; ohne Settings-Dienst greift
   * die eingebaute Tabelle in `resolveKeyRef`.
   * @param {string} provider Provider-Route.
   * @returns {string} Credential-Ref-Name.
   */
  keyRefFor(provider) {
    const known = this.keyRefsFromSettings?.() ?? {}
    return resolveKeyRef(provider, known)
  }

  /**
   * Einen abgeschlossenen Modellaufruf aufzeichnen.
   * Kein Preis bekannt → Kosten 0 mit `priced: false`; das unterscheidet
   * "unbekanntes Modell" von "kostenlos".
   * @param {object} call Rohdaten des Aufrufs.
   * @returns {object|undefined} der aufgezeichnete Datensatz.
   */
  record(call) {
    if (!call?.provider || !call?.model) return undefined
    // Die Crew-Route ist eine Hülle um den echten Modellaufruf: Sie meldet
    // denselben Verbrauch ein zweites Mal und trägt einen Modellnamen
    // (`crew-1`), den kein Preiskatalog kennt. Aufzeichnen würde jeden Aufruf
    // doppelt zählen (Anfragen und Tokens verdoppelt) und einen unbepreisten
    // Anteil erzeugen. Der echte Provider-Aufruf trägt bereits alles.
    if (isCrewRoute(call.provider)) return undefined
    const usage = call.usage ?? {}
    // Aufrufe ohne jede Token-Angabe tragen keine Information und würden die
    // Statistik mit Nullzeilen verwässern.
    const total = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
      + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
    if (total === 0) return undefined

    const config = this.config()
    const record = priceRecord(this.priceTable ?? { prices: new Map(), byModelOnly: new Map() }, {
      time: call.time ?? Date.now(),
      provider: call.provider,
      model: call.model,
      keyRef: this.keyRefFor(call.provider),
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      },
      purpose: call.purpose,
      overrides: config.priceOverrides ?? {},
    })
    // Kostenanteile wandern mit, damit das Diagramm sie stapeln kann, ohne die
    // Preise erneut aufzulösen.
    record.costInput = record.costInput ?? 0
    record.costOutput = record.costOutput ?? 0
    record.costCacheRead = record.costCacheRead ?? 0
    record.costCacheWrite = record.costCacheWrite ?? 0

    // Doppelzählung ausschließen: Der Crew-Modus umschließt denselben
    // Modellaufruf, den der echte Provider daneben ausführt. Beide Durchläufe
    // erreichen den Waterfall, mit identischen Token-Zahlen und wenigen
    // Millisekunden Abstand. Ohne diesen Schritt stünde jeder Aufruf zweimal in
    // der Statistik und die crew-Route (für den Preiskatalog ein unbekanntes
    // Modell) würde als "ohne bekannten Preis" erscheinen.
    const duplicateIndex = this.records.findIndex(existing => isSameCallAcrossRoutes(existing, record))
    if (duplicateIndex >= 0) {
      const existing = this.records[duplicateIndex]
      // Den aussagekräftigeren Datensatz behalten: die echte Provider-Route ist
      // bepreisbar, die Crew-Hülle nicht. Trifft die Provider-Route zuerst ein,
      // ersetzt sie die Hülle; trifft die Hülle zuerst ein, wird sie verworfen.
      if (isCrewRoute(existing.provider) && !isCrewRoute(record.provider)) {
        this.records[duplicateIndex] = record
        this.persist()
        return record
      }
      return existing
    }

    this.records.push(record)
    if (this.records.length > MAX_RECORDS) {
      // Älteste zuerst verwerfen; die Anzeige rechnet ohnehin im Zeitfenster.
      this.records.splice(0, this.records.length - MAX_RECORDS)
    }
    this.persist()
    return record
  }

  /**
   * Guthaben aller Provider abfragen, die eine Guthaben-API anbieten.
   * Schlüssel werden nur zur Laufzeit aus der Credentials-Auflösung geholt und
   * nie gespeichert oder geloggt.
   * @param {boolean} [force] Auch innerhalb des Abfrageintervalls abrufen.
   * @returns {Promise<void>}
   */
  async refreshBalances(force = false) {
    const config = this.config()
    if (config.fetchBalance === false) return
    // Reihenfolge: Laufzeit-Vorgabe der Anzeige → Settings → Standard 60 s.
    // `0` heißt „nur manuell": dann wird ausschließlich auf Anforderung
    // abgefragt (Refresh-Knopf), nie von selbst.
    const seconds = this.refreshOverrideSeconds ?? config.balanceRefreshSeconds ?? 60
    if (!force && (seconds === 0 || Date.now() - this.balanceFetchedAt < seconds * 1000)) return

    const resolveKey = this.resolveCredential
    if (typeof resolveKey !== 'function') return

    // ALLE konfigurierten Routen abfragen, nicht nur die mit Verbrauch: Ein
    // Anbieter, der noch nichts gekostet hat, hat trotzdem Guthaben — und genau
    // das will man sehen. Vorher wurde nur abgefragt, was schon Geld gekostet
    // hatte, wodurch OpenRouter mit gültigem Schlüssel nie erschien.
    const routes = new Set(Object.keys(this.keyRefsFromSettings?.() ?? {}))
    for (const r of this.records) routes.add(r.provider)
    routes.add('deepseek-official')
    let changed = false
    for (const route of routes) {
      const keyRef = this.keyRefFor(route)
      let apiKey
      try {
        apiKey = await resolveKey(keyRef)
      } catch {
        apiKey = undefined
      }
      const result = await fetchBalance(route, apiKey, this.fetchImpl)
      const previous = this.balances[keyRef]
      this.balances[keyRef] = result
      if (previous?.balanceUsd !== result.balanceUsd || previous?.error !== result.error) changed = true
    }
    this.balanceFetchedAt = Date.now()
    if (changed) this.persist()
  }

  /** Alle Datensätze verwerfen (Settings-Aktion "zurücksetzen"). */
  reset() {
    this.records = []
    this.persist()
  }

  /**
   * Übersicht für die Anzeige bauen.
   * @param {number} [windowDays] Zeitfenster in Tagen.
   * @param {object} [filter] Filter (Tage, API-Key, Modell).
   * @returns {object} Übersicht inklusive Budgets und Verlauf.
   */
  summary(windowDays = WINDOW_DAYS, filter = {}) {
    const table = this.priceTable ?? { prices: new Map(), byModelOnly: new Map(), source: 'unloaded', loadedAt: 0 }
    const records = filterRecords(this.records, {
      days: filter.days ?? windowDays,
      now: filter.now,
    })
    return buildSummary(
      records,
      this.config(),
      {
        source: table.source ?? 'unloaded',
        loadedAt: table.loadedAt ?? 0,
        models: table.prices?.size ?? 0,
      },
      this.balances,
      filter.days ?? windowDays,
      filter.now,
      // Alle konfigurierten Schlüsselnamen (nur Namen) mitgeben, damit die
      // Anzeige die vollständige Liste zeigt und nicht nur den Anbieter, der
      // zufällig schon Geld gekostet hat.
      [...new Set(Object.values(this.keyRefsFromSettings?.() ?? {}))],
    )
  }

  /**
   * Zeitreihe der Kosten, aufgeschlüsselt nach Modell oder API-Key.
   * @param {object} [options]
   * @param {'model'|'key'} [options.groupBy] Gruppierung.
   * @param {number} [options.days] Zeitfenster in Tagen.
   * @param {string} [options.keyRef] nur dieser API-Key.
   * @param {string} [options.model] nur dieses Modell.
   * @param {number} [options.now] Bezugszeitpunkt in ms.
   * @returns {object} Reihe und Gruppenschlüssel.
   */
  timeseries(options = {}) {
    const days = options.days ?? WINDOW_DAYS
    const records = filterRecords(this.records, {
      days,
      keyRef: options.keyRef,
      model: options.model,
      now: options.now,
    })
    return buildTimeseries(records, { groupBy: options.groupBy, days, now: options.now })
  }

  /**
   * Alle bekannten API-Keys und Modelle mit Verbrauch auflisten — die
   * Auswahllisten der Filterleiste.
   * @param {number} [days] Zeitfenster in Tagen.
   * @returns {{keys: object[], models: object[]}} Keys und Modelle.
   */
  facets(days = WINDOW_DAYS) {
    const records = filterRecords(this.records, { days })
    return {
      keys: groupBy(records, r => r.keyRef).map(g => ({ id: g.id, label: g.label, cost: g.cost, requests: g.requests })),
      models: groupBy(records, r => `${r.provider}/${r.model}`)
        .map(g => ({ id: g.id, label: g.label, cost: g.cost, requests: g.requests })),
    }
  }

  /**
   * Datensätze als CSV ausgeben (Export-Schaltfläche).
   * @param {object} [options] Filter wie bei {@link timeseries}.
   * @returns {string} CSV mit Kopfzeile.
   */
  exportCsv(options = {}) {
    const days = options.days ?? WINDOW_DAYS
    const records = filterRecords(this.records, {
      days,
      keyRef: options.keyRef,
      model: options.model,
      now: options.now,
    })
    const head = 'time_utc,provider,model,api_key_ref,purpose,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,priced'
    const rows = records.map(r => [
      new Date(r.time).toISOString(),
      r.provider,
      r.model,
      r.keyRef,
      r.purpose ?? '',
      r.inputTokens,
      r.outputTokens,
      r.cacheReadTokens,
      r.cacheWriteTokens,
      r.cost.toFixed(8),
      r.priced ? '1' : '0',
    ].map(value => {
      const text = String(value)
      // CSV-Felder mit Komma oder Anführungszeichen werden gequotet.
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }).join(','))
    return [head, ...rows].join('\n')
  }

  /**
   * Ist ein Budget aufgebraucht?
   * Grundlage für die optionale Sperre (`blockOnExhausted`); die Anzeige nutzt
   * dieselben Werte für die Warnung.
   * @returns {{blocked: boolean, reason?: string}} Sperrzustand.
   */
  budgetCheck() {
    const config = this.config()
    if (config.blockOnExhausted !== true) return { blocked: false }
    const summary = this.summary()
    const total = summary.totalStatus
    if (total.limitUsd !== null && total.exceeded) {
      return {
        blocked: true,
        reason: `Gesamtbudget aufgebraucht: ${total.spentUsd.toFixed(2)} von ${total.limitUsd.toFixed(2)} USD`,
      }
    }
    for (const status of summary.keyStatus) {
      if (status.limitUsd !== null && status.exceeded) {
        return {
          blocked: true,
          reason: `Budget für ${status.label} aufgebraucht: ${status.spentUsd.toFixed(2)} von ${status.limitUsd.toFixed(2)} USD`,
        }
      }
    }
    return { blocked: false }
  }
}

/**
 * Verbrauch aus dem `llm/stream`-Waterfall abgreifen.
 * Der Stream wird unverändert durchgereicht; die Aufzeichnung ist ein
 * Nebeneffekt und darf den Aufruf weder verzögern noch verändern.
 * @param {UsageBudgetTracker} tracker Ziel der Aufzeichnung.
 * @param {object} options der Modellaufruf.
 * @param {AsyncIterable<object>} stream der Original-Stream.
 * @returns {AsyncIterable<object>} derselbe Stream.
 */
async function* teeUsage(tracker, options, stream) {
  for await (const chunk of stream) {
    if (chunk?.type === 'usage' && chunk.usage) {
      try {
        tracker.record({
          provider: options.provider,
          model: options.model,
          usage: chunk.usage,
          purpose: options.purpose,
          time: Date.now(),
        })
      } catch (error) {
        // Eine fehlerhafte Aufzeichnung darf den Modellaufruf nicht brechen.
        tracker.warn(`Aufzeichnung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    yield chunk
  }
}

/**
 * Ein vollständig verdrahtetes Tracker-Objekt bauen.
 *
 * Getrennt von {@link apply}, damit die Aufzeichnung ohne Cordis-Kontext
 * geprüft werden kann (Tests) und der Host-Teil dünn bleibt.
 * @param {object} options
 * @param {string} options.dataFile Pfad der persistenten Datensätze.
 * @param {() => object} options.config aktuelle Budget-Konfiguration.
 * @param {(message: string) => void} [options.warn] Diagnoseausgabe.
 * @param {typeof fetch} [options.fetchImpl] Fetch-Implementierung (Tests).
 * @returns {UsageBudgetTracker} Tracker.
 */
export function createTracker({ dataFile, config, warn, fetchImpl }) {
  return new UsageBudgetTracker({ dataFile, config, warn, fetchImpl })
}

/**
 * Plugin-Einstieg.
 * @param {import('@deepseek-ai/cordis').Context} ctx Host-Kontext.
 * @param {object} [config] Loader-Konfiguration (überschreibt Dateipfad).
 */
export function apply(ctx, config = {}) {
  const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.cwd(), '.dsh')
  const dataFile = config.dataFile ?? join(home, 'usage-budget', 'usage.json')

  /** Aktuelle Budget-Konfiguration; wird von installSettingsSection gesetzt. */
  let current = () => ENTRY
  const tracker = createTracker({
    dataFile,
    config: () => toBudgetConfig(current()),
    warn: message => ctx.logger?.warn?.(`[usage-budget] ${message}`),
  })

  // Zuordnung Provider-Route → Credential-Ref aus den Provider-Settings lesen.
  // Nur der Ref-NAME wird verwendet; der Schlüsselwert bleibt im Credentials-Dienst.
  tracker.keyRefsFromSettings = () => {
    const settings = ctx.get('settings')
    if (!settings) return {}
    const map = {}
    for (const ns of ['llm-deepseek', 'llm-pi-ai']) {
      let value
      try {
        value = settings.get(ns)
      } catch {
        continue
      }
      for (const [provider, providerConfig] of Object.entries(value?.providers ?? {})) {
        if (typeof providerConfig?.apiKeyEnv === 'string') map[provider] = providerConfig.apiKeyEnv
      }
      if (typeof value?.apiKeyEnv === 'string') {
        map[ns === 'llm-deepseek' ? 'deepseek-official' : ns] = value.apiKeyEnv
      }
    }
    return map
  }

  // Schlüsselwerte zur Laufzeit auflösen — nur für den Balance-Abruf, nie
  // gespeichert und nie geloggt.
  tracker.resolveCredential = async ref => {
    const credentials = ctx.get('credentials')
    if (!credentials?.resolve) return undefined
    const hit = await credentials.resolve(ref)
    return hit?.value
  }

  installSettingsSection(ctx, settingsNamespace(name), SCHEMA, ENTRY, {
    setSource: source => {
      current = source
    },
    onChange: () => {
      // Budget-Änderungen wirken sofort, weil summary() die Konfiguration bei
      // jedem Aufruf neu liest; hier nur den Guthaben-Takt neu bewerten.
      void tracker.refreshBalances().catch(() => {})
    },
  })

  // Aufzeichnung: jeder Modellaufruf des Harness läuft durch diesen Waterfall.
  ctx.on('llm/stream', (options, next) => teeUsage(tracker, options, next()))

  // Datenkanal zum Browser. `rpc.handle` registriert die HTTP-Route und wendet
  // die Trust-Prüfung selbst an; der Client ruft über `connection.rpc.call`.
  const removeChannel = ctx.connection.rpc.handle('/usage-budget', async (endpoint, payload) => {
    // Der Client schickt seine Filter mit; fehlende Felder fallen auf die
    // Standardwerte zurück, damit ein Aufruf ohne Payload gültig bleibt.
    const p = payload && typeof payload === 'object' ? payload : {}
    const options = {
      days: typeof p.days === 'number' && p.days > 0 ? p.days : WINDOW_DAYS,
      keyRef: typeof p.keyRef === 'string' ? p.keyRef : undefined,
      model: typeof p.model === 'string' ? p.model : undefined,
      groupBy: p.groupBy === 'key' ? 'key' : 'model',
    }

    if (endpoint === 'summary') {
      return { ok: true, value: tracker.summary(options.days) }
    }
    if (endpoint === 'timeseries') {
      return { ok: true, value: tracker.timeseries(options) }
    }
    if (endpoint === 'facets') {
      return { ok: true, value: tracker.facets(options.days) }
    }
    if (endpoint === 'config') {
      const config = tracker.config()
      return {
        ok: true,
        value: {
          totalLimitUsd: config.totalLimitUsd ?? 0,
          totalBalanceUsd: config.totalBalanceUsd ?? 0,
          warnPercent: config.warnPercent ?? 80,
          fetchBalance: config.fetchBalance !== false,
          balanceRefreshSeconds: config.balanceRefreshSeconds ?? 60,
          blockOnExhausted: config.blockOnExhausted === true,
          keys: config.keys ?? {},
          models: config.models ?? {},
          // Auflade-Adressen mitgeben, damit die Anzeige den Knopf für den
          // passenden Anbieter öffnen kann, statt fest auf DeepSeek zu zeigen.
          topUpUrls: resolveTopUpUrls(config),
          // Wirksame Aktualisierungsrate: Laufzeit-Vorgabe der Anzeige hat
          // Vorrang vor den Settings. Die Anzeige zeigt damit den Wert, der
          // tatsächlich gilt, und muss ihn nicht selbst erraten.
          refreshSeconds: tracker.refreshOverrideSeconds ?? config.balanceRefreshSeconds ?? 60,
        },
      }
    }
    if (endpoint === 'setInterval') {
      // Aktualisierungsrate zur Laufzeit umstellen, damit die Wahl sofort wirkt
      // und kein Neustart des Harness nötig ist. `0` heißt „nur manuell".
      const seconds = Number(p.seconds)
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) {
        return {
          ok: false,
          error: {
            code: 'internal',
            message: `Aktualisierungsintervall muss zwischen 0 und 3600 Sekunden liegen (erhalten: ${String(p.seconds)})`,
            details: {},
          },
        }
      }
      // Unter 1 Sekunde wäre eine Last ohne Nutzen; krumme Werte werden gerundet.
      tracker.refreshOverrideSeconds = seconds === 0 ? 0 : Math.max(1, Math.round(seconds))
      return {
        ok: true,
        value: { ok: true, refreshSeconds: tracker.refreshOverrideSeconds },
      }
    }
    if (endpoint === 'export') {
      return { ok: true, value: tracker.exportCsv(options) }
    }
    if (endpoint === 'refresh') {
      await tracker.refreshBalances(true)
      return { ok: true, value: tracker.summary(options.days) }
    }
    if (endpoint === 'reset') {
      tracker.reset()
      return { ok: true, value: tracker.summary(options.days) }
    }
    // Unbekannte Endpunkte müssen einen Code aus der geschlossenen Fehler-Union
    // des Harness tragen und `details` mitliefern: Der Client validiert die
    // Antwort gegen sein Wire-Schema und könnte eine erfundene Kennung nicht
    // lesen — ein Fehler in der Fehlerbehandlung würde dann als unlesbarer
    // Validierungsfehler erscheinen statt als klare Meldung.
    // Unbekannte Endpunkte müssen einen Code aus der geschlossenen Fehler-Union
    // des Harness tragen UND `details` mitliefern. Der Client validiert die
    // Antwort gegen sein Wire-Schema; eine erfundene Kennung oder ein fehlendes
    // `details` macht die Antwort unlesbar — der Fehler erschiene dann als roher
    // Validierungsdump statt als klare Meldung.
    return {
      ok: false,
      error: { code: 'internal', message: `unbekannter Endpunkt "${endpoint}"`, details: {} },
    }
  }, { authority: 'trusted-host' })

  // Preise und Guthaben im Hintergrund laden und danach regelmäßig auffrischen.
  const startup = setTimeout(() => {
    void tracker.start().catch(error => {
      tracker.warn(`Start fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, BALANCE_STARTUP_DELAY_MS)
  if (typeof startup.unref === 'function') startup.unref()

  // Kurzer Takt: Den Rhythmus bestimmt die eingestellte Rate, nicht der Takt
  // selbst. 2 s, damit auch eine kurze Wahl (5 s) wirklich greift — vorher lag
  // der Takt bei 15 s und wurde damit selbst zur zweiten Bremse. Ist das
  // Fenster noch nicht abgelaufen, kehrt refreshBalances sofort zurück; das ist
  // nur ein Zahlenvergleich und kostet nichts.
  const ticker = setInterval(() => {
    void tracker.refreshBalances().catch(() => {})
  }, 2_000)
  if (typeof ticker.unref === 'function') ticker.unref()

  // Abräumen bei Plugin-Entladung (HMR-Sicherheit): Timer, Kanal und Daten.
  ctx.effect(() => () => {
    clearTimeout(startup)
    clearInterval(ticker)
    void removeChannel()
    tracker.persist()
  })
}

export { parseModelsDev }
