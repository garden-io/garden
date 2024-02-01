---
title: Developing Garden
order: 5
---

Once you've [set up your developer environment](./garden-dev-env-setup.md), you're ready to hack on Garden!

## Debugging

To enable setting a breakpoint in the code, run the CLI with the `bin/garden-debug` binary, which adds the `--inspect` flag. Developers might find it useful to alias this:

```sh
alias gd='/path/to/garden/bin/garden-debug'
```

You can e.g. use the Chrome DevTools to inspect the code at the breakpoint:

1. Add a `debugger` statement somewhere in the code.
2. Navigate to [chrome://inspect/](chrome://inspect/) in your Chrome browser.
3. Click the **Open dedicated DevTools for Node** link.
4. Run a CLI command that hits the breakpoint, e.g.:

```shell
/path/to/garden/bin/garden-debug deploy # or gd deploy, if you've set the alias
```

You should now be able to inspect the code at run time in the **Console** tab of the DevTools window.

## Release binaries and Docker containers

The Garden production binaries are a small Rust single application binary that extracts NodeJS binaries and the bundled Garden source code into a temporary directory, and then spawns NodeJS.

To build the production binaries you'll need the [Rust toolchain](https://www.rust-lang.org/learn/get-started) and [`cross`](https://github.com/cross-rs/cross#installation), which we use for cross-compiling to different architectures and operating systems.

To install the required tools, follow the [Cross getting started guide](https://github.com/cross-rs/cross/wiki/Getting-Started).

You can build the release binaries using the command

```shell
npm run dist [target] # Valid targets are currently `windows-amd64`, `linux-arm64`, `linux-amd64`, `macos-arm64` and `macos-amd64`.
```

Use the option ` --cargocommand=cross` for cross-platform builds, otherwise cargo build will be the default.

You can then find the release binaries and archives under `dist/`.

We release a number of Docker containers on [Docker Hub](https://hub.docker.com/u/gardendev).

The Docker containers meant to be used directly by the general public are defined in `support/docker-bake.hcl` and listed in the [DockerHub containers reference guide](../reference/dockerhub-containers.md).

When making changes to the `Dockerfile` definitions in `support/` it is helpful to build the containers on your local machine.

For that, first run `npm run dist`, and then run `docker buildx bake` like so:

```shell
MAJOR_VERSION=0 MINOR_VERSION=13 PATCH_VERSION=0 CODENAME=bonsai \
    docker buildx bake -f support/docker-bake.hcl all
```

The environment variables will influence the tags that `buildx bake` will create on your local machine (e.g. stable release tags, prerelease tags, version number, etc.).

To run the tests on your local machine, first run `npm run dist` (if not already done so), and then run

```shell
bash support/docker-bake-test.sh
```

## Tests

Unit tests are run using `mocha` via `npm run test` from the directory of the package you want to test. To run a specific test, you can grep the test description with the `-g` flag.:

```sh
cd core
npm run test                    # run all unit tests
npm run test -- -g "taskGraph"  # run only tests with descriptions matching "taskGraph"
```

### ARM64 compatibility

On ARM64 platforms (like Mac machines with M1 chips) the `npm run test` command may fail with the following error:

```sh
FATAL ERROR: wasm code commit Allocation failed - process out of memory
```

In order to fix it, the terminal must be running in the **Rosetta** mode, the detailed instructions can be found in
[this SO answer](https://stackoverflow.com/a/67813764/2753863).

Integration tests are run with:

```sh
npm run integ-local
```

End-to-end tests are run with:

```sh
npm run run e2e
```

You can also run the end-to-end tests for a specific example project using:

```sh
npm run run e2e-project -- --project=<example project name>
```

End-to-end tests are run in CI by using Garden itself to test the project defined in `./core/test/e2e/garden.yml`. Cf. the appropriate job in `circleci/config.yml` for details.
