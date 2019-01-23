# Frequently Asked Questions

### What are the differences between Helm and Garden? 

**[Helm](https://helm.sh/) is a package manager for Kubernetes, with a much narrower scope in functionality. Garden, on the other hand, is a developer productivity tool, not a package manager.**

We use Helm as part of Garden, in fact, and you can use Helm packages directly via the helm module type in Garden (which is part of the `kubernetes` plugin).

Garden is designed to have broader functionality and adds a wide array of functionality on top of just deploying and configuring services. Functionality like building, testing, workflows, managing dependencies, file watching, hot reloading... it's a big list.

Tools like Helm are a critical part of making all of that feasible, and underline the importance of the open-source ecosystem we are a part of.

### Shouldn't Garden be a part of Kubernetes itself? 

**Perhaps some individual features might be introduced in Kubernetes itself, like runtime dependencies, for example. But really the scope of Kubernetes as a platform is as a runtime platform and orchestrator.**

Kubernetes does serve as a great platform to build on top of, because of its strong API and plugin mechanisms.

In addition, Garden isn't *only* for Kubernetes. It's designed to be pluggable into various other platforms, which may over time include AWS services like ECS and Lambda, Google Cloud Platform services, Heroku, and so on.

This will help users more easily migrate across platforms when their needs (almost inevitably) change or new technology emerges.

### Which languages does Garden work with?

**Garden works with any language you can run in a Docker container.**

However, some *stacks* are better suited than others for Garden. Interpreted languages like Python and NodeJS tend to work very well.

Languages like Go tend to work well, with the caveat that outside a container Go can leverage incremental builds, and inside a container everything starts with a clear slate—meaning it's slightly slower.

Some languages, on the other hand, might currently be less suited for Garden. This could be because of long compile times, or because they're resource heavy and running many of them on a local machine will slow things down (e.g. Java). 

That's why we are working on supporting remote development, in which case the services run in a remote cluster and not on the user's machine.

Furthermore, for some stacks it might take a long time to re-build and re-deploy certain services. If those services are frequently changed during development, you might want to limit your scope to the things you're working on directly—for example, with `garden deploy [module] --watch` to work on a single module—or manually run your deploys and builds. It should still be useful if you need to track dependencies across modules.

In addition, Garden can work well if the services being worked on can re-build and re-deploy in a reasonable time and/or support hot reloading, and they merely depend on the slower services.

See also the question about running Java/SpringBoot services.

### When will there be a stable version? 

Garden complies to semantic versioning and is currently at version 0.8.x. This means that the API can, and will, change. **Currently, we do not have a date for a 1.0.**

As for usage stability, we pre-release our release candidates and of course try to ensure that the final minor release won't introduce any new bugs. 

However, because of limited real world usage, there are definitely issues we have yet to discover. We're actively working on putting Garden to the test in order to discover and fix these.

### Why the name "Garden?"

**It's a nice and welcoming name, and we like the notion that your software grows in a living environment.** Like your curated garden of flowers and plants, your software is a living system of living things. 

Seasons change, as technologies do, new ideas come alive and some die or fall out of favor. Most importantly, all of them need to work and thrive together in their little ecosystem—your Garden.

### Do I have to choose between Garden or server-based CI? 

**Garden operates in the pre-commit stage of the development workflow, and focuses on the as-you-code experience** e.g. by providing short feedback loops and running tests *as you develop*.

It currently only runs locally—although we're working on remote capabilities—and when it comes to tests, it's better suited for things like smoke testing.

CI, on the other hand, runs remotely, after you commit your code, and it's better suited for running unit and integration tests.

### Is it possible to tag end-to-end tests so we don't have to re-run all tests every time?

You can split them up and run tests by their names with the `garden test` command. The YAML could look like this:

```yaml
tests:
  - name: light
    args: [npm, run, e2e-light]
  - name: full
    args: [npm, run, e2e-full]
```

And you'd run them with `garden test front-end --name=light`, assuming the service is called front-end.

In `garden dev` mode, all tests for a given service are run when a file watch event is triggered. If the system you're working on is very large, you might want to use more specific commands.

More fine grained control over when and how tests run [has been proposed](https://github.com/garden-io/garden/issues/438) as a potential feature.

### How about Docker Swarm?

We currently have a rough version of a Docker Swarm plug-in for Garden. We might make a stable version of it if enough users show interest in us doing so.

### How does Garden compare to a multi-language build tool like Bazel? 

Garden provides a fairly straightforward and simple build framework, which delegates the actual building of modules to plugins, e.g. to the docker plugin. Garden also operates purely on the module level—a module being a container, or a single library, for example. 

For the purpose of high-performance building of very large monorepo projects where you may need or want fine-grained control or file-level controls, you're likely to find various benefits in frameworks like Bazel. But adopting Bazel, Pants, or similar frameworks is not easy and we find that they don't always suit the actual problems of teams we've talked to. 

**Garden's build framework strikes a compromise in terms of features and simplicity** but, most importantly, **Garden adds important primitives that are specific to modern back-end systems**, like for service deployment, runtime bootstrapping workflows and testing.

### Good luck running 20 Java/SpringBoot services on your local machine!

**That is why we are working towards making it easy to work directly against a remote cluster.**

We started with local development as a step along the way—plus it does work fine for many non-Java developers—in order to develop the surface area of Garden, e.g. the APIs, configuration language, CLI, etc. These will remain exactly the same across local and remote environments.

That said, Garden won't be the best fit for every task, and if you're purely working with Java/SpringBoot, you might benefit from using tooling specifically designed for such stacks. 

If however you have a polyglot stack, Garden may be a good choice once remote development is fully supported, and perhaps with the addition of a plugin or two specifically for Java.

### Garden vs. Skaffold? 

[Skaffold](https://github.com/GoogleContainerTools/skaffold) is likely the closest analog to Garden, for the moment—and we'll note up top that a comparison like this can get outdated quickly, so please suggest improvements if you find something inaccurate! 

**Skaffold aims to solve some of the same abstract problems**, i.e. tightening the feedback loop as you develop. It is more **explicitly focused on building and deploying**, and only in the context of Kubernetes. It does the job quite well for that though, and the two do share some ideas, such as similar approaches to tag/version management and similar hot-reloading features.

In terms of actual features, Skaffold currently has better facilities for initializing projects (via `skaffold init`), and it explicitly supports a few things that Garden currently doesn't support directly, like Bazel, Jib, Gradle, Kustomize, Kaniko and various other Kubernetes-specific tools. 

**You can work around all that in Garden**, which is by design less coupled to Kubernetes, but those specific features may be useful for you. Skaffold has also been in active use for longer, and is likely more stable at the moment.

**Garden in turn has a few cool tricks of its own**. Specifically in the realm of building and deploying to Kubernetes, Garden has the following benefits:

Declare build dependencies across your containers, even libraries that aren't in a container (Garden can flexibly copy files from one build to another).

Pull code and configuration from multiple repositories. Easily stitch together your stack from multiple repos. Choose whether you co-locate your configuration or keep your configure separate from your code.

Garden scans for configuration files throughout your sources. No more massive top-level YAML files.

Garden allows you to define bootstrapping workflows, such as database migrations, that are executed automatically in the right dependency order.

Specific support for OpenFaaS (and more such plugins in the pipeline).

On top of that, Garden introduces powerful tools and native primitives for testing, which is a big pain point for developing multi-service stacks—and lets face it, if you're using Kubernetes, that is what you're likely doing.

### When using Garden inside tmux, colors look wonky. What gives?

You need to set tmux to use 256 colors. As per the [official documentation](https://github.com/tmux/tmux/wiki/FAQ#how-do-i-use-a-256-colour-terminal), you 
can do that by adding `set -g default-terminal "screen-256color"` or `set -g default-terminal "tmux-256color"` to your `~/.tmux.conf` file.