# Persistent Local Service Example Project

This example projects demonstrates how you can easily mix and match local and remote services. A common use case for
this is to e.g. run backend services remotely but frontend services locally.

## Project Structure

This project is based on the [demo-project](../demo-project) and contains `Build` and `Deploy` actions for 3
applications: `backend`, `frontend`, and  `frontend-local`.

Here's an excerpt from the `frontend` config:

```yaml
# in frontend/garden.yml

kind: Build
name: frontend
type: container
include: [ "." ] # <--- Include is required when actions overlap
# ...

---
kind: Deploy
name: frontend
type: container
variables:
  env: # <--- Define env as a variable so that we can re-use it in the `frontend-local` deploy action
    PORT: 8080
# ...

---
kind: Build
name: frontend-local
type: exec
buildAtSource: true
include: [ ]

---
kind: Deploy
name: frontend-local
type: exec
build: frontend-local

spec:
  persistent: true # <--- Runs the deployCommand in persistent mode
  deployCommand: [ "npm", "run", "dev" ] # <--- This is the command Garden runs to start the process in sync mode
  statusCommand: [ ./check-local-status.sh ] # <--- Optionally set a status command that checks whether the local service is ready
  env: ${actions.deploy.frontend.var.env} # <--- Reference the env variable defined above
```

In the config above the `local-frontend` deploy action is always enabled when in sync mode, but you can choose to
conditionally enable it as well.

You could e.g.
use [command line variables](https://docs.garden.io/features/variables-and-templating#variable-files-varfiles) to
control whether the `local-frontend` deploy action should be enabled or create a custom command.

## Usage

If you want to run the frontend service locally you'll need to have `npm` installed and also have to install the
packages for the frontend project

```console
cd frontend
npm install
cd ..
```

Assuming you've [set _your_ K8s context](https://docs.garden.io/kubernetes-plugins/remote-k8s), you can start the
project with:

```console
garden deploy --sync
```

This will deploy the remote services and start the local service as well.

You can now stream logs from both the local and remote services with the logs command:

```console
garden logs --follow
```
