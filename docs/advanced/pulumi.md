# Pulumi

{% hint style="warning" %}
The pulumi plugin is already being used in large projects, but is still considered experimental. Please let us know if you have any questions or if any issues come up!
{% endhint %}

Garden includes an experimental pulumi plugin that wraps the pulumi CLI. This way, you can incorporate pulumi stacks into your Garden project with minimal extra configuration. The benefits of using this plugin include:
* Leveraging Garden's dependency semantics with your pulumi stacks.
  * For example, Kubernetes modules can depend on infrastructure deployed with pulumi (and access stack outputs via the `${runtime.services.[service-name].outputs})` key).
  * Deploy, preview, update, refresh or destroy pulumi stacks in dependency order with a single command.
* Fast incremental deploys that use Garden's versioning system in combination with pulumi stack tags to implement efficient service status checks.

We strongly recommend that you [learn about pulumi](https://www.pulumi.com/docs/) (if you haven't already) before using it with Garden.

## How it works

Internally, Garden simply wraps the pulumi CLI, calling the appropriate pulumi CLI commands to deploy, delete or check the status of a service.

The pulumi plugin can optionally make use of stack tags to implement fast service status checks, which can be a major boost to performance when deploying projects containing several pulumi stacks.

Finally, the plugin defines several plugin-specific commands that let you run pulumi commands in one or more pulumi modules _in dependency order_ (which can be very useful for projects with several pulumi stacks).

## Configuring the provider

First, you need to enable the pulumi provider in your project configuration. This is as simple as placing it in your list of providers:
```yaml
kind: Project
name: my-project
providers:
  - name: pulumi # <----
  ...
```
There are several configuration options you can set on the provider—see the [reference docs for the pulumi provider](../reference/providers/pulumi.md) for details.

## Pulumi modules

Next, you need to write Garden module configs next to the pulumi stacks you'd like to include in your project. These should be located in the same direcory as the stack config, or in an enclosing directory.

For example:
```yaml
kind: Module
type: pulumi
name: my-pulumi-module
# If the pulumi stack doesn't exist already when deploying, create it
createStack: true 
# Cache deploys based on the Garden service version (see the section below)
cacheStatus: true
# These variables will be merged into the stack config before deploying or previewing
pulumiVariables:
  my-variable: pineapple
# Variables defined in varfiles will also be merged into the stack config in declaration
# order (and take precedence over variables defined in this module's pulumiVariables).
pulumiVarfiles: [my-default-varfile.yaml, dev.yaml]
```
See the [reference docs for the pulumi module type](../reference/module-types/pulumi.md) for more info on each available config field (and how/when to use them).

## Deploying your pulumi stacks

Once you've got your pulumi module configured, it will be deployed when you run `garden deploy` in your project—just like any other Garden service!

## Referencing stack outputs in other Garden modules

Pulumi stacks can define [stack outputs](https://www.pulumi.com/docs/intro/concepts/stack/#outputs).

These can then be read by other pulumi stacks via [stack references](https://www.pulumi.com/docs/intro/concepts/stack/#stackreferences).

Garden's dependency graph functionality is a great fit for stack references. For example, if `pulumi-module-a`'s pulumi program uses a stack references to an IP address that's an output of `pulumi-module-b`'s pulumi program, you can add a dependency on `pulumi-module-b` by referencing that output:
```yaml
kind: Module
type: pulumi
name: pulumi-module-a
cacheStatus: true
# Here, you should list all stack references used by this module's pulumi program.
stackReferences:
  - ${runtime.services.pulumi-module-b.outputs.ip-address}
# Make sure to add a dependency on each pulumi module you're using for stack references
# above (otherwise an error will be thrown when you deploy).
dependencies:
  - module-b
```
This ensures that Garden deploys `pulumi-module-b` before `pulumi-module-a` when running e.g. `garden deploy`.

If you make sure to include all stack references to pulumi modules in your project in the `stackReferences` field, you can safely set `cacheStatus: true` for your module, since Garden will factor the stack output values into its version calculations.

If `cacheStatus` is set to `false`, Garden runs `pulumi up` on every deploy. While this is safe and easy to reason about, it's much slower and more resource-intensive than using `cacheStatus = true`.

This is because running `pulumi up` is a much more expensive operation (in terms of CPU, RAM and time used) than the calls to `pulumi stack tag set/get` that Garden uses when `cacheStatus = true`.

With that in mind, we recommend using `cacheStatus = true` in your pulumi modules whenever possible, once you've made sure you've included all relevant stack references in your pulumi module configs.

## Plugin commands

The pulumi plugin also comes with plugin-specific commands, which are designed to run pulumi commands in dependency order (and with access to Garden's full config/templating capabilities).

The currently available plugin commands are: 
* `preview`
* `cancel`
* `refresh`
* `destroy`
* `reimport`
Each of the above wraps the pulumi command with the same name, except for `reimport` (which wraps `pulumi export | pulumi import`—a workflow that's occasionally needed).

By default, each command runs for every pulumi module in the project. Each plugin command also accepts an optional list of pulumi module names as CLI arguments.

When a list of module names is provided, the pulumi command will only be run for those modules (still in dependency order).

For example:
```
garden plugins pulumi preview -- my-pulumi-module my-other-pulumi-module
```

## Next steps

Check out the [`pulumi` example](https://github.com/garden-io/garden/tree/0.12.45/examples/pulumi) project.

Also take a look at the [pulumi provider reference]() and the [pulumi module type reference] for details on all the configuration parameters.

If you're having issues with pulumi itself, please refer to the [official docs](https://www.pulumi.com/docs/).
