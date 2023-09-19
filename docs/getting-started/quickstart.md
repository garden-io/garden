---
title: Quickstart Guide
order: 1
---

# Quickstart Guide

{% hint style="info" %}
A visual quickstart is also available by logging in to the Garden Dashboard. The Dashboard can show you the status of your builds, deployments and stream logs from your services in real-time. To get started, click [Dashboard Quickstart](https://app.garden.io).
{% endhint %}

Garden is an all-in-one DevOps platform that enables you to build, test, deploy your applications and infrastructure in a single, unified workflow.

## Quickstart

In this quickstart, we'll introduce you to the one interactive command you'll spend most of your time in as a developer: `garden dev`.

In just 2 steps, we'll:

* Install Garden
* Deploy an example application to a remote ephemeral Kubernetes cluster.

### Step 1 — Install Garden

Install the Garden CLI for your platform:

{% tabs %}

{% tab title="macOS" %}

```sh
brew install garden-io/garden/garden-cli
```

{% hint style="info" %}
For a Mac computer with Apple silicon, Garden needs [Rosetta](https://support.apple.com/en-us/HT211861).
{% endhint %}

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

For more detailed installation instructions, please see our [Installation guide](../guides/installation.md).

### Step 2 — Deploy the example application

Now that we have Garden installed we will deploy our example application to an [ephemeral Kubernetes cluster](../guides/ephemeral-clusters.md) provided by Garden.

Clone the example project from GitHub:

```sh
git clone https://github.com/garden-io/quickstart-example.git && cd quickstart-example
```

Garden ships with an interactive command center we call the **dev console**. To start the dev console, run:

```sh
garden dev
```

The first time you run `garden dev`, Garden will initialize then await further instructions inside a [REPL](https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop). From inside the REPL you can command Garden to build, test, and deploy your project.

After running `garden dev`, login to the Garden web dashboard. Run:

```sh
login
```

Now you are ready to deploy, run:

```sh
deploy
```

You should now be able to visit the example project at the link output by Garden.

The quickstart also comes with some tests of the unit and end-to-end variety. To run your unit test, just run `test unit`. To run your end-to-end test, run `test e2e`. Easy!

The project itself doubles as an interactive guide that walks you through some common Garden commands and workflows. We encourage you to give it a spin!


## Next Steps

Now that you have Garden installed and seen its basic capabilities it's time to take the next steps.

If you'd like to better understand how a Garden project is configured, we recommend going
through our [first project tutorial](../tutorials/your-first-project/README.md) which walks you through configuring a Garden project step-by-step.

If you like to dive right in and configure your own project for Garden, we recommend referencing our [example
projects on GitHub](https://github.com/garden-io/garden/tree/0.13.14/examples) and the section of our docs title [Using Garden](../using-garden/configuration-overview.md), which covers all parts of Garden in detail.


If you have any questions or feedback—or just want to say hi 🙂—we encourage you to join our [Discord community](https://go.garden.io/discord)!
