# dsh-sentry

[English](README.md) | [中文](README.zh.md)

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
durable settings namespace, and a browser half that runs the sentry and
registers the Settings row.

Requires dsh `0.1.5-rc.1` or a later `0.1.5-rc.x`; it uses the
`settings.general.item` slot, the `settingsScope` service, the `sessions` and
`uiSession` services, and `ctx.effect`, which are present in the `latest` and
`next` release channels.

## What it adds

A **Tab alerts** row in *Settings → General*, and three notification channels
that work while the page is in the background:

| Channel | What it shows |
| --- | --- |
| Tab icon | A status ring around the original fish: an amber arc on the left for sessions waiting on you, a blue arc on the right for sessions working, and a corner digit with the number of open questions |
| Tab title | A prefix, so the exact counts can be read as text: `① Waiting · My session — DeepSeek Harness` |
| Sound | A synthesized chime — rising two notes for a question, one note for an approval, a soft low note for a completion |

All three are on by default — a notice nobody can discover is a notice nobody
has — and every one of them can be switched off on its own.

## The state model

Every session is in exactly one state, and the precedence is the whole design:

| State | Detected from | Signal |
| --- | --- | --- |
| Waiting for an answer | A pending interaction of kind `question` | Amber, breathing, counted in the badge |
| Waiting for an approval | A pending interaction of kind `approval` | Amber, static |
| Working | `summary.running` | Blue, rotating |
| Just finished | The `running → idle` **edge**, within a decay window | Green, static |
| Idle or blank | — | Nothing |

Three decisions in that table are worth explaining, because each one is a
rejected alternative:

- **A session that is running *and* waiting is waiting.** The running part is not
  the part that needs you.
- **"Just finished" is an edge, not `summary.completed`.** That flag stays true
  until you select the session, so trusting it would leave the tab green forever
  and cost the signal all of its meaning. The plugin stamps the `running → idle`
  transition instead and keeps the signal for `doneWindowMs` (one minute by
  default).
- **A blank session is not information.** A session that was created and never
  used would otherwise paint a "working" ring around an empty conversation the
  moment you opened a new tab.

## The icon

The fish is the product's own art, lifted byte-for-byte out of the shipped
`dsh-web-frontend/dist/favicon.svg` by `scripts/fish-path.mjs` — not redrawn, not
simplified. A ring goes around it, and the two state classes live on opposite
halves so one 16-pixel icon can carry "two are working, one is waiting for me"
without a legend:

```
        ╭───────────╮            ring track: amber / blue / green,
     ╭──┤   ◉  ②    ├──╮         recolored rather than appearing
     │  │  (fish)   │  │         and disappearing
     ╰──┤           ├──╯
        ╰───────────╯            ② = open questions (1–3; above
       left arc: waiting          that the ring says "several")
       right arc: working
```

Motion is SMIL, never a CSS transform: in the favicon replacement document a CSS
`transform` has no reliable origin and renders as a wobble, while
`animateTransform` with an explicit center does not. Rotation is emitted as eight
45° steps rather than a smooth sweep, because a discrete tick is what a spinner
means. With `prefers-reduced-motion` set, no animation is emitted at all and the
arcs are drawn at full opacity instead — the counts survive, the motion does not.

Honest about the size: **at 16px the fish is only about 5 pixels across.** It is
there so the tab is recognizably *this* tab, not to be looked at. That is why the
fish's share of the icon is a setting.

## The sound

Synthesized with Web Audio — no audio files are shipped, and nothing is fetched.

| Event | Sound |
| --- | --- |
| A question starts waiting | A5 → E6, two overlapping notes (a real musical interval, not two arbitrary beeps) |
| An approval starts waiting | One A5 note |
| A session finishes | One soft low note, quieter |

Two rules shape when it is allowed to make a sound, and both are switchable:

- **Foreground is silence.** While you are looking at the interface the icon and
  the title have already said it, and a chime on top of that is an interruption.
  Sound is for a hidden or unfocused page; *Only when this page is in the
  background* is the switch that turns the rule off.
- **One sound per burst.** Agents ask several questions in a row, and three
  chimes in three seconds reads as a malfunction. The gap is measured against
  `Date.now()` rather than a timer, because a background tab throttles
  `setTimeout` to the minute and a timer-based gap would fire late or not at all.

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
- the row's **Preview** button plays the chime, which doubles as the gesture that
  unlocks audio and as a way to set the volume by ear.

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

| Setting | Default | What it does |
| --- | --- | --- |
| Tab icon styling | On | Draws the state styling on the tab icon, or restores the original |
| Style document | see below | The appearance of the four states, as a small text document |
| Tab title prefix | On | Composes the status into `document.title` |
| Sound | On | Master switch for the chime |
| Chime when a question waits | On | The rising two-note chime |
| Chime when an approval waits | On | The single note |
| Chime when a session finishes | On | The soft low note — a finished turn is ambient information, so this is the first switch to turn off if it starts to feel like noise |
| Only when this page is in the background | On | The foreground-is-silence rule |
| Volume | 50% | Chime volume, 0–1 |
| Completed signal window | 60s | How long a finished session keeps the signal |

The durable half lives in `$DSH_HOME/settings.yaml` under the `alert` namespace.
The namespace is deliberately not a `ui-*` name: dsh reserves that prefix for its
own shipped surfaces.

### The style document

The icon's appearance is four states, each a **shape, a colour, a pattern, a
motion, and a rate** — and the interesting part is the combinations. A dozen
switches could express that; they would also take a dozen interactions to say what
one line says. So it is one text document:

```
running  circle  blue   spokes=2 dot  turn   3
waiting  rounded amber  none          blink  1.1
approval rounded amber  none          blink  1.9
done     circle  green  none          flush  1.6
```

The syntax is line-oriented: one line per state, `key value` pairs, `#` starts a
comment, and the leading tokens may be positional in the order shape, colour,
pattern, motion, speed. `spokes=3` is one token that sets the pattern *and* its
count. Anything a line omits keeps that state's shipped value.

| Vocabulary | Values |
| --- | --- |
| shape | `circle` `rounded` `square` `none` |
| pattern | `none` `hands` `spokes` `petals` `windmill` `dots` `rays` |
| tip (for `spokes` / `hands`) | `none` `dot` `arrow` `bar` |
| motion | `still` `turn` `blink` `flush` |
| colour | `blue` `amber` `green` `red` `purple` `gray` `dark` `light` |

**The parser is total, deliberately.** Anything it does not understand is dropped
and reported, and the shipped value is used instead — a typo in a settings file
must not be able to leave a tab without an icon. Colours are preset *names* rather
than free values for the same reason the shapes are a closed list: both failures
this plugin has already shipped were contrast failures, and a preset cannot be
illegible.

The settings row renders its reference table from the vocabularies the parser
actually uses, so the help cannot drift from the code.

## The icon

The fish is the product's own art, lifted byte-for-byte out of the shipped
`dsh-web-frontend/dist/favicon.svg` by `scripts/fish-path.mjs` — not redrawn, not
simplified, not a lookalike. It is drawn at **full size**, which for a 50×50
drawing in a 32px canvas is `32/50`.

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

Motion is SMIL and nothing else. In the favicon replacement document a CSS
`transform` has no reliable origin and renders as a wobble, while
`animateTransform` with an explicit center does not. With `prefers-reduced-motion`
set, no animation is emitted at all — the shape and the colour survive, the motion
does not.

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
| `verify-host.mjs` | Node, stubbed | A schema whose defaults or ranges drifted from what the browser half assumes |
| `verify-settings.mjs` | Node, real dsh services | The namespace contract the interface depends on: that the real settings service accepts `alert`, that it applies `live`, and — the failure this one exists for — that the value the **host** resolves and the defaults the **browser half** falls back to are the same value. They live in bundles that cannot share a module, so a default changed on one side only would render one setting and enforce another |
| `verify-client.mjs` | Node, stubbed | Every pure decision: the state precedence, the completion edge, the icon geometry, the title composition, the sound gating, the settings row, and `apply()` end to end against stub services |
| `browser-check.mjs` | Headless Chrome | The three things a stub cannot judge: whether the browser **decodes** the favicon data URL (an unencoded `#` truncates it into half a fish, with no error anywhere), whether the DOM contract holds (its own `<link>` appended to the head, the app's link left alone, its own element removed), and whether the `MutationObserver` title guard survives the browser's own scheduling |
| `verify-profile.mjs` | Node, real dsh profile | That the loader actually composes this bundle: the `cordis.patch.yml` row resolves, `dsh.profile.bundles` carries it, and the browser roster can find and serve `lib/client.js` |

The last two skip cleanly when the thing they need is absent — no Chromium, no
local dsh — so they are safe in CI; `DSH_REQUIRE=1` turns either skip into a
failure.

`src/client.js` is the only source of the browser half. It is written as an ES
module for readability, but a DSH client bundle is a **classic script** that may
only register a lazy CommonJS factory through `window.__ModuleLoader__`, so
`scripts/build-client.mjs` applies that envelope and rewrites the static imports
(which is also why there is no JSX — the transform is deliberately narrow and
fails loudly on any form it cannot express).

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
`apply()` is the only impure part, and it is deliberately thin.
`scripts/verify-client.mjs` drives the pure half in Node, where a regression is a
failing check instead of a silently-green favicon.

## Package layout

| Path | What it is |
| --- | --- |
| `lib/index.js` | Node half: the `alert` settings namespace. Loaded by the loader. |
| `lib/client.js` | Browser half, **generated from `src/client.js`** and served to the GUI. |
| `src/client.js` | Browser half source: the state model, the three channels, the row. |
| `src/fish.txt` | Generated: the shipped favicon's fish path. |
| `cordis.patch.yml` | The profile layer this bundle contributes. |
| `scripts/` | Build, generation, and verification scripts. |
| `PUBLISHING.md` | Trusted publishing: the setup, and what it does not protect against. |
| `RELEASING.md` | The runbook for shipping a change. |

## Known limitations

- **The favicon is shared, and this plugin takes it while it has something to
  say.** It appends its own `<link rel="icon">` and removes it when the tab goes
  quiet, leaving the app's own link untouched. A second plugin that also writes a
  favicon would be the last one to mount; that is a conflict to settle in the
  interface, not by making this one quieter.
- **A background tab's animations are throttled.** SMIL keeps running at a much
  lower frame rate while the tab is hidden — the ring is still there and still
  reads as busy, but the rotation is not smooth, and that is the browser's power
  policy rather than a bug.
- **The title marker is a zero-width space.** It is invisible and it makes the
  composition honest; a tool that copies `document.title` verbatim (a bookmark
  name, a window-title watcher) will see one extra U+200B.
- **The waiting count is capped at three.** At 16px a two-character badge is a
  smudge, so four or more shows no digit — the ring still says "several", and the
  title still carries the exact number.
- **"Just finished" needs a decay window to mean anything.** With
  `Completed signal window` set to 0 the green signal never appears — and, since
  the completion chime is driven by the same edge, that chime goes quiet with it.
  That is a legitimate configuration rather than a broken one, but it is a
  two-channel switch wearing one name.
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

