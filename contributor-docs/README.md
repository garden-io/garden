## Contributor Docs

This directory contains docs on Garden's internals. These are intended to be useful for contributors.

While much of Garden's implementation can be understood by reading individual functions and classes, a big-picture overview is very useful when dealing with certain subsystems. Examples of this include the graph execution and config resolution flows.

We'll add more guides to this directory as they're written—please don't hesitate to request more docs or ask questions on our [community Discord channel](https://go.garden.io/discord)!

## Index
* [Graph execution](./graph-execution.md): Explains the steps involved when `GraphSolver` (solver) processes a set of tasks in dependency order.
* [Config resolution](./config-resolution.md): Explains the high-level steps that Garden takes to go from config files on disk to a fully resolved project (with all modules, actions and workflows resolved with no template strings remaining).
