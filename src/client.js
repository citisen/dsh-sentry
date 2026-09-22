/**
 * Browser half of `dsh-sentry` — the tab-page sentry for the DeepSeek Harness
 * Web GUI.
 *
 * The interface already tells you everything you need to know *while you are
 * looking at it*: the sidebar has a state dot per session, the conversation has
 * its own streaming indicators, and the tab has a title. What it cannot tell you
 * is anything at all once the tab is in the background, which is exactly when a
 * long agent turn runs. This plugin answers one question from across the room —
 * *does anything need me?* — through the only three channels a background tab
 * has: its favicon, its title, and its speakers.
 *
 * This file is NOT loaded as an ES module. `scripts/build-client.mjs` wraps it in
 * the DSH client-bundle envelope and writes `lib/client.js`, which is what the
 * Web shell fetches. Keep it dependency-light: the only modules it may `import`
 * are the platform-singleton specifiers the shell seeds into its module table.
 *
 * Why this needs no React and no slot
 * -----------------------------------
 * The state this plugin reacts to is reachable from the cordis context itself:
 * `ctx.sessions.list` and `ctx.uiSession.pendingInteractions` are both
 * `{ getSnapshot(), subscribe() }` observables owned by services the Web
 * composition always installs — the same objects `ui-session` hands to the
 * `useSessions` / `useSessionPendingInteraction` hook seats. So the whole engine
 * is plain DOM plus two subscriptions, and React appears exactly once, in the
 * Settings row, because the slot system is React. That is why this plugin
 * registers no always-mounted component and occupies no global slot: a
 * third-party bundle has fewer ways to collide with the interface when it stays
 * out of the render tree.
 *
 * Every decision is a pure function taking its inputs as arguments — the clock,
 * the storage, the visibility and focus bits, the reduced-motion bit, the note
 * table. `install()` is the only impure part and is deliberately thin.
 * `scripts/verify-client.mjs` drives the pure half in Node, where a regression is
 * a failing check instead of a silently-green favicon.
 *
 * @module dsh-sentry/client
 */

import React from 'react'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { createEditor } from '@citisen/litearea'
import { dshSentryStyleGrammar, readStyleDocument } from './style-grammar.js'

/** Settings namespace owned by this plugin (mirrors the host half). */
const SENTRY_NAMESPACE = 'alert'
/** Locale namespace owning this feature's settings-row copy. */
const LOCALE_NAMESPACE = 'settings.alert'
/** Cosmetic namespace for this plugin's CSS classes. */
const STYLE_PREFIX = 'dsh-sentry'
/**
 * The plugin's identity, substituted with the real package name by
 * `scripts/build-client.mjs`. It tags the stylesheet this plugin owns and heads
 * its diagnostics, so a bundle mounted under another name says so.
 */
const PLUGIN_ID = /* dsh:plugin-id */ 'dsh-sentry'

// ─── the state model ─────────────────────────────────────────────────────────
//
// The four states, and the precedence that decides which one a tab shows, are named
// where the document names them: see `STYLE_STATES` below. The projection that
// computes them from the session services is {@link sessionPlan}, and neither of
// those needs a second copy of the list here.

/**
 * How long a finished session keeps the green "done" signal, by default.
 *
 * Deliberately not the session's `completed` flag: that stays true until the user
 * selects the session, so trusting it would leave the tab green forever and cost
 * the signal all of its meaning. This is a decay window measured from the
 * running → idle edge instead.
 */
const DEFAULT_DONE_WINDOW_MS = 60_000

/**
 * The shortest gap between two chimes, in ms — the shipped `chime-gap`.
 *
 * The value the document ships with, and the one the row shows in the reference. It
 * lives here rather than only in the document text because `resolveStyle` needs it
 * for a document that says nothing.
 */
const SOUND_GAP_MS = 1500

/**
 * The fish, verbatim from the shipped favicon
 * (`dsh-web-frontend/dist/favicon.svg`): a `viewBox="0 0 50 50"` glyph drawn in a
 * single path. Copied byte-for-byte rather than redrawn or simplified — the tab
 * icon is the product's identity, and an approximation of it would be a worse
 * icon than the real thing. `scripts/verify-client.mjs` reads the fish straight
 * out of the active dsh install and fails the check when this copy drifts.
 */
const FISH_PATH =
  '/* dsh:sentry-fish */'

/**
 * The plan used before the first snapshot arrives, so the title observer and the
 * first render have a well-formed value to read.
 */
const EMPTY_PLAN = {
  bySession: new Map(),
  active: [],
  finished: [],
  waiting: 0,
  approval: 0,
  running: 0,
  done: 0,
}

// ─── session state, as a pure projection ─────────────────────────────────────

/**
 * The state a pending interaction puts its session in, if it is one the user
 * must act on.
 *
 * The wire kinds are `'question'` and `'approval'`; the states are `'waiting'`
 * and `'approval'`. The rename is deliberate rather than incidental: "waiting"
 * is what the *user* is doing, and the tab can only be about the user. Keeping
 * the wire word here would leak the domain's vocabulary into the icon.
 *
 * @param entry - the pending-interaction entry for that session, if any.
 * @returns `'waiting'`, `'approval'`, or undefined.
 */
function blockedKind(entry) {
  const kind = typeof entry === 'string' ? entry : entry?.kind
  if (kind === 'question') return 'waiting'
  // A plan review is the same demand on the user as an approval — the tab says
  // "this will not move until you look", not which of the two it is — and the
  // wire kind arrived with 0.1.7 while the other two names stayed as they were.
  if (kind === 'approval' || kind === 'plan-review') return 'approval'
  return undefined
}

/**
 * What every session is doing, and which of them the user must act on.
 *
 * The precedence is the whole point: a session that is running *and* waiting for
 * an answer is waiting, because the running part is not the part that needs the
 * user. `done` is derived from an edge rather than from `summary.completed` — see
 * {@link DEFAULT_DONE_WINDOW_MS}.
 *
 * A blank session (created and never used) is not information and is left out
 * entirely; otherwise opening a new tab would immediately paint a "1 running"
 * ring around an empty conversation.
 *
 * @param list - the session-list snapshot (`{ ids, byId }`).
 * @param pending - the pending-interaction snapshot, `SessionId -> entry`.
 * @param stamps - `SessionId -> running → idle edge timestamp`, persisted.
 * @param options - `{ now, doneWindowMs }`.
 * @returns the plan: per-session states, counts, and the fresh completions.
 */
function sessionPlan(list, pending, stamps, options) {
  const { now, doneWindowMs } = options
  const bySession = new Map()
  const finished = []
  const active = []

  for (const id of list?.ids ?? []) {
    const summary = list?.byId?.[id]
    if (summary === undefined || summary.blank === true) continue

    let state
    let fresh = false
    const kind = blockedKind(pending?.get?.(id))
    if (kind !== undefined) {
      state = kind
    } else if (summary.running === true) {
      state = 'running'
    } else {
      const stamp = stamps?.[id]
      if (typeof stamp === 'number' && now - stamp < doneWindowMs) {
        state = 'done'
        fresh = true
      }
    }
    if (state === undefined) continue

    bySession.set(id, { state, fresh })
    active.push(id)
    if (fresh) finished.push(id)
  }

  /** @param state - the state to count. @returns how many sessions are in it. */
  const count = (state) => active.filter((id) => bySession.get(id).state === state).length

  return {
    bySession,
    active,
    finished,
    waiting: count('waiting'),
    approval: count('approval'),
    running: count('running'),
    done: count('done'),
  }
}

/**
 * State changes between two plans that are worth an alert.
 *
 * Edge-triggered, never level-triggered: a session that was already waiting for
 * an answer does not chime again on every unrelated store notification. The
 * previous plan is the baseline, so restarting the plugin treats what is already
 * on screen as known rather than shouting about it again.
 *
 * @param prev - the previous plan, or undefined before the first snapshot.
 * @param next - the current plan.
 * @returns `{ questions, approvals, completed }` session-id lists.
 */
function changeAlerts(prev, next) {
  /** @param state - the state to diff. @returns ids that entered it. */
  const entered = (state) =>
    next.active.filter(
      (id) => next.bySession.get(id).state === state && prev?.bySession?.get(id)?.state !== state,
    )
  return {
    questions: entered('waiting'),
    approvals: entered('approval'),
    completed: next.finished.filter((id) => prev?.bySession?.get(id)?.state !== 'done'),
  }
}

/**
 * Whether anything at all deserves the user's attention.
 * @param plan - the session plan.
 * @returns whether the favicon or the title should say something.
 */
function planHasSignal(plan) {
  return plan.waiting + plan.approval + plan.running + plan.done > 0
}

// ─── the style document ──────────────────────────────────────────────────────

/**
 * The style document: one text file that decides how the four states look *and*
 * what they sound like.
 *
 * A tab icon is not a form: it is four states, each a colour, a background shape,
 * a motion, and a chime, and the interesting part is the *combinations*. A dozen
 * switches could express that; they would also take a dozen interactions to say
 * what one block says, and the sound half of them would only make sense next to
 * the appearance half. So the whole configuration is one document, and the
 * settings row gives it an editor, a live preview of every state, and the list of
 * anything it gets wrong.
 *
 * Every property is named. There is no positional slot and no word that means one
 * thing in one place and something else elsewhere:
 *
 *   // document settings first, one per line
 *   icon on
 *   sound background
 *   keep-done 60s
 *
 *   waiting {
 *     shape rounded
 *     color amber
 *     motion blink
 *     speed 1.1s
 *     chime A5 E6
 *   }
 *
 * The reader is total: a line it does not understand is reported and left out, and
 * the shipped default stands in for that one property. A typo in a settings file
 * must not be able to leave a tab without an icon.
 *
 * @module dsh-sentry/style
 */

/** The background shapes a block may name. */
const SHAPES = ['circle', 'rounded', 'square', 'none']

/** The motions a block may apply. */
const MOTIONS = ['still', 'turn', 'blink', 'pulse']

/**
 * The words a property takes that are not a shape, a colour, or a motion.
 *
 * `on` and `off` are what `icon` and `title` read; `background` and `always` are
 * what `sound` reads, and `off` is also how a state says it has no chime. One word
 * per meaning: there is no `none` here, because `none` is a shape.
 */
const MODES = ['on', 'off', 'background', 'always']

/**
 * The preset palette. Colours are named rather than free-form because the two
 * failures this plugin has already shipped were both contrast failures — a white
 * fish on a light disc, and a black fish on a dark one — and a free colour picker
 * gives the user a way to reproduce them. A preset cannot be illegible.
 */
const PRESET_COLORS = {
  blue: '#4d6bfe',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#8b8f97',
  dark: '#23262c',
  light: '#eef0f3',
}

/**
 * The four states a block may open, most urgent first — the order the row shows them.
 *
 * `waiting` and `approval` are the two halves of "a human must act": the agent asked
 * a question (`ask_user_question`, which includes the plan-review card) or requested
 * a permission escalation. They are separate states because they want different
 * sounds, and because a session blocked on approval and a session blocked on a
 * question are different situations to come back to. The order is the precedence
 * {@link activeLook} applies to a tab, which can only show one of them at a time.
 */
const STYLE_STATES = ['waiting', 'approval', 'running', 'done']

/** The properties a block accepts, in the order the reference lists them. */
const STYLE_STATE_KEYS = ['shape', 'color', 'motion', 'speed', 'chime', 'volume']

/** The document-level settings, in the order the reference lists them. */
const STYLE_GLOBAL_KEYS = ['icon', 'title', 'sound', 'chime-gap', 'keep-done', 'volume']

/**
 * The states something can be *said* about.
 *
 * Three of the four states have an event behind them — a question arrives, an
 * approval arrives, a turn ends — and `running` has none: a turn starting is not
 * something this plugin interrupts anyone for. A `chime` or a `volume` written in
 * a `running` block is therefore reported as inert rather than kept in silence.
 */
const CHIME_STATES = ['waiting', 'approval', 'done']

/** The note names a `chime` completion offers. Any equal-tempered name is accepted. */
const STYLE_NOTE_SUGGESTIONS = ['A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'E6']

/** The slowest and fastest motion rate a document may name, in seconds per cycle. */
const SPEED_MIN = 0.2
const SPEED_MAX = 20

/** The longest chime gap and completed window a document may name, in seconds. */
const GAP_MAX = 600
const DONE_MAX = 600

/**
 * The loudness a chimed state plays at when nothing in the document says otherwise.
 *
 * There is no per-state loudness hidden in here, and that is the point: an earlier
 * version paired a document-level master with an engine-side factor per state, so a
 * reader who wrote `volume 1` and saw `85%` on one card and `45%` on another had no
 * line anywhere to trace those numbers to. Now a loudness is either a line of the
 * document — the `volume` at the top, or the one in the state's own block — or this
 * constant, which the row marks as the default when it is what applies.
 */
const DEFAULT_VOLUME = 0.5

/**
 * What each property of the document reads.
 *
 * The table is the document's type system, and the reader and the engine share it — a
 * value the reader accepted is a value the engine can use without checking it again.
 *
 * `states` marks a property that only means something for some states; `suggest` is
 * what a completion offers for a value whose set is open.
 */
const STYLE_SPEC = {
  icon: { kind: 'word', words: ['on', 'off'] },
  title: { kind: 'word', words: ['on', 'off'] },
  sound: { kind: 'word', words: ['off', 'background', 'always'] },
  'chime-gap': { kind: 'duration', min: 0, max: GAP_MAX, suggest: ['0s', '0.5s', '1s', '1.5s', '3s'] },
  'keep-done': { kind: 'duration', min: 0, max: DONE_MAX, suggest: ['0s', '15s', '30s', '1m', '5m'] },
  shape: { kind: 'word', words: SHAPES },
  color: { kind: 'word', words: Object.keys(PRESET_COLORS) },
  motion: { kind: 'word', words: MOTIONS },
  speed: { kind: 'duration', min: SPEED_MIN, max: SPEED_MAX, suggest: ['0.5s', '1s', '1.5s', '2s', '3s', '5s'] },
  chime: { kind: 'chime', states: CHIME_STATES },
  volume: { kind: 'number', min: 0, max: 1, states: CHIME_STATES, suggest: ['0', '0.25', '0.5', '0.75', '1'] },
}

/** The vocabulary the reader and the editor are both built from. */
const STYLE_DOCUMENT_OPTIONS = {
  states: STYLE_STATES,
  keys: { global: STYLE_GLOBAL_KEYS, state: STYLE_STATE_KEYS },
  spec: STYLE_SPEC,
}

/** What an unconfigured install draws and plays. */
const DEFAULT_STYLE = [
  '// dsh-sentry: how each session state looks and sounds.',
  '// Durations are seconds unless a unit is written: 1.5s, 300ms, 2m.',
  '',
  'icon on',
  'title on',
  'sound background',
  'chime-gap 1.5s',
  'keep-done 60s',
  'volume 0.5',
  '',
  'waiting {',
  '  shape rounded',
  '  color amber',
  '  motion blink',
  '  speed 1.1s',
  '  chime A5 E6',
  '}',
  '',
  'approval {',
  '  shape rounded',
  '  color amber',
  '  motion blink',
  '  speed 1.9s',
  '  chime A5',
  '  volume 0.45',
  '}',
  '',
  'running {',
  '  shape circle',
  '  color blue',
  '  motion turn',
  '  speed 3s',
  '}',
  '',
  'done {',
  '  shape circle',
  '  color green',
  '  motion pulse',
  '  speed 1.6s',
  '  chime A4',
  '  volume 0.25',
  '}',
].join('\n')

/**
 * Coerce one block's written values into something drawable.
 *
 * Almost nothing happens here, and that is the point: the reader that produced
 * `rule` already refused every value it could not read, with a diagnostic, so what
 * is left is a choice per property between what the document wrote and the shipped
 * default. A property the document got wrong is not in the rule at all, which is
 * what makes a typo degrade to the shipped appearance rather than to a broken SVG.
 *
 * @param rule - the block as read, or undefined when the document has no block.
 * @param defaults - the shipped look for that state.
 * @returns the resolved look.
 */
function resolveLook(rule, defaults) {
  if (rule === undefined) return { ...defaults }
  return {
    shape: rule.shape ?? defaults.shape,
    color: rule.color ?? defaults.color,
    motion: rule.motion ?? defaults.motion,
    speed: rule.speed ?? defaults.speed,
  }
}

/**
 * The shipped look per state, before any document is applied.
 *
 * These are the defaults the documentation quotes, and the ones a block inherits
 * property by property: naming only a colour in a block keeps the shipped shape,
 * motion, and rate for that state.
 *
 * `running` turns the **fish**, not a pattern. A dial-like ring of spokes was tried
 * and read as a watch face rather than as a state; the fish is the thing this icon
 * is about, so the fish is the thing that moves.
 */
const DEFAULT_LOOK = {
  waiting: { shape: 'rounded', color: 'amber', motion: 'blink', speed: 1.1 },
  approval: { shape: 'rounded', color: 'amber', motion: 'blink', speed: 1.9 },
  running: { shape: 'circle', color: 'blue', motion: 'turn', speed: 3 },
  done: { shape: 'circle', color: 'green', motion: 'pulse', speed: 1.6 },
}

/**
 * The shipped chime per state, before any document is applied.
 *
 * The notes only, deliberately. A state's loudness is a `volume` line — the document's
 * default or its own block's — and keeping a third set of numbers here is how the row
 * came to print figures that were in no document at all.
 */
const DEFAULT_CHIME = {
  waiting: { labels: ['A5', 'E6'], frequencies: [880, 1318.51] },
  approval: { labels: ['A5'], frequencies: [880] },
  done: { labels: ['A4'], frequencies: [440] },
}

/** The shipped document-level settings. */
const DEFAULT_GLOBALS = {
  icon: true,
  title: true,
  sound: 'background',
  chimeGapMs: SOUND_GAP_MS,
  keepDoneMs: DEFAULT_DONE_WINDOW_MS,
  volume: DEFAULT_VOLUME,
}

/**
 * Resolve the document's own settings.
 * @param written - the values the document wrote at the top level.
 * @returns every document setting, with the shipped value filled in.
 */
function resolveGlobals(written) {
  return {
    icon: written.icon !== 'off',
    title: written.title !== 'off',
    sound: written.sound ?? DEFAULT_GLOBALS.sound,
    chimeGapMs: Math.round((written['chime-gap'] ?? DEFAULT_GLOBALS.chimeGapMs / 1000) * 1000),
    keepDoneMs: Math.round((written['keep-done'] ?? DEFAULT_GLOBALS.keepDoneMs / 1000) * 1000),
    volume: written.volume ?? DEFAULT_VOLUME,
  }
}

/**
 * Resolve the chimes a document asks for.
 *
 * A state is in `channels` exactly when it has something to play, so `chime off`
 * removes the entry rather than marking it silent — one thing to check at play time
 * instead of two.
 *
 * A state's loudness is its own `volume` line, or the document's, and **never a
 * product of the two**: both spellings are the same kind of number, so the percentage
 * the row prints is always one a reader can find by reading the document. `unstated`
 * marks the single case where that is not true — no `volume` anywhere — and the row
 * says so rather than printing a figure with no source.
 *
 * @param written - the values the document wrote at the top level.
 * @param rules - the blocks as read.
 * @returns `{ when, gapMs, channels }`.
 */
function resolveSound(written, rules) {
  const channels = {}
  for (const state of CHIME_STATES) {
    const block = rules[state]
    const chosen = block?.chime
    if (chosen !== undefined && chosen.silent === true) continue
    const spec = chosen ?? DEFAULT_CHIME[state]
    const written_ = block?.volume ?? written.volume
    channels[state] = {
      labels: spec.labels,
      frequencies: spec.frequencies,
      gain: round2(written_ ?? DEFAULT_VOLUME),
      unstated: written_ === undefined,
    }
  }
  return {
    when: written.sound ?? DEFAULT_GLOBALS.sound,
    gapMs: Math.round((written['chime-gap'] ?? DEFAULT_GLOBALS.chimeGapMs / 1000) * 1000),
    channels,
  }
}

/**
 * Resolve a whole document against the shipped defaults.
 *
 * The single entry point for both halves of the plugin: the engine draws from
 * `look`, plays from `sound`, and schedules from `globals`, while the settings row
 * prints `problems` and previews the same `look`. Reading it twice would be reading
 * it two ways.
 *
 * @param text - the document.
 * @returns `{ look, globals, sound, problems, document }` — a resolved appearance
 *   per state, the resolved document settings, the resolved chimes, and every
 *   problem the reader found.
 */
function resolveStyle(text) {
  const document = readStyleDocument(text, STYLE_DOCUMENT_OPTIONS)
  const look = {}
  for (const state of STYLE_STATES) {
    look[state] = resolveLook(document.rules[state], DEFAULT_LOOK[state])
  }
  const globals = resolveGlobals(document.globals)
  return {
    look,
    globals,
    sound: resolveSound(document.globals, document.rules),
    problems: document.problems,
    document,
  }
}

// ─── the primitives ──────────────────────────────────────────────────────────


/**
 * The background's outline, as a shape the mask can start from.
 *
 * The background is always drawn white here — it is the mask's "keep this" area —
 * and the caller paints the real colour through it.
 *
 * @param look - the resolved appearance.
 * @returns the SVG shape element.
 */
function backgroundShape(look) {
  const color = PRESET_COLORS[look.color] ?? PRESET_COLORS.gray
  if (look.shape === 'none') return ''
  if (look.shape === 'rounded') {
    return `<rect x="0.8" y="0.8" width="30.4" height="30.4" rx="8" fill="${color}"/>`
  }
  if (look.shape === 'square') {
    return `<rect x="0.8" y="0.8" width="30.4" height="30.4" rx="4" fill="${color}"/>`
  }
  return `<circle cx="16" cy="16" r="15.2" fill="${color}"/>`
}

/**
 * The motion for one look, as a **static** animation element.
 *
 * There is none, and that is a finding rather than an omission. A favicon is
 * rendered in a document this plugin does not own, and the motion categories do
 * not have equal standing there: the first version of this declared a
 * `<animateTransform>` for the spin and a presentation animation for the pulse,
 * and the spin was reported as "the animation does not move" while the pulse
 * worked. Every motion is therefore a {@link motionTick} the plugin drives, which
 * is one code path for all of them instead of a per-motion bet on what the
 * browser's favicon document supports.
 *
 * @param look - the resolved appearance.
 * @param reducedMotion - whether the user asked for less movement.
 * @returns the SVG animation element, or `''`.
 */
function motionElement(look, reducedMotion) {
  return ''
}

/** How often a driven motion repaints, in milliseconds. */
const TICK_MS = 120

/**
 * The colour a `pulse` moves toward.
 *
 * Green pulses toward blue and everything else toward green, which keeps the two
 * states that use `pulse` visibly different from each other without a second
 * palette: a change of colour is what says "something is happening".
 * @param name - the preset name.
 * @returns the partner hex.
 */
function pulsePartner(name) {
  return name === 'green' ? PRESET_COLORS.blue : PRESET_COLORS.green
}

/**
 * What one repaint of a driven motion looks like.
 *
 * The result is handed straight to {@link sentryFavicon}, which makes a motion a
 * function from a tick count to an appearance and nothing else — and therefore
 * verifiable in Node, with no browser and no clock: `blink` dims on alternate
 * half-periods, `pulse` alternates the colour once per period, and `turn` steps
 * the angle. Every rate is expressed in the seconds the document's `speed` already
 * means, so a block that says `speed 1.1s` gets a 1.1-second breath.
 *
 * @param look - the resolved appearance.
 * @param tick - a monotonically increasing tick count.
 * @returns `{ angle, dim, color }` overrides for the draw.
 */
function motionTick(look, tick) {
  if (look.motion === 'blink') {
    // `speed` is seconds per full breath, so the dim half lasts half of it.
    const halfTicks = Math.max(1, Math.round(((look.speed * 1000) / 2) / TICK_MS))
    return { dim: Math.floor(tick / halfTicks) % 2 === 1 }
  }
  if (look.motion === 'pulse') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return {
      color: Math.floor(tick / ticks) % 2 === 1 ? pulsePartner(look.color) : PRESET_COLORS[look.color],
    }
  }
  if (look.motion === 'turn') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return { angle: round2(((tick % ticks) / ticks) * 360) }
  }
  return {}
}

/**
 * How long one repaint interval lasts for a look, or undefined for a still one.
 *
 * Every motion is driven, `turn` included. The declarative transform animation is
 * not used for the shipped appearance: it was the one that did not move, and a
 * favicon is drawn in a document this plugin does not own, where the motion
 * categories do not have equal standing. A timer for as long as something is
 * animating is a small price for a motion that cannot silently do nothing.
 *
 * @param look - the resolved appearance.
 * @param reducedMotion - whether the user asked for less movement.
 * @returns the interval in milliseconds, or undefined.
 */
function tickInterval(look, reducedMotion) {
  if (reducedMotion || look.motion === 'still') return undefined
  return TICK_MS
}

// ─── the favicon ─────────────────────────────────────────────────────────────

/**
 * Round to two decimals, so float noise like `5.6000000000000005` does not reach
 * a data URL that is rebuilt on every state change.
 * @param value - the number.
 * @returns the rounded number.
 */
function round2(value) {
  return Math.round(value * 100) / 100
}
/**
 * The art's own canvas, in its own units.
 *
 * The shipped favicon is a `viewBox="0 0 50 50"` drawing — its path data reaches
 * 49.37 — so the fish's centre is at 25 in its own space, and its full size in the
 * 32px canvas is `32/50`. Both numbers come from this one constant, because
 * conflating them is the bug it exists to end: the placement used to centre the art
 * as if it were a 32-unit drawing, which pushed the fish 5.76px down and to the right
 * at full size — the bottom-right corner of the rounded square it was reported from —
 * and cut its nose and tail off against the rim.
 */
const FISH_ART_EXTENT = 50

/**
 * The fish's own scale: a 50-unit drawing placed at full size in a 32px canvas.
 *
 * This is the whole point of the icon. At the 0.416 the first version used, the
 * fish occupied 41% of the canvas and the ring took the rest — measured on a real
 * 16px favicon that is a ~5-pixel glyph inside a nearly-invisible ring, which is
 * what "both are unclear" meant. At full size the fish *is* the icon.
 *
 * One consequence is worth stating: the art is wider than it is tall, so at full
 * size it reaches the background's edge. The fish is carved rather than painted
 * precisely so that this is legible rather than cramped — there is no stroke to
 * collide with, only the tab bar showing through.
 */
const FISH_FULL_SCALE = 32 / FISH_ART_EXTENT

/**
 * The art's largest half-extent, in its own 50-unit space.
 *
 * Measured from the path's own bounding box in a browser — 48.34 wide by 36.32
 * tall, centred at (25.17, 25.16) — rather than assumed. Half of the larger axis
 * is how far the glyph reaches from its centre, and that is the number a rotation
 * has to fit inside the background.
 */
const FISH_HALF_EXTENT = 24.17

/**
 * The radius the turning fish is allowed to sweep, in canvas units.
 *
 * The background's edge is at 15.2, and this leaves a little air so the glyph
 * never touches the rim mid-turn.
 */
const FISH_TURN_RADIUS = 14.3

/**
 * How much the fish shrinks when it turns.
 *
 * A wide glyph rotating about its centre sweeps a circle of its larger half-extent,
 * so at full size this fish would reach `24.17 × 0.64 ≈ 15.5` — past the
 * background's 15.2 edge, clipping twice per revolution, which at 16px reads as a
 * flicker rather than as a turn. Deriving the scale from the measured extent keeps
 * the glyph as large as it can be while staying inside, and means the constant
 * cannot drift away from the art it was computed for.
 *
 * The alternative — keep it full size and let it clip — was rejected: the whole
 * point of carving the fish is that its silhouette is always complete.
 */
const FISH_TURN_SCALE = round2(FISH_TURN_RADIUS / (FISH_HALF_EXTENT * FISH_FULL_SCALE))

/**
 * The radius the turning fish actually sweeps at that scale.
 *
 * This is the number that must stay inside the background, so it is named and
 * checked rather than left as a claim in a comment.
 */
const FISH_SWEPT_RADIUS = round2(FISH_HALF_EXTENT * FISH_FULL_SCALE * FISH_TURN_SCALE)



/**
 * The appearance the icon is drawn with right now.
 *
 * One tab has one background, so the dominant state decides the whole icon — and
 * the most urgent fact is the one worth it: a question outranks a busy tab,
 * because "someone is waiting for you" is not something a spinner should be able
 * to hide.
 *
 * @param plan - the session plan.
 * @param style - the resolved styles, or undefined for the shipped ones.
 * @returns the look to draw.
 */
function activeLook(plan, style) {
  const look = style ?? DEFAULT_LOOK
  const blocking = plan.waiting > 0 ? 'waiting' : plan.approval > 0 ? 'approval' : undefined
  const state = blocking ?? (plan.running > 0 ? 'running' : 'done')
  return look[state] ?? DEFAULT_LOOK[state]
}

/**
 * The favicon, as an SVG string: a state-coloured background with the fish carved
 * out of it.
 *
 * The fish is **negative space**, not a painted glyph. That decision is what makes
 * the icon work at 16px: the silhouette is the tab bar showing through, so it is
 * legible against any background colour, in any browser theme, and never competes
 * with the background for contrast. Painting it instead produced a white shape on
 * a coloured disc whose edges smeared at favicon size, and a black shape on a dark
 * disc that vanished entirely.
 *
 * @param plan - the session plan.
 * @param options - `{ reducedMotion, style, motion }`, where `style` is the
 *   resolved look per state from {@link resolveStyle} and `motion` is the
 *   per-tick override from {@link motionTick}.
 * @returns the SVG source, or undefined when there is nothing to show.
 */
function sentryFavicon(plan, options) {
  if (!planHasSignal(plan)) return undefined
  const { reducedMotion, style, motion = {} } = options
  const chosen = activeLook(plan, style)

  // The fish, centred by construction: the scale takes the art from its own units to
  // canvas units, and the translate adds exactly the margin that puts the art's own
  // centre — 25 in its own space, not 16 — on the canvas centre. Both of those numbers
  // come from `FISH_ART_EXTENT`, so no margin arithmetic can drift them apart.
  //
  // A `turn` rotates the fish itself, about the canvas centre. That is the state
  // indicator the running state gets: the icon is *about* this glyph, so the glyph
  // is what moves, and nothing else has to be drawn to say "working". The scale
  // drops a little while it turns so the swept corners stay inside the background
  // (see {@link FISH_TURN_SCALE}).
  const spin = motion.angle === undefined || motion.angle === 0 ? 0 : round2(motion.angle)
  const scale = spin === 0 ? FISH_FULL_SCALE : FISH_FULL_SCALE * FISH_TURN_SCALE
  const shift = round2(16 - (FISH_ART_EXTENT / 2) * scale)
  const placed = `translate(${String(shift)} ${String(shift)}) scale(${String(scale)})`
  const fish = `<g transform="${placed}"><path d="${FISH_PATH}" fill="#000" fill-rule="nonzero"/></g>`

  // The mask is the background: everything drawn on it in black is carved out, so
  // the fish is negative space and its silhouette is always the tab bar showing
  // through. Rotating it here rather than on the painted layer is what keeps the
  // background's outline still — a turning background would read as a spinning
  // badge, not as a working fish.
  const carvings = spin === 0 ? fish : `<g transform="rotate(${String(spin)} 16 16)">${fish}</g>`

  const mask =
    `<mask id="disc" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">` +
    `<rect x="0" y="0" width="32" height="32" fill="#000"/>${backgroundShape(chosen)}${carvings}</mask>`

  // The badge is painted rather than carved: it is the one mark that must stay
  // readable on a tab bar of any colour, so it wears its own keyline.
  const badge =
    plan.waiting >= 1 && plan.waiting <= 3
      ? `<circle cx="26.6" cy="5.4" r="5.4" fill="${PRESET_COLORS.amber}" stroke="#0b0d10" stroke-width="1"/>` +
        `<text x="26.6" y="8.4" font-size="9" font-weight="700" text-anchor="middle" fill="#0b0d10">${plan.waiting}</text>`
      : ''

  // A driven motion dims the whole icon; SMIL would have animated `opacity`, and
  // this is the same idea expressed as a value the caller computes.
  const dimmed = motion.dim === true
  const paint = motion.color ?? PRESET_COLORS[chosen.color] ?? PRESET_COLORS.gray

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<defs>${mask}</defs>` +
    `<g${dimmed ? ' opacity="0.3"' : ''}>${motionElement(chosen, reducedMotion)}` +
    `<rect x="0" y="0" width="32" height="32" fill="${paint}" mask="url(#disc)"/>` +
    `</g>` +
    badge +
    `</svg>`
  )
}

/**
 * The same SVG as a usable favicon `href`.
 *
 * The whole document is percent-encoded rather than hand-escaping the characters
 * that look dangerous. Hand-escaping is a losing game here: the SVG carries a `#`
 * inside the fish's own path data, and a substitution that misses one instance
 * produces a data URL the browser truncates at that point — an icon that renders
 * as half a fish.
 *
 * @param svg - the SVG source.
 * @returns the `data:` URI.
 */
function faviconHref(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ─── the title ───────────────────────────────────────────────────────────────

/**
 * Splits a `status · rest` prefix off a title.
 *
 * Matched by *shape* rather than by an exact string, because what has to come off
 * is whatever prefix an earlier render or an earlier instance of this plugin
 * wrote — which may be a different status, in either language. The shape is: an
 * optional circled digit, a run of status text, then the separator. The class
 * stops at `—` as well as at `·` so it can never run across the whole title, and
 * `([^·—]*?)` is lazy so a status that contains its own inner ` · ` (the waiting
 * and approval counts are joined by one) still matches the whole prefix.
 */
const TITLE_PREFIX = /^(?:[①-⑨]\s*)?[^·—]+?\s·\s/

/**
 * The marker this plugin puts at the end of a title it has composed.
 *
 * A zero-width space: invisible in the tab, and — because nothing else writes one
 * — an unambiguous signature. Without it there is no way to tell "the plugin
 * installed this prefix" from "the app's own title happens to contain a ` · `",
 * and the difference decides whether removing the prefix removes the plugin's
 * contribution or a real segment of the app's title.
 *
 * Appended rather than prepended so it never shifts the text the user reads.
 */
const TITLE_MARK = '\u200b'

/** The circled digits the waiting count is capped at, so the prefix never wraps. */
const WAITING_GLYPH = '①②③'

/**
 * The status segment for a plan, or `''` when there is nothing to say.
 * @param plan - the session plan.
 * @param t - the translator, so the title language follows the interface.
 * @returns the segment text.
 */
function titleStatus(plan, t) {
  const parts = []
  if (plan.waiting > 0) {
    const glyph = WAITING_GLYPH[Math.min(plan.waiting, WAITING_GLYPH.length) - 1]
    parts.push(`${glyph} ${t('alert.status.waiting')}`)
  }
  if (plan.approval > 0) parts.push(t('alert.status.approval'))
  if (parts.length > 0) return parts.join(' · ')
  if (plan.running > 0) return t('alert.status.running')
  if (plan.done > 0) return t('alert.status.done')
  return ''
}

/**
 * The title with a status segment in front of it, or unchanged.
 *
 * **Additive only.** Stripping belongs to {@link applyTitle}, where the marker
 * makes "this is my prefix" decidable; a strip here would be a guess, and a guess
 * here is destructive — judged by the `status · rest` shape, an app title that
 * happens to contain a ` · ` looks exactly like a prefix, and every render would
 * eat one more real segment of it.
 *
 * @param current - the app's own title text, without this plugin's prefix.
 * @param plan - the session plan.
 * @param t - the translator.
 * @returns the title to write, or `current` when there is no status to add.
 */
function titleWithStatus(current, plan, t) {
  const base = typeof current === 'string' ? current : ''
  const status = titleStatus(plan, t)
  if (status === '') return base
  return `${status} · ${base}`
}

// ─── the sound ───────────────────────────────────────────────────────────────

/**
 * The chime is synthesized, and the notes it plays come from the document.
 *
 * The document names notes, not waveforms: `chime A5 E6` is a rising interval, and
 * these two constants decide how a sequence of notes becomes a sound. They are
 * deliberately not part of the language — a chime is a chime, and a document that
 * had to spell out a per-note envelope would be a synthesizer patch rather than a
 * notification setting.
 */

/** How far apart two notes of one chime start, in milliseconds. */
const CHIME_STAGGER_MS = 90

/** How long one note rings, in milliseconds. */
const CHIME_NOTE_MS = 130

/**
 * One state's chime as a list of notes to schedule.
 *
 * @param frequencies - the frequencies the document named, in the order written.
 * @returns `{ frequency, startMs, durationMs }` per note.
 */
function chimeNotes(frequencies) {
  return frequencies.map((frequency, index) => ({
    frequency,
    startMs: index * CHIME_STAGGER_MS,
    durationMs: CHIME_NOTE_MS,
  }))
}

/**
 * Which chime, if any, may sound right now.
 *
 * Three rules, all deliberate and all easy to get wrong:
 *
 * - **The document decides whether sound is on at all.** `sound off` silences
 *   everything, `sound background` (the shipped value) chimes only while this page
 *   is hidden or unfocused, and `sound always` chimes regardless. The reasoning
 *   behind the default: while the user is looking at the interface the favicon and
 *   the title have already said it, and a chime on top of that is noise.
 * - **One sound per burst.** Agents ask several questions in a row; three chimes in
 *   three seconds reads as a malfunction. The gap is measured against a
 *   caller-supplied clock instead of a timer, because a background tab throttles
 *   `setTimeout` to the minute and a timer-based gap would fire late or not at all.
 * - **A state with no chime is skipped, not silencing.** `chime off` in the
 *   `waiting` block must not suppress the approval that arrives in the same burst,
 *   which is why this walks the three events in order and takes the first one that
 *   has both an alert and a sound.
 *
 * @param alerts - the alert set from {@link changeAlerts}.
 * @param sound - the resolved chime configuration.
 * @param state - `{ now, lastSoundAt, hidden, focused }`.
 * @returns `{ channel, labels, frequencies, gain }`, or undefined for silence.
 */
function soundPlan(alerts, sound, state) {
  if (sound.when === 'off') return undefined
  if (sound.when === 'background' && !state.hidden && state.focused) return undefined
  if (typeof state.lastSoundAt === 'number' && state.now - state.lastSoundAt < sound.gapMs) {
    return undefined
  }
  /** The three events, most urgent first. */
  const events = [
    ['waiting', alerts.questions],
    ['approval', alerts.approvals],
    ['done', alerts.completed],
  ]
  for (const [channel, list] of events) {
    const chosen = sound.channels[channel]
    if (list.length > 0 && chosen !== undefined) return { channel, ...chosen }
  }
  return undefined
}

/**
 * A synthetic chime player over Web Audio, or a silent one when the browser has
 * no Web Audio at all.
 *
 * The browser's autoplay policy is the constraint that shapes this class: before
 * any user gesture the context is created suspended, and `resume()` alone is not
 * enough to make it audible. A chime requested in that window is *dropped* rather
 * than queued — a chime that arrives two minutes late, after the click that
 * finally unlocked audio, is worse than no chime. The settings row's preview
 * buttons exist partly to be the gesture that unlocks this for the session.
 *
 * @param options - `{ AudioContextClass }`, injectable so the tests can drive a fake.
 * @returns the player: `{ play, resume, dispose }`.
 */
function createChime(options) {
  const { AudioContextClass } = options
  let context

  /** Build the context lazily, and never let a construction failure escape. */
  const ensure = () => {
    if (context !== undefined) return context
    if (AudioContextClass === undefined) return undefined
    try {
      context = new AudioContextClass()
    } catch {
      context = undefined
    }
    return context
  }

  const player = {
    /** Ask the browser to start the clock. Safe to call any time, any number of times. */
    resume() {
      const audio = ensure()
      if (audio === undefined) return
      try {
        if (audio.state === 'suspended') void audio.resume()
      } catch {
        /* a refused resume is the autoplay policy, not an error worth surfacing */
      }
    },

    /**
     * Play one chime, if the context is running.
     * @param frequencies - the notes to schedule, in the order written.
     * @param gain - the loudness to play them at, 0 to 1.
     * @returns whether a sound was actually scheduled.
     */
    play(frequencies, gain) {
      const audio = ensure()
      if (audio === undefined) return false
      player.resume()
      if (audio.state === 'suspended') return false
      const notes = chimeNotes(frequencies ?? [])
      const level = typeof gain === 'number' ? gain : DEFAULT_VOLUME
      const startedAt = audio.currentTime
      for (const note of notes) {
        const begin = startedAt + note.startMs / 1000
        const end = begin + note.durationMs / 1000
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(note.frequency, begin)
        // A bare gate on a sine wave clicks; a short attack and a longer release
        // is what makes it read as a chime rather than as a pop.
        envelope.gain.setValueAtTime(0, begin)
        envelope.gain.linearRampToValueAtTime(level, begin + 0.012)
        envelope.gain.exponentialRampToValueAtTime(0.0001, end)
        oscillator.connect(envelope)
        envelope.connect(audio.destination)
        oscillator.start(begin)
        oscillator.stop(end + 0.02)
      }
      return notes.length > 0
    },

    /** Release the audio hardware. */
    dispose() {
      const audio = context
      context = undefined
      if (audio === undefined) return
      try {
        void audio.close()
      } catch {
        /* already closed, or the browser refuses; nothing to do */
      }
    },
  }
  return player
}

// ─── persistence ─────────────────────────────────────────────────────────────

/** The `localStorage` key holding the running → idle edge timestamps. */
const STAMPS_KEY = 'dsh-sentry:done'

/**
 * Wrap a `Storage`, or any object with the same two methods, so a hostile or
 * absent storage cannot break the plugin.
 *
 * `localStorage` throws on access in some privacy configurations and holds
 * garbage when another tab wrote it, and a background tab's timers are throttled
 * enough that memory-only bookkeeping loses the completion edge the moment the
 * bundle reloads. So the storage is used when it works and remembered in memory
 * when it does not — never trusted.
 *
 * @param storage - the underlying storage, if any.
 * @returns `{ readStamps, writeStamps }`.
 */
function createStampStore(storage) {
  let memory
  return {
    /** @returns the persisted `SessionId -> timestamp` map, or `{}`. */
    readStamps() {
      if (storage === undefined) return memory ?? {}
      try {
        const raw = storage.getItem(STAMPS_KEY)
        if (raw === null || raw === undefined) return {}
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return {}
        const clean = {}
        for (const [id, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && Number.isFinite(value)) clean[id] = value
        }
        return clean
      } catch {
        return memory ?? {}
      }
    },
    /**
     * @param stamps - the map to persist.
     */
    writeStamps(stamps) {
      memory = stamps
      if (storage === undefined) return
      try {
        storage.setItem(STAMPS_KEY, JSON.stringify(stamps))
      } catch {
        /* quota or a denied storage: the in-memory copy still carries this session */
      }
    },
  }
}

/**
 * The completion-edge bookkeeping, as a pure step.
 *
 * A stamp is written on `running → not running`, and a session that has left the
 * list is dropped. Without the drop, a long-lived install would accumulate one
 * entry per session ever run; without the edge, the stamp would be rewritten on
 * every observation and the green signal would never expire.
 *
 * @param prevRunning - the previous `SessionId -> running` map.
 * @param list - the session-list snapshot.
 * @param stamps - the persisted stamps.
 * @param now - the current time.
 * @returns the next stamps and running maps.
 */
function noteRunningEdges(prevRunning, list, stamps, now) {
  const nextRunning = {}
  const nextStamps = {}
  for (const id of list?.ids ?? []) {
    if (list?.byId?.[id] === undefined) continue
    const running = list.byId[id].running === true
    nextRunning[id] = running
    if (prevRunning?.[id] === true && !running) nextStamps[id] = now
    else if (typeof stamps?.[id] === 'number') nextStamps[id] = stamps[id]
  }
  return { stamps: nextStamps, running: nextRunning }
}

// ─── the settings ────────────────────────────────────────────────────────────

/**
 * Every setting this plugin owns, in the order the row lists them.
 *
 * There is exactly one, and that is the design rather than an accident of it: the
 * document says how each state looks and sounds, and a document plus a row of
 * switches over the same facts is two places to look for one answer. The switches
 * this row used to carry are now lines — `icon on`, `sound background`,
 * `keep-done 60s`, `chime off` — which means every knob still exists and every one
 * of them is visible next to the thing it affects.
 *
 * The id is also the host schema's field name, and the two halves of the bundle are
 * separate graphs that cannot share a module — so the roster is duplicated by hand
 * in `lib/index.js` and `scripts/verify-client.mjs` compares the two copies, which
 * turns a silent drift into a failing check.
 */
const SETTINGS = [
  { id: 'style', kind: 'text', default: DEFAULT_STYLE, labelKey: 'alert.setting.style', hintKey: 'alert.setting.styleHint' },
]

/** The whole-section defaults, as the host schema resolves an empty document. */
const SETTING_DEFAULTS = Object.fromEntries(SETTINGS.map((field) => [field.id, field.default]))

/**
 * Coerce one stored value to the shape the engine reads.
 *
 * The settings document is user-editable YAML and the wire carries whatever it
 * holds, so the coercions here are about surviving a hand-edit rather than about
 * validating the document: the document has its own reader, with diagnostics, and
 * this must not be a second opinion about it. A field that says nothing is left out
 * so the default stands.
 *
 * @param field - the roster entry.
 * @param value - the stored value.
 * @returns the usable value, or undefined when the value says nothing.
 */
function coerceSetting(field, value) {
  if (field.kind === 'boolean') {
    if (value === true) return true
    if (value === false) return false
    return undefined
  }
  // A text field is a document, not a value: anything that is not a string is a
  // corrupt write, and an empty one means "use the shipped appearance" rather than
  // "draw an empty icon".
  if (field.kind === 'text') return typeof value === 'string' && value.trim() !== '' ? value : undefined
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

/**
 * Resolve a stored section against the roster.
 * @param section - the section the settings scope reports.
 * @returns every field, with defaults filled in.
 */
function resolveSettings(section) {
  const resolved = { ...SETTING_DEFAULTS }
  if (section === null || typeof section !== 'object') return resolved
  for (const field of SETTINGS) {
    const value = coerceSetting(field, section[field.id])
    if (value !== undefined) resolved[field.id] = value
  }
  return resolved
}

// ─── the settings row ────────────────────────────────────────────────────────

/** Row copy, keyed by locale. `zh` is the key-set source of truth. */
const zh = {
  'alert.title': '标签页提醒',
  'alert.description':
    '在别的标签页时替你盯着所有会话：标签图标、标签标题和提示音三个通道，该你出手的时候叫你回来',
  'alert.setting.style': '状态样式与声音',
  'alert.setting.styleHint':
    '四个状态各写一段，样子和声音都在里面。写错的那一行会被指出来并退回默认值，不会让图标消失。',
  'alert.style.help': '文档语法',
  'alert.style.document': '文档结构',
  'alert.style.documentLine1': '文档级设置写在最前面，一行一条：icon on',
  'alert.style.documentLine2': '每个状态一段：状态名 + {，属性一行一条，最后用单独一行 } 收尾',
  'alert.style.documentLine3': '// 后面是注释；没写的属性沿用该状态的默认值',
  'alert.style.globals': '文档级设置',
  'alert.style.globalsLine':
    'icon、title 写 on 或 off；sound 写 off、background（默认：只在本页不在前台时响）或 always；chime-gap 是两次提示音的最小间隔；keep-done 是「刚刚完成」保留多久；volume 是默认音量 —— 没在自己块里写 volume 的状态用它。',
  'alert.style.state': '状态属性',
  'alert.style.stateLine':
    'shape、color、motion、speed、chime、volume。时长写单位（1.5s、300ms、2m），省略即秒。',
  'alert.style.shapes': '形状 shape',
  'alert.style.motions': '动效 motion',
  'alert.style.colors': '颜色 color（预设）',
  'alert.style.colorsLine': '只接受预设名，不接受任意色值：本插件出过的两次事故都是对比度问题（白鱼画在白底上），预设色不会犯这个错。',
  'alert.style.chime': '声音 chime',
  'alert.style.chimeLine':
    '写音名序列（A5 E6）或频率（880 1318.5），按顺序播放；off 表示这个状态不出声。同一个块里的 volume 是这个状态自己的音量（0–1），会覆盖顶层那行默认音量；卡片上印的就是这两个数字里生效的那一个，两边都没写才用出厂 0.5 并标「（默认）」。',
  'alert.primitive.shape.circle': '圆形',
  'alert.primitive.shape.rounded': '圆角矩形，鱼是横宽的，圆角矩形给它更好的留白',
  'alert.primitive.shape.square': '小圆角方形',
  'alert.primitive.shape.none': '不画背景板。注意：鱼是「镂空」出来的，没有背景板就没有东西可镂 —— 结果是整个图标全透明（只剩角标）。想「只要鱼」请用圆角矩形或圆形',
  'alert.primitive.motion.still': '不动',
  'alert.primitive.motion.turn': '鱼旋转，速度=转一圈的秒数',
  'alert.primitive.motion.blink': '整体明暗呼吸，速度=一次呼吸的秒数',
  'alert.primitive.motion.pulse': '背景色往复变化，速度=一个来回的秒数',
  'alert.preview': '状态预览',
  'alert.preview.hint':
    '32 像素，和标签页里一样大；动效按文档实时播放。点「预览」让标签页本身显示这个状态（图标和标题都换过去），再点一次或离开本页就恢复。',
  'alert.preview.audition': '试听',
  'alert.preview.silent': '不出声',
  'alert.preview.gain': '音量',
  'alert.preview.fallback': '（默认）',
  'alert.preview.pin': '预览',
  'alert.preview.pinHint': '让浏览器标签页显示这个状态，改配置时可以照着标签看',
  'alert.preview.pinned': '预览中',
  'alert.preview.pinnedHint': '标签页正在显示这个状态；再点一次恢复真实状态',
  'alert.problems': '下面这些行没有生效：',
  'alert.problemsMore': '处没有列出',
  'alert.reset': '全部恢复默认',
  'alert.status.waiting': '等待回答',
  'alert.status.approval': '等待审批',
  'alert.status.running': '执行中',
  'alert.status.done': '刚刚完成',
}

/** English dictionary, checked complete against the `zh` key set. */
const en = {
  'alert.title': 'Tab alerts',
  'alert.description':
    'Watches every session while you are on another tab — a status ring on the tab icon, a title prefix, and a chime, so you come back when you are actually needed',
  'alert.setting.style': 'State styles and sounds',
  'alert.setting.styleHint':
    'One block per state, each line one named property. A line the reader cannot use is reported and falls back to the default rather than leaving the tab without an icon.',
  'alert.style.help': 'Document syntax',
  'alert.style.document': 'How the document is shaped',
  'alert.style.documentLine1': 'document settings come first, one per line: icon on',
  'alert.style.documentLine2': 'then one block per state: the state name and {, one property per line, closed by a line with }',
  'alert.style.documentLine3': '// starts a comment; a property a block omits keeps that state\u2019s default',
  'alert.style.globals': 'Document settings',
  'alert.style.globalsLine':
    'icon and title take on or off; sound takes off, background (the default: only while this page is not in front) or always; chime-gap is the least time between two chimes; keep-done is how long "just finished" stays lit; volume is the loudness a state uses when its own block does not name one.',
  'alert.style.state': 'State properties',
  'alert.style.stateLine':
    'shape, color, motion, speed, chime, volume. Durations take a unit (1.5s, 300ms, 2m); a bare number is seconds.',
  'alert.style.shapes': 'shape',
  'alert.style.motions': 'motion',
  'alert.style.colors': 'colour (presets)',
  'alert.style.colorsLine': 'Preset names only, never a free colour: both failures this plugin has shipped were contrast failures, and a preset cannot be illegible.',
  'alert.style.chime': 'chime',
  'alert.style.chimeLine':
    'Note names (A5 E6) or frequencies (880 1318.5), played in order; off keeps this state silent. A block\u2019s volume is that state\u2019s own loudness, 0 to 1, and it overrides the document\u2019s; the card prints whichever of the two is in force, and marks it as the default only when neither is written.',
  'alert.primitive.shape.circle': 'a circle',
  'alert.primitive.shape.rounded': 'a rounded square — the fish is wider than it is tall, and this gives it room',
  'alert.primitive.shape.square': 'a slightly rounded square',
  'alert.primitive.shape.none': 'no background plate. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is entirely transparent (only the badge survives). For just-the-fish, use rounded or circle',
  'alert.primitive.motion.still': 'still',
  'alert.primitive.motion.turn': 'the fish turns; speed is seconds per revolution',
  'alert.primitive.motion.blink': 'the whole icon dims and returns; speed is seconds per breath',
  'alert.primitive.motion.pulse': 'the background colour alternates; speed is seconds per cycle',
  'alert.preview': 'State previews',
  'alert.preview.hint':
    '32 pixels, the size the tab draws; the motion runs as the document describes it. Press "Preview" to put that state in the tab itself — icon and title — and press it again, or leave this page, to go back to the live state.',
  'alert.preview.audition': 'Play',
  'alert.preview.silent': 'silent',
  'alert.preview.gain': 'volume',
  'alert.preview.fallback': '(default)',
  'alert.preview.pin': 'In tab',
  'alert.preview.pinHint': 'Show this state in the browser tab, so an edit can be judged in the tab strip itself',
  'alert.preview.pinned': 'Showing',
  'alert.preview.pinnedHint': 'The tab is showing this state; press again to go back to the live one',
  'alert.problems': 'These lines do nothing yet:',
  'alert.problemsMore': 'more not listed',
  'alert.reset': 'Reset to defaults',
  'alert.status.waiting': 'Waiting',
  'alert.status.approval': 'Waiting for approval',
  'alert.status.running': 'Running',
  'alert.status.done': 'Just finished',
}

/** The stylesheet for the row's own chrome. */
const ROW_CSS = [
  '.dsh-sentry-row{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:16px;padding:16px 0;display:flex}',
  '.dsh-sentry-head{flex-direction:column;gap:4px;display:flex}',
  '.dsh-sentry-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
  '.dsh-sentry-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
  '.dsh-sentry-item{align-items:flex-start;justify-content:space-between;gap:16px;display:flex}',
  '.dsh-sentry-itemText{flex-direction:column;gap:4px;min-width:0;display:flex}',
  '.dsh-sentry-itemLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-itemHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-sentry-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-style{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-editor{display:block}',
  // The editor's own stylesheet is injected by the library; these bind its appearance to the
  // interface's design tokens, so the box matches every other field and follows the theme
  // switch rather than the operating system's colour scheme.
  '.dsh-sentry-editor .litearea-box{border-width:.5px}',
  // Scopes the library's palette has no entry for. They are the ones this language added
  // when it stopped writing values positionally: a mode word (`on`, `background`), a note,
  // and a brace. Bound to the library's own variables rather than to fixed colours, so the
  // box follows the interface's theme the way every other token in it does.
  '.dsh-sentry-editor .litearea-scope-value-mode{color:var(--litearea-scope-value-shape)}',
  '.dsh-sentry-editor .litearea-scope-value-note{color:var(--litearea-scope-value-number)}',
  '.dsh-sentry-editor .litearea-scope-punctuation{color:var(--litearea-fg-dim)}',
  '.dsh-sentry-help{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-help>summary{cursor:pointer;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:18px}',
  '.dsh-sentry-helpSection{margin-top:8px}',
  '.dsh-sentry-helpTitle{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.dsh-sentry-helpLine{font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:pre-wrap}',
  // The problems the reader found, listed under the editor. The editor underlines the same
  // spans as you type; this is the version that survives a document pasted into
  // `settings.yaml` and read on a screen the editor was never opened on.
  '.dsh-sentry-problems{flex-direction:column;gap:2px;display:flex}',
  '.dsh-sentry-problemHead{color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:16px}',
  '.dsh-sentry-problem{display:flex;gap:6px;color:var(--dsw-alias-state-warn-primary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:11px;line-height:16px}',
  '.dsh-sentry-problemLine{flex:none;min-width:16px;color:var(--dsw-alias-label-tertiary);text-align:right;font-variant-numeric:tabular-nums}',
  // The previews: the state as the tab would draw it, at the size the tab draws it.
  '.dsh-sentry-previews{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-previewsHead{flex-direction:column;gap:2px;display:flex}',
  '.dsh-sentry-previewsTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-previewsHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-previewGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px}',
  '.dsh-sentry-preview{align-items:center;flex-direction:column;gap:6px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-module-platform);padding:10px 8px;display:flex}',
  // The card whose state the tab is currently showing. It has to be obvious: a tab
  // wearing a state nobody asked for any more is the one thing this plugin must not do.
  '.dsh-sentry-preview[data-pinned="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-previewIcon{width:32px;height:32px;display:block}',
  '.dsh-sentry-previewName{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;text-align:center}',
  '.dsh-sentry-previewSound{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:10px;line-height:14px;text-align:center}',
  '.dsh-sentry-previewActions{align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;display:flex}',
  '.dsh-sentry-audition,.dsh-sentry-pin{border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;padding:3px 10px;font-family:inherit;font-size:11px;line-height:16px}',
  '.dsh-sentry-audition:hover,.dsh-sentry-pin:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-pin[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
].join('')

/** Install the row chrome stylesheet for the plugin's lifetime. */
function installRowStyles(ctx) {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${STYLE_PREFIX}/row.css`
    tag.textContent = ROW_CSS
    document.head.appendChild(tag)
    return () => {
      tag.remove()
    }
  }, 'dsh-sentry: row stylesheet')
}

/** Live-state store behind the settings row: the resolved section plus a revision. */
function createRowStore() {
  return defineStore({
    init: () => ({ ...SETTING_DEFAULTS, revision: -1 }),
    actions: {
      sync: (draft, section, revision) => {
        if (revision !== undefined && revision <= draft.revision) return
        for (const field of SETTINGS) {
          const value = coerceSetting(field, section?.[field.id])
          draft[field.id] = value === undefined ? field.default : value
        }
        if (revision !== undefined) draft.revision = revision
      },
    },
  })
}

/**
 * The design tokens the editor is themed with, as litearea custom properties.
 *
 * CSS stays the theme language: the editor's whole appearance is already described by
 * custom properties, so binding them to the interface's own tokens is what makes the box
 * look native instead of like a control that wandered in from somewhere else. Setting them
 * here rather than in the stylesheet also means they follow the INTERFACE's theme switch,
 * not the operating system's — the library's own dark palette is driven by
 * `prefers-color-scheme`, and those two are not the same thing.
 *
 * Deliberately not mapped: the per-scope colours. The library's palette is chosen to be
 * legible on its own light and dark surfaces, and overriding the surface while leaving the
 * scopes alone is right for the common case where the two schemes agree.
 */
const EDITOR_VARIABLES = {
  font: 'var(--ds-font-family-code, ui-monospace, monospace)',
  'font-size': '12px',
  'line-height': '18px',
  'padding-block': '8px',
  'padding-inline': '10px',
  radius: '8px',
  fg: 'var(--dsw-alias-label-primary)',
  'fg-dim': 'var(--dsw-alias-label-tertiary)',
  'fg-strong': 'var(--dsw-alias-label-primary)',
  bg: 'var(--dsw-alias-bg-module-platform)',
  'bg-raised': 'var(--dsw-alias-bg-layer-2)',
  border: 'var(--dsw-alias-border-l4)',
  'border-focus': 'var(--dsw-alias-state-business-primary)',
  accent: 'var(--dsw-alias-state-business-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  shadow: 'var(--dsw-elevation-panel)',
}

/**
 * How many of the reader's problems the row lists before it counts the rest.
 *
 * A pasted document can be wrong on every line, and the list exists to point at the
 * mistakes worth fixing rather than to reproduce the document. The editor underlines
 * all of them either way.
 */
const PROBLEM_ROWS = 6

/**
 * The style document, the reference needed to write one, the problems found in it,
 * and the editor over it.
 *
 * A `<details>` block rather than a form, and a real editor rather than a text area. The
 * point of the document is that the appearance and the sound of four states are
 * written the same way and read in one place; expressing that as controls would take
 * a dozen of them and still not say what one block says. So the help text is not
 * decoration — it *is* the interface, and it lists the vocabulary the reader accepts.
 *
 * The problems are printed as well as underlined: the editor's squiggles are the
 * version that helps while typing, and this list is the version that survives a
 * document pasted into `settings.yaml` and looked at without opening the editor.
 *
 * The textarea this replaces was controlled: every keystroke round-tripped through the
 * store and the value was written back, which is what destroyed the browser's undo stack
 * and reset the caret. The editor owns the text instead, and reports what the user typed.
 *
 * @param props - React props.
 * @returns the item element.
 */
function SettingText({ label, hint, value, help, problems = [], onChange }) {
  const hostRef = React.useRef(null)
  const editorRef = React.useRef(undefined)
  // The newest props, so the editor's own callbacks are never a render behind.
  const latest = React.useRef({ onChange })
  latest.current = { onChange }
  // A pasted document can be wrong on every line, and a hundred rows of complaint
  // would push the rest of the settings page off the screen. The first few name the
  // mistakes worth fixing; the count says how many are behind them.
  const listed = problems.slice(0, PROBLEM_ROWS)
  const rest = problems.length - listed.length

  React.useEffect(() => {
    const host = hostRef.current
    if (host === null || host === undefined) return undefined
    const editor = createEditor(host, {
      // The vocabularies come from this plugin's own constants, so the editor cannot
      // offer a shape, a motion, or a property the reader would then reject. The
      // document's own options object is handed over whole for the same reason: one
      // table that both halves read is one table that cannot disagree with itself.
      grammar: dshSentryStyleGrammar({
        states: STYLE_STATES,
        keys: STYLE_DOCUMENT_OPTIONS.keys,
        spec: STYLE_SPEC,
        shapes: SHAPES,
        motions: MOTIONS,
        colors: PRESET_COLORS,
        modes: MODES,
        notes: STYLE_NOTE_SUGGESTIONS,
        defaults: DEFAULT_LOOK,
      }),
      value: latest.current.value,
      ariaLabel: label,
      // The box grows with the document rather than scrolling inside it. The cap this
      // replaces — two dozen rows — was smaller than the shipped document, so the
      // editor grew a scrollbar of its own inside a page that already scrolls: two
      // scrollbars for one document, and the one the user is trying to reach is the
      // page's. The bound that is left is a sanity limit for a pasted document
      // hundreds of lines long, not a display decision.
      sizing: { minRows: 12, maxRows: 200 },
      variables: EDITOR_VARIABLES,
      // A space does not open the list. It separates the tokens of this document,
      // which is the argument for opening one there and the reason it is off: the
      // list is already open while the next token is typed, so all a space would
      // add is a panel over the settings every time the user moves on. Stated
      // rather than inherited, because this plugin compiles in a pinned copy of
      // the editor: what the library defaults to on the day it is built is not a
      // promise about the day after.
      completion: { triggerCharacters: '' },
      onChange: (next) => {
        latest.current.onChange(next)
      },
    })
    editorRef.current = editor
    return () => {
      editor.destroy()
      editorRef.current = undefined
    }
  }, [])

  // A value that arrived from elsewhere — the Reset button, another tab — takes the field
  // over. Our own write coming back does not, and neither does anything at all while the
  // user is in the field: that would be the plugin rewriting their typing.
  React.useEffect(() => {
    const editor = editorRef.current
    if (editor === undefined) return
    if (editor.focused) return
    if (editor.value !== value) editor.setValue(value)
  }, [value])

  return React.createElement(
    'div',
    { className: 'dsh-sentry-style' },
    React.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      React.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      React.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    React.createElement('div', { className: 'dsh-sentry-editor', ref: hostRef }),
    problems.length === 0
      ? null
      : React.createElement(
          'div',
          { className: 'dsh-sentry-problems' },
          React.createElement('div', { className: 'dsh-sentry-problemHead' }, help.problems),
          ...listed.map((problem, index) =>
            React.createElement(
              'div',
              { className: 'dsh-sentry-problem', key: `p${String(index)}` },
              React.createElement(
                'span',
                { className: 'dsh-sentry-problemLine' },
                String(problem.line + 1),
              ),
              React.createElement('span', null, problem.message),
            ),
          ),
          rest === 0
            ? null
            : React.createElement(
                'div',
                { className: 'dsh-sentry-problemHead' },
                `…${String(rest)} ${help.problemsMore}`,
              ),
        ),
    React.createElement(
      'details',
      { className: 'dsh-sentry-help' },
      React.createElement('summary', null, help.summary),
      ...help.sections.map((section, index) =>
        React.createElement(
          'div',
          { className: 'dsh-sentry-helpSection', key: `s${String(index)}` },
          React.createElement('div', { className: 'dsh-sentry-helpTitle' }, section.title),
          ...section.lines.map((line, lineIndex) =>
            React.createElement('div', { className: 'dsh-sentry-helpLine', key: `l${String(lineIndex)}` }, line),
          ),
        ),
      ),
    ),
  )
}

/**
 * The style reference, rendered into the row from the vocabularies themselves.
 *
 * Built from `SHAPES`, `MOTIONS`, `PRESET_COLORS`, and the key lists rather than
 * written out by hand, so the reference cannot drift from what the reader accepts —
 * the failure mode a hand-written reference always has. What is written by hand is
 * the prose, which is the part a translator has to see.
 *
 * @param t - the translator.
 * @returns `{ summary, problems, sections }`.
 */
function styleHelp(t) {
  /** @param name - a primitive name. @returns its documented line. */
  const describe = (name) => t(`alert.primitive.${name}`)
  return {
    summary: t('alert.style.help'),
    problems: t('alert.problems'),
    problemsMore: t('alert.problemsMore'),
    sections: [
      {
        title: t('alert.style.document'),
        lines: [
          t('alert.style.documentLine1'),
          t('alert.style.documentLine2'),
          t('alert.style.documentLine3'),
        ],
      },
      {
        title: `${t('alert.style.globals')}: ${STYLE_GLOBAL_KEYS.join(' | ')}`,
        lines: [t('alert.style.globalsLine')],
      },
      {
        title: `${t('alert.style.state')}: ${STYLE_STATE_KEYS.join(' | ')}`,
        lines: [t('alert.style.stateLine')],
      },
      {
        title: `${t('alert.style.shapes')}: ${SHAPES.join(' | ')}`,
        lines: SHAPES.map((name) => `${name} — ${describe(`shape.${name}`)}`),
      },
      {
        title: `${t('alert.style.motions')}: ${MOTIONS.join(' | ')}`,
        lines: MOTIONS.map((name) => `${name} — ${describe(`motion.${name}`)}`),
      },
      {
        title: `${t('alert.style.colors')}: ${Object.keys(PRESET_COLORS).join(' | ')}`,
        lines: [t('alert.style.colorsLine')],
      },
      { title: t('alert.style.chime'), lines: [t('alert.style.chimeLine')] },
    ],
  }
}

/**
 * A one-session plan for the settings row's preview of one state.
 *
 * The row draws the icon through the same builder the tab does, so this is the only
 * thing standing between the preview and a lie: a plan whose dominant state is the
 * one being previewed, with its count set so the waiting badge is part of the
 * picture the user is judging.
 *
 * @param state - the state to show.
 * @returns a plan holding that state, and only that state.
 */
function previewPlan(state) {
  const counts = { waiting: 0, approval: 0, running: 0, done: 0 }
  counts[state] = 1
  return {
    bySession: new Map([['preview', { state, fresh: state === 'done' }]]),
    active: ['preview'],
    finished: state === 'done' ? ['preview'] : [],
    ...counts,
  }
}

/**
 * A repaint counter for the previews, or a constant zero when nothing moves.
 *
 * One timer for the whole strip rather than one per card, and none at all when every
 * state is still: a settings page is not the place to hold four intervals open for a
 * document that says `motion still`.
 *
 * @param animate - whether anything in the document moves.
 * @returns the current tick.
 */
function useTick(animate) {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!animate) return undefined
    const timer = setInterval(() => {
      setTick((value) => value + 1)
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [animate])
  return tick
}

/**
 * The four states as the tab would draw them, with the sound each one makes.
 *
 * This is the answer to "I cannot see what I just configured", in two sizes. The card
 * itself is the icon built by the same function the favicon uses, at the same 32
 * pixels, driven by the same motion function. The **preview** button is the other
 * half, and the one a 32-pixel card cannot replace: it makes the *real tab* show that
 * state — through the same render pass, so what the tab does with it is what the card
 * shows — which is the only way to judge the change to a state that no session
 * happens to be in at the moment. The chime buttons are also the gesture that unlocks
 * audio for the session, which is why there is no separate "unlock audio" control.
 *
 * The preview is released the moment it would become a lie: the page stops being
 * visible, the settings page goes away, or the same card is clicked again. A tab that
 * kept wearing a state nobody is looking at would be the one thing this plugin must
 * never be.
 *
 * @param props - React props.
 * @returns the strip element.
 */
function StatePreviews({ t, doc, audition, preview }) {
  const animate = STYLE_STATES.some((state) => doc.look[state].motion !== 'still')
  const tick = useTick(animate)
  const [pinned, setPinned] = React.useState(undefined)
  // The newest action, so a release triggered from an event or an unmount is never a
  // render behind — those are exactly the calls that happen outside a render.
  const latest = React.useRef({ preview })
  latest.current = { preview }

  // Leaving the settings page ends the preview. React runs this on unmount, which is
  // when the slot's component goes away.
  React.useEffect(() => () => latest.current.preview(undefined), [])

  // And so does the page going out of sight. This is the important one: a preview
  // exists to be looked at, and once the user is on another tab the icon is the only
  // thing this plugin has to tell them the truth with.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden !== true) return
      setPinned(undefined)
      latest.current.preview(undefined)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /**
   * Show this state in the tab, or stop showing it.
   * @param state - the state whose card was clicked.
   * @returns {void}
   */
  const toggle = (state) => {
    const next = pinned === state ? undefined : state
    setPinned(next)
    latest.current.preview(next)
  }

  return React.createElement(
    'div',
    { className: 'dsh-sentry-previews' },
    React.createElement(
      'div',
      { className: 'dsh-sentry-previewsHead' },
      React.createElement('div', { className: 'dsh-sentry-previewsTitle' }, t('alert.preview')),
      React.createElement('div', { className: 'dsh-sentry-previewsHint' }, t('alert.preview.hint')),
    ),
    React.createElement(
      'div',
      { className: 'dsh-sentry-previewGrid' },
      ...STYLE_STATES.map((state) => {
        const look = doc.look[state]
        const svg = sentryFavicon(previewPlan(state), {
          reducedMotion: false,
          style: doc.look,
          motion: motionTick(look, tick),
        })
        const channel = doc.sound.channels[state]
        // The percentage is a line of the document — the state's own `volume`, or the
        // document's — or the shipped one with a word saying that nothing said. What it
        // is never is a product of two settings: a card that showed one printed a figure
        // its reader could not find anywhere.
        const sound =
          channel === undefined
            ? t('alert.preview.silent')
            : `${channel.labels.join(' → ')} · ${t('alert.preview.gain')} ${String(Math.round(channel.gain * 100))}%${channel.unstated ? ` ${t('alert.preview.fallback')}` : ''}`
        const shown = pinned === state
        return React.createElement(
          'div',
          { className: 'dsh-sentry-preview', key: state, 'data-pinned': shown },
          React.createElement('img', {
            className: 'dsh-sentry-previewIcon',
            src: svg === undefined ? undefined : faviconHref(svg),
            alt: t(`alert.status.${state}`),
            width: 32,
            height: 32,
          }),
          React.createElement('div', { className: 'dsh-sentry-previewName' }, t(`alert.status.${state}`)),
          React.createElement('div', { className: 'dsh-sentry-previewSound' }, sound),
          React.createElement(
            'div',
            { className: 'dsh-sentry-previewActions' },
            channel === undefined
              ? null
              : React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-sentry-audition',
                    onClick: () => {
                      audition(channel.frequencies, channel.gain)
                    },
                  },
                  t('alert.preview.audition'),
                ),
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'dsh-sentry-pin',
                'aria-pressed': shown,
                title: shown ? t('alert.preview.pinnedHint') : t('alert.preview.pinHint'),
                onClick: () => {
                  toggle(state)
                },
              },
              shown ? t('alert.preview.pinned') : t('alert.preview.pin'),
            ),
          ),
        )
      }),
    ),
  )
}

/**
 * The General-settings row: the document, every state as it will look and sound, and
 * a reset.
 *
 * No switches, and that is the shape of the change this row went through: every knob
 * the row used to carry is a line of the document now — `icon on`, `sound
 * background`, `keep-done 60s`, `chime off` — so there is one place to look for how
 * the plugin behaves and the previews sit directly under it.
 *
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function AlertRow({ t, useStore, setField, reset, audition, preview }) {
  const state = useStore((snapshot) => snapshot)
  const style = state.style ?? DEFAULT_STYLE
  // Read on every render rather than cached on the settings change: it is a walk over
  // a few dozen lines, and it means the previews below can never show a document other
  // than the one in the editor.
  const doc = resolveStyle(style)
  const field = SETTINGS[0]
  return React.createElement(
    'div',
    { className: 'dsh-sentry-row' },
    React.createElement(
      'div',
      { className: 'dsh-sentry-head' },
      React.createElement('div', { className: 'dsh-sentry-title' }, t('alert.title')),
      React.createElement('div', { className: 'dsh-sentry-desc' }, t('alert.description')),
    ),
    React.createElement(SettingText, {
      label: t(field.labelKey),
      hint: t(field.hintKey),
      value: style,
      help: styleHelp(t),
      problems: doc.problems,
      onChange: (value) => {
        setField(field.id, value)
      },
    }),
    React.createElement(StatePreviews, { t, doc, audition, preview }),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-sentry-reset',
        onClick: () => {
          reset()
        },
      },
      t('alert.reset'),
    ),
  )
}

// ─── installation ────────────────────────────────────────────────────────────

/** The attribute marking the one DOM element this plugin owns. */
const ICON_ATTRIBUTE = 'data-dsh-sentry-icon'

/**
 * The two settings APIs this build speaks, newest first.
 *
 * Literals rather than imports: a client bundle may not import another bundle's
 * values, and a service name is a fact about the composition, not a dependency of
 * this package.
 *
 * - `configForms` (dsh 0.1.7+): one configuration form per Loader entry, addressed
 *   by the entry id — `alert`, the row this bundle's patch inserts.
 * - `settingsScope` (0.1.5-rc.x): one scope per registered namespace, addressed by
 *   the name the host half registers — the same `alert` string.
 *
 * Both are read and written here, so the style document behaves the same on either
 * line. A composition with neither still runs the sentry on its shipped document,
 * and says why the first time a control is used.
 */
const CONFIG_FORMS_SERVICE = 'configForms'
const SETTINGS_SCOPE_SERVICE = 'settingsScope'

/**
 * The snapshot a scope reports when there is nothing to report.
 *
 * Shape-for-shape the one a bound scope answers with when the Host itself keeps
 * settings process-local — a non-loopback page: no value, nothing writable. The
 * engine and the row already resolve defaults for that state, which is why
 * "settings refused" and "no settings service at all" need no second path.
 */
const EMPTY_SNAPSHOT = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
})

/** Whether the missing-settings report has been made; one page, one report. */
let reportedMissingSettings = false

/** Whether the missing-session-state report has been made; likewise once. */
let reportedMissingSource = false

/**
 * Say, once, why this plugin is running without durable settings.
 *
 * Called from every write that lands on the stand-in scope: that is the moment a
 * user has to be told that the control they just used is not going to be saved.
 * Activation itself stays quiet, because a composition that binds late must not be
 * reported for being slow.
 */
function reportMissingSettings() {
  if (reportedMissingSettings) return
  reportedMissingSettings = true
  console.error(
    `${PLUGIN_ID}: no settings service this build speaks is present ("${CONFIG_FORMS_SERVICE}" on ` +
      `dsh 0.1.7+, "${SETTINGS_SCOPE_SERVICE}" on the 0.1.5-rc.x line), so the alert document ` +
      'cannot be read or saved and the sentry runs on its shipped defaults. Pin dsh to 0.1.5-rc.x ' +
      '(latest/next), or install a newer @citisen/dsh-sentry.',
  )
}

/**
 * The settings section this plugin never got.
 *
 * Reads answer "nothing resolved", so the engine and the row fall back to the
 * defaults they already resolve; every write reports the mismatch instead of
 * failing silently. That is the contract of a bound scope whose Host refuses a
 * write, minus the wire call.
 * @returns an object shaped like a bound settings scope.
 */
function missingSettingsScope() {
  return {
    getSnapshot: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    set: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    unset: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
    mutate: () => {
      reportMissingSettings()
      return Promise.resolve(false)
    },
  }
}

/**
 * Say, once, that this dsh does not offer the session state the sentry watches.
 *
 * A dsh that moved the state — 0.1.7-alpha.1 replaced
 * `uiSession.pendingInteractions` with `uiSession.sessionStatus` — has to leave
 * the tab running on what it can still see rather than failing activation: a
 * failed entry blocks the web boot outright, which is worse than a quieter tab.
 *
 * @param what - the missing surface, named the way a reader would look for it.
 */
function reportMissingSource(what) {
  if (reportedMissingSource) return
  reportedMissingSource = true
  console.error(
    `${PLUGIN_ID}: this dsh does not provide ${what}, so the tab cannot tell when you are needed. ` +
      'dsh 0.1.7-alpha.1 replaced "uiSession.pendingInteractions" with "uiSession.sessionStatus"; ' +
      'this build targets the dsh 0.1.5-rc.x line (latest/next). Pin dsh to 0.1.5-rc.x, or install ' +
      'a newer @citisen/dsh-sentry.',
  )
}

/**
 * Narrow a raw `alert` section to this plugin's own settings.
 *
 * Applied to whatever either API hands over, because only one of them can do it
 * itself: a 0.1.5 scope takes a `decode` at bind time, a 0.1.7 form has no such
 * hook. Decoding here means the engine and the row see one shape whichever line is
 * running — and both call the same `resolveSettings` the row does, so they cannot
 * disagree about a default.
 *
 * @param section - the section as stored, if any.
 * @returns the resolved settings, or undefined when there is no section.
 */
function decodeSentrySection(section) {
  if (section === null || typeof section !== 'object') return undefined
  const raw = section
  return Object.fromEntries(
    SETTINGS.map((field) => [field.id, coerceSetting(field, raw[field.id]) ?? field.default]),
  )
}

/**
 * Present a dsh 0.1.7 configuration form as the scope this plugin reads.
 *
 * A form already answers `getSnapshot`/`subscribe`/`set`/`unset`/`mutate`, so the
 * only gap is its value: it reports the section as stored, and this plugin reads
 * decoded settings.
 *
 * @param form - the configuration form for this plugin's entry.
 * @returns a scope-shaped object.
 */
function decodedForm(form) {
  return {
    getSnapshot: () => {
      const snapshot = form.getSnapshot()
      return { ...snapshot, value: decodeSentrySection(snapshot.value) }
    },
    subscribe: (listener) => form.subscribe(listener),
    set: (field, value) => form.set(field, value),
    unset: (field) => form.unset(field),
    mutate: (operations, revision) => form.mutate(operations, revision),
  }
}

/**
 * The services this plugin waits for.
 *
 * `sessions` and `uiSession` are the two observables the engine reads; both are
 * installed by the Web composition's session controller, so a third-party plugin
 * reaches the same state the built-in sidebar renders from, without borrowing a
 * slot or a hook.
 *
 * Settings are deliberately **not** in this list. A required service that a dsh
 * release stops providing holds the entire plugin in `pending` forever — and an
 * entry that never activates blocks the web boot — which is how 0.1.7-alpha.1
 * turned `settingsScope` into `configForms` and left plugins reported as "waiting
 * for service" instead of a working interface. Both APIs are bound optionally in
 * `apply` instead, so a composition with neither still gets the sentry, the row,
 * and a message when a control is used.
 */
export const inject = ['slots', 'locale', 'sessions', 'uiSession']

/**
 * Client plugin body: subscribe to the session state, project it onto the three
 * background-tab channels, and register the Settings row that configures them.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
  installRowStyles(ctx)

  /** The bound `alert` section, or a stand-in until (and unless) dsh provides one. */
  let scope = missingSettingsScope()

  const chime = createChime({
    AudioContextClass:
      typeof window === 'undefined' ? undefined : window.AudioContext ?? window.webkitAudioContext,
  })
  const stampStore = createStampStore(safeStorage())

  /**
   * The icon element the tab is drawn from, and the only element this plugin owns.
   *
   * It is **replaced**, not mutated, whenever the picture changes. A browser's tab strip
   * follows the document's set of icon links: a link whose `href` changed in place is not
   * reliably a change, which is exactly how a configuration edit came to leave the tab
   * showing the previous icon until something else moved the plan. Mounting a fresh
   * element and taking the old one out in the same step is what the tab strip does react
   * to, and it is also the only way an animated motion can be visible at all — every tick
   * is a different picture, so every tick is a different link.
   *
   * The app's own link is never touched: this element is ours from creation to removal.
   */
  let icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.setAttribute(ICON_ATTRIBUTE, '')
  /** The `href` the mounted element carries, so a redraw that changes nothing is free. */
  let iconHref

  /**
   * Give the tab a new icon, or take ours away.
   *
   * The old element goes before the new one arrives, so the head never holds two icons
   * of ours — with two, which one the tab shows would depend on mount order.
   * @param svg - the SVG source, or undefined when there is nothing to say.
   * @returns {void}
   */
  const setIcon = (svg) => {
    const mounted = icon.parentNode !== null && icon.parentNode !== undefined
    if (svg === undefined) {
      if (mounted) icon.remove()
      iconHref = undefined
      return
    }
    const href = faviconHref(svg)
    if (mounted && iconHref === href) return
    const next = document.createElement('link')
    next.rel = 'icon'
    next.type = 'image/svg+xml'
    next.setAttribute(ICON_ATTRIBUTE, '')
    next.href = href
    if (mounted) icon.remove()
    document.head.appendChild(next)
    icon = next
    iconHref = href
  }

  const state = {
    settings: { ...SETTING_DEFAULTS },
    // The document, resolved. Rebuilt on every render from `settings.style`, so the
    // three channels below read one object instead of three parses of one text.
    doc: resolveStyle(SETTING_DEFAULTS.style),
    plan: EMPTY_PLAN,
    // The plan the two visual channels are drawn from: the live one, or the single
    // state the settings row asked to see. Kept apart from `plan` because the alert
    // diff below must always be a diff of live state — a preview is a picture, never
    // an event.
    shown: EMPTY_PLAN,
    preview: undefined,
    // Set once the framework tears the plugin down, so a late render — the settings row
    // releasing a preview as it unmounts, or a subscription that fires while the
    // disposers run — cannot mount an icon nobody owns any more.
    disposed: false,
    running: {},
    stamps: {},
    writing: false,
    unfocused: false,
    media: undefined,
    lastSoundAt: undefined,
    tick: 0,
    motionTimer: undefined,
    motionInterval: undefined,
  }

  /** The translation seat for the title, bound to the row's own namespace. */
  const translator = ctx.locale?.bind?.(LOCALE_NAMESPACE)
  const t = (key) => (translator === undefined ? key : translator(key))

  /**
   * The title as this plugin wants it: the app's title, plus or minus the status
   * prefix.
   *
   * Disabling the title channel has to *strip* rather than stop writing, because
   * stopping would leave whatever prefix the previous render installed sitting in
   * the tab forever — a switch that appears not to work. The escape suffix is what
   * makes the strip safe: it marks a title the plugin has already stripped, so an
   * app title that happens to contain a ` · ` cannot be eaten one segment per
   * render.
   *
   * @param plan - the plan the tab is showing, which is the live one unless the
   *   settings row asked to preview a single state.
   */
  const desiredTitle = (plan) => {
    const raw = document.title
    const off = state.doc.globals.title === false
    // Everything this plugin wrote sits behind the marker, so the app's own title
    // underneath comes off by removing the marker and the prefix — no guessing: a
    // title the app rewrites arrives without the marker and is used as-is.
    if (!raw.endsWith(TITLE_MARK)) {
      const plain = off ? raw : titleWithStatus(raw, plan, t)
      return plain === raw ? raw : `${plain}${TITLE_MARK}`
    }

    // A title this plugin wrote. Stripping runs even when the channel is *off*,
    // because stopping writing instead would leave the prefix in the tab forever,
    // which reads as a switch that does not work.
    const bare = raw.slice(0, -TITLE_MARK.length)
    const current = bare.replace(TITLE_PREFIX, '')
    const next = off ? current : titleWithStatus(current, plan, t)
    // Nothing left to say: return the plain app title, dropping the marker with
    // the prefix. This is the branch that takes the status off when the last
    // session goes quiet or the channel is switched off — the *stripped* text, not
    // the text as it stands, because the prefix has to go with the marker.
    return next === current ? current : `${next}${TITLE_MARK}`
  }

  /**
   * The title: this plugin's prefix in front of whatever the app wrote.
   * @param plan - the plan the tab is showing.
   */
  const applyTitle = (plan) => {
    const next = desiredTitle(plan)
    if (next === document.title) return
    state.writing = true
    document.title = next
    state.writing = false
  }

  /**
   * The session-list snapshot.
   * @returns the snapshot, or an empty one before the service is reachable.
   */
  const list = () => ctx.sessions?.list?.getSnapshot?.() ?? { ids: [], byId: {} }

  /**
   * The pending-interaction snapshot.
   *
   * Two shapes are read, newest first: 0.1.7's combined `uiSession.sessionStatus`,
   * whose values carry `pendingInteraction`, and the `uiSession.pendingInteractions`
   * map it replaced. Both project to the `SessionId -> interaction` shape the
   * planner reads.
   *
   * @returns the snapshot, or an empty map.
   */
  const pending = () => {
    const direct = ctx.uiSession?.pendingInteractions?.getSnapshot?.()
    if (direct !== undefined) return direct
    const status = ctx.uiSession?.sessionStatus?.getSnapshot?.()
    if (status === undefined) return new Map()
    const projected = new Map()
    for (const [id, value] of status) {
      if (value?.pendingInteraction !== undefined) projected.set(id, value.pendingInteraction)
    }
    return projected
  }

  /**
   * The source that changes when an interaction starts or ends, in whichever shape
   * this dsh provides it: the whole status source on 0.1.7, the dedicated pending
   * map before that.
   *
   * Reading the dedicated member unguarded is what made this plugin *fail*
   * activation on 0.1.7, and a failed entry blocks the web boot — so an absent
   * source is reported and skipped rather than reached for.
   *
   * @returns a subscribable source, or undefined when neither exists.
   */
  const pendingSource = () => {
    const direct = ctx.uiSession?.pendingInteractions
    if (typeof direct?.subscribe === 'function') return direct
    const status = ctx.uiSession?.sessionStatus
    if (typeof status?.subscribe === 'function') return status
    return undefined
  }

  /** Whether a reduced-motion preference is in force. */
  const prefersReducedMotion = () => {
    if (state.media === undefined) {
      state.media =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-reduced-motion: reduce)')
          : null
    }
    return state.media !== null && state.media.matches === true
  }

  /**
   * The favicon: the state's background with the fish carved through it, or the
   * app's own icon again.
   *
   * The appearance comes from `state.doc`, which the render pass rebuilt from the
   * settings — so a document edited in `settings.yaml` and reloaded, or typed into
   * the row, reaches the tab through the same path and cannot go stale.
   *
   * The motion override comes from the tick, which is what makes a driven motion
   * work: `blink` dims, `pulse` alternates the colour, `turn` steps the angle, and
   * every one of them is just an argument to this same draw.
   *
   * @param plan - the plan the tab is showing.
   */
  const applyIcon = (plan) => {
    const doc = state.doc
    const chosen = activeLook(plan, doc.look)
    const override = state.tick === 0 ? {} : motionTick(chosen, state.tick)
    setIcon(
      doc.globals.icon === false
        ? undefined
        : sentryFavicon(plan, {
            reducedMotion: prefersReducedMotion(),
            style: doc.look,
            motion: override,
          }),
    )
  }

  /** The chime, gated on visibility, focus and the document's own rules. */
  const applySound = (alerts) => {
    const chosen = soundPlan(alerts, state.doc.sound, {
      now: Date.now(),
      lastSoundAt: state.lastSoundAt,
      hidden: document.hidden === true,
      focused: !state.unfocused && document.hasFocus?.() === true,
    })
    if (chosen === undefined) return
    state.lastSoundAt = Date.now()
    chime.play(chosen.frequencies, chosen.gain)
  }

  /** Recompute everything from the current subscriptions and settings. */
  const render = () => {
    if (state.disposed) return
    const now = Date.now()
    // The document first: the plan's completed window and everything the three
    // channels draw come from it, so nothing below reads a stale parse.
    state.doc = resolveStyle(state.settings.style)
    // The completion edge is noted before the plan is built, so a session that has
    // just stopped running shows its green signal on this very pass.
    const edges = noteRunningEdges(state.running, list(), stampStore.readStamps(), now)
    if (edges.stamps !== state.stamps) stampStore.writeStamps(edges.stamps)
    state.running = edges.running
    state.stamps = edges.stamps

    const live = sessionPlan(list(), pending(), edges.stamps, {
      now,
      doneWindowMs: state.doc.globals.keepDoneMs,
    })
    // The alert diff is against the LIVE plan and never against what is on screen:
    // a preview is a picture of a state, not an event, so it must not eat a chime or
    // make the next real arrival look like it has already been reported.
    const alerts = changeAlerts(state.plan, live)
    state.plan = live
    // What the tab shows is the live plan, unless the settings row asked to see one
    // state — which is the only way to judge a configuration change for a state that
    // no session happens to be in right now.
    state.shown = state.preview === undefined ? live : previewPlan(state.preview)
    applyIcon(state.shown)
    applyTitle(state.shown)
    applySound(alerts)
    applyMotion(state.shown)
  }

  /**
   * Start, keep, or stop the repaint timer a driven motion needs.
   *
   * The timer is owned by the state rather than by the draw, and its interval is
   * the motion's own tick. It is stopped the moment nothing is animating — which
   * matters more than it looks: a background tab's timers are throttled, but an
   * idle tab with no sessions should not be holding one at all.
   *
   * @param plan - the plan the tab is showing.
   */
  const applyMotion = (plan) => {
    const doc = state.doc
    const chosen = activeLook(plan, doc.look)
    const interval =
      doc.globals.icon === false ? undefined : tickInterval(chosen, prefersReducedMotion())
    const wanted = interval ?? null
    if (wanted === state.motionInterval) return
    if (state.motionTimer !== undefined) {
      clearInterval(state.motionTimer)
      state.motionTimer = undefined
    }
    state.motionInterval = wanted
    if (wanted === null) return
    state.motionTimer = setInterval(() => {
      state.tick += 1
      // The plan the render pass chose, so a preview keeps its own motion while the
      // sessions underneath carry on being watched by `state.plan`.
      applyIcon(state.shown)
    }, wanted)
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  //
  // Every subscription is registered through `ctx.effect`, so teardown is the
  // framework's business rather than a list of disposers this file has to keep in
  // step with its own install order.

  const sessionList = ctx.sessions?.list
  if (typeof sessionList?.subscribe === 'function') {
    ctx.effect(() => sessionList.subscribe(render), 'dsh-sentry: session list subscription')
  } else {
    reportMissingSource('the session list')
  }

  const interactions = pendingSource()
  if (interactions !== undefined) {
    ctx.effect(
      () => interactions.subscribe(render),
      'dsh-sentry: pending interaction subscription',
    )
  } else {
    reportMissingSource('the pending-interaction source')
  }

  // Focus, blur, and visibility all change whether a sound is allowed, and coming
  // back to the foreground also has to redraw: a session that finished while the
  // user was away has already been reported by the icon they are now looking at.
  //
  // Visibility also ends a preview, and that rule belongs here rather than only in the
  // row: the row can be unmounted or re-rendered out of step, but the engine is the
  // thing that must never let the tab claim a state nobody asked for any more. There
  // is no preview to see once the page is out of sight — the tab strip is precisely
  // what this plugin exists to make honest.
  ctx.effect(() => {
    const onFocus = () => {
      state.unfocused = false
      render()
    }
    const onBlur = () => {
      state.unfocused = true
    }
    const onVisibility = () => {
      if (document.hidden === true) state.preview = undefined
      render()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, 'dsh-sentry: visibility and focus listeners')

  // The autoplay unlock: one gesture is all the browser wants, so the listeners
  // stay registered — a second gesture costs nothing and a page that removed them
  // could not re-unlock after the context is suspended again.
  ctx.effect(() => {
    const unlock = () => {
      chime.resume()
    }
    window.addEventListener('pointerdown', unlock, { capture: true })
    window.addEventListener('keydown', unlock, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, 'dsh-sentry: audio unlock listeners')

  // The title belongs to `ui-layout`, which rewrites it on session change; this
  // observer puts the prefix back when that happens, and the writing guard keeps
  // the plugin's own write from re-entering.
  ctx.effect(() => {
    if (typeof MutationObserver !== 'function') return () => {}
    const target = document.querySelector('title')
    if (target === null) return () => {}
    const observer = new MutationObserver(() => {
      if (state.writing) return
      applyTitle(state.shown)
    })
    observer.observe(target, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-sentry: title observer')

  ctx.effect(
    () => () => {
      state.disposed = true
      state.preview = undefined
      if (state.motionTimer !== undefined) clearInterval(state.motionTimer)
      state.motionTimer = undefined
      icon.remove()
      chime.dispose()
    },
    'dsh-sentry: element teardown',
  )

  const store = createRowStore()

  /**
   * The actions of the store instance the registry mounted for this entry.
   *
   * This is the whole point of the inject face, and getting it wrong is silent:
   * the registry mints one instance per entry and hands back its actions, and
   * *that* instance is the one the row renders from. Calling `store.create()`
   * here instead would build a second, unwatched instance, sync it happily, and
   * leave the rendered one on its `init()` values — which is exactly how the
   * first version of this shipped a row that never appeared.
   */
  let bound

  /**
   * Bring the row's store in line with the live settings.
   *
   * The fallback matters: on an untouched install there is no `alert` section
   * yet, so the scope reports an absent value — and the row still has to render
   * its defaults, or the plugin would be a blank row until the user wrote a
   * setting it had no control to write. `resolveSettings` is the same function
   * the engine uses, so the row and the engine cannot disagree about a default.
   */
  const syncRow = () => {
    const snapshot = scope.getSnapshot()
    bound?.sync(resolveSettings(snapshot.value), snapshot.revision)
  }

  /** Whether a settings answer has painted yet; see the two `adopt` callers. */
  let painted = false

  /** Paint what the live scope holds, or the resolved defaults when it holds nothing. */
  const adopt = () => {
    painted = true
    state.settings = resolveSettings(scope.getSnapshot().value)
    syncRow()
    render()
  }

  // Bind the durable section through whichever settings API this dsh provides,
  // and follow it while it stays: a replacement or an unload puts the sentry back
  // on its defaults. Only the first bind counts, so a composition carrying both
  // services (no released dsh does) cannot double-subscribe.
  let boundSettings = false

  /**
   * Adopt one bound scope and follow it.
   * @param binding - the child context the scope was obtained from.
   * @param bound - the scope to read and write.
   * @returns the disposer the injecting fiber collects.
   */
  const bindSettings = (binding, bound) => {
    if (boundSettings) return undefined
    boundSettings = true
    scope = bound
    binding.effect(() => bound.subscribe(adopt), 'dsh-sentry: settings adoption')
    adopt()
    return () => {
      boundSettings = false
      scope = missingSettingsScope()
      adopt()
    }
  }

  // dsh 0.1.7+: the entry's own configuration form, by Loader entry id.
  ctx.inject([CONFIG_FORMS_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      decodedForm(settingsCtx[CONFIG_FORMS_SERVICE].get(SENTRY_NAMESPACE)),
    ),
  )

  // dsh 0.1.5-rc.x: the registered namespace, decoded by the scope itself.
  ctx.inject([SETTINGS_SCOPE_SERVICE], (settingsCtx) =>
    bindSettings(
      settingsCtx,
      settingsCtx[SETTINGS_SCOPE_SERVICE].bind({
        namespace: SENTRY_NAMESPACE,
        decode: decodeSentrySection,
      }),
    ),
  )

  // Exactly one paint per settings answer: a bind that happened during activation
  // has painted already, and this covers the composition whose service never
  // arrives — the sentry still has to run, on its defaults.
  if (!painted) adopt()

  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-sentry: settings row dictionaries',
  )

  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register(
      {
        name: 'settings.general.item',
        id: 'alert',
        order: 14,
        store,
        locale: LOCALE_NAMESPACE,
        inject: (actions) => {
          bound = actions
          syncRow()
          return {
            setField: (field, value) => {
              scope.set(field, value)
            },
            reset: () => {
              for (const field of SETTINGS) scope.unset(field.id)
            },
            // One state's chime, played on demand by the row's preview cards. The
            // notes and the gain are whatever the row resolved out of the document,
            // so what is heard is what the card printed beside it — and the click is
            // the gesture the autoplay policy waits for, which is why there is no
            // separate "unlock audio" button.
            audition: (frequencies, gain) => {
              chime.resume()
              chime.play(frequencies, gain)
            },
            // Show one state in the tab itself, or with no name go back to the live
            // plan. The row owns this: it sets it when a card is clicked and clears it
            // when the card is clicked again, when the page stops being visible, and
            // when the settings page goes away — a preview that outlived the screen
            // that explains it would be the tab lying about the sessions.
            preview: (name) => {
              state.preview = name
              render()
            },
          }
        },
      },
      AlertRow,
    ),
  )
}

/**
 * `localStorage`, or undefined when it is absent or hostile.
 *
 * The property access itself throws in some privacy configurations, which is why
 * this is a function with a `try` rather than a `const` — a plugin that cannot
 * persist should lose its stamps, not its activation.
 * @returns the storage, or undefined.
 */
function safeStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage ?? undefined
  } catch {
    return undefined
  }
}











