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
assert.deepEqual(plugin.inject, ['slots', 'locale', 'settingsScope', 'sessions', 'uiSession'])
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
const OPTIONS = { fishScale: 0.416, reducedMotion: false }

{
  assert.equal(plugin.sentryFavicon(IDLE, OPTIONS), undefined, 'nothing to report draws nothing')
  assert.equal(
    plugin.sentryFavicon(plugin.sessionPlan(listOf([{ id: 'a', blank: true }]), new Map(), {}, { now: 0, doneWindowMs: 0 }), OPTIONS),
    undefined,
  )
}

{
  // The fish is the product's own art, at the requested scale, centered by
  // construction: the translate must be exactly (32 - 50 * scale) / 2.
  const svg = plugin.sentryFavicon(planFor(['running']), OPTIONS)
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'), 'explicit dimensions are required')
  assert.ok(svg.includes(`<path d="${FISH}" fill="#000" fill-rule="nonzero"/>`), 'the shipped fish path, verbatim')
  const offset = (32 - 50 * 0.416) / 2
  assert.ok(svg.includes(`translate(${String(offset)} ${String(offset)}) scale(0.416)`), `centered at ${String(offset)}`)
  assert.ok(svg.includes('@media (prefers-color-scheme: dark){#fish path{fill:#fff}}'), 'the dark-tab inversion travels with the art')
  assert.ok(svg.includes('fill="#f4f5f7"'), 'the backing disc keeps the fish visible on a same-colored tab bar')
  assert.ok(/<circle[^>]*id="fish"/.test(svg) === false, 'the id belongs to the group, not the disc')
  assert.ok(svg.includes('id="fish"'))

  // A bigger fish is still centered, and still leaves the ring in place. The
  // offset is rounded to two decimals on the way into the SVG — float noise in a
  // data URL that is rebuilt on every change is a waste, and `2.2499999999999982`
  // is exactly what "no rounding" looks like.
  const big = plugin.sentryFavicon(planFor(['running']), { fishScale: 0.55, reducedMotion: false })
  const bigOffset = Math.round(((32 - 50 * 0.55) / 2) * 100) / 100
  assert.equal(bigOffset, 2.25)
  assert.ok(big.includes(`translate(${String(bigOffset)} ${String(bigOffset)}) scale(0.55)`))
  assert.ok(big.includes('r="16.23"'), 'the backing disc scales with the fish')
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
  assert.ok(many.includes('stroke="#f59e0b"'), 'but the ring still says someone is waiting')

  // Approvals count toward the blocked arc but never toward the digit: the
  // digit is the question count, and an approval is a different act.
  const approval = plugin.sentryFavicon(planFor(['approval']), OPTIONS)
  assert.ok(!approval.includes('<text'), 'an approval is not a question count')
  assert.ok(approval.includes('stroke="#f59e0b"'))
}

{
  // Motion is SMIL and only where it means something: waiting breathes, running
  // rotates, a completed session is silent, and reduced motion removes it all.
  const waiting = plugin.sentryFavicon(planFor(['waiting']), OPTIONS)
  assert.ok(waiting.includes('<animate attributeName="opacity"'), 'waiting breathes')
  assert.ok(!waiting.includes('animateTransform'))

  const running = plugin.sentryFavicon(planFor(['running']), OPTIONS)
  assert.ok(running.includes('<animateTransform attributeName="transform" type="rotate"'), 'running rotates')
  assert.ok(running.includes('values="0 16 16;45 16 16;'), 'eight discrete steps, not a sweep')
  assert.ok(!running.includes('<animate attributeName="opacity"' + ''))

  const done = plugin.sentryFavicon(planFor(['done']), OPTIONS)
  assert.ok(!done.includes('<animate'), 'a completion does not animate')
  assert.ok(
    done.includes('<circle cx="16" cy="16" r="12.5" fill="none" stroke="#22c55e"'),
    'and the ring track is green',
  )

  // The track tracks the quiet half of the status; the arcs carry the loud half.
  const busy = plugin.sentryFavicon(planFor(['running']), OPTIONS)
  assert.ok(busy.includes('<circle cx="16" cy="16" r="12.5" fill="none" stroke="#4d6bfe"'), 'running is blue')
  const blocked = plugin.sentryFavicon(planFor(['waiting', 'running']), OPTIONS)
  assert.ok(
    blocked.includes('<circle cx="16" cy="16" r="12.5" fill="none" stroke="#f59e0b"'),
    'a question outranks the busy color',
  )

  const calm = plugin.sentryFavicon(planFor(['waiting', 'running']), { fishScale: 0.416, reducedMotion: true })
  assert.ok(!calm.includes('<animate'), 'reduced motion removes the animation entirely')
  assert.ok(calm.includes('stroke-opacity="1"'), 'and raises the arcs to full opacity instead')
  assert.ok(calm.includes('stroke="#f59e0b"') && calm.includes('stroke="#4d6bfe"'), 'both arcs survive')

  // The two state classes live on opposite halves, which is what lets one icon
  // carry "two working, one waiting" without a legend.
  const both = plugin.sentryFavicon(planFor(['waiting', 'running']), OPTIONS)
  /** The arc rotation carrying a state's color. @param color - the stroke color. */
  const rotationFor = (color) => {
    for (const match of both.matchAll(/<circle\b[^>]*>/g)) {
      // The arcs are the 3.6-wide circles: the track is the same radius and can
      // carry the same color, so width is what tells them apart.
      if (match[0].includes(`stroke="${color}"`) && match[0].includes('stroke-width="3.6"')) {
        const rotation = /transform="rotate\(([-\d.]+)/.exec(match[0])
        return rotation === null ? undefined : Number(rotation[1])
      }
    }
    return undefined
  }
  const left = rotationFor('#f59e0b')
  const right = rotationFor('#4d6bfe')
  assert.ok(left !== undefined && right !== undefined, 'both arcs must be drawn')
  assert.ok(left > 90 && left < 270, `the blocked arc is on the left (${String(left)})`)
  assert.ok(right <= 0 || right >= 270, `the running arc is on the right (${String(right)})`)
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

{
  const settings = plugin.resolveSettings(undefined)
  assert.equal(plugin.soundPlan(ALERTS, settings, BACKGROUND), 'questions', 'a question is the loudest thing')
  assert.equal(plugin.soundPlan(ALERTS, settings, FOREGROUND), undefined, 'foreground is silence')
  assert.equal(
    plugin.soundPlan(ALERTS, { ...settings, soundBlocked: false }, FOREGROUND),
    'questions',
    'the user can opt out of the foreground rule',
  )
  // A blurred window counts as background even when the document is visible.
  assert.equal(plugin.soundPlan(ALERTS, settings, { ...BACKGROUND, hidden: false, focused: false }), 'questions')

  assert.equal(plugin.soundPlan(ALERTS, { ...settings, sound: false }, BACKGROUND), undefined, 'the master switch is master')
  assert.equal(plugin.soundPlan(ALERTS, { ...settings, soundWaiting: false }, BACKGROUND), 'approvals', 'the question chime can be off on its own')
  assert.equal(
    plugin.soundPlan(ALERTS, { ...settings, soundWaiting: false, soundApproval: false }, BACKGROUND),
    'completed',
    'with both human-action chimes off, the completion chime is what is left',
  )
  assert.equal(
    plugin.soundPlan(
      ALERTS,
      { ...settings, soundWaiting: false, soundApproval: false, soundDone: false },
      BACKGROUND,
    ),
    undefined,
    'and with every per-event switch off, silence',
  )

  const quiet = { questions: [], approvals: [], completed: ['c'] }
  assert.equal(plugin.soundPlan(quiet, settings, BACKGROUND), 'completed', 'a completion chimes by default')
  assert.equal(plugin.soundPlan(quiet, { ...settings, soundDone: false }, BACKGROUND), undefined, 'and can be turned off on its own')

  // One sound per burst: three questions in three seconds must not be three chimes.
  assert.equal(
    plugin.soundPlan(ALERTS, settings, { ...BACKGROUND, lastSoundAt: 9_000 }),
    undefined,
    'the gap suppresses a second chime',
  )
  assert.equal(
    plugin.soundPlan(ALERTS, settings, { ...BACKGROUND, lastSoundAt: 10_000 - plugin.SOUND_GAP_MS }),
    'questions',
    'and expires exactly at the gap',
  )
}

{
  // The chime table is the plugin's audible identity: a rising two-note question,
  // one note for an approval, one soft low note for a completion.
  assert.equal(plugin.CHIME_NOTES.questions.length, 2)
  assert.ok(plugin.CHIME_NOTES.questions[1].frequency > plugin.CHIME_NOTES.questions[0].frequency)
  assert.ok(plugin.CHIME_NOTES.questions[1].startMs > 0, 'the notes overlap rather than sequence')
  assert.equal(plugin.CHIME_NOTES.approvals.length, 1)
  assert.equal(plugin.CHIME_NOTES.completed.length, 1)
  assert.ok(
    plugin.CHIME_NOTES.completed[0].peak < plugin.CHIME_NOTES.questions[0].peak,
    'a completion is quieter than a question',
  )
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
    volume: 0.5,
  })
  assert.equal(blocked.play('questions'), false, 'a suspended context cannot sound, and the note is dropped')
  assert.ok(suspended.counts().resumed >= 1, 'and the player asks for a resume rather than giving up silently')
  assert.equal(suspended.scheduled.length, 0, 'nothing may be queued for a context that cannot play')

  const running = fakeAudio({ resumeEffect: 'run' })
  const player = plugin.createChime({
    AudioContextClass: function AudioContext() {
      return running.context
    },
    volume: 0.25,
  })
  assert.equal(player.play('questions'), true)
  const starts = running.scheduled.filter((entry) => entry[0] === 'start')
  assert.equal(starts.length, 2, 'a two-note chime schedules two notes')
  assert.ok(
    Math.abs(starts[1][1] - starts[0][1] - 0.095) < 0.001,
    `the second note is offset by the note table (${String(starts[1][1] - starts[0][1])})`,
  )
  const attack = running.scheduled.find((entry) => entry[0] === 'attack')
  assert.equal(attack[1], 1 * 0.25, 'the volume setting scales the peak')
  assert.equal(player.play('completed'), true)
  assert.equal(
    running.scheduled.filter((entry) => entry[0] === 'attack').at(-1)[1],
    0.45 * 0.25,
    'a completion is quieter than a question',
  )
  assert.equal(player.play('nonsense'), false, 'an unknown kind schedules nothing')
  player.dispose()
  assert.equal(running.counts().closed, 1)

  // No Web Audio at all: the plugin degrades to the visual channels, silently.
  const silent = plugin.createChime({ AudioContextClass: undefined, volume: 0.5 })
  assert.equal(silent.play('questions'), false)
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
  assert.equal(defaults.fishScale, 0.416)
  assert.equal(defaults.soundDone, true, 'every channel is on out of the box')
  assert.equal(defaults.soundBlocked, true, 'the foreground rule is the default')

  // Coercion is forgiving on type and strict on range: a typo in settings.yaml
  // should shrink the fish, not disable the favicon.
  assert.equal(plugin.resolveSettings({ fishScale: '0.5' }).fishScale, 0.5)
  assert.equal(plugin.resolveSettings({ fishScale: 3 }).fishScale, 0.55)
  assert.equal(plugin.resolveSettings({ fishScale: 0.1 }).fishScale, 0.3)
  assert.equal(plugin.resolveSettings({ volume: 4 }).volume, 1)
  assert.equal(plugin.resolveSettings({ volume: -1 }).volume, 0)
  assert.equal(plugin.resolveSettings({ doneWindowMs: -5 }).doneWindowMs, 0)
  assert.equal(plugin.resolveSettings({ doneWindowMs: 'nonsense' }).doneWindowMs, 60_000)
  assert.equal(plugin.resolveSettings({ sound: 'yes' }).sound, true, 'an unusable value falls back to the default')
  assert.equal(plugin.resolveSettings({ favicon: false }).favicon, false)
  assert.deepEqual(plugin.resolveSettings(null), defaults)
}

{
  // The two halves are separate bundles and cannot share a module, so the field
  // list is duplicated by hand. Comparing them here is what turns a silent drift
  // — a switch that writes a key no engine reads — into a failing check.
  const clientFields = plugin.SETTINGS.map((field) => field.id)
  const hostSource = readFileSync(join(root, 'lib', 'index.js'), 'utf8')
  const declared = /const ALERT_FIELDS = \[([^\]]*)\]/.exec(hostSource)?.[1]
  assert.ok(declared !== undefined, 'the host half must declare ALERT_FIELDS')
  const hostFields = [...declared.matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(clientFields, hostFields, 'both halves must list the same settings')

  for (const field of plugin.SETTINGS) {
    assert.equal(typeof field.labelKey, 'string', `${field.id} needs a label`)
    assert.equal(typeof field.hintKey, 'string', `${field.id} needs a hint`)
    assert.ok(['boolean', 'number'].includes(field.kind), `${field.id} has an unknown kind`)
    assert.equal(plugin.SETTING_DEFAULTS[field.id], field.default)
  }

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
    for (const [field, value] of Object.entries(plugin.SETTING_DEFAULTS)) {
      assert.ok(
        hostSource.includes(`default(${String(value)})`) ||
          hostSource.includes(`default(${String(value).replace('.', '.')})`),
        `${field}: the host schema must default ${String(value)} (checked by source, dependencies absent)`,
      )
    }
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
 * Every switch the row renders.
 *
 * The React stub does not render function components, so a `SettingSwitch` stays
 * an unresolved element in the row's tree; rendering it at its own level with the
 * props the row passed down is exactly what a real browser does, and it keeps the
 * assertion on the component that owns the switch.
 * @param tree - the row's rendered tree.
 * @returns the switch buttons, in order.
 */
function switchButtons(tree) {
  return collectElements(tree)
    .filter((element) => typeof element.type === 'function' && element.type.name === 'SettingSwitch')
    .flatMap((element) => collectElements(element.type(element.props)))
    .filter((element) => element.props?.role === 'switch')
}

/** Every range input the row renders. */
function rangeInputs(tree) {
  return collectElements(tree)
    .filter((element) => typeof element.type === 'function' && element.type.name === 'SettingNumber')
    .flatMap((element) => collectElements(element.type(element.props)))
    .filter((element) => element.props?.type === 'range')
}

{
  const writes = []
  let resets = 0
  let previews = 0
  const settings = plugin.resolveSettings(undefined)
  const tree = plugin.AlertRow({
    t: (key) => key,
    useStore: (selector) => selector({ ...settings, revision: 1 }),
    setField: (field, value) => writes.push([field, value]),
    reset: () => {
      resets += 1
    },
    preview: () => {
      previews += 1
    },
  })

  const switches = switchButtons(tree)
  const ranges = rangeInputs(tree)
  const booleans = plugin.SETTINGS.filter((field) => field.kind === 'boolean')
  const numbers = plugin.SETTINGS.filter((field) => field.kind === 'number')
  assert.equal(switches.length, booleans.length, 'one switch per boolean setting')
  assert.equal(ranges.length, numbers.length, 'one range per numeric setting')

  assert.equal(switches[0].props['aria-checked'], true)
  assert.equal(switches[0].props['aria-label'], 'alert.setting.favicon')
  switches[0].props.onClick()
  assert.deepEqual(writes.at(-1), ['favicon', false], 'the switch writes its own field id')

  // Every switch must render the resolved default, or the row would lie about it.
  for (const [index, field] of booleans.entries()) {
    assert.equal(
      switches[index].props['aria-checked'],
      plugin.SETTING_DEFAULTS[field.id],
      `${field.id} must render its default`,
    )
  }
  const doneIndex = booleans.findIndex((field) => field.id === 'soundDone')
  switches[doneIndex].props.onClick()
  assert.deepEqual(writes.at(-1), ['soundDone', false], 'a switch toggles away from its default')

  // Ranges carry their bounds, so the row cannot offer a value the schema rejects.
  const volume = numbers.findIndex((field) => field.id === 'volume')
  assert.equal(ranges[volume].props.min, 0)
  assert.equal(ranges[volume].props.max, 1)
  assert.equal(ranges[volume].props.value, 0.5)
  ranges[volume].props.onChange({ target: { value: '0.75' } })
  assert.deepEqual(writes.at(-1), ['volume', 0.75])
  const fish = numbers.findIndex((field) => field.id === 'fishScale')
  assert.equal(ranges[fish].props.min, 0.3)
  assert.equal(ranges[fish].props.max, 0.55)

  const preview = collectElements(tree).find((element) => element.props?.className === 'dsh-sentry-preview')
  assert.ok(preview !== undefined, 'the row must offer a preview')
  preview.props.onClick()
  assert.equal(previews, 1)

  const reset = collectElements(tree).find((element) => element.props?.className === 'dsh-sentry-reset')
  assert.ok(reset !== undefined, 'the row must offer a reset')
  reset.props.onClick()
  assert.equal(resets, 1)
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

const ctx = {
  effect: (execute) => {
    const disposer = execute()
    effects.push(typeof disposer === 'function' ? disposer : () => undefined)
    return { dispose: () => undefined }
  },
  on: () => undefined,
  get: () => undefined,
  locale: {
    register: (namespace, dict) => {
      dictionaries.push({ namespace, dict })
      return () => undefined
    },
    bind: () => (key) => key,
  },
  settingsScope: { bind: (spec) => (assert.equal(spec.namespace, 'alert'), scope) },
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
    register: (options, component) => {
      registeredSlots.push({ options, component })
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

  // The app's own favicon link is never touched, and the engine starts quiet. The
  // element is created once and kept; what matters is that it is not *mounted*
  // until there is something to say.
  assert.equal(documentStub.title, 'DeepSeek Harness', 'nothing to report leaves the title alone')
  assert.equal(links.filter((link) => link.parentNode !== null).length, 0, 'and it must not mount an icon')

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

  const icon = links.find((link) => link.getAttribute('data-dsh-sentry-icon') !== undefined)
  assert.ok(icon !== undefined, 'a waiting session must draw the status icon')
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
  assert.equal(
    links.filter((link) => link.getAttribute('data-dsh-sentry-icon') !== undefined).length,
    1,
    'the element is reused rather than re-appended',
  )
  assert.equal(icon.parentNode, null, 'with nothing to report the icon is removed, restoring the app favicon')
  assert.equal(shown(documentStub.title), 'Part one · Part two — DeepSeek Harness', 'and the title prefix comes off')

  // ── the switches ──────────────────────────────────────────────────────────
  const actions = options.inject()
  assert.equal(typeof actions.setField, 'function')
  assert.equal(typeof actions.reset, 'function')
  assert.equal(typeof actions.preview, 'function')

  // A fresh instance must not have kept the stale plan: the settings write
  // re-renders from the live subscriptions.
  sessionState = {
    ids: ['s1'],
    byId: { s1: { id: 's1', blank: false, running: true, completed: false } },
  }
  actions.setField('favicon', true)
  assert.equal(icon.parentNode, head, 'a running session draws the ring again')

  actions.setField('favicon', false)
  assert.equal(icon.parentNode, null, 'the favicon switch removes the icon immediately')
  assert.equal(
    shown(documentStub.title),
    'alert.status.running · Part one · Part two — DeepSeek Harness',
    'while the title switch is still on',
  )

  actions.setField('title', false)
  assert.equal(shown(documentStub.title), 'Part one · Part two — DeepSeek Harness', 'the title switch strips the prefix')

  // The preview must not throw with no Web Audio available.
  actions.preview()

  // Reset clears the stored switches; the defaults bring the visual channels back.
  actions.reset()
  assert.deepEqual(section, {}, 'reset clears the stored switches')

  // Teardown releases the element, and every effect was registered with a label
  // the framework can attribute.
  for (const dispose of effects.reverse()) dispose()
  assert.equal(icon.parentNode, null, 'teardown releases the icon')
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

delete globalThis.document
delete globalThis.MutationObserver
delete globalThis.window

console.log('verify-client: OK — envelope, fish, session model, favicon, title, chime, settings row and engine verified')
console.log(`verify-client: factory required ${requested.join(', ')}`)


