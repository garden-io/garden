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

TODO:

```mermaid
flowchart TD
scanAndAddConfigs-->resolveProviders
resolveProviders-->getRawModuleConfigs
getRawModuleConfigs-->ModuleResolver.resolveAll
```

## Graph Solver

TODO:

```mermaid
flowchart TD
solve
```
