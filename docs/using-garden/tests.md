---
order: 5
title: Tests
---

# Tests

You add Tests when you want Garden to run your test suites for you. A minimalistic configuration looks like this:

```yaml
# garden.yml
kind: Test
name: frontend-integ
type: container
dependencies:
  - build.frontend # <- we depend on the build because the image is used when running the test
  - deploy.frontend # <- we want the frontend service to be running and up-to-date for this test
spec:
  image: ${actions.build.frontend.outputs.deploymentImageId} # <- use the output from the corresponding image build
  args: [npm, run, integ]
```

Garden caches Test results and only re-runs the Tests if the Test version changes. For remote environments, the test results are stored at the cluster level so that the entire team can share the cached results.

You use the `command` and `args` directives to specify how the Test is run. If the execution exits with 0, the Test is considered to have passed, otherwise failed.

You can run a Test manually with the `garden test <test-name>` command. Append the `--force` flag to rerun the Test even if it has previously passed.

You can view Test results by running `garden get test-result <test-name>`.

## Examples

For full test configuration by module type, please take a look at our [reference docs](../reference/module-types/README.md).

### Integration Testing

Below is an example of a `frontend-integ` Test that checks whether the frontend gets the correct response from the backend. The example is based on our [vote example project](../..//examples/vote/vote/garden.yml).

```yaml
# garden.yml
kind: Test
name: frontend-integ
type: container
dependencies:
  - build.frontend # <- we depend on the build because the image is used when running the test
  - deploy.frontend # <- we want the frontend service to be running and up-to-date for this test
spec:
  image: ${actions.build.frontend.outputs.deploymentImageId} # <- use the output from the corresponding image build
  args: [npm, run, integ]
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

### Test Artifacts

Many action types, including `container`, `exec` and `helm`, allow you to extract artifacts after Tests have completed. This can be handy when you'd like to view reports or logs, or if you'd like a script (via a local `exec` action, for instance) to validate the output from a Test.

Desired artifacts can be specified using the `spec.artifacts` field on Test configurations. For example, for the `container` Test, you can do something like this:

```yaml
kind: Test
type: container
name: my-test
...
spec:
  command: [some, command]
  artifacts:
    - source: /report/*
      target: my-test-report
```

After running `my-test`, you can find the contents of the `report` directory in the test's container, locally under `.garden/artifacts/my-test-report`.

Please look at individual [action type references](../reference/action-types/README.md) to see how to configure each Run to extract artifacts.

## Next Steps

In the [next section](./runs.md), we'll see how Garden can execute tasks via Runs. For example populating a database after it has been deployed.
