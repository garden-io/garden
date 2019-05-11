## Integration Tests

To run the integration test suite (currently consisting only of the pre-release tests), use `npm run integ-full` from within the `garden-service` folder. This runs `garden-service/bin/integ-full.ts`.

The script performs the following cleanup operations before running the tests:

* Check out the examples directory to `HEAD`;
* Delete the `garden-system--metadata` namespace and all namespaces belonging to example projects;
* And deletes the `.garden` directory for every example project.

The `integ-full` script supports the following options:

* `binPath`: The Garden binary to use for the tests (defaults to the one in the static directory). Useful for testing release binaries.
* `only`: Runs only the test sequence specified (e.g. `simple-project` or `vote-helm`).

For example:
```
npm run integ-full -- --binPath=/some/path/garden-bin --only=tasks
```