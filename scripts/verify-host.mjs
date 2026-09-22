/**
 * Verify the host half without a running DSH: import `lib/index.js`, exercise the
 * schema against the real `@deepseek-ai/schemastery`, and drive `apply(ctx)` with
 * a stub context to prove the namespace registers.
 *
 * Usage:
 *   node scripts/verify-host.mjs
 *
 * Environment:
 *   DSH_HOME      Harness home holding profiles/ (default ~/.dsh)
 *   DSH_PROFILE   Profile name to resolve the plugin through (default web)
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/**
 * Import `lib/index.js`, either from a path given on the command line or from an
 * installed profile.
 *
 * The host half imports `@deepseek-ai/schemastery`, which dsh supplies to a
 * plugin from the installation's module fallback rather than from the plugin's
 * own tree. Importing through the profile link reproduces that resolution, so
 * this check also proves the plugin's runtime dependencies actually resolve where
 * dsh will load it from. Falling back to the direct path keeps the check usable
 * in a bare checkout.
 */
async function importHost() {
  const explicit = process.argv[2] ?? process.env.DSH_SENTRY_HOST
  if (explicit !== undefined) {
    return { host: await import(pathToFileURL(resolve(explicit)).href), via: resolve(explicit) }
  }
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const dshHome = process.env.DSH_HOME ?? (home === '' ? undefined : join(home, '.dsh'))
  const profile = process.env.DSH_PROFILE ?? 'web'
  if (dshHome !== undefined) {
    const anchor = join(dshHome, 'profiles', profile, 'package.json')
    if (existsSync(anchor)) {
      try {
        // Resolve the bare specifier: `exports` maps "." to lib/index.js.
        const resolved = createRequire(anchor).resolve(PACKAGE_NAME)
        return { host: await import(pathToFileURL(resolved).href), via: resolved }
      } catch {
        /* not installed in that profile; fall through to the direct import */
      }
    }
  }
  const direct = join(root, 'lib', 'index.js')
  return { host: await import(pathToFileURL(direct).href), via: direct }
}

const { host, via } = await importHost()
console.log(`verify-host: loaded ${via}`)

const {
  ALERT_NAMESPACE,
  ALERT_FIELDS,
  AlertSchema,
  Config,
  DEFAULT_STYLE_DOCUMENT,
  apply,
} = host

assert.equal(ALERT_NAMESPACE, 'alert', 'the namespace must not squat on the reserved ui-* prefix')

// The roster is hand-duplicated on the browser side; this is the copy the
// browser-side verifier compares against.
assert.deepEqual(ALERT_FIELDS, ['style'])

// The schema resolves a complete default section — what an absent settings
// document must produce, which is also what the browser half falls back to.
const defaults = AlertSchema({})
assert.deepEqual(defaults, { style: DEFAULT_STYLE_DOCUMENT })

// The document is text and only text. Its *contents* are the browser half's
// business — it has a reader with real diagnostics, which reports what it cannot
// use and falls back property by property — so the only thing the host validates
// is that a hand-edited `settings.yaml` cannot put a number where the document
// belongs.
assert.equal(AlertSchema({ style: 'icon off' }).style, 'icon off')
assert.throws(() => AlertSchema({ style: 42 }))
assert.throws(() => AlertSchema({ style: ['icon on'] }))
assert.throws(() => AlertSchema({ style: true }))
// `null` is schemastery's spelling of "unset", so it resolves to the shipped
// document rather than being refused. Worth pinning: it is the difference between a
// cleared field and a document that failed validation, and only one of them should
// leave the tab without an icon.
assert.equal(AlertSchema({ style: null }).style, DEFAULT_STYLE_DOCUMENT)

// The shipped document is an array of lines joined for the wire, and it is the
// same document the browser half ships; the browser-side verifier compares the two
// copies character for character.
assert.equal(typeof DEFAULT_STYLE_DOCUMENT, 'string')
assert.ok(DEFAULT_STYLE_DOCUMENT.includes('waiting {'))
assert.ok(!DEFAULT_STYLE_DOCUMENT.endsWith('\n'), 'the document must not carry a trailing newline')

// Drive apply(ctx) with a stub that records the namespace registration.
const registered = []
let injectedSettings
const ctx = {
  inject(deps, callback) {
    assert.deepEqual(deps, ['settings'])
    injectedSettings = {
      settings: {
        register(namespace, schema) {
          registered.push({ namespace, schema })
        },
      },
    }
    callback(injectedSettings)
  },
  get(name) {
    return name === 'settings' ? injectedSettings.settings : undefined
  },
}

apply(ctx)

assert.equal(registered.length, 1)
assert.equal(registered[0].namespace, 'alert')
assert.ok(registered[0].schema !== undefined)

// With no provider at all, apply() must still be a no-op rather than throwing:
// the browser half falls back to the same defaults, so the sentry works before
// it is configurable.
apply({ inject: () => undefined, get: () => undefined })

// ── the 0.1.7 line: the entry's Config is the section ──────────────────────
//
// That line's settings service has `configure` and no `register`: the durable
// section is the entry's own exported `Config`, whose single field is marked
// `.volatile()` so the configuration editor knows it may write the document.
{
  const configured = []
  const errors = []
  const fiber = { name: 'alert' }
  apply({
    fiber,
    inject: (_deps, callback) => {
      callback({
        effect: (execute) => {
          execute()
          return { dispose: () => undefined }
        },
        settings: {
          configure: (presentation, owner) => {
            configured.push({ presentation, owner })
            return () => undefined
          },
        },
        logger: { error: (message) => errors.push(message) },
      })
    },
    get: () => undefined,
  })
  assert.equal(configured.length, 1, 'the generated page must be turned off exactly once')
  assert.deepEqual(configured[0].presentation, { auto: false })
  assert.equal(configured[0].owner, fiber, 'the policy belongs to this plugin fiber')
  assert.deepEqual(errors, [], 'the 0.1.7 settings API is supported, not reported')
}

// The field the durable schema validates must also be offered to the 0.1.7
// configuration editor, or the document would be editable on one line and not the
// other.
{
  assert.ok(Config !== undefined, 'the entry must export a Config for the 0.1.7 line')
  assert.deepEqual(
    Object.keys(Config({})).sort(),
    Object.keys(AlertSchema({})).sort(),
    'the two schemas must describe the same fields',
  )
  // Only volatile fields are exposed to the 0.1.7 configuration editor, and this
  // verifier runs against the copy of schemastery that exposes no `.volatile()` at
  // all — so this is the assertion that catches a marking that silently did
  // nothing, which is what made dsh refuse to import this entry's settings.
  for (const [field, schema] of Object.entries(Config.dict ?? {})) {
    assert.equal(
      schema.meta.volatile,
      true,
      `${field} must be marked volatile, or the 0.1.7 configuration editor cannot write it`,
    )
  }
}

// A settings service with neither call is a dsh whose settings model moved again.
// Registering is impossible there, so the plugin's job is to say why, in its own
// words, instead of leaving an opaque TypeError beside a boot audit about plugin
// activation.
{
  const errors = []
  apply({
    inject: (_deps, callback) => {
      callback({ settings: {}, logger: { error: (message) => errors.push(message) } })
    },
    get: () => undefined,
  })
  assert.equal(errors.length, 1, 'the unsupported settings API must be reported')
  assert.match(errors[0], /settings\.register/)
  assert.match(errors[0], /settings\.configure/)
  assert.match(errors[0], /alert/)
  assert.match(errors[0], /0\.1\.5-rc\.x/)
}

console.log('verify-host: OK — namespace registered, defaults and the document field verified')


