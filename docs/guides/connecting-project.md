---
order: 10
title: Connecting a Project
---

{% hint style="info" %}
Connecting a project is only possible for Garden versions 0.14.0 and higher.
{% endhint %}

To use key Garden features such as [team-wide caching](../features/team-caching.md) and the [Remote Container Builder](../features/remote-container-builder.md) you need to connect your Garden project to the [Garden Cloud backend](https://app.garden.io).

## Connecting a project

A "connected project" is a Garden project that has an `organizationId` field set in the project level Garden config file.

To connect a project, run the login command from your project directory with:

```
garden login
```

If this your first time, you'll be asked to create an account.

If you already have an account and are a part of multiple organizations, you will be asked to pick the organization this project should belong to.

After you've logged in, the organization ID will be automatically added to your project level Garden configuration. You should check these changes into source control. If a project already has an organization ID, nothing will happen.

And that's it!

From now on, you can benefit from team-wide caching and use the Remote Container Builder—and so can other people on your team as long as they're logged in.

Note that the container builder needs to be enabled specifically in your config, [see here for more](../garden-for/containers/using-remote-container-builder.md).

See below for how to create an access token so that you can also use team-wide caching and Remote Container Builder in CI.

## Creating personal access tokens

// TODO

## Limits

Our free-tier includes a certain amount of build minutes and cache hits/cache retention and you can get more by upgrading to our team or enterprise tiers. You can learn more about the different tiers on our [plans page](https://garden.io/plans).

