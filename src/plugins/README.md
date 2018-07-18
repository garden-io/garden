# Plugins

To define a plugin you need to return a `GardenPlugin` object, and then declare that on the `builtinPlugins` object on the `garden/src/plugins/plugins.ts` file.

`GardenPlugin` is an interface that lives on `garden/src/types/plugin/plugin.ts`:

```typescript
export interface GardenPlugin {
  config?: object
  configKeys?: string[]

  modules?: string[]

  actions?: Partial<PluginActions>
  moduleActions?: { [moduleType: string]: Partial<ModuleActions> }
}
```

The way your plugin interacts with the rest of the world is via actions. These can be of three types: plugin actions, module actions, and service actions. They are:

Plugin Actions:

    - getEnvironmentStatus
    - configureEnvironment
    - destroyEnvironment
    - getConfig
    - setConfig
    - deleteConfig
    - getLoginStatus
    - login
    - logout

Module Actions:

    - parseModule
    - getModuleBuildStatus
    - buildModule
    - pushModule
    - runModule
    - testModule
    - getTestResult

Service Actions:

    - getServiceStatus
    - deployService
    - getServiceOutputs
    - execInService
    - getServiceLogs
    - runService




