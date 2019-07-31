## End to end Tests

To run the end to end test suite (currently consisting only of the pre-release tests), use `npm run e2e-full` from within the `garden-service` folder. This runs `garden-service/bin/e2e-full.ts`.

The script performs the following cleanup operations before running the tests:

* Check out the examples directory to `HEAD`;
* Delete the `garden-system--metadata` namespace and all namespaces belonging to example projects;
* And deletes the `.garden` directory for every example project.

The `e2e-full` script supports the following options:

* `binPath`: The Garden binary to use for the tests (defaults to the one in the static directory). Useful for testing release binaries.
* `only`: Runs only the test sequence specified (e.g. `demo-project` or `vote-helm`).

For example:
```
npm run e2e-full -- --binPath=/some/path/garden-bin --project=tasks
```