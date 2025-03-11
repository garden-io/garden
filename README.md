> [!WARNING]  
> **Garden 0.12.x EOL:** Garden Acorn (`0.12.x`) will receive security updates until the 30th of June, 2024. After that it will be deprecated and we'll stop support. See [announcement](https://github.com/garden-io/garden/issues/6119).

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
  <a href="https://github.com/garden-io/garden/tree/0.13.55/examples">Examples</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://garden.io/blog/?utm_source=github">Blog</a>
  <span>&nbsp;&nbsp;•&nbsp;&nbsp;</span>
  <a href="https://go.garden.io/discord">Discord</a>
</div>

## Welcome to Garden!

Garden is a DevOps automation tool for developing and testing Kubernetes apps faster.

- Spin up **production-like environments** for development, testing, and CI **on demand**
- Use the **same configuration** and workflows for **every stage of software delivery**
- **Speed up builds and test runs** via smart caching.

## Getting Started

The fastest way to get started with Garden is by following our [quickstart guide](https://docs.garden.io/getting-started/quickstart).

## Demo

![Garden dev deploy](https://raw.githubusercontent.com/ShankyJS/garden-quickstart-content/d8095ad1a8615edf49e721b8afcd901f3056e127/dev-mode.gif)

## Docs

For a thorough introduction to Garden and comprehensive documentation, visit our [docs](https://docs.garden.io).

## Usage Overview

Garden is configured via `garden.yml` files. For large projects you can split the files up and co-locate them with the relevant parts of your stack, even across multiple repositories.

A (simplified) Garden configuration for a web app looks like this:

```yaml
kind: Deploy
name: db
type: helm
spec:
  chart:
    name: postgres
    repo: https://charts.bitnami.com/bitnami
---
kind: Build
name: api
type: container
source:
  path: ./api
---
kind: Deploy
name: api
type: kubernetes
dependencies: [build.api, deploy.postgres]
spec:
  files: [./manifests/api/**/*]
---
kind: Test
name: integ
type: container
dependencies: [deploy.api]
spec:
  args: [npm, run, test:integ]
```

You can build and deploy this project with:

```console
garden deploy
```

...and test it with:

```console
garden test
```

To create a preview environment on every pull request, you would add the following to your CI pipeline:

```console
garden deploy --env preview
```

Garden also has a special mode called "sync mode" which live reloads changes to your running services—ensuring **blazing fast feedback while developing**. To enable it, run:

```console
garden deploy --sync
```

You can also start an interactive dev console (see screencap above) from which you can build, deploy, and test your project with:

```console
garden dev
```

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
