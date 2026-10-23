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
