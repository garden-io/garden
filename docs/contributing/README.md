---
title: Contributing to Garden
order: 99
---

{% hint style="info" %}
If you love Garden, please ★ star this repository to show your support :green_heart:. Looking for support? Join our [Discord](https://go.garden.io/discord).
{% endhint %}

## Contributing guidelines

We heartily welcome any form of contribution to the project, including issue reports, feature requests,
discussion, pull requests and any type of feedback. We request that all contributors
adhere to the [Contributor Covenant](CODE_OF_CONDUCT.md) and work with us to make the collaboration and
community productive and fun for everyone :smile_cat:

### How to report an issue

If you have found a bug, or want to submit a feature request, or suggest any other change, please create
a [new issue](https://github.com/garden-io/garden/issues/new/choose).

If you report a bug, please describe the steps to reproduce it. You can share the complete Garden configuration of your
project (without any code included) with us by running the `garden get debug-info` command. It will produce a single archive
that matches the directory structure of your project, but contains only your Garden configuration files. This can be very helpful for us to
reproduce and fix the issue.

## Project structure

The project code is composed of several components, most of which are written in TypeScript. There's also a number of supporting scripts, documents, examples etc. Here is an overview of the top-level project folders:

| Name | Description |
| ---- | ----------- |
| `bin` | Executable commands, to use for development. _Note that you need to build the project before these work._ |
| `cli` | The Garden CLI package, which composes code from different packages into the final CLI executable. |
| `core` | The bulk of the Garden code and tests live here. |
| `docs` | Markdown documentation, which is used to generate [docs.garden.io](https://docs.garden.io). _Note that the reference docs are auto-generated, and should not be edited by hand!._ |
| `examples` | Various Garden example projects. |
| `images` | Supporting container images, used by e.g. the `kubernetes` provider. |
| `plugins` | Plugins that are bundled with Garden. We are in the process of moving plugins out of `core` and into separate packages here. |
| `scripts` | Various scripts for builds, releases and development. |
| `sdk` | The `@garden-io/sdk` package, used for Garden plugin development. |
| `secrets` | Encrypted files, used for integ/e2e testing. Only accessible to Garden maintainers. |
| `static` | Static files that are bundled with the CLI. |
| `support` | Supporting files for development, builds, releases etc. |

### Formatting

We use [Prettier](https://prettier.io) for automated formatting. We highly recommend installing the appropriate plugin for your editor to automate formatting as you work on your code. You can also run `npm run fix-format` to fix formatting across the codebase.

### Commit messages

We follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0-beta.4/#specification) and automatically validate the formatting of our commit messages. In particular, the **type** of the commit header must be one of the following:

* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation
  generation.
* **ci**: Changes to the CI configuration.
* **docs**: Documentation only changes.
* **feat**: A new feature.
* **fix**: A bug fix.
* **improvement**: Changes that improve a current implementation without adding a new feature or fixing a bug.
* **perf**: A code change that improves performance.
* **refactor**: A code change that neither fixes a bug nor adds a feature.
* **revert**: A commit that reverts a previous commit. It should begin with `revert:`, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing
  semi-colons, etc).
* **test**: Adding missing or correcting existing tests.
* **tool**: A version update for a bundled tool version used by Garden.

When generating the changelog, we only include the following types: **feat**, **fix**, **refactor**, **improvement**, and **perf**. This means that any changes that the user should be aware of, should have one of these types.

### Checks

We have scripts for checking licenses, docs, linting and more. These can all be run with a single command:

```sh
npm run check-all
```

If the checks fail because of bad formatting, run:

```sh
npm run fix-format
```

If the checks fail because of missing docs, run:

```sh
npm run generate-docs
```

### Pre-push hook

Before pushing, we automatically run the `check-pre-push` script (which runs the scripts in `check-all`, except for
`check-docs`), as well as unit tests. To skip these, run push with the `--no-verify` flag:

```sh
git push origin <my-branch> --no-verify
```

### Environment Variables

You should set the following environment variables when developing on Garden:

```sh
GARDEN_DISABLE_ANALYTICS=true
GARDEN_DISABLE_VERSION_CHECK=true
ANALYTICS_DEV=true
```

## CI

We use [Circle CI](https://circleci.com) for integration and end-to-end testing. The configuration is in `.circleci/config.yml`.

## License/copyright headers

Every source file must include the contents of `support/license-header.txt` at the top. This is
automatically checked during CI. Since it's defined as an eslint rule, you can run the check with `npm run lint`.

## Release process

### Packages

Our release process generates the following packages:

* An executable for OSX, Linux, and Windows hosted on our [Github page](https://github.com/garden-io/garden/releases).
* A [Homebrew](https://brew.sh/) package for OSX users.

### Process

Check out our [release process guide](../../RELEASE_PROCESS.md) for more details.

## Changelog

We keep a changelog under [CHANGELOG.md](../../CHANGELOG.md) that gets updated on every release. For pre-releases, we include every pre-release tag in that release cycle in the changelog. So if we're releasing, say, `0.12.6-3`, the changelog will include entries for `0.12.6-0`, `0.12.6-1`, `0.12.6-2`, assuming those tags exist. Once we make a proper release, we remove the pre-release tags so that the changelog only shows changes between `0.12.5` and `0.12.6`. A changelog with the pre-releases is of course always available in our Git history.
