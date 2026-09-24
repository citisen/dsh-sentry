# dsh-sentry

[English](README.md) | [中文](README.zh.md)

## If dsh will not boot

The three lines you are looking at are these —

    Failed to load plugins
    web boot: 3 entries did not activate
    @citisen/dsh-sentry: pending (waiting for service: settingsScope)

An enabled plugin row that never activates is a failed boot, not a warning: dsh refuses
to finish starting rather than loading without the plugin. Three ways out, fastest
first, and **all three work while dsh cannot start**. This plugin's row in the profile is
`id: alert`, for `name: '@citisen/dsh-sentry'`.

**1. Disable it — one entry in the profile's own patch layer**
(`$DSH_HOME/profiles/web/cordis.patch.yml`, applied after every bundle layer):

    - id: alert
      disabled: true

No command, no network, nothing to install, and deleting those two lines brings the row
back. `dsh --profile web --dump-config` prints the composed tree — every row's id and
package name, whoever it belongs to — and marks this row `disabled: true` once the patch
takes effect; it loads no plugin, so it works while dsh cannot start.

**2. One boot only, changing nothing** — put the same two lines in a file of your own
and pass it as an overlay:

    dsh --profile web --patch ./no-sentry.yml web

**3. Remove it** — one command drops the dependency *and* the bundle layer
(`dsh.profile.bundles` is reconciled against what is installed). It forwards to pnpm in
the profile directory and never composes the profile, so it runs while dsh cannot start:

    dsh plugin --profile web remove @citisen/dsh-sentry

It needs `pnpm` on `PATH`; without it, delete the package name from
`dsh.profile.bundles` (and the matching `dependencies` entry) in
`$DSH_HOME/profiles/web/package.json` by hand.

**Or just get a working dsh now**: boot a clean profile from the shipped template, which
carries none of your bundles:

    dsh --profile rescue --from-default-profile web

## Compatibility

This build runs on both dsh lines: the **0.1.5-rc.x** line (today's `latest` and
`next`) and **0.1.7-alpha.1**, whose settings model it also speaks. One string names
this plugin's section on both — `alert` — because the 0.1.7 line keys settings by
Loader entry id and this bundle's patch inserts the entry under that name, while the
0.1.5 line registers the same name as a settings namespace.

| what it reads | 0.1.5-rc.x | 0.1.7-alpha.1 |
| --- | --- | --- |
| a session waiting on you | `uiSession.pendingInteractions` | `uiSession.sessionStatus`, whose values carry `pendingInteraction` |
| the durable section | `settingsScope.bind({ namespace: 'alert' })` | `configForms.get('alert')`, over the entry's own `Config` |
| the host contract | `settings.register('alert', schema)` | the exported `Config`, its fields marked `.volatile()` |

Both are bound optionally, so a dsh that provides neither still activates: the plugin
never sits `pending` — which blocks the boot outright — and never throws on activation.
It runs on the shipped defaults, and the first control you touch says why nothing is
saved. Up to `0.1.1` the plugin required the 0.1.5 service, so on
`0.1.7-alpha.1` it was reported as an entry that "did not activate"; `0.1.2`
speaks both lines.

The waiting and approval states are read from whichever of the two shapes dsh provides, so
they still light the tab on either line; the mapping is exercised by `npm run verify`. A dsh
that offers neither is reported once as blind rather than failing activation, because a
failed entry blocks the web boot.

### Settings lost to the 0.1.7 rename

dsh 0.1.7 imports a legacy `$DSH_HOME/settings.yaml` once — each section into the entry
of the same id — and renames the file to `settings.yaml.imported`. Before
`0.1.2` this plugin's entry was named `sentry`, so a `alert` section had
nowhere to go and stayed only in the renamed file. The names match now, so dsh's own
import can put those values back:

1. Copy `$DSH_HOME/settings.yaml.imported` to `$DSH_HOME/settings.yaml` (a copy, not a
   move — the file is the only record until the import runs), and keep only the keys the
   entry still declares: dsh validates the section against that entry's schema and refuses
   the whole section over a single unknown key, so drop every key the table above does not
   list. In the old `alert` section only `style` survives — `volume`, `fishScale`, `title`,
   `sound` and `doneWindowMs` are lines of that document now.
2. Start dsh 0.1.7 once with the profile you use. Every section whose entry now exists
   — `alert` among them — is written into that profile's Cordis patch.
3. A section dsh still does not recognize is reported and stays in
   `settings.yaml.imported`, so **keep that file until you have what you need out of
   it**.

A **tab-page sentry for the DeepSeek Harness Web GUI**: while you are on another
tab, it watches every session and tells you when you are actually needed.

The interface already tells you everything you need *while you are looking at
it* — the sidebar has a state dot per session, the conversation has its own
streaming indicators. What it cannot tell you is anything at all once the tab is
in the background, which is exactly when a long agent turn runs. This plugin
answers one question from across the room — *does anything need me?* — through
the only three channels a background tab has: its **icon**, its **title**, and
its **speakers**.

This is a third-party [dsh](https://github.com/deepseek-ai/deepseek-harness)
profile bundle. It ships as one dual-face package: a Node half that owns the
durable settings namespace, and a browser half that runs the sentry, reads the
style document, and registers the Settings row.

Requires dsh `0.1.5-rc.1` or a later `0.1.5-rc.x`; it uses the
`settings.general.item` slot, the `settingsScope` service, the `sessions` and
`uiSession` services, and `ctx.effect`, which are present in the `latest` and
`next` release channels.

## What it adds

A **Tab alerts** row in *Settings → General*, and three notification channels
that work while the page is in the background:

| Channel | What it shows |
| --- | --- |
| Tab icon | The original fish, carved out of a coloured background: the colour and shape carry the state, the running fish turns, and a corner digit counts open questions |
| Tab title | A prefix, so the exact counts can be read as text: `① Waiting · My session — DeepSeek Harness` |
| Sound | A synthesized chime — three public-domain classical phrases: a knock for a question, a descent for an approval, and a quiet resolution for a completion |

All three are on by default — a notice nobody can discover is a notice nobody
has — and each one is a line of the style document that turns it off: `icon off`,
`title off`, `sound off`, or `chime off` inside a single state's block.

## The state model

Every session is in exactly one state, and the precedence is the whole design:

| State | Detected from | Signal |
| --- | --- | --- |
| Waiting for an answer | A pending interaction of kind `question` | Amber, breathing (`blink`, 1.1 s per cycle), counted in the badge |
| Waiting for an approval | A pending interaction of kind `approval` | Amber, breathing more slowly (`blink`, 1.9 s) |
| Working | `summary.running` | Blue, the fish turning (`turn`, 3 s per revolution) |
| Just finished | The `running → idle` **edge**, within a decay window | Green, the background alternating (`pulse`, 1.6 s per cycle) |
| Idle or blank | — | Nothing |

Three decisions in that table are worth explaining, because each one is a
rejected alternative:

- **A session that is running *and* waiting is waiting.** The running part is not
  the part that needs you.
- **"Just finished" is an edge, not `summary.completed`.** That flag stays true
  until you select the session, so trusting it would leave the tab green forever
  and cost the signal all of its meaning. The plugin stamps the `running → idle`
  transition instead and keeps the signal for `keep-done` (60 seconds by
  default).
- **A blank session is not information.** A session that was created and never
  used would otherwise paint a "working" ring around an empty conversation the
  moment you opened a new tab.


## The sound

Synthesized with Web Audio — no audio files are shipped, and nothing is fetched.
What each state plays is a `chime` line of the document and how loud it plays is a
`volume` line — the document's, or the state's own — so this table is the shipped
document rather than a behaviour baked into the engine:

| Event | Shipped sound |
| --- | --- |
| A question starts waiting | Beethoven's Fifth, op.67: `G G G Eb` — the fate motif, at the document's 50% |
| An approval starts waiting | Bach's Toccata and Fugue in D minor, BWV 565: the held dominant and the descent that follows, at its own 45% |
| A session finishes | Beethoven's Ninth: the "Ode to Joy" theme, low, at its own 25% |

All three are public-domain phrases, and each was chosen for what its state means:
a **knock at the door** because someone is waiting on you; a **grave descent**
because a decision has to be made; a **quiet resolution** because a finished turn
asks nothing of anyone. They are a `chime` line and two `tone`/`volume` lines —
nothing about them is compiled in, so *Settings → General → Tab alerts* is where
you replace them.

`chime` takes note names — equal temperament from A4 = 440 — or frequencies in
Hz, and plays them in order. Both spellings are the same sound; the names are
just the one a musician can read. A note may name its own length in the
document's duration spelling, after a colon:

```
chime A5 E6                        // two bare notes: 130ms each, 90ms apart, overlapping
chime A5:200ms E6:200ms            // the same two notes, end to end
chime A5:120ms -:80ms E6:240ms     // a rest, then a longer note
```

An item that names a length occupies exactly that long: it rings for it and the
next item starts when it ends, which is what makes a written rhythm a rhythm. An
item that names none keeps the shipped pacing — a 130ms note whose successor
starts 90ms later — so every chime written before lengths existed sounds exactly
as it did. `-` is a rest: silence that still takes time, written with a length
like any note — and a chime of nothing but rests is the same silence `off` means.
The shipped document writes every length out, which is what lets three classical
phrases be three lines of text rather than three audio files.

The waveform is a line too, in the same shape `volume` has — a document-level
default, and a block's own for one state:

```
tone triangle                      // the default for every chimed state
waiting { tone square }            // and this state's own, which replaces it
```

The four waveforms are Web Audio's own four — `sine`, `triangle`, `square`,
`sawtooth`. Two of the three shipped phrases are written as `triangle`, which sits
between the pure tone and the chiptune buzz; the completion says nothing, so it
takes the shipped `sine` — the waveform a chime has always been here, and the mark
its card carries is the `(default)` that says so. What the document does *not* own
is the envelope: the short attack and the decay to silence stay the plugin's on
every waveform, because an envelope is a synthesizer patch rather than a
notification setting.

`volume` appears twice, and it means one thing both times: a loudness. The
top-level line is the default; a block's line overrides it for that state. It
**replaces** rather than scales it, so the percentage a preview card prints is
always a number on one of those two lines — or the shipped 0.5, which the card
marks *(default)* when neither line exists. That last sentence is a design this
replaced: an earlier version paired a top-level master with a per-state factor
whose numbers lived **in the plugin**, not in the document, so a reader who wrote
`volume 1` saw `85%` on one card and `45%` on another and could not find either
figure anywhere. `tone` works the same way, with the same *(default)* mark.

Three rules shape when it is allowed to make a sound, and all three are lines
now:

- **Foreground is silence.** While you are looking at the interface the icon and
  the title have already said it, and a chime on top of that is an interruption.
  `sound background` (the shipped value) is that rule, `sound always` turns it
  off, and `sound off` silences every chime at once.
- **One sound per burst.** Agents ask several questions in a row, and three
  chimes in three seconds reads as a malfunction. `chime-gap` is the least time
  between two chimes, 1.5s as shipped, and it is measured against `Date.now()`
  rather than a timer, because a background tab throttles `setTimeout` to the
  minute and a timer-based gap would fire late or not at all.
- **`chime off` is one state's silence, not everyone's.** The three chimed states
  are separate channels on purpose: a `waiting` block that says `chime off` must
  not swallow the approval that arrives in the same burst, so a state with
  nothing to play is skipped rather than allowed to silence the event.

A `chime`, a `tone` or a `volume` written in a `running` block is reported as a
warning: a turn *starting* is not an event this plugin chimes on, and a property
that does nothing should say so rather than be kept in silence.

### The autoplay policy, stated plainly

**No chime can sound until you have clicked this interface at least once.** Before
any user gesture a browser creates the `AudioContext` suspended and will not let
it start; this is the browser's rule, not the plugin's, and it cannot be worked
around. What the plugin does instead:

- The player asks for a resume on the first `pointerdown`/`keydown`, so one click
  anywhere in the interface unlocks the rest of the session;
- a chime requested while the context is still suspended is **dropped**, not
  queued — a chime that arrives two minutes late, after the click that finally
  unlocked audio, is worse than no chime;
- each preview card in the Settings row offers a button that plays exactly that
  state's chime, which doubles as the gesture that unlocks audio and as a way to
  hear the notes and set the loudness by ear.

Until it is unlocked, the icon and the title still carry everything.

## The title

The tab title belongs to `ui-layout`'s `DocumentTitle`, which rewrites it on every
session change, so this plugin **composes** with it rather than taking it over: it
puts its status segment in front of whatever is already there, and puts a
zero-width space at the end of a title it composed.

That marker is the whole trick. Without it there is no way to tell "the plugin
installed this prefix" from "the app's own title happens to contain a ` · `" — and
the difference decides whether removing the prefix removes the plugin's
contribution or a real segment of the app's title. Judged by shape, an app title
like `Part one · Part two — DeepSeek Harness` looks exactly like a prefix, and
every render would eat one more segment of it. The marker makes "this is mine" a
property of the string, so it survives the app rewriting the title, and turning
the channel off strips the prefix instead of leaving it in the tab forever.

## Settings

*Settings → General → Tab alerts.*

The row is **the document, a live preview of every state, and a reset** — and no
switches at all. There is exactly one setting (`style`), because every switch the
row used to carry is a line of the document now: `icon on`, `sound background`,
`keep-done 60s`, `chime off` all sit next to the state they affect, and there is
one place to look for how the plugin behaves instead of two that can disagree.

The editor grows with the document instead of scrolling inside itself: the page
already scrolls, and a second scrollbar for one document is the wrong one to be
reaching for. The bound that is left is for a pasted document hundreds of lines
long, not a display decision — the shipped document (45 lines) is always fully
visible.

Each preview card carries two buttons: **Play**, which sounds that state's chime,
and **In tab**, which puts the state into the *real tab* — icon and title, live.
The second one is the only way to accept a configuration change: the tab icon
otherwise shows the state the sessions happen to be in, so an edit to a state no
session is in can never be judged. Press it again, leave the settings page, or
switch away from the tab and the live state comes back — while the page is out of
sight the tab has to tell the truth, which is the whole reason this plugin exists.

The preview strip draws all four states through the same `sentryFavicon` and
`motionTick` the tab uses, at the real 32px, on one shared 120 ms timer — and on
no timer at all when everything in the document is still, since a settings page
is not the place to hold four intervals open for a document that says `motion
still`. Each card prints the chime its state will play (`G4:170ms → G4:170ms →
G4:170ms → Eb4:680ms · volume 50% · tone triangle`, or *silent*): the notes, their
lengths, the loudness and the waveform are the ones the reader resolved, so what is
heard is what is printed. A phrase of eight notes makes that line long, which is
the honest cost of a shipped melody: the card is a description, not a label.

Anything the reader could not use is listed under the editor with the line number
it is on. That list is not decoration — the editor's own squiggles are the version
that helps while typing, and this is the version that survives a document pasted
into `settings.yaml` and read on a screen the editor was never opened on.

The durable half lives in `$DSH_HOME/settings.yaml` under the `alert` namespace.
The namespace is deliberately not a `ui-*` name: dsh reserves that prefix for its
own shipped surfaces.

## The style document

One small text document decides how the four session states look *and* sound, and
it is the whole configuration. The appearance is four states, each a shape, a
colour, a motion and a rate, plus a chime — and the interesting part is the
combinations. A dozen switches could express that; they would also take a dozen
interactions to say what one block says. So the document is the interface, and the
shipped one is 945 characters:

```
// dsh-sentry: how each session state looks and sounds.
// Durations are seconds unless a unit is written: 1.5s, 300ms, 2m.
// Every chime is a public-domain classical phrase, chosen for what its state means.

icon on
title on
sound background
chime-gap 1.5s
keep-done 60s
volume 0.5

waiting {
  shape rounded
  color amber
  motion blink
  speed 1.1s
  chime G4:170ms G4:170ms G4:170ms Eb4:680ms // Beethoven, Symphony No.5 op.67 - the knock
  tone triangle
}

approval {
  shape rounded
  color amber
  motion blink
  speed 1.9s
  chime A5:350ms G5:95ms F5:95ms E5:95ms D5:95ms C#5:95ms D5:500ms // Bach, Toccata and Fugue in D minor, BWV 565
  tone triangle
  volume 0.45
}

running {
  shape circle
  color blue
  motion turn
  speed 3s
}

done {
  shape circle
  color green
  motion pulse
  speed 1.6s
  chime E4:230ms E4:230ms F4:230ms G4:230ms G4:230ms F4:230ms E4:230ms D4:460ms // Beethoven, Symphony No.9 - Ode to Joy
  volume 0.25
}
```

`lib/index.js` ships the same document as an array of lines — the two halves are
separate bundles that cannot share a module, so the gate compares the two copies
character for character, and a default changed on one side only is a failing check
rather than a row that renders one document and an engine that runs another.

Top-level settings come first, one per line, before any block:

| Setting | Values | What it does |
| --- | --- | --- |
| `icon` | `on` `off` | Draws the state styling on the tab icon, or restores the app's own favicon |
| `title` | `on` `off` | Composes the status into `document.title` |
| `sound` | `off` `background` `always` | When a chime may sound at all: never, only while this page is hidden or unfocused (the shipped value), or even while you are looking at it |
| `chime-gap` | duration | The least time between two chimes |
| `keep-done` | duration | How long "just finished" stays lit |
| `volume` | 0–1 | The default loudness, for every chimed state whose own block does not name one |
| `tone` | `sine` `triangle` `square` `sawtooth` | The default waveform, for every chimed state whose own block does not name one |

Then one block per state, in urgency order — `waiting`, `approval`, `running`,
`done` — with one **named** property per line:

| Property | Values | What it does |
| --- | --- | --- |
| `shape` | `circle` `rounded` `square` `none` | The background's outline |
| `color` | `blue` `amber` `green` `red` `purple` `gray` `dark` `light` | The background colour, from the preset palette |
| `motion` | `still` `turn` `blink` `pulse` | What moves while the state lasts |
| `speed` | duration | The rate: seconds per revolution for `turn`, per cycle for `pulse`, per breath for `blink` |
| `chime` | note names, frequencies, `note:length`, `-:length` rests, or `off` | The notes this state sounds, in order. A note or rest that names a length occupies exactly that long and the next item starts when it ends; one that names none keeps the shipped pacing. `off` silences this state alone |
| `tone` | `sine` `triangle` `square` `sawtooth` | This state's own waveform, overriding the document's default — it replaces that word rather than mixing with it; with neither written the shipped `sine` applies and the card says so |
| `volume` | 0–1 | This state's own loudness, overriding the document's default — it replaces that number rather than scaling it; with neither written the shipped 0.5 applies and the card says so |

Every property is named, and that is the whole point of the shape: there is no
positional slot, no `key=value` spelling to choose between, and no word that means
one thing in one place and something else elsewhere. A block may name its
properties in any order, because the order is the writer's rather than the
reader's, and a line a block omits keeps that state's shipped value. The language
this replaced placed bare words by guessing which vocabulary they belonged to, so
`running circle blue turn 3` was four guesses in a row and a reader had to hold
the slot order in their head.

Durations are seconds unless a unit says otherwise: `3`, `1.1s`, `300ms`, `2m`.
A bare number being seconds is the one unit rule worth remembering, because it is
what `speed 3` reads as.

Comments are `//`, and deliberately **not** `#`: `#` is part of a note name, and a
language whose comment character eats part of its own vocabulary is a language
nobody can write in. `chime C#4` is a note, not a comment.

**The reader is total, deliberately.** A mistake is reported with the line number
it is on, and that one property falls back to its shipped default; a typo in a
settings file must not be able to leave the tab without an icon. Colours are preset *names*
rather than free values for the same reason the shapes are a closed list: both
failures this plugin has already shipped were contrast failures, and a preset
cannot be illegible.

**One reader, two callers.** `readStyleDocument` in `src/style-grammar.js` is the
single structural walk over the document: it decides what the text means *and*
records what is wrong with it, with ranges. The engine's `resolveStyle` calls it
to get drawable values; the editor grammar's `analyze` calls it to paint,
complete, and explain the same text. So the icon, the diagnostics and the
completions are three views of one answer rather than three implementations of
it — an earlier version of that file carried a second copy of the walk because
the grammar was written to stand alone, and a second copy is a second opinion,
which is exactly how an editor comes to offer a property the parser then rejects.

The row's reference is built from the same vocabulary constants the reader is
handed, so the help cannot drift from the code. What is written by hand is the
prose, which is the part a translator has to see.

## The icon

The fish is the product's own art, lifted byte-for-byte out of the shipped
`dsh-web-frontend/dist/favicon.svg` by `scripts/fish-path.mjs` — not redrawn, not
simplified, not a lookalike. It is drawn at **full size**, which for a 50×50
drawing in a 32px canvas is `32/50` — and centred on the art's *own* centre, which
is 25 in its own units rather than 16. Those two numbers come from one constant
because confusing them is a bug this plugin shipped: centring a 50-unit drawing as
if it were a 32-unit one held the fish in the bottom-right corner of the background
with its nose and tail cut off by the rim, and no test noticed, because every test
recomputed the same arithmetic the bug used. The pixel check measures the rendered
geometry instead.

It is then **carved out of the background**, not painted on it. That is the
decision the whole icon rests on:

```
   ╭───────────────╮          the fish is negative space, so its
   │   ▄▄▄▄▄▄▄     │          silhouette is the TAB BAR showing
   │  ██ ●  ● ██   │          through — legible against any colour,
   │   ▀▀▀▀▀▀▀     │          in any browser theme, with no stroke to
   ╰───────────────╯          collide with at 16px
```

Painting it instead produced a white shape on a coloured disc whose edges smeared
at favicon size, and a black shape on a dark disc that vanished entirely. Both
shipped; both were reported as "a white circle".

The state is carried by the background's **colour and shape**, by the **motion**,
and by a corner digit for the question count. Nothing else is drawn on the icon:
the dial-like patterns this once carved around the fish — spokes, clock hands,
petals, windmill, dots, rays — were each rendered at the real 16px size and each
read as noise around a fish nobody could then see. The `pattern` slot is gone
entirely rather than kept at `none`, because a vocabulary of one word is a
vocabulary that lies about what can be configured, and a line that can never do
anything is a line the reader would have to accept and then ignore.

### Motion

A `turn` rotates **the fish**, about the centre of the canvas — the icon is *about*
this glyph, so the glyph is what moves, and no extra mark has to be drawn to say
"working". A turning fish is scaled down slightly (`FISH_TURN_SCALE`, derived from
the art's measured half-extent) so the circle its corners sweep stays inside the
background; at full size it would clip the rim twice per revolution, which at 16px
reads as a flicker rather than as a turn.

Motion is **driven by the plugin**, not declared in the SVG. A favicon is rendered
in a document the page does not own, and the motion categories do not have equal
standing there: an earlier version left the spin to an `<animateTransform>` and it
did not move, while the colour pulse worked. So a motion is a function from a tick
to an appearance — `blink` dims, `pulse` alternates the colour, `turn` steps the
angle — and the engine repaints every 120 ms while something is animating.
`prefers-reduced-motion` stops the timer, and an idle tab holds no timer at all.
The settings row's previews are the same function on the same 120 ms, so a state
that moves in the strip moves in the tab and a document that is all `still` holds
no timer in either place.

One honest consequence: the fish is only visible where the tab bar differs from the
background. On a tab bar that happens to match, the background reads as a plain
shape. A page cannot know the browser's chrome colour, which is why motion and
silhouette carry the state, and why the icon never depends on the background
alone.

## Install

```sh
dsh plugin --profile web add @citisen/dsh-sentry
```

Or straight from GitHub (same package, not via the registry):

```sh
dsh plugin --profile web add github:citisen/dsh-sentry
```

Then restart the Web interface:

```sh
dsh --profile web
```

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles
`dsh.profile.bundles`; because this package declares `dsh.bundle`, installing it
appends the layer automatically, with no hand edit to `cordis.patch.yml`.

### Installing from a local checkout

On Windows, when the profile and the checkout are on **different drives**,
`dsh plugin --profile web add <path>` is unreliable: pnpm resolves the link to a
path that does not exist, so the reconciler decides the package declares no
`dsh.bundle` and leaves it out of `bundles`. Create the link yourself:

```sh
cd "$DSH_HOME/profiles/web"
pnpm add "D:/path/to/dsh-sentry"      # writes the dependency
# pnpm's link points at <profile>/D:/path/... which does not exist; replace it:
cmd /c rmdir node_modules\@citisen\dsh-sentry
cmd /c mklink /J node_modules\@citisen\dsh-sentry D:\path\to\dsh-sentry
# then add "@citisen/dsh-sentry" to dsh.profile.bundles in package.json
```

Check the result with `node scripts/verify-profile.mjs`: if the row is missing
from the composed entry list, it fails loudly.

## Development

```sh
node scripts/fish-path.mjs   # lift the shipped favicon's fish into src/fish.txt
npm run build                # src/client.js -> lib/client.js
npm run check                # the release gate: artifacts in sync + both halves
npm run check:all            # plus a real profile composition check (needs a local dsh)
npm run verify               # just the verification scripts
npm run watch                # rebuild on save, for dsh-client-hmr
```

Five checks in five places, each one covering what the one before it cannot:

| Check | Runs | Catches |
| --- | --- | --- |
| `verify-host.mjs` | Node, stubbed | The host half on its own: that the namespace is `alert` and not a reserved `ui-*` one, that the roster is exactly `['style']`, that the schema resolves the shipped document, and that a hand-edited `settings.yaml` cannot put a number, a list or a boolean where the text belongs. Also that `apply()` is a no-op rather than a throw when no settings provider is composed |
| `verify-settings.mjs` | Node, real dsh services | The namespace contract the interface depends on: that the real settings service accepts `alert`, that it applies `live`, and — the failure this one exists for — that the value the **host** resolves and the defaults the **browser half** falls back to are the same value, document included, byte for byte. They live in bundles that cannot share a module, so a default changed on one side only would render one setting and enforce another |
| `verify-client.mjs` | Node, stubbed | Every pure decision: the state precedence, the completion edge, the icon geometry, the title composition, the sound gating, the settings row, and `apply()` end to end against stub services. Since the rewrite it also covers the document: the shared reader — the engine and the grammar are run over the same broken text and must report the same problems — the note names, the per-note lengths, the rests and the duration syntax, the grammar the editor is written against (its paint, its diagnostics and its completions), the waveforms, the four previews at the size and with the sound the row prints, and the problems list under the editor |
| `browser-check.mjs` | Headless Chrome | The things a stub cannot judge: whether the browser **decodes** the favicon data URL (an unencoded `#` truncates it into half a fish, with no error anywhere), whether the DOM contract holds (its own `<link>` appended to the head, the app's link left alone, its own element removed), whether the `MutationObserver` title guard survives the browser's own scheduling, whether a settings write really repaints the icon, and whether a preview really reaches the tab |
| `verify-profile.mjs` | Node, real dsh profile | That the loader actually composes this bundle: the `cordis.patch.yml` row resolves, `dsh.profile.bundles` carries it, and the browser roster can find and serve `lib/client.js` |

The last two skip cleanly when the thing they need is absent — no Chromium, no
local dsh — so they are safe in CI; `DSH_REQUIRE=1` turns either skip into a
failure.

`src/client.js` is the browser half's source, and `src/style-grammar.js` is its
second file: the reader and the grammar the editor is written against. Neither is
loaded as a module. A DSH client bundle is a **classic script** that may only
register a lazy CommonJS factory through `window.__ModuleLoader__` and may only
`require` the platform singletons the shell seeds, so `scripts/build-client.mjs`
applies that envelope, rewrites the static imports, and splices the grammar file
in where its import stood. A spliced module shares the factory's scope, which is
why the vocabularies there are declared inside the grammar factory — a top-level
`SHAPES` would be a second one beside the plugin's. The build also compiles the
settings editor in from `node_modules`, because `@citisen/litearea` is not a
platform singleton and the documented alternative — a second client bundle and a
second roster row — is a plugin with two halves to install. That same transform is
why there is no JSX: it is deliberately narrow, and it fails loudly on any form it
cannot express.

`src/fish.txt` is generated: it is the shipped favicon's path, extracted from the
installed dsh rather than transcribed, because a hand-copied 3400-character path
is a path with a dropped digit in it. The build substitutes it into the bundle and
`verify-client.mjs` compares the committed copy against the installed art.

### Why there is no React in the engine

The state the sentry reacts to is reachable from the cordis context itself:
`ctx.sessions.list` and `ctx.uiSession.pendingInteractions` are both
`{ getSnapshot(), subscribe() }` observables owned by services the Web
composition always installs — the same objects `ui-session` hands to the
`useSessions` / `useSessionPendingInteraction` hook seats. So the whole engine is
plain DOM plus two subscriptions, and React appears exactly once, in the Settings
row, because the slot system is React. That is why this plugin registers no
always-mounted component and occupies no global slot: a third-party bundle has
fewer ways to collide with the interface when it stays out of the render tree.

Every decision is a pure function taking its inputs as arguments — the clock, the
storage, the visibility and focus bits, the reduced-motion bit, the note table.
The document reader is one of them, which is what lets the same walk answer for
the icon and for the editor in Node. `apply()` is the only impure part, and it is
deliberately thin. `scripts/verify-client.mjs` drives the pure half in Node,
where a regression is a failing check instead of a silently-green favicon.

## Package layout

| Path | What it is |
| --- | --- |
| `lib/index.js` | Node half: the `alert` settings namespace, which holds the one document field. Loaded by the loader. |
| `lib/client.js` | Browser half, **generated from `src/client.js`** and served to the GUI. |
| `src/client.js` | Browser half source: the state model, the three channels, the settings row, the previews, and `resolveStyle`. |
| `src/style-grammar.js` | Browser half source: `readStyleDocument`, the single structural walk, and the litearea grammar the editor is written against. Spliced into `lib/client.js` by the build. |
| `src/fish.txt` | Generated: the shipped favicon's fish path. |
| `cordis.patch.yml` | The profile layer this bundle contributes. |
| `scripts/` | Build, generation, and verification scripts. |
| `PUBLISHING.md` | Trusted publishing: the setup, and what it does not protect against. |
| `RELEASING.md` | The runbook for shipping a change. |

## Known limitations

- **The favicon is shared, and this plugin takes it while it has something to
  say.** It never touches the app's own link: every change of picture mounts a
  fresh `<link rel="icon">` of its own and takes the previous one out — a tab strip
  follows the document's *set* of icon links, and a link whose `href` changed in
  place is not reliably a change, which is where a configuration edit that left the
  tab showing the old icon came from — and it removes its element when the tab goes
  quiet. A second plugin that also writes a favicon mounts its own element, and
  because this one remounts on every redraw it will effectively stay the winner;
  that is a conflict to settle in the interface, not by making this one quieter.
- **A background tab's repaints are throttled.** The browser stretches the interval
  between repaints while the tab is hidden — the icon is still in the right state
  with the right colour, but the turn is not smooth. That is the browser's power
  policy rather than a bug.
- **The title marker is a zero-width space.** It is invisible and it makes the
  composition honest; a tool that copies `document.title` verbatim (a bookmark
  name, a window-title watcher) will see one extra U+200B.
- **The waiting count is capped at three.** At 16px a two-character badge is a
  smudge, so four or more shows no digit — the ring still says "several", and the
  title still carries the exact number.
- **"Just finished" needs a decay window to mean anything.** With `keep-done 0`
  the green signal never appears — and, since the completion chime rides the same
  `running → idle` edge, that chime goes quiet with it. That is a legitimate
  configuration rather than a broken one, but it is a two-channel switch wearing
  one name.
- **The document is the only interface for a single value.** There is no colour
  picker and no rate slider: changing one state's colour means editing one line,
  and leaving that line out is the only way to say "whatever the plugin ships".
  That is the trade the document made — one place where the appearance and the
  sound of all four states are written, instead of a dozen controls each saying a
  fragment of it.
- **A card is not the tab strip.** It draws through the same builder at the same
  32px, so a state that looks wrong in the strip looks wrong in the tab — which is
  what the **In tab** button is for. What neither can show is what a particular
  browser's chrome does to the icon, which is the one thing the icon cannot know
  either.
- **The sound needs one click to unlock**, per the browser's autoplay policy. The
  plugin cannot and does not try to defeat that.
- **A dsh release can turn a channel into a no-op.** If `ui-layout` stops writing
  `document.title`, there is nothing to compose with; if the session list or the
  pending-interaction service changes shape, the engine sees an empty snapshot
  and reports nothing rather than throwing inside the browser. Both are the
  intended failure modes — quiet, not broken.
- **The settings row is English/Chinese only**, matching the shipped locale pair.

## License

MIT
