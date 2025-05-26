---
title: Graph Execution
order: 7
---

This doc explains the steps involved when `GraphSolver` (solver) processes a set of tasks in dependency order. The solver and the task classes (e.g. `ResolveActionTask` and `BuildTask`) are tightly integrated, so this doc will cover them as a single whole.

> Note: This doc is intended to be read side-to-side with the source code. We'll try to stay high-level here to avoid coupling too tightly to the implementation (which may change over time). The goal is to give a high-level overview, not to cover the finest details.

Internally, the solver and the task classes are used for:

* Resolving provider configs.
* Resolving action configs.
* Executing actions.

Each of the above use-cases benefits from the capabilities of the solver:

* Dynamic caching & dependency processing: The solver uses the `getStatus` method of the tasks it's processing to determine whether they (or their dependencies) need to be processed at all.
  * Note: `ResolveProviderTask` and `ResolveActionTask` currently always return a null status (so they don't make use of this capability of the solver).
  * Importantly, `BuildTask`, `DeployTask`, `TestTask` and `RunTask` all implement a `getStatus` method that's designed to include a `ready` state in the status when the underlying action doesn't need to be run (because an up-to-date build/deploy/test/run has already taken place).
* Collecting & providing dependency results to dependants.
  * Having access to the results of processing a task's dependencies is essential for e.g. resolving actions that reference static or runtime outputs from another action.
* Concurrency control, standardized error handling and logging.

While this system may look somewhat thorny from the outside, it's actually relatively simple and intuitive once the moving parts are understood.

## High-level flow

At its most basic level, the solver flow is as follows:

* `Garden#processTasks` is called with a list of tasks, which in turn calls `GraphSolver.solve`
* The solver wraps each of these tasks in a node.
* Nodes for any tasks that already have an up-to-date result available (i.e. whose `getStatus` method returns a ready status) are completed without needing to be processed.
* The `process` method of each remaining task and their dependencies is called in turn, which (depending on the task type) performs an operation like resolving a provider or action, or executing a build, deploy, test or run.
* Finally, the results of the tasks are returned by `Garden#processTasks`.

> Note: We're using the `Class#instanceMethod` and `Class.classMethod` notation here.

The organizational hierarchy is: Solver > Nodes > Tasks.

We'll start from the bottom up, beginning with the task classes (which are the most complex part) before moving to the solver.

## The lifecycle of a task - config resolution, status checking and execution

The task classes are wrappers around operations that can have dependencies. These include:

* Action execution task classes for each of the four action kinds: `BuildTask`, `DeployTask`, `TestTask` and `RunTask`.
* `ResolveActionTask` and `ResolveProviderTask` - for resolving action and provider configs, respectively.

The role of task classes is to:

* Optionally define a `getStatus` method that the solver can call to determine whether the task needs to be executed.
* Provide the solver with a `process` method to call (to run the task) if the `getStatus` method returns `null` or a non-ready status.
* Tell the solver which dependencies the task has - those that are needed to check the status, and those that are needed to actually process the task (see the next section for more details on task dependencies) .

At the time this doc was written in August 2023, the `getStatus` methods of `ResolveActionTask` and `ResolveProviderTask` always return `null` (meaning that they're never cached/skipped).

Conversely, the each of the action execution task classes uses their action kind's router to check if there's an up-to-date result available for the action (at the current version).

If an up-to-date result is available, the `getStatus` method will return a status with `state: "ready"`, which indicates to the solver that the task doesn't need to be processed (unless the task has `force: true`). This flow is how graph-aware caching is implemented in Garden (the way the action version is calculated in a dependency-aware fashion is also a critical part of this).

If not, then the solver will end up calling the task's `process` method, which executes the operation that the task wraps (e.g. resolving an action config, building, deploying etc.).

### Task dependencies

In addition to the `getStatus` and `process` methods, each task class has methods for determining the dependencies (which are also tasks) that need to be processed first (i.e. before the parent task).

### Status dependencies VS process dependencies

A task can specify _status dependencies_ by returning a non-empty array in its `resolveStatusDependencies` method. Status dependencies are essentially the pre-requisites for the task to be able to check its status.

The primary example of this is for the action execution task classes, which all need their underlying action to be resolved first (via a `ResolveActionTask`). This is because the plugin handler that checks the status needs the resolved action to do its work (e.g. to know which Kubernetes resources to query for and compare against, in case there are unresolved Garden template values in a selector in an underlying Kubernetes manifest—the details depend on the plugin in question).

Similarly, _process dependencies_ are the pre-requisites for the task to be run to completion. We highly recommend reading the code for the `resolveProcessDependencies` methods of `ResolveActionTask` and `BaseActionTask` to start with.

The specifics vary in how the `resolveProcessDependencies` method is implemented on the various task classes, but usually this involves iterating over the dependency references of the underlying action (or provider, for `ResolveProviderTask`) and returning different types of task depending on the the dependency spec:

```typescript
export interface ActionDependencyAttributes {
  explicit: boolean // Set to true if action config explicitly states the dependency
  needsStaticOutputs: boolean // Set to true if action cannot be resolved without resolving the dependency
  needsExecutedOutputs: boolean // Set to true if action cannot be resolved without the dependency executed
}
```

The idea here is to use the cheapest / least processed type of task that's required to satisfy the dependency. This helps avoid unnecessary work, which is important for keeping things nice and fast.

From least to most processed, this means: _No dependency < Resolved action/provider < Executed action/provider_.

### Implicit dependencies from template references

Dependency references with `explicit: false` are added to actions when they're pre-processed. During this phase, we look for unresolved template values referencing action outputs (e.g. `${actions.build.api.outputs.deployment-image-name}`) and add dependencies on the referenced actions (e.g. a build dependency on `api`).

The `needsStaticOutputs` and `needsExecutedOutputs` flags will be set according to whether the field that's referenced is available before executing the action.

For example, when referencing an output key of a Terraform stack (via a `terraform` Deploy), this value may not be available until the stack has actually been applied (e.g. if the value is a dynamically allocated IP address or DB hostname with a UID in it).

On the other hand, many outputs can be calculated without running the action itself. This includes most build outputs (which tend to use the action name and version and other values that are available before actually building).

The details of how this is hashed out are liable to change over time, but this is the general design.

## The solver

Now that we've covered the task classes, their status checking and dependency calculation logic at some length, we're well prepared to understand how the solver itself works.

Internally, the solver uses three node classes (each of which wraps a task instance):

* `RequestTaskNode`
  * Initially, one of these is created for each task requested in the call to `GraphSolver.solve`.
  * These are essentially the root nodes of the graph to be executed, and represent the result that is to be returned for the requested task in question.
  * They don't have an `execute` method themselves, and depend on either a process or status node (depending on whether the request is for a `statusOnly` result — such requests come e.g. from commands that just need to check that a Deploy is running).
* `StatusTaskNode`
  * When executed, calls the `getStatus` method of its underlying task.
  * Its dependencies are the status dependencies of the underlying task.
* `ProcessTaskNode`
  * When executed, calls the `process` method of its underlying task.
  * Its dependencies are the process dependencies of the underlying task.

Additionally, the solver maintains Maps of pending and in-progress nodes.

The flow is as follows:

* `Garden#processTasks` is called with a list of tasks, which in turn calls `GraphSolver.solve`.
* The solver wraps each of these tasks in a `RequestTaskNode` and starts the loop (see the `loop` and `evaluateRequests` methods on the solver).
* In each iteration of the loop:
  * The solver looks at each incomplete request, checks if any of them were completed in the last iteration and completes them.
  * A status or process node may be added to the pending graph.
* Note: Please refer to the source code for the specifics — any detailed description here is likely to drift from the implementation over time.
 and processes them in dependency order, making sure to first process any required dependencies.
* The solver ensures that any remaining dependencies of `this.pendingNodes` are included.
* A dependency graph is generated from the remaining (i.e. not complete) pending nodes, and queried for the leaf nodes. This step also detects circular dependencies.
* Up to a certain concurrency limit, the leaf nodes of the dependency graph are processed (and added to the in-progress Map).
* When a node finishes processing, it's marked ad complete, and the result of processing is saved on the node (this will be the return value of the `getStatus` or `process` method of the underlying task, for status and process nodes respectively).
* Eventually, all the requested tasks will be completed, and the results will be returned.

That's it! Of course, there are more details, but they mostly pertain to error handling and concurrency control, and are subject to change over time.

What we've covered in this doc should serve as a decent introduction, but we highly recommend reading the source code. The best way to get a feel for the total flow is to break something, fix a bug, or add a feature that touches on this part of Garden — diving into the control flow with log statements or a debugger is the best way to get a feel for what's really going on.

Note: The `loop` and `ensurePendingNodes` methods on the solver are synchronous (i.e. not `async`) by design – by only updating the active nodes in synchronous code, we prevent race conditions and make the code much easier to reason about.
