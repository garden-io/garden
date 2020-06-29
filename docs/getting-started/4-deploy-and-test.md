# 4. Deploy and Test

Now that you have your project and cluster set up, you can go ahead and deploy the project:

```sh
garden deploy
```

You should see your services come up. Next we can set up our first test. Similar to how you configured the `services` earlier, open the `frontend/garden.yml` config and add the following:

```yaml
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - frontend
```

This defines two simple test suites. One simply runs the unit tests of the `frontend` service. The other runs a basic integration test that relies on the `frontend` service being up and running.

Let's run them both:

```sh
garden test
```

You should see Garden ensuring that the services are up and running, and that both tests run successfully.

With that, we can move on from this simple example and on to [configuring your own project](./5-configure-your-project.md).
