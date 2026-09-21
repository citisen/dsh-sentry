/**
 * Host half of `dsh-sentry`.
 *
 * A dsh Web profile bundle has two halves. This file is the Node half: it owns
 * the durable `alert` settings namespace, so every switch, volume, and geometry
 * the Settings row writes survives a restart inside `$DSH_HOME/settings.yaml`.
 * It paints nothing — the sentry acts entirely in the browser, on state the
 * session controller streams there — so there is no pre-paint row and no
 * webserver injection here.
 *
 * The browser half lives in `./client` (`src/client.js` -> `lib/client.js`) and
 * owns the engine: the favicon ring, the title prefix, the chime, and the
 * Settings row that configures them.
 *
 * @module dsh-sentry
 */

import z from '@deepseek-ai/schemastery'

/**
 * Settings namespace owned by this plugin.
 *
 * Deliberately **not** a `ui-*` name: dsh reserves that prefix for its own
 * shipped surfaces (`ui-theme`, `ui-font`), and a third-party bundle claiming
 * one would be squatting on a namespace it does not own.
 */
export const ALERT_NAMESPACE = 'alert'

/**
 * Every setting this package carries, in the order the Settings row lists them.
 *
 * Each id is both the field's identity in the browser half and its key in the
 * settings document, so the two halves have to agree on this list and nothing
 * else. They cannot import it from a shared module — separate bundles, separate
 * graphs — so it is duplicated by hand and `scripts/verify-client.mjs` compares
 * the two copies, which turns a silent drift into a failing check.
 */
export const ALERT_FIELDS = [
  'favicon',
  'style',
  'title',
  'sound',
  'soundWaiting',
  'soundApproval',
  'soundDone',
  'soundBlocked',
  'volume',
  'doneWindowMs',
]

/** Field: draw the status styling on the favicon. */
export const FAVICON_FIELD = 'favicon'
/** Field: the appearance document (see the browser half's style DSL). */
export const STYLE_FIELD = 'style'

/**
 * The appearance document an install with no stored style gets.
 *
 * Duplicated from the browser half's `DEFAULT_STYLE` by hand, for the same reason
 * the field roster is: the two halves are separate bundles with no shared module.
 * `scripts/verify-client.mjs` compares them, so a default changed on one side
 * only is a failing check rather than an interface that renders one appearance
 * and reads another.
 */
export const DEFAULT_STYLE_DOCUMENT = [
  'running  circle  blue  turn   3',
  'waiting  rounded amber blink  1.1',
  'approval rounded amber blink  1.9',
  'done     circle  green flush  1.6',
].join('\n')
/** Field: prefix the tab title with the status. */
export const TITLE_FIELD = 'title'
/** Field: the sound master switch. */
export const SOUND_FIELD = 'sound'
/** Field: chime when a session is waiting for an answer. */
export const SOUND_WAITING_FIELD = 'soundWaiting'
/** Field: chime when a session is waiting for an approval. */
export const SOUND_APPROVAL_FIELD = 'soundApproval'
/** Field: chime when a session finishes. */
export const SOUND_DONE_FIELD = 'soundDone'
/** Field: restrict sound to a hidden or unfocused page. */
export const SOUND_BLOCKED_FIELD = 'soundBlocked'
/** Field: chime volume, 0 to 1. */
export const VOLUME_FIELD = 'volume'
/** Field: how long a finished session keeps the green signal, in ms. */
export const DONE_WINDOW_FIELD = 'doneWindowMs'

/** Shortest completed-signal window the row offers, in ms. */
export const DONE_WINDOW_MIN = 0
/** Longest completed-signal window the row offers, in ms. */
export const DONE_WINDOW_MAX = 300_000

/**
 * Durable alert preferences.
 *
 * Every channel defaults to on: a notice nobody can discover is a notice nobody
 * has, and each switch exists to get out of the way once it has been noticed
 * rather than to gate the plugin behind a setup step. The completion chime is
 * the one most likely to be wanted off, which is why the row's hint says so.
 *
 * The ranges are the schema's job, not the row's: the settings domain validates
 * every write against this schema, so a hand-edited `settings.yaml` cannot put a
 * 3× fish or a 40× volume into the engine.
 */
export const AlertSchema = z.object({
  [FAVICON_FIELD]: z.boolean().default(true),
  [STYLE_FIELD]: z.string().default(DEFAULT_STYLE_DOCUMENT),
  [TITLE_FIELD]: z.boolean().default(true),
  [SOUND_FIELD]: z.boolean().default(true),
  [SOUND_WAITING_FIELD]: z.boolean().default(true),
  [SOUND_APPROVAL_FIELD]: z.boolean().default(true),
  [SOUND_DONE_FIELD]: z.boolean().default(true),
  [SOUND_BLOCKED_FIELD]: z.boolean().default(true),
  [VOLUME_FIELD]: z.number().min(0).max(1).default(0.5),
  [DONE_WINDOW_FIELD]: z
    .number()
    .step(1000)
    .min(DONE_WINDOW_MIN)
    .max(DONE_WINDOW_MAX)
    .default(60_000),
})

/**
 * Host plugin body: register the durable namespace when the optional settings
 * provider is composed.
 *
 * Without one the browser half falls back to the same defaults, so the favicon
 * and the title still work in a profile that has no settings document at all —
 * the plugin is useful before it is configurable.
 *
 * @param ctx - host context that may acquire the settings service.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(ALERT_NAMESPACE, AlertSchema)
  })
}




