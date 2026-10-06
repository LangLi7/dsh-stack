# dsh-ponytail

Ein Schalter für die [Ponytail](https://github.com/DietrichGebert/ponytail)-Skills
im DeepSeek Harness: **an** heißt, das Harness kennt die sechs Skills; **aus**
heißt „arbeite ohne Ponytail" — und dann kennt es sie wirklich nicht mehr.

## Was der Schalter tut

Er schreibt genau zwei Schlüssel im YAML-Frontmatter jeder `SKILL.md`:

| Zustand | `disable-model-invocation` | `user-invocable` | Wirkung |
|---|---|---|---|
| **an** | `false` | `true` | Skill steht im Modell-Katalog und im `/`-Menü |
| **aus** | `true` | `false` | Skill ist aus beiden Oberflächen verschwunden |

Das ist kein Trick und kein Patch: `disable-model-invocation: true` nimmt ein
Skill aus dem modellseitigen Katalog **und** aus dem `skill`-Werkzeug,
`user-invocable: false` aus den menschlichen Kommandos. Belegt in
`packages/skill/skill-filesystem/README.md` („`disable-model-invocation: true`
excludes the skill from model-facing catalogs and loaders; `user-invocable:
false` excludes it from human-facing commands").

Weil der Skill-Provider seine Wurzeln überwacht, greift die Änderung **ohne
Neustart**: die nächste Katalog-Nachricht ersetzt die alte und listet die
Ponytail-Skills nicht mehr.

## Bedienung

```powershell
node bin/ponytail.mjs            # Zustand zeigen
node bin/ponytail.mjs off        # "arbeite ohne Ponytail"
node bin/ponytail.mjs on
node bin/ponytail.mjs toggle
node bin/ponytail.mjs --json
```

Ist das Plugin geladen, gibt es dieselbe Bedienung zusätzlich als
`/ponytail on|off|toggle|status` und als Chip in der Composer-Werkzeugreihe
(direkt neben „Workspace Write" / „Full access").

## Zustand

`$DSH_HOME/ponytail.json` ist die **Absicht**; die Skills auf der
Platte sind die **Wirkung**. Weichen sie voneinander ab (jemand hat von Hand
editiert), gewinnt die Platte — sie ist es, was das Harness liest — und der
Status meldet `drift`.

Zustandsdatei und Skill-Wurzeln leitet das Plugin aus der Umgebung ab
(`$DSH_HOME`, dann `~/.dsh`; `$DSH_AGENTS_HOME`, dann `~/.agents`) — es ist
nichts einkompiliert. Überschreiben lässt sich beides in der Plugin-Konfiguration
(`stateFile`, `skillRoots`).

## Selbsttest

```powershell
npm test    # gate.test.mjs (5) + chip.test.mjs (4)
```

`tests/gate.test.mjs` prüft die Frontmatter-Logik (beide Richtungen,
Idempotenz, Block-Skalare, Abbruch ohne Frontmatter).
`tests/chip.test.mjs` lädt das **echte** Client-Bundle über
`window.__ModuleLoader__`, hängt es in einen Stub-Slot und rendert den Chip in
jsdom: eingeschaltet „an", ausgeschaltet „aus", ein Klick schaltet den Host um
und der Chip zeigt das Ergebnis, und der Chip liest seinen Zustand vom Host
statt zu raten. React/react-dom/jsdom kommen aus dem Harness-Checkout — das
Plugin selbst hat keine Abhängigkeiten.

## Einbau

Zeile in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-ponytail
      name: 'dsh-ponytail'
```

Sie ist gesetzt und geprüft. **Ein live hinzugefügter Plugin-Eintrag wird vom
Patch-Watcher nicht nachgezogen:** der Watcher übernimmt Änderungen an bereits
gemounteten Zeilen (`disabled`, `config`), der Plugin-*Satz* steht aber erst
bei einem Neustart. Eine laufende Instanz ignoriert die Zeile also still —
kaputt geht dabei nichts. Deshalb braucht der Chip genau einen `dsh web`-Start.

Auf einem frischen Boot geprüft (zweite Instanz auf Port 3099, mit einem
`--patch`-Overlay, das nur die vorbestehende `credentials`-Vorbedingung
abschaltet): der Loader mountet das Plugin, `/ponytail/status` antwortet, das
Boot-Manifest führt `dsh-ponytail` mit Client-Bundle, und
`/plugins/dsh-ponytail/client.js` wird ausgeliefert.

### Ein Fehler, der gekostet hat

`ctx.connection.rpc.handle(channel, handler, options)` — **`options` ist
Pflicht** und wird sofort gelesen (`options.authority`). Fehlt es, wirft schon
`apply()`: `Cannot read properties of undefined (reading 'authority')`, das
Plugin mountet nicht, und beim Neustart bricht der Boot mit
`plugin tree failed to load` ab. Richtig ist
`{ authority: 'trusted-host' }` — dieselbe Wahl wie beim Nachbar-Plugin
`dsh-usage-budget`.
