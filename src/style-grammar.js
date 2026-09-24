/**
 * dsh-sentry's style document: the reader the engine and the editor share, and the
 * litearea grammar the settings editor is written against.
 *
 * The document
 * ------------
 * One small text file decides how the four session states look AND sound. It has
 * two kinds of line, and which kind a line is, is visible from the line itself:
 *
 *     // document settings first, one per line, at the top level
 *     icon on
 *     title on
 *     sound background
 *     chime-gap 1.5s
 *     keep-done 60s
 *     volume 0.5
 *
 *     // then one block per state, with one named property per line
 *     waiting {
 *       shape rounded
 *       color amber
 *       motion blink
 *       speed 1.1s
 *       chime A5 E6
 *     }
 *
 * Every property is named. There is no positional slot, no value that means one
 * thing in one place and another elsewhere, and no `key=value` spelling to choose
 * between: a line is `name value`, and a name that is not a property of the scope
 * the line is in is reported with the list of names that are. That is the whole
 * reason for the rewrite — the previous language placed bare words by guessing
 * which vocabulary they belonged to, so `running circle blue turn 3` was four
 * guesses in a row and a reader had to hold the slot order in their head.
 *
 * Durations are seconds unless a unit says otherwise: `3`, `1.1s`, `300ms`, `2m`.
 * Notes are equal-tempered names (`A5`, `E6`, `C#4`, `Bb3`) or a frequency in Hz,
 * so a chime reads as music rather than as four magic numbers. A note may name its
 * own length after a colon (`A5:200ms`): an item that names one occupies exactly
 * that long, which is what makes a line of them a rhythm instead of an interval. A
 * bare `-` is a rest, and `tone` picks the waveform.
 *
 * Why the grammar lives HERE and not in the editor
 * -----------------------------------------------
 * `@citisen/litearea` ships no syntax of its own: a host hands it a grammar as a
 * value, because a library that carried every consumer's language would make every
 * consumer bundle every language. So the grammar for THIS DSL is this plugin's own
 * module, and `src/client.js` passes the plugin's constants in — which is what keeps
 * the vocabulary the editor offers and the vocabulary the reader accepts one list
 * rather than two that agree until someone edits one of them.
 *
 * One reader, two callers
 * -----------------------
 * `readStyleDocument` is the single structural pass: it decides what the document
 * means AND records what is wrong with it, with ranges. The engine's
 * `resolveStyle` calls it to get drawable values; the grammar's `analyze` calls it
 * to paint, complete, and explain the same text. The previous version of this file
 * carried a second copy of the walk because the grammar was written to stand alone
 * — and a second copy is a second opinion, which is exactly how an editor comes to
 * offer a property the parser then rejects.
 *
 * @module dsh-sentry/style-grammar
 */

import { defineGrammar, defineVocabulary, lineStarts } from '@citisen/litearea'

// ─── the two values with a syntax of their own ───────────────────────────────
//
// A duration and a note are the only things here that are not a word out of a
// closed list, so they are the only things that need a parser. Both live at this
// level rather than inside the grammar factory because the engine needs them too:
// `resolveStyle` turns a note into a frequency, and the row prints a duration.

/** Semitone offsets inside an octave, by note letter. */
const NOTE_LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** A4's frequency in Hz — the anchor the equal-tempered scale is built from. */
const NOTE_A4_HZ = 440

/** A4's MIDI number, which is what counts the semitones in either direction. */
const NOTE_A4_MIDI = 69

/** The quietest and loudest frequency a `chime` line may name, in Hz. */
const NOTE_MIN_HZ = 20
const NOTE_MAX_HZ = 20_000

/**
 * The shortest and longest length one written chime item may carry, in seconds.
 *
 * Bounded for the same reason the frequency is: a `chime` line is a notification,
 * and a note that rings for a minute — or for a microsecond — is a typo rather than
 * a sound. Anything inside the range is the writer's business.
 */
const CHIME_LENGTH_MIN_S = 0.01
const CHIME_LENGTH_MAX_S = 10

/**
 * Parse a duration into seconds.
 *
 * `3` and `3s` are the same three seconds, because a bare number being seconds is
 * the one unit rule worth remembering: it is what `speed 3` reads as. `ms` and `m`
 * are there for the two values where a second is the wrong size — a chime gap is
 * measured in fractions of a second and a completed window in minutes.
 *
 * @param text - the value as written.
 * @returns the duration in seconds, or undefined when the text is not one.
 */
export function parseDuration(text) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(text)
  if (match === null) return undefined
  const value = Number.parseFloat(match[1])
  if (!Number.isFinite(value)) return undefined
  const unit = match[2] ?? 's'
  if (unit === 'ms') return value / 1000
  if (unit === 'm') return value * 60
  return value
}

/**
 * The frequency of one written note, or undefined when it is not a note.
 *
 * Equal temperament from A4 = 440 Hz, which is the tuning the shipped chime was
 * always written in: `chime A5 E6` reproduces the two-note rise, and it does so in
 * a spelling that says what it is.
 *
 * @param text - the note as written, such as `A5`, `E6`, `C#4`, or `Bb3`.
 * @returns the frequency in Hz rounded to two decimals, or undefined.
 */
export function noteFrequency(text) {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(text)
  if (match === null) return undefined
  const letter = match[1].toUpperCase()
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0
  const octave = Number.parseInt(match[3], 10)
  const midi = (octave + 1) * 12 + NOTE_LETTERS[letter] + accidental
  return Math.round(NOTE_A4_HZ * 2 ** ((midi - NOTE_A4_MIDI) / 12) * 100) / 100
}

/**
 * One item of a `chime` value: a note, or a rest, with an optional length.
 *
 * Both halves are spelled in the document's own two value languages — a note is a
 * name or a frequency, a length is what `speed` and `chime-gap` already take — so
 * nothing new has to be learned to write one:
 *
 *     A5          a note that rings the engine's default and lets the next one start
 *                 a little before it ends, which is the shipped two-note interval
 *     A5:200ms    a note that rings 200ms, the next one starting when it ends
 *     -:200ms     the same 200ms of silence
 *
 * A length is what turns a chime into a rhythm: an item that names one occupies
 * exactly that long, so a sequence of them reads end to end. An item that names none
 * keeps the engine's default overlap, which is what the shipped chime is.
 *
 * @param text - the item as written.
 * @returns `{ frequency }` or `{ rest: true }`, each carrying `lengthMs` when one
 *   was written, or `{ problem: 'note' | 'length' }` when the text is not an item.
 */
export function parseChimeItem(text) {
  const colon = text.indexOf(':')
  const head = colon === -1 ? text : text.slice(0, colon)
  const written = colon === -1 ? undefined : text.slice(colon + 1)
  let lengthMs
  if (written !== undefined) {
    const seconds = parseDuration(written)
    if (seconds === undefined || seconds < CHIME_LENGTH_MIN_S || seconds > CHIME_LENGTH_MAX_S) {
      return { problem: 'length' }
    }
    lengthMs = Math.round(seconds * 1000)
  }
  if (head === '-') return lengthMs === undefined ? { rest: true } : { rest: true, lengthMs }
  const named = noteFrequency(head)
  const hertz = named ?? (/^\d+(?:\.\d+)?$/.test(head) ? Number.parseFloat(head) : undefined)
  if (hertz === undefined || hertz < NOTE_MIN_HZ || hertz > NOTE_MAX_HZ) {
    return { problem: 'note' }
  }
  const frequency = Math.round(hertz * 100) / 100
  return lengthMs === undefined ? { frequency } : { frequency, lengthMs }
}

// ─── the reader ──────────────────────────────────────────────────────────────

/**
 * One word of the document, with the range it occupies.
 * @typedef {object} DshSentryWord
 * @property {string} text - the word as written.
 * @property {number} from - the offset it starts at.
 * @property {number} to - the offset after its last character.
 */

/**
 * A problem the structural walk found, ready to be reported.
 * @typedef {object} DshSentryProblem
 * @property {number} from - the offset the underline starts at.
 * @property {number} to - the offset after it.
 * @property {number} line - the zero-based line the problem is on.
 * @property {string} message - what to tell the user.
 * @property {string} code - the stable tag, so a host or a test can act on meaning.
 * @property {'error' | 'warning' | 'info' | 'hint'} severity - how loudly it speaks.
 */

/**
 * One line of the document, read.
 *
 * A line rather than a rule, because half of what the walk produces is about a
 * line that is not finished yet: `key` and `values` describe a property being
 * typed, which is exactly when a completion asks.
 * @typedef {object} DshSentryLine
 * @property {number} number - zero-based, so a completion can find the caret's line.
 * @property {number} from - the offset the line starts at.
 * @property {number} to - the offset after its last character, newline excluded.
 * @property {string} body - the line with its comment removed.
 * @property {DshSentryWord[]} words - the words on the line, comments removed.
 * @property {string | undefined} state - the state whose block the line is in, or
 *   undefined at the top level.
 * @property {string | undefined} opens - the state a line opens a block for.
 * @property {boolean} closes - whether the line closes the open block.
 * @property {string | undefined} key - the property the line names, when it is one
 *   the line's scope accepts; `undefined` while the name is still being typed.
 * @property {DshSentryWord[]} values - the words written after the property.
 * @property {DshSentryProblem[]} problems - what is wrong with this line.
 */

/**
 * What one property accepts.
 *
 * The spec is the document's type system, and it is the caller's: the plugin owns
 * the vocabulary (a shape, a preset colour, a motion) and this module owns how a
 * value of that kind is read and how a bad one is described. `resolveStyle` reads
 * the same spec to coerce, so a value the walk accepted is a value the engine can
 * use without checking it again.
 * @typedef {object} DshSentryKeySpec
 * @property {'word' | 'number' | 'duration' | 'chime'} kind - how the value reads.
 * @property {readonly string[]} [words] - the closed list a `word` accepts.
 * @property {number} [min] - the low end of the accepted range, in the value's own
 *   unit (seconds for a duration).
 * @property {number} [max] - the high end of the accepted range.
 * @property {readonly string[]} [states] - the states the property means anything
 *   in; a line naming it anywhere else is reported as inert rather than dropped in
 *   silence.
 * @property {readonly string[]} [suggest] - values a completion offers, for a kind
 *   whose values are not a closed list.
 */

/**
 * Read a document into the facts the engine draws from and the problems it has.
 *
 * Total by construction: anything the walk does not understand is reported and
 * left out, and the caller keeps its shipped default for that one property. A typo
 * in a settings file must not be able to leave a tab without an icon.
 *
 * @param text - the document, or anything else a settings file happened to hold.
 * @param options - `{ states, keys, spec }`: the states a block may open, the
 *   properties each scope accepts, and what each property reads.
 * @returns `{ globals, rules, lines, problems }` — the top-level values, one object
 *   per state with the values its block wrote, every line read, and every problem
 *   found.
 */
export function readStyleDocument(text, options) {
  const states = options?.states ?? []
  const keys = options?.keys ?? { global: [], state: [] }
  const spec = options?.spec ?? {}

  const globals = {}
  const rules = {}
  const lines = []
  const problems = []

  // A non-string is a corrupt write rather than a document; an empty one still has
  // one (empty) line, and the completion layer asks about that line the moment the
  // editor opens on a new install.
  if (typeof text !== 'string') return { globals, rules, lines, problems }

  /** The state whose block is open, if any. */
  let open
  /** The line that opened it, so an unclosed block points at its own opener. */
  let opener

  const starts = lineStarts(text)
  for (let number = 0; number < starts.length; number += 1) {
    const from = starts[number] ?? 0
    const rawTo = starts[number + 1] ?? text.length
    let to = rawTo
    while (to > from && (text.charAt(to - 1) === '\n' || text.charAt(to - 1) === '\r')) to -= 1
    const raw = text.slice(from, to)
    // `//` starts a comment anywhere on the line. Deliberately not `#`, which note
    // names need: `C#4` is a note, not a comment, and a language whose comment
    // character eats part of its own vocabulary is a language nobody can write in.
    const comment = raw.indexOf('//')
    const body = comment === -1 ? raw : raw.slice(0, comment)

    const words = []
    const wordPattern = /[^\s,{}]+/g
    let match
    while ((match = wordPattern.exec(body)) !== null) {
      words.push({
        text: match[0],
        from: from + match.index,
        to: from + match.index + match[0].length,
      })
    }

    const line = {
      number,
      from,
      to,
      body,
      words,
      state: open,
      opens: undefined,
      closes: false,
      key: undefined,
      values: [],
      problems: [],
    }
    lines.push(line)

    const trimmed = body.trim()
    if (trimmed === '') continue

    /**
     * Record a problem against this line, in both places it has to appear.
     * @param mark - the word to underline.
     * @param message - what to tell the user.
     * @param code - the stable tag.
     * @param severity - how loudly it speaks.
     * @returns {void}
     */
    const fail = (mark, message, code, severity = 'error') => {
      const problem = { from: mark.from, to: mark.to, line: number, message, code, severity }
      line.problems.push(problem)
      problems.push(problem)
    }

    if (trimmed === '}') {
      line.closes = true
      if (open === undefined) {
        const at = from + body.indexOf('}')
        fail(
          { from: at, to: at + 1 },
          'Nothing is open here, so there is nothing to close.',
          'stray-brace',
        )
      } else {
        open = undefined
      }
      continue
    }

    if (trimmed.endsWith('{')) {
      const name = words[0]
      if (name === undefined) {
        const at = from + body.indexOf('{')
        fail({ from: at, to: at + 1 }, 'A block needs a state in front of its `{`.', 'missing-state')
        continue
      }
      line.opens = name.text
      if (!states.includes(name.text)) {
        fail(
          name,
          `Unknown state "${name.text}" — this document understands ${states.join(', ')}.`,
          'unknown-state',
        )
        open = undefined
        continue
      }
      if (open !== undefined) {
        fail(
          name,
          `"${name.text}" opens a block while "${open}" is still open — close it with a \`}\` line first.`,
          'nested-block',
        )
      }
      if (words.length > 1) {
        fail(
          words[1],
          `"${words[1].text}" is not inside the block — "${name.text} {" takes nothing else on its line.`,
          'stray-word',
        )
      }
      open = name.text
      opener = line
      line.state = name.text
      if (rules[name.text] === undefined) rules[name.text] = {}
      continue
    }

    if (body.includes('{') || body.includes('}')) {
      const at = from + body.search(/[{}]/)
      fail(
        { from: at, to: at + 1 },
        'A brace is only understood at the end of a state line, as in `waiting {`.',
        'stray-brace',
      )
      continue
    }

    const key = words[0]
    if (key === undefined) continue
    line.values = words.slice(1)

    if (open === undefined && states.includes(key.text) && words.length === 1) {
      fail(
        key,
        `"${key.text}" opens a block — write "${key.text} {" on a line of its own.`,
        'unopened-block',
      )
      continue
    }

    const accepted = open === undefined ? keys.global : keys.state
    if (!accepted.includes(key.text)) {
      const what = open === undefined ? 'setting' : `property of "${open}"`
      fail(
        key,
        `Unknown ${what} "${key.text}" — this document understands ${accepted.join(', ')}.`,
        'unknown-key',
      )
      continue
    }

    // A known property, so the line is a property line whatever its value does —
    // the completion layer reads `key` to decide what the caret is completing.
    line.key = key.text
    const spec_ = spec[key.text] ?? {}
    if (open !== undefined && spec_.states !== undefined && !spec_.states.includes(open)) {
      fail(
        key,
        `"${key.text}" does nothing in "${open}" — only ${spec_.states.join(', ')} are chimed at.`,
        'inert-property',
        'warning',
      )
      continue
    }

    const checked = readValue(key, line.values, spec_)
    if (checked.message !== undefined) {
      fail(checked.mark, checked.message, 'bad-value')
      continue
    }
    if (open === undefined) globals[key.text] = checked.value
    else rules[open][key.text] = checked.value
  }

  // An open block at the end of the document is a mistake worth naming: without it
  // the lines under it read as properties of a state the reader never closed, and
  // the messages they earn are about the wrong problem.
  if (open !== undefined && opener !== undefined) {
    const mark = opener.words[0] ?? { from: opener.from, to: opener.to }
    const problem = {
      from: mark.from,
      to: mark.to,
      line: opener.number,
      message: `"${open}" is never closed — add a line with a single \`}\`.`,
      code: 'unclosed-block',
      severity: 'error',
    }
    opener.problems.push(problem)
    problems.push(problem)
  }

  return { globals, rules, lines, problems }
}

/**
 * How a value of one kind is written, for a message that has to say what it wanted.
 * @param spec - the property's spec.
 * @returns a readable phrase.
 */
function expectedValue(spec) {
  if (spec.kind === 'chime') {
    return 'note names such as "A5 E6" — a note may name its own length as "A5:200ms", and "-:200ms" is a rest — or "off" for silence'
  }
  if (spec.kind === 'duration') return 'a duration such as 1.5s or 300ms'
  if (spec.kind === 'number') return `a number between ${String(spec.min)} and ${String(spec.max)}`
  return (spec.words ?? []).join(', ')
}

/**
 * Read one property's value, or say why it is not one.
 *
 * The whole value is read or none of it is: a chime whose second note is a typo is
 * reported and the state keeps its shipped sound, rather than playing a chime that
 * is half of what the document says.
 *
 * @param key - the property's word, so a missing value has a range to point at.
 * @param values - the words written after the property.
 * @param spec - the property's spec.
 * @returns `{ value }` when the value reads, `{ mark, message }` when it does not.
 */
function readValue(key, values, spec) {
  if (spec.kind === 'chime') {
    if (values.length === 0) {
      return {
        mark: key,
        message: `"${key.text}" needs notes — write ${expectedValue(spec)}.`,
      }
    }
    if (values.length === 1 && (values[0].text === 'off' || values[0].text === 'none')) {
      return { value: { silent: true, labels: [], notes: [] } }
    }
    const notes = []
    const labels = []
    for (const word of values) {
      const item = parseChimeItem(word.text)
      if (item.problem === 'length') {
        return {
          mark: word,
          message: `"${word.text}" has no length after its colon — write a duration such as 200ms, or drop the colon.`,
        }
      }
      if (item.problem === 'note') {
        return {
          mark: word,
          message: `"${word.text}" is not a note — write a note name such as A5, a frequency in Hz such as 880, or \`-\` for a rest.`,
        }
      }
      notes.push(item)
      labels.push(word.text)
    }
    // A chime of nothing but rests cannot sound, and the language already has a
    // word for silence. Resolving it to that word is what keeps the row honest: a
    // channel that exists is a card with a Play button, and this one would have
    // nothing to play.
    if (notes.every((item) => item.rest === true)) {
      return { value: { silent: true, labels: [], notes: [] } }
    }
    return { value: { silent: false, labels, notes } }
  }

  if (values.length === 0) {
    return {
      mark: key,
      message: `"${key.text}" needs a value — write ${expectedValue(spec)}.`,
    }
  }
  if (values.length > 1) {
    return {
      mark: values[1],
      message: `"${key.text}" takes one value, but ${String(values.length)} were written — write ${expectedValue(spec)}.`,
    }
  }

  const word = values[0]
  if (spec.kind === 'word') {
    const words = spec.words ?? []
    if (words.includes(word.text)) return { value: word.text }
    return {
      mark: word,
      message: `"${word.text}" is not a value "${key.text}" accepts — expected ${words.join(', ')}.`,
    }
  }

  if (spec.kind === 'number') {
    if (!/^\d+(?:\.\d+)?$/.test(word.text)) {
      return {
        mark: word,
        message: `"${word.text}" is not a number — write ${expectedValue(spec)}.`,
      }
    }
    const value = Number.parseFloat(word.text)
    if (value < spec.min || value > spec.max) {
      return {
        mark: word,
        message: `${word.text} is outside what "${key.text}" accepts — write ${expectedValue(spec)}.`,
      }
    }
    return { value }
  }

  const seconds = parseDuration(word.text)
  if (seconds === undefined) {
    return {
      mark: word,
      message: `"${word.text}" is not a duration — write ${expectedValue(spec)}.`,
    }
  }
  if (seconds < spec.min || seconds > spec.max) {
    return {
      mark: word,
      message: `${word.text} is outside what "${key.text}" accepts — write ${expectedValue(spec)}.`,
    }
  }
  return { value: seconds }
}

// ─── the grammar ─────────────────────────────────────────────────────────────

/**
 * The vocabularies and shipped defaults a host may override.
 *
 * Every field is optional, and a host that names none of them gets this module's
 * copy of the plugin's lists. The overrides exist because the lists are the
 * plugin's to own: a suite that proves the grammar reads them — rather than that it
 * carries a copy that happens to agree — has to be able to change one and watch the
 * grammar follow.
 * @typedef {object} DshSentryStyleOptions
 * @property {readonly string[]} [states] - the states a document may address, in
 *   the order a list shows them.
 * @property {{ global: readonly string[], state: readonly string[] }} [keys] - the
 *   properties each scope accepts.
 * @property {Readonly<Record<string, DshSentryKeySpec>>} [spec] - what each property
 *   reads.
 * @property {readonly string[]} [shapes] - the background shapes a rule may name.
 * @property {readonly string[]} [motions] - the motions a rule may apply.
 * @property {Readonly<Record<string, string>>} [colors] - the named palette.
 *   Presets on purpose: a free colour can be illegible.
 * @property {readonly string[]} [modes] - the on/off/background words.
 * @property {readonly string[]} [notes] - the note names a completion offers.
 * @property {readonly string[]} [tones] - the waveforms `tone` accepts.
 * @property {Readonly<Record<string, object>>} [defaults] - the shipped look per
 *   state, used to rank a completion and to document a word.
 */

/**
 * Build the grammar for dsh-sentry's style document.
 *
 * Everything but this function and the three value readers above is declared
 * INSIDE it, and that is not a style choice. The build splices this file into
 * `src/client.js`, where it shares the plugin's own scope — a classic script has no
 * module table to hold a second file — so a top-level `SHAPES` here would be a
 * second `SHAPES` beside the plugin's, and would either collide with it or shadow
 * it. The readers are top-level because both halves call them, and their names are
 * ones this plugin has nowhere else.
 *
 * @param {DshSentryStyleOptions} [options] - the vocabularies and shipped defaults.
 * @returns {object} a grammar that paints, completes, diagnoses, and explains the
 *   language.
 */
export function dshSentryStyleGrammar(options = {}) {
  const STATES = options.states ?? []
  const KEYS = options.keys ?? { global: [], state: [] }
  const SPEC = options.spec ?? {}
  const SHAPES = options.shapes ?? []
  const MOTIONS = options.motions ?? []
  const COLOR_NAMES = Object.keys(options.colors ?? {})
  const MODES = options.modes ?? []
  const NOTES = options.notes ?? []
  const TONES = options.tones ?? []
  const LOOK = options.defaults ?? {}

  /** Every property name, either scope, in the order a list offers them. */
  const ALL_KEYS = [...new Set([...KEYS.global, ...KEYS.state])]

  /** The line shape that makes the first word a state rather than a property. */
  const BLOCK_LINE = /^\s*[\w#-]+\s*\{/

  /**
   * A vocabulary, with the one setting this grammar always wants.
   *
   * `caseSensitive` is on for every word here because the reader compares with
   * `includes` on the literal: a suggestion list that accepted `Circle` would be
   * teaching a spelling the plugin then rejects.
   * @param spec - the declaration, minus the repeated setting.
   * @returns the resolved vocabulary.
   */
  function closedVocabulary(spec) {
    return defineVocabulary({ ...spec, caseSensitive: true })
  }

  // ── vocabularies ──────────────────────────────────────────────────────────
  // Declared once each so the word set, the paint, the hover text, and the
  // completion list cannot disagree. Only the state vocabulary carries
  // `unknownMessage`, because only a state word can be validated from a token: a
  // property's value depends on the property, and the key is structural.

  const STATE_VOCAB = closedVocabulary({
    id: 'state',
    words: STATES,
    scope: 'state',
    unknownMessage: 'Unknown state "{word}" — this document understands {allowed}.',
    docs: {
      waiting: { detail: 'a question is waiting', body: 'The agent asked something, and the turn is blocked until it is answered.' },
      approval: { detail: 'a permission is waiting', body: 'The agent requested an escalation or a plan review, and the turn is blocked on it.' },
      running: { detail: 'a turn is in progress', body: 'The agent is working and does not need anyone.' },
      done: { detail: 'the turn finished', body: 'The agent stopped and left the tab alone.' },
    },
  })

  const KEY_VOCAB = closedVocabulary({
    id: 'property',
    words: ALL_KEYS,
    scope: 'property',
    docs: {
      icon: { detail: 'document setting: draw the tab icon' },
      title: { detail: 'document setting: prefix the tab title' },
      sound: { detail: 'document setting: when a chime may sound' },
      'chime-gap': { detail: 'document setting: least time between two chimes' },
      'keep-done': { detail: 'document setting: how long "just finished" stays lit' },
      volume: { detail: 'document setting: the default loudness' },
      tone: { detail: 'document setting: the default waveform' },
      shape: { detail: 'the background shape' },
      color: { detail: 'the background colour, from the preset palette' },
      motion: { detail: 'what moves while the state lasts' },
      speed: { detail: 'the motion rate, in seconds' },
      chime: { detail: 'the notes this state sounds' },
      tone: { detail: 'this state\u2019s own waveform' },
      volume: { detail: 'this state\u2019s own loudness' },
    },
  })

  const SHAPE_VOCAB = closedVocabulary({
    id: 'shape',
    words: SHAPES,
    scope: 'value.shape',
    docs: {
      circle: { detail: 'a full disc' },
      rounded: { detail: 'a rounded square — the fish is wider than it is tall, and this gives it room' },
      square: { detail: 'a square with sharp corners' },
      none: {
        detail: 'no background',
        body: 'The fish alone, on whatever the tab gives it. The fish is carved OUT of the background, so with no background there is nothing to carve and the icon is transparent: for just-the-fish, use rounded or circle.',
      },
    },
  })

  const COLOR_VOCAB = closedVocabulary({
    id: 'color',
    words: COLOR_NAMES,
    scope: 'value.color',
    docs: Object.fromEntries(
      Object.entries(options.colors ?? {}).map(([name, hex]) => [name, { detail: hex }]),
    ),
  })

  const MOTION_VOCAB = closedVocabulary({
    id: 'motion',
    words: MOTIONS,
    scope: 'value.motion',
    docs: {
      still: { detail: 'nothing moves' },
      turn: { detail: 'the fish rotates', body: 'speed is seconds per revolution.' },
      blink: { detail: 'the whole icon dims and returns', body: 'speed is seconds per breath.' },
      pulse: { detail: 'the background colour alternates', body: 'speed is seconds per cycle.' },
    },
  })

  const MODE_VOCAB = closedVocabulary({
    id: 'mode',
    words: MODES,
    scope: 'value.mode',
    docs: {
      on: { detail: 'the channel is on' },
      off: { detail: 'the channel is off' },
      background: { detail: 'only while this page is hidden or unfocused' },
      always: { detail: 'even while you are looking at the interface' },
    },
  })

  const TONE_VOCAB = closedVocabulary({
    id: 'tone',
    words: TONES,
    scope: 'value.tone',
    docs: {
      sine: { detail: 'a pure tone — the shipped waveform', body: 'Only the fundamental, so it is the softest of the four and the one that survives a low volume intact.' },
      triangle: { detail: 'a soft tone with a little more edge than sine', body: 'A few odd harmonics: brighter than `sine`, still gentle.' },
      square: { detail: 'a hollow, retro tone', body: 'Odd harmonics only — the chiptune sound. Noticeably louder than `sine` at the same `volume`, so turn the volume down rather than the tone.' },
      sawtooth: { detail: 'a bright, buzzy tone', body: 'Every harmonic: the harshest of the four, and the one most likely to read as an alarm rather than a chime.' },
    },
  })

  /**
   * What each property explains about itself, per scope.
   *
   * Two tables rather than one because `volume` means two things: the top level's
   * master loudness and a block's factor for that one state. A document that reads
   * `volume 0.5` at the top and `volume 0.5` inside `done` is not saying the same
   * thing twice, and the hover has to be able to tell them apart.
   */
  const KEY_DOCS = {
    global: {
      icon: { detail: 'draw the tab icon', body: `\`on\` or \`off\`. Off restores the app's own favicon.` },
      title: { detail: 'prefix the tab title', body: `\`on\` or \`off\`. The title is the only place an exact count can be read.` },
      sound: {
        detail: 'when a chime may sound',
        body: '`background` (the default) chimes only while this page is hidden or unfocused; `always` chimes even while you are looking at it; `off` silences every chime.',
      },
      'chime-gap': {
        detail: 'least time between two chimes',
        body: 'Measured against the clock rather than a timer, because a background tab throttles timers to the minute. One burst of questions should be one chime.',
      },
      'keep-done': {
        detail: 'how long "just finished" stays lit',
        body: 'Set it to 0 and the finished state never shows — the completion chime rides the same edge, so it falls silent too.',
      },
      volume: {
        detail: 'the default loudness',
        body: 'The loudness every chimed state plays at unless its own block names one. Both spellings are the same kind of number: a block\u2019s `volume` does not multiply this one, it replaces it.',
      },
      tone: {
        detail: 'the default waveform',
        body: `The waveform every chimed state plays unless its own block names one: ${TONES.join(', ')}. Like \`volume\`, a block\u2019s line replaces this one rather than layering on it.`,
      },
    },
    state: {
      shape: { detail: 'the background shape', body: `One of ${SHAPES.join(', ')}.` },
      color: { detail: 'the background colour', body: `${COLOR_NAMES.join(', ')} — all presets, chosen so the fish stays legible.` },
      motion: { detail: 'what moves', body: `One of ${MOTIONS.join(', ')}.` },
      speed: { detail: 'the motion rate', body: 'Seconds per revolution for `turn`, per cycle otherwise. `1.1s` and `1100ms` are the same rate.' },
      chime: {
        detail: 'the notes this state sounds',
        body: 'Note names (`A5 E6`) or frequencies in Hz (`880 1318.5`), played in order. A note may name its own length — `A5:200ms` rings 200ms and the next item starts when it ends — and `-:200ms` is that much silence. `off` silences this state alone.',
      },
      tone: {
        detail: 'this state\u2019s own waveform',
        body: `One of ${TONES.join(', ')}. Overrides the document\u2019s default waveform for this state alone.`,
      },
      volume: {
        detail: 'this state\u2019s own loudness',
        body: 'Overrides the document\u2019s default loudness for this state alone. It replaces that number rather than scaling it, so the settings row prints exactly one of the two — never their product.',
      },
    },
  }

  /** Every vocabulary, by the scope its words are painted under, for hover. */
  const BY_SCOPE = new Map([
    ['state', STATE_VOCAB],
    ['value.shape', SHAPE_VOCAB],
    ['value.color', COLOR_VOCAB],
    ['value.motion', MOTION_VOCAB],
    ['value.mode', MODE_VOCAB],
    ['value.tone', TONE_VOCAB],
  ])

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * The line record the caret is on, when the analysis has one.
   * @param context - a completion context.
   * @returns the line, or undefined.
   */
  function lineAt(context) {
    return context.state?.lines?.[context.line.number]
  }

  /**
   * The scope a line's property belongs to: a state's name, or `global`.
   * @param line - the line, or undefined.
   * @returns the scope key.
   */
  function scopeOf(line) {
    return line?.state === undefined ? 'global' : 'state'
  }

  /**
   * The range a value completion replaces: the value token the caret is in.
   *
   * Deliberately NOT `context.word`. `wordChars` is `/[\p{L}\p{N}_#-]/u` — no dot, on
   * purpose, so that a stray `circle.` is not read as one unknown word — and the price
   * of that is that the word around the caret in `volume 0.2` is just `2`. Accepting
   * `0.25` there wrote `0.0.25`: the completion replaced the part `wordChars` could see
   * and kept the prefix it could not.
   *
   * The reader already knows where a value begins and ends, because it split the line
   * on whitespace, so the range comes from its own record rather than from the lexical
   * layer's narrower idea of a word. A caret in the whitespace after a value is in no
   * token, and the default range — the empty word at the caret — is then the right one:
   * the next value is a new token, not a replacement.
   *
   * @param context - a completion context.
   * @returns the range to replace.
   */
  function valueRange(context) {
    const line = lineAt(context)
    if (line !== undefined) {
      for (const word of line.values ?? []) {
        if (context.caret >= word.from && context.caret <= word.to) {
          return { from: word.from, to: word.to }
        }
      }
    }
    return context.word
  }

  /**
   * A completion row for one word of a vocabulary.
   * @param word - the word.
   * @param vocabulary - the vocabulary that documents it.
   * @param options - `{ current, append, kind }`.
   * @returns the row.
   */
  function wordRow(word, vocabulary, { current, append, kind }) {
    const entry = vocabulary?.entryFor(word)
    return {
      label: word,
      insert: word,
      append,
      kind,
      detail: word === current ? 'the current value' : entry?.detail,
      documentation: entry?.body,
      // The word already written leads, so accepting the top row changes nothing by
      // accident. Everything else keeps the vocabulary's own order.
      sortText: word === current ? '0' : '1',
    }
  }

  /**
   * The completion rows for one property's value.
   * @param line - the caret's line, which names the property.
   * @returns the rows.
   */
  function valueItems(line) {
    const key = line?.key
    if (key === undefined) return []
    const spec = SPEC[key] ?? {}
    const current = line.values?.[0]?.text

    if (spec.kind === 'chime') {
      const rows = NOTES.map((note) =>
        wordRow(note, undefined, { current, append: '\n', kind: 'note' }),
      )
      for (const note of rows) {
        note.documentation =
          'Notes play in order. Any equal-tempered name works (`A5`, `C#4`, `Bb3`), as does a frequency in Hz (`880`). Add a length after a colon to place the next item yourself: `A5:200ms`.'
      }
      rows.push({
        label: '-',
        // Accepting a rest writes the colon too, because the length is the whole
        // point of a rest: `-` alone is one step of silence, and one step is what
        // the notes around it already decide.
        insert: '-:',
        append: '',
        kind: 'note',
        detail: current === '-' ? 'the current value' : 'a rest — silence of a length you write',
        documentation: 'Silence that still takes time: `-:200ms` waits 200ms before the next note.',
        sortText: current === '-' ? '0' : '1',
      })
      rows.push({
        label: 'off',
        insert: 'off',
        append: '\n',
        kind: 'note',
        detail: 'this state stays silent',
        documentation: 'Silences this state alone; the other two keep their chimes.',
        sortText: '1',
      })
      return rows
    }

    if (spec.kind === 'word') {
      const vocabulary =
        key === 'shape'
          ? SHAPE_VOCAB
          : key === 'color'
            ? COLOR_VOCAB
            : key === 'motion'
              ? MOTION_VOCAB
              : key === 'tone'
                ? TONE_VOCAB
                : MODE_VOCAB
      return (spec.words ?? []).map((word) =>
        wordRow(word, vocabulary, { current, append: '\n', kind: 'value' }),
      )
    }

    // A free number or duration: the list offers the rates worth reaching for
    // rather than pretending to be exhaustive.
    const shipped = LOOK[line.state]?.[key]
    return (spec.suggest ?? []).map((value) => {
      const text = String(value)
      const isShipped = shipped !== undefined && String(shipped) === text
      return {
        label: text,
        insert: text,
        append: '\n',
        kind: 'number',
        detail: isShipped ? 'the shipped value for this state' : 'a value worth trying',
        sortText: isShipped ? '0' : '1',
      }
    })
  }

  return defineGrammar({
    id: 'dsh-sentry-style',
    name: 'dsh-sentry style document',

    // A note is `A5`, a chime item's length is `A5:200ms`, an accidental is part of
    // the note, and a number is `1.5s` — all four are one token, so all four are word
    // characters here. The dot is the one worth explaining: leaving it out was the
    // earlier choice, to stop a stray `circle.` being read as one unknown word, and it
    // cost more than it bought. `wordChars` is also what a completion filters by and
    // what a double click selects, so without the dot the editor believed the word in
    // `volume 0.2` was `2` — and replacing that word with `0.25` wrote `0.0.25`. The
    // colon is the same argument: the reader treats `A5:200ms` as one value, so the
    // editor has to treat it as one word, or the caret lands inside a token the
    // language never splits. A token the reader treats as one value has to be one
    // word to the editor.
    wordChars: /[\p{L}\p{N}_#.:-]/u,

    rules: [
      { kind: 'match', scope: 'comment', pattern: /\/\/[^\n]*/ },

      // Braces are structure rather than words, and claiming them first is what
      // lets `waiting{` read as a state and a brace rather than as one unknown word.
      { kind: 'match', scope: 'punctuation', pattern: /\{|\}/ },

      // The first word of a line that opens a block is a state or it is a mistake.
      // The `line` predicate is what keeps a top-level setting out of this rule:
      // `icon on` is a property line, and only `waiting {` is a block.
      {
        kind: 'words',
        words: STATE_VOCAB,
        when: { firstOnLine: true, line: BLOCK_LINE },
        unknown: {},
      },

      // Properties. Membership is not enforced here: an unknown name has to fall
      // through to the invalid rule so a typo is visible, and the structural pass
      // reports it with the list the line's own scope accepts — which the lexical
      // layer cannot know.
      { kind: 'words', words: KEY_VOCAB, when: { firstOnLine: true } },

      // Values, painted by what they are. Membership alone places a word for every
      // vocabulary but one: `square` is both a shape and a waveform, and a word
      // cannot be painted under two scopes at once. The waveform therefore claims
      // its own line — `when.line` is what makes the claim — and everywhere else
      // `square` stays the shape it has always been. The rest is unchanged: a value
      // written for the wrong property is still painted as the value it is, and the
      // structural pass is what says it is in the wrong place, with the exact range.
      {
        kind: 'words',
        words: TONE_VOCAB,
        when: { line: /^\s*tone\s/ },
      },
      { kind: 'words', words: SHAPE_VOCAB },
      { kind: 'words', words: COLOR_VOCAB },
      { kind: 'words', words: MOTION_VOCAB },
      { kind: 'words', words: MODE_VOCAB },

      // A chime item that names its own length, and a rest — both before the two
      // plain-value rules below, because a rule claims only the prefix it matches
      // and `A5` claimed out of `A5:200ms` would leave the length to fall through as
      // an unknown word. A bare note and a bare number keep the scopes they had.
      {
        kind: 'match',
        scope: 'value.note',
        pattern: /(?:[A-Ga-g][#b]?-?\d|\d+(?:\.\d+)?):\d+(?:\.\d+)?(?:ms|s|m)?/,
      },
      { kind: 'match', scope: 'value.note', pattern: /-(?::\d+(?:\.\d+)?(?:ms|s|m)?)?/ },
      { kind: 'match', scope: 'value.note', pattern: /[A-Ga-g][#b]?-?\d/ },
      { kind: 'match', scope: 'value.number', pattern: /\d+(?:\.\d+)?(?:ms|s|m)?/ },

      // Anything left is a word this language does not know. Braces are excluded
      // so a run of text cannot swallow one.
      { kind: 'match', scope: 'invalid', pattern: /[^\s{}]+/ },
    ],

    fallbackScope: 'text',

    // ── what the document means ─────────────────────────────────────────────
    //
    // The same walk the engine draws from, so the paint, the diagnostics, the
    // completions, and the icon cannot disagree about what a line says.
    analyze: (text) => readStyleDocument(text, { states: STATES, keys: KEYS, spec: SPEC }),

    validate: (context) => {
      for (const problem of context.state.problems) {
        context.report({
          from: problem.from,
          to: problem.to,
          message: problem.message,
          code: problem.code,
          severity: problem.severity,
        })
      }
    },

    // ── what can come next ──────────────────────────────────────────────────
    compose: [
      {
        id: 'line-head',
        // The head of a line is either a state (to open a block) or a property of
        // the scope the line is in — and it stays offered while it is being
        // spelled, which is why this asks `firstWord` rather than `firstOnLine`.
        when: (context) => {
          if (!context.firstWord) return false
          const line = lineAt(context)
          if (line === undefined) return false
          if (line.key !== undefined || line.opens !== undefined || line.closes) return false
          return true
        },
        range: (context) => context.word,
        items: (context) => {
          const line = lineAt(context)
          const inBlock = line?.state !== undefined
          const items = []
          if (!inBlock) {
            for (const state of STATES) {
              const entry = STATE_VOCAB.entryFor(state)
              items.push({
                label: state,
                insert: state,
                // A block needs its brace, and writing it is the one thing the
                // user would otherwise have to remember.
                append: ' {',
                kind: 'state',
                detail: entry?.detail,
                documentation: entry?.body,
                sortText: '0',
              })
            }
          }
          for (const key of inBlock ? KEYS.state : KEYS.global) {
            const doc = KEY_DOCS[inBlock ? 'state' : 'global'][key]
            items.push({
              label: key,
              insert: key,
              // The space invites the value, and accepting one ends the line: the
              // list that follows a value is the property list for the next line,
              // which is how a document is written without remembering a colon.
              append: ' ',
              kind: 'property',
              detail: doc?.detail,
              documentation: doc?.body,
              sortText: '1',
            })
          }
          if (inBlock) {
            items.push({
              label: '}',
              insert: '}',
              append: '\n',
              kind: 'punctuation',
              detail: 'close the block',
              documentation: 'Every state block has to be closed before the next one opens.',
              sortText: '2',
            })
          }
          return items
        },
      },
      {
        id: 'value',
        // Values belong to a line that has named a property, after that name.
        when: (context) => {
          const line = lineAt(context)
          if (line === undefined || line.key === undefined) return false
          const keyWord = line.words[0]
          return keyWord !== undefined && context.caret > keyWord.to
        },
        range: (context) => valueRange(context),
        items: (context) => valueItems(lineAt(context)),
      },
    ],

    // ── what a thing is ─────────────────────────────────────────────────────
    describe: (context) => {
      const token = context.token
      if (token === undefined) return undefined
      if (token.scope === 'comment') {
        return { title: 'comment', body: 'Ignored by the reader. `//` anywhere on a line starts one.' }
      }
      if (token.scope === 'punctuation') {
        return {
          title: token.text,
          detail: token.text === '{' ? 'opens a state block' : 'closes the open block',
          body: 'A block holds one state\u2019s properties, one per line.',
        }
      }
      if (token.scope === 'state') {
        const entry = STATE_VOCAB.entryFor(token.text)
        return entry === undefined ? undefined : { title: token.text, detail: entry.detail, body: entry.body }
      }
      if (token.scope === 'property') {
        const line = context.state?.lines?.[token.line]
        const doc = KEY_DOCS[scopeOf(line)][token.text]
        return doc === undefined ? undefined : { title: token.text, detail: doc.detail, body: doc.body }
      }
      if (token.scope === 'value.note') {
        const item = parseChimeItem(token.text)
        const length = /:(\d+(?:\.\d+)?(?:ms|s|m)?)$/.exec(token.text)?.[1]
        if (item.problem !== undefined) {
          return {
            title: token.text,
            detail: 'not a chime item',
            body: 'Write a note name such as `A5`, a frequency in Hz such as `880`, or `-` for a rest. A length after `:` is a duration such as `200ms`.',
          }
        }
        if (item.rest === true) {
          return {
            title: token.text,
            detail: 'a rest',
            body:
              length === undefined
                ? 'Silence that still takes time: it moves the chime on without sounding.'
                : `Silence for \`${length}\`: the next item starts when it ends.`,
          }
        }
        return {
          title: token.text,
          detail: `${String(item.frequency)} Hz`,
          body:
            length === undefined
              ? 'Notes play in order, each one starting a little after the one before it. Frequencies in Hz work too.'
              : `\`${length}\` is this item's length: the next item starts when this one ends, so a line of lengths is the rhythm of the chime.`,
        }
      }
      if (token.scope === 'value.number') {
        return {
          title: token.text,
          detail: 'a value',
          body: 'Seconds unless a unit is written: `1.5s`, `300ms`, `2m`.',
        }
      }
      if (token.scope === 'invalid') {
        return {
          title: token.text,
          detail: 'not part of this language',
          body: 'Nothing here accepts this word: it is not a state, not a property of the scope it is written in, and not a value any property recognises.',
        }
      }
      const entry = BY_SCOPE.get(token.scope)?.entryFor(token.text)
      // Nothing documented means nothing to say. Falling back to the scope name
      // would put an internal identifier in front of the user.
      return entry === undefined
        ? undefined
        : { title: token.text, detail: entry.detail, body: entry.body }
    },
  })
}
