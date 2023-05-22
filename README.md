_If you love Garden, please ★ star this repository to show your support :green_heart: Looking for support? Join our [Discord](go.garden.io/garden).

<p align="center">
  <img src="https://github.com/garden-io/garden/assets/59834693/f62a04cb-44bc-4dd4-8426-398b6cd846fd" align="center">
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
- Declare your entire stack in a single file (or many files), including how it's built, deployed and tested from infrastructure to application code.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Community](#community)
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

## Plugins

Garden is *pluggable*: how actions are executed depends on the plugins used. Our Kubernetes plugin is currently the most popular, followed by our Terraform and Pulumi plugins. For a more thorough introduction to Garden and its plugins, visit our docs:

- [Kubernetes plugin](https://docs.garden.io/guides/remote-kubernetes).
- [Terraform plugin](https://docs.garden.io/terraform-plugin/about).
- [Pulumi plugin](https://docs.garden.io/pulumi-plugin/about).

For a deeper dive on how Garden works in general, we recommend:

- [How Garden Works](https://docs.garden.io/basics/how-garden-works).
- [A video tour of Garden's directed acyclic graph and getting started](https://www.youtube.com/watch?app=desktop&v=3gMJWGV0WE8).

## Community

Join our [Discord community](go.garden.io/discord) to ask questions, give feedback or just say hi 🙂

## Contributing

Garden accepts contributions! Please see our [contributing guide](CONTRIBUTING.md) for more information.

## License

Garden is licensed according to [Mozilla Public License 2.0 (MPL-2.0)](https://github.com/garden-io/garden/blob/main/LICENSE.md).
