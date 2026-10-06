// dsh-i18n-de — DSH Deutsch-Plugin
// Fängt Tool-Ausführungsergebnisse ab und ersetzt englische Markierungen durch Deutsch.
// Settings-Umschalter: Einstellungen → dsh-i18n-de → aktiviert

import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

const name = 'dsh-i18n-de'
const inject = ['tools']

// ── Einstellungen ────────────────────────────────────────────────────────────

const I18N_NAMESPACE = settingsNamespace('dsh-i18n-de')
const I18N_SCHEMA = z.object({ enabled: z.boolean().default(true) })

// ── Ersetzungsregeln ─────────────────────────────────────────────────────────

const RULES = [
  [/Error: tool call timed out after (\d+)ms/g,
   (_, ms) => `Fehler: Tool-Aufruf nach ${ms} ms abgelaufen`],
  [/Error: tool call aborted before dispatch/g,
   'Fehler: Tool-Aufruf vor dem Versand abgebrochen'],
  [/tool call aborted before dispatch/g,
   'Tool-Aufruf vor dem Versand abgebrochen'],
  [/\[timed out after (\d+)ms\]/g,
   (_, ms) => `[Zeitüberschreitung: nach ${ms} ms]`],
  [/\[exit code: (-?\d+)\]/g,
   (_, code) => `[Exit-Code: ${code}]`],
  [/\[killed by signal: ([^\]]+)\]/g,
   (_, sig) => `[durch Signal beendet: ${sig}]`],
  [/\[stderr\]/g,
   '[Standardfehler]'],
  [/\(no output\)/g,
   '(keine Ausgabe)'],
  [/\(no new output\)/g,
   '(keine neue Ausgabe)'],
  [/\[output truncated; full output: \(unavailable\)\]/g,
   '[Ausgabe gekürzt; vollständige Ausgabe: (nicht verfügbar)]'],
  [/\[output truncated; full output: ([^\]]+)\]/g,
   (_, path) => `[Ausgabe gekürzt; vollständige Ausgabe: ${path}]`],
  [/\[some output was dropped from memory; full output: \(unavailable\)\]/g,
   '[Ein Teil der Ausgabe wurde aus dem Speicher verworfen; vollständige Ausgabe: (nicht verfügbar)]'],
  [/\[some output was dropped from memory; full output: ([^\]]+)\]/g,
   (_, path) => `[Ein Teil der Ausgabe wurde aus dem Speicher verworfen; vollständige Ausgabe: ${path}]`],
  [/\[sandbox: file access denied under <([^>]+)> mode\]/g,
   (_, mode) => `[Sandbox: Dateizugriff verweigert im Modus ${mode}]`],
  [/\[sandbox: the sandbox runner itself failed under ([^\]]+) mode — the command did not run; this is a sandbox problem, not a command failure\]/g,
   (_, mode) => `[Sandbox: Der Sandbox-Runner selbst ist im Modus ${mode} fehlgeschlagen — der Befehl wurde nicht ausgeführt; dies ist ein Sandbox-Problem, kein Befehlsfehler]`],
  [/\[sandbox: file access denied under ([^\]]+) mode\]/g,
   (_, mode) => `[Sandbox: Dateizugriff verweigert im Modus ${mode}]`],
  [/started background job ([^\s]+)/g,
   (_, id) => `Hintergrund-Job gestartet: ${id}`],
  [/"only core types" errors/g,
   '"nur Kern-Typen"-Fehler'],
  [/\[some output was dropped from memory([^\]]*)\]/g,
   (_, detail) => `[Ein Teil der Ausgabe wurde aus dem Speicher verworfen${detail}]`],
  // Tool-Argumentvalidierungsfehler
  [/invalid arguments: /g,
   'Ungültige Argumente: '],
  [/missing required property "([^"]+)"/g,
   (_, prop) => `fehlende erforderliche Eigenschaft „${prop}“`],
  // Tool-Ausführungsfehler (Klasse ②)
  [/unknown tool "([^"]+)"/g,
   (_, name) => `Unbekanntes Tool „${name}“`],
  [/code run failed \(([^)]*)\)/g,
   (_, kind) => `Codeausführung fehlgeschlagen (${kind})`],
  [/tool arguments must be lossless JSON/g,
   'Tool-Argumente müssen verlustfreies JSON sein'],
  [/tool call aborted/g,
   'Tool-Aufruf abgebrochen'],
  // LLM-Anfragefehler (Klasse ③)
  [/no adapter registered for provider "([^"]+)"/g,
   (_, p) => `Kein Adapter für Provider „${p}“ registriert`],
  [/provider "([^"]+)" model "([^"]+)" does not support reasoning effort "([^"]+)"/g,
   (_, p, m, e) => `Provider „${p}“, Modell „${m}“ unterstützt die Reasoning-Intensität „${e}“ nicht`],
  // Subagent-Fehler (Klasse ④)
  [/subagent "([^"]+)" is unavailable/g,
   (_, id) => `Subagent „${id}“ ist nicht verfügbar`],
  [/no subagent provider registered for "([^"]+)"/g,
   (_, name) => `Kein Subagent-Provider für „${name}“ registriert`],
  [/subagent "([^"]+)" has no supported continuation state and cannot be resumed; do not retry send_message with this id/g,
   (_, id) => `Subagent „${id}“ hat keinen unterstützten Fortsetzungszustand und kann nicht fortgesetzt werden; send_message mit dieser id nicht erneut versuchen`],
  // Sitzungswiederherstellungsfehler (Klasse ⑤)
  [/resume failed for session "([^"]+)"/g,
   (_, id) => `Fortsetzen der Sitzung „${id}“ fehlgeschlagen`],
  // Agent-Loop-Fehler (Klasse ⑥)
  [/agent "([^"]+)" has no provider\/model/g,
   (_, id) => `Agent „${id}“ hat keinen Provider/kein Modell`],
  [/agent loop is not active/g,
   'Agent-Loop ist nicht aktiv'],
]

function localize(str) {
  if (typeof str !== 'string') return str
  let result = str
  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

function localizeToolResult(result) {
  if (!result || typeof result !== 'object') return result
  const output = { ...result }
  if (Array.isArray(output.content)) {
    output.content = output.content.map((block) => {
      if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        const localized = localize(block.text)
        return localized !== block.text ? { ...block, text: localized } : block
      }
      return block
    })
  }
  if (output.error && typeof output.error.message === 'string') {
    output.error = { ...output.error, message: localize(output.error.message) }
  }
  if (output.error && output.error.info && typeof output.error.info.message === 'string') {
    output.error = { ...output.error, info: { ...output.error.info, message: localize(output.error.info.message) } }
  }
  return output
}

// ── Plugin-Einstieg ─────────────────────────────────────────────────────────

function apply(ctx) {
  // Schalterzustand: standardmäßig aktiviert
  let enabled = true

  // Einstellungen registrieren (Einstellungen → dsh-i18n-de → aktiviert)
  installSettingsSection(ctx, I18N_NAMESPACE, I18N_SCHEMA, { enabled: true }, {
    validate: () => {},
    setSource: (current) => {
      enabled = current().enabled
    },
    onChange: () => {}
  })

  // Tool-Ausführungsergebnisse abfangen (inkl. Fehler)
  ctx.on('tools/execute', async (exec, next) => {
    try {
      const result = await next()
      if (!result || !enabled) return result
      return localizeToolResult(result)
    } catch (error) {
      // Tool-Ausführungsfehler (z. B. ToolArgsError) ebenfalls übersetzen
      if (!enabled) throw error
      const msg = error && typeof error.message === 'string' ? error.message : String(error)
      const localized = localize(msg)
      if (localized === msg) throw error
      const translated = new Error(localized)
      if (error && error.name) translated.name = error.name
      if (error && error.code !== void 0) translated.code = error.code
      throw translated
    }
  })
}

export { apply, inject, name }
