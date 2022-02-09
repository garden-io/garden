# End to end Tests

To run the end to end test suite against the given example project, use `yarn e2e-project --project <example project name>` from the repo root. This runs `test/e2e/e2e-project.ts`.

The script performs the following cleanup operations befor running the tests:

* Deletes the `.garden` directory for the example project.

And the following after running the tests:

* Check out the example project directory to `HEAD`.
* Delete all namespaces belonging to the example project.

The `e2e-project` script supports the following options:

* `--project`: **Required**. The example project to run the tests against.
* `--binPath`: The Garden binary to use for the tests (defaults to the one in the static directory). Useful for testing release binaries.
* `--only`: Runs only the test sequence specified (e.g. `demo-project` or `vote-helm`).

For example:

```sh
yarn e2e-project --binPath=/some/path/garden-bin --project=tasks
```
