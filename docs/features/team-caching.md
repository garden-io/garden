---
title: Team Caching
order: 2
---

One of the most important features of Garden is its smart caching abilities. Garden calculates the version of each action, based on the source files and configuration involved, as well as any upstream dependencies. When using Garden, you'll see various instances of `v-<some hash>` strings scattered around logs, e.g. when building, deploying, running tests, etc.

These versions are used by Garden to work out which actions need to be performed whenever you want to build, deploy or test your project.

The version is stored in the [Garden Cloud backend](https://app.garden.io) and can be shared with your team and across CI runs. This means that if you open a pull request that triggers several Test actions to be run, then push a new commit that only changes files that belong to one of the tests, only that test will re-run.

Our free-tier has limits on cache retention and number of cache hits that you can increase by switching to our team or enterprise tiers. You can learn more about the [different plans here](https://garden.io/plans).

![Run a test that passes then run it again. Note that the second time it's cached.](https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/team-cache-gif.gif)

## Using Team Caching

Team Caching is enabled automatically as long you've [connected your project to the Garden Cloud backend](../guides/connecting-project.md).
