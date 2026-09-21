/**
 * Register this plugin's namespace with the host half of the settings seam for
 * real, and compare what it resolves against what the browser half assumes.
 *
 * `verify-host.mjs` drives `apply(ctx)` with a stub context, which proves the
 * call shape but not the contract: that `alert` is a namespace the real service
 * accepts, that the schema survives registration, and — the failure this check
 * exists for — that the value the host resolves and the defaults the browser
 * half falls back to are the *same value*. Those two live in separate bundles
 * that cannot share a module, so a default changed on one side only would show
 * up as an interface that renders one setting and enforces another.
 *
 * It boots a real cordis `Context` with the real `SettingsProvider` subclass
 * from the dsh installation, registers the plugin through the same
 * `ctx.inject(['settings'], …)` the host half uses, and then reads and writes
 * the namespace. The browser half is loaded the same way a browser would load
 * it — through the emitted bundle's factory — so the comparison is against the
 * shipped code rather than against the source.
 *
 * Usage:
 *   node scripts/verify-settings.mjs
 *
 * Environment:
 *   DSH_HOME      Harness home holding profiles/ (default ~/.dsh)
 *   DSH_PROFILE   Profile name to resolve dsh through (default web)
 *   DSH_CHECKOUT  dsh installation's node_modules/@deepseek-ai
 *   DSH_REQUIRE   Set to 1 to fail instead of skipping when dsh is unavailable
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Give up (or fail, under DSH_REQUIRE) because dsh is not usable here. */
function skip(reason) {
  console.log(`verify-settings: SKIP — ${reason}`)
  if (process.env.DSH_REQUIRE === '1') {
    console.error('verify-settings: DSH_REQUIRE=1, treating the skip as a failure')
    process.exit(1)
  }
  process.exit(0)
}

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? ''
const DSH_HOME = process.env.DSH_HOME ?? (HOME === '' ? undefined : join(HOME, '.dsh'))
const PROFILE = process.env.DSH_PROFILE ?? 'web'

/**
 * The module anchor this check resolves dsh and cordis through.
 *
 * The profile directory is where a plugin's dependencies actually resolve at
 * runtime, so resolving from there reproduces the loader's own resolution rather
 * than a convenient local one.
 * @returns the anchor path, or undefined.
 */
function findAnchor() {
  if (process.env.DSH_CHECKOUT !== undefined) {
    return join(process.env.DSH_CHECKOUT, 'dsh', 'package.json')
  }
  const installed =
    DSH_HOME === undefined ? undefined : join(DSH_HOME, 'profiles', PROFILE, 'package.json')
  if (installed !== undefined && existsSync(installed)) return installed
  return undefined
}

const anchor = findAnchor()
if (anchor === undefined) skip('no profile anchor found (set DSH_HOME/DSH_PROFILE or DSH_CHECKOUT)')

const require_ = createRequire(anchor)

/** Resolve one specifier through the anchor, or skip when the install lacks it. */
function resolveOrSkip(spec) {
  try {
    return require_.resolve(spec)
  } catch (error) {
    skip(`${spec} does not resolve from ${anchor}: ${String(error)}`)
  }
}

const cordisPath = resolveOrSkip('@deepseek-ai/cordis')
const settingsPath = resolveOrSkip('@deepseek-ai/dsh-settings')

const { Context, Service } = await import(pathToFileURL(cordisPath).href)
const settingsModule = await import(pathToFileURL(settingsPath).href)
const SettingsProvider = settingsModule.default

/**
 * Run a service's own initialization, which the runner does for it at boot.
 *
 * This is not optional scaffolding: `SettingsProvider`'s `[Service.init]` is what
 * loads the provider's document and publishes it *before* the service becomes
 * injectable. Skipping it would test namespace registration against an empty
 * document — which would quietly pass, and would quietly skip the one behaviour
 * this file most wants to check: that a stored section failing the schema is
 * judged at registration rather than trusted.
 * @param service - the provider to initialize.
 */
async function initialise(service) {
  for await (const _step of service[Service.init]()) {
    /* the generator's only job here is the load-and-publish it performs before yielding */
  }
}

/**
 * A provider backed by an in-memory document.
 *
 * The real file provider lives in `dsh-settings-file`; this check is about the
 * service's registration, resolution, and validation path, not about YAML on
 * disk — `verify-profile.mjs` covers composition, and the plugin's own
 * `verify-host.mjs` covers the namespace name.
 */
class MemorySettings extends SettingsProvider {
  constructor(ctx, document) {
    super(ctx)
    this.document_ = document
    this.persisted = []
  }

  get writable() {
    return true
  }

  async load() {
    return this.document_
  }

  async persist(ns, section) {
    this.persisted.push({ ns, section })
    this.document_ = { ...this.document_, [ns]: section }
  }
}

const { apply, AlertSchema, ALERT_NAMESPACE } = await import(
  pathToFileURL(join(root, 'lib', 'index.js')).href
)

// ── the shipped browser half, loaded the way a browser loads it ──────────────
//
// The client defaults are what an install with *no* settings document falls back
// to, so the comparison below is the real contract rather than a source diff.
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
}
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
// eslint-disable-next-line no-eval -- the bundle is a classic script by contract
;(0, eval)(bundle)
const client = registration.factory((spec) => {
  if (!(spec in platform)) throw new Error(`unexpected platform module ${spec}`)
  return platform[spec]
})
delete globalThis.window

// ── boot a real context with the real service ───────────────────────────────
//
// `SettingsProvider` is a cordis `Service`: its constructor registers it under
// `settings` on the context it is given, which is the same mechanism the real
// profile relies on. Nothing here provides the service by hand — doing so would
// be a second registration and the framework refuses it, which is exactly the
// kind of mistake this check should not paper over.
const ctx = new Context()
const provider = new MemorySettings(ctx, {})
await initialise(provider)

const warnings = []
const originalWarn = console.warn
console.warn = (...args) => {
  warnings.push(args.map(String).join(' '))
}

let scope
apply({
  inject: (deps, callback) => ctx.inject(deps, callback),
  get: (name) => ctx.get(name),
})

// `ctx.inject` runs its callback when the service is present; cordis services
// settle on a microtask, so give the tree one turn before reading.
await new Promise((resolve) => setTimeout(resolve, 0))
console.warn = originalWarn

const descriptors = provider.describe()
const descriptor = descriptors.find((entry) => entry.ns === ALERT_NAMESPACE)
if (descriptor === undefined) {
  throw new Error(
    `verify-settings: the real settings service registered no "${ALERT_NAMESPACE}" namespace; it has [${descriptors
      .map((entry) => entry.ns)
      .join(', ')}]`,
  )
}
assert.equal(descriptor.applies, 'live', 'the sentry must apply live, not on restart')

// ── the contract this check exists for ─────────────────────────────────────
const hostDefaults = provider.get(ALERT_NAMESPACE)
assert.deepEqual(
  hostDefaults,
  client.resolveSettings(undefined),
  'the host-resolved defaults and the browser half defaults must be the same value',
)
assert.deepEqual(hostDefaults, client.SETTING_DEFAULTS, 'and equal to the shipped browser defaults')
assert.equal(hostDefaults.soundDone, true, 'every channel is on out of the box')

// A write goes through the real validation and commit path.
await provider.update(ALERT_NAMESPACE, { volume: 0.8, sound: false })
const afterWrite = provider.get(ALERT_NAMESPACE)
assert.equal(afterWrite.volume, 0.8)
assert.equal(afterWrite.sound, false)
assert.equal(afterWrite.title, true, 'an unpatched field keeps its default')
assert.ok(
  provider.describe().find((entry) => entry.ns === ALERT_NAMESPACE).user !== undefined,
  'a written field must surface as a user override for the settings UI',
)

// The schema is the guard rail: the Settings row cannot offer a value the schema
// rejects, and a hand-edited document cannot smuggle one past registration.
await assert.rejects(
  () => provider.update(ALERT_NAMESPACE, { volume: 3 }),
  'an out-of-range volume must be refused by the real service',
)
await assert.rejects(() => provider.update(ALERT_NAMESPACE, { volume: -1 }))
await assert.rejects(() => provider.update(ALERT_NAMESPACE, { favicon: 'off' }))
assert.equal(provider.get(ALERT_NAMESPACE).volume, 0.8, 'a refused write must not commit')

// A reset re-inherits every default, which is what the row's reset button is for.
await provider.replace(ALERT_NAMESPACE, {})
assert.deepEqual(provider.get(ALERT_NAMESPACE), hostDefaults, 'replace({}) must return to the defaults')

// ── a stored document is validated at registration, not trusted ─────────────
{
  const bad = new Context()
  const badProvider = new MemorySettings(bad, { alert: { volume: 3 } })
  await initialise(badProvider)
  let threw = false
  const badWarnings = []
  const saved = console.warn
  console.warn = (...args) => badWarnings.push(args.map(String).join(' '))
  try {
    apply({ inject: (deps, callback) => bad.inject(deps, callback), get: (name) => bad.get(name) })
    await new Promise((resolve) => setTimeout(resolve, 0))
  } catch {
    threw = true
  } finally {
    console.warn = saved
  }
  const registered = badProvider
    .describe()
    .some((entry) => entry.ns === ALERT_NAMESPACE)
  assert.ok(
    threw || !registered || badWarnings.length > 0,
    'a stored section that fails the schema must not register silently',
  )
}

if (warnings.length > 0) {
  console.warn(`verify-settings: the real service emitted warnings: ${warnings.join('; ')}`)
}

console.log('verify-settings: OK — the real settings service accepted the namespace')
console.log(
  `verify-settings: resolved defaults match the browser half (favicon=${String(hostDefaults.favicon)}, soundDone=${String(hostDefaults.soundDone)}, volume=${String(hostDefaults.volume)})`,
)

