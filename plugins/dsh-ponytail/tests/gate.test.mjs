// Ein Selbsttest für den Schalter — die kleinste Sache, die bricht, wenn die
// Frontmatter-Logik bricht. Kein Framework nötig: node:test ist da.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyGate, readGate } from '../lib/gate.js'

const SAMPLE = `---
name: ponytail-gain
description: >
  Eine Beschreibung über mehrere Zeilen,
  die eine disable-model-invocation: Zeile enthält.
homepage: https://example.invalid
---

# Körper
`

test('aus schreibt beide Schlüssel und lässt Block-Skalare in Ruhe', () => {
  const off = applyGate(SAMPLE, false)
  assert.match(off, /^---\n/)
  assert.match(off, /\ndisable-model-invocation: true\n/)
  assert.match(off, /\nuser-invocable: false\n/)
  // Der eingerückte Text im Block-Skalar darf nicht als Schlüssel gelten.
  assert.match(off, /die eine disable-model-invocation: Zeile enthält\./)
  assert.equal(readGate(off), false)
  // Der Körper bleibt unangetastet.
  assert.ok(off.endsWith('\n\n# Körper\n'))
})

test('an schreibt beide Schlüssel positiv', () => {
  const on = applyGate(applyGate(SAMPLE, false), true)
  assert.match(on, /\ndisable-model-invocation: false\n/)
  assert.match(on, /\nuser-invocable: true\n/)
  assert.equal(readGate(on), true)
})

test('wiederholtes Schreiben ändert nichts', () => {
  const once = applyGate(SAMPLE, false)
  assert.equal(applyGate(once, false), once)
  const twice = applyGate(once, true)
  assert.equal(applyGate(twice, true), twice)
})

test('eine Datei ohne Frontmatter wird abgelehnt, statt halb geschrieben zu werden', () => {
  assert.throws(() => applyGate('# kein Frontmatter\n', false), /Frontmatter/)
})

test('ohne Schlüssel ist der Zustand unbekannt, nicht "aus"', () => {
  assert.equal(readGate(SAMPLE), undefined)
})
