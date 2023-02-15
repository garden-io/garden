# garden flowchart

Assumes all external garden plugins (outside of the `core` package) are loaded.

## High-level flow of `garden deploy` command

```mermaid
flowchart TD
cli["garden deploy"]
cli-->cliRun
cliRun["GardenCli.runCommand()"]
cliRun-->getGarden["GardenCli.getGarden()"]
getGarden-->gardenInit
subgraph gardenInit[Garden class initialization]
  direction TB
  Garden-->|Initialize|VCSHandler
  Garden-->|Initialize|GraphSolver
  Garden-->|Initialize|EventBus
  Garden-->|Initialize|structs
  structs["Internal structs"]
end
gardenInit--->|"command.action()"|deploy.ts
subgraph deploy.ts
  subgraph getConfigGraph
    ConfigGraph[see the graph for\nConfig Graph Resolution]
  end
  getDeploys["getDeploys()"]
  getConfigGraph-->getDeploys
  getDeploys-->|"map new DeployTask()"|initialTasks
  subgraph processActions
    direction TB
    process["Garden.processTasks()"]
    solve["GraphSolver.solve() \n see the graph for Graph Solver"]
    process-->solve
  end
  initialTasks-->processActions
  processActions-->results
  results-->|handleProcessResults|return
end
```

## Config Graph Resolution

`getConfigGraph()`

```mermaid
flowchart TD
scanAndAddConfigs-->resolveProviders
subgraph resolveProviders
  direction TB
  configs["Garden.getRawProviderConfigs()"]
  configs-->validateGraph
  configs--->|"map new ResolveProviderTask()"|tasks
  tasks-->|"map Garden.processTasks() \n see the diagram for Graph Solver"|taskResults
  taskResults-->|"taskResults.results.getMap()"|providerResults
  providerResults-->|"map Garden.addModuleConfig()"|resolvedProviders
end
resolveProviders-->getRawModuleConfigs
getRawModuleConfigs-->|ModuleResolver.resolveAll|resolvedModules
resolvedModules-->|"new ModuleGraph()"|moduleGraph
moduleGraph-->|"convertModules() \n converts modules to actions"|actions
actions-->|"actionConfigsToGraph()"|actionGraph[graph]
actionGraph-->|"get plugins \n augment graph with plugins \n validate graph"|validGraph
validGraph["return graph.toConfigGraph()"]
```

## Graph Solver

TODO:

```mermaid
flowchart TD
solve
```
