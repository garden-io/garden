---
title: Quickstart
order: 2
---

Garden is an all-in-one DevOps automation platform that enables you to build, test, and deploy your applications and infrastructure in a single, unified workflow.

In this quickstart guide, we'll:

* Install Garden
* Build and deploy an example project to a local Kubernetes cluster
* (or if you don't have Kubernetes, use Garden to run some scripts)

### Step 1 — Install Garden

Install the Garden CLI for your platform:

{% tabs %}

{% tab title="macOS" %}

```sh
brew install garden-io/garden/garden-cli
```

{% endtab %}

{% tab title="Linux" %}

```sh
curl -sL https://get.garden.io/install.sh | bash
```

{% endtab %}

{% tab title="Windows" %}
Open PowerShell as an administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/support/install.ps1'))
```

We also recommend adding an exclusion folder for the `.garden` directory in your repository root to Windows Defender:

```powershell
Add-MpPreference -ExclusionPath "C:\Path\To\Your\Repo\.garden"
```

This will significantly speed up the first Garden build of large projects on Windows machines.

{% endtab %}

{% endtabs %}

For more detailed installation instructions, please see our [Installation guide](./installation.md).

### Step 2 — Clone the example project

Next, we clone the example project from GitHub and change into the project directory:

```sh
git clone https://github.com/garden-io/quickstart-example.git
cd quickstart-example
```

Then login to Garden Cloud by running the login command from inside the project directory you just cloned:

```sh
garden login
```

### Step 3a — Deploy the project

Now we can deploy the example project to our local Kubernetes cluster. If you don't have one, you can follow the [instructions here](../guides/install-local-kubernetes.md) to install one or simply hop to step 3b.

First, start the **dev console** by running:

```sh
garden dev
```

Finally, let's deploy the project in sync mode which enables live code syncing:

```sh
deploy --sync
```

You can now visit the example project via the link output by Garden.

The quickstart also comes with some tests of the unit and end-to-end variety. To run your unit test, just run `test unit`. To run your end-to-end test, run `test e2e`. Easy!

The project itself doubles as an interactive guide that walks you through some common Garden commands and workflows. We encourage you to give it a spin!

{% hint style="info" %}
You can run all the same commands with the CLI directly without starting the dev console. Simply run `garden login` or `garden
deploy --sync` from your terminal. This is e.g. how you'd use Garden in CI.
{% endhint %}

### Step 3b — Test the project without Kubernetes

If you don't have Kubernetes on your machine you can still test Garden's `exec` actions which just run scripts on your machine.

First checkout to the `no-k8s` branch with:

```sh
git checkout no-k8s
```

Then run:

```
garden test
```

Of course Garden is primarily used for developing and testing against Kubernetes environments and `exec` actions are usually used for things like auth scripts.

## Next Steps

Now that you have Garden installed and seen its basic capabilities it's time to take the next steps.

If you'd like to better understand how a Garden project is configured, we recommend going
through our [first project tutorial](../tutorials/your-first-project/README.md) which walks you through configuring a Garden project step-by-step.

If you like to dive right in and configure your own project for Garden, we recommend referencing our [example
projects on GitHub](https://github.com/garden-io/garden/tree/0.13.54/examples) and the section of our docs title [Using Garden](../using-garden/configuration-overview.md), which covers all parts of Garden in detail.

If you have any questions or feedback—or just want to say hi 🙂—we encourage you to join our [Discord community](https://go.garden.io/discord)!
