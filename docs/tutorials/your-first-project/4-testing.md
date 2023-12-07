---
title: 4. Add Tests
order: 4
---

# 4. Add Tests

Garden treats tests as a first class citizen and has a dedicated Test action kind. Let's add one for integration/end-to-end testing our project.

## Step 1 — Add a Test action

In the `./web/garden.yml` file, add the following below the Deploy action:

```yaml
---
kind: Test
name: integ
type: container
dependencies: [deploy.web]
spec:
  image: ${actions.build.web.outputs.deploymentImageId}
  command: [npm, run, test:integ]
```

This action depends on the web service being deployed and will basically sit at the edge of the graph.

## Step 2 — Run the test

Next, head to the [web dashboard](https://app.garden.io), select the Graph view, and try running the action.

Once the test passes, try running it again.

Notice how Garden tells you that the test has already passed?

This is Garden's caching mechanism at play. Garden knows exactly what files and configuration goes into each action (including upstream dependencies) and stores the version and results of each execution.

This can mean massive time savings for large projects, in particular in CI, where only the tests for the parts of the system that actually changed need to be re-run.

## Step 3 – Break the test

Let's convince ourselves this works as expected. Open the `./api/app.py` file and break the test by changing the following line:

```python
if request.method == 'POST':
```

to:

```python
if request.method == 'PUT':
```

Even though the test itself is defined in the `./web/garden.yml` file, Garden knows that it depends on the API and that it needs to be re-run.

Head back to the [web dashboard](https://app.garden.io) and try running the test again from the Graph view. Notice how Garden checks the statuses of the actions and re-executes them as needed. In this case it will rebuild and redeploy the API.

You can also view the logs and test results from the dashboard.

If you now undo the changes and change the `request.method` back to `POST` and run the test one more time, Garden will again tell us that it has already passed since now the action version should be the same as it was before.
