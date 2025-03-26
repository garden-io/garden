---
title: 3. Add Actions
order: 3
---

With our Kubernetes environment set up, we can start adding Garden actions for building and deploying our project.

## Step 1 — Log in to Garden Cloud

Start by logging into Garden Cloud with:

```sh
garden login
```

This enables you to use our [Remote Container Builder](../../garden-for/containers/using-remote-container-builder.md) which can significantly accelerate container builds as well as benefit from team-wide caching.

It also allows you to use your [Builds UI](https://app.garden.io) to view build logs analyze build bottlenecks.

{% hint style="info" %}
You can skip logging in if you choose but if you don't, you won't be able to use the Remote Container Builder nor benefit from the team-wide caching functionality.
{% endhint %}

## Step 2 — Add actions for deploying the database

Next, let's add Garden actions for deploying the database.

First, create a `garden.yml` config file in the `./db` directory.

We'll use actions of _kind_ `Deploy` and `Run` to deploy and seed the database. Each action also has a _type_ which determines how it's executed and depends on the plugins that we're using.

Since this is for a development environment we can deploy the database directly to our Kubernetes cluster. Let's use a Postgres Helm chart and add a Deploy action of type `helm`.

Now add the following to `./db/garden.yml`:

```yaml
kind: Deploy
name: db
type: helm
description: Deploy a Postgres Helm chart
spec:
  chart: # <--- Tell Garden what chart to use
    name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: "12.4.2"
  values: # <--- Overwrite some of the chart values
    fullnameOverride: postgres
    auth:
      postgresPassword: postgres
    primary:
      readinessProbe:
        successThreshold: 3
---
kind: Run
name: db-seed
type: kubernetes-exec
dependencies: [deploy.db]
description: Execute a command to initialize the database inside the running deployment
spec:
  resource: # <--- The K8s resource in which the action should be executed
    kind: "StatefulSet"
    name: "postgres"
  command: # <--- A simple command that creates a table that our app needs
    [
      "bin/sh",
      "-c",
      "PGPASSWORD=postgres psql -w -U postgres --host=postgres --port=5432 -d postgres -c 'CREATE TABLE IF NOT EXISTS votes (id VARCHAR(255) NOT NULL UNIQUE, vote VARCHAR(255) NOT NULL, created_at timestamp default NULL)'",
    ]
```

Here we're using the `kubernetes-exec` action type to seed the database by executing a command inside the running Pod. This is a good choice for development but another common pattern is to run separate Pods for these kind of one-off operations, e.g. via a `container` Run action.

Note also the `resource` field which tells Garden what resource to execute the command in.

{% hint style="info" %}
For higher environments we recommend using our [Terraform](../../garden-for/terraform/README.md) or [Pulumi](../../garden-for/pulumi/README.md) plugins to deploy a proper managed database instance.
{% endhint %}

## Step 3 — Add a Build action for the API

Next, let's add actions for the API.

This time we'll use actions of _kind_ `Build` and `Deploy` to (unsurprisingly) build and deploy the API.

First, create a `garden.yml` config file in the `./api` directory.

Then add the following Build action to the file:

```yaml
kind: Build
name: api
description: Build the API image
type: container
```


Now, try building the API by running the following from the interactive dev console:

```console
garden build
```

You can view the results and the logs in [Garden Cloud](https://app.garden.io).

Try running the `garden build` command one more time. Notice how Garden checks the status of the action and tells you that the API is already built?

This is how you can share build caches with your entire team when using the Remote Container Builder. Once a given part of your system has been built, everyone else on the team—and your CI pipelines—can re-use it and save massive amounts of time otherwise spent waiting for builds.

{% hint style="info" %}
By default, Garden will look for a Dockerfile next to the Garden config file but you can configure this. See [here](../../reference/action-types/Build/container.md#spec-dockerfile) and [here](../../misc/faq.md#can-i-use-a-dockerfile-that-lives-outside-the-action-directory).
{% endhint %}

## Step 4 — Add a Deploy action for the API

Next, we'll add an action for deploying the API.

Since we already have Kubernetes manifests for the API in the `./manifests` directory we'll use the `kubernetes` action type and add the following below the Build action in `./api/garden.yml`:

```yaml
---
kind: Deploy
name: api
type: kubernetes
description: Deploy the API
dependencies: [build.api, run.db-seed] # <--- We need to build the api and seed the DB before deploying it

spec:
  manifestFiles: [./manifests/*] # <--- Tell Garden what manifests to use

  defaultTarget: # <--- This tells Garden what "target" to use for logs, code syncing and more
    kind: Deployment
    name: api

  # Patch the K8s manifests for the api service so that we can set the correct image
  patchResources:
    - name: api
      kind: Deployment
      patch:
        spec:
          template:
            spec:
              containers:
                - name: api
                  image: ${actions.build.api.outputs.deploymentImageId} # <--- Reference the output from the Build action
```

Note the `patchResources` field. When Garden builds the API it attaches a version to the image based on the version of that action (which is based on the source code and action configuration). To ensure we deploy the correct version of the action we overwrite the `image` field in the corresponding manifest by applying the `patch` we specify under the `patchResources` field.

There are a few ways to overwrite manifest values with Garden but this is the recommended approach since it allows you to re-use existing manifests without making any changes to them. You can learn more about the different approaches [here](../../garden-for/kubernetes/deploy-k8s-resource.md#overwriting-values).

Next, lets deploy the API with:

```console
garden deploy
```

## Step 5 — Add actions for the web service

The actions for the web service will be very similar.

First, create a `garden.yml` file in the `web` directory and then add the following:

```yaml
kind: Build
name: web
type: container
---
kind: Deploy
name: web
type: kubernetes
dependencies: [build.web, deploy.api]
spec:
  manifestFiles: [./manifests/*]

  # Default target for syncs and exec commands
  defaultTarget:
    kind: Deployment
    name: web

  # Patch the K8s manifests for the web service so that we can set the correct image
  patchResources:
    - name: web
      kind: Deployment
      patch:
        spec:
          template:
            spec:
              containers:
                - name: web
                  image: ${actions.build.web.outputs.deploymentImageId}
```

If you have a lot of actions with similar config, you can create [reusable Config Templates](../../features/config-templates.md) to avoid the boilerplate.

Now try deploying the entire project by running the following from the interactive dev console:

```sh
garden deploy
```
