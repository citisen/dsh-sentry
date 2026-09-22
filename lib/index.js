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
 * Mark one field as editable configuration, on whichever schema library the
 * profile resolves.
 *
 * The 0.1.7 configuration model exposes only fields marked volatile, and the copy
 * of `@deepseek-ai/schemastery` a profile hoists may predate `.volatile()`: the
 * 0.1.5-rc.x line ships 3.18.2, where the method does not exist, and 0.1.7 ships
 * 3.18.3, where it does. That hoisted copy is what this module's own import
 * resolves, so calling `.volatile()` is both a TypeError risk on one line and — if
 * guarded away, as it first was — a silent way to leave every field unmarked. An
 * unmarked field is invisible to the configuration editor, and dsh's own import of
 * a legacy `settings.yaml` section into this entry is refused because the entry
 * then has no volatile fields at all.
 *
 * `extra('volatile', true)` is the primitive both versions have — 3.18.3's
 * `.volatile()` is exactly that call — so volatility is set through it, with the
 * public method kept as a fallback for a library that drops the primitive.
 *
 * @param schema - the field schema.
 * @returns the field, marked volatile.
 */
const editableField = (schema) => {
  if (typeof schema.extra === 'function') return schema.extra('volatile', true)
  if (typeof schema.volatile === 'function') return schema.volatile()
  return schema
}

/**
 * The same document as a dsh 0.1.7+ configuration form.
 *
 * That line keys settings by Loader entry id — this bundle's patch inserts the
 * entry as `alert`, so the namespace is the same string both lines use — and
 * exposes only the fields marked `.volatile()` to the configuration editor. The
 * entry's Config is the durable section there, which is why this is exported
 * rather than registered.
 */
export const Config = z.object({
  [STYLE_FIELD]: editableField(z.string().default(DEFAULT_STYLE_DOCUMENT)),
})

/**
 * Host plugin body: make the durable section real on whichever settings line is
 * composed.
 *
 * Without one the browser half falls back to the same defaults, so the favicon
 * and the title still work in a profile that has no settings document at all —
 * the plugin is useful before it is configurable.
 *
 * The two lines are named explicitly rather than probed for a version: the
 * 0.1.5-rc.x service exposes `register(namespace, schema)`, and the 0.1.7+
 * service carries the entry's own `Config` instead — this package ships its own
 * Settings row, so the generated page is turned off there. A service with neither
 * is reported, because the alternative is an opaque TypeError in the log next to
 * a boot audit that says nothing about a settings API change.
 *
 * @param ctx - host context that may acquire the settings service.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings
    if (typeof settings.register === 'function') {
      settings.register(ALERT_NAMESPACE, AlertSchema)
      return
    }
    if (typeof settings.configure === 'function') {
      settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber))
      return
    }
    settingsCtx.logger.error(
      `dsh-sentry: this dsh exposes neither settings.register() nor settings.configure(), so the ` +
        `durable "${ALERT_NAMESPACE}" section has nowhere to live and the sentry cannot be ` +
        'configured. Pin dsh to 0.1.5-rc.x (latest/next), or upgrade @citisen/dsh-sentry.',
    )
  })
}
