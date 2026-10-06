#!/usr/bin/env node
/**
 * analyse.mjs — Analyse-Werkzeug für Codebasen, Websites und Logs.
 * Null Abhängigkeiten, nur Node-Standardbibliothek. Node >= 18.
 *
 *   node analyse.mjs codebase <pfad>      [--json] [--top 10] [--schwer 2000]
 *   node analyse.mjs website  <url>       [--json] [--maxkb 2000]
 *   node analyse.mjs logs     <datei|->   [--json] [--top 10] [--maxmb 200]
 *   node analyse.mjs check                [--json]
 *
 * Ausgabe ist Markdown für Menschen und Agenten; mit --json maschinenlesbar.
 * Das Werkzeug ist bewusst deterministisch (keine KI): Es liefert Fakten,
 * die das Modell danach bewertet.
 */
import { readdir, readFile, stat, open } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createInterface } from 'node:readline'

const execFileP = promisify(execFile)

/* ============================== Hilfsmittel ============================== */

const args = process.argv.slice(2)
const modus = args[0]
const ziel = args[1]
const flag = (name, standard) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : standard
}
const hat = name => args.includes(`--${name}`)
const ALS_JSON = hat('json')
const kB = n => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`

const IGNORIERT = new Set([
  'node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next', '.nuxt', 'target',
  'vendor', '__pycache__', '.venv', 'venv', 'env', 'coverage', '.cache', '.turbo',
  '.gradle', 'bin', 'obj', '.idea', '.vscode-test', '.pytest_cache', '.mypy_cache',
])

/** Binär- und Laufzeitdaten: nie interessant für die Analyse, blähen aber jede Statistik auf. */
const BINAER = new Set([
  '.db', '.sqlite', '.sqlite3', '.db-shm', '.db-wal', '.shm', '.wal', '.mdb', '.dump',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.7z', '.rar', '.zst', '.zstd', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class', '.jar', '.wasm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.mov', '.avi', '.wav',
  '.pyc', '.pyo', '.log', '.lock',
])

const QUELLTEXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.py', '.rb', '.php',
  '.java', '.kt', '.kts', '.cs', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cc', '.swift',
  '.m', '.mm', '.scala', '.sh', '.bash', '.ps1', '.psm1', '.sql', '.html', '.htm', '.css',
  '.scss', '.sass', '.less', '.lua', '.pl', '.r', '.jl', '.dart', '.ex', '.exs', '.clj',
])

const SPRACHEN = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.ts': 'TypeScript',
  '.tsx': 'TypeScript/React', '.jsx': 'JavaScript/React', '.vue': 'Vue', '.svelte': 'Svelte',
  '.py': 'Python', '.rb': 'Ruby', '.php': 'PHP', '.java': 'Java', '.kt': 'Kotlin',
  '.cs': 'C#', '.go': 'Go', '.rs': 'Rust', '.c': 'C', '.h': 'C-Header', '.cpp': 'C++',
  '.swift': 'Swift', '.scala': 'Scala', '.sh': 'Shell', '.ps1': 'PowerShell', '.sql': 'SQL',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.lua': 'Lua', '.dart': 'Dart',
}

/** Auffällige Muster im Quelltext — bewusst konservativ, um Fehlalarme zu vermeiden. */
const MUSTER = [
  ['Konsolenausgabe im Code', /console\.(log|debug|info)\(/],
  ['Debugger-Anweisung', /(^|[^a-zA-Z])debugger\s*;?/],
  ['TODO/FIXME offen', /(TODO|FIXME|XXX|HACK)\b/],
  ['eval / Function-Konstruktor', /(^|[^.\w])eval\s*\(|new\s+Function\s*\(/],
  ['Shell-Aufruf mit Variable', /exec(Sync)?\s*\(\s*[`"'].*\$\{|exec(Sync)?\s*\([^)]*\+/],
  ['HTML ohne Escaping', /(innerHTML|outerHTML|dangerouslySetInnerHTML)\s*=/],
  ['Mögliches Geheimnis im Code', /(password|passwd|secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i],
  ['Unverschlüsselte URL', /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[a-z0-9.-]+/i],
  ['Feste Zugangsdaten', /(user|login|admin)\s*[:=]\s*['"](admin|root|test|password)['"]/i],
  ['Leerer Catch-Block', /catch\s*(\([^)]*\))?\s*\{\s*\}/],
  ['Ungeprüfte JSON-Auswertung', /JSON\.parse\s*\((?![^)]*try)/],
]

async function gitInfo(pfad) {
  const git = async (argumente) => {
    const { stdout } = await execFileP('git', ['-C', pfad, ...argumente], {
      timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    })
    return stdout.trim()
  }
  try {
    const [branch, status, letzte, churn] = await Promise.all([
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
      git(['status', '--porcelain']),
      git(['log', '-8', '--date=short', '--pretty=format:%h|%ad|%an|%s']),
      git(['log', '--since=180.days', '--name-only', '--pretty=format:', '--diff-filter=AM']),
    ])
    const zaehler = new Map()
    for (const zeile of churn.split('\n')) {
      const t = zeile.trim()
      if (t.length === 0) continue
      zaehler.set(t, (zaehler.get(t) ?? 0) + 1)
    }
    return {
      vorhanden: true,
      branch,
      aenderungen: status.length === 0 ? 0 : status.split('\n').length,
      letzteCommits: letzte.split('\n').filter(Boolean).map(zeile => {
        const [hash, datum, autor, ...rest] = zeile.split('|')
        return { hash, datum, autor, betreff: rest.join('|') }
      }),
      haeufigGeaendert: [...zaehler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([datei, anzahl]) => ({ datei, anzahl })),
    }
  } catch (fehler) {
    return { vorhanden: false, grund: fehler.message.split('\n')[0] }
  }
}

/* =============================== Codebase ================================ */

async function sammleDateien(wurzel, grenze = 60000) {
  const ergebnis = []
  const stapel = [wurzel]
  while (stapel.length > 0 && ergebnis.length < grenze) {
    const aktuell = stapel.pop()
    let eintraege
    try {
      eintraege = await readdir(aktuell, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of eintraege) {
      if (e.name.startsWith('.') && e.name !== '.env.example') {
        if (e.isDirectory()) continue
      }
      const voll = join(aktuell, e.name)
      if (e.isDirectory()) {
        if (IGNORIERT.has(e.name)) continue
        stapel.push(voll)
      } else if (e.isFile()) {
        const endung = extname(e.name).toLowerCase()
        if (BINAER.has(endung)) continue
        // Lockfiles und Datenbankreste mit Doppelendung (.db-shm, .db-wal)
        if (/\.(db|sqlite3?)-(shm|wal|journal)$/i.test(e.name)) continue
        ergebnis.push(voll)
      }
    }
  }
  return ergebnis
}

async function analysiereCodebase(pfad) {
  const wurzel = resolve(pfad)
  const info = await stat(wurzel).catch(() => null)
  if (info === null || !info.isDirectory()) throw new Error(`Kein Verzeichnis: ${wurzel}`)

  const dateien = await sammleDateien(wurzel)
  const nachEndung = new Map()
  const groessten = []
  const laengsten = []
  let gesamtBytes = 0
  let quelltextBytes = 0
  const treffer = new Map()
  const trefferDetails = []
  const manifeste = []

  const MANIFESTE = ['package.json', 'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod',
    'composer.json', 'Gemfile', 'pom.xml', 'build.gradle', 'Dockerfile', 'docker-compose.yml',
    'Makefile', 'tsconfig.json', '.gitlab-ci.yml']

  for (const datei of dateien) {
    const st = await stat(datei).catch(() => null)
    if (st === null) continue
    gesamtBytes += st.size
    const endung = extname(datei).toLowerCase()
    nachEndung.set(endung, (nachEndung.get(endung) ?? 0) + 1)
    groessten.push({ datei: relative(wurzel, datei), bytes: st.size })
    if (MANIFESTE.includes(basename(datei))) manifeste.push(relative(wurzel, datei))

    if (!QUELLTEXT.has(endung)) continue
    if (st.size > 2 * 1024 * 1024) continue
    quelltextBytes += st.size
    let inhalt
    try {
      inhalt = await readFile(datei, 'utf8')
    } catch {
      continue
    }
    const zeilen = inhalt.split('\n').length
    laengsten.push({ datei: relative(wurzel, datei), zeilen })

    for (const [name, regex] of MUSTER) {
      const gefunden = inhalt.match(new RegExp(regex.source, regex.flags.includes('i') ? 'gi' : 'g'))
      if (gefunden === null) continue
      treffer.set(name, (treffer.get(name) ?? 0) + gefunden.length)
      if (trefferDetails.length < 400) {
        const zeilennummer = inhalt.slice(0, inhalt.search(regex)).split('\n').length
        trefferDetails.push({ name, datei: relative(wurzel, datei), zeile: zeilennummer, beispiel: gefunden[0].slice(0, 80) })
      }
    }
  }

  const sprachen = [...nachEndung.entries()]
    .filter(([e]) => SPRACHEN[e] !== undefined)
    .map(([e, n]) => ({ sprache: SPRACHEN[e], dateien: n }))
    .reduce((acc, x) => {
      const vorhanden = acc.find(a => a.sprache === x.sprache)
      if (vorhanden) vorhanden.dateien += x.dateien
      else acc.push(x)
      return acc
    }, [])
    .sort((a, b) => b.dateien - a.dateien)

  const hatPfad = teil => dateien.some(d => relative(wurzel, d).split(sep).includes(teil))
  const testDateien = dateien.filter(d => /(^|[\\/])(tests?|spec|__tests__)([\\/]|$)|\.(test|spec)\.[a-z]+$/i.test(d)).length

  let paket = null
  const pkgPfad = join(wurzel, 'package.json')
  try {
    const roh = JSON.parse(await readFile(pkgPfad, 'utf8'))
    paket = {
      name: roh.name, version: roh.version, type: roh.type,
      skripte: Object.entries(roh.scripts ?? {}).map(([k, v]) => `${k}: ${v}`).slice(0, 12),
      abhaengigkeiten: Object.keys(roh.dependencies ?? {}).length,
      entwicklungsAbhaengigkeiten: Object.keys(roh.devDependencies ?? {}).length,
      engines: roh.engines ?? null,
    }
  } catch { /* keine package.json */ }

  const git = await gitInfo(wurzel)

  return {
    wurzel, dateien: dateien.length, gesamtBytes,
    quelltextBytes, sprachen,
    groessteDateien: groessten.sort((a, b) => b.bytes - a.bytes).slice(0, Number(flag('top', 10))),
    laengsteDateien: laengsten.sort((a, b) => b.zeilen - a.zeilen).slice(0, Number(flag('top', 10))),
    manifeste: [...new Set(manifeste)],
    projektdateien: {
      tests: testDateien, ci: hatPfad('.github') || hatPfad('.gitlab-ci.yml') || dateien.some(d => /[\\/]workflows?[\\/]/i.test(d)),
      docker: dateien.some(d => /^(dockerfile|docker-compose\.ya?ml)$/i.test(basename(d))),
      readme: dateien.some(d => /^readme(\.md)?$/i.test(basename(d))),
      lizenz: dateien.some(d => /^licen[cs]e/i.test(basename(d))),
      umgebungsbeispiel: dateien.some(d => /^\.env\.(example|sample|template)$/i.test(basename(d))),
      gitignore: dateien.some(d => basename(d) === '.gitignore'),
      lockfile: dateien.some(d => /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|uv\.lock|poetry\.lock|Cargo\.lock)$/.test(basename(d))),
    },
    auffaelligkeiten: [...treffer.entries()].sort((a, b) => b[1] - a[1]).map(([name, anzahl]) => ({ name, anzahl })),
    auffaelligkeitenDetails: trefferDetails,
    paket,
    git,
  }
}

function berichtCodebase(d) {
  const z = []
  z.push(`# Codebase-Analyse: ${basename(d.wurzel)}`)
  z.push('')
  z.push(`**Pfad:** \`${d.wurzel}\``)
  z.push(`**Umfang:** ${d.dateien} Dateien · ${kB(d.gesamtBytes)} gesamt · ${kB(d.quelltextBytes)} Quelltext`)
  if (d.sprachen.length > 0) {
    z.push(`**Sprachen:** ${d.sprachen.slice(0, 6).map(s => `${s.sprache} (${s.dateien})`).join(' · ')}`)
  }
  z.push('')

  z.push('## Projektbild')
  const p = d.projektdateien
  z.push(`- Tests: ${p.tests > 0 ? `${p.tests} Dateien` : '**keine gefunden**'} · CI: ${p.ci ? 'ja' : 'nein'} · Docker: ${p.docker ? 'ja' : 'nein'}`)
  z.push(`- README: ${p.readme ? 'ja' : '**fehlt**'} · Lizenz: ${p.lizenz ? 'ja' : '**fehlt**'} · .gitignore: ${p.gitignore ? 'ja' : '**fehlt**'}`)
  z.push(`- Lockfile: ${p.lockfile ? 'ja' : '**fehlt** (Abhängigkeiten nicht reproduzierbar)'} · .env.example: ${p.umgebungsbeispiel ? 'ja' : 'nein'}`)
  z.push(`- Manifeste: ${d.manifeste.length > 0 ? d.manifeste.slice(0, 8).join(', ') : 'keine'}`)
  z.push('')

  if (d.paket !== null) {
    z.push('## package.json')
    z.push(`- Name: ${d.paket.name ?? '—'} ${d.paket.version ?? ''}${d.paket.type ? ` · type: ${d.paket.type}` : ''}`)
    z.push(`- Abhängigkeiten: ${d.paket.abhaengigkeiten} · Entwicklung: ${d.paket.entwicklungsAbhaengigkeiten}`)
    if (d.paket.skripte.length > 0) z.push(`- Skripte: ${d.paket.skripte.map(s => `\`${s}\``).join(' · ')}`)
    z.push('')
  }

  if (d.git.vorhanden) {
    z.push('## Git')
    z.push(`- Branch: \`${d.git.branch}\` · offene Änderungen: ${d.git.aenderungen}`)
    if (d.git.letzteCommits.length > 0) {
      z.push('- Letzte Commits:')
      for (const c of d.git.letzteCommits.slice(0, 5)) z.push(`  - \`${c.hash}\` ${c.datum} ${c.autor}: ${c.betreff.slice(0, 90)}`)
    }
    if (d.git.haeufigGeaendert.length > 0) {
      z.push('- Am häufigsten geändert (180 Tage, Hinweis auf Brennpunkte):')
      for (const f of d.git.haeufigGeaendert.slice(0, 5)) z.push(`  - ${f.anzahl}× ${f.datei}`)
    }
    z.push('')
  } else {
    z.push('## Git')
    z.push(`- Kein Repository: ${d.git.grund}`)
    z.push('')
  }

  if (d.auffaelligkeiten.length > 0) {
    z.push('## Auffälligkeiten im Quelltext')
    for (const a of d.auffaelligkeiten) z.push(`- ${a.name}: **${a.anzahl}**`)
    const beispiele = d.auffaelligkeitenDetails.filter(x => /Geheimnis|Zugangsdaten|eval|Shell|HTML/.test(x.name)).slice(0, 8)
    if (beispiele.length > 0) {
      z.push('')
      z.push('Beispiele mit Sicherheitsbezug:')
      for (const b of beispiele) z.push(`- \`${b.datei}:${b.zeile}\` — ${b.name}: \`${b.beispiel}\``)
    }
    z.push('')
  }

  z.push('## Grösste Dateien')
  for (const f of d.groessteDateien) z.push(`- ${kB(f.bytes)} — \`${f.datei}\``)
  z.push('')
  z.push('## Längste Dateien (Zeilen)')
  for (const f of d.laengsteDateien) z.push(`- ${f.zeilen} — \`${f.datei}\``)
  z.push('')
  z.push('## Wo zuerst lesen')
  const kandidaten = []
  for (const m of d.manifeste.slice(0, 4)) kandidaten.push(m)
  if (d.paket?.skripte.length > 0) kandidaten.push('Skripte oben — Einstiegspunkt darüber finden')
  const eintritt = d.laengsteDateien.filter(f => /(index|main|app|server|cli|__init__)\./i.test(f.datei)).slice(0, 3)
  for (const e of eintritt) kandidaten.push(e.datei)
  for (const k of [...new Set(kandidaten)].slice(0, 8)) z.push(`- ${k}`)
  return z.join('\n')
}

/* ================================ Website =============================== */

async function analysiereWebsite(url) {
  const start = Date.now()
  const antwort = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'analyse.mjs/1.0 (+Codebase-Website-Log-Analyse)' },
  })
  const rohHtml = await antwort.text()
  const dauer = Date.now() - start
  const kopf = Object.fromEntries([...antwort.headers.entries()])

  const titel = rohHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null
  const meta = (name) => {
    const m = rohHtml.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
      ?? rohHtml.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))
    return m?.[1]?.trim() ?? null
  }
  const ueberschriften = [...rohHtml.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(m => ({ stufe: Number(m[1]), text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
    .filter(h => h.text.length > 1)
  const links = [...rohHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m => m[1])
  const basis = new URL(antwort.url)
  const intern = links.filter(h => h.startsWith('/') || h.startsWith('#') || h.includes(basis.host)).length
  const bilder = [...rohHtml.matchAll(/<img[^>]*>/gi)].map(m => m[0])
  const ohneAlt = bilder.filter(t => !/alt\s*=/.test(t)).length
  const skripte = [...rohHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => m[1])
  // href kann vor oder nach rel stehen — deshalb erst die Tags holen, dann auswerten.
  const linkTags = [...rohHtml.matchAll(/<link[^>]*>/gi)].map(m => m[0])
  const stilDateien = linkTags
    .filter(t => /rel=["']stylesheet["']/i.test(t))
    .map(t => t.match(/href=["']([^"']+)["']/i)?.[1] ?? '')
    .filter(h => h.length > 0)
  const formulare = [...rohHtml.matchAll(/<form[^>]*>/gi)]
  const jsonLd = [...rohHtml.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => { try { return JSON.parse(m[1]) } catch { return null } }).filter(Boolean)
  const ldTypen = jsonLd.flatMap(o => [o['@type'], ...(Array.isArray(o['@graph']) ? o['@graph'].map(g => g['@type']) : [])]).filter(Boolean)

  const text = rohHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const woerter = text.split(' ').filter(w => w.length > 0).length

  const fremdeHosts = [...new Set([...skripte, ...stilDateien]
    .filter(u => /^https?:\/\//.test(u))
    .map(u => { try { return new URL(u).host } catch { return null } })
    .filter(h => h !== null && h !== basis.host))]

  const generator = meta('generator')
  // Wird später über stimmig kurzen Text gesetzt (nach der Textzählung).
  const skriptAnzahl = skripte.length

  const sicherheitsKopf = {
    hsts: kopf['strict-transport-security'] ?? null,
    csp: kopf['content-security-policy'] ?? null,
    xContentType: kopf['x-content-type-options'] ?? null,
    referrerPolicy: kopf['referrer-policy'] ?? null,
    permissionsPolicy: kopf['permissions-policy'] ?? null,
  }

  return {
    url: antwort.url,
    status: antwort.status,
    dauerMs: dauer,
    groesseBytes: Buffer.byteLength(rohHtml),
    titel,
    beschreibung: meta('description'),
    sprache: rohHtml.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? null,
    kanonisch: rohHtml.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null,
    generator,
    ueberschriften,
    struktur: {
      links: links.length, interneLinks: intern, externeLinks: links.length - intern,
      bilder: bilder.length, bilderOhneAlt: ohneAlt,
      skripte: skripte.length, stilDateien: stilDateien.length, formulare: formulare.length,
      jsonLd: jsonLd.length, ldTypen: [...new Set(ldTypen)],
    },
    text: { woerter, zeichen: text.length, verdachtSpa: woerter < 200 && skriptAnzahl >= 4 },
    fremdeHosts,
    sicherheitsKopf,
    kopfzeilen: kopf,
  }
}

function berichtWebsite(d) {
  const z = []
  z.push(`# Website-Analyse: ${d.url}`)
  z.push('')
  z.push(`**Antwort:** HTTP ${d.status} · ${kB(d.groesseBytes)} · ${d.dauerMs} ms`)
  z.push(`**Titel:** ${d.titel ?? '**keiner**'}`)
  z.push(`**Beschreibung:** ${d.beschreibung ?? '**keine**'}`)
  z.push(`**Sprache:** ${d.sprache ?? '**nicht gesetzt** (schlecht für Screenreader und Suche)'}`)
  z.push('')

  z.push('## Inhalt')
  z.push(`- Textmenge: ${d.text.woerter} Wörter${d.text.verdachtSpa ? ' — **verdächtig wenig: wohl eine JavaScript-App, rohes HTML reicht nicht**' : ''}`)
  z.push(`- Überschriften: ${d.ueberschriften.length} (h1: ${d.ueberschriften.filter(h => h.stufe === 1).length})`)
  for (const h of d.ueberschriften.slice(0, 12)) z.push(`  - ${'#'.repeat(h.stufe)} ${h.text.slice(0, 100)}`)
  z.push('')

  z.push('## Struktur')
  const s = d.struktur
  z.push(`- Links: ${s.links} (intern ${s.interneLinks}, extern ${s.externeLinks})`)
  z.push(`- Bilder: ${s.bilder}${s.bilderOhneAlt > 0 ? ` — **${s.bilderOhneAlt} ohne alt-Text**` : ' (alle mit alt-Text)'}`)
  z.push(`- Skripte: ${s.skripte} · Stylesheets: ${s.stilDateien} · Formulare: ${s.formulare}`)
  z.push(`- Strukturierte Daten: ${s.jsonLd} Block(e)${s.ldTypen.length > 0 ? ` — ${s.ldTypen.join(', ')}` : ''}`)
  z.push(`- Kanonische URL: ${d.kanonisch ?? '**nicht gesetzt**'}`)
  z.push('')

  if (d.fremdeHosts.length > 0) {
    z.push('## Fremde Hosts (Datenschutz und Ladezeit)')
    for (const h of d.fremdeHosts.slice(0, 15)) z.push(`- ${h}`)
    z.push('')
  }

  z.push('## Sicherheits-Kopfzeilen')
  const k = d.sicherheitsKopf
  z.push(`- Strict-Transport-Security: ${k.hsts ?? '**fehlt**'}`)
  z.push(`- Content-Security-Policy: ${k.csp ?? '**fehlt**'}`)
  z.push(`- X-Content-Type-Options: ${k.xContentType ?? '**fehlt**'}`)
  z.push(`- Referrer-Policy: ${k.referrerPolicy ?? '**fehlt**'}`)
  z.push('')
  if (d.generator !== null) z.push(`**Erkennbarer Generator/CMS:** ${d.generator}`)
  return z.join('\n')
}

/* ================================= Logs ================================= */

const EBENEN = [
  [/\b(fatal|critical|crit)\b/i, 'fatal'],
  [/\b(error|err|exception|failed|failure|panic)\b/i, 'error'],
  [/\b(warn|warning|deprecated)\b/i, 'warn'],
  [/\b(debug|trace|verbose)\b/i, 'debug'],
  [/\b(info|notice|hinweis)\b/i, 'info'],
]

function normalisiere(zeile) {
  return zeile
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, '<zeit>')
    .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '<ip>')
    .replace(/\b[0-9a-f]{7,}\b/gi, '<id>')
    .replace(/\b\d+(\.\d+)?(ms|s|mb|kb|gb)\b/gi, '<zahl>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

async function analysiereLogs(pfad) {
  const quelle = pfad === '-' ? process.stdin : createReadStream(pfad, { encoding: 'utf8' })
  const rl = createInterface({ input: quelle, crlfDelay: Infinity })
  const grenze = Number(flag('maxmb', 200)) * 1024 * 1024

  const ebenen = { fatal: 0, error: 0, warn: 0, info: 0, debug: 0, unbekannt: 0 }
  const gruppen = new Map()
  const ausnahmen = new Map()
  const statusCodes = new Map()
  const dateiZeilen = new Map()
  const hosts = new Map()
  let zeilen = 0
  let bytes = 0
  let ersteZeit = null
  let letzteZeit = null
  let stackBeispiel = null
  let stackSammeln = 0
  const stackZeilen = []

  for await (const zeile of rl) {
    zeilen += 1
    bytes += Buffer.byteLength(zeile) + 1
    if (bytes > grenze) break
    if (zeile.trim().length === 0) continue

    const zeitTreffer = zeile.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?/)?.[0]
    if (zeitTreffer !== undefined) {
      if (ersteZeit === null) ersteZeit = zeitTreffer
      letzteZeit = zeitTreffer
    }

    // JSON-Logs unterstützen
    let ebene = 'unbekannt'
    let text = zeile
    if (zeile.trimStart().startsWith('{')) {
      try {
        const o = JSON.parse(zeile)
        const lvl = String(o.level ?? o.severity ?? o.lvl ?? '').toLowerCase()
        if (lvl.length > 0) ebene = lvl
        text = String(o.message ?? o.msg ?? o.error ?? zeile)
      } catch { /* kein JSON */ }
    }
    if (ebene === 'unbekannt') {
      for (const [regex, name] of EBENEN) {
        if (regex.test(zeile)) { ebene = name; break }
      }
    }
    if (ebenen[ebene] === undefined) ebene = 'error'
    ebenen[ebene] += 1

    for (const m of zeile.matchAll(/\b([A-Z][A-Za-z0-9_.]*(?:Error|Exception|Panic|Fault))\b/g)) {
      ausnahmen.set(m[1], (ausnahmen.get(m[1]) ?? 0) + 1)
    }
    for (const m of zeile.matchAll(/\b(?:status|statusCode|code)[=:\s]+(\d{3})\b/g)) {
      statusCodes.set(m[1], (statusCodes.get(m[1]) ?? 0) + 1)
    }
    for (const m of zeile.matchAll(/([\w./-]+\.(?:js|ts|py|rb|go|rs|java|php|cs|c|cpp|mjs))(?::(\d+))?/g)) {
      const schluessel = m[2] !== undefined ? `${m[1]}:${m[2]}` : m[1]
      dateiZeilen.set(schluessel, (dateiZeilen.get(schluessel) ?? 0) + 1)
    }
    for (const m of zeile.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)) {
      hosts.set(m[1], (hosts.get(m[1]) ?? 0) + 1)
    }

    if (ebene === 'error' || ebene === 'fatal') {
      const schluessel = normalisiere(text)
      const vorhanden = gruppen.get(schluessel)
      if (vorhanden === undefined) {
        gruppen.set(schluessel, { anzahl: 1, erste: zeitTreffer ?? null, letzte: zeitTreffer ?? null, beispiel: zeile.trim().slice(0, 300) })
      } else {
        vorhanden.anzahl += 1
      }
      // Frühesten und spätesten Zeitpunkt wirklich vergleichen (nicht Reihenfolge im Log).
      if (zeitTreffer !== undefined) {
        const g = gruppen.get(schluessel)
        if (g.erste === null || zeitTreffer < g.erste) g.erste = zeitTreffer
        if (g.letzte === null || zeitTreffer > g.letzte) g.letzte = zeitTreffer
      }
      if (stackSammeln === 0 && /(Error|Exception|Panic|Fault)/.test(zeile)) {
        stackSammeln = 1
        stackBeispiel = zeile.trim().slice(0, 200)
      }
    }
    // Zeitraum über alle Zeilen korrekt als Minimum/Maximum führen
    if (zeitTreffer !== undefined) {
      if (ersteZeit === null || zeitTreffer < ersteZeit) ersteZeit = zeitTreffer
      if (letzteZeit === null || zeitTreffer > letzteZeit) letzteZeit = zeitTreffer
    }
    if (stackSammeln > 0 && stackSammeln < 12 && /^\s+at\s+|^\s+File\s+"|^\s+at [\w.$]+\(/.test(zeile)) {
      stackZeilen.push(zeile.trim().slice(0, 160))
      stackSammeln += 1
    }
  }

  const top = Number(flag('top', 10))
  return {
    quelle: pfad === '-' ? 'stdin' : resolve(pfad),
    zeilen, bytes,
    zeitraum: { von: ersteZeit, bis: letzteZeit },
    ebenen,
    topFehler: [...gruppen.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl).slice(0, top)
      .map(([signatur, v]) => ({ signatur, ...v })),
    ausnahmen: [...ausnahmen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, anzahl]) => ({ name, anzahl })),
    statusCodes: [...statusCodes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([code, anzahl]) => ({ code, anzahl })),
    dateien: [...dateiZeilen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([datei, anzahl]) => ({ datei, anzahl })),
    hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host, anzahl]) => ({ host, anzahl })),
    stack: { beispielKopf: stackBeispiel, rahmen: stackZeilen.slice(0, 12) },
  }
}

function berichtLogs(d) {
  const z = []
  z.push(`# Log-Analyse: ${basename(d.quelle)}`)
  z.push('')
  z.push(`**Umfang:** ${d.zeilen} Zeilen · ${kB(d.bytes)}`)
  z.push(`**Zeitraum:** ${d.zeitraum.von ?? '—'} bis ${d.zeitraum.bis ?? '—'}`)
  z.push('')
  z.push('## Verteilung')
  const gesamt = Object.values(d.ebenen).reduce((a, b) => a + b, 0) || 1
  for (const [name, anzahl] of Object.entries(d.ebenen)) {
    if (anzahl === 0) continue
    z.push(`- ${name}: ${anzahl} (${((anzahl / gesamt) * 100).toFixed(1)} %)`)
  }
  z.push('')

  if (d.topFehler.length > 0) {
    z.push('## Häufigste Fehlerbilder (normalisiert)')
    for (const f of d.topFehler) {
      z.push(`- **${f.anzahl}×** ${f.signatur}`)
      if (f.erste !== null) z.push(`  - zuerst ${f.erste}${f.letzte !== null && f.letzte !== f.erste ? ` · zuletzt ${f.letzte}` : ''}`)
    }
    z.push('')
  }

  if (d.ausnahmen.length > 0) {
    z.push('## Ausnahmen')
    for (const a of d.ausnahmen) z.push(`- ${a.name}: ${a.anzahl}×`)
    z.push('')
  }
  if (d.statusCodes.length > 0) {
    z.push('## HTTP-Statuscodes')
    for (const s of d.statusCodes) z.push(`- ${s.code}: ${s.anzahl}×`)
    z.push('')
  }
  if (d.dateien.length > 0) {
    z.push('## Genannte Dateien (heisse Stellen)')
    for (const f of d.dateien.slice(0, 10)) z.push(`- ${f.anzahl}× \`${f.datei}\``)
    z.push('')
  }
  if (d.hosts.length > 0) {
    z.push('## Beteiligte Adressen')
    for (const h of d.hosts) z.push(`- ${h.host}: ${h.anzahl}×`)
    z.push('')
  }
  if (d.stack.rahmen.length > 0) {
    z.push('## Stackrahmen des ersten Fehlers')
    if (d.stack.beispielKopf !== null) z.push(`\`${d.stack.beispielKopf}\``)
    for (const r of d.stack.rahmen) z.push(`- \`${r}\``)
    z.push('')
  }
  z.push('## Nächste Schritte')
  const haeufigster = d.topFehler[0]
  if (haeufigster !== undefined) {
    z.push(`1. Häufigstes Fehlerbild zuerst: ${haeufigster.anzahl}× — ${haeufigster.signatur}`)
  }
  if (d.dateien.length > 0) z.push(`2. In \`${d.dateien[0].datei}\` nachsehen — dort wird am häufigsten protokolliert.`)
  z.push('3. Zeitlichen Verlauf prüfen: Ballen sich Fehler in einem Zeitfenster (Deployment, Lastspitze)?')
  return z.join('\n')
}

/* ================================ Review ================================= */
/* Lokale Codeprüfung ohne Dienst und ohne Konto.
   Entstanden als Ersatz für die CodeRabbit-Skills (MIT), die den CodeRabbit-CLI
   samt Anmeldung voraussetzen. Hier wird deterministisch geprüft — kein Modell,
   keine Überraschungen, keine Kosten. */

const REVIEW_REGELN = [
  { id: 'geheimnis', schwere: 'kritisch', titel: 'Mögliches Geheimnis im Code',
    regex: /(password|passwd|secret|api[_-]?key|apikey|access[_-]?token|private[_-]?key|client[_-]?secret)\s*[:=]\s*['"`][^'"`\s]{8,}['"`]/gi,
    hinweis: 'Über eine Umgebungsvariable oder einen Secret-Store beziehen, nicht im Code ablegen.' },
  { id: 'privatkey', schwere: 'kritisch', titel: 'Privater Schlüssel im Code',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    hinweis: 'Schlüssel sofort rotieren, aus der Versionsverwaltung entfernen und Historie bereinigen.' },
  { id: 'eval', schwere: 'kritisch', titel: 'Codeausführung zur Laufzeit',
    regex: /(^|[^.\w])(eval|Function)\s*\(/g,
    hinweis: 'Führt beliebigen Text als Code aus. Durch eine Zuordnungstabelle oder einen Parser ersetzen.' },
  { id: 'shell-injektion', schwere: 'kritisch', titel: 'Shell-Aufruf mit eingesetzter Variable',
    regex: /(execSync?|spawnSync?|system)\s*\(\s*[`"'][^`"']*\$\{|(execSync?|spawnSync?|system)\s*\([^)]*\+/g,
    hinweis: 'Parameter als Liste übergeben (kein shell: true), Eingaben vorher prüfen.' },
  { id: 'klartext-http', schwere: 'kritisch', titel: 'Unverschlüsselte Verbindung',
    regex: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[a-z0-9.-]+/gi,
    // Namensräume und Beispiel-Domains sind keine Netzverbindungen
    ausser: /w3\.org|xmlns|schemas\.|purl\.org|ns\.adobe\.com|xmlns\.com|example\.(com|org)|\.test\b|\.invalid\b|\.local\b/i,
    hinweis: 'Auf https umstellen — sonst sind Daten und Sitzungen im Klartext unterwegs.' },
  { id: 'innerhtml', schwere: 'hoch', titel: 'HTML ohne Escaping gesetzt',
    regex: /(innerHTML|outerHTML|dangerouslySetInnerHTML)\s*=/g,
    hinweis: 'Nutzerdaten vorher escapen oder textContent verwenden — sonst XSS.' },
  { id: 'leerer-catch', schwere: 'hoch', titel: 'Fehler wird verschluckt',
    regex: /catch\s*(\([^)]*\))?\s*\{\s*\}/g,
    hinweis: 'Fehler protokollieren oder weiterreichen. Stille Fehler kosten Tage.' },
  { id: 'json-parse', schwere: 'hoch', titel: 'JSON ohne Absicherung ausgewertet',
    regex: /JSON\.parse\s*\(/g, nurOhneTry: true,
    hinweis: 'In try/catch fassen und die Struktur prüfen — sonst reisst eine kaputte Antwort alles mit.' },
  { id: 'sql-konkatenation', schwere: 'hoch', titel: 'SQL aus Zeichenketten zusammengesetzt',
    regex: /(SELECT|INSERT|UPDATE|DELETE)[^;'"`]{0,80}['"`]\s*\+/gi,
    hinweis: 'Parametrisierte Abfragen verwenden (Platzhalter), um SQL-Injektion zu verhindern.' },
  { id: 'debugger', schwere: 'mittel', titel: 'Debugger-Anweisung',
    regex: /(^|[^a-zA-Z])debugger\s*;?/g,
    hinweis: 'Vor dem Merge entfernen.' },
  { id: 'konsolenausgabe', schwere: 'mittel', titel: 'Konsolenausgabe im Code',
    regex: /console\.(log|debug|info)\(/g,
    hinweis: 'Durch einen Logger ersetzen oder entfernen.' },
  { id: 'todo', schwere: 'niedrig', titel: 'Offene Markierung',
    regex: /\b(TODO|FIXME|XXX|HACK)\b/g,
    hinweis: 'In ein Ticket überführen oder erledigen.' },
  { id: 'auskommentiert', schwere: 'niedrig', titel: 'Auskommentierter Codeblock',
    regex: /^\s*\/\/\s*(const|let|var|function|if|for|return)\b.*$/gm,
    hinweis: 'Löschen — die Versionsverwaltung behält die Historie.' },
]

const REVIEW_ENDUNGEN = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte',
  '.py', '.rb', '.php', '.java', '.kt', '.cs', '.go', '.rs', '.c', '.h', '.cpp', '.swift',
  '.sh', '.bash', '.ps1', '.sql', '.html', '.css', '.scss', '.lua', '.dart'])

async function gitAusgabe(pfad, argumente) {
  const { stdout } = await execFileP('git', ['-C', pfad, ...argumente], { timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

async function analysiereReview(pfad, umfang) {
  const wurzel = resolve(pfad)
  let dateien = []
  let quelle = ''

  const gitOk = await gitAusgabe(wurzel, ['rev-parse', '--is-inside-work-tree']).then(() => true).catch(() => false)

  if (gitOk && umfang !== 'dir') {
    try {
      if (umfang === 'staged') {
        dateien = (await gitAusgabe(wurzel, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])).split('\n')
        quelle = 'vorgemerkte Änderungen (git diff --cached)'
      } else if (umfang.startsWith('committed:')) {
        const bereich = umfang.slice('committed:'.length)
        dateien = (await gitAusgabe(wurzel, ['diff', '--name-only', '--diff-filter=ACMR', bereich])).split('\n')
        quelle = `Commit-Bereich ${bereich}`
      } else {
        dateien = (await gitAusgabe(wurzel, ['diff', '--name-only', '--diff-filter=ACMR'])).split('\n')
        const unversioniert = (await gitAusgabe(wurzel, ['ls-files', '--others', '--exclude-standard'])).split('\n')
        dateien = [...dateien, ...unversioniert]
        quelle = 'nicht committete Änderungen (Arbeitsstand)'
      }
    } catch (fehler) {
      quelle = `git-Abfrage fehlgeschlagen (${fehler.message.split('\n')[0]}) — prüfe stattdessen alle Dateien`
    }
  }

  if (dateien.length === 0) {
    // Kein Git oder keine Änderungen: alle Quelldateien prüfen
    const alle = await sammleDateien(wurzel)
    dateien = alle
      .filter(d => REVIEW_ENDUNGEN.has(extname(d).toLowerCase()))
      .map(d => relative(wurzel, d))
    quelle = gitOk && umfang === 'diff'
      ? 'keine Änderungen gefunden — deshalb alle Quelldateien geprüft'
      : 'alle Quelldateien im Verzeichnis'
  }

  const befunde = []
  let geprueft = 0
  for (const eintrag of dateien) {
    const datei = eintrag.trim()
    if (datei.length === 0) continue
    const voll = resolve(join(wurzel, datei))
    const st = await stat(voll).catch(() => null)
    if (st === null || !st.isFile()) continue
    if (!REVIEW_ENDUNGEN.has(extname(voll).toLowerCase())) continue
    if (st.size > 1024 * 1024) continue
    let inhalt
    try { inhalt = await readFile(voll, 'utf8') } catch { continue }
    geprueft += 1
    const zeilen = inhalt.split('\n')

    for (const regel of REVIEW_REGELN) {
      const regex = new RegExp(regel.regex.source, regel.regex.flags)
      let treffer
      let anzahl = 0
      while ((treffer = regex.exec(inhalt)) !== null) {
        anzahl += 1
        if (anzahl > 50) break
        const zeile = inhalt.slice(0, treffer.index).split('\n').length
        // Bei JSON.parse prüfen, ob im Umfeld ein try steht
        if (regel.nurOhneTry === true) {
          const umfeld = zeilen.slice(Math.max(0, zeile - 8), zeile + 2).join('\n')
          if (/try\s*\{/.test(umfeld)) continue
        }
        // Ausnahmen: Treffer, die keine echte Auffälligkeit sind
        if (regel.ausser !== undefined && regel.ausser.test(treffer[0])) continue
        const umgebungszeile = zeilen[zeile - 1] ?? ''
        if (regel.ausser !== undefined && regel.ausser.test(umgebungszeile)) continue
        befunde.push({
          regel: regel.id, schwere: regel.schwere, titel: regel.titel,
          datei: relative(wurzel, voll), zeile, hinweis: regel.hinweis,
          beispiel: treffer[0].replace(/\s+/g, ' ').slice(0, 100),
        })
      }
    }

    // Strukturelle Hinweise (nicht regex-basiert)
    if (zeilen.length > 600) {
      befunde.push({ regel: 'lange-datei', schwere: 'niedrig', titel: 'Sehr lange Datei',
        datei: relative(wurzel, voll), zeile: 1, beispiel: `${zeilen.length} Zeilen`,
        hinweis: 'In kleinere Einheiten teilen — lange Dateien verstecken Fehler.' })
    }
  }

  const rang = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3 }
  befunde.sort((a, b) => rang[a.schwere] - rang[b.schwere] || a.datei.localeCompare(b.datei) || a.zeile - b.zeile)

  const zaehler = { kritisch: 0, hoch: 0, mittel: 0, niedrig: 0 }
  for (const b of befunde) zaehler[b.schwere] += 1

  return { wurzel, quelle, geprueft, befunde, zaehler, git: gitOk }
}

function berichtReview(d) {
  const z = []
  z.push('# Codeprüfung (lokal, ohne Dienst)')
  z.push('')
  z.push(`**Verzeichnis:** \`${d.wurzel}\``)
  z.push(`**Umfang:** ${d.quelle} · ${d.geprueft} Datei(en) geprüft · Git: ${d.git ? 'ja' : 'nein'}`)
  z.push(`**Befunde:** ${d.befunde.length} — kritisch ${d.zaehler.kritisch} · hoch ${d.zaehler.hoch} · mittel ${d.zaehler.mittel} · niedrig ${d.zaehler.niedrig}`)
  z.push('')

  if (d.befunde.length === 0) {
    z.push('Keine Treffer der eingebauten Regeln. Das ist **kein Freispruch** — die Regeln sind bewusst konservativ.')
    return z.join('\n')
  }

  for (const stufe of ['kritisch', 'hoch', 'mittel', 'niedrig']) {
    const gruppe = d.befunde.filter(b => b.schwere === stufe)
    if (gruppe.length === 0) continue
    z.push(`## ${stufe.toUpperCase()} (${gruppe.length})`)
    for (const b of gruppe) {
      z.push(`- **${b.titel}** — \`${b.datei}:${b.zeile}\``)
      if (b.beispiel.length > 0) z.push(`  - \`${b.beispiel}\``)
      z.push(`  - ${b.hinweis}`)
    }
    z.push('')
  }
  z.push('## Vorgehen')
  z.push('1. Kritische und hohe Befunde einzeln prüfen — jeder Treffer ist ein Verdacht, kein Urteil.')
  z.push('2. Erst nach Sichtprüfung der Stelle ändern.')
  z.push('3. Nach der Änderung erneut prüfen und die Tests laufen lassen.')
  return z.join('\n')
}

/* ============================== Fähigkeiten ============================== */

async function pruefeWerkzeuge() {
  const test = async (programm, argumente = ['--version']) => {
    try {
      const { stdout, stderr } = await execFileP(programm, argumente, { timeout: 25000 })
      return { vorhanden: true, version: (stdout || stderr).trim().split('\n')[0].slice(0, 80) }
    } catch {
      return { vorhanden: false, version: null }
    }
  }
  const [git, docker, rg, node, uv, markitdown, gitingest] = await Promise.all([
    test('git'), test('docker', ['version', '--format', '{{.Server.Version}}']), test('rg', ['--version']),
    test(process.execPath, ['--version']), test('uv', ['--version']),
    test('uvx', ['--from', 'markitdown', 'markitdown', '--version']),
    // gitingest kennt kein --version, deshalb mit --help prüfen
    test('uvx', ['--from', 'gitingest', 'gitingest', '--help']),
  ])
  return {
    node: { vorhanden: true, version: node.version },
    git, docker, rg, uv,
    markitdown: { ...markitdown, aufruf: 'uvx --from markitdown markitdown <datei>' },
    gitingest: { ...gitingest, aufruf: 'uvx --from gitingest gitingest <pfad-oder-url>' },
    hinweis: 'Fehlende Zusatzwerkzeuge werden mit uvx bei Bedarf geladen (kein Docker nötig).',
  }
}

/* ================================= Start ================================= */

async function main() {
  if (modus === undefined || ['help', '-h', '--help'].includes(modus)) {
    process.stdout.write(`analyse.mjs — Codebase, Website, Logs und Codeprüfung

  node analyse.mjs codebase <pfad>     [--json] [--top 10]
  node analyse.mjs website  <url>      [--json]
  node analyse.mjs logs     <datei|->  [--json] [--top 10] [--maxmb 200]
  node analyse.mjs review   [pfad]     [--umfang diff|staged|dir|committed:<bereich>] [--json]
  node analyse.mjs check               [--json]   Fähigkeiten dieses Rechners

review prüft standardmässig die nicht committeten Änderungen (git diff) und
greift ohne Git auf alle Quelldateien zurück. --dir erzwingt alle Dateien.

Ohne --json kommt ein Markdown-Bericht für Menschen und Agenten.
`)
    return
  }

  if (modus === 'check') {
    const f = await pruefeWerkzeuge()
    if (ALS_JSON) process.stdout.write(`${JSON.stringify(f, null, 2)}\n`)
    else {
      const zeile = (name, w) => `- ${name}: ${w.vorhanden ? `✅ ${w.version ?? ''}` : '❌ nicht verfügbar'}`
      process.stdout.write(`# Werkzeug-Check\n\n${zeile('node', f.node)}\n${zeile('git', f.git)}\n${zeile('docker', f.docker)}\n${zeile('rg', f.rg)}\n${zeile('uv', f.uv)}\n${zeile('markitdown (uvx)', f.markitdown)}\n${zeile('gitingest (uvx)', f.gitingest)}\n\n${f.hinweis}\n`)
    }
    return
  }

  if (ziel === undefined && modus !== 'review') throw new Error(`Für "${modus}" fehlt das Ziel (Pfad, URL oder Datei)`)

  if (modus === 'review') {
    const umfang = flag('umfang', hat('staged') ? 'staged' : hat('dir') ? 'dir' : 'diff')
    const d = await analysiereReview(ziel ?? process.cwd(), umfang)
    process.stdout.write(ALS_JSON ? `${JSON.stringify(d, null, 2)}\n` : `${berichtReview(d)}\n`)
    return
  }
  if (modus === 'codebase') {
    const d = await analysiereCodebase(ziel)
    process.stdout.write(ALS_JSON ? `${JSON.stringify(d, null, 2)}\n` : `${berichtCodebase(d)}\n`)
    return
  }
  if (modus === 'website') {
    const d = await analysiereWebsite(ziel)
    process.stdout.write(ALS_JSON ? `${JSON.stringify(d, null, 2)}\n` : `${berichtWebsite(d)}\n`)
    return
  }
  if (modus === 'logs') {
    const d = await analysiereLogs(ziel)
    process.stdout.write(ALS_JSON ? `${JSON.stringify(d, null, 2)}\n` : `${berichtLogs(d)}\n`)
    return
  }
  throw new Error(`Unbekannter Modus: ${modus}`)
}

main().catch((fehler) => {
  process.stderr.write(`analyse.mjs: ${fehler instanceof Error ? fehler.message : String(fehler)}\n`)
  process.exit(1)
})
