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
 * 4. **A settings write reaching the icon, and a preview reaching the tab.** The
 *    Settings row's editor writes the document through the same scope the engine
 *    reads, and its preview buttons go through the actions the slot registry
 *    injects. Whether either actually replaces the tab's icon element (rather than
 *    mutating the `href` of the one already mounted, which a tab strip does not
 *    reliably notice) is a question about the browser, not about the plugin's own
 *    bookkeeping.
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
      let registeredSlot
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
        slots: {
          inject: (name, callback) => callback(),
          // Captured rather than discarded, because the actions the registry injects are
          // the row's whole interface to the engine: the tab-preview button is only
          // reachable through them, and whether it reaches the tab is a browser question.
          register: (options) => {
            registeredSlot = options
            return () => undefined
          },
        },
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
        // Split on the media type's own comma. A plain indexOf of a comma would
        // land inside image/svg+xml;charset=utf-8, which decodes to something that
        // is not the SVG at all — a trap this check fell into once already.
        // Anchor on the payload's own opening tag rather than counting characters
        // through the media type: the header contains a comma of its own, and
        // offset arithmetic against it is a bug waiting to happen.
        const decoded = decodeURIComponent(svgUrl.slice(svgUrl.indexOf('%3Csvg')))
        check(decoded.startsWith('<svg'), 'the data URL must decode to the icon itself; href began ' + svgUrl.slice(0, 60) + ' and decoded to ' + decoded.slice(0, 60))
        check(decoded.includes('width="32"') && decoded.includes('height="32"'), 'the SVG must carry explicit dimensions')
        check(decoded.includes('<mask id="disc"'), 'the disc must be mask-carved')
        // This scenario is a running session with a pending question, and a question
        // outranks a busy tab: one icon carries one disc colour, and the most urgent
        // fact is the one worth it. Per-state colours belong to the icon render
        // check; what matters here is that the browser paints the disc at all.
        check(decoded.indexOf('fill="#f59e0b"') >= 0, 'the disc must be painted in the state colour')

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

        // ── a settings write reaches the icon ─────────────────────────────────
        // The row's editor writes the document through the same scope the engine reads,
        // so this is the whole wire between "the user typed" and "the tab changed" — and
        // it is the one path a Node stub cannot drive, because it depends on how the
        // browser schedules the subscription. The document written here says
        // \`motion still\`, so nothing but this write can repaint anything.
        const before = sentryLinks()[0].href
        scope.set('style', 'waiting {\\n  color red\\n  motion still\\n}')
        await settle()
        check(sentryLinks().length === 1, 'a settings write must leave exactly one icon link behind')
        const after = decodeURIComponent(sentryLinks()[0].href)
        check(after !== before, 'a settings write must change the icon, not leave the old one mounted')
        check(
          after.includes('fill="#ef4444"'),
          'a settings write must repaint the icon in the state it names (got ' +
            after.slice(after.indexOf('<rect'), after.indexOf('<rect') + 50) +
            ')',
        )
        check(after.includes('mask="url(#disc)"'), 'and must still carve the fish out of it')
        scope.set('style', '')
        await settle()
        check(
          decodeURIComponent(sentryLinks()[0].href).includes('fill="#f59e0b"'),
          'and writing the document back must repaint it back',
        )

        // ── one state in the tab, on demand ───────────────────────────────────
        // The row's preview button goes through the injected actions and ends in the same
        // render pass as everything else. The live plan here is still the waiting session,
        // so a preview of \`done\` is unmistakably a different picture — which is the whole
        // point: an edit to a state no session is in cannot be judged any other way.
        check(registeredSlot !== undefined, 'the row must have registered its slot options')
        const actions = registeredSlot.inject({ sync: () => undefined })
        check(typeof actions.preview === 'function', 'the row must be able to show a state in the tab')
        actions.preview('done')
        await settle()
        check(
          decodeURIComponent(sentryLinks()[0].href).includes('fill="#22c55e"'),
          'a preview must put the state it names in the tab (got ' +
            decodeURIComponent(sentryLinks()[0].href).slice(
              decodeURIComponent(sentryLinks()[0].href).indexOf('<rect'),
              decodeURIComponent(sentryLinks()[0].href).indexOf('<rect') + 50,
            ) +
            ')',
        )
        check(
          document.title.includes('alert.status.done'),
          'and must compose the title for that state (got ' + JSON.stringify(document.title) + ')',
        )
        actions.preview(undefined)
        await settle()
        check(
          decodeURIComponent(sentryLinks()[0].href).includes('fill="#f59e0b"'),
          'and leaving the preview must restore the live state',
        )
        check(
          document.title.includes('alert.status.waiting'),
          'title and all (got ' + JSON.stringify(document.title) + ')',
        )

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
  console.log(
    'browser-check: data URL decoded at 32x32, DOM contract, title observer, a settings write repainting the icon, and a state previewed in the tab verified',
  )
} finally {
  rmSync(scope, { recursive: true, force: true })
}



