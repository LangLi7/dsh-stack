// dsh-ponytail — Host-Teil
//
// Der Schalter hinter dem Ponytail-Chip im Composer. Er besitzt genau eine
// Wirkung: die beiden Aufruf-Schlüssel im YAML-Frontmatter der Ponytail-Skills
// umzuschreiben. Das ist der Mechanismus, den das Harness ohnehin liest —
// `disable-model-invocation: true` nimmt ein Skill aus dem Modell-Katalog und
// aus dem `skill`-Lader, `user-invocable: false` aus den menschlichen
// Kommandos. Es wird also nichts erfunden und nichts gepatcht: "aus" bedeutet
// für das Harness schlicht, dass es diese Skills nicht mehr gibt, und der
// Dateiwatcher des Skill-Providers zieht die Änderung ohne Neustart nach.
//
// Kein Zustand außer der Datei auf der Platte: die Zustandsdatei ist nur die
// Bequemlichkeit, mit der der Chip seinen Knopf beschriftet. Weicht sie von den
// Skills ab (jemand hat von Hand editiert), gewinnt die Datei auf der Platte
// und der Status meldet `drift`.
//
// Zwei Oberflächen, ein Weg: der Chip ruft `rpc`, das Slash-Kommando ruft
// dieselben zwei Funktionen aus gate.js.

import {
  defaultSkillRoots,
  defaultStateFile,
  readStatus,
  setEnabled,
} from './gate.js'

/** Cordis-Plugin-Name (zugleich Client-Bundle-id). */
export const name = 'dsh-ponytail'

/**
 * Der RPC-Kanal braucht den Connection-Dienst. `commands` ist optional
 * (ctx.get), damit das Plugin auch ohne Kommando-Registry lädt.
 */
export const inject = ['connection']

/**
 * Übersetzt einen Text-Zustand aus Kommando oder Payload in einen Zielzustand.
 * `toggle` braucht den aktuellen Zustand, deshalb bekommt es ihn übergeben.
 * @param raw - `on`, `off`, `toggle`, `an`, `aus`, `true`, `false`, …
 * @param current - der aktuell geltende Zustand, für `toggle`.
 * @returns der Zielzustand, oder undefined bei unbekannter Eingabe.
 */
function parseTarget(raw, current) {
  if (typeof raw !== 'string') return undefined
  switch (raw.trim().toLowerCase()) {
    case 'on': case 'an': case 'true': case 'yes': case 'ein': case 'enable': case 'enabled':
      return true
    case 'off': case 'aus': case 'false': case 'no': case 'disable': case 'disabled':
      return false
    case 'toggle': case 'switch': case 'umschalten':
      return !current
    default:
      return undefined
  }
}

/**
 * Der eine Satz, den beide Oberflächen zeigen, wenn der Schalter umgelegt ist.
 * @param enabled - der neue Zustand.
 * @returns die Meldung.
 */
function headline(enabled) {
  return enabled
    ? 'Ponytail ist AN — die lazy-senior-dev-Regeln sind wieder im Katalog.'
    : 'Ponytail ist AUS — arbeite ohne Ponytail.'
}

/**
 * Cordis-Plugin-Body: RPC-Kanal, optionales Slash-Kommando, sonst nichts.
 * @param ctx - Host-Kontext.
 * @param config - optionale Überschreibungen für Zustandsdatei und Wurzeln.
 */
export function apply(ctx, config = {}) {
  // Die Defaults werden HIER aufgelöst, nicht beim Import: erst jetzt steht
  // die Umgebung des laufenden Harness fest.
  const options = {
    stateFile: typeof config.stateFile === 'string' ? config.stateFile : defaultStateFile(),
    roots: Array.isArray(config.skillRoots) && config.skillRoots.length > 0
      ? config.skillRoots
      : defaultSkillRoots(),
  }
  const status = () => readStatus(options.stateFile, options.roots)
  const setState = (enabled) => {
    const report = setEnabled(enabled, options)
    return { ...report, message: headline(report.enabled) }
  }

  // Einmal beim Laden den Schalter anwenden: die Zustandsdatei ist die Absicht,
  // die Skills sind die Wirkung. Ohne diesen Abgleich könnte ein Neustart des
  // Harness die Absicht verlieren, wenn die Dateien von Hand zurückgesetzt
  // wurden — hier werden beide wieder auf denselben Stand gebracht.
  try {
    const current = status()
    if (current.persisted !== undefined && current.effective !== current.persisted) {
      setState(current.persisted)
    }
  } catch (error) {
    ctx.logger?.warn?.(`[ponytail] Startabgleich fehlgeschlagen: ${error.message}`)
  }

  // Datenkanal zum Browser. `rpc.handle` registriert die HTTP-Route und wendet
  // die Trust-Prüfung selbst an; der Chip ruft über `connection.rpc.call`.
  // `authority` ist Pflicht: 'trusted-host' lässt dieselben Authorities zu, die
  // die Connection bereits vertraut (Loopback und die konfigurierten
  // Tunnel-Hosts) — dieselbe Wahl wie beim Nachbar-Plugin dsh-usage-budget.
  const removeChannel = ctx.connection.rpc.handle('/ponytail', async (endpoint, payload) => {
    const p = payload && typeof payload === 'object' ? payload : {}
    try {
      if (endpoint === 'status') return { ok: true, value: status() }
      if (endpoint === 'set' || endpoint === 'toggle') {
        const target = endpoint === 'toggle'
          ? parseTarget('toggle', status().enabled)
          : parseTarget(p.enabled === true ? 'on' : p.enabled === false ? 'off' : String(p.enabled ?? p.value ?? ''), status().enabled)
        if (target === undefined) {
          return { ok: false, error: { message: 'erwartet on|off|toggle' } }
        }
        return { ok: true, value: setState(target) }
      }
      return { ok: false, error: { message: `unbekannter Endpunkt "${endpoint}"` } }
    } catch (error) {
      return { ok: false, error: { message: error.message } }
    }
  }, { authority: 'trusted-host' })

  ctx.effect(() => () => { removeChannel?.() }, 'dsh-ponytail: Schalter-Kanal')

  // Optionales Slash-Kommando: derselbe Weg, nur getippt. Fehlt die
  // Kommando-Registry, bleibt der Chip die einzige Oberfläche.
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(() => commands.register({
      name: 'ponytail',
      description: 'Ponytail an- oder ausschalten (on|off|toggle|status) — schaltet die Ponytail-Skills im Skill-Katalog um.',
      input: { hint: 'on | off | toggle | status' },
      handler: ({ rawInput }) => {
        const argument = rawInput.trim()
        try {
          if (argument === '' || argument === 'status') {
            const current = status()
            return {
              kind: 'success',
              text: `${headline(current.enabled)} ${current.skills.length} Skills: ${current.skills.map(s => s.skill).join(', ') || 'keine gefunden'}${current.drift ? ' (Zustandsdatei und Dateien laufen auseinander)' : ''}`,
            }
          }
          const target = parseTarget(argument, status().enabled)
          if (target === undefined) {
            return { kind: 'error', text: `Unbekanntes Argument "${argument}". Erlaubt: on, off, toggle, status.` }
          }
          const report = setState(target)
          return { kind: 'success', text: `${report.message} (${report.skills.length} Skills umgestellt)` }
        } catch (error) {
          return { kind: 'error', text: `Ponytail-Schalter fehlgeschlagen: ${error.message}` }
        }
      },
    }), 'dsh-ponytail: /ponytail')
  }
}
