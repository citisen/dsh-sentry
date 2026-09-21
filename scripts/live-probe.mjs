/**
 * Ask the running DSH page whether this plugin actually loaded.
 *
 * The bundle route serves an exact table of revisioned URLs, so no guessed URL
 * proves anything: every bare `/plugins/<id>/client.js` is 404, including the
 * built-in plugins'. The only authority on whether the sentry loaded is the page
 * itself, and this attaches to it over the DevTools protocol to ask.
 *
 * The marker is the plugin's own stylesheet tag. `installRowStyles` runs first in
 * `apply()`, before anything state-dependent, so it is present as soon as the
 * module has been materialized — even with every session idle, which is exactly
 * when a check like this needs something to look at.
 *
 * Usage:
 *   node scripts/live-probe.mjs [port]
 *
 * Environment:
 *   DSH_SENTRY_CDP      DevTools HTTP endpoint (default 127.0.0.1:9222)
 *   DSH_SENTRY_MARKER   data-plugin value to look for (default this package)
 */

const endpoint = process.env.DSH_SENTRY_CDP ?? `127.0.0.1:${process.argv[2] ?? '9222'}`
const marker = process.env.DSH_SENTRY_MARKER ?? '@citisen/dsh-sentry'

/**
 * One CDP request over the HTTP half of the protocol.
 * @param path - the endpoint path.
 * @returns the parsed JSON body.
 */
async function httpJson(path) {
  const response = await fetch(`http://${endpoint}${path}`)
  if (!response.ok) throw new Error(`CDP ${path} -> ${String(response.status)}`)
  return response.json()
}

/**
 * Run one expression in a target and return its value.
 * @param wsUrl - the target's DevTools WebSocket URL.
 * @param expression - the expression to evaluate.
 * @returns the unserialized result.
 */
function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('the DevTools evaluation timed out'))
    }, 10000)
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      )
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      if (message.result?.exceptionDetails !== undefined) {
        reject(new Error(message.result.exceptionDetails.text ?? 'the page threw'))
        return
      }
      resolve(message.result?.result?.value)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('the DevTools socket failed'))
    })
  })
}

let targets
try {
  targets = await httpJson('/json/list')
} catch (error) {
  console.error(`live-probe: cannot reach the DevTools endpoint at ${endpoint}: ${String(error)}`)
  console.error('live-probe: start the browser with --remote-debugging-port=<port> and retry')
  process.exit(2)
}

const pages = targets.filter((target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
if (pages.length === 0) {
  console.error('live-probe: the browser has no page targets')
  process.exit(2)
}

console.log(`live-probe: ${String(pages.length)} page target(s) at ${endpoint}`)
let found = 0

for (const page of pages) {
  const result = await evaluate(
    page.webSocketDebuggerUrl,
    `(() => {
       const marker = ${JSON.stringify(marker)};
       const styles = [...document.querySelectorAll('style[data-plugin]')].map((node) => node.dataset.plugin);
       const icons = [...document.querySelectorAll('link[rel~="icon"]')].map((node) => ({
         sentry: node.hasAttribute('data-dsh-sentry-icon'),
         rel: node.rel,
         href: String(node.href).slice(0, 44),
       }));
       const rows = [...document.querySelectorAll('[class*="dsh-sentry"]')].length;
       return {
         url: location.href,
         title: document.title,
         styles,
         sawSentryCss: styles.includes(marker),
         icons,
         sentryIconMounted: icons.some((icon) => icon.sentry),
         rows,
         hasBoot: typeof window.__DSH_BOOT__ === 'object' && window.__DSH_BOOT__ !== null,
       };
     })()`,
  )

  const label = result.url === '' ? '(blank page)' : result.url
  console.log(`live-probe: --- ${label}`)
  console.log(`live-probe:     title      ${JSON.stringify(result.title)}`)
  console.log(`live-probe:     plugins    ${JSON.stringify(result.styles.filter((name) => name.startsWith('@citisen')))}`)
  console.log(`live-probe:     sentry css ${result.sawSentryCss ? 'PRESENT' : 'absent'}`)
  console.log(`live-probe:     icon links ${JSON.stringify(result.icons)}`)
  console.log(`live-probe:     boot       ${result.hasBoot ? 'yes' : 'no'}`)
  if (result.sawSentryCss) found += 1
}

console.log(
  found > 0
    ? `live-probe: OK — the plugin is loaded in ${String(found)} page(s)`
    : 'live-probe: the plugin is NOT loaded in any open page',
)
process.exit(found > 0 ? 0 : 1)
