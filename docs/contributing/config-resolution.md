---
title: Config Resolution
order: 6
---

This doc explains the high-level steps that Garden takes to go from config files on disk to a fully resolved project (with all modules, actions and workflows resolved with no unresolved template values remaining).

This includes:

* The steps involved in resolving Garden templates into concrete values. For example:
  * E.g. `${environment.name}.mydomain.com` -> `dev.mydomain.com`
  * or `${actions.build.api.outputs.deployment-image-id}` -> `some-registry.io/my-org/api:v-abf3f8dca`.
* Applying structural template operators (e.g. `$merge` and `$concat`).
* The config graph and the process of creating it (from files on disk to resolved action configs).
* How module configs are converted to action configs in 0.13.

Like in the [graph execution doc](./graph-execution.md), we'll start from the bottom up, looking at how template strings are resolved (and how structural operators are applied).

Then we'll move on to describing the high-level resolution flow and how it provides the necessary template context data for the next resolution step.

## How template strings are resolved - Parsing and evaluation

Let's say we're resolving this action config:

```yaml
kind: Deploy
type: container
name: api
spec:
  env:
    $merge: ${var.commonEnvVars} # evaluates to: { SOME_VAR: A, OTHER_VAR: B }
    ENV_NAME: ${environment.name} # evaluates to: dev
```

The end result should be:

```yaml
kind: Deploy
type: container
name: api
spec:
  env:
    SOME_VAR: A
    OTHER_VAR: B
    ENV_NAME: dev
```

The following needs to happen here:

* We need to parse template strings and create an abstract syntax tree (See `parseTemplateString()`)
* We need to parse structural template operators and create a tree of `UnresolvedTemplateValue` instances (See `parseTemplateCollection()`)
* We call the `deepEvaluate()` function on the configuration, together with the context that contains values of `environment.name` and `var.commonEnvVars`.
* This calls `evaluate` on the `UnresolvedTemplateValue` that holds all AST node instances of the template string, and `ContextLookupExpression.evaluate` will look up the keys in the context.
* We also call `evaluate` on the `MergeLazyValue` instance that represents the `$merge` operation, which merges the `{ SOME_VAR: A, OTHER_VAR: B }` map into the `env` map.

The template-string _parser_ is an auto-generated recursive-descent parser, and implements all the syntactic elements available in Garden's template expressions. It generates an abstract syntax tree. This includes:

* Boolean expressions
* Calling template helper functions (like `camelCase`, `join` or `isEmpty`)
* Template context lookups (like `environment.name` or `var.some_key`)

See `core/src/template/parser.pegjs` for the syntax and parser implementation.
When Core is built, this file is passed to a parser generation tool which generates an efficient parser based on the syntax & functions defined there.

See `core/src/template/ast.ts` for the `evaluate` implementation of each expression.

### Partial VS full resolution

For historical reasons, template strings with multiple expressions like `${var.foo}${var.bar}` can also be partially evaluated (`legacyAllowPartial: true`). This is ONLY USED for backwards-compatibility with Garden version `0.13` when using template conditions in Kubernetes manifest file templates, and will be removed in `0.14`.

We call configs where some templated values have been evaluated, and others have not, **unresolved configs** to differentiate it from the `legacyAllowPartial` feature.

## The config context classes

Each of the config context classes represents the template context keys available when resolving a particular bit of configuration.

For example: `ProjectConfigContext`, `ActionConfigContext` and `ActionSpecContext` (the last being more specific, as the spec is only fully resolved in [phase 2 of action resolution](#phase-2-of-action-resolution-full-resolution-in-solver-just-before-task-execution)).

These classes are also used to generate the reference docs for what template keys are available where, so they're an excellent place to start when figuring out why e.g. a certain key isn't available at a certain phase of config resolution.

In general, the relevant template context fields will be available as function parameters or instance variables of the class/helper that is making the call to `resolveTemplateStrings`.

It's the nature of the resolution flow that more and more params and instance variables will be available to provide to the template resolution calls as we get deeper in the control flow (from initializing the Garden instance and resolving the project config in the early phases, to fully resolving action configs in the solver close to the end).

## Lazy evaluation and config templates

It's possible to reference action outputs when declaring inputs for config templates.
This is possible because of the ability of a context to hold unresolved template values.

We will evaluate unresolved template values at the time they are needed; for instance, the action name (which may be templated in config templates) is needed very early, and thus action outputs cannot be referenced here.

## Choosing which parts of a config to resolve

In several places, we resolve only certain fields of a config at a given phase, only to resolve it fully a few lines below.

This is because we need different values in Garden core at different times, and we also may want to use a different config context for the different resolution calls.

Because this process of incremental resolution is so spread-out, we rely heavily on tests to make sure the whole behaves as it should.

This also means that if we find bugs or gotchas, we should always write tests to encode our expectations of how template resolution should behave.

## The phases of config resolution

While not all commands will resolve the config graph (which is done via `Garden#getConfigGraph`), all commands that run actions do so. This "standard" case is also the most complex, so that's what we'll discuss here (commands that don't resolve the config graph essentially just skip one or more of the below phases)

> Note: We're using the `Class#instanceMethod` and `Class.classMethod` notation here.

At a high level, these are the steps that Garden takes to fully resolve a project (including modules, config templates, templated modules and actions). A close reading of `Garden#getConfigGraph` and the helpers it calls tells you most of what you need to know.

* First, a `Garden` instance is created for the project.
  * This involves finding & resolving the project config, and resolving the environment config that the command is being run in.
  * The project config has the most limited template context available, since it's resolved first. The environment config context has access to a bit more context, and so forth as we proceed through this flow.
  * See the `resolveGardenParams` helper.
* Next, `Garden#getConfigGraph` calls `scanAndAddConfigs` (`getConfigGraph` is usually called in the `action` method of the command in question).
  * This looks for Garden config files in the project root and does some initial processing.
  * The config YAML is parsed into into JSON-like data structures, and some metadata is attached to each of them (e.g. the config path).
  * This is also the step where config templates are rendered into action and module configs.
    * Any module templates are converted into config templates before rendering—see the `prepareResource` helper function (and the code locations that call it) for more context and details.
* Providers are resolved.
  * This involves using the solver, since providers can reference providers they depend on via the `${providers.*}` key (and therefore, they need to be resolved in dependency order).
  * See: `Garden#resolveProviders`.
* Modules are resolved. This uses [an older resolution system, the `ModuleResolver`](#module-resolution) that is isolated from the rest of the flow.
* [Modules are converted into actions](#converting-modules-into-actions) (still in `Garden#getConfigGraph`).
* [Phase 1 of action resolution](#phase-1-of-action-resolution-preprocessing-during-config-graph-construction): Actions are preprocessed (i.e. we resolve the template values that we need to construct the graph) and their dependencies are augmented with any implicit dependencies detected in template references to outputs from other actions.
  * The result of this phase is a `MutableConfigGraph`: A DAG-like graph data structure that allows easy lookup of actions by e.g. name and kind.
  * See the call to `actionsToConfigGraph` in `Garden#getConfigGraph`.
* If any plugins define an `augmentGraph` handler, these are called now.
  * The `augmentGraph` handler gives plugins the option to add actions and dependency relationships to the config graph.
  * Importantly, the `augmentGraph` handler receives the actions from the (pre-augmentation) config graph as a parameter.
  * This is useful e.g. for inserting actions and/or dependencies for each action matching certain criteria.
  * For example, a security scanning plugin for container images might want to inject a validation `Test` action as a depedency for each matching `container` Build in the graph.
* The config graph is converted into an immutable config graph (a `ConfigGraph` instance) and returned at the end of `Garden#getConfigGraph`.
* Next, the command will usually call `garden.processTasks` on a list of tasks wrapping actions fetched from the config graph returned by the previous step.
* The solver will then fully resolve any required actions in dependency order (phase 2 of action resolution), so that the outputs of dependency actions are made available for full template resolution of the `spec` field of the tasks' actions—see the [graph execution guide](./graph-execution.md) for more details on the solver flow.

Next, we'll take a deeper look at some of the more involved steps above.

### Module resolution

For backwards-compatibility with 0.12, module configs are converted to action configs during the resolution flow.

First, modules are resolved in dependency order by the `ModuleResolver` class. The `ModuleResolver` implements a control flow that's similar to the 0.13-era `GraphSolver` (in fact, the `ModuleResolver` was a prototyping ground for some of the techniques that were used in the solver system).

The `ModuleResolver` operates at an earlier phase of the config resolution flow than action resolution, and therefore module configs can't reference actions.

The `ModuleResolver` does a leaves-first traversal of the dependency structure among the module configs, and dynamically adds nodes in dependency order if any are discovered as the module configs are resolved more fully.

The `ModuleResolver#resolveModuleConfig` method is where the module config is incrementally resolved in several phases, with validation and error handling being applied at each step. We highly recommend reading the source closely to get a good understanding of the details.

### Converting modules into actions

After modules have been resolved, they are converted into actions by the `convertModules` function (called inside `Garden#getConfigGraph`).

A module usually results in several actions:

* A Build for the build step (if any).
  * If the module uses the `copyfrom` field, a dummy Build will be included to ensure that the copying takes place when the module's constituent actions are run later.
* A Deploy for each service.
* A Test for each test config.
* A Run for each task config.

Importantly, the `ActionRouter#module.convert` method allows the module's plugin to perform custom logic during the conversion process.

For example, `helm` modules don't generate a Deploy action if they have `skipDeploy: true`, since in that case there won't be a service config to convert. There's also some logic to implement the now-deprecated base module feature from 0.12.

To get a better understanding of how module conversion works, we recommend reading the `convertModules` helper, and the `convert` handlers of the `container`, `kubernetes`, `helm` and `exec` module types.

### Phase 1 of action resolution: Preprocessing during config graph construction

Here, we fully resolve built-in action config fields (like `include` and `dependencies`)—that is, framework-level fields that are not plugin-specific.

Some of these built-in fields need to be resolved so the framework can e.g. calculate the action version (`include`/`exclude`) and figure out the dependency structure between actions (`dependencies`) so that the `ConfigGraph` can be constructed. These calculations need to be finished before the solver is called to fully resolve and execute the actions in phase 2 (which is what enables us to resolve references to e.g. action outputs).

Importantly, `spec` and `variables` (on the action level) are not among these fields—`spec` is where plugin-specific fields live, and is typically where later-stage fields (such as static & runtime outputs from other actions) are relevant and necessary. This is fine, since `spec` is only used by the action's underlying plugin.

The `actionFromConfig` and `preprocessActionConfig` functions are where most of this is implemented.

### Phase 2 of action resolution: Full resolution in solver just before task execution

For more details on how the solver resolves and executes actions, see the [graph execution doc](./graph-execution.md)—especially the section on status dependencies VS process dependencies, and implicit dependencies from template references.

The static and runtime outputs of dependency actions are populated into the `ActionSpecContext` used to fully resolve action specs and variables (see also: `ActionReferencesContext` and the `actions` and `runtime` keys under `ActionSpecContext`).

For a closer look at how actions are fully resolved, check out the `process` method of `ResolveActionTask`.
