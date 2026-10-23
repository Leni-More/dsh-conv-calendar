# Publishing

How to cut a release of `dsh-conv-calendar` to npm, and a checklist for what must be
true before you do.

The repository name, GitHub links and author metadata are already set to `LeniMore`;
the npm package name `dsh-conv-calendar` was unclaimed as of 2026-10-24.

## Before the first publish

- [ ] **Claim the name on npm.** Names are first-come; publishing is the claim.
- [ ] **Push to GitHub first**, so the `repository` / `homepage` / `bugs` URLs in the
      published metadata resolve. npm shows these on the package page.
- [ ] `node --check lib/index.js && node --check lib/client.js`
- [ ] `cd tests && npm install && npm test` — all five suites must pass.
- [ ] `npm pack --dry-run` — confirm the tarball holds `lib/`, `cordis.patch.yml`,
      both READMEs, `LICENSE` and `package.json`, and **not** `tests/`.
- [ ] Version in `package.json` and `CHANGELOG.md` agree.

## One-time setup

```sh
npm login                                    # opens the browser; also accepts an OTP for 2FA
npm whoami                                   # confirm the account
```

If you publish under a scope (`@lenimore/dsh-conv-calendar`), the first publish needs:

```sh
npm publish --access public
```

The `publishConfig` block in `package.json` already sets `access: public` and pins the
public registry, so a plain `npm publish` is enough for an unscoped package.

> Never commit an `.npmrc` containing `//registry.npmjs.org/:_authToken=…`.

## First publish

```sh
cd dsh-conv-calendar
npm test --prefix tests        # or: cd tests && npm test
npm pack --dry-run             # last look at the file list
npm publish
```

Verify:

```sh
npm view dsh-conv-calendar version dist.tarball
```

## Following releases

1. Bump the version — `npm version patch|minor|major` writes `package.json`, commits and
   tags in one step.
2. Add the release section to `CHANGELOG.md` (move anything from `[Unreleased]`).
3. Re-run the checklist above, then `npm publish` and `git push --follow-tags`.

Published versions are immutable: a mistake can be `npm deprecate`d or unpublished within
72 hours, but you cannot re-upload the same version. When in doubt, publish a new patch.

## What the published package contains

`files` in `package.json` limits the tarball to:

```
LICENSE
README.md
README.zh-CN.md
cordis.patch.yml
lib/client.js
lib/index.js
package.json
```

`tests/` and `docs/` stay in the repository only — installing the plugin needs none of
them. Size is roughly 27 kB packed, 79 kB unpacked.

## After publishing

The README already documents the npm install path:

```sh
dsh plugin --profile web add dsh-conv-calendar
```

Worth checking on a clean profile that the published tarball (not the linked checkout)
installs and boots — a link-based install resolves the folder directly and can hide
missing-file mistakes:

```sh
dsh plugin --profile check add dsh-conv-calendar
dsh --profile check --no-open --port 3099
```

Then open `/dsh-conv-calendar/api/summary` with the printed token URL and delete the
`check` profile afterwards.

---

# GitHub releases

A **Release** is a tag plus release notes on GitHub. It is separate from npm: you can tag
without publishing, and publish without tagging. Tagging is worth doing because GitHub
then renders a **Releases** panel, offers source archives per version, and "watch →
releases only" notifies people.

## Version numbering

This project follows [SemVer](https://semver.org): `MAJOR.MINOR.PATCH` with an optional
`-rc.N` pre-release suffix, and the git tag carries a `v` prefix.

| Change | Bump | npm tag |
| --- | --- | --- |
| Bug fix, no behaviour change for users | `patch` (`0.1.0` → `0.1.1`) | `latest` |
| New feature, backwards compatible | `minor` (`0.1.1` → `0.2.0`) | `latest` |
| Breaking change to the config, the state file or the API shape | `major` (`0.2.0` → `1.0.0`) | `latest` |
| Pre-release for testing | `-rc.1` (`0.2.0-rc.1`) | `next` |

The workflow refuses to release when the tag and `package.json` disagree, so the version
in `package.json` is the single source of truth.

## Releasing, guided by CI

`.github/workflows/release.yml` reacts to any `v*.*.*` tag. It checks that the tag matches
`package.json`, syntax-checks both halves, runs the test suite, packs the tarball, then
creates the GitHub Release with the matching `CHANGELOG.md` section as its notes. If the
repository secret `NPM_TOKEN` exists it also runs `npm publish`; without it the Release is
still created and npm is skipped.

To enable the npm half, add an **Automation** token (npm → Access Tokens → Generate New
Token → *Automation*, which bypasses 2FA) as a repository secret named `NPM_TOKEN` under
**Settings → Secrets and variables → Actions**.

The sequence for a normal release:

```sh
# 1. Make sure the changelog describes this version, then commit everything
git add -A && git commit -m "chore: prepare v0.1.1"

# 2. Bump the version, commit and tag in one step
npm version patch -m "chore: release v%s"

# 3. Push the commit and the tag
git push --follow-tags
```

`git push --follow-tags` is the important part — a plain `git push` sends the commit but
**not** the tag, so the workflow never fires. If you forget, push the tag explicitly:

```sh
git push origin v0.1.1
```

## Releasing by hand

Useful when Actions is unavailable, or for the very first release.

```sh
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Then on GitHub: **Releases → Draft a new release → choose the tag → paste the changelog
section → Publish release**. Set it as the latest release; do not attach a tarball —
`npm pack` output is not a source archive, and GitHub already offers "Source code (zip)".

## Checking a release

```sh
gh release view v0.1.0            # if the GitHub CLI is installed
```

Or open `https://github.com/Leni-More/dsh-conv-calendar/releases`. A good release shows:

- Tag name and title matching `vX.Y.Z`
- Notes listing what changed (the workflow takes them from `CHANGELOG.md`)
- "Source code (zip)" and "(tar.gz)" archive links

## Release checklist

- [ ] `package.json` version bumped and matches `CHANGELOG.md`
- [ ] `[Unreleased]` in `CHANGELOG.md` emptied into the new version section
- [ ] `npm test` passes locally
- [ ] `npm pack --dry-run` shows only the seven expected files
- [ ] Tag pushed with `--follow-tags` (or `git push origin vX.Y.Z`)
- [ ] GitHub Release created and marked latest
- [ ] npm shows the new version (`npm view dsh-conv-calendar version`), if publishing

