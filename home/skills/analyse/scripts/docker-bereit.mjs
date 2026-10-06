#!/usr/bin/env node
/**
 * docker-bereit.mjs — Docker bei Bedarf starten und warten.
 *
 * Genau das fehlte bisher: Der Harness *konnte* Docker nutzen, aber niemand hat
 * den Daemon gestartet, wenn er aus war. Dieses Skript prüft, startet und wartet.
 *
 *   node docker-bereit.mjs            prüfen, bei Bedarf starten, warten
 *   node docker-bereit.mjs --status   nur prüfen (kein Start)
 *   node docker-bereit.mjs --json     maschinenlesbare Ausgabe
 *   node docker-bereit.mjs --timeout 180   Wartezeit in Sekunden (Standard 120)
 *
 * Rückgabewerte:
 *   0  Docker ist bereit
 *   1  Docker nicht verfügbar (Fallback nötig)
 *
 * Bewusst ohne Abhängigkeiten und ohne Seiteneffekte auf Container: Es wird
 * ausser dem Docker-Desktop-Prozess nichts gestartet.
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const args = process.argv.slice(2)
const nurStatus = args.includes('--status')
const alsJson = args.includes('--json')
const timeoutIndex = args.indexOf('--timeout')
const timeoutSekunden = timeoutIndex >= 0 ? Number(args[timeoutIndex + 1]) || 120 : 120

/** Kandidaten für die Docker-Desktop-Anwendung, je Betriebssystem. */
const DESKTOP_PFADE = [
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
  `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`,
  '/Applications/Docker.app',
  '/usr/bin/docker-desktop',
]

async function lauf(programm, argumente, timeoutMs = 20000) {
  try {
    const { stdout, stderr } = await execFileP(programm, argumente, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
    return { ok: true, ausgabe: `${stdout}${stderr}`.trim() }
  } catch (fehler) {
    return { ok: false, ausgabe: `${fehler.stdout ?? ''}${fehler.stderr ?? ''}${fehler.message}`.trim() }
  }
}

/** Läuft der Docker-Daemon? */
async function daemonLaeuft() {
  const ergebnis = await lauf('docker', ['info', '--format', '{{.ServerVersion}}'], 25000)
  return ergebnis.ok && ergebnis.ausgabe.length > 0
    ? { bereit: true, version: ergebnis.ausgabe.split('\n')[0].trim() }
    : { bereit: false, grund: ergebnis.ausgabe.split('\n')[0].slice(0, 200) }
}

/** Docker Desktop starten — erst über die CLI, sonst direkt die Anwendung. */
async function starten() {
  const ueberCli = await lauf('docker', ['desktop', 'start'], 90000)
  if (ueberCli.ok) return { gestartet: true, weg: 'docker desktop start' }

  for (const pfad of DESKTOP_PFADE) {
    if (!existsSync(pfad)) continue
    try {
      if (process.platform === 'darwin' && pfad.endsWith('.app')) {
        await lauf('open', ['-a', 'Docker'], 20000)
      } else {
        // Losgelöst starten: der Prozess soll den Aufrufer überleben.
        spawn(pfad, [], { detached: true, stdio: 'ignore' }).unref()
      }
      return { gestartet: true, weg: pfad }
    } catch (fehler) {
      return { gestartet: false, weg: pfad, grund: fehler.message }
    }
  }
  return {
    gestartet: false,
    weg: null,
    grund: 'Docker Desktop nicht gefunden — bitte von Hand starten (https://docs.docker.com/desktop/)',
  }
}

const warte = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const start = Date.now()
  const ergebnis = { geprueftAm: new Date().toISOString(), schritte: [] }

  let status = await daemonLaeuft()
  ergebnis.schritte.push({ schritt: 'daemon-pruefen', bereit: status.bereit, detail: status.version ?? status.grund })

  if (status.bereit) {
    ergebnis.bereit = true
    ergebnis.dauerSekunden = 0
    ergebnis.version = status.version
  } else if (nurStatus) {
    ergebnis.bereit = false
    ergebnis.hinweis = 'Docker ist aus (--status: nicht gestartet)'
  } else {
    const startversuch = await starten()
    ergebnis.schritte.push({ schritt: 'starten', ...startversuch })

    if (!startversuch.gestartet) {
      ergebnis.bereit = false
      ergebnis.hinweis = startversuch.grund
    } else {
      // Warten, bis der Daemon antwortet — Docker Desktop braucht je nach System 20–90 s.
      const frist = Date.now() + timeoutSekunden * 1000
      let versuche = 0
      while (Date.now() < frist) {
        versuche += 1
        await warte(3000)
        status = await daemonLaeuft()
        if (status.bereit) break
      }
      ergebnis.schritte.push({ schritt: 'warten', versuche, bereit: status.bereit })
      ergebnis.bereit = status.bereit
      ergebnis.version = status.version ?? null
      if (!status.bereit) {
        ergebnis.hinweis = `Docker antwortet nach ${timeoutSekunden} s nicht. `
          + 'Möglich: Desktop-Fenster erwartet eine Bestätigung, WSL2-Update nötig, oder Richtlinie blockiert den Start.'
      }
    }
  }

  ergebnis.dauerSekunden = Math.round((Date.now() - start) / 1000)

  if (alsJson) {
    process.stdout.write(`${JSON.stringify(ergebnis, null, 2)}\n`)
  } else if (ergebnis.bereit) {
    process.stdout.write(`Docker bereit${ergebnis.version ? ` (Server ${ergebnis.version})` : ''}`
      + `${ergebnis.dauerSekunden > 0 ? ` — nach ${ergebnis.dauerSekunden} s` : ' — war schon an'}\n`)
  } else {
    process.stdout.write(`Docker NICHT bereit: ${ergebnis.hinweis ?? 'unbekannter Grund'}\n`)
    process.stdout.write('Fallback: Aufgaben ohne Docker ausführen (analyse.mjs und uvx brauchen keinen Daemon).\n')
  }

  process.exit(ergebnis.bereit ? 0 : 1)
}

main().catch((fehler) => {
  process.stderr.write(`docker-bereit.mjs: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
  process.exit(1)
})
