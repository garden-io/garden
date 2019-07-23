# End-to-end Tests

To run the e2e test suite, use `npm run e2e` from within the `garden-service` folder.

The script performs the following cleanup operations before running the tests:

* Check out the examples directory to `HEAD`;
* Delete the `garden-system--metadata` namespace and all namespaces belonging to example projects;
* And deletes the `.garden` directory for every example project.

The `e2e` script supports the following options:

* `binPath`: The Garden binary to use for the tests (defaults to the one in the static directory). Useful for testing release binaries.
* `only`: Runs only the test sequence specified (e.g. `demo-project` or `vote-helm`).

For example:

```sh
npm run e2e -- --binPath=/some/path/garden-bin --project=tasks
```
