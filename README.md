# Garden

_If you love Garden, please ★ star this repository to show your support :green_heart:. Looking for support? Join our [Discord](https://go.garden.io/discord)._

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github-production-user-asset-6210df.s3.amazonaws.com/658727/272340510-34957be5-7318-4473-8141-2751ca571c4f.png">
    <source media="(prefers-color-scheme: light)" srcset="https://github-production-user-asset-6210df.s3.amazonaws.com/658727/272340472-ad8d7a46-ef85-47ea-9129-d815206ed2f6.png">
    <img alt="Garden" src="https://github-production-user-asset-6210df.s3.amazonaws.com/658727/272340472-ad8d7a46-ef85-47ea-9129-d815206ed2f6.png">
  </picture>
</p>
<div align="center">
  <a href="https://docs.garden.io/getting-started/quickstart/?utm_source=github">Quickstart</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://garden.io/?utm_source=github">Website</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://docs.garden.io/?utm_source=github">Docs</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://github.com/garden-io/garden/tree/0.13.28/examples">Examples</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://garden.io/blog/?utm_source=github">Blog</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://go.garden.io/discord">Discord</a>
</div>

Garden is a tool that combines rapid development, testing, and DevOps automation in one platform. It is designed for teams developing applications that run on Kubernetes and for DevOps Engineers writing infrastructure as code. This repository contains the source of Garden core along with its [documentation](./docs) and [examples](./examples).

You can get started in minutes with the new [Garden Web Dashboard](https://app.garden.io). Just click the link and follow the interactive guide to deploy your first example project with Garden.

![Short tour of the features of the Garden Web Dashboard including command history, visualized dependency graph, and the Garden dev console](https://ce-content.s3.fr-par.scw.cloud/web-dashboard-gif.gif)

With Garden you can:

- Test and develop with **smart caching** and **live reloading**.
- Build container images and push them to any number of registries, automatically, as you write.
- Use remote Kubernetes clusters as your development environment with developer namespaces.
- Declare your entire stack in a single file (or many files), including how it's built, deployed and tested from infrastructure to application code.

## Installation

The fastest way to get started with Garden is by following our [quickstart guide](https://docs.garden.io/getting-started/quickstart).

Otherwise:

```sh
curl -sL https://get.garden.io/install.sh | bash
```

For more installation options, see the [installation guide](https://docs.garden.io/getting-started/installation).

## Demo

![Garden dev deploy](https://raw.githubusercontent.com/ShankyJS/garden-quickstart-content/d8095ad1a8615edf49e721b8afcd901f3056e127/dev-mode.gif)

## Interactive environments

Preview Garden with our new interactive and install-free cloud-based playgrounds ✨.

Click a button to start your Killercoda or Google Cloud Shell environment 👇🏼.

<a href="https://go.garden.io/killercoda"><img src="https://raw.githubusercontent.com/garden-io/garden-interactive-environments/main/resources/img/killercoda-logo.png" alt="Killercoda logo in black and white." height="55px"/></a> [![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://go.garden.io/cloudshell)

If you find any bugs 🐛 or have suggestions to improve our labs please don't hesitate to reach out by creating an [issue here](https://github.com/garden-io/garden-interactive-environments) or by asking in our [Discord Community](https://go.garden.io/discord)🌸

## Usage

> Make sure you have Garden installed and Kubernetes running locally (e.g. with Minikube or Docker for Desktop) before deploying the project.

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

Exit with `exit`.

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

## Docs

For a more thorough introduction to Garden and comprehensive documentation, visit our [docs](https://docs.garden.io).

## How Garden Works

The Stack Graph is a key feature of Garden that enables efficient development, testing, and DevOps automation. The Stack Graph allows you to declare the dependency structure of your project and track changes to avoid unnecessary builds, deploys and test runs. It's like CI/CD config that you can additionally use for development. Without the Stack Graph, many of these functionalities that distinguish Garden from its competitors would not be possible or would be much less efficient.

- **Efficient builds and deploys:** The Stack Graph allows Garden to determine which parts of your project have changed and need to be rebuilt or redeployed, avoiding unnecessary work and speeding up the development process.

- **Automated testing:** Garden can automatically run tests for the parts of your project that have changed, thanks to the Stack Graph. This saves time because all parts of your dependency graph are known and cached.

- **DevOps automation:** The Stack Graph allows Garden to automate many aspects of the DevOps process, including building, testing, and deploying your project.

For more information on the Stack Graph and how Garden works, see:

- [How Garden Works](https://docs.garden.io/overview/how-garden-works)
- [A video tour of the Stack Graph and guide to getting started](https://www.youtube.com/watch?app=desktop&v=3gMJWGV0WE8)

## Plugins

Garden is _pluggable_: how actions are executed depends on the plugins used. Our Kubernetes plugin is currently the most popular, followed by our Terraform and Pulumi plugins. For a more thorough introduction to Garden and its plugins, visit our docs:

- [Kubernetes plugin](https://docs.garden.io/guides/remote-kubernetes)
- [Terraform plugin](https://docs.garden.io/terraform-plugin/about)
- [Pulumi plugin](https://docs.garden.io/pulumi-plugin/about)

## Community

Join our [Discord community](https://go.garden.io/discord) to ask questions, give feedback or just say hi 🙂

## Contributing

Garden accepts contributions! Please see our [contributing guide](CONTRIBUTING.md) for more information.

## License

Garden is licensed according to [Mozilla Public License 2.0 (MPL-2.0)](https://github.com/garden-io/garden/blob/main/LICENSE.md).
