window.__ModuleLoader__.load({
	id: "@citisen/dsh-sentry",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
 * Why this needs no _react and no slot
 * -----------------------------------
 * The state this plugin reacts to is reachable from the cordis context itself:
 * `ctx.sessions.list` and `ctx.uiSession.pendingInteractions` are both
 * `{ getSnapshot(), subscribe() }` observables owned by services the Web
 * composition always installs — the same objects `ui-session` hands to the
 * `useSessions` / `useSessionPendingInteraction` hook seats. So the whole engine
 * is plain DOM plus two subscriptions, and _react appears exactly once, in the
 * Settings row, because the slot system is _react. That is why this plugin
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

		let _react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
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
const PLUGIN_ID = "@citisen/dsh-sentry"

// ─── the state model ─────────────────────────────────────────────────────────

/**
 * The four states a session can be in, most urgent first.
 *
 * `waiting` and `approval` are the two halves of "a human must act": the agent
 * asked a question (`ask_user_question`, which includes the plan-review card) or
 * requested a permission escalation. They are separate states because they want
 * different sounds, and because a session blocked on approval and a session
 * blocked on a question are different situations to come back to.
 */
const STATES = ['waiting', 'approval', 'running', 'done']

/** Ring and badge colors, one per state. */
const STATE_COLORS = {
  waiting: '#f59e0b',
  approval: '#f59e0b',
  running: '#4d6bfe',
  done: '#22c55e',
}

/**
 * How long a finished session keeps the green "done" signal, by default.
 *
 * Deliberately not the session's `completed` flag: that stays true until the user
 * selects the session, so trusting it would leave the tab green forever and cost
 * the signal all of its meaning. This is a decay window measured from the
 * running → idle edge instead.
 */
const DEFAULT_DONE_WINDOW_MS = 60_000

/** The shortest gap between two chimes, in ms. */
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
  'M48.8354 10.0479C48.3232 9.79199 48.1025 10.2798 47.8032 10.5278C47.7007 10.6079 47.6143 10.7119 47.5273 10.8076C46.7793 11.624 45.9048 12.1597 44.7622 12.0957C43.0923 12 41.666 12.5356 40.4058 13.8398C40.1377 12.2319 39.2476 11.272 37.8926 10.6558C37.1836 10.3359 36.4668 10.0156 35.9702 9.31982C35.6235 8.82373 35.5293 8.27197 35.356 7.72754C35.2456 7.3999 35.1353 7.06396 34.7651 7.00781C34.3633 6.94385 34.2056 7.2876 34.0479 7.57568C33.418 8.75195 33.1733 10.0479 33.1973 11.3599C33.2524 14.312 34.4736 16.6641 36.8999 18.3359C37.1758 18.5278 37.2466 18.7197 37.1597 19C36.9946 19.5757 36.7974 20.1357 36.624 20.7119C36.5137 21.0801 36.3486 21.1597 35.9624 21C34.6309 20.4321 33.481 19.5918 32.4644 18.5757C30.7393 16.8721 29.1792 14.9917 27.2334 13.52C26.7764 13.1758 26.3193 12.856 25.8467 12.5518C23.8618 10.584 26.1069 8.96777 26.627 8.77588C27.1704 8.57568 26.8159 7.8877 25.0591 7.896C23.3022 7.90381 21.6953 8.50391 19.647 9.30371C19.3477 9.42383 19.0322 9.51172 18.7095 9.58398C16.8501 9.22363 14.9199 9.14355 12.9033 9.37598C9.10596 9.80762 6.07275 11.6396 3.84326 14.7681C1.16455 18.5278 0.53418 22.7998 1.30664 27.2559C2.11768 31.9521 4.46582 35.8398 8.07373 38.8799C11.8159 42.0322 16.1255 43.5762 21.041 43.2803C24.0269 43.104 27.3516 42.6963 31.1016 39.4561C32.0469 39.936 33.0396 40.1279 34.686 40.272C35.9546 40.3921 37.1758 40.208 38.1211 40.0078C39.6021 39.688 39.4995 38.2881 38.9639 38.0322C34.623 35.9678 35.5762 36.8081 34.71 36.1279C36.9155 33.4639 40.2402 30.6958 41.54 21.728C41.6426 21.0161 41.5557 20.5679 41.54 19.9917C41.5322 19.6396 41.6108 19.5039 42.0049 19.4639C43.0923 19.3359 44.1479 19.0317 45.1167 18.4878C47.9292 16.9199 49.064 14.3438 49.3315 11.2559C49.3711 10.7837 49.3237 10.2959 48.8354 10.0479ZM24.3262 37.8398C20.1196 34.4639 18.0791 33.3521 17.2358 33.3999C16.4482 33.4482 16.5898 34.3682 16.7632 34.9678C16.9443 35.5601 17.1812 35.9683 17.5117 36.4878C17.7402 36.832 17.8979 37.3442 17.2832 37.728C15.9282 38.584 13.5728 37.4399 13.4624 37.3838C10.7207 35.7358 8.42822 33.5601 6.81348 30.584C5.25342 27.7197 4.34766 24.6479 4.19775 21.3677C4.1582 20.5757 4.38672 20.2959 5.15869 20.1519C6.17529 19.96 7.22314 19.9199 8.23926 20.0718C12.5327 20.7119 16.1885 22.6719 19.2529 25.7759C21.002 27.5439 22.3252 29.6558 23.6885 31.7202C25.1377 33.9121 26.6978 36 28.6831 37.7119C29.3843 38.312 29.9434 38.7681 30.479 39.104C28.8643 39.2881 26.1699 39.3281 24.3262 37.8398ZM26.3433 24.6001C26.3433 24.248 26.6191 23.9678 26.9658 23.9678C27.0444 23.9678 27.1152 23.9839 27.1782 24.0078C27.2651 24.04 27.3438 24.0879 27.4067 24.1602C27.5171 24.272 27.5801 24.4321 27.5801 24.6001C27.5801 24.9521 27.3042 25.2319 26.9575 25.2319C26.6108 25.2319 26.3433 24.9521 26.3433 24.6001ZM32.6064 27.8799C32.2046 28.0479 31.8027 28.1919 31.4165 28.208C30.8179 28.2397 30.1641 27.9922 29.8096 27.688C29.2583 27.2158 28.8643 26.9521 28.6987 26.1279C28.6279 25.7759 28.6675 25.2319 28.7305 24.9199C28.8721 24.248 28.7144 23.8159 28.2495 23.4238C27.8716 23.104 27.3911 23.0161 26.8633 23.0161C26.666 23.0161 26.4849 22.9277 26.3511 22.856C26.1304 22.7441 25.9492 22.4639 26.1226 22.1201C26.1777 22.0078 26.4458 21.7358 26.5088 21.688C27.2256 21.272 28.0527 21.4077 28.8169 21.7197C29.5259 22.0161 30.0615 22.5601 30.834 23.3281C31.6216 24.2559 31.7632 24.5117 32.2124 25.208C32.5669 25.752 32.8901 26.312 33.1104 26.9521C33.2446 27.3521 33.0713 27.6802 32.6064 27.8799Z'

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
  const kind = entry?.kind
  if (kind === 'question') return 'waiting'
  if (kind === 'approval') return 'approval'
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

// ─── the favicon ─────────────────────────────────────────────────────────────

/**
 * The style DSL.
 *
 * A tab icon is not a form: it is four states, each a colour, a background shape,
 * a carved pattern, and a motion, and the interesting part is the *combinations*.
 * A dozen switches could express that; they would also take a dozen interactions
 * to say what one line says. So the whole appearance is one small text document,
 * and the settings row gives it a text box and the documentation.
 *
 * The syntax is line-oriented on purpose. Every line is one `key value` pair, and
 * a line naming a state opens a rule until the next one:
 *
 *   # comments and blank lines are ignored
 *   fallback none                      # when no state applies
 *   running  circle blue spokes=2 arrow turn 3
 *   waiting  rounded amber none blink 1.1
 *
 * The parser is total: anything it does not understand is dropped and reported,
 * and the shipped defaults are used for whatever the document does not say. A
 * typo in a settings file must not be able to leave a tab without an icon.
 *
 * @module dsh-sentry/style
 */

/** The background shapes a rule may name. */
const SHAPES = ['circle', 'rounded', 'square', 'none']

/**
 * The patterns a rule may carve out of the background.
 *
 * Empty, and that is a finding rather than an omission: every pattern that did not
 * involve the fish itself was tried on a real 16px favicon and read as noise —
 * clock hands made the icon look like a watch, petals and windmill blades turned it
 * into a smudge. The literal `none` is still accepted for the `pattern=` option, so
 * a document written against an earlier release parses and says what it means; it
 * is deliberately **not** a bare-word alternative, because `none` is also a shape
 * and a token cannot mean two things.
 */
const PATTERNS = []

/** The motions a rule may apply. */
const MOTIONS_LIST = ['still', 'turn', 'blink', 'flush']

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

/** What an unconfigured install draws. */
const DEFAULT_STYLE = [
  'running  circle  blue  turn   3',
  'waiting  rounded amber blink  1.1',
  'approval rounded amber blink  1.9',
  'done     circle  green flush  1.6',
].join('\n')

/** The states a document may address, in the order the help text lists them. */
const STYLE_STATES = ['running', 'waiting', 'approval', 'done']

/**
 * Whether a bare token is a legal value for one positional slot.
 *
 * The check exists so a typo is *reported* rather than quietly landing in a slot
 * whose coercion will later discard it. A line that says `nope` should say so;
 * silence would leave the user staring at an unchanged icon with no explanation.
 *
 * @param slot - the slot name.
 * @param token - the bare token.
 * @returns whether it fits.
 */
function fitsSlot(slot, token) {
  if (slot === 'shape') return SHAPES.includes(token)
  if (slot === 'color') return PRESET_COLORS[token] !== undefined
  if (slot === 'pattern') return PATTERNS.includes(token)
  if (slot === 'motion') return MOTIONS_LIST.includes(token)
  return Number.isFinite(Number.parseFloat(token))
}

/**
 * Parse one style document.
 *
 * A line is a state name followed by tokens. A token is either `key=value` or a
 * bare word, and a bare word is placed in the first slot the line has not filled:
 * shape, then colour, then pattern, then motion, then speed. Two shapes of token
 * are worth calling out because they read as one thing and set two:
 * `spokes=3` sets the pattern *and* its count, and a trailing bare number with
 * every other slot filled is the speed — so both `spokes=2 dot turn 3` and
 * `speed=3` mean what they look like.
 *
 * @param text - the document, or anything else a settings file happened to hold.
 * @returns `{ rules, problems }` — a rule per state, plus a human-readable note
 *   for every token that was ignored.
 */
function parseStyle(text) {
  const rules = {}
  const problems = []
  if (typeof text !== 'string' || text.trim() === '') return { rules, problems }

  const OPTIONS = ['shape', 'color', 'pattern', 'motion', 'speed', 'bg']
  const POSITIONAL = ['shape', 'color', 'pattern', 'motion', 'speed']

  let current
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (line === '') continue
    const tokens = line.split(/[\s,]+/).filter((token) => token !== '')
    const name = tokens.shift()
    if (name === undefined) continue

    if (STYLE_STATES.includes(name)) {
      current = { state: name }
      rules[name] = current
    } else {
      problems.push(`unknown state "${name}"`)
      current = undefined
      continue
    }

    for (const token of tokens) {
      const equals = token.indexOf('=')
      const key = equals === -1 ? undefined : token.slice(0, equals)
      const value = equals === -1 ? undefined : token.slice(equals + 1)

      if (key !== undefined && OPTIONS.includes(key)) {
        // `pattern=none` is how a document says "carve nothing" now that the bare
        // word belongs to the shape slot. It is the same fact either way.
        current[key] = value
        continue
      }
      // A token whose left side names a pattern is that pattern, with its count:
      // `spokes=3` is what the shipped defaults used to say.
      if (key !== undefined && PATTERNS.includes(key)) {
        current.pattern = key
        if (value !== '') current.marks = value
        continue
      }
      if (key !== undefined) {
        problems.push(`${name}: unknown option "${key}"`)
        continue
      }
      if (PATTERNS.includes(token)) {
        current.pattern = token
        continue
      }
      if (MOTIONS_LIST.includes(token)) {
        current.motion = token
        continue
      }
      if (SHAPES.includes(token)) {
        current.shape = token
        continue
      }
      if (PRESET_COLORS[token] !== undefined) {
        current.color = token
        continue
      }
      // A bare number can only be the rate. Placing it in whatever slot happens to
      // be free next would put it in `color` on a line that named a shape and a
      // motion and skipped the rest — which is exactly the documented
      // `running none turn 3`, and it used to be reported as an invalid colour.
      if (Number.isFinite(Number.parseFloat(token))) {
        current.speed = token
        continue
      }
      const next = POSITIONAL.find((slot) => current[slot] === undefined)
      if (next === undefined) problems.push(`${name}: unexpected "${token}"`)
      else if (fitsSlot(next, token)) current[next] = token
      else problems.push(`${name}: "${token}" is not a valid ${next}`)
    }
  }
  return { rules, problems }
}

/**
 * Coerce one parsed rule into something drawable, or undefined to keep the
 * default. Every field is checked here rather than at draw time, so a bad value
 * degrades to the shipped appearance instead of to a broken SVG.
 *
 * @param rule - the parsed rule.
 * @param defaults - the shipped rule for that state.
 * @returns the resolved look.
 */
function resolveLook(rule, defaults) {
  if (rule === undefined) return { ...defaults }

  const shape = SHAPES.includes(rule.shape) ? rule.shape : defaults.shape
  const color =
    PRESET_COLORS[rule.color] !== undefined
      ? rule.color
      : PRESET_COLORS[rule.bg] !== undefined
        ? rule.bg
        : defaults.color
  const pattern = PATTERNS.includes(rule.pattern) ? rule.pattern : defaults.pattern
  const motion = MOTIONS_LIST.includes(rule.motion) ? rule.motion : defaults.motion
  const speed = Number.parseFloat(rule.speed ?? '')

  return {
    shape,
    color,
    pattern,
    motion,
    speed: Number.isFinite(speed) && speed >= 0.2 && speed <= 20 ? speed : defaults.speed,
  }
}

/**
 * The shipped look per state, before any document is applied.
 *
 * These are the defaults the documentation quotes, and the ones a rule inherits
 * field by field: naming only a colour in a document keeps the shipped shape,
 * pattern, and motion for that state.
 *
 * `running` turns the **fish**, not a pattern. A dial-like ring of spokes was
 * tried and read as a watch face rather than as a state; the fish is the thing
 * this icon is about, so the fish is the thing that moves.
 */
const DEFAULT_LOOK = {
  running: { shape: 'circle', color: 'blue', pattern: 'none', motion: 'turn', speed: 3 },
  waiting: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.1 },
  approval: { shape: 'rounded', color: 'amber', pattern: 'none', motion: 'blink', speed: 1.9 },
  done: { shape: 'circle', color: 'green', pattern: 'none', motion: 'flush', speed: 1.6 },
}

/** The appearance a document resolves to, per state. */
const STYLE_FALLBACK_LOOK = { shape: 'none', color: 'gray', pattern: 'none', motion: 'still', speed: 1 }

/**
 * Resolve a whole document against the shipped defaults.
 * @param text - the document.
 * @returns `{ look, problems }` — a resolved appearance per state.
 */
function resolveStyle(text) {
  const { rules, problems } = parseStyle(text)
  const look = {}
  for (const state of STYLE_STATES) {
    look[state] = resolveLook(rules[state], DEFAULT_LOOK[state])
  }
  look.fallback = resolveLook(undefined, STYLE_FALLBACK_LOOK)
  return { look, problems }
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
 * The carved pattern for one look.
 *
 * Every mark is drawn black, because black is what the mask cuts away: the
 * background is the only thing with a colour, and everything carved out of it
 * shows the tab bar through. That is the whole reason the icon survives a browser
 * theme this plugin cannot see.
 *
 * Nothing here survives the vocabulary except the fish, which is carved by
 * {@link sentryFavicon} itself rather than by this function. The dial-like
 * patterns this used to draw — spokes, hands, petals, windmill, dots, rays — were
 * all tried at the real 16px size and all of them read as noise around a fish
 * nobody could then see. A shape slot with one legal value is not a wasted slot:
 * it is the record of a question that got answered.
 *
 * @param look - the resolved appearance.
 * @returns the SVG elements.
 */
function patternShapes(look) {
  void look
  return ''
}

/**
 * The motion for one look, as a **static** animation element.
 *
 * Only `turn` is left to SMIL, and only because it is stateless: a rotating group
 * is the same drawing at every instant, so a declarative animation costs nothing
 * and needs no bookkeeping. `blink` and `flush` change something the drawing
 * itself carries — a dim flag, a pulsing colour — and are driven by
 * {@link motionTick} instead.
 *
 * That split is not an aesthetic choice. A favicon is rendered in a document the
 * page does not own, and the motion categories do not have equal standing there:
 * the first version of this relied on a transform animation for the spin and on
 * presentation animations for the pulse, and was reported as "the animation does
 * not move". Driving the repaint from the plugin removes the question entirely —
 * the plugin already rebuilds the data URL on every state change, so a motion
 * that is a function of time is the same code path with a timer in front of it.
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
 * The colour a `flush` pulses toward.
 * @param name - the preset name.
 * @returns the partner hex.
 */
function flushPartner(name) {
  return name === 'green' ? PRESET_COLORS.blue : PRESET_COLORS.green
}

/**
 * What one repaint of a driven motion looks like.
 *
 * The result is handed straight to {@link sentryFavicon}, which makes a motion a
 * function from a tick count to an appearance and nothing else — and therefore
 * verifiable in Node, with no browser and no clock: `blink` dims on alternate
 * half-periods, `flush` alternates the colour once per period, and `turn` steps
 * the angle. Every rate is expressed in the seconds the DSL's `speed` already
 * means, so a document that says `blink 1.1` still gets a 1.1-second breath.
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
  if (look.motion === 'flush') {
    const ticks = Math.max(1, Math.round((look.speed * 1000) / TICK_MS))
    return {
      color: Math.floor(tick / ticks) % 2 === 1 ? flushPartner(look.color) : PRESET_COLORS[look.color],
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
 * The fish's own scale: the shipped art is a 50×50 drawing, so placing it at full
 * size in the 32px canvas is exactly `32/50`.
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
const FISH_FULL_SCALE = 32 / 50

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
 * The favicon, as an SVG string: a state-coloured background with the fish and the
 * state's pattern carved out of it.
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

  // The fish, centered by construction: the translate puts the art's own 50-unit
  // centre on the canvas centre, so no margin arithmetic can drift it.
  //
  // A `turn` rotates the fish itself, about the canvas centre. That is the state
  // indicator the running state gets: the icon is *about* this glyph, so the glyph
  // is what moves, and nothing else has to be drawn to say "working". The scale
  // drops a little while it turns so the swept corners stay inside the background
  // (see {@link FISH_TURN_SCALE}).
  const spin = motion.angle === undefined || motion.angle === 0 ? 0 : round2(motion.angle)
  const scale = spin === 0 ? FISH_FULL_SCALE : FISH_FULL_SCALE * FISH_TURN_SCALE
  const shift = round2(16 - 16 * scale)
  const placed =
    `translate(${String(shift)} ${String(shift)}) scale(${String(scale)}) translate(-16 -16) translate(16 16)`
  const fish = `<g transform="${placed}"><path d="${FISH_PATH}" fill="#000" fill-rule="nonzero"/></g>`

  // The mask is the background: everything drawn on it in black is carved out, so
  // the fish is negative space and its silhouette is always the tab bar showing
  // through. Rotating it here rather than on the painted layer is what keeps the
  // background's outline still — a turning background would read as a spinning
  // badge, not as a working fish.
  const carvings =
    spin === 0 ? fish : `<g transform="rotate(${String(spin)} 16 16)">${fish}</g>` + patternShapes(chosen)

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
 * The chime table: what each alert sounds like, synthesized rather than shipped.
 *
 * Two short notes rising for a question — the one alert that means "stop what you
 * are doing" — a single note for an approval, and one soft low note for a
 * completion, which is information rather than a demand. The frequencies are the
 * equal-tempered A5 and E6, so the two-note chime is a real musical interval
 * rather than two arbitrary beeps.
 */
const CHIME_NOTES = {
  questions: [
    { frequency: 880, startMs: 0, durationMs: 110, peak: 1 },
    { frequency: 1318.5, startMs: 95, durationMs: 150, peak: 0.9 },
  ],
  approvals: [{ frequency: 880, startMs: 0, durationMs: 130, peak: 0.85 }],
  completed: [{ frequency: 440, startMs: 0, durationMs: 110, peak: 0.45 }],
}

/**
 * Which alert, if any, may make a sound right now.
 *
 * Two rules, both deliberate and both easy to get wrong:
 *
 * - **Foreground is silence.** When the user is looking at the interface the
 *   favicon and the title have already said it, and a chime on top of that is
 *   noise. Only a hidden document or an unfocused window earns a sound — and the
 *   `soundBlocked` setting is how a user who disagrees turns the rule off.
 * - **One sound per burst.** Agents ask several questions in a row; three chimes
 *   in three seconds reads as a malfunction. The gap is measured against a
 *   caller-supplied clock instead of a timer, because a background tab throttles
 *   `setTimeout` to the minute and a timer-based gap would fire late or not at all.
 *
 * @param alerts - the alert set from {@link changeAlerts}.
 * @param settings - the resolved settings section.
 * @param state - `{ now, lastSoundAt, hidden, focused }`.
 * @returns the chime kind to play, or undefined for silence.
 */
function soundPlan(alerts, settings, state) {
  if (settings.sound === false) return undefined
  if (settings.soundBlocked !== false && !state.hidden && state.focused) return undefined
  if (typeof state.lastSoundAt === 'number' && state.now - state.lastSoundAt < SOUND_GAP_MS) {
    return undefined
  }
  if (alerts.questions.length > 0 && settings.soundWaiting !== false) return 'questions'
  if (alerts.approvals.length > 0 && settings.soundApproval !== false) return 'approvals'
  if (alerts.completed.length > 0 && settings.soundDone === true) return 'completed'
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
 * button exists partly to be the gesture that unlocks this for the session.
 *
 * @param options - `{ AudioContextClass, volume }`, both injectable for tests.
 * @returns the player: `{ play, resume, dispose }`.
 */
function createChime(options) {
  const { AudioContextClass, volume } = options
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
     * @param kind - a key of {@link CHIME_NOTES}.
     * @returns whether a sound was actually scheduled.
     */
    play(kind) {
      const audio = ensure()
      if (audio === undefined) return false
      player.resume()
      if (audio.state === 'suspended') return false
      const notes = CHIME_NOTES[kind] ?? []
      const gain = typeof volume === 'number' ? volume : 0.5
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
        envelope.gain.linearRampToValueAtTime(note.peak * gain, begin + 0.012)
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
 * The ids are also the host schema's field names, and the two halves of the
 * bundle are separate graphs that cannot share a module — so the list is
 * duplicated by hand in `lib/index.js` and `scripts/verify-client.mjs` compares
 * the two copies, which turns a silent drift (a switch that writes a key no
 * engine reads) into a failing check.
 *
 * Every channel defaults to on, on the principle that a feature nobody can
 * discover is a feature nobody has: each switch is there to get out of the way
 * once the notice has been noticed, not to gate the plugin behind a setup step.
 * The completion chime is the easiest one to want off — a finished turn is
 * ambient information, and chiming on every one is how people end up muting
 * everything — so its hint says so and it sits last in the sound group.
 */
const SETTINGS = [
  { id: 'favicon', kind: 'boolean', default: true, labelKey: 'alert.setting.favicon', hintKey: 'alert.setting.faviconHint' },
  { id: 'style', kind: 'text', default: DEFAULT_STYLE, labelKey: 'alert.setting.style', hintKey: 'alert.setting.styleHint' },
  { id: 'title', kind: 'boolean', default: true, labelKey: 'alert.setting.title', hintKey: 'alert.setting.titleHint' },
  { id: 'sound', kind: 'boolean', default: true, labelKey: 'alert.setting.sound', hintKey: 'alert.setting.soundHint' },
  { id: 'soundWaiting', kind: 'boolean', default: true, labelKey: 'alert.setting.soundWaiting', hintKey: 'alert.setting.soundWaitingHint' },
  { id: 'soundApproval', kind: 'boolean', default: true, labelKey: 'alert.setting.soundApproval', hintKey: 'alert.setting.soundApprovalHint' },
  { id: 'soundDone', kind: 'boolean', default: true, labelKey: 'alert.setting.soundDone', hintKey: 'alert.setting.soundDoneHint' },
  { id: 'soundBlocked', kind: 'boolean', default: true, labelKey: 'alert.setting.soundBlocked', hintKey: 'alert.setting.soundBlockedHint' },
  { id: 'volume', kind: 'number', default: 0.5, labelKey: 'alert.setting.volume', hintKey: 'alert.setting.volumeHint' },
  { id: 'doneWindowMs', kind: 'number', default: DEFAULT_DONE_WINDOW_MS, labelKey: 'alert.setting.doneWindow', hintKey: 'alert.setting.doneWindowHint' },
]

/** The whole-section defaults, as the host schema resolves an empty document. */
const SETTING_DEFAULTS = Object.fromEntries(SETTINGS.map((field) => [field.id, field.default]))

/**
 * Coerce one stored value to the shape the engine reads.
 *
 * The settings document is user-editable YAML and the wire carries whatever it
 * holds, so a numeric field accepts a numeric string and an out-of-range value is
 * clamped rather than rejected: a typo in `settings.yaml` should shrink the fish,
 * not disable the favicon.
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
  if (!Number.isFinite(numeric)) return undefined
  if (field.id === 'volume') return Math.min(1, Math.max(0, numeric))
  if (field.id === 'doneWindowMs') return Math.min(600_000, Math.max(0, numeric))
  return numeric
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
  'alert.setting.favicon': '标签图标状态样式',
  'alert.setting.faviconHint':
    '关掉就恢复成原来的 favicon。开启时标签图标是一块纯色背景，鱼和状态图案从背景里镂空出来 —— 所以鱼的轮廓永远是标签栏透出来的颜色，任何主题下都看得清。具体的颜色、形状、图案和动效由下面的样式文档决定。',
  'alert.setting.style': '样式文档',
  'alert.setting.styleHint':
    '每个状态一行，四行决定四种状态的样子。写错的关键字会被忽略并退回默认值，不会让图标消失。展开下方说明可查全部可用的原语。',
  'alert.style.help': '语法与原语说明',
  'alert.style.syntax': '语法',
  'alert.style.syntaxLine1': '每行一个状态：状态 形状 颜色 动效 速度',
  'alert.style.syntaxLine2': '形状/颜色/动效可以按顺序写，也可以写成 键=值；数字一定是速度（秒）。例如 shape=none 或 rounded purple turn 1.4',
  'alert.style.syntaxLine3': '# 开头是注释；没写的字段沿用该状态的默认值；同一行里后面的值覆盖前面的',
  'alert.style.shapes': '形状 shape',
  'alert.style.patterns': '图案 pattern（目前只剩 none，试过的表盘类图案在 16px 下都只是噪点）',
  'alert.style.motions': '动效 motion',
  'alert.style.colors': '颜色 color（预设）',
  'alert.style.colorsLine': '只接受预设名，不接受任意色值：本插件出过的两次事故都是对比度问题（白鱼画在白底上），预设色不会犯这个错。',
  'alert.style.defaults': '各状态默认值',
  'alert.primitive.shape.circle': '圆形',
  'alert.primitive.shape.rounded': '圆角矩形，鱼是横宽的，圆角矩形给它更好的留白',
  'alert.primitive.shape.square': '小圆角方形',
  'alert.primitive.shape.none': '不画背景板。注意：鱼是「镂空」出来的，没有背景板就没有东西可镂 —— 结果是整个图标全透明（只剩角标）。想「只要鱼」请用圆角矩形或圆形',
  'alert.primitive.motion.still': '不动',
  'alert.primitive.motion.turn': '图案旋转，速度=转一圈的秒数',
  'alert.primitive.motion.blink': '整体闪烁，速度=一次呼吸的秒数',
  'alert.primitive.motion.flush': '背景色往复变化，速度=一个来回的秒数',
  'alert.setting.title': '标签标题前缀',
  'alert.setting.titleHint':
    '在标签标题前面加上状态，例如“① 等待回答 · 我的会话 — DeepSeek Harness”。标签文字是唯一能读到准确数字的地方，和图标配合使用。',
  'alert.setting.sound': '声音提醒',
  'alert.setting.soundHint':
    '总开关。注意浏览器的自动播放策略：在你第一次点击本界面之前，提示音无法发声，这是浏览器的限制而不是插件的问题。',
  'alert.setting.soundWaiting': '等待回答时提示',
  'alert.setting.soundWaitingHint':
    '模型提问时播放一段上扬的双音，这是唯一表示“需要你立刻做决定”的声音。',
  'alert.setting.soundApproval': '等待审批时提示',
  'alert.setting.soundApprovalHint': '模型请求权限升级时播放一个单音。',
  'alert.setting.soundDone': '会话完成时提示',
  'alert.setting.soundDoneHint':
    '模型跑完一轮时播放一声很轻的低音。它属于背景信息，如果觉得吵，这里是第一个该关掉的开关。',
  'alert.setting.soundBlocked': '仅在本页不在前台时发声',
  'alert.setting.soundBlockedHint':
    '默认开启。你正看着这个界面时，标签图标和标题已经说明了一切，再响一声就是打扰；关闭后无论如何都会发声。',
  'alert.setting.volume': '音量',
  'alert.setting.volumeHint': '提示音的音量，0 到 1。',
  'alert.setting.doneWindow': '完成状态保留时间',
  'alert.setting.doneWindowHint':
    '会话结束后保持绿色信号多久（毫秒）。默认 60000，即一分钟；调大可以让“刚刚完成”更容易被注意到。',
  'alert.setting.preview': '试听',
  'alert.setting.previewHint': '播放一次提示音，同时完成浏览器的音频解锁。',
  'alert.on': '已开启',
  'alert.off': '已关闭',
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
  'alert.setting.favicon': 'Tab icon styling',
  'alert.setting.faviconHint':
    'Turn this off to restore the original favicon. When on, the tab icon is a solid background with the fish and the state pattern carved out of it — so the fish always shows the tab bar through and stays legible in any theme. Colours, shapes, patterns, and motion come from the style document below.',
  'alert.setting.style': 'Style document',
  'alert.setting.styleHint':
    'One line per state; four lines decide how the four states look. An unknown keyword is ignored and falls back to the default rather than leaving the tab without an icon. Expand the reference below for the full vocabulary.',
  'alert.style.help': 'Syntax and primitives',
  'alert.style.syntax': 'Syntax',
  'alert.style.syntaxLine1': 'one line per state: state shape colour motion speed',
  'alert.style.syntaxLine2': 'shape, colour, and motion may be positional or written as key=value; a bare number is always the speed, e.g. shape=none or rounded purple turn 1.4',
  'alert.style.syntaxLine3': '# starts a comment; anything a line omits keeps that state\u2019s default, and a later value on the same line wins',
  'alert.style.shapes': 'shape',
  'alert.style.patterns': 'pattern (only none remains; every dial-like pattern read as noise at 16px)',
  'alert.style.motions': 'motion',
  'alert.style.colors': 'colour (presets)',
  'alert.style.colorsLine': 'Preset names only, never a free colour: both failures this plugin has shipped were contrast failures, and a preset cannot be illegible.',
  'alert.style.defaults': 'Shipped defaults',
  'alert.primitive.shape.circle': 'a circle',
  'alert.primitive.shape.rounded': 'a rounded square — the fish is wider than it is tall, and this gives it room',
  'alert.primitive.shape.square': 'a slightly rounded square',
  'alert.primitive.shape.none': 'no background plate. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is entirely transparent (only the badge survives). For just-the-fish, use rounded or circle',
  'alert.primitive.motion.still': 'still',
  'alert.primitive.motion.turn': 'the pattern turns; speed is seconds per revolution',
  'alert.primitive.motion.blink': 'the whole icon blinks; speed is seconds per breath',
  'alert.primitive.motion.flush': 'the background colour pulses; speed is seconds per cycle',
  'alert.setting.title': 'Tab title prefix',
  'alert.setting.titleHint':
    'Prefixes the tab title with the status, e.g. "① Waiting · My session — DeepSeek Harness". The title text is the only place an exact number can be read, so it works with the icon rather than instead of it.',
  'alert.setting.sound': 'Sound',
  'alert.setting.soundHint':
    "Master switch. Note the browser's autoplay policy: no chime can sound until you have clicked this interface once. That is the browser's rule, not the plugin's.",
  'alert.setting.soundWaiting': 'Chime when a question waits',
  'alert.setting.soundWaitingHint':
    'A rising two-note chime when the model asks something — the one sound that means "decide now".',
  'alert.setting.soundApproval': 'Chime when an approval waits',
  'alert.setting.soundApprovalHint': 'A single note when the model requests a permission escalation.',
  'alert.setting.soundDone': 'Chime when a session finishes',
  'alert.setting.soundDoneHint':
    'A soft low note when a turn finishes. It is ambient information, so if it starts to feel like noise, this is the first switch to turn off.',
  'alert.setting.soundBlocked': 'Only when this page is in the background',
  'alert.setting.soundBlockedHint':
    'On by default. While you are looking at this interface the icon and the title have already said it, and a chime on top of that is an interruption. Turn this off to be chimed at regardless.',
  'alert.setting.volume': 'Volume',
  'alert.setting.volumeHint': 'Chime volume, 0 to 1.',
  'alert.setting.doneWindow': 'Completed signal window',
  'alert.setting.doneWindowHint':
    'How long a finished session keeps the green signal, in milliseconds. 60000 (one minute) by default; raise it if "just finished" is easy to miss.',
  'alert.setting.preview': 'Preview',
  'alert.setting.previewHint': 'Plays the chime once, which also unlocks audio for this tab.',
  'alert.on': 'On',
  'alert.off': 'Off',
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
  '.dsh-sentry-list{flex-direction:column;gap:16px;display:flex}',
  '.dsh-sentry-item{align-items:flex-start;justify-content:space-between;gap:16px;display:flex}',
  '.dsh-sentry-itemText{flex-direction:column;gap:4px;min-width:0;display:flex}',
  '.dsh-sentry-itemLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}',
  '.dsh-sentry-itemHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-switchRow{align-items:center;gap:8px;flex:none;display:flex}',
  '.dsh-sentry-state{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-switch{position:relative;box-sizing:border-box;width:36px;height:20px;padding:0;cursor:pointer;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;background:var(--dsw-alias-bg-module-platform);transition:background .15s ease,border-color .15s ease}',
  '.dsh-sentry-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary);border-color:transparent}',
  '.dsh-sentry-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);transition:left .15s ease}',
  '.dsh-sentry-switch[aria-checked="true"] .dsh-sentry-knob{left:19px}',
  '.dsh-sentry-number{align-items:center;gap:8px;flex:none;display:flex}',
  '.dsh-sentry-range{width:132px;accent-color:var(--dsw-alias-state-business-primary)}',
  '.dsh-sentry-readout{min-width:44px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-align:right;font-variant-numeric:tabular-nums}',
  '.dsh-sentry-reset{align-self:flex-start;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px}',
  '.dsh-sentry-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-preview{align-items:center;gap:6px;border:.5px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:10px;padding:5px 12px;font-family:inherit;font-size:12px;line-height:18px;display:inline-flex}',
  '.dsh-sentry-preview:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-sentry-style{flex-direction:column;gap:8px;display:flex}',
  '.dsh-sentry-textarea{box-sizing:border-box;width:100%;resize:vertical;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:12px;line-height:18px;tab-size:2}',
  '.dsh-sentry-textarea:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
  '.dsh-sentry-help{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
  '.dsh-sentry-help>summary{cursor:pointer;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-tertiary));font-size:12px;line-height:18px}',
  '.dsh-sentry-helpSection{margin-top:8px}',
  '.dsh-sentry-helpTitle{color:var(--dsw-alias-label-primary);font-weight:500}',
  '.dsh-sentry-helpLine{font-family:var(--ds-font-family-code,ui-monospace,monospace);white-space:pre-wrap}',
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
  return _deepseek_ai_dsh_client_store.defineStore({
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
 * One boolean setting's row: what it does, whether it is on, and the switch.
 *
 * A `role="switch"` button rather than a checkbox input, so the whole control is
 * one hit target that matches the design system's own toggles instead of the
 * platform's.
 * @param props - _react props.
 * @returns the item element.
 */
function SettingSwitch({ label, hint, state, checked, onToggle }) {
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-item' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-switchRow' },
      _react.createElement('span', { className: 'dsh-sentry-state' }, state),
      _react.createElement(
        'button',
        {
          type: 'button',
          role: 'switch',
          className: 'dsh-sentry-switch',
          'aria-checked': checked === true,
          'aria-label': label,
          onClick: () => {
            onToggle(checked !== true)
          },
        },
        _react.createElement('span', { className: 'dsh-sentry-knob' }),
      ),
    ),
  )
}

/**
 * One numeric setting's row: a range control plus a readout.
 *
 * A range rather than a text field because every number here is a perceptual
 * quantity — how big the fish is, how loud the chime is — and the right value is
 * found by dragging until it looks right.
 * @param props - _react props.
 * @returns the item element.
 */
function SettingNumber({ label, hint, value, min, max, step, format, onChange }) {
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-item' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-number' },
      _react.createElement('input', {
        type: 'range',
        className: 'dsh-sentry-range',
        min,
        max,
        step,
        value,
        'aria-label': label,
        onChange: (event) => {
          onChange(Number.parseFloat(event.target.value))
        },
      }),
      _react.createElement('span', { className: 'dsh-sentry-readout' }, format(value)),
    ),
  )
}

/** Range bounds and readout formatting, per numeric setting. */
const NUMBER_UI = {
  volume: { min: 0, max: 1, step: 0.05, format: (value) => `${Math.round(value * 100)}%` },
  doneWindowMs: {
    min: 0,
    max: 300_000,
    step: 5000,
    format: (value) => `${Math.round(value / 1000)}s`,
  },
}

/**
 * The style document, and the reference needed to write one.
 *
 * A text area and a `<details>` block rather than a form. The point of the DSL is
 * that the appearance is four combinations of four primitives; expressing that as
 * controls would take a dozen of them and still not say what one line says. So the
 * help text is not decoration — it *is* the interface, and it lists the closed
 * vocabulary the parser accepts.
 *
 * @param props - _react props.
 * @returns the item element.
 */
function SettingText({ label, hint, value, help, onChange }) {
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-style' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-itemText' },
      _react.createElement('div', { className: 'dsh-sentry-itemLabel' }, label),
      _react.createElement('div', { className: 'dsh-sentry-itemHint' }, hint),
    ),
    _react.createElement('textarea', {
      className: 'dsh-sentry-textarea',
      spellCheck: false,
      rows: 5,
      value,
      'aria-label': label,
      onChange: (event) => {
        onChange(event.target.value)
      },
    }),
    _react.createElement(
      'details',
      { className: 'dsh-sentry-help' },
      _react.createElement('summary', null, help.summary),
      ...help.sections.map((section, index) =>
        _react.createElement(
          'div',
          { className: 'dsh-sentry-helpSection', key: `s${String(index)}` },
          _react.createElement('div', { className: 'dsh-sentry-helpTitle' }, section.title),
          ...section.lines.map((line, lineIndex) =>
            _react.createElement('div', { className: 'dsh-sentry-helpLine', key: `l${String(lineIndex)}` }, line),
          ),
        ),
      ),
    ),
  )
}

/**
 * The style reference, rendered into the row from the vocabularies themselves.
 *
 * Built from `SHAPES`, `MOTIONS_LIST`, `PRESET_COLORS`, and `DEFAULT_LOOK` rather
 * than written out by hand, so the help cannot drift from what the parser accepts
 * — the failure mode a hand-written reference always has.
 *
 * @param t - the translator.
 * @returns `{ summary, sections }`.
 */
function styleHelp(t) {
  /** @param name - a primitive name. @returns its documented line. */
  const describe = (name) => t(`alert.primitive.${name}`)
  return {
    summary: t('alert.style.help'),
    sections: [
      {
        title: t('alert.style.syntax'),
        lines: [t('alert.style.syntaxLine1'), t('alert.style.syntaxLine2'), t('alert.style.syntaxLine3')],
      },
      {
        title: `${t('alert.style.shapes')}: ${SHAPES.join(' | ')}`,
        lines: SHAPES.map((name) => `${name} — ${describe(`shape.${name}`)}`),
      },
      {
        title: `${t('alert.style.motions')}: ${MOTIONS_LIST.join(' | ')}`,
        lines: MOTIONS_LIST.map((name) => `${name} — ${describe(`motion.${name}`)}`),
      },
      {
        title: `${t('alert.style.colors')}: ${Object.keys(PRESET_COLORS).join(' | ')}`,
        lines: [t('alert.style.colorsLine')],
      },
      {
        title: t('alert.style.defaults'),
        lines: STYLE_STATES.map((state) => {
          const look = DEFAULT_LOOK[state]
          return `${state.padEnd(9)} ${look.shape} ${look.color} ${look.pattern}${look.pattern === 'spokes' ? ` marks=${String(look.marks)} tip=${look.tip}` : ''} ${look.motion} speed=${String(look.speed)}`
        }),
      },
    ],
  }
}

/**
 * The General-settings row: one control per setting, a preview, and a reset.
 * @param props - composed slot props (`t`, `useStore`, and the inject actions).
 * @returns the row element tree.
 */
function AlertRow({ t, useStore, setField, reset, preview }) {
  const state = useStore((snapshot) => snapshot)
  return _react.createElement(
    'div',
    { className: 'dsh-sentry-row' },
    _react.createElement(
      'div',
      { className: 'dsh-sentry-head' },
      _react.createElement('div', { className: 'dsh-sentry-title' }, t('alert.title')),
      _react.createElement('div', { className: 'dsh-sentry-desc' }, t('alert.description')),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-list' },
      ...SETTINGS.map((field) => {
        const label = t(field.labelKey)
        const hint = t(field.hintKey)
        if (field.kind === 'boolean') {
          const checked = state[field.id] === true
          return _react.createElement(SettingSwitch, {
            key: field.id,
            label,
            hint,
            state: checked ? t('alert.on') : t('alert.off'),
            checked,
            onToggle: (value) => {
              setField(field.id, value)
            },
          })
        }
        if (field.kind === 'text') {
          return _react.createElement(SettingText, {
            key: field.id,
            label,
            hint,
            value: state[field.id] ?? field.default,
            help: styleHelp(t),
            onChange: (value) => {
              setField(field.id, value)
            },
          })
        }
        const ui = NUMBER_UI[field.id]
        return _react.createElement(SettingNumber, {
          key: field.id,
          label,
          hint,
          value: state[field.id],
          min: ui.min,
          max: ui.max,
          step: ui.step,
          format: ui.format,
          onChange: (value) => {
            setField(field.id, value)
          },
        })
      }),
    ),
    _react.createElement(
      'div',
      { className: 'dsh-sentry-switchRow' },
      _react.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-sentry-preview',
          title: t('alert.setting.previewHint'),
          onClick: () => {
            preview()
          },
        },
        t('alert.setting.preview'),
      ),
    ),
    _react.createElement(
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
 * The services this plugin waits for.
 *
 * `sessions` and `uiSession` are the two observables the engine reads; both are
 * installed by the Web composition's session controller, so a third-party plugin
 * reaches the same state the built-in sidebar renders from, without borrowing a
 * slot or a hook.
 */
const inject = ['slots', 'locale', 'settingsScope', 'sessions', 'uiSession']

/**
 * Client plugin body: subscribe to the session state, project it onto the three
 * background-tab channels, and register the Settings row that configures them.
 * @param ctx - client cordis context.
 */
function apply(ctx) {
  installRowStyles(ctx)

  const scope = ctx.settingsScope.bind({
    namespace: SENTRY_NAMESPACE,
    decode: (section) => {
      if (section === null || typeof section !== 'object') return undefined
      const raw = section
      return Object.fromEntries(
        SETTINGS.map((field) => [field.id, coerceSetting(field, raw[field.id]) ?? field.default]),
      )
    },
  })

  const chime = createChime({
    AudioContextClass:
      typeof window === 'undefined' ? undefined : window.AudioContext ?? window.webkitAudioContext,
    volume: SETTING_DEFAULTS.volume,
  })
  const stampStore = createStampStore(safeStorage())

  /** The single element this plugin owns; the app keeps its own favicon link. */
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.setAttribute(ICON_ATTRIBUTE, '')

  const state = {
    settings: { ...SETTING_DEFAULTS },
    plan: EMPTY_PLAN,
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
   */
  const desiredTitle = () => {
    const raw = document.title
    // Everything this plugin wrote sits behind the marker, so the app's own title
    // underneath comes off by removing the marker and the prefix — no guessing: a
    // title the app rewrites arrives without the marker and is used as-is.
    if (!raw.endsWith(TITLE_MARK)) {
      const plain = state.settings.title === false ? raw : titleWithStatus(raw, state.plan, t)
      return plain === raw ? raw : `${plain}${TITLE_MARK}`
    }

    // A title this plugin wrote. Stripping runs even when the channel is *off*,
    // because stopping writing instead would leave the prefix in the tab forever,
    // which reads as a switch that does not work.
    const bare = raw.slice(0, -TITLE_MARK.length)
    const current = bare.replace(TITLE_PREFIX, '')
    const next = state.settings.title === false ? current : titleWithStatus(current, state.plan, t)
    // Nothing left to say: return the plain app title, dropping the marker with
    // the prefix. This is the branch that takes the status off when the last
    // session goes quiet or the channel is switched off — the *stripped* text, not
    // the text as it stands, because the prefix has to go with the marker.
    return next === current ? current : `${next}${TITLE_MARK}`
  }

  /** The title: this plugin's prefix in front of whatever the app wrote. */
  const applyTitle = () => {
    const next = desiredTitle()
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
   * @returns the snapshot, or an empty map.
   */
  const pending = () => ctx.uiSession?.pendingInteractions?.getSnapshot?.() ?? new Map()

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
   * The style document is resolved on every draw rather than cached on the
   * settings change, because the parse is a few string splits over at most a
   * dozen lines — cheaper than the bookkeeping a cache would need, and it means a
   * document edited in `settings.yaml` and reloaded cannot go stale.
   *
   * The motion override comes from the tick, which is what makes a driven motion
   * work: `blink` dims, `flush` pulses the colour, `turn` steps the angle, and
   * every one of them is just an argument to this same draw.
   */
  const applyIcon = () => {
    const style = resolveStyle(state.settings.style).look
    const chosen = activeLook(state.plan, style)
    const override = state.tick === 0 ? {} : motionTick(chosen, state.tick)
    const svg =
      state.settings.favicon === false
        ? undefined
        : sentryFavicon(state.plan, {
            reducedMotion: prefersReducedMotion(),
            style,
            motion: override,
          })
    if (svg === undefined) {
      icon.remove()
      return
    }
    icon.href = faviconHref(svg)
    if (icon.parentNode === null || icon.parentNode === undefined) document.head.appendChild(icon)
  }

  /** The chime, gated on visibility, focus and the settings. */
  const applySound = (alerts) => {
    const kind = soundPlan(alerts, state.settings, {
      now: Date.now(),
      lastSoundAt: state.lastSoundAt,
      hidden: document.hidden === true,
      focused: !state.unfocused && document.hasFocus?.() === true,
    })
    if (kind === undefined) return
    state.lastSoundAt = Date.now()
    chime.play(kind)
  }

  /** Recompute everything from the current subscriptions and settings. */
  const render = () => {
    const now = Date.now()
    // The completion edge is noted before the plan is built, so a session that has
    // just stopped running shows its green signal on this very pass.
    const edges = noteRunningEdges(state.running, list(), stampStore.readStamps(), now)
    if (edges.stamps !== state.stamps) stampStore.writeStamps(edges.stamps)
    state.running = edges.running
    state.stamps = edges.stamps

    const next = sessionPlan(list(), pending(), edges.stamps, {
      now,
      doneWindowMs: state.settings.doneWindowMs,
    })
    const alerts = changeAlerts(state.plan, next)
    state.plan = next
    applyIcon()
    applyTitle()
    applySound(alerts)
    applyMotion()
  }

  /**
   * Start, keep, or stop the repaint timer a driven motion needs.
   *
   * The timer is owned by the state rather than by the draw, and its interval is
   * the motion's own tick. It is stopped the moment nothing is animating — which
   * matters more than it looks: a background tab's timers are throttled, but an
   * idle tab with no sessions should not be holding one at all. The one exception
   * is a `turn` the browser can animate itself, which sets no timer and costs
   * nothing.
   */
  const applyMotion = () => {
    const style = resolveStyle(state.settings.style).look
    const chosen = activeLook(state.plan, style)
    const interval =
      state.settings.favicon === false ? undefined : tickInterval(chosen, prefersReducedMotion())
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
      applyIcon()
    }, wanted)
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  //
  // Every subscription is registered through `ctx.effect`, so teardown is the
  // framework's business rather than a list of disposers this file has to keep in
  // step with its own install order.

  ctx.effect(() => ctx.sessions.list.subscribe(render), 'dsh-sentry: session list subscription')
  ctx.effect(
    () => ctx.uiSession.pendingInteractions.subscribe(render),
    'dsh-sentry: pending interaction subscription',
  )

  // Focus, blur, and visibility all change whether a sound is allowed, and coming
  // back to the foreground also has to redraw: a session that finished while the
  // user was away has already been reported by the icon they are now looking at.
  ctx.effect(() => {
    const onFocus = () => {
      state.unfocused = false
      render()
    }
    const onBlur = () => {
      state.unfocused = true
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', render)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', render)
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
      applyTitle()
    })
    observer.observe(target, { childList: true, characterData: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, 'dsh-sentry: title observer')

  ctx.effect(
    () => () => {
      if (state.motionTimer !== undefined) clearInterval(state.motionTimer)
      state.motionTimer = undefined
      icon.remove()
      chime.dispose()
    },
    'dsh-sentry: element teardown',
  )

  ctx.effect(
    () =>
      scope.subscribe(() => {
        const snapshot = scope.getSnapshot()
        if (snapshot.value === undefined) return
        state.settings = resolveSettings(snapshot.value)
        syncRow()
        render()
      }),
    'dsh-sentry: settings adoption',
  )

  const initial = scope.getSnapshot()
  state.settings = resolveSettings(initial.value)
  render()

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
            preview: () => {
              // The preview doubles as the audio unlock: the click that plays it
              // is the gesture the autoplay policy waits for.
              chime.resume()
              chime.play('questions')
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
		exports.apply = apply;
		exports.inject = inject;
		exports.SETTINGS = SETTINGS;
		exports.SETTING_DEFAULTS = SETTING_DEFAULTS;
		exports.STATES = STATES;
		exports.STATE_COLORS = STATE_COLORS;
		exports.SHAPES = SHAPES;
		exports.PATTERNS = PATTERNS;
		exports.MOTIONS_LIST = MOTIONS_LIST;
		exports.TICK_MS = TICK_MS;
		exports.motionTick = motionTick;
		exports.tickInterval = tickInterval;
		exports.flushPartner = flushPartner;
		exports.activeLook = activeLook;
		exports.FISH_TURN_SCALE = FISH_TURN_SCALE;
		exports.FISH_SWEPT_RADIUS = FISH_SWEPT_RADIUS;
		exports.FISH_HALF_EXTENT = FISH_HALF_EXTENT;
		exports.FISH_TURN_RADIUS = FISH_TURN_RADIUS;
		exports.DEFAULT_LOOK = DEFAULT_LOOK;
		exports.PRESET_COLORS = PRESET_COLORS;
		exports.DEFAULT_STYLE = DEFAULT_STYLE;
		exports.STYLE_STATES = STYLE_STATES;
		exports.parseStyle = parseStyle;
		exports.resolveStyle = resolveStyle;
		exports.CHIME_NOTES = CHIME_NOTES;
		exports.FISH_PATH = FISH_PATH;
		exports.SOUND_GAP_MS = SOUND_GAP_MS;
		exports.blockedKind = blockedKind;
		exports.sessionPlan = sessionPlan;
		exports.changeAlerts = changeAlerts;
		exports.planHasSignal = planHasSignal;
		exports.sentryFavicon = sentryFavicon;
		exports.faviconHref = faviconHref;
		exports.titleStatus = titleStatus;
		exports.titleWithStatus = titleWithStatus;
		exports.soundPlan = soundPlan;
		exports.createChime = createChime;
		exports.createStampStore = createStampStore;
		exports.noteRunningEdges = noteRunningEdges;
		exports.coerceSetting = coerceSetting;
		exports.resolveSettings = resolveSettings;
		exports.createRowStore = createRowStore;
		exports.AlertRow = AlertRow;
		return module.exports;
	}
});
