---
title: Quickstart
order: 1
---

Garden is a DevOps automation tool for developing and testing Kubernetes apps faster.

In this quickstart guide, we'll:

* Install Garden
* Deploy an example project it to a local Kubernetes cluster

If you don't have Kubernetes installed, you can check out our guide on [installing local Kubernetes](../guides/install-local-kubernetes.md) or simply skip that step.

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

For more detailed installation instructions, see our [Installation guide](../guides/installation.md).

### Step 2 — Clone the example project

Next, we clone the example project from GitHub and change into the project directory:

```sh
git clone https://github.com/garden-io/quickstart-example.git
cd quickstart-example
```

### Step 3 — Connect your project

Now we need to connect the project to the Garden Cloud backend. This is required to use features such as [team-wide caching](../features/team-caching.md) and the [Remote Container Builder](../features/remote-container-builder.md).

You connect the project via the login command like so:

```sh
garden login
```

You'll be asked to create an account if you haven't already. Once you've logged in an `organizationId` will be added to the project config. This is of course just an example project but in general you should check the Garden config file with the `organizationId` into your source control.

You can [learn more about connecting projects here](../guides/connecting-project.md).

### Step 3 — Deploy the project

Now we can deploy the example project to our local Kubernetes cluster. We'll deploy the project in sync mode which enables live code syncing and starts the dev console:

```sh
garden deploy --sync
```

This will build all the containers in this project with the [Remote Container Builder](../features/remote-container-builder.md) and deploy them to your Kubernetes cluster. You can then visit the example project [via the link](http://vote.local.demo.garden/) output by Garden.

The quickstart also includes unit and integration tests. To run your unit test, just run `test unit`. To run your integration test, run `test integ`. Easy!

The project itself doubles as an interactive guide that walks you through some common Garden commands and workflows. We encourage you to give it a spin!

## Next Steps

Now that you have Garden installed and seen its basic capabilities it's time to take the next steps.

Start by checking out the [Garden basics guide](./basics.md) which covers the main concepts that you need to understand.

After that you can either go through [first project tutorial](../tutorials/your-first-project/) which explains step-by-step how to add Garden to an existing project. Or you can check out the [Next Steps guide](./next-steps.md) which gives you a more high level but still step-wise overview of how to adopt Garden and add it to your stack.

If you have any questions or feedback—or just want to say hi 🙂—we encourage you to join our [Discord community](https://go.garden.io/discord)!
