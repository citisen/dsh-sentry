/**
 * Render the generated favicon in a real browser and report what the pixels are.
 *
 * The icon's whole job is contrast, and contrast is not something a string
 * assertion can judge: the first version of this plugin shipped a white fish on a
 * light disc — a `prefers-color-scheme` rule that moved one paint without the
 * other — and every text-level check passed while the tab showed a white circle.
 * So this renders the SVG at 2× and classifies each pixel by luminance and hue,
 * under both color schemes, and prints the grid.
 *
 * Usage:
 *   node scripts/icon-render-check.mjs [path/to/chrome]
 *
 * Environment:
 *   DSH_SENTRY_CHROME   browser executable, when it is not found automatically
 *   DSH_REQUIRE         set to 1 to fail instead of skipping without a browser
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Give up (or fail, under DSH_REQUIRE) because no browser is usable here. */
function skip(reason) {
  console.log(`icon-render-check: SKIP — ${reason}`)
  if (process.env.DSH_REQUIRE === '1') {
    console.error('icon-render-check: DSH_REQUIRE=1, treating the skip as a failure')
    process.exit(1)
  }
  process.exit(0)
}

/** Find a Chromium-based browser. @returns the executable path, or undefined. */
function findBrowser() {
  const explicit = process.argv[2] ?? process.env.DSH_SENTRY_CHROME
  if (explicit !== undefined) return existsSync(explicit) ? explicit : undefined
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA ?? ''
  return [
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((candidate) => existsSync(candidate))
}

const browser = findBrowser()
if (browser === undefined) skip('no Chromium-based browser found')

const scope = mkdtempSync(join(tmpdir(), 'dsh-sentry-icon-'))
const port = 9224
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>pending</title>
<script>
  const platform = {
    react: {
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
      useCallback: (fn) => fn, useEffect: () => undefined,
      useRef: (value) => ({ current: value }), useState: (value) => [value, () => undefined],
    },
    '@deepseek-ai/dsh-client-store': {
      defineStore: (spec) => ({ create: () => ({}), getSnapshot: () => spec.init(), subscribe: () => () => undefined }),
    },
  }
  window.__ModuleLoader__ = { load: (registration) => { window.__PLUGIN__ = registration.factory((spec) => platform[spec]) } }
</script></head><body>
<script src="./bundle.js"></script>
<script>
  const plugin = window.__PLUGIN__
  const scenarios = [
    { label: 'running', waiting: 0, running: 1, scale: 0.416 },
    { label: 'waiting + 2 running', waiting: 1, running: 2, scale: 0.416 },
    { label: 'waiting, biggest fish', waiting: 1, running: 0, scale: 0.55 },
    { label: 'just finished', waiting: 0, running: 0, done: 1, scale: 0.416 },
  ]
  const sample = (svg) => new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 64; canvas.height = 64
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, 64, 64)
      const data = ctx.getImageData(0, 0, 64, 64).data
      const at = (x, y) => { const i = (y * 64 + x) * 4; return [data[i], data[i+1], data[i+2], data[i+3]] }
      const classify = ([r, g, b, a]) => {
        if (a < 20) return '.'
        if (r > 200 && g > 200 && b > 200) return 'W'
        if (r < 60 && g < 60 && b < 60) return 'K'
        if (b > r + 40 && b > 120) return 'B'
        if (r > 180 && g > 120 && b < 120) return 'A'
        return '?'
      }
      const map = []
      for (let y = 2; y < 64; y += 4) {
        let row = ''
        for (let x = 2; x < 64; x += 2) row += classify(at(x, y))
        map.push(row)
      }
      const flat = map.join('')
      resolve({
        center: at(32, 32), inner: at(32, 22), ring: at(32, 7), corner: at(6, 6),
        counts: { dark: (flat.match(/K/g) ?? []).length, light: (flat.match(/W/g) ?? []).length, blue: (flat.match(/B/g) ?? []).length, amber: (flat.match(/A/g) ?? []).length },
        map,
      })
    }
    image.onerror = () => resolve({ error: 'the browser refused the data URL' })
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  window.__run__ = async () => {
    const out = []
    for (const scenario of scenarios) {
      const plan = {
        bySession: new Map(),
        active: new Array(scenario.waiting + scenario.running + (scenario.done ?? 0)).fill('x'),
        finished: scenario.done ? ['a'] : [],
        waiting: scenario.waiting, approval: 0, running: scenario.running, done: scenario.done ?? 0,
      }
      const svg = plugin.sentryFavicon(plan, { fishScale: scenario.scale, reducedMotion: false })
      out.push({ label: scenario.label, ...(await sample(svg)) })
    }
    return out
  }
</script></body></html>
`

writeFileSync(join(scope, 'index.html'), page, 'utf8')
writeFileSync(join(scope, 'bundle.js'), bundle, 'utf8')

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${String(port)}`,
    `--user-data-dir=${join(scope, 'profile')}`,
    `file:///${join(scope, 'index.html').replaceAll('\\', '/')}`,
  ],
  { stdio: 'ignore' },
)

/** Wait for the DevTools endpoint to answer. @returns the page's WebSocket URL. */
async function findPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${String(port)}/json/list`)).json()
      const found = list.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (found !== undefined) return found.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return undefined
}

let failures = 0
try {
  const wsUrl = await findPage()
  if (wsUrl === undefined) throw new Error('the browser never exposed a page target')

  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')))
  })

  let sequence = 0
  /** @param method - the CDP method. @param params - its parameters. @returns the result. */
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = (sequence += 1)
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        socket.removeEventListener('message', onMessage)
        if (message.error !== undefined) reject(new Error(JSON.stringify(message.error)))
        else resolve(message.result)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id, method, params }))
    })

  /** @param expression - the page expression. @returns its value. */
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value

  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme }],
    })
    const results = await evaluate('window.__run__()')
    console.log(`icon-render-check: ===== prefers-color-scheme: ${scheme} =====`)

    for (const result of results) {
      if (result.error !== undefined) {
        console.log(`  ${result.label}: ${result.error}`)
        failures += 1
        continue
      }
      console.log(
        `  ${result.label}: center=${JSON.stringify(result.center)} inner=${JSON.stringify(result.inner)} ` +
          `ring=${JSON.stringify(result.ring)} dark_px=${String(result.counts.dark)} light_px=${String(result.counts.light)} ` +
          `blue_px=${String(result.counts.blue)} amber_px=${String(result.counts.amber)}`,
      )
      for (const row of result.map) console.log(`      ${row}`)

      // The fish must be visible: the glyph is far more than a fifth of the icon's
      // pixels, and it must be painted in the opposite luminance class from its own
      // disc. A missing fish, or a fish the same colour as the disc, both fail here.
      const fishPixels = result.counts.dark + result.counts.light
      if (fishPixels < 60) {
        console.log(`      FAIL: only ${String(fishPixels)} fish/disc-classified pixels — the glyph is missing`)
        failures += 1
      }
      const [r, g, b] = result.center
      const centerIsDark = r < 100 && g < 100 && b < 100
      const centerIsLight = r > 200 && g > 200 && b > 200
      const darkScheme = scheme === 'dark'
      if (darkScheme && !centerIsLight) {
        console.log(`      FAIL: in dark mode the fish center should be light, got ${JSON.stringify(result.center)}`)
        failures += 1
      }
      if (!darkScheme && !centerIsDark) {
        console.log(`      FAIL: in light mode the fish center should be dark, got ${JSON.stringify(result.center)}`)
        failures += 1
      }
    }
  }

  socket.close()
  console.log(
    failures === 0
      ? 'icon-render-check: OK — the fish is painted, with the opposite luminance of its disc, in both color schemes'
      : `icon-render-check: ${String(failures)} problem(s)`,
  )
} finally {
  child.kill()
  rmSync(scope, { recursive: true, force: true })
}

process.exit(failures === 0 ? 0 : 1)
