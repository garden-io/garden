---
order: 20
title: Remote Variables and Secrets
---

## Overview

The Remote Variables feature allows you to store variables and secrets securely in [Garden Cloud](https://app.garden.io) and reference them in your Garden configuration. Remote variables and secrets can be scoped to environments and specific Garden users.

Here's a quick motivational example before we dive into the details. Below is a screenshot of secrets stored in Garden Cloud. Notice how the secrets are scoped to different environments and users 👇

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/remote-variables-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/remote-variables-light.png"
      alt="A list of remote variables/secrets"
    />
  </picture>
  <figcaption>A list of remote variables/secrets</figcaption>
</figure>

In your Garden config you can reference the `DB_PASSWORD` remote variable like so:

```yaml
# api/garden.yml
kind: Deploy
name: api
type: kubernetes
spec:
  # ...
  env:
    name: DB_PASSWORD
    value: ${imported.DB_PASSWORD}

```

Now, if you run `garden deploy --env ci` (e.g. from a GitHub Action workflow), the `DB_PASSWORD` value will resolve to the value defined for the CI environment.

Similarly, when Lisa and Tionne run `garden deploy`, the value resolves to what's defined for their dev environments.

{% hint style="info" %}
Quick note on terminology: Remote variables can be stored encrypted or in plain text. In what follows we'll generally refer to them as just "variables" or "remote variables" and only as "secrets" if we're specifically referring to encrypted variables.
{% endhint %}

## Quickstart

### Step 1 — Create a variable list in Garden Cloud

Log into [Garden Cloud](https://app.garden.io) and navigate to the variables page. If you haven't used variables in this organization before, you'll be asked to create your first variable list.

All variables must belong to a variable list. This allows you to import different sets of variables into different projects. We recommend naming the list after your project.

Go ahead and create a list and give it a description.

### Step 2 — Create remote variables

Next create some variables for the list using the "Create variable" button. You can choose between secret and plain text values and optionally scope them to environments and users.

To scope a variable to an environment, select or create the environment in the pop-up dialog.

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/create-variable-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/create-variable-light.png"
      alt="A list of remote variables/secrets"
    />
  </picture>
  <figcaption>The create variable dialog</figcaption>
</figure>

{% hint style="warning" %}
When scoping a variable to an environment, the environment name MUST match one of the environment names you have in your Garden config (under the project level `environments` field).
{% endhint %}

### Step 3 — Import the list in your Garden project

After you've created the list and some variables, copy the config snippet from the Variables page and add it to your project level Garden configuration, under `importVariables`. It should look something like this:

```yaml
# In your project configuration
kind: Project
name: my-project
importVariables:
  - from: garden-cloud
    list: varlist_<varlist-id>
    description: The "my-project" variable list.
```

{% hint style="info" %}
Variable lists are identified by their ID rather than name so that you can rename them without breaking your configuration. That's why we recommend adding a description as well. When you copy the config from Garden Cloud the description will be generated for you.
{% endhint %}

### Step 4 — Test that it works

First, make sure you're logged into Garden Cloud by running the login command from your Garden project:

```
garden login
```

Then verify that Garden can use the variables by running:

```console
garden get remote-variables
```

You can also do `garden get remote-variables -o json` for machine readable output.

You should see the variables just created in the output. If you created plain text variables, you'll see the value as well.

### Step 5 — Use them in your Garden config

You can now reference the variables you created anywhere in your Garden config with `${imported.<variable-name>}`. For example:

```
MY_VARIABLE: ${imported.MY_VARIABLE}
```

## Managing access with service accounts

{% hint style="danger" %}
Variables that aren't scoped to specific users are accessible to anyone in your organization. Read on to see how to manage access by scoping variables to user and/or service accounts.
{% endhint %}

Remote secrets can contain sensitive values that not everyone in your org should have access to. You can manage access by scoping them to specific users.

A variable scoped to a user can not be used by other user. Variables that are not scoped to users will be accessible to everyone in your Garden Cloud organization. Their values aren't visible if they're encrypted but users can still use them implicitly when running Garden commands.

That's why we recommend creating a service account for secrets that should not be shared. We also generally recommend using a service account for CI in general, instead of running pipelines as a normal user. Here's how you create a service account and scope a variable/secret to it:

1. Navigate to the Users page in [Garden Cloud](https://app.garden.io) and create a service account. Note that service accounts occupy seats just like any other user in your organization and come with build minutes.
2. Create a new variable on the Variables page and select the service account from the user list in the "create variable" dialog. You can also update existing variables and scope them to the service account. Note that user scoped variables must also be scoped to environments.
3. Create an access token for your service account from the Users page by clicking the "more" button for that user in the user list. Note it down, it's only displayed once.

You can now run Garden commands as this service account (e.g. in CI) with:

```
GARDEN_AUTH_TOKEN=<the-auth-token-you-just-created> garden deploy
```

{% hint style="warning" %}
Note that anyone with admin privileges can create an access token for a given service account.
{% endhint %}


## Usage examples

The examples below assume you've read the Quickstart section above and that the `importVariables` field is already set in your Project configuration.

### Using remote variables in K8s manifests

We generally recommend using the `patchResources` field to override your K8s manifests as needed and this same pattern applies for remote variables. For example, this is how you'd set a remote variable as an environment variable:

```yaml
kind: Deploy
type: kubernetes
name: api
spec:
  manifestFiles: [my-manifests.yml]
  patchResources:
    - name: api # <--- The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # <--- The kind of the resource to patch
      patch:
        spec:
          template:
            spec:
              containers:
                - name: api # <--- Should match the container name from the K8s manifest
                  env:
                    DB_PASSWORD: ${imported.DB_PASSWORD} # <--- You can define different values for different environments/users and Garden will resolve to the correct value.
```

For a more complete example of this approach, checkout our [K8s Deploy guide](../garden-for/kubernetes/deploy-k8s-resource.md#overwriting-values)

### Using remote variables in CI

To use remote variables in CI you need to be authenticated against Garden Cloud via the `GARDEN_AUTH_TOKEN` environment variable.

We recommend creating a service account for CI environments—you'll find step-by-step instructions in the [Manage Access section](#managing-access-with-service-accounts) above. You can also create a personal auth token for your user from the Users page in [Garden Cloud](https://app.garden.io).

Once you have the auth token, you need to set in your CI environment as `GARDEN_AUTH_TOKEN`. If you're using GitHub Actions we recommend using the [Garden Action](https://github.com/garden-io/garden-action) which simplifies the process.

Storing variables in Garden Cloud, as opposed to only with your CI provider, allows you to fully reproduce a given CI run from your laptop. If your CI environment uses sensitive values that users should not have access to from their laptops, you can create a service account and scope the variables appropriately (see the [Managing Access section](#managing-access-with-service-accounts) above).

### Creating remote variables with the Garden CLI

You can programmatically create remote variables via the Garden CLI.

First, get the variable list ID for the relevant list with. It's probably already visible in your project config under the `importVariables` field.

You can also get all the variable lists with:

```sh
garden get variable-lists
```

Or `garden get variable-lists -o json` for a machine readable output.

Then create your remote variables with the `create remote-variables` command. For example:

```sh
garden create remote-variables varlist_123 DB_PASSWORD=my-pwd ACCESS_KEY=my-key

```

You can also create multiple variables at a time by passing a file of variables (dot env or JSON format) to the command. To see the different options, run:

```sh
garden create remote-variables --help
```

### Rotating variables that are about to expire

When creating variables you can optionally set an expiration date. For example if you create an access token in a platform you use with a three month lifetime you can include that information when creating the variable in Garden Cloud.

You can then list all the variables that are about to expire with some `jq` magic (assuming you have `jq` installed):

```sh
garden get remote-variables -o json | jq '.result.variables[]
  | select(.expiresAt != null)
  | select(((.expiresAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) - now) < (2 * 24 * 60 * 60)
           and ((.expiresAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) - now) > 0)
  | .id'
```

This will return the IDs of all variables that expire in the next two days in JSON format

You can then remove them with the `delete remote-variables` command:

```sh
garden delete remote-variables <ids from previuous step>
```

...and re-create with updated values with the `garden create variables` command like we used in the [example above](#creating-remote-variables-with-the-garden-cli).

