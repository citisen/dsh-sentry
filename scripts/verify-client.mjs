/**
 * Load an emitted DSH client bundle in Node, assert its envelope, then drive the
 * sentry's pure half against injected clocks, storages, and audio, and its
 * settings row against stub services.
 *
 * A broken client bundle otherwise fails only in the browser, where the
 * diagnostic is a console error inside the boot audit. This check makes the
 * cheap-to-catch failure modes fail on the command line: a bundle that registers
 * nothing, a factory that throws, a fish that is no longer the product's own art,
 * a completion signal that never expires, a chime that fires while the user is
 * looking at the screen, and a switch that no engine reads.
 *
 * Usage:
 *   node scripts/verify-client.mjs [path/to/lib/client.js]
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { complete, inspect, scan } from '@citisen/litearea'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(process.argv[2] ?? join(root, 'lib', 'client.js'))
const source = readFileSync(bundlePath, 'utf8')

/** The package name, which the bundle id must equal. */
const PACKAGE_NAME = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

/**
 * The fish path the build generated, read from the source of truth rather than
 * from the bundle — so the assertion below is "the bundle carries the shipped
 * art", not "the bundle carries whatever it happens to carry".
 */
const FISH = readFileSync(join(root, 'src', 'fish.txt'), 'utf8').trim()

// ── the loader stubs ────────────────────────────────────────────────────────
//
// The bundle is a classic script that registers a lazy CJS factory whose only
// allowed requests are the platform singletons the shell seeds. Anything else
// would fail in the browser at materialization, so the stub throws instead.

/**
 * A minimal React stub: enough to build a tree, plus enough hook state to drive
 * interactions. Only one component instance may hold live hook state at a time,
 * because the slots are keyed by `useState` call order, so `mount()` hands out
 * one instance at a time.
 * @returns `{ render }`.
 */
function mount() {
  let slots
  const render = (component, props) => {
    if (slots === undefined) slots = []
    react.__hookIndex = 0
    react.__slots = slots
    return component(props)
  }
  return { render }
}

const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useCallback: (fn) => fn,
  useEffect: () => undefined,
  useRef: (value) => ({ current: value }),
  useState: (value) => {
    const slots = react.__slots ?? (react.__slots = [])
    const index = react.__hookIndex ?? 0
    if (slots.length <= index) slots.push(value)
    react.__hookIndex = index + 1
    return [
      slots[index],
      (next) => {
        slots[index] = typeof next === 'function' ? next(slots[index]) : next
      },
    ]
  },
}

/** A tiny observable store, matching the `@deepseek-ai/dsh-client-store` face. */
const stores = []
const storeModule = {
  defineStore: (spec) => {
    const state = spec.init()
    const listeners = new Set()
    const handle = {
      spec,
      state,
      create: () =>
        Object.fromEntries(
          Object.entries(spec.actions).map(([name, action]) => [
            name,
            (...args) => {
              action(state, ...args)
              for (const listener of listeners) listener()
            },
          ]),
        ),
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    stores.push(handle)
    return handle
  },
}

const stubs = {
  react,
  'react/jsx-runtime': { jsx: react.createElement, jsxs: react.createElement },
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/cordis': {},
  '@deepseek-ai/dsh-client-store': storeModule,
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': new Proxy(
    {},
    { get: (_target, key) => (key === 'then' ? undefined : () => null) },
  ),
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

const registrations = []
globalThis.window = {
  __ModuleLoader__: {
    load(registration) {
      registrations.push(registration)
    },
  },
}
globalThis.console = console

const requested = []
const requireStub = (specifier) => {
  requested.push(specifier)
  if (!(specifier in stubs)) throw new Error(`unknown platform module "${specifier}"`)
  return stubs[specifier]
}

// eslint-disable-next-line no-eval -- the bundle is a classic script by contract
;(0, eval)(source)

assert.equal(registrations.length, 1, 'the bundle must register exactly one factory')
const [registration] = registrations
assert.equal(registration.id, PACKAGE_NAME)
assert.equal(typeof registration.factory, 'function')

const plugin = registration.factory(requireStub)
assert.equal(typeof plugin.apply, 'function', 'bundle must export apply()')
assert.ok(Array.isArray(plugin.inject), 'bundle must export inject as an array')
// Settings are bound optionally, not required. A dsh that stops providing the
// service — 0.1.7-alpha.1 replaced `settingsScope` with `configForms` — must
// leave this plugin activated on its defaults instead of `pending` forever,
// which is what a required entry in this list buys. The last block of this file
// runs that composition.
assert.deepEqual(plugin.inject, ['slots', 'locale', 'sessions', 'uiSession'])
assert.equal(
  typeof plugin.sentryFavicon,
  'function',
  'bundle must export the favicon builder the verifier drives',
)

// The build must have substituted the template's identity placeholder, or the
// plugin would stamp its stylesheet and its warnings with the placeholder.
assert.ok(!source.includes('dsh:plugin-id'), 'the identity placeholder must be substituted')

// The fish placeholder must be gone too, or the bundle would draw an empty path.
assert.ok(!source.includes('dsh:sentry-fish'), 'the fish placeholder must be substituted at build time')
assert.ok(source.includes(FISH), "the bundle must carry the shipped favicon's path verbatim")

// ── the state model ─────────────────────────────────────────────────────────
/** A session-list snapshot from a compact description. */
function listOf(rows) {
  const ids = rows.map((row) => row.id)
  return {
    ids,
    byId: Object.fromEntries(rows.map((row) => [row.id, { id: row.id, blank: false, running: false, ...row }])),
  }
}

/** A pending-interaction snapshot from `[id, kind]` pairs. */
function pendingOf(pairs) {
  return new Map(pairs.map(([id, kind]) => [id, { sessionId: id, kind, key: `${id}:${kind}` }]))
}

{
  // Precedence: a session that is running *and* waiting is waiting, because the
  // running part is not the part that needs the user.
  const list = listOf([
    { id: 'a', running: true },
    { id: 'b', running: true, blank: true },
    { id: 'c', running: true },
    { id: 'd', running: false },
    { id: 'e', running: true },
  ])
  const pending = pendingOf([
    ['c', 'question'],
    ['d', 'approval'],
  ])
  const plan = plugin.sessionPlan(list, pending, {}, { now: 1000, doneWindowMs: 60_000 })

  assert.deepEqual(plan.active, ['a', 'c', 'd', 'e'], 'a blank session is not information')
  assert.equal(plan.bySession.get('c').state, 'waiting', 'waiting outranks running')
  assert.equal(plan.bySession.get('d').state, 'approval')
  assert.equal(plan.bySession.get('a').state, 'running')
  assert.deepEqual([plan.waiting, plan.approval, plan.running, plan.done], [1, 1, 2, 0])
  assert.equal(plugin.planHasSignal(plan), true)
  assert.equal(plugin.blockedKind({ kind: 'question' }), 'waiting', 'the wire word becomes the tab word')
  assert.equal(plugin.blockedKind({ kind: 'approval' }), 'approval')
  assert.equal(plugin.blockedKind({ kind: 'other' }), undefined)
  assert.equal(plugin.blockedKind(undefined), undefined)
}

{
  // The completed signal decays, and it is an edge rather than `summary.completed`:
  // that flag stays true until the user selects the session, so trusting it would
  // leave the tab green forever.
  const list = listOf([{ id: 'a', running: false, completed: true }])
  const inside = plugin.sessionPlan(list, new Map(), { a: 1000 }, { now: 1000 + 59_999, doneWindowMs: 60_000 })
  assert.equal(inside.bySession.get('a').state, 'done')
  assert.deepEqual(inside.finished, ['a'])

  const expired = plugin.sessionPlan(list, new Map(), { a: 1000 }, { now: 1000 + 60_000, doneWindowMs: 60_000 })
  assert.equal(expired.active.length, 0, 'an expired completion is not a signal')
  assert.equal(plugin.planHasSignal(expired), false)

  // A zero window is the "never show completed" setting, and it must not be
  // treated as "no window configured".
  const never = plugin.sessionPlan(list, new Map(), { a: 1000 }, { now: 1000, doneWindowMs: 0 })
  assert.equal(never.active.length, 0)
}

{
  // Alerts are edge-triggered: a session already waiting does not shout again on
  // every unrelated notification, and a genuine arrival does.
  const idle = plugin.sessionPlan(listOf([{ id: 'a' }, { id: 'b' }]), new Map(), {}, { now: 0, doneWindowMs: 60_000 })
  const asked = plugin.sessionPlan(
    listOf([{ id: 'a' }, { id: 'b' }]),
    pendingOf([['a', 'question']]),
    {},
    { now: 0, doneWindowMs: 60_000 },
  )
  assert.deepEqual(plugin.changeAlerts(idle, asked).questions, ['a'])
  assert.deepEqual(plugin.changeAlerts(asked, asked).questions, [], 'no new edge, no alert')
  assert.deepEqual(plugin.changeAlerts(undefined, asked).questions, ['a'], 'the first plan still alerts')

  // A question that becomes an approval is a new approval, not a new question.
  const approved = plugin.sessionPlan(
    listOf([{ id: 'a' }]),
    pendingOf([['a', 'approval']]),
    {},
    { now: 0, doneWindowMs: 60_000 },
  )
  const moved = plugin.changeAlerts(asked, approved)
  assert.deepEqual(moved.questions, [], 'the question is over')
  assert.deepEqual(moved.approvals, ['a'], 'the approval is new')

  const finished = plugin.sessionPlan(listOf([{ id: 'a' }]), new Map(), { a: 5 }, { now: 6, doneWindowMs: 60_000 })
  assert.deepEqual(plugin.changeAlerts(idle, finished).completed, ['a'])
  assert.deepEqual(plugin.changeAlerts(finished, finished).completed, [], 'a completion is reported once')
}

{
  // The completion edge is noted on the running -> idle transition, and a session
  // that leaves the list is dropped so the stamps cannot grow without bound.
  const first = plugin.noteRunningEdges({}, listOf([{ id: 'a', running: true }, { id: 'b', running: false }]), {}, 100)
  assert.deepEqual(first.running, { a: true, b: false })
  assert.deepEqual(first.stamps, {}, 'the first observation only records the bits')

  const second = plugin.noteRunningEdges(first.running, listOf([{ id: 'a', running: false }, { id: 'b' }]), first.stamps, 200)
  assert.deepEqual(second.stamps, { a: 200 }, 'the true -> false edge is stamped')
  assert.deepEqual(second.running, { a: false, b: false })

  const third = plugin.noteRunningEdges(second.running, listOf([{ id: 'b' }]), second.stamps, 300)
  assert.deepEqual(third.stamps, {}, 'a session that left the list is forgotten')
}

// ── the favicon ─────────────────────────────────────────────────────────────
/** A plan built directly, for the builder tests. */
function planFor(states) {
  const bySession = new Map()
  const finished = []
  states.forEach((state, index) => {
    bySession.set(`s${String(index)}`, { state, fresh: state === 'done' })
    if (state === 'done') finished.push(`s${String(index)}`)
  })
  /** @param state - the state to count. @returns how many. */
  const count = (state) => states.filter((entry) => entry === state).length
  return {
    bySession,
    active: states.map((_, index) => `s${String(index)}`),
    finished,
    waiting: count('waiting'),
    approval: count('approval'),
    running: count('running'),
    done: count('done'),
  }
}

const IDLE = planFor([])
const OPTIONS = { reducedMotion: false }

/**
 * The transform the fish is placed with, derived the way the plugin derives it.
 *
 * Shared by the two blocks below so the still fish and the turning fish cannot be
 * placed by different rules — and, more to the point, so the rule is written once, in
 * terms of the art's OWN extent. The bug this pins centred a 50-unit drawing as if it
 * were a 32-unit one, which put the fish in the corner of the background.
 * @param scale - the fish's scale.
 * @returns the `transform` value.
 */
function placement(scale) {
  const margin = Math.round((16 - (plugin.FISH_ART_EXTENT / 2) * scale) * 100) / 100
  return `translate(${String(margin)} ${String(margin)}) scale(${String(scale)})`
}

{
  assert.equal(plugin.sentryFavicon(IDLE, OPTIONS), undefined, 'nothing to report draws nothing')
  assert.equal(
    plugin.sentryFavicon(plugin.sessionPlan(listOf([{ id: 'a', blank: true }]), new Map(), {}, { now: 0, doneWindowMs: 0 }), OPTIONS),
    undefined,
  )
}

{
  // The fish is the product's own art, carved out of the background rather than
  // painted on it, at full size and centered by construction.
  const svg = plugin.sentryFavicon(planFor(['running']), OPTIONS)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'), 'explicit dimensions are required')

  // The fish is negative space: inside the mask, filled black so the background is
  // cut away there, and never painted anywhere else. That is what makes its
  // silhouette legible against any colour and any tab bar.
  const mask = /<mask id="disc"[^>]*>([\s\S]*?)<\/mask>/.exec(svg)?.[1]
  assert.ok(mask !== undefined, 'the background must be mask-carved')
  assert.ok(mask.includes(`<path d="${FISH}" fill="#000"`), 'the shipped fish path, verbatim, as the carving')
  assert.equal(svg.split(`<path d="${FISH}"`).length - 1, 1, 'the fish must appear exactly once — as a carving')
  assert.ok(!/#eef0f3|#23262c|prefers-color-scheme/.test(svg), 'no painted fish and no scheme pair survives')

  // The mask starts from a full-canvas black rect and keeps only the background
  // shape white, so a shape of `none` really carves everything away.
  assert.ok(mask.startsWith('<rect x="0" y="0" width="32" height="32" fill="#000"/>'), 'the mask must start empty')
  assert.ok(mask.includes('<circle cx="16" cy="16" r="15.2" fill="#4d6bfe"/>'), 'the shipped running shape is a blue circle')
  assert.ok(
    svg.includes('<rect x="0" y="0" width="32" height="32" fill="#4d6bfe" mask="url(#disc)"/>'),
    'the painted layer is one rect in the state colour, carved by the mask',
  )

  // Full size means the art's own 50 units scaled by 32/50 = 0.64, and the placement is
  // built from the same constant: the art's centre is 25 in ITS OWN units, so the margin
  // that puts it on the canvas centre is `16 - 25 * scale`. The version this replaced
  // centred the art as if it were a 32-unit drawing (`16 - 16 * scale`), which held the
  // fish 5.76px down and to the right of the middle — the bottom-right corner of the
  // rounded square it was reported from — with its nose and tail cut off by the rim.
  //
  // The extent is a fact about the art, not a number to trust, so it is measured here
  // from the path data itself: the coordinates must fit in the claimed canvas and must
  // fill it.
  const coords = [...FISH.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
  assert.ok(
    Math.max(...coords) <= plugin.FISH_ART_EXTENT,
    `the art's coordinates (max ${String(Math.max(...coords))}) must fit its own canvas`,
  )
  assert.ok(
    Math.max(...coords) > plugin.FISH_ART_EXTENT * 0.9,
    'and must fill it, or the extent being cented on is the wrong one',
  )
  assert.ok(svg.includes(placement(plugin.FISH_FULL_SCALE)), 'the art is placed by its own centre')

  // Nothing is carved but the fish. The dial-like patterns — spokes, hands, petals,
  // windmill, dots, rays — were all tried at 16px and all read as noise around a
  // fish nobody could then see, so the vocabulary is gone entirely and the icon says
  // its state with colour, shape, motion, and the fish itself.
  assert.equal('pattern' in plugin.DEFAULT_LOOK.running, false, 'there is no pattern slot left to configure')
  assert.equal(mask.split('<rect').length - 1, 1, 'the only rect in the mask is its own black base')
  assert.equal(mask.split('<circle').length - 1, 1, 'and the only circle is the background outline')
}

{
  // The running state turns the fish itself. A `turn` is a driven motion, so what
  // this pins is the geometry: the fish stays centered, it shrinks just enough that
  // its swept corners stay inside the background, and the background does not move.
  const still = plugin.sentryFavicon(planFor(['running']), { ...OPTIONS, motion: { angle: 0 } })
  const turned = plugin.sentryFavicon(planFor(['running']), { ...OPTIONS, motion: { angle: 90 } })

  // The turning fish is placed by the same rule at the smaller scale it turns at, so it
  // stays centred while its swept corners stay inside the background.
  const turnScale = plugin.FISH_FULL_SCALE * plugin.FISH_TURN_SCALE
  assert.ok(
    turned.includes(placement(turnScale)),
    'a turning fish shrinks to keep its swept corners inside the background',
  )
  assert.ok(turned.includes('rotate(90 16 16)'), 'and rotates about the canvas centre')
  assert.ok(
    turned.split('rotate(').length - 1 === 1,
    'only the fish rotates — a turning background would read as a spinning badge',
  )

  // The scale is chosen so the swept circle fits: the widest half-extent of the
  // 50x50 art is 25 units, so the radius at this scale must stay under the
  // background's own 15.2.
  assert.ok(
    plugin.FISH_SWEPT_RADIUS < 15.2,
    `the swept radius ${String(plugin.FISH_SWEPT_RADIUS)} must fit inside the background's 15.2`,
  )
  assert.ok(
    plugin.FISH_SWEPT_RADIUS > 13.5,
    'and the fish must not be shrunk further than the geometry requires',
  )

  // A still fish is at full size: the shrink exists for the turn, not for the icon.
  assert.ok(still.includes(placement(plugin.FISH_FULL_SCALE)), 'a still fish stays full size')
  assert.ok(!still.includes('rotate('), 'and does not rotate')
}

{
  // Each state is a composition of primitives, and the composition is the whole
  // model: a background shape and colour, a carved pattern, a motion, a rate.
  //
  // Motion is checked as a function of the tick, not as an animation element. That
  // is the point of the split: `turn` may be left to SMIL because it is stateless,
  // while `blink` and `flush` change the drawing and are driven by the plugin — so
  // the thing to verify is what the drawing looks like at each tick, which needs no
  // browser and no clock.
  const running = plugin.sentryFavicon(planFor(['running']), OPTIONS)
  assert.ok(!running.includes('<animateTransform'), 'no declarative turn: the transform animation did not move')
  assert.equal(plugin.tickInterval(plugin.DEFAULT_LOOK.running, false), 120, 'so the plugin drives it')

  // A blink is a dim flag that alternates once per breath, at each state's own rate.
  assert.equal(plugin.tickInterval(plugin.DEFAULT_LOOK.waiting, false), 120, 'waiting is driven')
  const waitingHalf = Math.round((1.1 * 1000) / 2 / 120)
  const waitingTicks = Array.from({ length: waitingHalf * 2 }, (_, tick) => plugin.motionTick(plugin.DEFAULT_LOOK.waiting, tick).dim === true)
  assert.equal(waitingTicks[0], false, 'a breath starts bright')
  assert.equal(waitingTicks[waitingHalf - 1], false, 'and holds')
  assert.equal(waitingTicks[waitingHalf], true, 'then dims')
  assert.equal(waitingTicks[waitingHalf * 2 - 1], true, 'for the second half')
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.waiting, waitingHalf * 2).dim, false, 'and starts over')

  // The two waiting states share a colour on purpose — the rate is the only thing
  // telling them apart — so the dim cadence must actually differ.
  const approvalHalf = Math.round((1.9 * 1000) / 2 / 120)
  assert.notEqual(waitingHalf, approvalHalf, 'the approval breath is longer')
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.approval, waitingHalf).dim, false, 'so it is still bright where a question has dimmed')

  // A completion pulses the colour, once per period.
  const flushTicks = Math.round((1.6 * 1000) / 120)
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.done, 0).color, '#22c55e', 'a completion starts green')
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.done, flushTicks).color, '#4d6bfe', 'pulses blue')
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.done, flushTicks * 2).color, '#22c55e', 'and returns')
  const done = plugin.sentryFavicon(planFor(['done']), { ...OPTIONS, motion: { color: '#4d6bfe' } })
  assert.ok(done.includes('fill="#4d6bfe"'), 'and the pulse is what gets painted')

  // A driven turn steps the angle, which is the fallback for a browser that does
  // not animate the transform: the same whole turn per period, in TICK_MS steps.
  const turnTicks = Math.round((3 * 1000) / 120)
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.running, 0).angle, 0)
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.running, turnTicks / 2).angle, 180)
  assert.equal(plugin.motionTick(plugin.DEFAULT_LOOK.running, turnTicks).angle, 0, 'and wraps')
  const turned = plugin.sentryFavicon(planFor(['running']), {
    ...OPTIONS,
    style: { ...plugin.DEFAULT_LOOK, running: { ...plugin.DEFAULT_LOOK.running, driven: true } },
    motion: { angle: 90 },
  })
  assert.ok(turned.includes('rotate(90 16 16)'), 'a driven turn rotates the carvings')
  assert.ok(!turned.includes('<animateTransform'), 'and emits no declarative animation to disagree with')

  // A question and an approval share a colour on purpose: both mean "act", and the
  // rate is the distinction. If they ever diverge, this catches it.
  assert.equal(plugin.DEFAULT_LOOK.waiting.color, plugin.DEFAULT_LOOK.approval.color)
  assert.notEqual(plugin.DEFAULT_LOOK.waiting.speed, plugin.DEFAULT_LOOK.approval.speed)
  assert.equal(plugin.DEFAULT_LOOK.running.motion, 'turn', 'the running state turns the fish')
  assert.equal('pattern' in plugin.DEFAULT_LOOK.running, false, 'and has nothing else to configure')
  assert.equal(plugin.PRESET_COLORS[plugin.DEFAULT_LOOK.done.color], '#22c55e')

  // The two shapes the user asked for: rounded exists, and `none` really means no
  // background — only the carved fish is left, painted by the wrapper rect.
  const rounded = plugin.sentryFavicon(planFor(['waiting']), OPTIONS)
  assert.ok(rounded.includes('<rect x="0.8" y="0.8" width="30.4" height="30.4" rx="8"'), 'the waiting default is a rounded square')

  // Reduced motion keeps the shape and drops the motion entirely: no declarative
  // animation, and no timer either.
  for (const state of plugin.STYLE_STATES) {
    const chosen = plugin.DEFAULT_LOOK[state]
    assert.equal(plugin.tickInterval(chosen, true), undefined, `${state} must not be driven under reduced motion`)
    const calm = plugin.sentryFavicon(planFor([state]), { reducedMotion: true })
    assert.ok(!calm.includes('<animate'), `${state} must not animate under reduced motion`)
    assert.ok(calm.includes(plugin.PRESET_COLORS[chosen.color]), `${state} keeps its colour`)
  }

  // A still state is still: no timer, no animation.
  assert.equal(plugin.tickInterval({ ...plugin.DEFAULT_LOOK.running, motion: 'still' }, false), undefined)
}

{
  // ── the style document ────────────────────────────────────────────────────
  //
  // The document is the interface, so the reader's tolerance is a feature and not
  // an accident: a line it cannot use is reported and that one property falls back
  // to its shipped value, rather than leaving a tab without an icon.
  const shipped = plugin.resolveStyle(plugin.DEFAULT_STYLE)
  assert.deepEqual(shipped.problems, [], 'the shipped document must read cleanly')
  for (const state of plugin.STYLE_STATES) {
    assert.deepEqual(shipped.look[state], plugin.DEFAULT_LOOK[state], `${state} round-trips through the document`)
  }
  assert.deepEqual(
    Object.keys(shipped.sound.channels).sort(),
    [...plugin.CHIME_STATES].sort(),
    'every state with a sound event is chimed by the shipped document',
  )
  assert.deepEqual(shipped.globals, plugin.DEFAULT_GLOBALS, 'and it resolves to the shipped document settings')

  // Every property is named, so a block may name them in any order: the order is
  // the writer's rather than the reader's, which is the whole point of dropping the
  // positional spelling.
  const reordered = plugin.resolveStyle(
    ['done {', '  chime A4', '  speed 4s', '  motion still', '  color purple', '  shape square', '}'].join('\n'),
  )
  assert.deepEqual(reordered.problems, [])
  assert.deepEqual(reordered.look.done, { shape: 'square', color: 'purple', motion: 'still', speed: 4 })

  // A block a document omits keeps every shipped default for that state, and a
  // property a block omits keeps its own — the reader is told what changed, not
  // what the whole document is.
  const partial = plugin.resolveStyle('done {\n  color purple\n}')
  assert.equal(partial.look.done.color, 'purple')
  assert.equal(partial.look.done.shape, plugin.DEFAULT_LOOK.done.shape, 'an omitted property keeps its default')
  assert.equal(partial.look.done.motion, plugin.DEFAULT_LOOK.done.motion)
  assert.deepEqual(partial.look.running, plugin.DEFAULT_LOOK.running, 'a state with no block keeps all of it')

  // A duration carries its unit, and a bare number is seconds — one rule for the
  // motion rate, the chime gap, and the completed window.
  assert.equal(plugin.parseDuration('1.5s'), 1.5)
  assert.equal(plugin.parseDuration('800ms'), 0.8)
  assert.equal(plugin.parseDuration('2m'), 120)
  assert.equal(plugin.parseDuration('3'), 3, 'a bare number is seconds')
  assert.equal(plugin.parseDuration('later'), undefined)
  assert.equal(plugin.resolveStyle('running {\n  speed 800ms\n}').look.running.speed, 0.8)
  assert.equal(plugin.resolveStyle('keep-done 2m').globals.keepDoneMs, 120_000)
  assert.equal(plugin.resolveStyle('chime-gap 300ms').globals.chimeGapMs, 300)

  // An out-of-range value is reported and falls back rather than drawing something
  // absurd, and the report names the range.
  const tooFast = plugin.resolveStyle('running {\n  speed 0\n}')
  assert.ok(tooFast.problems.some((problem) => problem.message.includes('speed')), 'the rate is named')
  assert.equal(tooFast.look.running.speed, plugin.DEFAULT_LOOK.running.speed, 'and the shipped rate stands')
  assert.equal(plugin.resolveStyle('running {\n  speed 999\n}').look.running.speed, plugin.DEFAULT_LOOK.running.speed)
  assert.equal(
    plugin.resolveStyle('done {\n  volume 3\n}').sound.channels.done.gain,
    plugin.DEFAULT_VOLUME,
    'a loudness outside 0–1 is refused and the shipped one stands',
  )

  // ── loudness is one number, from one of two lines ─────────────────────────
  //
  // The document's `volume` is the default every chimed state uses; a block's own
  // `volume` replaces it. Neither multiplies the other, so the row prints one of the two
  // numbers rather than a product a reader cannot find in the document.
  assert.ok(plugin.STYLE_GLOBAL_KEYS.includes('volume'), 'the document has a default loudness')
  const overridden = plugin.resolveStyle('volume 0.8\n\ndone {\n  volume 0.2\n}').sound.channels
  assert.equal(overridden.done.gain, 0.2, 'a block replaces the document default')
  assert.equal(overridden.waiting.gain, 0.8, 'and the default still governs the states that say nothing')
  assert.equal(overridden.done.unstated, false, 'a number from either line is a number the reader can find')
  assert.equal(overridden.waiting.unstated, false)
  const unstatedGain = plugin.resolveStyle('waiting {\n  chime A5\n}').sound.channels.waiting
  assert.equal(unstatedGain.gain, plugin.DEFAULT_VOLUME, 'a document that names no loudness at all falls back')
  assert.equal(unstatedGain.unstated, true, 'and the row is told to mark that one as the default')

  // ── notes are notes ───────────────────────────────────────────────────────
  // The chime reads as music: a name in, a frequency out, played in the order it
  // was written. `A4 = 440` is the anchor, and a sharp and its flat are one key.
  assert.equal(plugin.noteFrequency('A4'), 440)
  assert.equal(plugin.noteFrequency('A5'), 880)
  assert.equal(plugin.noteFrequency('C#4'), plugin.noteFrequency('Db4'), 'an accidental is part of the note')
  assert.equal(plugin.noteFrequency('H9'), undefined)
  const chime = plugin.resolveStyle('waiting {\n  chime A5 E6\n}').sound.channels.waiting
  assert.deepEqual(chime.labels, ['A5', 'E6'], 'the labels are kept for the row to print')
  assert.equal(chime.frequencies[0], 880)
  assert.ok(chime.frequencies[1] > chime.frequencies[0], 'the pair rises')
  assert.equal(
    plugin.resolveStyle('waiting {\n  chime 880 1318.5\n}').sound.channels.waiting.frequencies[0],
    880,
    'a frequency in Hz is a note too',
  )

  // `off` removes the channel outright, and the states either side keep theirs: one
  // state's silence is not every state's silence.
  const silenced = plugin.resolveStyle('waiting {\n  chime off\n}')
  assert.deepEqual(silenced.problems, [], '`off` is a spelling, not a problem')
  assert.equal(silenced.sound.channels.waiting, undefined)
  assert.ok(silenced.sound.channels.approval !== undefined, 'the approval keeps its chime')
  assert.ok(silenced.sound.channels.done !== undefined)

  // The shipped document gives each chimed state its own loudness, and that is the
  // whole of the arithmetic: no master, no factor, nothing for the row to multiply.
  const shippedChannels = plugin.resolveStyle(plugin.DEFAULT_STYLE).sound.channels
  assert.equal(shippedChannels.waiting.gain, 0.5, 'the waiting state takes the document default')
  assert.equal(shippedChannels.approval.gain, 0.45, 'the approval overrides it')
  assert.equal(shippedChannels.done.gain, 0.25, 'and a completion is the quiet one')
  assert.equal(
    Object.values(shippedChannels).every((channel) => channel.unstated === false),
    true,
    'every number the row prints is a line of the document',
  )
  // Which is the point: a reader who changes one of those lines sees that number on the
  // card, so the card can never disagree with the document beside it.
  assert.equal(plugin.resolveStyle('volume 1').sound.channels.waiting.gain, 1)
  assert.equal(plugin.resolveStyle('done {\n  volume 0.1\n}').sound.channels.done.gain, 0.1)
  assert.equal(
    plugin.resolveStyle('done {\n  volume 0.1\n}').sound.channels.waiting.gain,
    plugin.DEFAULT_VOLUME,
    'and a block that overrides only touches its own state',
  )

  // `#` belongs to note names, so it cannot also start a comment. `//` does, and a
  // comment after a value does not become part of it.
  const commented = plugin.resolveStyle('// a comment\n\nrunning {\n  color red // trailing\n}')
  assert.deepEqual(commented.problems, [])
  assert.equal(commented.look.running.color, 'red')
  assert.equal(
    plugin.resolveStyle('waiting {\n  chime C#4\n}').sound.channels.waiting.frequencies[0],
    plugin.noteFrequency('C#4'),
    'a sharp is a note rather than the start of a comment',
  )

  // ── what a mistake earns ──────────────────────────────────────────────────
  // One deliberate mistake per line, so every diagnostic's range can be checked
  // against the text it underlines, and so the codes below are the codes the
  // editor reports for the same document.
  const messy = plugin.resolveStyle(
    [
      'nonsense 3',
      'waiting {',
      '  shape circl',
      '  volume 3',
      '}',
      'running {',
      '  chime A5',
      '}',
      'approval',
      '}}',
      'done {',
      '  speed 2s',
    ].join('\n'),
  )
  const codes = messy.problems.map((problem) => problem.code)
  for (const code of [
    'unknown-key',
    'bad-value',
    'inert-property',
    'unopened-block',
    'stray-brace',
    'unclosed-block',
  ]) {
    assert.ok(codes.includes(code), `${code} must be reported`)
  }
  assert.ok(
    messy.problems.every((problem) => typeof problem.line === 'number' && problem.message.length > 0),
    'every problem carries a line and a message',
  )
  assert.ok(
    messy.problems.some((problem) => problem.severity === 'warning'),
    'a property that does nothing is a warning rather than an error',
  )
  assert.equal(messy.look.waiting.shape, plugin.DEFAULT_LOOK.waiting.shape, 'a refused value falls back')
  assert.equal(messy.look.done.speed, 2, 'and a good line beside a bad one still applies')

  // The reader is total: an absent or corrupt document is not a problem, and the
  // engine still has an appearance to draw.
  assert.deepEqual(plugin.resolveStyle(undefined).look, plugin.DEFAULT_LOOK)
  assert.equal(plugin.resolveStyle(undefined).problems.length, 0, 'an absent document is not a problem')
  assert.equal(
    plugin.readStyleDocument(42, { states: plugin.STYLE_STATES }).problems.length,
    0,
    'and neither is a corrupt one',
  )

  // A document is what drives the icon, end to end: the same state, two documents.
  const styled = plugin.resolveStyle('running {\n  shape square\n  color purple\n  motion still\n  speed 4s\n}').look
  const svg = plugin.sentryFavicon(planFor(['running']), { reducedMotion: false, style: styled })
  assert.ok(svg.includes('fill="#8b5cf6"'), 'the document chooses the colour')
  assert.ok(svg.includes('rx="4"'), 'and the shape')
  assert.ok(!svg.includes('rotate('), 'and still means still')

  // A shape of `none` really is no background: the mask keeps nothing, so the only
  // thing the painted layer shows is the carved fish.
  const bare = plugin.sentryFavicon(planFor(['running']), {
    reducedMotion: false,
    style: plugin.resolveStyle('running {\n  shape none\n}').look,
  })
  const mask = /<mask id="disc"[^>]*>([\s\S]*?)<\/mask>/.exec(bare)?.[1] ?? ''
  assert.equal(mask.split('<circle').length - 1, 0, 'no background outline is kept')
  assert.equal(mask.split('<rect').length - 1, 1, 'only the mask base is a rect')
  assert.ok(mask.includes(`<path d="${FISH}"`), 'and the fish is still carved')
}

// ── the grammar is this repo's own code ─────────────────────────────────────
//
// The editor takes a grammar as a VALUE: litearea ships no syntax of its own, so the DSL's
// grammar lives beside the DSL and is this repo's code. Which makes it this repo's to verify
// — and a value is exactly the shape that can be verified here, in Node, without a browser:
// hand the library's public scanner the bundle's own grammar and ask it the questions the
// editor asks.
//
// The three calls below are the library's public API, imported from the devDependency the
// build compiles in, so this is the same scanner, the same checks, and the same ranking the
// browser runs.
{
  // Exactly what `src/client.js` passes — same constants, same order — so this is the shipped
  // grammar rather than one that merely defaults to the same words.
  const grammar = plugin.dshSentryStyleGrammar({
    states: plugin.STYLE_STATES,
    keys: { global: plugin.STYLE_GLOBAL_KEYS, state: plugin.STYLE_STATE_KEYS },
    spec: plugin.STYLE_SPEC,
    shapes: plugin.SHAPES,
    motions: plugin.MOTIONS,
    colors: plugin.PRESET_COLORS,
    modes: plugin.MODES,
    notes: ['A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'E6'],
    defaults: plugin.DEFAULT_LOOK,
  })

  // The two layers agree about the document the plugin ships: the reader the engine
  // is drawn from and the grammar the editor is written against. This is the
  // assertion the shared walk exists to make cheap — they are the same walk.
  assert.deepEqual(
    plugin.readStyleDocument(plugin.DEFAULT_STYLE, {
      states: plugin.STYLE_STATES,
      keys: { global: plugin.STYLE_GLOBAL_KEYS, state: plugin.STYLE_STATE_KEYS },
      spec: plugin.STYLE_SPEC,
    }).problems,
    [],
    'the plugin’s own reader is silent on the shipped document',
  )
  assert.deepEqual(inspect(plugin.DEFAULT_STYLE, grammar).diagnostics, [], 'and so is the grammar over it')

  // ── the paint ─────────────────────────────────────────────────────────────
  // A scope becomes `litearea-scope-<scope>`, so these names are what the stylesheet and the
  // renderer colour by. The shipped document is the one every install starts with, and every
  // word on it has to be painted.
  const painted = scan(plugin.DEFAULT_STYLE, grammar).tokens
  /** @param word - a word of the document. @returns the scope it was painted with. */
  const scopeOf = (word) => painted.find((token) => token.text === word)?.scope
  for (const [word, scope] of [
    ['waiting', 'state'],
    ['{', 'punctuation'],
    ['shape', 'property'],
    ['rounded', 'value.shape'],
    ['color', 'property'],
    ['amber', 'value.color'],
    ['motion', 'property'],
    ['blink', 'value.motion'],
    ['speed', 'property'],
    ['1.1s', 'value.number'],
    ['chime', 'property'],
    ['A5', 'value.note'],
    ['icon', 'property'],
    ['on', 'value.mode'],
    ['sound', 'property'],
    ['background', 'value.mode'],
    ['chime-gap', 'property'],
    ['keep-done', 'property'],
    ['volume', 'property'],
    ['0.5', 'value.number'],
    ['}', 'punctuation'],
  ]) {
    assert.equal(scopeOf(word), scope, `${word} must paint as ${scope}`)
  }
  assert.equal(
    painted.filter((token) => token.text.trim() !== '' && token.scope === 'invalid').length,
    0,
    'nothing in the shipped document is painted as a mistake',
  )

  // ── the diagnostics, and where they point ─────────────────────────────────
  // One deliberate mistake per line, so every diagnostic's range can be checked
  // against the text it underlines. The reader finds them first and the grammar
  // reports the same list, which is the point of the two sharing one walk.
  const broken = [
    'waiting {',
    '  shape circl',
    '}',
    'nonsense 1',
    'running {',
    '  chime A5',
    '}',
    'approval {',
    '  volume 3',
    '}',
  ].join('\n')
  const problems = inspect(broken, grammar).diagnostics
  /** @param needle - the text a diagnostic should underline. @returns it, if any. */
  const at = (needle) => {
    const from = broken.indexOf(needle)
    return problems.find((problem) => problem.from === from && problem.to === from + needle.length)
  }
  /** @param needle - a fragment of the message. @returns the diagnostic, if any. */
  const byMessage = (needle) => problems.find((problem) => problem.message.includes(needle))
  assert.deepEqual(
    [...new Set(problems.map((problem) => problem.code))].sort(),
    ['bad-value', 'inert-property', 'unknown-key'],
    'the document has exactly the three mistakes it was written with',
  )
  assert.match(at('circl')?.message ?? '', /not a value "shape" accepts/, 'a bad value is measured against its own property')
  assert.equal(at('circl')?.severity, 'error', 'and it is an error, because the line does not draw what it says')
  assert.match(at('nonsense')?.message ?? '', /Unknown setting "nonsense"/, 'an unknown name is named, with the scope’s list')
  assert.match(byMessage('does nothing in "running"')?.message ?? '', /chime/, 'a chime in a state with no event is reported')
  assert.equal(byMessage('does nothing in "running"')?.severity, 'warning', 'as a warning: nothing is broken, nothing happens')
  assert.match(byMessage('outside what "volume" accepts')?.message ?? '', /0 and 1/, 'a range is quoted back')

  // ── what can come next ────────────────────────────────────────────────────
  /** @param text - the document. @param caret - where the caret is. @returns the row labels. */
  const rowsAt = (text, caret) => {
    const result = complete(inspect(text, grammar), grammar, { text, caret, trigger: 'explicit' })
    return (result?.rows ?? []).map((row) => row.item.label)
  }

  // An empty line offers the states first — opening a block is the only thing that
  // can start a document — and then the document settings.
  const head = rowsAt('', 0)
  assert.deepEqual(head.slice(0, plugin.STYLE_STATES.length), plugin.STYLE_STATES, 'the head of a line offers every state')
  for (const key of plugin.STYLE_GLOBAL_KEYS) {
    assert.ok(head.includes(key), `a document setting (${key}) is offered at the top level`)
  }
  // And the list has to survive the first letter: `wai|` is still the state word.
  assert.deepEqual(rowsAt('wai', 3), ['waiting'], 'the state stays offered while it is typed')

  // Accepting a state writes the brace, because that is the part of the syntax a
  // user has to remember and the editor can do it for them.
  const headRows = complete(inspect('', grammar), grammar, { text: '', caret: 0, trigger: 'explicit' }).rows
  assert.equal(headRows.find((row) => row.item.label === 'waiting')?.item.append, ' {')

  // Inside a block, the list is that block's properties — and closing it is one of
  // the choices, because a document that never closes a block is an error the reader
  // has to report.
  const inside = rowsAt('waiting {\n  ', 12)
  for (const key of plugin.STYLE_STATE_KEYS) assert.ok(inside.includes(key), `a block property (${key}) is offered inside one`)
  assert.ok(inside.includes('}'), 'and closing the block is offered')
  assert.ok(!inside.includes('icon'), 'a document setting is not offered inside a block')

  // After a property, the list is that property's values and nothing else.
  assert.deepEqual(rowsAt('waiting {\n  shape ', 18), plugin.SHAPES, 'a shape value leads with the shapes')
  assert.deepEqual(rowsAt('icon ', 5), ['on', 'off'], 'a channel takes on or off')
  assert.deepEqual(rowsAt('sound ', 6), ['off', 'background', 'always'], 'and sound takes its three modes')
  const chimeRows = rowsAt('waiting {\n  chime ', 18)
  assert.ok(chimeRows.includes('A5'), 'the chime list offers notes')
  assert.equal(chimeRows.at(-1), 'off', 'and the way to silence this state alone')
  assert.ok(rowsAt('keep-done ', 10).length > 0, 'and a duration offers the values worth reaching for')

  // ── what accepting a row actually replaces ────────────────────────────────
  //
  // The range must be the value token the caret is in, not what `wordChars` thinks a
  // word is. `wordChars` has no dot — deliberately, so a stray `circle.` is not read as
  // one unknown word — so the word around the caret in `volume 0.2` is just `2`, and
  // accepting `0.25` there wrote `0.0.25`: the prefix the lexical layer could not see
  // stayed behind. These assertions apply the edit the editor would apply and then read
  // the result with the plugin's own reader, which is the only way to catch it.
  /** @param text - the document. @param caret - where the caret is. @param label - the row to accept. */
  const accept = (text, caret, label) => {
    const result = complete(inspect(text, grammar), grammar, { text, caret, trigger: 'explicit' })
    const row = (result?.rows ?? []).find((entry) => entry.item.label === label)
    assert.ok(row !== undefined, `${label} must be offered at ${caret}`)
    return {
      range: result.range,
      text: `${text.slice(0, result.range.from)}${row.item.insert ?? row.item.label}${row.item.append ?? ''}${text.slice(result.range.to)}`,
    }
  }

  const volumeText = 'done {\n  volume 0.2\n}'
  const volumeStart = volumeText.indexOf('0.2')
  const volumeCaret = volumeStart + '0.2'.length
  const accepted = accept(volumeText, volumeCaret, '0.25')
  assert.deepEqual(
    accepted.range,
    { from: volumeStart, to: volumeCaret },
    'the range must cover the whole value token, dot and all',
  )
  assert.equal(
    plugin.resolveStyle(accepted.text).problems.length,
    0,
    `accepting 0.25 must leave a document the reader understands (got ${JSON.stringify(accepted.text)})`,
  )
  assert.equal(plugin.resolveStyle(accepted.text).sound.channels.done.gain, 0.25, 'and the state it names at 0.25')

  // The list is filtered by that same token: after `0.` the numbers that begin with it,
  // and not the whole suggestion list. That is `wordChars` doing the filtering, so a dot
  // outside the word would leave the caret in no word at all and offer `1` for a value
  // that starts `0.`.
  const dotted = rowsAt('done {\n  volume 0.', 'done {\n  volume 0.'.length)
  assert.ok(dotted.includes('0.25'), 'the numbers that begin with what is typed are offered')
  assert.ok(!dotted.includes('1'), 'and the ones that do not begin with it are not')

  // A duration is the same shape of token: `1.5s` is one value, dot and unit and all,
  // and accepting the row that is already there must leave the document alone rather
  // than write `1.1.5s`.
  const speedText = 'running {\n  speed 1.5s\n}'
  const speedStart = speedText.indexOf('1.5s')
  const speedAccepted = accept(speedText, speedStart + '1.5s'.length, '1.5s')
  assert.deepEqual(speedAccepted.range, { from: speedStart, to: speedStart + '1.5s'.length })
  assert.ok(!speedAccepted.text.includes('1.1.5s'), 'the prefix must not survive the replacement')
  assert.deepEqual(plugin.resolveStyle(speedAccepted.text).problems, [], 'and the line still reads')
  assert.equal(plugin.resolveStyle(speedAccepted.text).look.running.speed, 1.5)

  // A caret in the whitespace after a value is in no token at all, so the next value is
  // a new one rather than a replacement — which is how a second chime note is written.
  const notesText = 'waiting {\n  chime A5 \n}'
  const notesCaret = notesText.indexOf('A5 ') + 'A5 '.length
  const noteAccepted = accept(notesText, notesCaret, 'E6')
  assert.deepEqual(noteAccepted.range, { from: notesCaret, to: notesCaret })
  assert.equal(plugin.resolveStyle(noteAccepted.text).sound.channels.waiting.labels.join(' '), 'A5 E6')

  // ── the vocabularies are the plugin's, not a copy ─────────────────────────
  // The proof that the grammar reads the constants rather than carrying its own: replace one
  // and the grammar follows. A second copy would go on accepting the shipped words.
  const overridden = plugin.dshSentryStyleGrammar({
    states: ['idle'],
    keys: { global: ['sound'], state: ['shape'] },
    spec: { shape: { kind: 'word', words: ['blob'] } },
    shapes: ['blob'],
    motions: plugin.MOTIONS,
    colors: { teal: '#008080' },
    modes: plugin.MODES,
    notes: [],
    defaults: {},
  })
  assert.deepEqual(
    inspect('idle {\n  shape blob\n}', overridden).diagnostics,
    [],
    'a replaced vocabulary accepts what it names',
  )
  assert.equal(
    scan('idle {\n  shape blob\n}', overridden).tokens.find((token) => token.text === 'blob')?.scope,
    'value.shape',
    'and paints it as a shape',
  )
  assert.equal(
    inspect('running {', overridden).diagnostics.find((problem) => problem.code === 'vocabulary:state')?.from,
    0,
    'a state the vocabulary no longer names is rejected at its own word',
  )
  assert.match(
    inspect('idle {\n  shape circle\n}', overridden).diagnostics.find(
      (problem) => problem.code === 'bad-value',
    )?.message ?? '',
    /blob/,
    'a shape it no longer ships is measured against the words that replaced it',
  )
  assert.match(
    inspect('idle {\n  colour teal\n}', overridden).diagnostics.find(
      (problem) => problem.code === 'unknown-key',
    )?.message ?? '',
    /shape/,
    'and a property it no longer accepts is measured against the ones it does',
  )
  // The converse, so the assertions above cannot pass by accident: the shipped grammar knows
  // `waiting` and `circle`, and has never heard of `idle`.
  assert.deepEqual(inspect('waiting {\n  shape circle\n}', grammar).diagnostics, [], 'the shipped grammar accepts its own words')
  assert.equal(
    inspect('idle {', grammar).diagnostics.find((problem) => problem.code === 'vocabulary:state')?.from,
    0,
    'and rejects the words that replaced them',
  )
}

{
  // The badge carries an exact count only where a digit is unambiguous.
  const one = plugin.sentryFavicon(planFor(['waiting']), OPTIONS)
  assert.ok(one.includes('>1</text>'), 'one waiting session shows a 1')
  assert.ok(one.includes('fill="#f59e0b"'), 'the badge is the waiting color')
  assert.ok(plugin.sentryFavicon(planFor(['waiting', 'waiting']), OPTIONS).includes('>2</text>'))
  assert.ok(plugin.sentryFavicon(planFor(['waiting', 'waiting', 'waiting']), OPTIONS).includes('>3</text>'))
  const many = plugin.sentryFavicon(planFor(['waiting', 'waiting', 'waiting', 'waiting']), OPTIONS)
  assert.ok(!many.includes('<text'), 'four and up is a smudge, so no digit')
  assert.ok(many.includes('fill="#f59e0b"'), 'but the background still says someone is waiting')

  // The badge is painted rather than carved, and wears a dark keyline so it stays
  // readable on a tab bar of any colour — it is the one mark that must not depend
  // on what is behind it.
  assert.ok(one.includes('stroke="#0b0d10"'), 'the badge is ringed, not carved')

  // Approvals never produce a digit: the digit is the question count, and an
  // approval is a different act.
  const approval = plugin.sentryFavicon(planFor(['approval']), OPTIONS)
  assert.ok(!approval.includes('<text'), 'an approval is not a question count')
  assert.ok(approval.includes('fill="#f59e0b"'), 'but it wears the same disc colour as a question')
}

{
  // Motion is driven by the plugin, so nothing here is an animation element: what
  // matters is what the drawing looks like per tick, and the tick arithmetic is
  // already covered above. What this block pins is that no state emits a
  // declarative animation that could disagree with the driven one.
  for (const state of plugin.STYLE_STATES) {
    const svg = plugin.sentryFavicon(planFor([state]), OPTIONS)
    assert.ok(!/<animate|animateTransform/.test(svg), `${state} must not rely on a declarative animation`)
  }

  const done = plugin.sentryFavicon(planFor(['done']), OPTIONS)
  assert.ok(done.includes('fill="#22c55e"'), 'a completion is green')

  // A question outranks a busy tab: one icon shows one colour, and the most urgent
  // fact is the one worth the whole background.
  const blocked = plugin.sentryFavicon(planFor(['waiting', 'running']), OPTIONS)
  assert.ok(blocked.includes('fill="#f59e0b"'), 'a question wins the colour')
  assert.equal(
    plugin.tickInterval(plugin.activeLook(planFor(['waiting', 'running'])), false),
    120,
    'and it is the question\u2019s motion that gets driven, not the busy one',
  )

  // Reduced motion keeps the shape and drops the animation, so the state survives
  // as a colour even when the motion does not.
  for (const state of ['running', 'waiting', 'approval', 'done']) {
    const calm = plugin.sentryFavicon(planFor([state]), { reducedMotion: true })
    assert.ok(!calm.includes('<animate'), `${state} must not animate under reduced motion`)
    assert.ok(
      calm.includes(plugin.PRESET_COLORS[plugin.DEFAULT_LOOK[state].color]),
      `${state} keeps its colour`,
    )
  }
}

{
  // The href is a fully-encoded data URL: the fish path contains no `#`, but the
  // encoding is what makes that a non-issue rather than a lucky accident.
  const href = plugin.faviconHref(plugin.sentryFavicon(planFor(['running']), OPTIONS))
  assert.ok(href.startsWith('data:image/svg+xml;charset=utf-8,'))
  assert.equal(plugin.faviconHref('<svg a="1"/>'), 'data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E')
  assert.ok(!href.includes('<svg'), 'nothing may survive unencoded')
}

// ── the title ───────────────────────────────────────────────────────────────
{
  // The translator is identity here, so the keys themselves are the assertion:
  // what matters is which key is chosen, and how the prefix composes.
  const t = (key) => key
  assert.equal(plugin.titleStatus(IDLE, t), '')
  assert.equal(plugin.titleStatus(planFor(['waiting']), t), '① alert.status.waiting')
  assert.equal(plugin.titleStatus(planFor(['waiting', 'waiting']), t), '② alert.status.waiting')
  assert.equal(
    plugin.titleStatus(planFor(['waiting', 'waiting', 'waiting', 'waiting']), t),
    '③ alert.status.waiting',
    'the count is capped so the prefix cannot wrap',
  )
  assert.equal(
    plugin.titleStatus(planFor(['waiting', 'approval']), t),
    '① alert.status.waiting · alert.status.approval',
  )
  assert.equal(plugin.titleStatus(planFor(['approval']), t), 'alert.status.approval')
  assert.equal(plugin.titleStatus(planFor(['running']), t), 'alert.status.running')
  assert.equal(plugin.titleStatus(planFor(['done']), t), 'alert.status.done')

  const base = 'My session — DeepSeek Harness'
  const withStatus = plugin.titleWithStatus(base, planFor(['waiting']), t)
  assert.equal(withStatus, '① alert.status.waiting · My session — DeepSeek Harness')
  // Additive only: the pure function never removes anything, because a removal
  // judged by shape would eat a real segment of an app title containing ` · `.
  // The plugin's own prefix is removed by the marker in `applyTitle`, which the
  // end-to-end block below exercises.
  assert.equal(plugin.titleWithStatus('Part one · Part two', planFor(['running']), t), 'alert.status.running · Part one · Part two')
  assert.equal(plugin.titleWithStatus(base, IDLE, t), base, 'no status means the title as the app wrote it')
}

// ── the sound ───────────────────────────────────────────────────────────────
const ALERTS = {
  questions: ['q'],
  approvals: ['a'],
  completed: ['c'],
}
const BACKGROUND = { now: 10_000, lastSoundAt: undefined, hidden: true, focused: false }
const FOREGROUND = { now: 10_000, lastSoundAt: undefined, hidden: false, focused: true }
/** The chime configuration the shipped document resolves to. */
const SHIPPED_SOUND = plugin.resolveStyle(plugin.DEFAULT_STYLE).sound

{
  const picked = plugin.soundPlan(ALERTS, SHIPPED_SOUND, BACKGROUND)
  assert.equal(picked?.channel, 'waiting', 'a question is the loudest thing')
  assert.deepEqual(
    picked.frequencies,
    SHIPPED_SOUND.channels.waiting.frequencies,
    'and what plays is what the document asked for',
  )
  assert.equal(picked.gain, SHIPPED_SOUND.channels.waiting.gain, 'at the loudness the document resolved to')
  assert.equal(plugin.soundPlan(ALERTS, SHIPPED_SOUND, FOREGROUND), undefined, 'foreground is silence')
  assert.equal(
    plugin.soundPlan(ALERTS, { ...SHIPPED_SOUND, when: 'always' }, FOREGROUND)?.channel,
    'waiting',
    'and the document can opt out of that rule',
  )
  assert.equal(
    plugin.soundPlan(ALERTS, { ...SHIPPED_SOUND, when: 'off' }, BACKGROUND),
    undefined,
    'or silence sound entirely',
  )
  // A blurred window counts as background even when the document is visible.
  assert.equal(plugin.soundPlan(ALERTS, SHIPPED_SOUND, { ...BACKGROUND, hidden: false, focused: false })?.channel, 'waiting')

  // A state whose chime is off is skipped rather than silencing the rest: an approval
  // that arrives in the same burst still has its own sound.
  const withoutWaiting = {
    ...SHIPPED_SOUND,
    channels: { ...SHIPPED_SOUND.channels, waiting: undefined },
  }
  assert.equal(plugin.soundPlan(ALERTS, withoutWaiting, BACKGROUND)?.channel, 'approval')
  const onlyDone = { ...SHIPPED_SOUND, channels: { done: SHIPPED_SOUND.channels.done } }
  assert.equal(
    plugin.soundPlan(ALERTS, onlyDone, BACKGROUND)?.channel,
    'done',
    'with both human-action chimes off, the completion chime is what is left',
  )
  assert.equal(
    plugin.soundPlan(ALERTS, { ...SHIPPED_SOUND, channels: {} }, BACKGROUND),
    undefined,
    'and with every chime off, silence',
  )

  const quiet = { questions: [], approvals: [], completed: ['c'] }
  assert.equal(plugin.soundPlan(quiet, SHIPPED_SOUND, BACKGROUND)?.channel, 'done', 'a completion chimes by default')

  // One sound per burst: three questions in three seconds must not be three chimes.
  // The gap is the document's, so both the shipped value and a document that changed
  // it are checked here.
  assert.equal(
    plugin.soundPlan(ALERTS, SHIPPED_SOUND, { ...BACKGROUND, lastSoundAt: 9_000 }),
    undefined,
    'the gap suppresses a second chime',
  )
  assert.equal(
    plugin.soundPlan(ALERTS, SHIPPED_SOUND, { ...BACKGROUND, lastSoundAt: 10_000 - SHIPPED_SOUND.gapMs })?.channel,
    'waiting',
    'and expires exactly at the gap',
  )
  const patient = plugin.resolveStyle('chime-gap 3s').sound
  assert.equal(patient.gapMs, 3_000)
  assert.equal(
    plugin.soundPlan(ALERTS, patient, { ...BACKGROUND, lastSoundAt: 8_000 }),
    undefined,
    'a longer gap holds a chime back',
  )
  assert.equal(plugin.soundPlan(ALERTS, patient, { ...BACKGROUND, lastSoundAt: 6_000 })?.channel, 'waiting')
}

{
  // The shipped chimes are the plugin's audible identity: a rising two-note question,
  // one note for an approval, one soft low note for a completion.
  const channels = SHIPPED_SOUND.channels
  assert.deepEqual(channels.waiting.labels, ['A5', 'E6'], 'a question rises a fifth')
  assert.ok(channels.waiting.frequencies[1] > channels.waiting.frequencies[0])
  assert.deepEqual(channels.approval.labels, ['A5'])
  assert.deepEqual(channels.done.labels, ['A4'], 'a completion is the same note an octave down')
  assert.ok(channels.done.gain < channels.waiting.gain, 'and quieter than a question')
  assert.ok(channels.done.gain < channels.approval.gain, 'and quieter than an approval')

  // Loudness is one number per state, so what the card prints is what plays: the
  // shipped document's three numbers, and nothing derived from a second setting.
  assert.equal(channels.waiting.gain, 0.5)
  assert.equal(channels.approval.gain, 0.45)
  assert.equal(channels.done.gain, 0.25, 'the completion is quiet because its block says so')
  assert.equal(
    plugin.resolveStyle('done {\n  volume 0.1\n}').sound.channels.done.gain,
    0.1,
    'and a block that names a loudness plays at exactly that',
  )
  assert.equal(
    plugin.resolveStyle('done {\n  volume 0.1\n}').sound.channels.waiting.gain,
    0.5,
    'without touching the states beside it',
  )

  // The notes of one chime are a sequence rather than a chord: the second starts
  // after the first, which is what makes two notes read as one sound.
  const notes = plugin.chimeNotes(channels.waiting.frequencies)
  assert.equal(notes.length, 2)
  assert.equal(notes[0].startMs, 0)
  assert.equal(notes[1].startMs, plugin.CHIME_STAGGER_MS)
  assert.equal(notes[0].durationMs, plugin.CHIME_NOTE_MS)
  assert.ok(plugin.CHIME_STAGGER_MS < plugin.CHIME_NOTE_MS, 'so the two notes overlap rather than sequence')
  assert.deepEqual(plugin.chimeNotes([]), [], 'no notes is no sound')
}

{
  // The AudioContext face the player uses, with the autoplay states it must honour.
  // `resumeEffect` models the browser's timing: a real `resume()` returns a
  // promise and leaves the context suspended until the policy lets it start, so
  // the default fake stays suspended and only counts the attempt.
  function fakeAudio({ resumeEffect = 'stay-suspended' } = {}) {
    const scheduled = []
    let closed = 0
    let resumed = 0
    const context = {
      state: 'suspended',
      currentTime: 5,
      destination: { name: 'destination' },
      resume() {
        resumed += 1
        if (resumeEffect === 'run') context.state = 'running'
        return Promise.resolve()
      },
      close() {
        closed += 1
        return Promise.resolve()
      },
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: (value, at) => scheduled.push(['frequency', value, at]) },
          connect: () => undefined,
          start: (at) => scheduled.push(['start', at]),
          stop: (at) => scheduled.push(['stop', at]),
        }
      },
      createGain() {
        return {
          gain: {
            setValueAtTime: (value, at) => scheduled.push(['gate', value, at]),
            linearRampToValueAtTime: (value, at) => scheduled.push(['attack', value, at]),
            exponentialRampToValueAtTime: (value, at) => scheduled.push(['release', value, at]),
          },
          connect: () => undefined,
        }
      },
    }
    return { context, scheduled, counts: () => ({ closed, resumed }) }
  }

  const suspended = fakeAudio()
  const blocked = plugin.createChime({
    AudioContextClass: function AudioContext() {
      return suspended.context
    },
  })
  assert.equal(
    blocked.play(SHIPPED_SOUND.channels.waiting.frequencies, 0.5),
    false,
    'a suspended context cannot sound, and the chime is dropped',
  )
  assert.ok(suspended.counts().resumed >= 1, 'and the player asks for a resume rather than giving up silently')
  assert.equal(suspended.scheduled.length, 0, 'nothing may be queued for a context that cannot play')

  const running = fakeAudio({ resumeEffect: 'run' })
  const player = plugin.createChime({
    AudioContextClass: function AudioContext() {
      return running.context
    },
  })
  assert.equal(player.play(SHIPPED_SOUND.channels.waiting.frequencies, 0.25), true)
  const starts = running.scheduled.filter((entry) => entry[0] === 'start')
  assert.equal(starts.length, 2, 'a two-note chime schedules two notes')
  assert.ok(
    Math.abs(starts[1][1] - starts[0][1] - plugin.CHIME_STAGGER_MS / 1000) < 0.001,
    `the second note is offset by the chime's own stagger (${String(starts[1][1] - starts[0][1])})`,
  )
  const attack = running.scheduled.find((entry) => entry[0] === 'attack')
  assert.equal(attack[1], 0.25, 'the gain is the loudness the caller asked for')
  assert.equal(player.play(SHIPPED_SOUND.channels.done.frequencies, 0.1), true)
  assert.equal(
    running.scheduled.filter((entry) => entry[0] === 'attack').at(-1)[1],
    0.1,
    'and a quieter state plays quieter',
  )
  assert.equal(player.play([], 0.5), false, 'an empty note list schedules nothing')
  assert.equal(player.play(undefined, 0.5), false, 'and so does no note list at all')
  player.dispose()
  assert.equal(running.counts().closed, 1)

  // No Web Audio at all: the plugin degrades to the visual channels, silently.
  const silent = plugin.createChime({ AudioContextClass: undefined })
  assert.equal(silent.play([880], 0.5), false)
  silent.resume()
  silent.dispose()
}

// ── persistence ─────────────────────────────────────────────────────────────
{
  const written = new Map()
  const storage = {
    getItem: (key) => written.get(key) ?? null,
    setItem: (key, value) => written.set(key, value),
  }
  const store = plugin.createStampStore(storage)
  assert.deepEqual(store.readStamps(), {}, 'an empty storage reads as no stamps')
  store.writeStamps({ a: 5 })
  assert.deepEqual(store.readStamps(), { a: 5 })
  assert.deepEqual(JSON.parse(written.get('dsh-sentry:done')), { a: 5 })

  // Garbage in the storage is ignored rather than trusted: another tab, an older
  // format, or a hand-edited value must not become a stamp.
  written.set('dsh-sentry:done', 'not json')
  assert.deepEqual(plugin.createStampStore(storage).readStamps(), {})
  written.set('dsh-sentry:done', '{"a":"5","b":7,"c":null}')
  assert.deepEqual(plugin.createStampStore(storage).readStamps(), { b: 7 })

  assert.deepEqual(plugin.createStampStore(undefined).readStamps(), {}, 'no storage is not a crash')
  const hostile = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  const denied = plugin.createStampStore(hostile)
  assert.deepEqual(denied.readStamps(), {})
  denied.writeStamps({ a: 1 })
  assert.deepEqual(denied.readStamps(), { a: 1 }, 'the in-memory copy still carries the session')
}

// ── the settings ────────────────────────────────────────────────────────────
{
  const defaults = plugin.resolveSettings(undefined)
  assert.deepEqual(Object.keys(defaults), ['style'], 'the document is the whole of the plugin’s configuration')
  assert.equal(defaults.style, plugin.DEFAULT_STYLE)
  assert.equal('fishScale' in defaults, false, 'the fish is full size now; there is no size to set')
  assert.equal('volume' in defaults, false, 'the volume is a line of the document now, not a setting beside it')

  // Coercion survives a hand-edited document: a field that is not a document at all
  // falls back to the shipped one rather than reaching the reader.
  assert.equal(plugin.resolveSettings({ style: 42 }).style, plugin.DEFAULT_STYLE)
  assert.equal(plugin.resolveSettings({ style: '   ' }).style, plugin.DEFAULT_STYLE)
  assert.equal(plugin.resolveSettings({ style: 'icon off' }).style, 'icon off')
  assert.deepEqual(plugin.resolveSettings(null), defaults)
  assert.deepEqual(plugin.resolveSettings({ nonsense: 1 }), defaults, 'a key that is not a setting changes nothing')
}

{
  // The two halves are separate bundles and cannot share a module, so the field
  // list is duplicated by hand. Comparing them here is what turns a silent drift
  // — a field the row writes and the schema does not hold — into a failing check.
  const clientFields = plugin.SETTINGS.map((field) => field.id)
  const hostSource = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  const declared = /const ALERT_FIELDS = \[([^\]]*)\]/.exec(hostSource)?.[1]
  assert.ok(declared !== undefined, 'the host half must declare ALERT_FIELDS')
  const hostFields = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(clientFields, hostFields, 'both halves must list the same settings')

  for (const field of plugin.SETTINGS) {
    assert.equal(typeof field.labelKey, 'string', `${field.id} needs a label`)
    assert.equal(typeof field.hintKey, 'string', `${field.id} needs a hint`)
    assert.ok(['boolean', 'number', 'text'].includes(field.kind), `${field.id} has an unknown kind`)
    assert.equal(plugin.SETTING_DEFAULTS[field.id], field.default)
  }

  // The document is duplicated across the two halves for the same reason the field
  // roster is, so the copies must agree: a default changed on one side only would
  // render one document in the row and run another in the engine.
  const hostStyle = /export const DEFAULT_STYLE_DOCUMENT = \[([\s\S]*?)\]\.join\('\\n'\)/.exec(
    readFileSync(join(root, 'lib', 'index.js'), 'utf8'),
  )?.[1]
  assert.ok(hostStyle !== undefined, 'the host half must declare DEFAULT_STYLE_DOCUMENT')
  const hostStyleText = [...hostStyle.matchAll(/'([^']*)'/g)].map((match) => match[1]).join('\n')
  assert.equal(hostStyleText, plugin.DEFAULT_STYLE, 'both halves must ship the same document')
  // And the shipped document must be one the reader is happy with, or every fresh
  // install would greet its user with a diagnostics list.
  assert.deepEqual(plugin.resolveStyle(hostStyleText).problems, [], 'the shipped document must read cleanly')

  // The defaults must agree *by value*, not merely by the presence of a literal:
  // a fresh install would otherwise render one value and enforce another. The
  // schema is imported for real when the plugin's dependencies are installed, and
  // the check degrades to a source-level comparison when they are not.
  try {
    const host = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
    assert.deepEqual(
      host.AlertSchema({}),
      plugin.SETTING_DEFAULTS,
      'the host schema defaults must equal the browser half defaults',
    )
  } catch (error) {
    if (!String(error).includes('Cannot find package')) throw error
    assert.ok(
      hostSource.includes('z.string().default(DEFAULT_STYLE_DOCUMENT)'),
      'the host schema must default the shipped document (checked by source, dependencies absent)',
    )
  }
}

// ── the settings row ────────────────────────────────────────────────────────
/** Collect every element in a tree, depth-first, flattening array children. */
function collectElements(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const entry of node) collectElements(entry, out)
    return out
  }
  if (typeof node !== 'object') return out
  out.push(node)
  const children = Array.isArray(node.children) ? node.children : [node.children]
  for (const child of children) collectElements(child, out)
  collectElements(node.props?.children, out)
  return out
}

/**
 * Every element of one class inside a tree, including a component rendered at its
 * own level.
 *
 * The React stub does not render function components, so `SettingText` and
 * `StatePreviews` stay unresolved elements in the row's tree; rendering one at its
 * own level with the props the row passed down is exactly what a real browser does,
 * and it keeps each assertion on the component that owns the thing being asserted.
 * @param tree - the row's rendered tree.
 * @param name - the component's function name.
 * @returns the elements the component renders.
 */
function rendered(tree, name) {
  return collectElements(tree)
    .filter((element) => typeof element.type === 'function' && element.type.name === name)
    .map((element) => element.type(element.props))
}

/** Every element of one class name in a tree. */
function byClass(tree, className) {
  return collectElements(tree).filter((element) => element.props?.className === className)
}

{
  const writes = []
  const auditions = []
  const shownInTab = []
  let resets = 0
  const settings = plugin.resolveSettings(undefined)
  const tree = plugin.AlertRow({
    t: (key) => key,
    useStore: (selector) => selector({ ...settings, revision: 1 }),
    setField: (field, value) => writes.push([field, value]),
    reset: () => {
      resets += 1
    },
    audition: (frequencies, gain) => auditions.push([frequencies, gain]),
    preview: (name) => shownInTab.push(name),
  })
  const doc = plugin.resolveStyle(plugin.DEFAULT_STYLE)

  // The row is the document editor, the previews, and a reset — and no switches:
  // every knob the row used to carry is a line of the document now, which is the
  // whole point of folding them in.
  assert.equal(byClass(tree, 'dsh-sentry-switch').length, 0, 'the row carries no switches')
  assert.equal(
    collectElements(tree).filter((element) => element.props?.type === 'range').length,
    0,
    'and no sliders',
  )

  // ── the previews ──────────────────────────────────────────────────────────
  // The strip is a component of its own, so it is rendered at its own level the way
  // the stub makes necessary — and the tick it drives is the shipped `TICK_MS`.
  const previews = rendered(tree, 'StatePreviews')
  const cards = byClass(previews, 'dsh-sentry-preview')
  assert.equal(cards.length, plugin.STYLE_STATES.length, 'one preview per state')
  const icons = cards.map((card) => byClass(card, 'dsh-sentry-previewIcon')[0])
  for (const [index, state] of plugin.STYLE_STATES.entries()) {
    const expected = plugin.faviconHref(
      plugin.sentryFavicon(plugin.previewPlan(state), {
        reducedMotion: false,
        style: doc.look,
        motion: plugin.motionTick(doc.look[state], 0),
      }),
    )
    assert.equal(icons[index].props.src, expected, `${state} must be previewed exactly as the tab draws it`)
    assert.equal(icons[index].props.width, 32, 'at the size the tab draws it')
    assert.equal(icons[index].props.alt, `alert.status.${state}`)
  }
  assert.equal(
    new Set(icons.map((icon) => icon.props.src)).size,
    plugin.STYLE_STATES.length,
    'and the four states are four different pictures',
  )

  // The sound line and the button describe and play the same chime: the notes the
  // document named, at the loudness it resolved to.
  const sounds = byClass(previews, 'dsh-sentry-previewSound').map((element) => element.children.join(''))
  assert.ok(sounds.some((text) => text.includes('A5')), 'the waiting card names its notes')
  assert.ok(sounds.some((text) => text.includes('50%')), 'and the loudness that will come out')
  assert.ok(sounds.some((text) => text.includes('alert.preview.silent')), 'a state with no chime says so')
  // Every percentage the strip prints is a number the document contains. That is the
  // rule this shape of the document exists to keep: a card that printed the product of
  // two settings showed a figure its reader could not find anywhere.
  for (const text of sounds) {
    const percent = /(\d+)%/.exec(text)
    if (percent === null) continue
    assert.ok(
      plugin.DEFAULT_STYLE.includes(`volume ${String(Number(percent[1]) / 100)}`),
      `${text} must come from a line of the document`,
    )
  }
  // And the one case where it does not — a block that never wrote one — is marked as
  // the default rather than left looking like another unexplained figure.
  const sparse = rendered(
    plugin.AlertRow({
      t: (key) => key,
      useStore: (selector) => selector({ ...settings, style: 'waiting {\n  chime A5\n}', revision: 1 }),
      setField: () => undefined,
      reset: () => undefined,
      audition: () => undefined,
      preview: () => undefined,
    }),
    'StatePreviews',
  )
  assert.ok(
    byClass(sparse, 'dsh-sentry-previewSound')[0].children.join('').includes('alert.preview.fallback'),
    'a loudness the document never states is printed as the default',
  )
  const buttons = byClass(previews, 'dsh-sentry-audition')
  assert.equal(buttons.length, Object.keys(doc.sound.channels).length, 'only a chimed state offers a button')
  buttons[0].props.onClick()
  assert.equal(auditions.length, 1)
  assert.deepEqual(auditions[0][0], doc.sound.channels.waiting.frequencies)
  assert.equal(auditions[0][1], doc.sound.channels.waiting.gain)

  // ── showing a state in the tab ────────────────────────────────────────────
  // The card is a 32-pixel picture in a settings page; the button beside it puts the
  // same state into the *real tab*, which is the only way to judge an edit to a state
  // no session happens to be in. Every state can be shown, including the two with no
  // chime — this is about appearance.
  const pinButtons = byClass(previews, 'dsh-sentry-pin')
  assert.equal(pinButtons.length, plugin.STYLE_STATES.length, 'every state can be shown in the tab')
  assert.equal(
    pinButtons.every((button) => button.props['aria-pressed'] === false),
    true,
    'and none of them starts pressed',
  )
  pinButtons[0].props.onClick()
  assert.deepEqual(shownInTab, [plugin.STYLE_STATES[0]], 'the first card asks the tab for its own state')

  // The toggle, driven through `mount` because the pinned card lives in the
  // component's own hook state and the stub only re-renders when the caller asks it to.
  const { render: renderStrip } = mount()
  const pinnedCalls = []
  const stripProps = {
    t: (key) => key,
    doc,
    audition: () => undefined,
    preview: (name) => pinnedCalls.push(name),
  }
  const first = renderStrip(plugin.StatePreviews, stripProps)
  assert.equal(
    byClass(first, 'dsh-sentry-pin')[0].props.title,
    'alert.preview.pinHint',
    'an unpinned card explains what the button does',
  )
  byClass(first, 'dsh-sentry-pin')[0].props.onClick()
  assert.deepEqual(pinnedCalls, [plugin.STYLE_STATES[0]], 'clicking asks the tab for that state')
  const second = renderStrip(plugin.StatePreviews, stripProps)
  assert.equal(
    byClass(second, 'dsh-sentry-pin')[0].props['aria-pressed'],
    true,
    'the card marks itself as the one the tab is showing',
  )
  assert.equal(
    byClass(second, 'dsh-sentry-pin')[0].props.title,
    'alert.preview.pinnedHint',
    'and says how to stop',
  )
  assert.equal(
    byClass(second, 'dsh-sentry-preview')[0].props['data-pinned'],
    true,
    'and the card it belongs to is the marked one',
  )
  assert.equal(
    byClass(second, 'dsh-sentry-preview')[1].props['data-pinned'],
    false,
    'while the others are not',
  )
  byClass(second, 'dsh-sentry-pin')[0].props.onClick()
  assert.deepEqual(
    pinnedCalls,
    [plugin.STYLE_STATES[0], undefined],
    'clicking it again takes the tab back to the live state',
  )

  // ── the editor ────────────────────────────────────────────────────────────
  const editor = collectElements(tree).find(
    (element) => typeof element.type === 'function' && element.type.name === 'SettingText',
  )
  assert.equal(editor.props.value, plugin.DEFAULT_STYLE, 'the editor holds the whole document')
  assert.equal(editor.props.problems.length, 0, 'and a clean document has nothing to report')
  editor.props.onChange('icon off')
  assert.deepEqual(writes.at(-1), ['style', 'icon off'], 'and writes it as one field')

  const reset = byClass(tree, 'dsh-sentry-reset')[0]
  assert.ok(reset !== undefined, 'the row must offer a reset')
  reset.props.onClick()
  assert.equal(resets, 1)
}

{
  // A document with a mistake in it is reported on the row rather than drawn
  // silently: the editor underlines it while typing, and this list is the version
  // that survives a document pasted into `settings.yaml` and never opened in the
  // editor at all.
  const settings = plugin.resolveSettings(undefined)
  const broken = 'waiting {\n  shape circl\n}'
  const tree = plugin.AlertRow({
    t: (key) => key,
    useStore: (selector) => selector({ ...settings, style: broken, revision: 1 }),
    setField: () => undefined,
    reset: () => undefined,
    audition: () => undefined,
  })
  const editor = collectElements(tree).find(
    (element) => typeof element.type === 'function' && element.type.name === 'SettingText',
  )
  assert.equal(editor.props.problems.length, 1, 'the reader’s problems reach the editor block')
  assert.equal(editor.props.problems[0].line, 1, 'with the line they are on')
  const listed = byClass(editor.type(editor.props), 'dsh-sentry-problem')
  assert.equal(listed.length, 1, 'and are printed under the editor')
  assert.ok(
    collectElements(listed[0]).some(
      (element) => typeof element.children?.[0] === 'string' && element.children[0].includes('circl'),
    ),
    'the message names the word that is wrong',
  )
  assert.ok(
    byClass(editor.type(editor.props), 'dsh-sentry-problemLine')[0].children.join('') === '2',
    'and the line number is the one the user sees in the document',
  )

  // A document wrong on every line is summarised rather than reproduced: the list
  // exists to point at the mistakes worth fixing, and a hundred rows of complaint
  // would push the rest of the settings page off the screen.
  const many = Array.from({ length: 20 }, (_, index) => `nonsense ${String(index)}`).join('\n')
  const noisy = plugin.AlertRow({
    t: (key) => key,
    useStore: (selector) => selector({ ...settings, style: many, revision: 1 }),
    setField: () => undefined,
    reset: () => undefined,
    audition: () => undefined,
  })
  const noisyEditor = collectElements(noisy).find(
    (element) => typeof element.type === 'function' && element.type.name === 'SettingText',
  )
  const noisyTree = noisyEditor.type(noisyEditor.props)
  assert.equal(byClass(noisyTree, 'dsh-sentry-problem').length, 6, 'at most six problems are listed')
  assert.ok(
    byClass(noisyTree, 'dsh-sentry-problemHead').some((element) =>
      String(element.children[0]).includes('14'),
    ),
    'and the rest are counted rather than listed',
  )
}

// ── the style document's field is an editor ─────────────────────────────────
//
// The difference that matters is not cosmetic: a controlled textarea rewrote its value on
// every keystroke, and that single call is what destroyed the browser's undo stack and reset
// the caret. So the field is now a host element the editor mounts into from an effect.
//
// What is assertable HERE is only the shape, because the editor needs a real document and
// this file runs in Node with a stubbed React whose `useEffect` does nothing. That the editor
// actually mounts, highlights, and keeps its undo stack is asserted in a real browser by
// `scripts/browser-check.mjs`.
{
  const written = []
  const tree = plugin.SettingText({
    label: 'appearance',
    hint: 'one property per line',
    value: plugin.DEFAULT_STYLE,
    help: { summary: 'reference', problems: 'problems', sections: [{ title: 'syntax', lines: ['waiting {'] }] },
    onChange: (next) => written.push(next),
  })
  const hosts = collectElements(tree).filter(
    (element) => element.props?.className === 'dsh-sentry-editor',
  )
  assert.equal(hosts.length, 1, 'the document must render exactly one editor host')
  assert.equal(
    collectElements(tree).filter((element) => element.type === 'textarea').length,
    0,
    'the document must not render a bare textarea',
  )
  assert.ok(hosts[0].props.ref !== undefined, 'the editor host must carry the ref the effect mounts into')
  // The reference is not decoration: it is the interface for a language whose vocabulary is
  // closed, and it stays even though the editor now explains a token on hover.
  assert.equal(
    collectElements(tree).filter((element) => element.type === 'details').length,
    1,
    'the reference block must stay',
  )
  // A document with nothing wrong says nothing: the problem list is for problems,
  // not for reassurance.
  assert.equal(
    collectElements(tree).filter((element) => element.props?.className === 'dsh-sentry-problems').length,
    0,
    'a clean document prints no problem list',
  )
  // Nothing may be written to the setting during render: the editor reports the user's typing
  // from an effect and an event, never as a side effect of drawing.
  assert.deepEqual(written, [], 'rendering the field must not write the setting')
}

{
  // The editor grows with the document rather than scrolling inside itself: a box that
  // scrolls inside a page that scrolls is two scrollbars for one document, and the one
  // the user is reaching for is the page's. The cap this replaces was smaller than the
  // document every install ships, which is what made the second bar appear.
  //
  // Asserted at the source level, deliberately: the sizing is handed to `createEditor`
  // from an effect, and this file runs in Node with a stubbed React whose effects do
  // nothing. The number is still a decision, and the shipped document's own length is
  // what says how large is large enough.
  const sizing = /sizing: \{ minRows: (\d+), maxRows: (\d+) \}/.exec(source)
  assert.ok(sizing !== undefined, 'the row must size the editor explicitly')
  const shippedLines = plugin.DEFAULT_STYLE.split('\n').length
  assert.ok(
    Number(sizing[2]) >= shippedLines,
    `the editor must show the shipped document (${String(shippedLines)} lines) without a scrollbar of its own`,
  )
}

// ── the editor was compiled in, and the shell is not asked for it ───────────
//
// The editor is not a platform singleton, so the bundle cannot `require` it: the shell's
// module table would not have it, and the failure would appear only in the browser, as a
// plugin that never loads. It is compiled in instead, and these assertions are what make that
// a checked fact rather than a claim about the build.
//
// There is exactly ONE compiled-in module, and that count is the architecture: the library
// ships no syntax, so the grammar for this plugin's DSL is this repo's own file, spliced in
// from `src/` and never named in a `require`.
{
  const aliases = source.match(/let _citisen_litearea[a-z_]* = \(function \(\) \{/g) ?? []
  assert.equal(
    aliases.length,
    1,
    'the editor must be the only compiled-in library; the grammar is this plugin’s own module',
  )
  assert.ok(
    !/require\(["']@citisen\/litearea/.test(source),
    'the compiled-in editor must not be asked of the module table',
  )
  assert.ok(
    !/require\(["']\.\.?\//.test(source),
    'a module of this repo must be spliced in at build time, never asked of the module table',
  )
  // The inlined modules declare their exports rather than leaving an `export` statement, which
  // would not parse in a classic script.
  assert.ok(
    source.includes('return { ') && !/^export /m.test(source),
    'a compiled-in module must hand its names back rather than export them',
  )
  // The editor's own stylesheet travels with it, because the library injects it: a bundle
  // without those rules would render an unstyled box.
  assert.ok(
    source.includes('.litearea-layer') && source.includes('.litearea-popup'),
    'the compiled-in editor must carry its stylesheet',
  )
}

// ── apply(ctx) end to end ───────────────────────────────────────────────────
//
// The engine is DOM plus two subscriptions, so this is the block that proves the
// three channels actually react: the shipped favicon link is watched, the title
// is composed with the app's own, and a switch flows all the way through.
const links = []
function makeElement(tag) {
  const element = {
    tagName: tag.toUpperCase(),
    dataset: {},
    attributes: {},
    children: [],
    parentNode: null,
    rel: '',
    type: '',
    href: '',
    textContent: '',
    setAttribute: (name, value) => {
      element.attributes[name] = value
    },
    getAttribute: (name) => element.attributes[name],
    appendChild: (child) => {
      child.parentNode = element
      element.children.push(child)
      return child
    },
    removeChild: (child) => {
      element.children = element.children.filter((entry) => entry !== child)
      child.parentNode = null
    },
    remove() {
      if (element.parentNode !== null) element.parentNode.removeChild(element)
    },
  }
  if (tag === 'link') links.push(element)
  return element
}

const head = makeElement('head')
const titleElement = makeElement('title')
titleElement.textContent = 'DeepSeek Harness'

const listeners = new Map()
const documentStub = {
  head,
  title: 'DeepSeek Harness',
  hidden: true,
  createElement: makeElement,
  querySelector: (selector) => (selector === 'title' ? titleElement : null),
  addEventListener: (type, listener) => listeners.set(type, listener),
  removeEventListener: (type) => listeners.delete(type),
  hasFocus: () => false,
}
globalThis.document = documentStub
/** Captured so the title observer can be driven explicitly. */
let titleObserverCallback
globalThis.MutationObserver = class {
  constructor(callback) {
    titleObserverCallback = callback
  }
  observe() {}
  disconnect() {}
}

/** A mutable session list, so a subscription can be driven. */
let sessionState = { ids: [], byId: {} }
let pendingState = new Map()
let listListener
let pendingListener
let section = {}
let scopeRevision = 1
let scopeListener
const dictionaries = []
const registeredSlots = []
const effects = []

const scope = {
  getSnapshot: () => ({ status: 'ready', value: section, revision: scopeRevision, writable: true }),
  subscribe: (listener) => {
    scopeListener = listener
    return () => undefined
  },
  set: (field, value) => {
    section = { ...section, [field]: value }
    scopeRevision += 1
    scopeListener()
  },
  unset: (field) => {
    const { [field]: _removed, ...kept } = section
    section = kept
    scopeRevision += 1
    scopeListener()
  },
}

const localStorageStub = {
  data: new Map(),
  getItem(key) {
    return this.data.get(key) ?? null
  },
  setItem(key, value) {
    this.data.set(key, value)
  },
}
globalThis.window.localStorage = localStorageStub
globalThis.window.addEventListener = (type, listener) => listeners.set(type, listener)
globalThis.window.removeEventListener = (type) => listeners.delete(type)
globalThis.window.matchMedia = () => ({ matches: false })
globalThis.window.AudioContext = undefined

/**
 * Every `sync` the row's bound store performed.
 *
 * The registry mints ONE store instance per entry and hands its actions to the
 * inject face; that instance is what the row renders from. A plugin that builds
 * its own with `store.create()` gets a second, unwatched instance, syncs that one
 * happily, and leaves the rendered one on its `init()` values — a row that never
 * appears, with nothing thrown and nothing logged. The `register` stub below
 * makes `create()` unusable, so that whole class of mistake fails loudly here.
 */
const rowBindings = []

const settingsScopeService = { bind: (spec) => (assert.equal(spec.namespace, 'alert'), scope) }

const ctx = {
  effect: (execute) => {
    const disposer = execute()
    effects.push(typeof disposer === 'function' ? disposer : () => undefined)
    return { dispose: () => undefined }
  },
  on: () => undefined,
  get: (name) => (name === 'settingsScope' ? settingsScopeService : undefined),
  // The optional bind under test: the service is present here, so the callback
  // runs as it does in the browser. `settingsScope` stays on the fixture context
  // as well, because that is the context a bound scope is read from.
  inject: (deps, callback) => {
    assert.deepEqual(deps, ['settingsScope'])
    callback(ctx)
    return { dispose: () => undefined }
  },
  locale: {
    register: (namespace, dict) => {
      dictionaries.push({ namespace, dict })
      return () => undefined
    },
    bind: () => (key) => key,
  },
  settingsScope: settingsScopeService,
  sessions: {
    list: {
      getSnapshot: () => sessionState,
      subscribe: (listener) => {
        listListener = listener
        return () => {
          listListener = undefined
        }
      },
    },
  },
  uiSession: {
    pendingInteractions: {
      getSnapshot: () => pendingState,
      subscribe: (listener) => {
        pendingListener = listener
        return () => {
          pendingListener = undefined
        }
      },
    },
  },
  slots: {
    inject: (name, callback) => {
      assert.equal(name, 'settings.general.item')
      callback()
    },
    /**
     * The registry face. It REPLACES the declared store handle with the mounted
     * instance's actions, which is what the inject face receives — so the stub
     * does the same, recording each `sync` for the assertions below.
     * @param options - the entry's registration options.
     * @param component - the entry's component.
     * @returns the entry id.
     */
    register: (options, component) => {
      const bound = {
        sync: (state, revision) => {
          rowBindings.push({ state: { ...state }, revision })
        },
      }
      registeredSlots.push({ options: { ...options, store: bound }, component })
      return () => undefined
    },
  },
}

{
  plugin.apply(ctx)

  /**
   * The visible title: the plugin's marker is invisible and exists only to make
   * "this title is the plugin's composition" a property of the string, so the
   * assertions below are about what the user reads.
   * @param value - the raw `document.title`.
   * @returns the title without the marker.
   */
  const shown = (value) => value.replaceAll('\u200b', '')
  const MARK = '\u200b'

  /**
   * The icon links the plugin currently has mounted.
   *
   * The engine replaces its element whenever the picture changes — a tab strip follows
   * the document's *set* of icon links, and a link whose `href` changed in place is not
   * reliably a change — so the assertions below are about what is in the head *now*
   * rather than about one element captured earlier.
   * @returns the mounted elements, in document order.
   */
  const mountedIcons = () =>
    links.filter(
      (link) => link.getAttribute('data-dsh-sentry-icon') !== undefined && link.parentNode !== null,
    )

  // The app's own favicon link is never touched, and the engine starts quiet: no icon
  // is mounted until there is something to say.
  assert.equal(documentStub.title, 'DeepSeek Harness', 'nothing to report leaves the title alone')
  assert.equal(mountedIcons().length, 0, 'and it must not mount an icon')

  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'settings.alert')
  assert.deepEqual(
    Object.keys(dictionaries[0].dict.zh).sort(),
    Object.keys(dictionaries[0].dict.en).sort(),
    'both dictionaries must cover the same keys',
  )

  assert.equal(registeredSlots.length, 1)
  const [{ options, component }] = registeredSlots
  assert.equal(options.id, 'alert')
  assert.equal(options.name, 'settings.general.item')
  assert.equal(options.locale, 'settings.alert')
  assert.equal(options.order, 14)
  assert.ok(stores.length >= 1, 'the row must register a store')

  // ── a question arrives ────────────────────────────────────────────────────
  sessionState = {
    ids: ['s1'],
    byId: { s1: { id: 's1', blank: false, running: true, completed: false } },
  }
  pendingState = new Map([['s1', { sessionId: 's1', kind: 'question', key: 'k' }]])
  listListener()

  assert.equal(mountedIcons().length, 1, 'a waiting session must draw exactly one status icon')
  const icon = mountedIcons()[0]
  assert.equal(icon.rel, 'icon')
  assert.equal(icon.type, 'image/svg+xml')
  assert.equal(icon.parentNode, head, 'the icon is appended to the head')
  assert.ok(icon.href.startsWith('data:image/svg+xml;charset=utf-8,'))
  assert.ok(decodeURIComponent(icon.href).includes(FISH), 'the tab icon is still the shipped fish')
  assert.ok(decodeURIComponent(icon.href).includes('>1</text>'), 'and the badge carries the question count')
  assert.equal(
    shown(documentStub.title),
    '① alert.status.waiting · DeepSeek Harness',
    'the title composes with the app title rather than replacing it',
  )
  assert.ok(documentStub.title.endsWith(MARK), 'a composed title carries the marker')

  // ── the app rewrites the title, as ui-layout does ─────────────────────────
  // `ui-layout`'s DocumentTitle writes the title on every session change; the
  // observer is what puts the prefix back, and the writing guard is what keeps
  // the plugin's own write from re-entering.
  documentStub.title = 'Another session — DeepSeek Harness'
  assert.equal(typeof titleObserverCallback, 'function', 'the title must be observed')
  titleObserverCallback()
  assert.equal(shown(documentStub.title), '① alert.status.waiting · Another session — DeepSeek Harness')

  // The plugin's own write must not re-enter: by the time the observer fires for
  // it, the prefix is already correct and the title is left untouched.
  const composed = documentStub.title
  titleObserverCallback()
  assert.equal(documentStub.title, composed, 'a second pass is a no-op rather than a stacked prefix')

  // An app title that itself contains the separator must not be eaten one segment
  // per render — that is what the marker buys.
  documentStub.title = 'Part one · Part two — DeepSeek Harness'
  titleObserverCallback()
  const twice = documentStub.title
  titleObserverCallback()
  assert.equal(documentStub.title, twice, 'a separator inside the app title is not a prefix')
  assert.equal(shown(documentStub.title), '① alert.status.waiting · Part one · Part two — DeepSeek Harness')

  // ── the question is answered ──────────────────────────────────────────────
  pendingState = new Map()
  sessionState = { ids: [], byId: {} }
  pendingListener()
  assert.equal(mountedIcons().length, 0, 'with nothing to report the plugin holds no icon in the head')
  assert.equal(shown(documentStub.title), 'Part one · Part two — DeepSeek Harness', 'and the title prefix comes off')

  // ── the document ──────────────────────────────────────────────────────────
  //
  // The row binds the actions the registry hands it, and the mounted instance is
  // the only thing the assertions get to observe: `register` replaced the store
  // handle with its own `bindings` face, so a plugin that minted its own instance
  // would sync an object nothing here ever looks at and this block would fail.
  assert.equal(rowBindings.length, 0, 'no sync may happen before the registry injects the entry face')
  const actions = options.inject(options.store)
  assert.equal(typeof actions.setField, 'function')
  assert.equal(typeof actions.reset, 'function')
  assert.equal(typeof actions.audition, 'function')
  assert.equal(rowBindings.length, 1, 'injecting the entry face syncs the mounted store once')
  assert.equal(rowBindings[0].state.style, plugin.DEFAULT_STYLE, 'with the resolved document, not the store defaults')

  // A fresh instance must not have kept the stale plan: the settings write
  // re-renders from the live subscriptions.
  sessionState = {
    ids: ['s1'],
    byId: { s1: { id: 's1', blank: false, running: true, completed: false } },
  }
  actions.setField('style', plugin.DEFAULT_STYLE)
  assert.equal(mountedIcons().length, 1, 'a running session draws the ring again')

  // A redraw with different content mounts a *fresh* element. Mutating the `href` of the
  // one already in the head is what left a configuration edit showing the previous icon:
  // a tab strip follows the document's set of icon links, so the element has to change.
  // A redraw that changes nothing must not churn the DOM, and there must never be two
  // icons of ours in the head — with two, which one the tab shows depends on mount order.
  const running = mountedIcons()[0]
  actions.setField('style', plugin.DEFAULT_STYLE.replace('color blue', 'color purple'))
  assert.equal(mountedIcons().length, 1, 'a redraw must leave exactly one icon of ours mounted')
  const restyled = mountedIcons()[0]
  assert.notEqual(restyled, running, 'a changed picture must be a new element, not the old one with a new href')
  assert.equal(running.parentNode, null, 'and the element it replaces must be out of the document')
  assert.ok(decodeURIComponent(restyled.href).includes('fill="#8b5cf6"'), 'carrying the colour the document names')
  actions.setField('style', plugin.DEFAULT_STYLE.replace('color blue', 'color purple'))
  assert.equal(mountedIcons()[0], restyled, 'and a redraw that changes nothing must not replace it again')

  // `icon off` is a line of the document now, and it takes the plugin's icon away
  // immediately — exactly what the switch it replaced did.
  actions.setField('style', plugin.DEFAULT_STYLE.replace('icon on', 'icon off'))
  assert.equal(mountedIcons().length, 0, 'icon off removes the icon immediately')
  assert.equal(restyled.parentNode, null, 'the element itself leaves the document')
  assert.equal(
    rowBindings.at(-1).state.style.includes('icon off'),
    true,
    'and the mounted store followed the write',
  )
  assert.equal(
    shown(documentStub.title),
    'alert.status.running · Part one · Part two — DeepSeek Harness',
    'while the title channel is still on',
  )

  // And so is `title off`, which has to *strip* rather than stop writing: leaving
  // the prefix in the tab would read as a switch that does not work.
  actions.setField('style', plugin.DEFAULT_STYLE.replace('title on', 'title off'))
  assert.equal(shown(documentStub.title), 'Part one · Part two — DeepSeek Harness', 'title off strips the prefix')
  assert.equal(mountedIcons().length, 1, 'while the icon channel comes back with it')

  // The audition must not throw with no Web Audio available, and it plays the notes
  // the card printed beside the button.
  actions.audition([880, 1318.51], 0.5)

  // ── showing one state in the tab ──────────────────────────────────────────
  //
  // The whole point of the pin: the tab shows the state being edited, not the state the
  // sessions happen to be in. Here the live plan is one running session, so a preview of
  // `done` is visibly a different picture and a different title.
  actions.setField('style', plugin.DEFAULT_STYLE)
  assert.ok(
    decodeURIComponent(mountedIcons()[0].href).includes('fill="#4d6bfe"'),
    'the live plan is what the tab shows to begin with',
  )

  actions.preview('done')
  assert.ok(
    decodeURIComponent(mountedIcons()[0].href).includes('fill="#22c55e"'),
    'a preview puts the state it names in the tab',
  )
  assert.equal(
    shown(documentStub.title),
    'alert.status.done · Part one · Part two — DeepSeek Harness',
    'and composes the title for that state too',
  )

  // A preview is a picture, not an event: the live plan is what the alert diff is taken
  // against, so leaving a preview neither replays a chime nor swallows one that arrived
  // while it was up.
  actions.preview(undefined)
  assert.ok(
    decodeURIComponent(mountedIcons()[0].href).includes('fill="#4d6bfe"'),
    'leaving the preview restores the live state',
  )
  assert.equal(shown(documentStub.title), 'alert.status.running · Part one · Part two — DeepSeek Harness')

  // The tab must not wear a preview once the page is out of sight. That is exactly when
  // the icon is the only channel this plugin has left, and a state nobody asked for any
  // more would make it a liar at the worst possible moment.
  actions.preview('waiting')
  assert.ok(decodeURIComponent(mountedIcons()[0].href).includes('fill="#f59e0b"'), 'the preview is up')
  documentStub.hidden = true
  listeners.get('visibilitychange')()
  assert.ok(
    decodeURIComponent(mountedIcons()[0].href).includes('fill="#4d6bfe"'),
    'going out of sight ends the preview',
  )
  assert.equal(shown(documentStub.title), 'alert.status.running · Part one · Part two — DeepSeek Harness')
  documentStub.hidden = false

  // Reset clears the stored document; the shipped one brings every channel back.
  actions.reset()
  assert.deepEqual(section, {}, 'reset clears the stored document')

  // Teardown releases the element, and every effect was registered with a label
  // the framework can attribute.
  for (const dispose of effects.reverse()) dispose()
  assert.equal(mountedIcons().length, 0, 'teardown releases the icon')

  // A render after teardown must not mount a new one. The settings row releases its
  // preview as it unmounts, and that call can arrive after the plugin is gone; an icon
  // mounted then would belong to nobody and never come off the tab.
  actions.preview('done')
  assert.equal(mountedIcons().length, 0, 'a render after teardown must not put an icon back')

  // ── a dsh whose `uiSession` carries the 0.1.7 status source ───────────────
  //
  // 0.1.7-alpha.1 replaced `uiSession.pendingInteractions` with
  // `uiSession.sessionStatus`, whose values carry `pendingInteraction`. Reaching
  // for the old member unguarded made this plugin FAIL activation there, and a
  // failed entry blocks the web boot outright — so the newer source is read when
  // the older one is absent, and it has to light the tab exactly the same way.
  {
    let statusState = new Map()
    let statusListener
    let reopenedRow
    const errors = []
    const statusCtx = {
      ...ctx,
      uiSession: {
        sessionStatus: {
          getSnapshot: () => statusState,
          subscribe: (listener) => {
            statusListener = listener
            return () => {
              statusListener = undefined
            }
          },
        },
      },
      locale: { register: () => () => undefined, bind: () => (key) => key },
      slots: {
        inject: (name, callback) => {
          assert.equal(name, 'settings.general.item')
          callback()
        },
        register: (options) => {
          reopenedRow = options
          return () => undefined
        },
      },
    }

    const before = effects.length
    const realError = console.error
    console.error = (...args) => errors.push(args.join(' '))
    try {
      plugin.apply(statusCtx)
    } finally {
      console.error = realError
    }

    assert.ok(reopenedRow !== undefined, 'the row must register against the 0.1.7 shape')
    assert.equal(typeof statusListener, 'function', 'the 0.1.7 status source must be subscribed')
    assert.deepEqual(errors, [], 'a dsh with the newer source must not be reported as blind')

    // A question reported through the new source lights the tab exactly as the
    // dedicated map did.
    documentStub.title = 'DeepSeek Harness'
    sessionState = {
      ids: ['s1'],
      byId: { s1: { id: 's1', blank: false, running: true, completed: false } },
    }
    statusState = new Map([
      ['s1', { running: true, pendingInteraction: { sessionId: 's1', kind: 'question' } }],
    ])
    statusListener()
    assert.equal(mountedIcons().length, 1, 'the newer source must light the tab too')
    assert.equal(shown(documentStub.title), '① alert.status.waiting · DeepSeek Harness')

    // A plan review is as much a demand on the user as an approval is. The
    // approval segment carries no count glyph — the number in the prefix is the
    // waiting count — so the segment alone is what changes.
    statusState = new Map([
      ['s1', { running: true, pendingInteraction: { sessionId: 's1', kind: 'plan-review' } }],
    ])
    statusListener()
    assert.equal(shown(documentStub.title), 'alert.status.approval · DeepSeek Harness')

    // And the engine this second activation built comes off the tab with it.
    statusState = new Map()
    sessionState = { ids: [], byId: {} }
    statusListener()
    for (const dispose of effects.slice(before).reverse()) dispose()
    assert.equal(mountedIcons().length, 0, 'the second activation releases its icon')
  }
}

// ── the manifest contract ───────────────────────────────────────────────────
{
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('- id: sentry'), 'the patch must insert the plugin row')
  assert.ok(patch.includes(`name: '${PACKAGE_NAME}'`), 'and it must name this package')
}

// ── a composition that provides no `settingsScope` ──────────────────────────
//
// dsh 0.1.7-alpha.1 replaced the Web client's settings service with
// `configForms`. A build that required the old name never activated there at
// all: the boot audit listed this plugin as an entry that "did not activate",
// waiting for a service that release does not have. The service is optional now,
// and this is the composition that must still run the sentry and fill the row,
// with one honest report — at activation, when the replacement service makes the
// mismatch visible, and never twice.
{
  const incompatibleSlots = []
  const incompatibleDictionaries = []
  const reported = []
  const replacementOnlyCtx = {
    ...ctx,
    // Only the REPLACEMENT service exists, which is what makes the mismatch
    // visible without waiting for anything.
    get: (name) => (name === 'configForms' ? {} : undefined),
    inject: (deps) => {
      assert.deepEqual(deps, ['settingsScope'])
      // And it never arrives: this composition started without it.
      return { dispose: () => undefined }
    },
    locale: {
      register: (namespace, dict) => {
        incompatibleDictionaries.push({ namespace, dict })
        return () => undefined
      },
      bind: () => (key) => key,
    },
    slots: {
      inject: (name, callback) => {
        assert.equal(name, 'settings.general.item')
        callback()
      },
      register: (options, component) => {
        incompatibleSlots.push({ options, component })
        return () => undefined
      },
    },
  }

  const realError = console.error
  console.error = (...args) => reported.push(args.join(' '))
  const registeredEffects = effects.length
  try {
    plugin.apply(replacementOnlyCtx)
    assert.equal(reported.length, 1, 'a visible mismatch is reported at activation')
    // The writes the row offers must not throw on a scope that never resolves,
    // and must not repeat a report the page already carries.
    const actions = incompatibleSlots[0].options.inject(incompatibleSlots[0].options.store.create())
    actions.setField('style', 'icon on')
    actions.reset()
  } finally {
    console.error = realError
  }

  assert.equal(incompatibleSlots.length, 1, 'the row must register without a settings service')
  assert.equal(incompatibleDictionaries.length, 1, 'the row copy must register too')
  assert.equal(reported.length, 1, 'the mismatch is reported once, not once per write')
  assert.match(reported[0], /settingsScope/)
  assert.match(reported[0], /configForms/)
  assert.match(reported[0], /0\.1\.5-rc\.x/)
  assert.match(reported[0], /@citisen\/dsh-sentry/)

  // The sentry's own timers must not outlive the stub document: release what this
  // activation registered, exactly as the block above releases its own.
  for (const dispose of effects.slice(registeredEffects).reverse()) dispose()
}

delete globalThis.document
delete globalThis.MutationObserver
delete globalThis.window

console.log('verify-client: OK — envelope, fish, session model, favicon, title, chime, settings row and engine verified')
console.log(`verify-client: factory required ${requested.join(', ')}`)








