# Hot-reload example project

This example showcases Garden's hot-reloading functionality.

When using the `local-kuberbetes` or `kubernetes` providers, container modules can be configured to hot-reload their running services when the module's source files change without redeploying. In essence, hot-reloading copies source files into the appropriate running containers (local or remote) when code is changed by the user.

For example, services that can be run with a file system watcher that automatically update the running application process when sources change (e.g. nodemon, Django, Ruby on Rails, and most popular web app frameworks) are a natural fit for this feature.

## Structure of this project

This project contains a single service called `node-service`. When running, the service waits for requests on `/hello` and responds with a message.

In the `garden.yml` file of the `node-service` module we first enable hot-reloading and specify the target directory it should hot-reload changed sourcefiles into:

```yaml
...
hotReload:
  sync:
    - target: /app/
...

```
We also tell the module which command should be run if hot-reloading is enabled to start the service:

```yaml
...
    hotReloadArgs: [npm, run, dev]
...
```

## Usage

Hot-reloading is *not* enabled by default. To spin up your Garden project with hot-reloading enabled for a particular module, use the `--hot` switch when invoking `garden dev` (or `garden deploy`):

```sh
garden dev --hot=node-service
```

Our service is now up and running. We can send the service a simple GET request using `garden call`:

```sh
garden call node-service
```

Which will return a friendly greeting (Garden is friendly by default):

```sh
✔ Sending HTTP GET request to http://hot-reload.local.app.garden/hello

200 OK

{
  "message": "Hello from Node!"
}
```

Now go into `node-service/app.js` and change the message to something different. If you look at the console, you will see Garden updated the service very quickly, without rebuilding the container:

```sh
✔ node-service              → Hot reloading... → Done (took 485 ms)
```

And you can verify the change by running `garden call node-service` again:

```sh
✔ Sending HTTP GET request to http://hot-reload.local.app.garden/hello

200 OK

{
  "message": "Hello from Fortran!"
}
```

Check out the [docs](https://docs.garden.io/using-garden/hot-reload) for more information on hot-reloading. Hot-reloading also works with spring-boot, for which we have a dedicated [example project](https://github.com/garden-io/garden/tree/master/examples/spring-boot-hot-reload).