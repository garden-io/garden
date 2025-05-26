---
title: Garden vs Other Tools
order: 4
---

# Garden vs Other Tools & Platforms

The tooling landscape for cloud development has gotten a lot more crowded over the past few years. In this doc, we’ll put Garden in context by comparing and contrasting it with other types of tools and platforms.

In short, Garden automates the process of building, deploying, developing and testing applications in a way that’s simpler, faster and way easier to maintain than laboriously writing CI pipelines or shell scripts by hand.

On top of this, it’s got code syncing for live reloading during development, live log streaming and an intuitive web interface. It combines advanced CI automation with a first-class experience during development and debugging.

## CI systems (GitHub Actions, BuildKite etc.)

Garden is not intended to replace traditional CI systems—in fact, the most common use-case for Garden is calling it in
CI!

Where Garden fits into CI pipelines is by taking care of building, deploying and testing a graph of components (and publishing the built images afterwards if needed).

Garden can greatly simplify the task of creating ephemeral environments for every pull request, deploying to a staging environment on merges to the main branch, and running test suites involving one or more runtime components (e.g. API tests, end-to-end tests and load tests).

Our users report that over time the amount of YAML in their CI pipeline definitions shrinks down to almost nothing, since deploying an entire environment or running an end-to-end test suite becomes just `garden deploy` or `garden test`.

On top of that, developers and DevOps engineers alike can run Garden from their dev machines to reproduce anything that goes wrong in CI. No need to repeatedly re-trigger pipelines just to see if your fix works—your laptop can now do anything your CI system can!

## PaaS (Heroku, Fly etc.)

PaaS (platform-as-a-service) offerings provide developers with simplified abstractions of the underlying platform (e.g. Kubernetes or AWS EC2), and often come with their own special-purpose tools (CLIs and the like).

In contrast, Garden isn’t a hosting platform at all. It builds, deploys and tests on your own infrastructure. Bring your own infrastructure, and Garden will take it from there.

Just point it at a Kubernetes cluster or your AWS/Azure/GCP account, and Garden will build, deploy and test your application using the Dockerfiles, Kubernetes manifests, Helm charts, Terraform stacks etc. that you’re already using in CI or production.

Our goal is to add automation on top of what you already have, not to abstract it away.

This has two main benefits:

1. It keeps Garden simple to use and understand—we’re not trying to reinvent the wheel when it comes to building, deploying and testing—we delegate to specialist tools like BuildKit, kubectl, Helm and Terraform to do what they’re best at.

2. It lets Garden work for any system, no matter how simple or complex. Since we’re not asking you to fundamentally change how you’re building, deploying or testing your application, you can always add Garden on top of it to bring advanced dev & testing automation to your project.

## Internal developer portals (Backstage, Cortex etc.)

These tools take a different approach to dev automation: After being configured by DevOps engineers, they provide a point-and-click way for developers to create environments or deploy specific components. This is a simple and easy-to-use approach for companies where developers prefer to abstract away the complexity of the underlying system during development.

Garden also enables developers to easily deploy an entire environment or a subset of components (via the garden deploy command).

But it also goes a lot further than just deploying environments:

- Testing is a built-in primitive in Garden.

- Live-reloading during development via code syncing, and building without going through CI.

- Garden can be run from your dev machine, without committing & pushing your changes! This is a big deal when you're working on a feature and need a rapid code/debug/test loop to stay productive.

- Live log streaming from running services during development.

All in all, Garden provides more out-of-the box functionality for the developer, and tries to automate not just the creation of environments, but to provide a first-class developer experience when writing, debugging and testing code ( the perfect companion to your editor/IDE of choice).

In short, Garden merges the capabilities of a CI system with that of a developer tool.

Another difference is that tools like Backstage and Cortex are typically adopted by platform teams, whereas Garden is typically adopted by lead developers or DevOps engineers on individual teams, i.e. the people who are directly involved with CI & dev automation for a given team.

## Deployment and IaC tools (Helm, kubectl, Terraform, Pulumi etc.)

We work together! Garden has plugins for deploying using Helm, kubectl, Terraform and Pulumi. Our philosophy is to work with the way your system is currently built, deployed and tested, and focus on being the graph automation and developer experience layer on top of those building blocks.

## Kubernetes dev tools (Okteto, Skaffold, Loft)

These tools take a more focused approach to solving specific problems in developing apps for Kubernetes, and also generally focus only on Kubernetes (there's no support for Terraform or Pulumi, for example).

Like Garden, they offer code syncing, building and deploying, but don't have a built-in notion of testing. They're not intended to do the heavy lifting in a complex CI pipeline, but they're good at what they do. They also tend to be simpler to understand and get started with than Garden.

## GitOps CD tools (Argo, Flux)

Garden works well with GitOps-based CD tools. In short, Garden helps with everything up to production deployments, which most users prefer to do with dedicated CD tools.

The process is usually something like this (using ArgoCD as an example):

1. A developer uses Garden to debug & test a feature in a production-like dev environment.

2. After the developer opens a PR, a CI pipeline calls the Garden CLI to deploy an ephemeral environment from the branch (via garden deploy), and run the full set of test suites (via garden test).

3. After the PR is approved, a pipeline uses garden publish to publish the built images to the production container registry, where they're picked up by e.g. the ArgoCD image updater.

4. ArgoCD then triggers the production deployment process and takes things from there.

See our [blog post on using Garden with ArgoCD and Helm](https://garden.io/blog/argo-cd-helm-charts) for a full example of this.

## Custom deployment scripts

While custom scripts and other in-house tooling gives you complete control, it also means a lot more work for your team down the line. Scripts also tend to be brittle, and are hard to maintain and test when new components are introduced, or dependencies change.

Garden's Stack Graph means you can easily add or remove components and change their dependencies, and your pipelines automatically adapt (since the execution graph is automatically generated from your Garden configs).

Garden's Run actions (one of the four main action kinds, the others being Builds, Deploys and Tests) can also be used to wrap any script or tool that you'd like to call in your pipeline, so you always have a general-purpose escape hatch for any custom logic you need to run in your pipeline that doesn't fit easily into Garden's way of doing things.
