---
title: Pulumi
order: 4
---

{% hint style="warning" %}
The Pulumi plugin is already being used in large projects, but is still considered experimental. Please let us know if you have any questions or if any issues come up!
{% endhint %}

Garden includes an experimental Pulumi plugin that wraps the Pulumi CLI. This way, you can incorporate Pulumi stacks into your Garden project with minimal extra configuration. The benefits of using this plugin include:
* Leveraging Garden's dependency semantics with your Pulumi stacks.
  * For example, Kubernetes actions can depend on infrastructure deployed with Pulumi (and access stack outputs via the `${actions.deploy.[pulumi-deploy-action-name].outputs})` key).
  * Deploy, preview, update, refresh or destroy Pulumi stacks in dependency order with a single command.
* Fast incremental deploys that use Garden's versioning system in combination with Pulumi stack tags to implement efficient service status checks.

We strongly recommend that you [learn about Pulumi](https://www.pulumi.com/docs/) (if you haven't already) before using it with Garden.

## How it works

Internally, Garden simply wraps the Pulumi CLI, calling the appropriate Pulumi CLI commands to deploy, delete or check the status of a service.

The Pulumi plugin can optionally make use of stack tags to implement fast service status checks, which can be a major boost to performance when deploying projects containing several Pulumi stacks.

Finally, the plugin defines several plugin-specific commands that let you run Pulumi commands in one or more Pulumi deploy actions _in dependency order_ (which can be very useful for projects with several Pulumi stacks).

## Deploying your Pulumi stacks

Once you've got your Pulumi deploy actions configured, they will be deployed when you run `garden deploy` in your project; just like any other Garden deploy!

## Referencing stack outputs in other Garden actions

Pulumi stacks can define [stack outputs](https://www.pulumi.com/docs/intro/concepts/stack/#outputs).

These can then be read by other Pulumi stacks via [stack references](https://www.pulumi.com/docs/intro/concepts/stack/#stackreferences).

Garden's dependency graph functionality is a great fit for stack references. For example, if `pulumi-deploy-action-a`'s Pulumi program uses a stack references to an IP address that's an output of `pulumi-deploy-action-b`'s Pulumi program, you can add a dependency on `pulumi-deploy-action-b` by referencing that output:
```yaml
kind: Deploy
type: pulumi
name: pulumi-deploy-action-a
spec:
  cacheStatus: true
  # Here, you should list all stack references used by this action's pulumi program.
  stackReferences:
    - ${actions.deploy.pulumi-deploy-action-b.outputs.ip-address}
  # Make sure to add a dependency on each pulumi action you're using for stack references
  # above (otherwise an error will be thrown when you deploy).
  dependencies:
    - deploy.pulumi-deploy-action-b
```
This ensures that Garden deploys `pulumi-deploy-action-b` before `pulumi-deploy-action-a` when running e.g. `garden deploy`.

If you make sure to include all stack references to Pulumi deploy actions in your project in the `stackReferences` field, you can safely set `cacheStatus: true` for your deploy action, since Garden will factor the stack output values into its version calculations.

If `cacheStatus` is set to `false`, Garden runs `pulumi up` on every deploy. While this is safe and easy to reason about, it's much slower and more resource-intensive than using `cacheStatus = true`.

This is because running `pulumi up` is a much more expensive operation (in terms of CPU, RAM and time used) than the calls to `pulumi stack tag set/get` that Garden uses when `cacheStatus = true`.

With that in mind, we recommend using `cacheStatus = true` in your pulumi deploy actions whenever possible, once you've made sure you've included all relevant stack references in your pulumi deploy action configs. However, setting `cacheStatus = true` is only possible for Pulumi cloud managed state backends.

## Plugin commands

The pulumi plugin also comes with plugin-specific commands, which are designed to run pulumi commands in dependency order (and with access to Garden's full config/templating capabilities).

The currently available plugin commands are:
* `preview`
* `cancel`
* `refresh`
* `destroy`
* `reimport`
Each of the above wraps the pulumi command with the same name, except for `reimport` (which wraps `pulumi export | pulumi import`—a workflow that's occasionally needed).

By default, each command runs for every pulumi deploy action in the project. Each plugin command also accepts an optional list of pulumi deploy action names as CLI arguments.

When a list of deploy action names is provided, the pulumi command will only be run for those deploy actions (still in dependency order).

For example:
```
garden plugins pulumi preview -- my-pulumi-deploy-action my-other-pulumi-deploy-action
```

## Pulumi varfile schema

By default Garden uses a schema for the Pulumi varfiles that expects all content in a varfile to be values that are set under the `config` key in the pulumi config file. Garden will resolve any template strings in varfiles and then add them to the `config` section of the pulumi config file.

Example of old varfile schema:

```
kubernetes:context: orbstack
pulumi-k8s:namespace: ns-from-the-varfile
```

Since this does not allow for setting other top-level values like e.g. `secretsprovider` this schema has been updated and now requires config values to be referenced under the `config` key.

Example of new varfile schema:

```
secretsprovider: gcpkms://projects/xyz/locations/global/keyRings/pulumi/cryptoKeys/pulumi-secrets
encryptedkey: 123456
config:
  kubernetes:context: orbstack
  pulumi-k8s:namespace: ns-from-the-varfile
```

To use the new schema in a single pulumi deploy action set `action.spec.useNewPulumiVarfileSchema` to `true`. To use
the new schema for all of your pulumi deploy actions set `useNewPulumiVarfileSchema` in your pulumi provider to `true`. The flag will be removed in the next major release and the new schema will be used.

## Next steps

Check out the [`pulumi` example](../../../examples/pulumi) project.

Also take a look at the [pulumi provider reference](../../reference/providers/pulumi.md) and the [pulumi's deploy action type reference](../../reference/action-types/Deploy/pulumi.md) for details on all the configuration parameters.

If you're having issues with pulumi itself, please refer to the [official docs](https://www.pulumi.com/docs/).
