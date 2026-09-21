/**
 * Drive the emitted client bundle in a real browser and assert what only a
 * browser can answer.
 *
 * `verify-client.mjs` runs the same bundle against stubs, which is how it can
 * assert the pure decisions cheaply. Three things in this plugin are not
 * decisions, though, and a stub cannot judge them:
 *
 * 1. **The data URL.** `encodeURIComponent` output is not checked by anything
 *    until a browser parses it, and a `#` left unencoded inside the fish's own
 *    path data truncates the document at that point — an icon that renders as
 *    half a fish, with no error anywhere. So this loads the URL through an
 *    `Image` and asserts it decodes at 32×32.
 * 2. **The DOM contract.** That the plugin appends a `<link>` of its own to the
 *    head, leaves the app's link alone, and removes its own element when the tab
 *    goes quiet, rather than deleting the app's.
 * 3. **`MutationObserver` timing.** The title guard depends on the plugin's own
 *    write not re-entering its observer *as the browser schedules it*. A stub
 *    that calls the callback synchronously cannot tell whether that holds.
 *
 * Usage:
 *   node scripts/browser-check.mjs [path/to/chrome]
 *
 * Environment:
 *   DSH_SENTRY_CHROME   browser executable, when it is not found automatically
 *
 * The check SKIPS (exit 0) when no Chromium-based browser is present, because a
 * clean CI runner may have none and a release must not fail for that. Set
 * `DSH_REQUIRE=1` to turn the skip into a failure.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = process.argv[3] ?? join(root, 'lib', 'client.js')

/** Give up (or fail, under DSH_REQUIRE) because no browser is usable here. */
function skip(reason) {
  console.log(`browser-check: SKIP — ${reason}`)
  if (process.env.DSH_REQUIRE === '1') {
    console.error('browser-check: DSH_REQUIRE=1, treating the skip as a failure')
    process.exit(1)
  }
  process.exit(0)
}

/**
 * Find a Chromium-based browser. Only Chromium matters: the favicon document,
 * the SMIL animation, and the autoplay policy this plugin is written against are
 * all its behaviour.
 * @returns the executable path, or undefined.
 */
function findBrowser() {
  const explicit = process.argv[2] ?? process.env.DSH_SENTRY_CHROME
  if (explicit !== undefined) return existsSync(explicit) ? explicit : undefined
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  return candidates.find((candidate) => existsSync(candidate))
}

const browser = findBrowser()
if (browser === undefined) {
  skip('no Chromium-based browser found (pass one as an argument, or set DSH_SENTRY_CHROME)')
}

const bundle = readFileSync(bundlePath, 'utf8')
const scope = mkdtempSync(join(tmpdir(), 'dsh-sentry-browser-check-'))

/**
 * The harness page. It seeds the two platform modules the bundle requires, loads
 * the bundle as a classic script (which is what it is), then walks the
 * browser-only checklist and writes its verdict into `document.title`, which is
 * what `--dump-dom` surfaces.
 *
 * @returns the HTML source.
 */
function harnessPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>DeepSeek Harness</title>
    <link rel="icon" type="image/svg+xml" href="./app-favicon.svg" />
    <script>
      const platform = {
        react: {
          createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
          useCallback: (fn) => fn,
          useEffect: () => undefined,
          useRef: (value) => ({ current: value }),
          useState: (value) => [value, () => undefined],
        },
        '@deepseek-ai/dsh-client-store': {
          defineStore: (spec) => ({
            create: () => ({}),
            getSnapshot: () => spec.init(),
            subscribe: () => () => undefined,
          }),
        },
      }
      window.__ModuleLoader__ = {
        load(registration) {
          window.__SENTRY_PLUGIN__ = registration.factory((spec) => {
            if (!(spec in platform)) throw new Error('unexpected platform module ' + spec)
            return platform[spec]
          })
        },
      }
    </script>
  </head>
  <body>
    <script src="./bundle.js"></script>
    <script>
${CHECKLIST}
    </script>
  </body>
</html>
`
}

/**
 * The in-page checklist, kept as a template literal so the harness page reads as
 * one document. It is written against the public browser APIs only.
 */
const CHECKLIST = `
      const problems = []
      const check = (condition, message) => {
        if (!condition) problems.push(message)
      }
      const sentryLinks = () =>
        [...document.querySelectorAll('link[rel~="icon"]')].filter((link) =>
          link.hasAttribute('data-dsh-sentry-icon'),
        )
      const appLinks = () =>
        [...document.querySelectorAll('link[rel~="icon"]')].filter(
          (link) => !link.hasAttribute('data-dsh-sentry-icon'),
        )

      check(typeof window.__SENTRY_PLUGIN__?.apply === 'function', 'the bundle did not register a plugin')
      check(
        document.querySelectorAll('link[rel~="icon"]').length === 1,
        'the document did not start with exactly one icon link',
      )

      let sessionSnapshot = { ids: [], byId: {} }
      let pendingSnapshot = new Map()
      let sessionListener
      let pendingListener
      let section = {}
      let revision = 1
      let scopeListener
      const scope = {
        getSnapshot: () => ({ status: 'ready', value: section, revision, writable: true }),
        subscribe: (listener) => {
          scopeListener = listener
          return () => undefined
        },
        set: (field, value) => {
          section = { ...section, [field]: value }
          revision += 1
          scopeListener()
        },
        unset: () => undefined,
      }
      const ctx = {
        effect: (execute) => {
          execute()
          return { dispose: () => undefined }
        },
        on: () => undefined,
        get: () => undefined,
        locale: { register: () => () => undefined, bind: () => (key) => key },
        settingsScope: { bind: () => scope },
        sessions: {
          list: {
            getSnapshot: () => sessionSnapshot,
            subscribe: (listener) => {
              sessionListener = listener
              return () => undefined
            },
          },
        },
        uiSession: {
          pendingInteractions: {
            getSnapshot: () => pendingSnapshot,
            subscribe: (listener) => {
              pendingListener = listener
              return () => undefined
            },
          },
        },
        slots: { inject: (name, callback) => callback(), register: () => () => undefined },
      }

      try {
        window.__SENTRY_PLUGIN__.apply(ctx)
      } catch (error) {
        problems.push('apply() threw: ' + (error && error.message))
      }

      const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
      const finish = () => {
        document.title = 'SENTRY-RESULT ' + problems.length + ' ' + problems.join(' | ')
      }

      ;(async () => {
        check(sentryLinks().length === 0, 'an idle plugin must not mount an icon')
        check(appLinks().length === 1, "the app's own icon link must be left alone")
        check(
          document.title === 'DeepSeek Harness',
          'an idle plugin must not touch the title (got ' + JSON.stringify(document.title) + ')',
        )

        sessionSnapshot = { ids: ['s1'], byId: { s1: { id: 's1', blank: false, running: true } } }
        pendingSnapshot = new Map([['s1', { sessionId: 's1', kind: 'question', key: 'k' }]])
        sessionListener()

        const mounted = sentryLinks()
        check(mounted.length === 1, 'a waiting session must mount exactly one icon link (got ' + mounted.length + ')')
        const icon = mounted[0]
        check(icon.parentElement === document.head, 'the icon must be appended to the head')
        check(icon.getAttribute('type') === 'image/svg+xml', 'the icon link must declare the SVG type')
        check(appLinks().length === 1, "the app's own icon must still be there")

        const svgUrl = icon.href
        check(svgUrl.startsWith('data:image/svg+xml'), 'unexpected icon href ' + svgUrl.slice(0, 40))
        const decoded = decodeURIComponent(svgUrl.slice(svgUrl.indexOf(',') + 1))
        check(decoded.includes('width="32"') && decoded.includes('height="32"'), 'the SVG must carry explicit dimensions')
        check(decoded.includes('id="fish"'), 'the fish group must be present')

        const rendered = await new Promise((resolve) => {
          const probe = new Image()
          probe.onload = () => resolve({ ok: true, width: probe.naturalWidth, height: probe.naturalHeight })
          probe.onerror = () => resolve({ ok: false })
          probe.src = svgUrl
        })
        check(rendered.ok === true, 'the browser refused to decode the favicon data URL')
        if (rendered.ok) {
          check(
            rendered.width === 32 && rendered.height === 32,
            'the favicon decoded at ' + rendered.width + 'x' + rendered.height + ', expected 32x32',
          )
        }

        check(
          document.title.includes('\\u2460'),
          'the title must carry the status prefix (got ' + JSON.stringify(document.title) + ')',
        )
        check(document.title.endsWith('\\u200b'), 'a composed title must carry the marker')

        document.title = 'Another session — DeepSeek Harness'
        await settle()
        check(
          document.title.includes('\\u2460') && document.title.includes('Another session'),
          'the observer must re-compose after an app rewrite (got ' + JSON.stringify(document.title) + ')',
        )
        const recomposed = document.title
        await settle()
        check(document.title === recomposed, 'the observer must not stack prefixes')

        pendingSnapshot = new Map()
        sessionSnapshot = { ids: [], byId: {} }
        pendingListener()
        check(sentryLinks().length === 0, 'the icon must be removed when the tab goes quiet')
        check(
          document.title === 'Another session — DeepSeek Harness',
          'the prefix must come off (got ' + JSON.stringify(document.title) + ')',
        )
        check(
          document.querySelectorAll('style[data-plugin]').length >= 1,
          'the row stylesheet must be installed',
        )
        finish()
      })().catch((error) => {
        problems.push('the checklist itself threw: ' + (error && error.message))
        finish()
      })
`

try {
  writeFileSync(join(scope, 'index.html'), harnessPage(), 'utf8')
  writeFileSync(join(scope, 'bundle.js'), bundle, 'utf8')
  // The app's own favicon, so the harness starts from the state the shell mounts.
  const frontendFavicon = join(root, 'src', 'fish.txt')
  writeFileSync(
    join(scope, 'app-favicon.svg'),
    existsSync(frontendFavicon)
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 50 50"><path d="${readFileSync(frontendFavicon, 'utf8').trim()}" fill="#000"/></svg>`
      : '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>',
    'utf8',
  )

  const url = `file:///${join(scope, 'index.html').replaceAll('\\', '/')}`
  const result = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(scope, 'profile')}`,
      '--virtual-time-budget=5000',
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )

  const dom = result.stdout ?? ''
  const title = /<title>([^<]*)<\/title>/.exec(dom)?.[1]
  if (title === undefined || !title.startsWith('SENTRY-RESULT ')) {
    if (result.error !== undefined) throw result.error
    console.error(`browser-check: the harness did not report a verdict (stderr: ${(result.stderr ?? '').slice(0, 400)})`)
    process.exit(1)
  }

  const [, count, detail] = /^SENTRY-RESULT (\d+)\s*(.*)$/.exec(title)
  const failures = Number(count)
  if (failures > 0) {
    console.error(`browser-check: ${String(failures)} problem(s) in ${browser}:`)
    for (const problem of detail.split(' | ')) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(`browser-check: OK — ${browser}`)
  console.log('browser-check: data URL decoded at 32x32, DOM contract, and observer timing verified')
} finally {
  rmSync(scope, { recursive: true, force: true })
}
