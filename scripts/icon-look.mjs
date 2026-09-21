/**
 * Look at the actual shipped favicon at the real favicon size.
 *
 * The design questions here are all about what survives at 16px: does the carved
 * fish still read as a fish, does the disc colour read as the state, is the badge
 * legible. None of that is visible in a string assertion or at 64px, so this
 * renders the plugin's own output through the bundle and prints both sizes.
 *
 * It asserts nothing and exits 0. The gate is `icon-render-check.mjs`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const browser =
  process.env.DSH_SENTRY_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const scope = mkdtempSync(join(tmpdir(), 'dsh-sentry-look-'))
const port = 9227
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>look</title>
<script>window.__errors__ = []; window.addEventListener('error', (e) => window.__errors__.push(String(e.message)))</script>
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
  const states = [
    { label: 'running (2 hands turn)', waiting: 0, running: 1 },
    { label: 'waiting for an answer (fast blink) + 1', waiting: 1, running: 0 },
    { label: 'waiting for an answer + 3', waiting: 3, running: 1 },
    { label: 'waiting for approval (slow blink)', approval: 1 },
    { label: 'just finished (colour pulse)', done: 1 },
  ]
  const render = (svg, size) => new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0, size, size)
      const data = ctx.getImageData(0, 0, size, size).data
      const classify = (r, g, b, a) => {
        if (a < 24) return '.'
        if (r > 200 && g > 200 && b > 200) return 'W'
        if (r < 70 && g < 70 && b < 70) return 'K'
        if (b > r + 40 && b > 110) return 'B'
        if (r > 180 && g > 120 && b < 120) return 'A'
        if (g > 120 && r < 130 && b < 130) return 'G'
        return '?'
      }
      const map = []
      for (let y = 0; y < size; y += 1) {
        let row = ''
        for (let x = 0; x < size; x += 1) {
          const i = (y * size + x) * 4
          row += classify(data[i], data[i + 1], data[i + 2], data[i + 3])
        }
        map.push(row)
      }
      resolve(map)
    }
    image.onerror = () => resolve(['<refused>'])
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
  window.__run__ = async () => {
    const out = []
    for (const state of states) {
      const plan = {
        bySession: new Map(),
        active: new Array((state.waiting ?? 0) + (state.approval ?? 0) + (state.running ?? 0) + (state.done ?? 0)).fill('x'),
        finished: state.done ? ['a'] : [],
        waiting: state.waiting ?? 0,
        approval: state.approval ?? 0,
        running: state.running ?? 0,
        done: state.done ?? 0,
      }
      const svg = plugin.sentryFavicon(plan, { reducedMotion: false })
      out.push({ label: state.label, small: await render(svg, 16), big: await render(svg, 64) })
    }
    return out
  }
<\/script></body></html>
`

writeFileSync(join(scope, 'index.html'), page, 'utf8')
writeFileSync(join(scope, 'bundle.js'), bundle, 'utf8')

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=' + String(port),
    '--user-data-dir=' + join(scope, 'profile'),
    'file:///' + join(scope, 'index.html').replaceAll('\\', '/'),
  ],
  { stdio: 'ignore' },
)

/** @returns the page's DevTools WebSocket URL, or undefined. */
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

try {
  const wsUrl = await findPage()
  if (wsUrl === undefined) throw new Error('no page target')
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve) => socket.addEventListener('open', resolve))
  let sequence = 0
  const send = (method, params) =>
    new Promise((resolve) => {
      const id = (sequence += 1)
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        socket.removeEventListener('message', onMessage)
        resolve(message.result)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails !== undefined) {
      throw new Error(
        `the page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      )
    }
    return result.result.value
  }

  // See icon-lab.mjs: the page target appears before the inline script has run, so
  // wait for the entry point rather than reading `__run__` and blaming the icon.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const probed = await send('Runtime.evaluate', {
      expression: 'typeof window.__run__',
      returnByValue: true,
    })
    if (probed.result.value === 'function') break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const pageErrors = await evaluate('window.__errors__ ?? []')
  if (pageErrors.length > 0) { console.error('page errors:', pageErrors.join(' | ')) }
  const results = await evaluate('window.__run__()')
  for (const result of results) {
    console.log(`\n======== ${result.label}`)
    console.log('  16px (the real favicon size):')
    for (const row of result.small) console.log('    ' + row)
    console.log('  64px:')
    for (const row of result.big) console.log('    ' + row)
  }
  socket.close()
} finally {
  child.kill()
  await new Promise((resolve) => setTimeout(resolve, 300))
  try {
    rmSync(scope, { recursive: true, force: true })
  } catch {
    /* left for the OS to reap */
  }
}

