/**
 * Icon design lab: render candidate designs at 64px and at the real 16px favicon
 * size, and print them as pixel maps.
 *
 * A design question — does a carved spoke read at 16px, is a full-size fish
 * legible inside a filled disc — cannot be settled by argument, and a string
 * assertion cannot see it at all. This draws each candidate and classifies the
 * pixels, so the answer is a picture.
 *
 * It is a lab, not a gate: it asserts nothing and exits 0. The gate is
 * `icon-render-check.mjs`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const browser =
  process.env.DSH_SENTRY_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const scope = mkdtempSync(join(tmpdir(), 'dsh-sentry-lab-'))
const port = 9226

// The fish, straight out of the bundle the plugin actually ships.
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
const fish = /const FISH_PATH =\s*'([^']+)'/.exec(bundle)?.[1]
if (fish === undefined) {
  console.error('icon-lab: could not find FISH_PATH in lib/client.js')
  process.exit(1)
}

/** The lab page. `__FISH__` is injected by the caller. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>lab</title>
<script>
  window.__errors__ = []
  window.addEventListener('error', (event) => window.__errors__.push(String(event.message)))
</script>
<script>window.__FISH__ = __FISH_LITERAL__</script>
</head><body><script>
  const FISH = () => window.__FISH__
  const FULL = 32 / 50
  const R = 15.4
  /** The fish's own placement: the 50x50 art scaled to the canvas. */
  const place = (scale) =>
    'translate(' + (16 - 16 * scale) + ' ' + (16 - 16 * scale) + ') scale(' + scale + ') translate(-16 -16) translate(16 16)'

  /**
   * One candidate icon.
   * @param spec - the design parameters.
   * @returns the SVG source.
   */
  const icon = (spec) => {
    const { disc, fishFill, fishScale = FULL, pattern = 'none', spokes = 2, animate = 'none', lollipop = false } = spec
    let maskShapes = ''
    if (pattern === 'spokes') {
      for (let index = 0; index < spokes; index += 1) {
        maskShapes +=
          '<g transform="rotate(' + (360 / spokes) * index + ' 16 16)">' +
          '<rect x="14.7" y="2.2" width="2.6" height="14.6" rx="1.3" fill="#000"/>' +
          (lollipop ? '<circle cx="16" cy="3.6" r="2.7" fill="#000"/>' : '') +
          '</g>'
      }
    }
    if (pattern === 'petals') {
      for (let index = 0; index < 12; index += 1) {
        maskShapes += '<g transform="rotate(' + index * 30 + ' 16 16)"><ellipse cx="16" cy="4.4" rx="1.4" ry="3.2" fill="#000"/></g>'
      }
    }
    if (pattern === 'windmill') {
      for (let index = 0; index < 4; index += 1) {
        maskShapes += '<g transform="rotate(' + index * 90 + ' 16 16)"><path d="M16 16 L16 3.2 A12.8 12.8 0 0 1 27 9.4 Z" fill="#000"/></g>'
      }
    }
    const mask =
      '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">' +
      '<circle cx="16" cy="16" r="' + R + '" fill="#fff"/>' + maskShapes +
      '<g transform="' + place(fishScale) + '"><path d="' + FISH() + '" fill="#000" fill-rule="nonzero"/></g>' +
      '</mask>'
    const fishOnTop =
      '<g transform="' + place(fishScale) + '"><path d="' + FISH() + '" fill="' + fishFill + '" fill-rule="nonzero"/></g>'
    let animation = ''
    if (animate === 'spin') animation = '<animateTransform attributeName="transform" type="rotate" values="0 16 16;360 16 16" dur="2.4s" repeatCount="indefinite"/>'
    else if (animate === 'blink') animation = '<animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite"/>'
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<defs>' + mask + '</defs>' +
      '<g>' + animation + '<circle cx="16" cy="16" r="' + R + '" fill="' + disc + '" mask="url(#m)"/></g>' +
      (spec.carve ? '' : fishOnTop) +
      '</svg>'
    )
  }

  const candidates = {
    contrast_white: { label: 'A. full-size fish OVER the disc, contrast fill (white on blue)', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff' }) },
    contrast_dark: { label: 'B. full-size fish OVER the disc, shipped dark fill', svg: () => icon({ disc: '#4d6bfe', fishFill: '#0b0d10' }) },
    carve_fish: { label: 'C. full-size fish CARVED out of the disc', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', carve: true }) },
    spokes_carve: { label: 'D. 2 spokes carved + fish carved (clock hands)', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', pattern: 'spokes', spokes: 2, carve: true }) },
    spokes_paint: { label: 'E. 2 spokes carved + fish painted white on top', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', pattern: 'spokes', spokes: 2 }) },
    lollipop: { label: 'F. 2 lollipop spokes + fish carved', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', pattern: 'spokes', spokes: 2, lollipop: true, carve: true }) },
    petals: { label: 'G. 12 petals carved + fish carved', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', pattern: 'petals', carve: true }) },
    windmill: { label: 'H. 4 windmill blades carved + fish carved', svg: () => icon({ disc: '#4d6bfe', fishFill: '#ffffff', pattern: 'windmill', carve: true }) },
    waiting: { label: 'I. waiting: amber disc, fish carved, blinking', svg: () => icon({ disc: '#f59e0b', fishFill: '#0b0d10', animate: 'blink', carve: true }) },
    done: { label: 'J. done: green disc, fish carved', svg: () => icon({ disc: '#22c55e', fishFill: '#0b0d10', carve: true }) },
  }

  /**
   * Draw an icon at a size and classify its pixels.
   * @param svg - the icon source.
   * @param size - the canvas size.
   * @returns a promise of the ASCII map and class counts.
   */
  const sample = (svg, size) =>
    new Promise((resolve) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        const classify = (r, g, b, a) => {
          if (a < 24) return '.'
          if (r > 200 && g > 200 && b > 200) return 'W'
          if (r < 70 && g < 70 && b < 70) return 'K'
          if (b > r + 40 && b > 110) return 'B'
          if (r > 180 && g > 120 && b < 120) return 'A'
          if (g > 120 && r < 120 && b < 120) return 'G'
          return '?'
        }
        const step = Math.max(1, Math.floor(size / 32))
        const map = []
        for (let y = 0; y < size; y += step) {
          let row = ''
          for (let x = 0; x < size; x += step) {
            const i = (y * size + x) * 4
            row += classify(data[i], data[i + 1], data[i + 2], data[i + 3])
          }
          map.push(row)
        }
        const flat = map.join('')
        const count = (ch) => flat.split(ch).length - 1
        resolve({ map, counts: { transparent: count('.'), white: count('W'), dark: count('K'), blue: count('B'), amber: count('A'), green: count('G') } })
      }
      image.onerror = () => resolve({ error: 'refused' })
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    })

  window.__run__ = async () => {
    const out = []
    for (const candidate of Object.values(candidates)) {
      const svg = candidate.svg()
      if (svg.includes('undefined')) { out.push({ label: candidate.label, error: 'the fish path was missing' }); continue }
      out.push({ label: candidate.label, big: await sample(svg, 64), small: await sample(svg, 16) })
    }
    return out
  }
</script></body></html>
`

writeFileSync(
  join(scope, 'index.html'),
  PAGE.replace('__FISH_LITERAL__', JSON.stringify(fish)),
  'utf8',
)

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

const only = process.argv[2]

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
        `the lab page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      )
    }
    return result.result.value
  }

  // The page target exists before the document's inline script has run, so asking
  // for `__run__` straight away is a race — and one that reads as a broken lab
  // under load rather than as a slow start. Wait for the entry point first, so the
  // error list below is the page's own errors and not this file's impatience.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const probed = await send('Runtime.evaluate', {
      expression: 'typeof window.__run__',
      returnByValue: true,
    })
    if (probed.result.value === 'function') break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const errors = await evaluate('window.__errors__ ?? []')
  if (errors.length > 0) {
    console.error(`icon-lab: the page reported ${String(errors.length)} error(s):`)
    for (const error of errors) console.error(`  - ${error}`)
  }

  const results = await evaluate('window.__run__()')
  for (const result of results) {
    if (only !== undefined && !result.label.toLowerCase().includes(only.toLowerCase())) continue
    console.log(`\n================ ${result.label}`)
    if (result.error !== undefined) {
      console.log(`  ERROR: ${result.error}`)
      continue
    }
    console.log(
      `  at 64px: transparency=${String(result.big.counts.transparent)} white=${String(result.big.counts.white)} ` +
        `disc=${String(result.big.counts.blue + result.big.counts.amber + result.big.counts.green)}`,
    )
    for (const row of result.big.map) console.log('    ' + row)
    console.log('  at 16px (the real favicon size):')
    for (const row of result.small.map) console.log('    ' + row)
  }
  socket.close()
} finally {
  child.kill()
  // The browser's own profile files stay locked for a moment after the process is
  // signalled; a scratch directory that outlives the run is not worth an exit code.
  await new Promise((resolve) => setTimeout(resolve, 300))
  try {
    rmSync(scope, { recursive: true, force: true })
  } catch {
    /* left for the OS to reap */
  }
}
