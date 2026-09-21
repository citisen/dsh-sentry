/**
 * Lift the shipped favicon's fish path into `src/fish.txt`.
 *
 * The tab icon this plugin draws a ring around is the *product's own* art, and
 * the only honest way to keep it identical is to copy it from the installed dsh
 * rather than to transcribe it by hand. Transcription is how an icon quietly
 * becomes a slightly different icon: a dropped coordinate, a merged number, a
 * digit lost to a line wrap. So the art is generated, the generator reads it from
 * the dsh that is actually installed, and `scripts/verify-client.mjs` re-reads
 * the same file and fails the check when the generated copy drifts.
 *
 * Resolution order, first hit wins:
 *
 * 1. `--from <path>` / `DSH_SENTRY_FAVICON`, for a pin or an offline run.
 * 2. `@deepseek-ai/dsh-web-frontend/package.json` resolved through the profile
 *    named by `DSH_PROFILE` (default `web`) under `$DSH_HOME` (default `~/.dsh`),
 *    which is where a plugin's dependencies actually resolve at runtime.
 * 3. The same specifier through this package's own tree.
 *
 * Usage:
 *   node scripts/fish-path.mjs            # write src/fish.txt
 *   node scripts/fish-path.mjs --check    # fail if src/fish.txt is stale
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'src', 'fish.txt')

/** The package whose `favicon.svg` is the product's tab icon. */
const FRONTEND = '@deepseek-ai/dsh-web-frontend'

/**
 * Every place the frontend package might be resolvable from, in order.
 * @returns the anchors to try.
 */
function anchors() {
  const list = []
  const explicit = process.env.DSH_SENTRY_FAVICON
  if (explicit !== undefined) list.push({ kind: 'file', path: resolve(explicit) })
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const dshHome = process.env.DSH_HOME ?? (home === '' ? undefined : join(home, '.dsh'))
  const profile = process.env.DSH_PROFILE ?? 'web'
  if (dshHome !== undefined) {
    const anchor = join(dshHome, 'profiles', profile, 'package.json')
    if (existsSync(anchor)) list.push({ kind: 'package', from: anchor })
  }
  list.push({ kind: 'package', from: join(root, 'package.json') })
  return list
}

/**
 * Resolve the installed `favicon.svg`.
 * @returns the absolute path.
 * @throws {Error} when no anchor resolves the package or the file.
 */
function resolveFavicon() {
  const tried = []
  for (const anchor of anchors()) {
    if (anchor.kind === 'file') {
      if (existsSync(anchor.path)) return anchor.path
      tried.push(`${anchor.path} (from DSH_SENTRY_FAVICON)`)
      continue
    }
    try {
      const manifest = createRequire(anchor.from).resolve(`${FRONTEND}/package.json`)
      const favicon = join(dirname(manifest), 'dist', 'favicon.svg')
      if (existsSync(favicon)) return favicon
      tried.push(favicon)
    } catch (error) {
      tried.push(`${FRONTEND} from ${anchor.from}: ${String(error)}`)
    }
  }
  throw new Error(
    `fish-path: could not find ${FRONTEND}/dist/favicon.svg. Tried:\n  ${tried.join('\n  ')}\n` +
      'Set DSH_SENTRY_FAVICON to the file, or DSH_HOME/DSH_PROFILE to a profile that has the frontend installed.',
  )
}

/**
 * Extract the fish path from a favicon document.
 *
 * The shipped file draws one glyph in one path, but the attribute order and the
 * surrounding whitespace are the frontend's business — so this reads the `d` of
 * the first `<path>` that carries one, rather than matching a fixed string.
 *
 * @param source - the favicon SVG text.
 * @returns the path data.
 * @throws {Error} when no path with data is present.
 */
export function extractPath(source) {
  const path = /<path\b[^>]*\sd="([^"]+)"/.exec(source)
  if (path === null) throw new Error('fish-path: the favicon has no <path d="...">')
  return path[1]
}

const faviconPath = resolveFavicon()
const pathData = extractPath(readFileSync(faviconPath, 'utf8'))
const generated = `${pathData}\n`

if (process.argv.includes('--check')) {
  const existing = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : undefined
  if (existing !== generated) {
    console.error(
      `fish-path: src/fish.txt is stale against ${faviconPath}; run \`node scripts/fish-path.mjs\``,
    )
    process.exit(1)
  }
  console.log(`fish-path: src/fish.txt matches ${faviconPath}`)
} else {
  writeFileSync(outputPath, generated, 'utf8')
  console.log(`fish-path: wrote src/fish.txt (${String(pathData.length)} bytes) from ${faviconPath}`)
}
