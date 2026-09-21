/**
 * Host half of `dsh-sentry`.
 *
 * A dsh Web profile bundle has two halves. This file is the Node half: it owns
 * the durable `alert` settings namespace, so the appearance document survives a
 * restart inside `$DSH_HOME/settings.yaml`. It paints nothing — the sentry acts
 * entirely in the browser, on state the session controller streams there — so
 * there is no pre-paint row and no webserver injection here.
 *
 * The namespace holds exactly one field, and that is the design: how the four
 * session states look and sound is one document, and the switches the Settings row
 * used to carry beside it — the channels, the chime gates, the volume, the
 * completed window — are lines of that document now. Two places to look for one
 * answer is how they come to disagree.
 *
 * The browser half lives in `./client` (`src/client.js` -> `lib/client.js`) and
 * owns the engine: the favicon ring, the title prefix, the chime, the Settings row
 * that edits the document, and the previews of every state it draws.
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
export const ALERT_FIELDS = ['style']

/** Field: the appearance-and-sound document (see the browser half's style DSL). */
export const STYLE_FIELD = 'style'

/**
 * The document an install with no stored style gets.
 *
 * Duplicated from the browser half's `DEFAULT_STYLE` by hand, for the same reason
 * the field roster is: the two halves are separate bundles with no shared module.
 * `scripts/verify-client.mjs` compares them, so a default changed on one side
 * only is a failing check rather than an interface that renders one document and
 * runs another.
 *
 * Kept as an array of lines rather than one long string literal so the shape of
 * the document is readable here, in the half that never parses it.
 */
export const DEFAULT_STYLE_DOCUMENT = [
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
 * Durable alert preferences.
 *
 * One string, and the schema does not second-guess it. The document has a reader of
 * its own, with real diagnostics, on the browser half — every value the reader
 * cannot use is reported on the settings row and falls back to that property's
 * shipped default. A schema here that also tried to police the text would be a
 * second opinion about a language it cannot see, and the two would disagree the
 * first time the language grew a property.
 *
 * So the only thing this validates is that the field is text: a hand-edited
 * `settings.yaml` that puts a number or a list where the document belongs is
 * refused at registration instead of reaching the engine.
 */
export const AlertSchema = z.object({
  [STYLE_FIELD]: z.string().default(DEFAULT_STYLE_DOCUMENT),
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
