// Prüft den Chip selbst — nicht den Schalter, sondern das, was der Mensch
// sieht und anklickt. Der Client-Teil wird so geladen, wie das Harness ihn
// lädt: über `window.__ModuleLoader__`, mit dem echten Bundle aus lib/client.js.
// Gerendert wird in jsdom, damit beide Zustände belegbar sind statt behauptet.
//
// React, react-dom und jsdom kommen aus dem Harness-Checkout — dieses Plugin
// hat bewusst keine eigenen Abhängigkeiten. Wo der Checkout liegt, sagt die
// Umgebung; die Testdatei selbst kennt keinen Rechnerpfad.

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = resolve(HERE, '..')

/**
 * Den Harness-Checkout finden, aus dem jsdom und React kommen.
 * `DSH_CHECKOUT` gewinnt, sonst die üblichen Nachbarorte.
 * @returns Pfad der package.json des Checkouts.
 * @throws wenn keiner gefunden wird — dann fehlt eine Vorbedingung, nicht der Test.
 */
function findCheckout() {
  const candidates = [
    process.env.DSH_CHECKOUT,
    join(process.env.DSH_HOME ?? '', '..', 'deepseek-harness'),
    resolve(PLUGIN_ROOT, '..', '..', '..', '..', '..', 'deepseek-harness'),
  ].filter(candidate => typeof candidate === 'string' && candidate !== '')
  for (const candidate of candidates) {
    const manifest = candidate.endsWith('package.json') ? candidate : join(candidate, 'package.json')
    if (existsSync(manifest)) return manifest
  }
  throw new Error('harness checkout not found; set DSH_CHECKOUT to its directory')
}

const CHECKOUT = findCheckout()
const requireFromCheckout = createRequire(CHECKOUT)
const { JSDOM } = requireFromCheckout('jsdom')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 24 stellt `navigator` nur lesbar bereit; defineProperty übernimmt die
// jsdom-Fassung, ohne den eigenen Deskriptor zu verletzen.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = requireFromCheckout('react')
const { createRoot } = requireFromCheckout('react-dom/client')
const { act } = requireFromCheckout('react')

/**
 * Lädt den Client-Teil und gibt die Komponente zurück, die er in
 * `conversation.input.left` einhängt — zusammen mit dem RPC-Stub, über den sie
 * mit dem Host spricht.
 * @param stateFile - der Zustand, den der Stub-Host meldet.
 * @returns die registrierte Komponente.
 */
async function loadChip(stateFile) {
  let handoff
  dom.window.__ModuleLoader__ = { load: (value) => { handoff = value } }

  // Das echte Bundle, unverändert — dieselbe Datei, die der Host unter
  // /plugins/dsh-ponytail/client.js ausliefert. Ein Zähler im Query-String,
  // weil ESM einen Modulrumpf nur einmal ausführt: ohne ihn meldet sich das
  // Bundle nur beim ersten Test bei __ModuleLoader__ an.
  loadChip.runs = (loadChip.runs ?? 0) + 1
  const bundle = pathToFileURL(join(PLUGIN_ROOT, 'lib', 'client.js')).href
  await import(`${bundle}?run=${loadChip.runs}`)
  assert.ok(handoff, 'das Bundle hat sich nicht bei __ModuleLoader__ angemeldet')
  assert.equal(handoff.id, 'dsh-ponytail')

  // Der Stub-Host: dieselbe Antwortform wie ctx.connection.rpc.handle.
  const rpc = {
    calls: [],
    async call(channel, endpoint) {
      rpc.calls.push(`${channel}/${endpoint}`)
      if (endpoint === 'toggle') stateFile.enabled = !stateFile.enabled
      return { ok: true, value: { ...stateFile, skills: [], drift: false } }
    },
  }

  let registered
  const ctx = {
    get: (name) => (name === 'connection' ? { rpc } : undefined),
    slots: {
      // `inject` wartet im Harness, bis der Slot deklariert ist; hier ist er
      // sofort da, also wird der Registrierungs-Callback direkt aufgerufen.
      inject: (name, register) => { register() },
      register: (options, component) => {
        registered = { options, component }
        return () => {}
      },
    },
  }

  const plugin = handoff.factory(requireFromCheckout)
  plugin.apply(ctx)
  assert.ok(registered?.options, 'der Chip wurde in keinen Slot registriert')
  assert.equal(registered.options.name, 'conversation.input.left')
  return registered.component
}

/** Den Chip montieren und den Text des Knopfes zurückgeben. */
async function render(enabled) {
  const stateFile = { enabled }
  const Component = await loadChip(stateFile)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(Component()) })
  const button = container.querySelector('button.pt-chip')
  return {
    state: { ...stateFile },
    button,
    text: () => container.querySelector('button.pt-chip')?.textContent ?? null,
    attribute: name => container.querySelector('button.pt-chip')?.getAttribute(name) ?? null,
    click: async () => { await act(async () => { button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) }) },
    /** Der Stub teilt sein Zustandsobjekt; der Host-Check ist damit beobachtbar. */
    host: stateFile,
  }
}

test('eingeschaltet: der Chip sitzt links im Composer und zeigt "an"', async () => {
  const chip = await render(true)
  assert.match(chip.text(), /Ponytail/)
  assert.match(chip.text(), /an/)
  assert.equal(chip.attribute('data-state'), 'on')
  assert.equal(chip.attribute('aria-pressed'), 'true')
  assert.match(chip.attribute('title'), /ohne Ponytail/)
})

test('ausgeschaltet: derselbe Chip zeigt "aus" und sagt, was das heißt', async () => {
  const chip = await render(false)
  assert.match(chip.text(), /aus/)
  assert.equal(chip.attribute('data-state'), 'off')
  assert.equal(chip.attribute('aria-pressed'), 'false')
  assert.match(chip.attribute('title'), /arbeite ohne Ponytail/)
})

test('ein Klick schaltet den Host um, und der Chip zeigt das Ergebnis', async () => {
  const chip = await render(true)
  assert.equal(chip.attribute('data-state'), 'on')

  await chip.click()

  assert.deepEqual(chip.host, { enabled: false }, 'der Host wurde nicht umgeschaltet')
  assert.equal(chip.attribute('data-state'), 'off')
  assert.match(chip.text(), /aus/)
  assert.deepEqual(chip.button.ownerDocument.defaultView, dom.window)

  await chip.click()
  assert.deepEqual(chip.host, { enabled: true }, 'der zweite Klick kam nicht an')
  assert.equal(chip.attribute('data-state'), 'on')
})

test('der Chip liest seinen Zustand vom Host, statt ihn zu raten', async () => {
  const chip = await render(false)
  // Ein zweiter Betrachter (anderer Tab, Slash-Kommando) hat umgeschaltet:
  // der nächste Klick muss auf dem Host-Zustand aufsetzen, nicht auf dem
  // zuletzt gerenderten.
  chip.host.enabled = true
  await chip.click()
  assert.deepEqual(chip.host, { enabled: false })
})
