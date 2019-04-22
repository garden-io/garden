# Frequently Asked Questions

### Why the name "Garden?"

We feel it's a nice and welcoming name :) And we like the notion that your software grows in a living environment. Like a well kept garden of flowers and plants, your software stack is a living system of living things.

Seasons change, as technologies do. New ideas come alive and some die or fall out of favor. Most importantly, all of them need to work and thrive together in their little ecosystem—your own Garden.

### Do I have to choose between Garden or server-based CI?

Garden is complementary to CI/CD platforms. **Garden focuses on the pre-commit stage of the development workflow, and focuses on the as-you-code experience** e.g. by providing short feedback loops and running tests *as you write code*.

We are also working towards integrations with various CI systems, so that you can use Garden for the testing part of your CI/CD pipelines, avoid duplicating test definitions, and more easily configure your CI process.

### Shouldn't Garden be a part of Kubernetes itself?

Perhaps some individual features might be introduced in Kubernetes itself, like runtime dependencies, for example. But really the scope of Kubernetes as a platform is as a runtime platform and orchestrator.

Kubernetes does however serve as a great platform to build on top of, because of its strong API, plugin mechanisms and portability.

In addition, Garden isn't *only* for Kubernetes. It's designed to be pluggable into various other platforms, which may over time include AWS services like ECS and Lambda, Google Cloud Platform services, Heroku, and so on.

This will help users more easily migrate across platforms when their needs (almost inevitably) change or new technology emerges.

### Which languages does Garden work with?

Garden has no code-level requirements, and generally is unaware of what languages modules use. Garden works with any language you can run in a Docker container, or works with other available plugins.

The [hot reloading](./using-garden/hot-reload.md) feature can also help make container-based development faster and easier for languages/frameworks that support in-place reloading.

### When will there be a stable version?

Currently, we do not have a date for a 1.0. Until then the API can, and will, change. However, as of 0.9.x the APIs are **not likely to change drastically**, and we are starting to change APIs much more cautiously. For configuration file and API schemas, our general guideline is to allow at least one minor release _between_ deprecating any current APIs and outright removing the older version.

### Is it possible to tag end-to-end tests so we don't have to re-run all tests every time?

You can split them up and run tests by their names with the `garden test` command. The YAML could look like this:

```yaml
tests:
  - name: unit
    args: [npm, run, unit]
  - name: e2e
    args: [npm, run, e2e]
```

And you'd run them with `garden test front-end --name=light`, assuming the service is called front-end.

In `garden dev` mode, all tests for a given service are run when a file watch event is triggered. If the system you're working on is very large, you might want to use more specific commands.

More fine grained control over when and how tests run [has been proposed](https://github.com/garden-io/garden/issues/438) as a potential feature.

### How about Docker Swarm (or other orchestrators)?

We currently have a rough version of a Docker Swarm plug-in for Garden, but don't officially support it yet. We might make a stable version of it if enough users show interest in us doing so, but our current roadmap has no particular plans for it. Please file issues and feature requests if you'd like to see additional platform support!

### Does Garden only work locally?

The Garden orchestrator itself doesn't care where your services are built, tested and deployed. However, the current selection of plug-ins does support local development better than remote development. For Kubernetes development in particular, it is currently much easier to set up the `local-kubernetes` plugin, and feedback loops are generally faster than with the more generic `kubernetes` plugin (see [this example](https://github.com/garden-io/garden/tree/v0.9.10/examples/remote-k8s) for how to configure remote clusters).

However, we are working to bridge that gap, since we strongly believe that remote building, testing and deployment is the way of the future. You can already use our [hot reloading](./using-garden/hot-reload.md) feature with remote clusters, for example.

### Garden vs. Skaffold?

[Skaffold](https://github.com/GoogleContainerTools/skaffold) is likely the closest analog to Garden, for the moment, but they are fundamentally different in some important respects.

> Note: A comparison like this can both get outdated quickly and suffer from bias, so please suggest improvements if you find something inaccurate!

Skaffold aims to solve some of the same abstract problems, i.e. tightening the feedback loop as you develop, but is more narrow in focus. It is more explicitly focused on **building and deploying, and only in the context of Kubernetes**. The two do share some ideas, such as similar approaches to tag/version management and similar hot-reloading features.

In terms of actual features, Skaffold currently has better facilities for initializing projects (via `skaffold init`), and it explicitly supports a few things that Garden currently doesn't support directly, like Bazel, Jib, Gradle, Kustomize, Kaniko and various other Kubernetes-specific tools. Support for Kaniko and Google Cloud Builder is planned for Garden, but is already mature in Skaffold.

Garden is not tied specifically to Kubernetes in terms of its architecture. Kubernetes is a plugin for Garden, albeit the most heavily developed one. Garden is overall meant to tackle the wider problem of developing distributed systems (i.e. microservices) as a _development orchestrator_. As such it covers more areas of development, such as testing, which is a big pain point for developing multi-service stacks—and lets face it, if you're using Kubernetes, that is what you're likely doing.

If we stick to an apples-to-apples comparison, and focus on building and deploying to Kubernetes, Garden has the following benefits:

- Declare build dependencies across your containers, even libraries that aren't in a container (Garden can flexibly copy files from one build to another).
- Pull code and configuration from multiple repositories. Easily stitch together your stack from multiple repos. Choose whether you co-locate your configuration or keep your configure separate from your code.
- Garden scans for configuration files throughout your sources. No more massive top-level YAML files.
- Garden allows you to define bootstrapping workflows, such as database migrations, that are executed automatically in the right dependency order.
- Specific support for OpenFaaS (and more such plugins in the pipeline).

### How does Garden compare to a multi-language build tool like Bazel?

Garden provides a fairly straightforward and simple build framework, which delegates the actual building of modules to plugins, e.g. to the docker plugin. Garden also operates purely on the module level—a module being a container, or a single library, for example.

For the purpose of high-performance building of very large monorepo projects where you may need or want fine-grained control or file-level controls, you're likely to find various benefits in frameworks like Bazel. But adopting Bazel, Pants, or similar frameworks is not easy and we find that they don't always suit the actual problems of teams we've talked to.

### When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you
can do that by adding `set -g default-terminal "screen-256color"` or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.