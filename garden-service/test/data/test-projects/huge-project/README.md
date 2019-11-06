# Huge project tests

Created for [PR #1320](https://github.com/garden-io/garden/pull/1320).

This one's a bit hard to automate, but we can use to make sure Garden can handle massive amounts of files in repositories.

The procedure to test was as follows:

1) `cd` to this directory.
2) Run `node generate.js`.
3) Comment out the `modules.exclude` field in the `garden.yml`.
4) In `garden-service/src/watch.ts`, add `usePolling: true` to the options for the chokidar `watch()` function.
5) Run `garden build -w` and observe the process drain CPU and RAM until it crashes in about a minute.
6) Uncomment the `modules.exclude` field in the `garden.yml`.
7) Run `garden build -w` again, wait and observe a happy process for a while.
8) Run `rm -rf dir*` to clean up.
