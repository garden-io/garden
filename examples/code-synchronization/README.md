# Code-synchronization example project

This example showcases Garden's code synchronization functionality.

You can synchronize your code (and other files) to and from running containers.

## Structure of this project

This project contains a single service called `node-service`. When running, the service waits for requests on `/hello` and responds with a message.

In the `garden.yml` file of the `node-service` module we configure `sync` and specify its two key settings:

1. `command` tells the module which command should be run if sync is enabled to start the service.
2. `paths` defines the sync mode, exclusions, target and source directories.

```yaml
# ...
sync:
  command: [npm, run, dev]
  paths:
    - source: src
      target: /app/src
      # Make sure to specify any paths that should not be synced!
      exclude: [node_modules]
      mode: one-way
# ...
```

## Usage

You are now ready to run with sync enabled:

```sh
garden deploy --sync
```

Our service is now up and running. We can open the displayed ingress URL in the browser, which will show a friendly greeting (Garden is friendly by default):

```plain
{
  "message": "Hello from Node!"
}
```

Now go into [node-service/src/app.js](node-service/src/app.js) and change the message to something different. If you look at the console, you will see Garden updated the service very quickly, without rebuilding the container:

```sh
ℹ node-service              → Syncing src to /app/src in Deployment/node-service
```

And you can verify the change by opening the displayed ingress URL in your browser:

```json
{
  "message": "Hello from Fortran!"
}
```

Check out the [docs](../../docs/features/code-synchronization.md) for more information on code synchronization.
