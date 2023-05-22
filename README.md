_If you love Garden, please ★ star this repository to show your support 💖_

<p align="center">
  <img src="docs/logo.png" align="center">
</p>
<div align="center">
  <a href="https://docs.garden.io/basics/5-min-quickstart/?utm_source=github">Quickstart</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://garden.io/?utm_source=github">Website</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://docs.garden.io/?utm_source=github">Docs</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://github.com/garden-io/garden/tree/0.12.56/examples">Examples</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://garden.io/blog/?utm_source=github">Blog</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="go.garden.io/discord">Discord</a>
</div>

Garden is a tool that combines rapid development, testing, and DevOps automation in one platform. It is designed for teams developing applications that run on Kubernetes and for DevOps Engineers writing infrastructure as code.

With Garden you can:

- Test and develop with **smart caching** and **live reloading**.
- Build container images and push them to any number of registries, automatically, as you write.
- Use remote Kubernetes clusters as your development environment with developer namespaces.
- Declare your entire stack in a single file, including how it's built, deployed and tested from infrastructure to application code.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Credits](#credits)
- [License](#license)

## Installation

The fastest way to get started with Garden is by following our [quickstart guide](https://docs.garden.io/basics/quickstart).

Otherwise:

```sh
curl -sL https://get.garden.io/install.sh | bash
```

For more installation options, see the [installation guide](https://docs.garden.io/basics/installation).

## Usage

If you have a `garden.yml` file in your project, you can run `garden` commands from the root of your project. If you don't have a `garden.yml` file, clone the quickstart project:

```sh
git clone https://github.com/garden-io/garden-quickstart.git
```

Now start the dev console with:

```console
garden dev
```

Build with:

```console
build
```

Deploy with:

```console
deploy
```

Test with:

```console
test
```

Exit with `Ctrl+C` or `exit`.

To create a preview environment on every pull request, simply add the following to your CI pipeline:

```console
garden deploy --env preview
```

A developer wants to run an end-to-end test from their laptop as they code. Simple:

```console
garden test --name my-e2e-test
```

Garden also has a special mode called "sync mode" which live reloads changes to your running services—ensuring **blazing fast feedback while developing**. To enable it, simply run:

```console
garden deploy --sync
```

Garden is *pluggable* so how these actions are actually executed depends on the plugins used. Our Kubernetes plugin is currently the most popular, and chances are that’s what you’re here for. To learn more about how Garden works with Kubernetes, check out:

- [Kubernetes Plugins documentation](https://docs.garden.io/guides/remote-kubernetes).

For a deeper dive on how Garden works in general, we recommend:

- [This guide on how Garden works](https://docs.garden.io/basics/how-garden-works).
- [This video series on the Stack Graph and getting started with Garden](https://www.youtube.com/watch?app=desktop&v=3gMJWGV0WE8).

### **Plugins**

Garden is pluggable by design and supports a variety of providers and module types. Currently, our Kubernetes and Terraform plugins are the most used.

We will be adding more over time, as well as releasing a Plugin SDK (exact timeline TBD) which will allow the community to maintain their own Garden plugins.

The sky’s the limit, but to name some examples:

- Plugins for serverless runtimes will allow users to mix and match platforms in the same project.
- Security plugins that benefit from Garden’s caching and only run time-consuming scans when needed.
- Language-specific plugins for streamlining workflows.

### **Design principles and philosophy**

Below are our guiding principles for developing Garden.

- Garden should work with your existing tools.
- Plugins should automate as much of the standard use cases as possible. Friction is a kill-joy.
- Actions should execute in production-like environments. There’s generally a trade-off between realism and speed of feedback—Garden aims to provide both.
- Garden should err on being too informative. (We’ve gotten a lot of great feedback on this topic and are working hard to improve.)

### **Community**

Join our [Discord community](https://discord.gg/FrmhuUjFs6) to ask questions, give feedback or just say hi 🙂

### **Security**

If you find a security issue in Garden, please follow responsible disclosure practices and send information about security issues directly to security@garden.io.

For more details [see here](https://github.com/garden-io/garden/blob/main/SECURITY.md).

### **Telemetry**

We are trying to make Garden the best tool possible, and data on how it’s being used is very useful for us to inform the future development of Garden.

When you use Garden, we collect information about the commands you run, the tasks being executed, the project and operating system. We care about your privacy and we take special care to anonymize all the information. For example, we hash module names, and use randomly generated IDs to identify projects.

If you are curious to see an example of the data we collect or if you would like to update your preference, please visit the [Telemetry](https://docs.garden.io/misc/telemetry) page.

### **License**

Garden is licensed according to [Mozilla Public License 2.0 (MPL-2.0)](https://github.com/garden-io/garden/blob/main/LICENSE.md).
