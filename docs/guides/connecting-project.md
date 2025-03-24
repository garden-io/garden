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

Note that:

- **If this is your first time**, you'll be asked to create an account.
- **If you already have an account and are a part of multiple organizations**, you will be asked to pick the organization this project should belong to.

After you've logged in, **the organization ID will be automatically added to your project level Garden configuration**. You should check these changes into source control. If a project already has an organization ID, nothing will happen.

And that's it!

You can now benefit from team-wide caching and use the Remote Container Builder—and so can other people on your team as long as they're logged in. Note that the container builder needs to be enabled specifically in your config, [see here for more](../garden-for/containers/using-remote-container-builder.md).

See below for how to create an access token so that you can also use team-wide caching and Remote Container Builder in CI.

## Creating personal access tokens

To use Garden in CI you need to create a personal access token and use the `GARDEN_AUTH_TOKEN` environment variable.

You can create the token from the Settings page in [Garden Cloud](https://app.garden.io) and copy it to your clipboard.

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/personal-access-token-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/personal-access-token.png"
      alt="Create and copy personal access token"
    />
  </picture>
  <figcaption>Create and copy personal access token</figcaption>
</figure>

To use the token, run Garden with the `GARDEN_AUTH_TOKEN` set like so:

```console
GARDEN_AUTH_TOKEN=<my-personal-access-token> garden deploy
```

## Offline mode

After you connect your project and set the `organizationId`, you need to remain logged in to use Garden.

If you're not logged in, the command fails. This to prevent degraded performance such as slower builds or missed cache hits that users might not notice, especially in environments like CI.

If you can't log in for some reason, you can use "offline mode" by simply adding the `--offline` flag to your commands or by using the `GARDEN_OFFLINE` environment variable. For example:

```console
garden test --offline
```

...or:

```console
GARDEN_OFFLINE=true garden deploy
```

See also the section above about [creating access tokens](#creating-personal-access-tokens) for environments like CI where you can't run the interactive `login` command.

## Limits

Our free-tier includes a certain amount of build minutes and cache hits/cache retention and you can get more by upgrading to our team or enterprise tiers. You can learn more about the different tiers on our [plans page](https://garden.io/plans).

