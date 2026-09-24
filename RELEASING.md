# Releasing

The runbook for changing the plugin and getting it to users. For the *why*
behind the setup (and what it does not protect against), see
[PUBLISHING.md](PUBLISHING.md).

The next version to ship is **0.2.0** — a minor, because it adds vocabulary to the
style document rather than repairing it. `0.1.0` was published by hand on
2026-09-21, before trusted publishing could be configured for it; `0.1.3` was the
last CI-staged release.

What `0.2.0` adds, all of it inside the document:

- **A note can name its own length.** `chime A5:200ms E6:200ms` — an item that names
  a length rings for it and the next item starts when it ends, which is what makes a
  written rhythm a rhythm. An item that names none keeps the engine's shipped pacing
  (a 130ms note, the next starting 90ms later), so **every chime written before this
  version sounds exactly as it did**.
- **`-` is a rest.** `-:200ms` is silence that still takes time, and a chime of
  nothing but rests resolves to the silence `off` already means.
- **`tone` picks the waveform** — `sine`, `triangle`, `square`, `sawtooth` — as a
  document-level default and a per-state override, in the same shape `volume` has.
  A `tone` written in a `running` block is reported as inert, beside `chime` and
  `volume`.

It also changes the shipped document: the three chimes are now public-domain
classical phrases — Beethoven's Fifth for a question, Bach's D-minor Toccata for an
approval, the "Ode to Joy" theme for a finished turn — chosen for what each state
means. The document grew from 538 to 945 characters, and the bundle from 280,611 to
291,622 bytes raw (81,228 → 84,646 gzipped): three melodies cost +3.4KB over the
wire, because there are still no audio files and nothing is fetched. The preview
cards print every note a chime writes, so the shipped `done` card's line is longer
than it was; that is the card describing the document rather than summarising it.

**Check for a stale stage before approving this one** — `npm run release -- list`
needs `npm login` on a machine whose token was revoked, which is the same login the
approval step needs. A stage for a version that is not being shipped should be
rejected rather than left to sit beside this one.

## The short version

```sh
# 1. edit code, then get the generated bundle back in sync
npm run build

# 2. prove it (needs a local dsh; otherwise it skips that last check)
npm run check:all

# 3. bump the version
npm version patch --no-git-tag-version   # or minor / major

# 4. land it through a PR (main is protected — direct pushes are rejected)
git checkout -b feat/whatever
git commit -am "Describe the change"
git push -u origin feat/whatever
gh pr create --fill && gh pr merge --squash --delete-branch

# 5. tag the merged commit, then stage
git checkout main && git pull --ff-only
git tag v0.1.1 && git push origin v0.1.1
gh workflow run stage.yml --ref main -f dist-tag=latest -f confirm=0.1.1

# 6. approve the `npm-publish` deployment on the run page — the staging job does
#    not start, and no OIDC token is minted, until you do — then copy the
#    integrity out of the run's "Release evidence" block

# 7. review, then approve (this is the only step that publishes)
npm run release -- list                  # find the stage-id
npm run release -- view <stage-id>
npm run release -- approve <stage-id> --expect <sha512-integrity-from-the-run>

# 8. confirm users can get it
npm view @citisen/dsh-sentry dist-tags
```

## Bootstrapping the first release

*Step 1 is done: `0.1.0` was published by hand on 2026-09-21. Steps 2 and 3 are
what the next release proves — a trusted publisher configured on the package's own
settings page, and `0.1.1` staged by CI and approved by hand.* Trusted publishing
is configured on a package's **own settings page**, so the first version has to be
published by hand:

1. Publish `0.1.0` locally with your 2FA:

   ```sh
   npm login
   npm run check
   npm publish --access public
   ```

2. Configure the trusted publisher for it: see
   [PUBLISHING.md](PUBLISHING.md#one-time-setup). From then on, CI can stage and
   nothing local needs publish rights at all.

3. Verify the OIDC path actually works by cutting `0.1.1` through steps 3–6 above
   — a staged tarball that a human approves, with no token involved.

Keep the local token only until step 3 has succeeded, then revoke it.

## Step detail

### 1. Edit and rebuild

`src/client.js` → `lib/client.js` is a build, not a hand-edit.
**`lib/client.js` is generated and committed** — if you edit it directly the next
build overwrites you, and `lib/index.js` is the only half you edit in place.

`src/fish.txt` is generated too, by `scripts/fish-path.mjs`, which lifts the
shipped favicon's path straight out of the installed dsh. Regenerate it when dsh
updates the art:

```sh
node scripts/fish-path.mjs           # rewrite src/fish.txt from the installed dsh
node scripts/fish-path.mjs --check   # fail if it has drifted
npm run build                        # src/client.js (+ fish.txt) -> lib/client.js
npm run watch                        # rebuild on save, while `dsh --profile web` runs elsewhere
```

### 2. Prove it

```sh
npm run check      # bundle in sync + host half + client half
npm run check:all  # also composes a real profile to confirm the loader sees it
```

`check:all` needs a dsh installation and an initialized profile, and **skips that
one check** when they are absent. Run it locally anyway: it is the only check
that catches a `cordis.patch.yml` that no longer resolves, which shows up in the
browser as nothing happening at all.

A passing verifier is not the same as a working tab. Exercise the three channels
by hand, because none of them can be observed from Node:

```sh
dsh --profile web
```

Then: start a session, switch to another tab, and watch for the ring to appear on
the tab icon while the agent works; let it ask a question and confirm the amber
arc, the corner digit, and the chime; come back and confirm the icon reverts; and
toggle each switch in *Settings → General → Tab alerts* to see the change take
effect immediately.

### 3. Bump the version

```sh
npm version patch --no-git-tag-version   # or minor / major
```

`--no-git-tag-version` matters: it stops npm from creating the tag on the
pre-merge commit. The tag has to point at the commit on `main`, and the workflow
checks that with `git tag --points-at HEAD`.

### 4. Land it through a PR

`main` is protected with `enforce_admins: true`, so **even you cannot push to it
directly**. This is deliberate: the publishing grant trusts the repository, so
push access effectively *is* publish access.

Required approvals is 0, because GitHub will not let you approve your own PR; you
can `gh pr merge --squash` your own work. Linear history is required, so squash
or rebase rather than merge-commit.

### 5. Tag, then stage

```sh
git tag v0.1.1 && git push origin v0.1.1
gh workflow run stage.yml --ref main -f dist-tag=latest -f confirm=0.1.1
```

The `confirm` input must equal `package.json`'s version exactly — it exists to
catch a wrong-version release.

The workflow refuses to stage when:

| Refusal | Meaning |
| --- | --- |
| confirmation ≠ `package.json` version | wrong version typed |
| `npm run check` fails | the bundle is stale, or a half is broken |
| version already published **or staged** | bump it; approve or reject the old stage first |
| `latest` without a `v<version>` tag on that exact commit | tag the merged commit first |

It also deletes any `.npmrc` and unsets `NODE_AUTH_TOKEN`/`NPM_TOKEN` before
staging, so a stray credential fails closed rather than quietly overriding the
OIDC exchange.

### 6. Review, then approve

**Staging is not publishing.** After a successful run nothing is installable:
`npm view @citisen/dsh-sentry version` still reports the previous release. A
human must approve, and npm gates that on 2FA.

```sh
npm run release -- list                  # find the stage-id
npm run release -- view <stage-id>       # metadata, and who staged it
npm run release -- download <stage-id>   # the tarball itself
npm run release -- approve <stage-id>    # publishes — requires 2FA
npm run release -- reject <stage-id>     # discard it
```

`npm run release` exists because `npm stage` needs npm ≥ 12 while this machine's
npm may be older; the helper runs `npx npm@12` so you never have to upgrade
globally. The bare `npm stage ...` commands npm's website shows **will not work
here** — `Unknown command: "stage"`. Keep the `run release --` prefix and the `--`.

Reviewing properly means checking `staged by:` reads
`GitHub Actions (trusted automation)`, and — if you did not build it yourself —
actually opening the downloaded tarball. Approving on autopilot turns the gate
into a click.

### 7. Confirm

```sh
npm view @citisen/dsh-sentry dist-tags        # latest should now be the new version
```

Then verify the *published* artifact, not just the working tree — a `files` entry
missing from `package.json` is invisible locally and fatal remotely:

```sh
dsh plugin --profile scratch add @citisen/dsh-sentry
node scripts/verify-profile.mjs scratch
node scripts/verify-host.mjs   "$DSH_HOME/profiles/scratch/node_modules/@citisen/dsh-sentry/lib/index.js"
node scripts/verify-client.mjs "$DSH_HOME/profiles/scratch/node_modules/@citisen/dsh-sentry/lib/client.js"
```

## Things that will bite you

**A published version cannot be reused, and may not be deletable.** npm allows
unpublishing only within 72 hours and discourages it; beyond that the version
number is burned. If you ship something broken, publish a patch.

**A pushed tag cannot be moved.** `allow_force_pushes` is off, and moving a tag
would defeat the ancestry check anyway. Tagged a commit and then found a problem?
Bump the version and tag again.

**`lib/client.js` must be committed.** The workflow and any `npm install` from
git use the committed file; it does not build on install.

**`src/fish.txt` must be committed too**, for the same reason — and it is the one
generated file whose source is *another package*. If dsh changes its favicon and
`src/fish.txt` is not regenerated, the tab icon silently keeps the old art; the
verifier only catches it when it can see the new one.

**The favicon is a shared resource, and this plugin owns it while it has
something to say.** It appends its own `<link rel="icon">` and removes it when
the tab is quiet, leaving the app's own link untouched. A second plugin that
writes a favicon would be the last one to mount; that is a conflict to resolve in
the interface, not by making this plugin quieter.

**A dsh release can turn a channel into a no-op.** If `ui-layout` stops writing
`document.title`, the title channel has nothing to compose with — the plugin
still composes correctly with whatever title it finds, which is the intended
degradation. If the session list or the pending-interaction service changes
shape, the engine sees an empty snapshot and reports nothing, rather than
throwing inside the browser.

## Quick reference

| Task | Command |
| --- | --- |
| Regenerate the fish path | `node scripts/fish-path.mjs` |
| Rebuild the browser bundle | `npm run build` |
| Rebuild on save | `npm run watch` |
| Full local gate | `npm run check:all` |
| Bump version | `npm version patch --no-git-tag-version` |
| Open + merge a PR | `gh pr create --fill && gh pr merge --squash --delete-branch` |
| Tag and stage | `gh workflow run stage.yml --ref main -f dist-tag=latest -f confirm=<version>` |
| List stages | `npm run release -- list` |
| Review a stage | `npm run release -- view <stage-id>` |
| Publish (2FA) | `npm run release -- approve <stage-id>` |
| Discard a stage | `npm run release -- reject <stage-id>` |
| Check what users get | `npm view @citisen/dsh-sentry dist-tags` |
