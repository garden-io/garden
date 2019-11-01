---
order: 5
title: Running Tests
---

# Running Tests

You add tests when you want Garden to run your test suites for you. A simple configuration looks like this:

```yaml
# garden.yml
kind: Module
tests:
  - name: unit
    args: [npm, run, test:unit]
  - name: integ
    args: [npm, run, test:integ]
    dependencies:
      - backend
```

> Note that not all [modules types](../reference/module-types/README.md) support tests.

## How it Works

Tests belong to modules and each module can have several tests. Because tests are a part of the Stack Graph and dependency aware, you can easily run integration tests that require other parts of your stack to be running.

Garden caches test results and only re-runs the test if the module the test belongs to, or upstream dependents, have changed. For remote environments, the test results are stored at the cluster level so that the entire team can share the cached results.

You use the `command` and `args` directives to specify how the test is run. If the execution exits with 0, the test is considered to have passed, otherwise failed.

If you have expensive tests that you don't want to run on every watch event when in watch mode, you can use the `--skip-tests` flag or, alternatively, specify what tests to run with the `--test-names` flag.

You can run a test manually with the `garden run test <test-name>` command. This will run the test regardless of whether or not the result is cached.

You can view test results from the dashboard or by running `garden get test-result <module-name> <test-name>`.

## Tests in the Stack Graph

Tests correspond to a **test** action in the Stack Graph.

- Tests can depend on services, and tasks.
- Tests implicitly depend on their parent module's build task.
- Currently, nothing else can depend on tests.

## Examples

For full test configuration by module type, please take a look at our [reference docs](../reference/module-types/README.md).

### Integration Testing

Below is an example of a `frontend` module that has a `unit` test and an `integ` test that depends on a `backend` module. The `integ` test checks whether the frontend gets the correct response from the backend. The example is based on our [vote example project](https://github.com/garden-io/garden/blob/v0.10.11/examples/vote).

Here's the configuration for `frontend` module:

```yaml
# garden.yml
kind: Module
type: container
name: frontend
tests:
  - name: unit
    args: [npm, run, test:unit]
  - name: integ
    args: [npm, run, test:integ]
    timeout: 60
    dependencies:
      - backend
```

The `integ` test looks like this:

```javascript
// tests/integ/test.js
describe('POST /vote', () => {
  it('respond with message from hello-function', async () => {
    const result = await axios.post('<http://backend/vote/>', `vote=a`);
    expect(result.status).to.eql(200);
  });
});
```

Now when you're in watch mode and make a change to the `frontend`, Garden will re-run both the `unit` and `integ` tests for you.

If you make a change to the backend `backend` module, Garden will first re-build and re-deploy the `backend`, and then run the `integ` test defined for the `frontend`.

## Advanced

### Kubernetes Provider

Tests are executed in their own Pod inside the project namespace. The Pod is removed once the test has finished running.

Tests results are stored as [ConfigMaps](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/) in the `garden-system--metadata` namespace with the format `test-result--<hash>` and shared across the team.

To clear cached test results, you currently have to delete the ConfigMaps manually with kubectl. Here's an example:

```console
kubectl delete -n garden-system--metadata $(kubectl get configmap -n garden-system--metadata -o name | grep test-result)
```

### Exec Modules

The `exec` module type runs tests locally in your shell. By default, the `exec` module type executes tests in the Garden build directory (under `.garden/build/<module-name>`). By setting `local: true`, the tests are executed in the module
source directory instead.

## Next Steps

In the [next section](./running-tasks.md), we'll see how Garden can execute tasks for your. For example populating a database after it has been deployed.