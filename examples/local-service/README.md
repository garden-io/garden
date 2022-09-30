# Persistent Local Service Example Project

This example projects demonstrates how you can easily mix and match local and remote services. A common use case for this is to e.g. run backend services
remotely but frontend services locally.

## Project Structure

This project is based on the [demo-project](https://github.com/garden-io/garden/tree/main/examples/demo-project) and contains a `backend` module, a
`frontend` module and a `frontend-local` module.

Here's an excerpt from the `frontend` config:

```yaml
# in frontend/garden.yml

kind: Module
name: frontend
type: container
include: ["."] # <--- Include is required when modules overlap
variables:
  env: # <--- Define env as a variable so that we can re-use it in the local module
    PORT: 8080
# ...

---
kind: Module
name: frontend-local
type: exec # <--- This is a "local exec module"
local: true
include: []
services:
  - name: frontend-local
    devMode:
      command: ["yarn", "run", "dev"] # <--- This is the command Garden runs to start the process in dev mode
      statusCommand: [./check-local-status.sh] # <--- Optionally set a status command that checks whether the local service is ready
    deployCommand: [] # <--- A no op since we only want to deploy it when we're in dev mode
    env: ${modules.frontend.env} # <--- Reference the env variable defined above
```

In the config above the local module is always enabled when in dev mode but you can choose to conditionally enable it as well.

You could e.g. use [command line variables](https://docs.garden.io/using-garden/variables-and-templating#variable-files-varfiles) to control whether the local module should be enabled or create a custom command.

## Usage

If you want to run the frontend service locally you'll need to have yarn installed and also have to install the packages for the frontend project

```console
cd frontend
yarn install
cd ..
```

Assuming you've [set _your_ K8s context](https://docs.garden.io/getting-started/3-connect-to-a-cluster), you can start the project with:

```console
garden dev
```

This will deploy the remote services and start the local service as well.

You can now stream logs from both the local and remote services with the logs command:

```console
garden logs --follow
```
