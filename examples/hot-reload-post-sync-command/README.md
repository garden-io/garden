# Hot-reload post-sync command example project

This example is a variation on the `hot-reload` example. Here, we demonstrate the `hotReload.postSyncCommand` option by providing a motivating example of its use.

Since this project builds on the `hot-reload` example, you may want to check out that project's README if you haven't already.

## Adding a `postSyncCommand`

Like the `hot-reload` example project, This project contains a single service called `node-service`. When running, the service waits for requests on `/hello` and responds with a message.

Here, however, we modify the `dev` npm script in `node-service/package.json` to have `nodemon` only watch a single file (`/app/hotreloadfile` in the container's directory structure) for changes:

```json
{
  ...
  "scripts": {
    "start": "node main.js",
    "dev": "nodemon main.js --watch hotreloadfile",
    "test": "echo OK"
  },
  ...
}
```

We also add a `postSyncCommand` to `node-service`'s `garden.yml`:

```yaml
kind: Module
description: Node greeting service
name: node-service
type: container
hotReload:
  sync:
    - target: /app/
  postSyncCommand: [touch, /app/hotreloadfile]
services:
  - name: node-service
    args: [npm, start]
    hotReloadArgs: [npm, run, dev]
  ...
```

When one is specified, the `postSyncCommand` is executed inside the running container during each hot reload, after any changed files have been synced.

In this example, the idea is to "notify" the `nodemon` process that a reload is needed by `touch`-ing  `hotreloadfile` during each hot reload. `nodemon` will then pick up the updated modification time, triggering a reload. `hotreloadfile` doesn't exist when the image is built (and doesn't need to for our purposes here).

> Note: There's nothing special about the name `hotreloadfile` here. Any file name would do.

Since `nodemon` only has to watch a single path, this approach should significantly reduce the resource footprint `nodemon`'s FS watching incurs when compared to e.g. watching all of the module's source paths.

When this general approach is applicable for several modules in the system (which depends on the particular languages, frameworks and libraries being used), the lighter total FS watching footprint may facilitate more services being deployed with hot reloading enabled during development.

## Usage

Identical to the `hot-reload` example project. The only difference is that here, the updated message returned by `garden call` is a result of `nodemon` performing a reload after picking up the updated modification time of `hotreloadfile` (instead of noticing/watching for changes to `node-service/app.js` directly).