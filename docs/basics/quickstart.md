---
title: Quickstart Guide
order: 1
---

# Quickstart Guide

In this quickstart guide we'll install Garden and deploy an example application using the `local-kubernetes` plugin.

Garden is pluggable by design and most often used with the (remote) Kubernetes plugin and the Terraform and/or Pulumi plugins.

Getting started with those requires a bit more set up and the goal here is to get you quickly started and to demonstrate Garden's main capabilities.

In the guide we'll:

* Install Garden
* Install local Kubernetes
* Deploy an example application

## Step 1 — Install Garden

You need the following dependencies on your local machine to use Garden:

* Git (v2.14 or newer)
* rsync (v3.1.0 or newer)

Run `git version` and `rsync --version` to verify that a recent enough version of Git and rsync is installed.

Then install the Garden CLI for your platform:

{% tabs %}

{% tab title="macOS (Homebrew)" %}
```sh
brew tap garden-io/garden && brew install garden-cli
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

For more detailed installation instructions, please see our [Installation guide](../guides/installation.md).

## Step 2 — Install Kubernetes locally

{% hint style="info" %}
If you already have [a supported version](../k8s-plugins/local-k8s/README.md#requirements) of Kubernetes installed locally you can skip this section.
{% endhint %}

In this guide we're using local Kubernetes since that's usually the fastest way to get started.

For real world projects we recommend using a remote Kubernetes cluster since that comes with various benefits such as shared caches and, well, doesn't require you to run K8s on your laptop!.

Below are our recommended local K8s providers by platform. For alternatives, check out our [local Kubernetes guide](../k8s-plugins/local-k8s/install.md).

{% tabs %}
{% tab title="macOS (Docker Desktop)" %}
First, download and install Docker Desktop for Mac following the instructions on the [official Docker site](https://docs.docker.com/desktop/install/mac-install/).

Then enable Kubernetes in Docker Desktop:

1. From the Docker Dashboard, select the **Preferences** icon.
2. Select **Kubernetes** from the left sidebar.
3. Next to **Enable Kubernetes**, select the checkbox.
3. Select **Apply & Restart** to save the settings and then click Install to confirm. This instantiates the images required to run the Kubernetes server as containers, and installs kubectl on your machine.

See the [official Docker docs](https://docs.docker.com/desktop/kubernetes/) for more details.

{% endtab %}

{% tab title="Linux (minikube)" %}
To install minikube on an AMD64 architecture, run:

```sh
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

For other architectures and more detailed instructions, please see the [official minikube docs](https://minikube.sigs.k8s.io/docs/start/).

Once you've installed minikube, you can start it with:

```sh
minikube start
```

{% endtab %}

{% tab title="Windows (Docker Desktop)" %}
First, download and install Docker Desktop for Windows following the instructions on the [official Docker site](https://docs.docker.com/desktop/install/windows-install/).

Then enable Kubernetes in Docker Desktop:

1. From the Docker Dashboard, select the **Settings** icon.
2. Select **Kubernetes** from the left sidebar.
3. Next to **Enable Kubernetes**, select the checkbox.
3. Select **Apply & Restart** to save the settings and then click Install to confirm. This instantiates the images required to run the Kubernetes server as containers, and installs kubectl on your machine.

See the [official Docker docs](https://docs.docker.com/desktop/kubernetes/) for more details.
{% endtab %}

{% endtabs %}

## Step 3 — Deploy the example application

Now that we have Garden installed and Kubernetes running locally, we can deploy our example application.

First, clone the Garden repo with:

```sh
git clone https://github.com/garden-io/quickstart-example.git
```

And then change into the directory of the quickstart example with:

```sh
cd quickstart-example
```

And finally deploy the project with Garden in dev mode:

```sh
garden deploy --dev
```

You should now be able to visit the example project at [http://vote.local.app.garden](http://vote.local.app.garden).

If the page doesn't load because the DNS address can't be found, you'll need to go to step 4 and update your hostfile. Otherwise, you're done!

The project itself doubles as an interactive guide that walks you through some common Garden commands and workflows. We encourage you to give it a spin!

## Step 4 — Update hostfile (only if needed)

{% hint style="info" %}
The `*.local.app.garden` domain resolves to 127.0.0.1 via our DNS provider. This means that when you go to [http://vote.local.app.garden](http://vote.local.app.garden), you _should_ be redirected to the app that you have running locally. However, some routers will prevent redirects to 127.0.0.1 and you'll need to update your hostfile instead.
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
127.0.0.1 vote.local.app.garden
```

{% endtab %}

{% tab title="Windows" %}
First, open Notepad as an administrator.

From Notepad, open the `hosts` file in the `C:\Windows\System32\Drivers\etc` directory.

Then add the following to the file and save it:

```sh
127.0.0.1 vote.local.app.garden
```

{% endtab %}

{% endtabs %}

Now you should be able to load the quickstart example project in your browser at [http://vote.local.app.garden](http://vote.local.app.garden).

## Next Steps

Now that you have Garden installed and seen its basic capabilities it's time to take the next steps.

If you'd like to better understand how a Garden project is configured when using one of the Kubernetes plugins, we recommend going
through our [first project tutorial](../tutorials/your-first-project/README.md) which walks you through configuring a Garden project step-by-step.

If you like to dive right in and configure your own project for Garden, we recommend using our [example
projects on GitHub](https://github.com/garden-io/garden/tree/0.12.50/examples) for reference and reading through the different pages
of the [Using Garden section](../using-garden/configuration-overview.md) of our docs.

And if you have any questions or feedback—or just want to say hi 🙂—we encourage you to join our [Discord community](https://discord.gg/gxeuDgp6Xt)!
