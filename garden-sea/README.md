# Garden SEA

Garden SEA is an Self-Extracting Archive to enable us to ship a Single Executable Application :)

## Development
The Garden production binaries are a small Rust single application binary that extracts NodeJS binaries and the bundled Garden source code into a temporary directory, and then spawns NodeJS.

To build the production binaries you'll need the [Rust toolchain](https://www.rust-lang.org/learn/get-started) and [`cross`](https://github.com/cross-rs/cross#installation), which we use for cross-compiling to different architectures and operating systems.

To install the required tools, follow the [Cross getting started guide](https://github.com/cross-rs/cross/wiki/Getting-Started).

You can build the release binaries using the command

```shell
npm run dist [target] # Valid targets are currently `windows-amd64`, `linux-arm64`, `linux-amd64`, `macos-arm64` and `macos-amd64`.
```
You can then find the release binaries and archives under `dist/`.

After you ran `npm run dist` for the first time the artifacts we reference using the `include_bytes!` macro in `artifacts.rs` have been generated in the appropriate location. From then on you can also build and test the application using cargo commands, like any other Rust application:

```shell
cargo build
```

```shell
cargo test
```

## Responsibilities

Garden SEA performs the following tasks:
- Choose a platform-specific temporary path for Garden application data (`main.rs`)
- Extract if needed, and avoid race conditions (`extract.rs`)
  - Extract the NodeJS binary and native add-ons (`bin/` and `native/`)
  - Extract the bundled source code (`rollup/`)
- Clean up directories with outdated versions when possible (`cleanup.rs`)
- Start Garden by spawning the NodeJS binary with the appropriate options (`node.rs`)
  - Allow overriding certain GC settings using environment variables (`GARDEN_MAX_OLD_SPACE_SIZE` and `GARDEN_MAX_SEMI_SPACE_SIZE`)
- Wait until the NodeJS process terminates, and forward signals / CTRL-C events. (`signal.rs` and `terminate.rs`)

## Current limitations

- If the Rust binary (`garden` or `garden.exe`) is terminated using the Task manager on Windows, or using `kill -9` on Linux/MacOS, the NodeJS process (`node` or `node.exe`) is not terminated correctly. The only way to avoid that is to monitor the parent process in the NodeJS application.
- When spawning a lot of Garden processes in parallel for the first time, some processes might fail due to race conditions in the extraction and cleanup routines. We believe that in practice that should not happen, but might have to make this more robust if we see this issue in the wild.
