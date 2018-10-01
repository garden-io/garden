import { TreeCache } from "./cache";
import { Module } from "./types/module";
import { Environment, SourceConfig } from "./config/project";
import { VcsHandler, ModuleVersion } from "./vcs/base";
import { BuildDir } from "./build-dir";
import { TaskResults } from "./task-graph";
import { Logger } from "./logger/logger";
import { PluginActions } from "./types/plugin/plugin";
import { Service } from "./types/service";
import { GardenConfig } from "./config/base";
import { Task } from "./tasks/base";
import { LocalConfigStore } from "./config-store";
import { ExternalSourceType } from "./util/ext-source-util";
import { BuildDependencyConfig, ModuleConfig } from "./config/module";
import { ActionHelper } from "./actions";
import { ModuleAndServiceActions, Plugins } from "./types/plugin/plugin";
export interface ActionHandlerMap<T extends keyof PluginActions> {
    [actionName: string]: PluginActions[T];
}
export interface ModuleActionHandlerMap<T extends keyof ModuleAndServiceActions> {
    [actionName: string]: ModuleAndServiceActions[T];
}
export declare type PluginActionMap = {
    [A in keyof PluginActions]: {
        [pluginName: string]: PluginActions[A];
    };
};
export declare type ModuleActionMap = {
    [A in keyof ModuleAndServiceActions]: {
        [moduleType: string]: {
            [pluginName: string]: ModuleAndServiceActions[A];
        };
    };
};
export interface ContextOpts {
    config?: GardenConfig;
    env?: string;
    logger?: Logger;
    plugins?: Plugins;
}
export declare class Garden {
    readonly projectRoot: string;
    readonly projectName: string;
    readonly environment: Environment;
    readonly projectSources: SourceConfig[];
    readonly buildDir: BuildDir;
    readonly log: Logger;
    readonly actionHandlers: PluginActionMap;
    readonly moduleActionHandlers: ModuleActionMap;
    private readonly loadedPlugins;
    private moduleConfigs;
    private modulesScanned;
    private readonly registeredPlugins;
    private readonly serviceNameIndex;
    private readonly taskGraph;
    readonly localConfigStore: LocalConfigStore;
    readonly vcs: VcsHandler;
    readonly cache: TreeCache;
    readonly actions: ActionHelper;
    constructor(projectRoot: string, projectName: string, environment: Environment, projectSources: SourceConfig[], buildDir: BuildDir, logger?: Logger);
    static factory(currentDirectory: string, { env, config, logger, plugins }?: ContextOpts): Promise<Garden>;
    getPluginContext(providerName: string): import("./plugin-context").PluginContext;
    clearBuilds(): Promise<void>;
    addTask(task: Task): Promise<void>;
    processTasks(): Promise<TaskResults>;
    private registerPlugin;
    private loadPlugin;
    private getPlugin;
    private addActionHandler;
    private addModuleActionHandler;
    getModules(names?: string[], noScan?: boolean): Promise<Module[]>;
    /**
     * Returns the module with the specified name. Throws error if it doesn't exist.
     */
    getModule(name: string, noScan?: boolean): Promise<Module>;
    /**
     * Given the provided lists of build and service dependencies, return a list of all modules
     * required to satisfy those dependencies.
     */
    resolveModuleDependencies(buildDependencies: BuildDependencyConfig[], serviceDependencies: string[]): any;
    /**
     * Given a module, and a list of dependencies, resolve the version for that combination of modules.
     * The combined version is a either the latest dirty module version (if any), or the hash of the module version
     * and the versions of its dependencies (in sorted order).
     */
    resolveVersion(moduleName: string, moduleDependencies: BuildDependencyConfig[], force?: boolean): Promise<ModuleVersion>;
    getServices(names?: string[], noScan?: boolean): Promise<Service[]>;
    /**
     * Returns the service with the specified name. Throws error if it doesn't exist.
     */
    getService(name: string, noScan?: boolean): Promise<Service<Module>>;
    scanModules(force?: boolean): Promise<any>;
    private detectCircularDependencies;
    addModule(config: ModuleConfig, force?: boolean): Promise<void>;
    resolveModule(nameOrLocation: string): Promise<ModuleConfig | null>;
    /**
     * Clones the project/module source if needed and returns the path (either from .garden/sources or from a local path)
     */
    loadExtSourcePath({ name, repositoryUrl, sourceType }: {
        name: string;
        repositoryUrl: string;
        sourceType: ExternalSourceType;
    }): Promise<string>;
    /**
     * Get a handler for the specified action.
     */
    getActionHandlers<T extends keyof PluginActions>(actionType: T, pluginName?: string): ActionHandlerMap<T>;
    /**
     * Get a handler for the specified module action.
     */
    getModuleActionHandlers<T extends keyof ModuleAndServiceActions>({ actionType, moduleType, pluginName }: {
        actionType: T;
        moduleType: string;
        pluginName?: string;
    }): ModuleActionHandlerMap<T>;
    private filterActionHandlers;
    /**
     * Get the last configured handler for the specified action (and optionally module type).
     */
    getActionHandler<T extends keyof PluginActions>({ actionType, pluginName, defaultHandler }: {
        actionType: T;
        pluginName?: string;
        defaultHandler?: PluginActions[T];
    }): PluginActions[T];
    /**
     * Get the last configured handler for the specified action.
     */
    getModuleActionHandler<T extends keyof ModuleAndServiceActions>({ actionType, moduleType, pluginName, defaultHandler }: {
        actionType: T;
        moduleType: string;
        pluginName?: string;
        defaultHandler?: ModuleAndServiceActions[T];
    }): ModuleAndServiceActions[T];
}
//# sourceMappingURL=garden.d.ts.map