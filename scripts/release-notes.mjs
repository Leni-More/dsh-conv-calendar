/**
 * Write this version's CHANGELOG section to `notes.md`, for the release workflow.
 *
 * Reads the version from package.json, finds the matching `## [x.y.z]` heading and
 * copies everything up to the next level-two heading. A missing section falls back to a
 * one-line note so a release never fails just because the changelog lags behind.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

const heading = `## [${version}]`
const start = changelog.indexOf(heading)

if (start < 0) {
	writeFileSync(new URL('../notes.md', import.meta.url), `Release ${version}\n`)
	console.log(`no CHANGELOG section for ${version}; wrote a fallback note`)
	process.exit(0)
}

const after = changelog.slice(start + heading.length)
const nextHeading = after.search(/\n## \[/)
const section = (nextHeading < 0 ? after : after.slice(0, nextHeading)).trim()

writeFileSync(new URL('../notes.md', import.meta.url), `${section || `Release ${version}`}\n`)
console.log(`wrote notes for ${version} (${section.length} chars)`)
