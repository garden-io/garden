---
title: 5. Code Syncing (Hot Reload)
order: 5
---

# 5. Code Syncing (Hot Reload)

So far we've set up our Kubernetes plugin and added actions for building, deploying, and testing the project.

You can think of these actions as blueprints for how to go from zero to a running and tested system in a single command. This allows you to remove most of the boilerplate from your CI pipelines and replace it with jobs that only have steps like `garden deploy` or `garden test`. And since you can run these same commands from anywhere, it's easy to debug these pipelines from the comfort of your laptop.

However, despite Garden's powerful caching functionality, building containers and redeploying services after you make changes to code or config can still be a slow process.

So as a final step, let's enable code syncing (i.e. hot reloading) which means that changes we make to our code get live synced to the running service without requiring a rebuild or a redeploy.

## Step 1 — Add the sync config to the API Deploy action

We'll start by adding the sync config to our API Deploy action by adding the following below the `defaultTarget` field (under the  `spec` field) in `./api/garden.yml`:

```yaml
  sync: # <--- Add this
    paths:
      - sourcePath: .
        containerPath: /app
        mode: "one-way-replica"
    overrides:
      - command:
          ["/bin/sh", "-c", "ls /app/app.py | entr -r -n python /app/app.py"]
```

The `paths` field is an array where you can specify different syncs for the action. In most cases you'll only need one entry where you specify the relative source path on your local file system and the absolute target path in the container. For more advanced use cases such as reverse syncs you can add more items to the `paths` array.

The `overrides` field allows you to specify various overrides that should only be applied when Garden is in sync mode. Here we're overriding the command that's used to start the container. Usually the container starts up with the `python /app/app.py` command but in sync mode we start it with a tool called `entr` to manage the process and restart it on changes. Depending on your language and ecosystem, you'll have different choices here.

Note that this also works for compiled language but an extra compilation step may need to be added. The rule of thumb is that whatever workflows you currently use to rapidly rebuild your project during development can be used here.

Note also the `defaultTarget` field we added previously. This is how Garden knows what "target" to sync changes to.

[See here](../../features/code-synchronization.md) for an in-depth guide on code syncing for different action types.

## Step 2 — Add the sync config to the web Deploy action

The sync spec for the web component looks similar. Add the following to `./web/garden.yml`:

```yaml
# In ./web/garden.yml
  sync:
    paths:
      - sourcePath: ./src
        containerPath: /app/src
        exclude: [node_modules]
    overrides:
      - command: [npm, run, dev]
```

Here we're also using the `exclude` field to exclude the local `node_modules` directory.

## Step 3 — Deploy in sync mode

Now let's deploy the project in sync mode by running the following from the interactive dev console:

```console
deploy --sync
```

If you don't have the dev console running you can also run:

```console
garden deploy --sync
```

...which will start the console and automatically run `deploy --sync` within it in a single command.

## Step 4 — Verify that code syncing works

Finally, let's verify that syncing works as expected by turning on logs for these services by
running the following in the dev console:

```
logs --follow
```

{% hint style="info" %}
You can turn off logs in the dev console with `hide logs`.
{% endhint %}

You can also stream them in a separate terminal window by just running `garden logs --follow`.

Now open the `api/app.py` file in your IDE and try changing the string in the `print("Starting API")` statement near the start of the file. You should see in the logs that the API server restarts and that the new log line is printed.

Next try opening the voting application itself by following the link in the dashboard. You'll see that it has green and red background colors.

Now open the `web/src/colors.js` file in your IDE and try changing the colors. Notice that the voting app updates immediately, despite running in a Kubernetes cluster.

One other way to test syncing is by shelling into the running Pod and verifying that the files have updated with the Garden `exec` utility command. To e.g. shell into the API, run the following from a separate terminal window (exec doesn't work inside the dev console):

```console
garden exec api /bin/sh
```

This gives us shell access to the API that we can use to look around or run commands.
