---
title: 3. Deploy and Test
order: 3
---

# 3. Deploy and Test

Now that you have your project and cluster set up, you can go ahead and deploy the project:

```sh
garden deploy
```

You should see your applications come up. Garden will print the statuses of the corresponding `Deploy` actions. Next we
can set up our first test. Similar to how you configured the `Deploy` actions earlier, open the `frontend/garden.yml`
config and add the following action configurations:

```yaml

--- # the yaml separator is necessary to delimit different actions

kind: Test
name: frontend-unit
type: container
build: frontend
spec:
  args: [ npm, test ]

--- # the yaml separator is necessary to delimit different actions

kind: Test
name: frontend-integ
type: container
build: frontend
dependencies:
  - deploy.frontend # <- have the frontend service be running and up-to-date before the test
spec:
  args: [ npm, run, integ ]
```

This defines two simple test suites. One simply runs the unit tests of the `frontend` application. The other runs a
basic integration test that relies on the `frontend` application being up and running.

Let's run them both:

```sh
garden test
```

You should see Garden ensuring that the applications are up and running, and that both tests run successfully.

With that, we can move on from this simple example and on
to [configuring your own project](./4-configure-your-project.md).
