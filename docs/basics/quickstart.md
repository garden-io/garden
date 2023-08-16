---
title: Quickstart Guide
order: 1
---

# Quickstart Guide

{% hint style="info" %}
A visual quickstart is also available by logging in to the Garden Dashboard. The Dashboard can show you the status of your builds, deployments and stream logs from your services in real-time. To get started, click [Dashboard Quickstart](https://app.garden.io).
{% endhint %}

Garden is an all-in-one DevOps platform that enables you to build, test, deploy your applications and infrastructure in a single, unified workflow.

## Interactive environments

Preview Garden with our new interactive and install-free cloud-based playgrounds ✨.

Click a button to start your Killercoda or Google Cloud Shell environment 👇🏼.

<a href="https://go.garden.io/killercoda"><img src="https://raw.githubusercontent.com/garden-io/garden-interactive-environments/main/resources/img/killercoda-54px.png" alt="Killercoda logo in black and white." height="54px"></a> [![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://go.garden.io/cloudshell)

If you find any bugs 🐛 or have suggestions to improve our labs please don't hesitate to reach out by creating an [issue here](https://github.com/garden-io/garden-interactive-environments) or by asking in our [Discord Community](https://go.garden.io/discord)🌸

## Quickstart

In this quickstart, we'll introduce you to the one interactive command you'll spend most of your time in as a developer: `garden dev`.

In just 3 steps, we'll:

* Install Garden
* Run a local, [supported flavor](../k8s-plugins/local-k8s/README.md#requirements) of Kubernetes
* Deploy an example application

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

### Step 2 — Install Kubernetes locally

{% hint style="info" %}
If you already have [a supported version](../k8s-plugins/local-k8s/README.md#requirements) of Kubernetes installed locally you can skip this section.
{% endhint %}

This quickstart uses Docker Desktop's built-in Kubernetes. For supported alternatives, check out our [guide to local Kubernetes flavors](../k8s-plugins/local-k8s/install.md).

Download and install Docker Desktop following the instructions on the [official Docker site](https://docs.docker.com/desktop).

Then enable Kubernetes in Docker Desktop:

1. From the Docker Dashboard, select the **Settings** icon.
2. Select **Kubernetes** from the left sidebar.
3. Next to **Enable Kubernetes**, select the checkbox.
4. Select **Apply & Restart** to save the settings and then click Install to confirm. This instantiates the images required to run the Kubernetes server as containers, and installs kubectl on your machine.

See the [official Docker docs](https://docs.docker.com/desktop/kubernetes/) for more.

### Step 3 — Deploy the example application

Now that we have Garden installed and Kubernetes running locally, we can deploy our example application.

Clone the example project from GitHub:

```sh
git clone https://github.com/garden-io/quickstart-example.git && cd quickstart-example
```

Garden ships with an interactive command center we call the **dev console**. To start the dev console, run:

```sh
garden dev
```

The first time you run `garden dev`, Garden will initialize then await further instructions inside a [REPL](https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop). From inside the REPL you can command Garden to build, test, and deploy your project.

After running `garden dev`, you're ready to deploy your project. Run:

```sh
deploy
```

![Garden dev deploy](https://raw.githubusercontent.com/ShankyJS/garden-quickstart-content/d8095ad1a8615edf49e721b8afcd901f3056e127/dev-mode.gif)

You should now be able to visit the example project at [http://vote.local.demo.garden](http://vote.local.demo.garden).

The quickstart also comes with some tests of the unit and end-to-end variety. To run your unit test, just run `test unit`. To run your end-to-end test, run `test e2e`. Easy!

![Garden dev tests](https://raw.githubusercontent.com/ShankyJS/garden-quickstart-content/210fbac5a733869c507920988e588a0c1989a7ae/dev-mode-tests.gif)

If the page doesn't load, you'll need to go to step 4 and update your hostfile. Otherwise, you're done!

The project itself doubles as an interactive guide that walks you through some common Garden commands and workflows. We encourage you to give it a spin!

### Step 4 — Update hostfile (only if needed)

{% hint style="info" %}
The `*.local.demo.garden` domain resolves to 127.0.0.1 via our DNS provider. This means that when you go to [http://vote.local.demo.garden](http://vote.local.demo.garden), you _should_ be redirected to the app that you have running locally. However, some routers will prevent redirects to 127.0.0.1 and you'll need to update your hostfile instead.
{% endhint %}

If you get an error saying that DNS address can't be found when attempting to load the page, follow the instructions below to edit the hostfile for your platform.

{% tabs %}

{% tab title="macOS / Linux" %}
In your terminal, open your hostfile as an administrator by running:

```console
sudo vim /etc/hosts
```

We're using vim here but feel free to use your editor of choice.

Then add the following to file and save it:

```sh
127.0.0.1 vote.local.demo.garden
```

{% endtab %}

{% tab title="Windows" %}
First, open Notepad as an administrator.

From Notepad, open the `hosts` file in the `C:\Windows\System32\Drivers\etc` directory.

Then add the following to the file and save it:

```sh
127.0.0.1 vote.local.demo.garden
```

{% endtab %}

{% endtabs %}

Now you should be able to load the quickstart example project in your browser at [http://vote.local.demo.garden](http://vote.local.demo.garden).

## Next Steps

Now that you have Garden installed and seen its basic capabilities it's time to take the next steps.

If you'd like to better understand how a Garden project is configured, we recommend going
through our [first project tutorial](../tutorials/your-first-project/README.md) which walks you through configuring a Garden project step-by-step.

If you like to dive right in and configure your own project for Garden, we recommend referencing our [example
projects on GitHub](https://github.com/garden-io/garden/tree/0.13.12/examples) and the section of our docs title [Using Garden](../using-garden/configuration-overview.md), which covers all parts of Garden in detail.


If you have any questions or feedback—or just want to say hi 🙂—we encourage you to join our [Discord community](https://go.garden.io/discord)!
