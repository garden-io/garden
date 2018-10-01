"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const path_1 = require("path");
const lodash_1 = require("lodash");
const AsyncLock = require("async-lock");
const cache_1 = require("./cache");
const plugins_1 = require("./plugins/plugins");
const module_1 = require("./types/module");
const plugin_1 = require("./types/plugin/plugin");
const project_1 = require("./config/project");
const util_1 = require("./util/util");
const constants_1 = require("./constants");
const exceptions_1 = require("./exceptions");
const git_1 = require("./vcs/git");
const build_dir_1 = require("./build-dir");
const task_graph_1 = require("./task-graph");
const logger_1 = require("./logger/logger");
const plugin_2 = require("./types/plugin/plugin");
const common_1 = require("./config/common");
const template_string_1 = require("./template-string");
const base_1 = require("./config/base");
const config_store_1 = require("./config-store");
const detectCycles_1 = require("./util/detectCycles");
const ext_source_util_1 = require("./util/ext-source-util");
const config_context_1 = require("./config/config-context");
const file_writer_1 = require("./logger/writers/file-writer");
const log_node_1 = require("./logger/log-node");
const actions_1 = require("./actions");
const plugin_context_1 = require("./plugin-context");
const scanLock = new AsyncLock();
const fileWriterConfigs = [
    { filename: "development.log" },
    { filename: constants_1.ERROR_LOG_FILENAME, level: log_node_1.LogLevel.error },
    { filename: constants_1.ERROR_LOG_FILENAME, level: log_node_1.LogLevel.error, path: ".", truncatePrevious: true },
];
class Garden {
    constructor(projectRoot, projectName, environment, projectSources = [], buildDir, logger) {
        this.projectRoot = projectRoot;
        this.projectName = projectName;
        this.environment = environment;
        this.projectSources = projectSources;
        this.buildDir = buildDir;
        this.modulesScanned = false;
        this.log = logger || logger_1.getLogger();
        // TODO: Support other VCS options.
        this.vcs = new git_1.GitHandler(this.projectRoot);
        this.localConfigStore = new config_store_1.LocalConfigStore(this.projectRoot);
        this.cache = new cache_1.TreeCache();
        this.moduleConfigs = {};
        this.serviceNameIndex = {};
        this.loadedPlugins = {};
        this.registeredPlugins = {};
        this.actionHandlers = lodash_1.fromPairs(plugin_2.pluginActionNames.map(n => [n, {}]));
        this.moduleActionHandlers = lodash_1.fromPairs(plugin_1.moduleActionNames.map(n => [n, {}]));
        this.taskGraph = new task_graph_1.TaskGraph(this);
        this.actions = new actions_1.ActionHelper(this);
    }
    static factory(currentDirectory, { env, config, logger, plugins = {} } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let parsedConfig;
            if (config) {
                parsedConfig = common_1.validate(config, base_1.configSchema, { context: "root configuration" });
                if (!parsedConfig.project) {
                    throw new exceptions_1.ConfigurationError(`Supplied config does not contain a project configuration`, {
                        currentDirectory,
                        config,
                    });
                }
            }
            else {
                config = yield base_1.findProjectConfig(currentDirectory);
                if (!config || !config.project) {
                    throw new exceptions_1.ConfigurationError(`Not a project directory (or any of the parent directories): ${currentDirectory}`, { currentDirectory });
                }
                parsedConfig = yield template_string_1.resolveTemplateStrings(config, new config_context_1.ProjectConfigContext());
            }
            const projectRoot = parsedConfig.path;
            const { defaultEnvironment, environments, name: projectName, environmentDefaults, sources: projectSources, } = parsedConfig.project;
            if (!env) {
                env = defaultEnvironment;
            }
            const parts = env.split(".");
            const environmentName = parts[0];
            const namespace = parts.slice(1).join(".") || constants_1.DEFAULT_NAMESPACE;
            const environmentConfig = util_1.findByName(environments, environmentName);
            if (!environmentConfig) {
                throw new exceptions_1.ParameterError(`Project ${projectName} does not specify environment ${environmentName}`, {
                    projectName,
                    env,
                    definedEnvironments: util_1.getNames(environments),
                });
            }
            if (!environmentConfig.providers || environmentConfig.providers.length === 0) {
                throw new exceptions_1.ConfigurationError(`Environment '${environmentName}' does not specify any providers`, {
                    projectName,
                    env,
                    environmentConfig,
                });
            }
            if (namespace.startsWith("garden-")) {
                throw new exceptions_1.ParameterError(`Namespace cannot start with "garden-"`, {
                    environmentConfig,
                    namespace,
                });
            }
            const fixedProviders = plugins_1.fixedPlugins.map(name => ({ name }));
            const mergedProviders = lodash_1.merge(fixedProviders, lodash_1.keyBy(environmentDefaults.providers, "name"), lodash_1.keyBy(environmentConfig.providers, "name"));
            // Resolve the project configuration based on selected environment
            const environment = {
                name: environmentConfig.name,
                providers: Object.values(mergedProviders),
                variables: lodash_1.merge({}, environmentDefaults.variables, environmentConfig.variables),
            };
            const buildDir = yield build_dir_1.BuildDir.factory(projectRoot);
            // Register log writers
            if (logger) {
                for (const writerConfig of fileWriterConfigs) {
                    logger.writers.push(yield file_writer_1.FileWriter.factory(Object.assign({ level: logger.level, root: projectRoot }, writerConfig)));
                }
            }
            const garden = new Garden(projectRoot, projectName, environment, projectSources, buildDir, logger);
            // Register plugins
            for (const [name, pluginFactory] of Object.entries(Object.assign({}, plugins_1.builtinPlugins, plugins))) {
                garden.registerPlugin(name, pluginFactory);
            }
            // Load configured plugins
            // Validate configuration
            for (const provider of environment.providers) {
                yield garden.loadPlugin(provider.name, provider);
            }
            return garden;
        });
    }
    getPluginContext(providerName) {
        return plugin_context_1.createPluginContext(this, providerName);
    }
    clearBuilds() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.buildDir.clear();
        });
    }
    addTask(task) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.taskGraph.addTask(task);
        });
    }
    processTasks() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.taskGraph.processTasks();
        });
    }
    registerPlugin(name, moduleOrFactory) {
        let factory;
        if (typeof moduleOrFactory === "function") {
            factory = moduleOrFactory;
        }
        else if (lodash_1.isString(moduleOrFactory)) {
            let moduleNameOrLocation = moduleOrFactory;
            const parsedLocation = path_1.parse(moduleNameOrLocation);
            // allow relative references to project root
            if (path_1.parse(moduleNameOrLocation).dir !== "") {
                console.log(this.projectRoot);
                console.log(moduleNameOrLocation);
                moduleNameOrLocation = path_1.resolve(this.projectRoot, moduleNameOrLocation);
            }
            let pluginModule;
            try {
                pluginModule = require(moduleNameOrLocation);
            }
            catch (error) {
                throw new exceptions_1.ConfigurationError(`Unable to load plugin "${moduleNameOrLocation}" (could not load module: ${error.message})`, {
                    message: error.message,
                    moduleNameOrLocation,
                });
            }
            try {
                pluginModule = common_1.validate(pluginModule, plugin_1.pluginModuleSchema, { context: `plugin module "${moduleNameOrLocation}"` });
                if (pluginModule.name) {
                    name = pluginModule.name;
                }
                else {
                    if (parsedLocation.name === "index") {
                        // use parent directory name
                        name = parsedLocation.dir.split(path_1.sep).slice(-1)[0];
                    }
                    else {
                        name = parsedLocation.name;
                    }
                }
                common_1.validate(name, common_1.joiIdentifier(), { context: `name of plugin "${moduleNameOrLocation}"` });
            }
            catch (err) {
                throw new exceptions_1.PluginError(`Unable to load plugin: ${err}`, {
                    moduleNameOrLocation,
                    err,
                });
            }
            factory = pluginModule.gardenPlugin;
        }
        else {
            throw new TypeError(`Expected plugin factory function, module name or module path`);
        }
        this.registeredPlugins[name] = factory;
    }
    loadPlugin(pluginName, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const factory = this.registeredPlugins[pluginName];
            if (!factory) {
                throw new exceptions_1.ConfigurationError(`Configured plugin '${pluginName}' has not been registered`, {
                    name: pluginName,
                    availablePlugins: Object.keys(this.registeredPlugins),
                });
            }
            let plugin;
            try {
                plugin = yield factory({
                    projectName: this.projectName,
                    config,
                    logEntry: this.log,
                });
            }
            catch (error) {
                throw new exceptions_1.PluginError(`Unexpected error when loading plugin "${pluginName}": ${error}`, {
                    pluginName,
                    error,
                });
            }
            plugin = common_1.validate(plugin, plugin_1.pluginSchema, { context: `plugin "${pluginName}"` });
            this.loadedPlugins[pluginName] = plugin;
            // allow plugins to extend their own config (that gets passed to action handlers)
            const providerConfig = util_1.findByName(this.environment.providers, pluginName);
            if (providerConfig) {
                lodash_1.extend(providerConfig, plugin.config, config);
            }
            else {
                this.environment.providers.push(lodash_1.extend({ name: pluginName }, plugin.config, config));
            }
            for (const modulePath of plugin.modules || []) {
                let moduleConfig = yield this.resolveModule(modulePath);
                if (!moduleConfig) {
                    throw new exceptions_1.PluginError(`Could not load module "${modulePath}" specified in plugin "${pluginName}"`, {
                        pluginName,
                        modulePath,
                    });
                }
                moduleConfig.plugin = pluginName;
                yield this.addModule(moduleConfig);
            }
            const actions = plugin.actions || {};
            for (const actionType of plugin_2.pluginActionNames) {
                const handler = actions[actionType];
                handler && this.addActionHandler(pluginName, actionType, handler);
            }
            const moduleActions = plugin.moduleActions || {};
            for (const moduleType of Object.keys(moduleActions)) {
                for (const actionType of plugin_1.moduleActionNames) {
                    const handler = moduleActions[moduleType][actionType];
                    handler && this.addModuleActionHandler(pluginName, actionType, moduleType, handler);
                }
            }
        });
    }
    getPlugin(pluginName) {
        const plugin = this.loadedPlugins[pluginName];
        if (!plugin) {
            throw new exceptions_1.PluginError(`Could not find plugin ${pluginName}. Are you missing a provider configuration?`, {
                pluginName,
                availablePlugins: Object.keys(this.loadedPlugins),
            });
        }
        return plugin;
    }
    addActionHandler(pluginName, actionType, handler) {
        const plugin = this.getPlugin(pluginName);
        const schema = plugin_1.pluginActionDescriptions[actionType].resultSchema;
        const wrapped = (...args) => __awaiter(this, void 0, void 0, function* () {
            const result = yield handler.apply(plugin, args);
            return common_1.validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` });
        });
        wrapped["actionType"] = actionType;
        wrapped["pluginName"] = pluginName;
        this.actionHandlers[actionType][pluginName] = wrapped;
    }
    addModuleActionHandler(pluginName, actionType, moduleType, handler) {
        const plugin = this.getPlugin(pluginName);
        const schema = plugin_1.moduleActionDescriptions[actionType].resultSchema;
        const wrapped = (...args) => __awaiter(this, void 0, void 0, function* () {
            const result = yield handler.apply(plugin, args);
            return common_1.validate(result, schema, { context: `${actionType} output from plugin ${pluginName}` });
        });
        wrapped["actionType"] = actionType;
        wrapped["pluginName"] = pluginName;
        wrapped["moduleType"] = moduleType;
        if (!this.moduleActionHandlers[actionType]) {
            this.moduleActionHandlers[actionType] = {};
        }
        if (!this.moduleActionHandlers[actionType][moduleType]) {
            this.moduleActionHandlers[actionType][moduleType] = {};
        }
        this.moduleActionHandlers[actionType][moduleType][pluginName] = wrapped;
    }
    /*
      Returns all modules that are registered in this context.
      Scans for modules in the project root if it hasn't already been done.
     */
    getModules(names, noScan) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.modulesScanned && !noScan) {
                yield this.scanModules();
            }
            let configs;
            if (!!names) {
                configs = [];
                const missing = [];
                for (const name of names) {
                    const module = this.moduleConfigs[name];
                    if (!module) {
                        missing.push(name);
                    }
                    else {
                        configs.push(module);
                    }
                }
                if (missing.length) {
                    throw new exceptions_1.ParameterError(`Could not find module(s): ${missing.join(", ")}`, {
                        missing,
                        available: Object.keys(this.moduleConfigs),
                    });
                }
            }
            else {
                configs = Object.values(this.moduleConfigs);
            }
            return Bluebird.map(configs, config => module_1.moduleFromConfig(this, config));
        });
    }
    /**
     * Returns the module with the specified name. Throws error if it doesn't exist.
     */
    getModule(name, noScan) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getModules([name], noScan))[0];
        });
    }
    /**
     * Given the provided lists of build and service dependencies, return a list of all modules
     * required to satisfy those dependencies.
     */
    resolveModuleDependencies(buildDependencies, serviceDependencies) {
        return __awaiter(this, void 0, void 0, function* () {
            const buildDeps = yield Bluebird.map(buildDependencies, (dep) => __awaiter(this, void 0, void 0, function* () {
                const moduleKey = module_1.getModuleKey(dep.name, dep.plugin);
                const module = yield this.getModule(moduleKey);
                return [module].concat(yield this.resolveModuleDependencies(module.build.dependencies, []));
            }));
            const runtimeDeps = yield Bluebird.map(serviceDependencies, (serviceName) => __awaiter(this, void 0, void 0, function* () {
                const service = yield this.getService(serviceName);
                return this.resolveModuleDependencies([{ name: service.module.name, copy: [] }], service.config.dependencies || []);
            }));
            const deps = lodash_1.flatten(buildDeps).concat(lodash_1.flatten(runtimeDeps));
            return lodash_1.sortBy(lodash_1.uniqBy(deps, "name"), "name");
        });
    }
    /**
     * Given a module, and a list of dependencies, resolve the version for that combination of modules.
     * The combined version is a either the latest dirty module version (if any), or the hash of the module version
     * and the versions of its dependencies (in sorted order).
     */
    resolveVersion(moduleName, moduleDependencies, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = this.moduleConfigs[moduleName];
            const cacheKey = ["moduleVersions", moduleName];
            if (!force) {
                const cached = this.cache.get(cacheKey);
                if (cached) {
                    return cached;
                }
            }
            const dependencyKeys = moduleDependencies.map(dep => module_1.getModuleKey(dep.name, dep.plugin));
            const dependencies = Object.values(util_1.pickKeys(this.moduleConfigs, dependencyKeys, "module config"));
            const cacheContexts = dependencies.concat([config]).map(c => module_1.getModuleCacheContext(c));
            const version = yield this.vcs.resolveVersion(config, dependencies);
            this.cache.set(cacheKey, version, ...cacheContexts);
            return version;
        });
    }
    /*
      Returns all services that are registered in this context, or the ones specified.
      Scans for modules and services in the project root if it hasn't already been done.
     */
    getServices(names, noScan) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.modulesScanned && !noScan) {
                yield this.scanModules();
            }
            const picked = names ? util_1.pickKeys(this.serviceNameIndex, names, "service") : this.serviceNameIndex;
            return Bluebird.map(Object.entries(picked), ([serviceName, moduleName]) => __awaiter(this, void 0, void 0, function* () {
                const module = yield this.getModule(moduleName);
                const config = util_1.findByName(module.serviceConfigs, serviceName);
                return {
                    name: serviceName,
                    config,
                    module,
                    spec: config.spec,
                };
            }));
        });
    }
    /**
     * Returns the service with the specified name. Throws error if it doesn't exist.
     */
    getService(name, noScan) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.getServices([name], noScan))[0];
        });
    }
    /*
      Scans the project root for modules and adds them to the context.
     */
    scanModules(force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return scanLock.acquire("scan-modules", () => __awaiter(this, void 0, void 0, function* () {
                if (this.modulesScanned && !force) {
                    return;
                }
                let extSourcePaths = [];
                // Add external sources that are defined at the project level. External sources are either kept in
                // the .garden/sources dir (and cloned there if needed), or they're linked to a local path via the link command.
                for (const { name, repositoryUrl } of this.projectSources) {
                    const path = yield this.loadExtSourcePath({ name, repositoryUrl, sourceType: "project" });
                    extSourcePaths.push(path);
                }
                const dirsToScan = [this.projectRoot, ...extSourcePaths];
                const modulePaths = lodash_1.flatten(yield Bluebird.map(dirsToScan, (dir) => __awaiter(this, void 0, void 0, function* () {
                    var e_1, _a;
                    const ignorer = yield util_1.getIgnorer(dir);
                    const scanOpts = {
                        filter: (path) => {
                            const relPath = path_1.relative(this.projectRoot, path);
                            return !ignorer.ignores(relPath);
                        },
                    };
                    const paths = [];
                    try {
                        for (var _b = __asyncValues(util_1.scanDirectory(dir, scanOpts)), _c; _c = yield _b.next(), !_c.done;) {
                            const item = _c.value;
                            if (!item) {
                                continue;
                            }
                            const parsedPath = path_1.parse(item.path);
                            if (parsedPath.base !== constants_1.MODULE_CONFIG_FILENAME) {
                                continue;
                            }
                            paths.push(parsedPath.dir);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                    return paths;
                }))).filter(Boolean);
                yield Bluebird.map(modulePaths, (path) => __awaiter(this, void 0, void 0, function* () {
                    const config = yield this.resolveModule(path);
                    config && (yield this.addModule(config));
                }));
                this.modulesScanned = true;
                yield this.detectCircularDependencies();
                const moduleConfigContext = new config_context_1.ModuleConfigContext(this, this.environment, Object.values(this.moduleConfigs));
                this.moduleConfigs = yield template_string_1.resolveTemplateStrings(this.moduleConfigs, moduleConfigContext);
            }));
        });
    }
    detectCircularDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            const modules = yield this.getModules();
            const services = yield this.getServices();
            return detectCycles_1.detectCircularDependencies(modules, services);
        });
    }
    /*
      Adds the specified module to the context
  
      @param force - add the module again, even if it's already registered
     */
    addModule(config, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const validateHandler = yield this.getModuleActionHandler({ actionType: "validate", moduleType: config.type });
            const ctx = this.getPluginContext(validateHandler["pluginName"]);
            config = yield validateHandler({ ctx, moduleConfig: config });
            // FIXME: this is rather clumsy
            config.name = module_1.getModuleKey(config.name, config.plugin);
            if (!force && this.moduleConfigs[config.name]) {
                const pathA = path_1.relative(this.projectRoot, this.moduleConfigs[config.name].path);
                const pathB = path_1.relative(this.projectRoot, config.path);
                throw new exceptions_1.ConfigurationError(`Module ${config.name} is declared multiple times ('${pathA}' and '${pathB}')`, { pathA, pathB });
            }
            this.moduleConfigs[config.name] = config;
            // Add to service-module map
            for (const serviceConfig of config.serviceConfigs) {
                const serviceName = serviceConfig.name;
                if (!force && this.serviceNameIndex[serviceName]) {
                    throw new exceptions_1.ConfigurationError(`Service names must be unique - ${serviceName} is declared multiple times ` +
                        `(in '${this.serviceNameIndex[serviceName]}' and '${config.name}')`, {
                        serviceName,
                        moduleA: this.serviceNameIndex[serviceName],
                        moduleB: config.name,
                    });
                }
                this.serviceNameIndex[serviceName] = config.name;
            }
            if (this.modulesScanned) {
                // need to re-run this if adding modules after initial scan
                yield this.detectCircularDependencies();
            }
        });
    }
    /*
      Maps the provided name or locator to a Module. We first look for a module in the
      project with the provided name. If it does not exist, we treat it as a path
      (resolved with the project path as a base path) and attempt to load the module
      from there.
     */
    resolveModule(nameOrLocation) {
        return __awaiter(this, void 0, void 0, function* () {
            const parsedPath = path_1.parse(nameOrLocation);
            if (parsedPath.dir === "") {
                // Looks like a name
                const existingModule = this.moduleConfigs[nameOrLocation];
                if (!existingModule) {
                    throw new exceptions_1.ConfigurationError(`Module ${nameOrLocation} could not be found`, {
                        name: nameOrLocation,
                    });
                }
                return existingModule;
            }
            // Looks like a path
            const path = path_1.resolve(this.projectRoot, nameOrLocation);
            const config = yield base_1.loadConfig(this.projectRoot, path);
            if (!config || !config.module) {
                return null;
            }
            const moduleConfig = lodash_1.cloneDeep(config.module);
            if (moduleConfig.repositoryUrl) {
                moduleConfig.path = yield this.loadExtSourcePath({
                    name: moduleConfig.name,
                    repositoryUrl: moduleConfig.repositoryUrl,
                    sourceType: "module",
                });
            }
            return moduleConfig;
        });
    }
    //===========================================================================
    //region Internal helpers
    //===========================================================================
    /**
     * Clones the project/module source if needed and returns the path (either from .garden/sources or from a local path)
     */
    loadExtSourcePath({ name, repositoryUrl, sourceType }) {
        return __awaiter(this, void 0, void 0, function* () {
            const linkedSources = yield ext_source_util_1.getLinkedSources(this, sourceType);
            const linked = util_1.findByName(linkedSources, name);
            if (linked) {
                return linked.path;
            }
            const path = yield this.vcs.ensureRemoteSource({ name, sourceType, url: repositoryUrl, logEntry: this.log });
            return path;
        });
    }
    /**
     * Get a handler for the specified action.
     */
    getActionHandlers(actionType, pluginName) {
        return this.filterActionHandlers(this.actionHandlers[actionType], pluginName);
    }
    /**
     * Get a handler for the specified module action.
     */
    getModuleActionHandlers({ actionType, moduleType, pluginName }) {
        return this.filterActionHandlers((this.moduleActionHandlers[actionType] || {})[moduleType], pluginName);
    }
    filterActionHandlers(handlers, pluginName) {
        // make sure plugin is loaded
        if (!!pluginName) {
            this.getPlugin(pluginName);
        }
        if (handlers === undefined) {
            handlers = {};
        }
        return !pluginName ? handlers : lodash_1.pickBy(handlers, (handler) => handler["pluginName"] === pluginName);
    }
    /**
     * Get the last configured handler for the specified action (and optionally module type).
     */
    getActionHandler({ actionType, pluginName, defaultHandler }) {
        const handlers = Object.values(this.getActionHandlers(actionType, pluginName));
        if (handlers.length) {
            return handlers[handlers.length - 1];
        }
        else if (defaultHandler) {
            defaultHandler["pluginName"] = project_1.defaultProvider.name;
            return defaultHandler;
        }
        const errorDetails = {
            requestedHandlerType: actionType,
            environment: this.environment.name,
            pluginName,
        };
        if (pluginName) {
            throw new exceptions_1.PluginError(`Plugin '${pluginName}' does not have a '${actionType}' handler.`, errorDetails);
        }
        else {
            throw new exceptions_1.ParameterError(`No '${actionType}' handler configured in environment '${this.environment.name}'. ` +
                `Are you missing a provider configuration?`, errorDetails);
        }
    }
    /**
     * Get the last configured handler for the specified action.
     */
    getModuleActionHandler({ actionType, moduleType, pluginName, defaultHandler }) {
        const handlers = Object.values(this.getModuleActionHandlers({ actionType, moduleType, pluginName }));
        if (handlers.length) {
            return handlers[handlers.length - 1];
        }
        else if (defaultHandler) {
            defaultHandler["pluginName"] = project_1.defaultProvider.name;
            return defaultHandler;
        }
        const errorDetails = {
            requestedHandlerType: actionType,
            requestedModuleType: moduleType,
            environment: this.environment.name,
            pluginName,
        };
        if (pluginName) {
            throw new exceptions_1.PluginError(`Plugin '${pluginName}' does not have a '${actionType}' handler for module type '${moduleType}'.`, errorDetails);
        }
        else {
            throw new exceptions_1.ParameterError(`No '${actionType}' handler configured for module type '${moduleType}' in environment ` +
                `'${this.environment.name}'. Are you missing a provider configuration?`, errorDetails);
        }
    }
}
exports.Garden = Garden;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyx1QkFBdUIsQ0FBQyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFBO1FBRXBHLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRTtZQUNuQixPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO1NBQ3JDO2FBQU0sSUFBSSxjQUFjLEVBQUU7WUFDekIsY0FBYyxDQUFDLFlBQVksQ0FBQyxHQUFHLHlCQUFlLENBQUMsSUFBSSxDQUFBO1lBQ25ELE9BQU8sY0FBYyxDQUFBO1NBQ3RCO1FBRUQsTUFBTSxZQUFZLEdBQUc7WUFDbkIsb0JBQW9CLEVBQUUsVUFBVTtZQUNoQyxtQkFBbUIsRUFBRSxVQUFVO1lBQy9CLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUk7WUFDbEMsVUFBVTtTQUNYLENBQUE7UUFFRCxJQUFJLFVBQVUsRUFBRTtZQUNkLE1BQU0sSUFBSSx3QkFBVyxDQUNuQixXQUFXLFVBQVUsc0JBQXNCLFVBQVUsOEJBQThCLFVBQVUsSUFBSSxFQUNqRyxZQUFZLENBQ2IsQ0FBQTtTQUNGO2FBQU07WUFDTCxNQUFNLElBQUksMkJBQWMsQ0FDdEIsT0FBTyxVQUFVLHlDQUF5QyxVQUFVLG1CQUFtQjtnQkFDdkYsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksOENBQThDLEVBQ3ZFLFlBQVksQ0FDYixDQUFBO1NBQ0Y7SUFDSCxDQUFDO0NBR0Y7QUFoeEJELHdCQWd4QkMiLCJmaWxlIjoiZ2FyZGVuLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCBCbHVlYmlyZCA9IHJlcXVpcmUoXCJibHVlYmlyZFwiKVxuaW1wb3J0IHtcbiAgcGFyc2UsXG4gIHJlbGF0aXZlLFxuICByZXNvbHZlLFxuICBzZXAsXG59IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7XG4gIGV4dGVuZCxcbiAgZmxhdHRlbixcbiAgaXNTdHJpbmcsXG4gIGZyb21QYWlycyxcbiAgbWVyZ2UsXG4gIGtleUJ5LFxuICBjbG9uZURlZXAsXG4gIHBpY2tCeSxcbiAgc29ydEJ5LFxuICB1bmlxQnksXG59IGZyb20gXCJsb2Rhc2hcIlxuY29uc3QgQXN5bmNMb2NrID0gcmVxdWlyZShcImFzeW5jLWxvY2tcIilcblxuaW1wb3J0IHsgVHJlZUNhY2hlIH0gZnJvbSBcIi4vY2FjaGVcIlxuaW1wb3J0IHtcbiAgYnVpbHRpblBsdWdpbnMsXG4gIGZpeGVkUGx1Z2lucyxcbn0gZnJvbSBcIi4vcGx1Z2lucy9wbHVnaW5zXCJcbmltcG9ydCB7IE1vZHVsZSwgbW9kdWxlRnJvbUNvbmZpZywgZ2V0TW9kdWxlQ2FjaGVDb250ZXh0LCBnZXRNb2R1bGVLZXksIE1vZHVsZUNvbmZpZ01hcCB9IGZyb20gXCIuL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQge1xuICBtb2R1bGVBY3Rpb25EZXNjcmlwdGlvbnMsXG4gIG1vZHVsZUFjdGlvbk5hbWVzLFxuICBwbHVnaW5BY3Rpb25EZXNjcmlwdGlvbnMsXG4gIHBsdWdpbk1vZHVsZVNjaGVtYSxcbiAgcGx1Z2luU2NoZW1hLFxufSBmcm9tIFwiLi90eXBlcy9wbHVnaW4vcGx1Z2luXCJcbmltcG9ydCB7IEVudmlyb25tZW50LCBTb3VyY2VDb25maWcsIGRlZmF1bHRQcm92aWRlciB9IGZyb20gXCIuL2NvbmZpZy9wcm9qZWN0XCJcbmltcG9ydCB7XG4gIGZpbmRCeU5hbWUsXG4gIGdldElnbm9yZXIsXG4gIGdldE5hbWVzLFxuICBzY2FuRGlyZWN0b3J5LFxuICBwaWNrS2V5cyxcbn0gZnJvbSBcIi4vdXRpbC91dGlsXCJcbmltcG9ydCB7XG4gIERFRkFVTFRfTkFNRVNQQUNFLFxuICBNT0RVTEVfQ09ORklHX0ZJTEVOQU1FLFxuICBFUlJPUl9MT0dfRklMRU5BTUUsXG59IGZyb20gXCIuL2NvbnN0YW50c1wiXG5pbXBvcnQge1xuICBDb25maWd1cmF0aW9uRXJyb3IsXG4gIFBhcmFtZXRlckVycm9yLFxuICBQbHVnaW5FcnJvcixcbn0gZnJvbSBcIi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBWY3NIYW5kbGVyLCBNb2R1bGVWZXJzaW9uIH0gZnJvbSBcIi4vdmNzL2Jhc2VcIlxuaW1wb3J0IHsgR2l0SGFuZGxlciB9IGZyb20gXCIuL3Zjcy9naXRcIlxuaW1wb3J0IHsgQnVpbGREaXIgfSBmcm9tIFwiLi9idWlsZC1kaXJcIlxuaW1wb3J0IHtcbiAgVGFza0dyYXBoLFxuICBUYXNrUmVzdWx0cyxcbn0gZnJvbSBcIi4vdGFzay1ncmFwaFwiXG5pbXBvcnQge1xuICBnZXRMb2dnZXIsXG4gIExvZ2dlcixcbn0gZnJvbSBcIi4vbG9nZ2VyL2xvZ2dlclwiXG5pbXBvcnQge1xuICBwbHVnaW5BY3Rpb25OYW1lcyxcbiAgUGx1Z2luQWN0aW9ucyxcbiAgUGx1Z2luRmFjdG9yeSxcbiAgR2FyZGVuUGx1Z2luLFxuICBNb2R1bGVBY3Rpb25zLFxufSBmcm9tIFwiLi90eXBlcy9wbHVnaW4vcGx1Z2luXCJcbmltcG9ydCB7IGpvaUlkZW50aWZpZXIsIHZhbGlkYXRlIH0gZnJvbSBcIi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBTZXJ2aWNlIH0gZnJvbSBcIi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyByZXNvbHZlVGVtcGxhdGVTdHJpbmdzIH0gZnJvbSBcIi4vdGVtcGxhdGUtc3RyaW5nXCJcbmltcG9ydCB7XG4gIGNvbmZpZ1NjaGVtYSxcbiAgR2FyZGVuQ29uZmlnLFxuICBsb2FkQ29uZmlnLFxuICBmaW5kUHJvamVjdENvbmZpZyxcbn0gZnJvbSBcIi4vY29uZmlnL2Jhc2VcIlxuaW1wb3J0IHsgVGFzayB9IGZyb20gXCIuL3Rhc2tzL2Jhc2VcIlxuaW1wb3J0IHsgTG9jYWxDb25maWdTdG9yZSB9IGZyb20gXCIuL2NvbmZpZy1zdG9yZVwiXG5pbXBvcnQgeyBkZXRlY3RDaXJjdWxhckRlcGVuZGVuY2llcyB9IGZyb20gXCIuL3V0aWwvZGV0ZWN0Q3ljbGVzXCJcbmltcG9ydCB7XG4gIGdldExpbmtlZFNvdXJjZXMsXG4gIEV4dGVybmFsU291cmNlVHlwZSxcbn0gZnJvbSBcIi4vdXRpbC9leHQtc291cmNlLXV0aWxcIlxuaW1wb3J0IHsgQnVpbGREZXBlbmRlbmN5Q29uZmlnLCBNb2R1bGVDb25maWcgfSBmcm9tIFwiLi9jb25maWcvbW9kdWxlXCJcbmltcG9ydCB7IFByb2plY3RDb25maWdDb250ZXh0LCBNb2R1bGVDb25maWdDb250ZXh0IH0gZnJvbSBcIi4vY29uZmlnL2NvbmZpZy1jb250ZXh0XCJcbmltcG9ydCB7IEZpbGVXcml0ZXIgfSBmcm9tIFwiLi9sb2dnZXIvd3JpdGVycy9maWxlLXdyaXRlclwiXG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gXCIuL2xvZ2dlci9sb2ctbm9kZVwiXG5pbXBvcnQgeyBBY3Rpb25IZWxwZXIgfSBmcm9tIFwiLi9hY3Rpb25zXCJcbmltcG9ydCB7IGNyZWF0ZVBsdWdpbkNvbnRleHQgfSBmcm9tIFwiLi9wbHVnaW4tY29udGV4dFwiXG5pbXBvcnQgeyBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9ucywgUGx1Z2lucywgUmVnaXN0ZXJQbHVnaW5QYXJhbSB9IGZyb20gXCIuL3R5cGVzL3BsdWdpbi9wbHVnaW5cIlxuXG5leHBvcnQgaW50ZXJmYWNlIEFjdGlvbkhhbmRsZXJNYXA8VCBleHRlbmRzIGtleW9mIFBsdWdpbkFjdGlvbnM+IHtcbiAgW2FjdGlvbk5hbWU6IHN0cmluZ106IFBsdWdpbkFjdGlvbnNbVF1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBNb2R1bGVBY3Rpb25IYW5kbGVyTWFwPFQgZXh0ZW5kcyBrZXlvZiBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9ucz4ge1xuICBbYWN0aW9uTmFtZTogc3RyaW5nXTogTW9kdWxlQW5kU2VydmljZUFjdGlvbnNbVF1cbn1cblxuZXhwb3J0IHR5cGUgUGx1Z2luQWN0aW9uTWFwID0ge1xuICBbQSBpbiBrZXlvZiBQbHVnaW5BY3Rpb25zXToge1xuICAgIFtwbHVnaW5OYW1lOiBzdHJpbmddOiBQbHVnaW5BY3Rpb25zW0FdLFxuICB9XG59XG5cbmV4cG9ydCB0eXBlIE1vZHVsZUFjdGlvbk1hcCA9IHtcbiAgW0EgaW4ga2V5b2YgTW9kdWxlQW5kU2VydmljZUFjdGlvbnNdOiB7XG4gICAgW21vZHVsZVR5cGU6IHN0cmluZ106IHtcbiAgICAgIFtwbHVnaW5OYW1lOiBzdHJpbmddOiBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9uc1tBXSxcbiAgICB9LFxuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dE9wdHMge1xuICBjb25maWc/OiBHYXJkZW5Db25maWcsXG4gIGVudj86IHN0cmluZyxcbiAgbG9nZ2VyPzogTG9nZ2VyLFxuICBwbHVnaW5zPzogUGx1Z2lucyxcbn1cblxuY29uc3Qgc2NhbkxvY2sgPSBuZXcgQXN5bmNMb2NrKClcblxuY29uc3QgZmlsZVdyaXRlckNvbmZpZ3MgPSBbXG4gIHsgZmlsZW5hbWU6IFwiZGV2ZWxvcG1lbnQubG9nXCIgfSxcbiAgeyBmaWxlbmFtZTogRVJST1JfTE9HX0ZJTEVOQU1FLCBsZXZlbDogTG9nTGV2ZWwuZXJyb3IgfSxcbiAgeyBmaWxlbmFtZTogRVJST1JfTE9HX0ZJTEVOQU1FLCBsZXZlbDogTG9nTGV2ZWwuZXJyb3IsIHBhdGg6IFwiLlwiLCB0cnVuY2F0ZVByZXZpb3VzOiB0cnVlIH0sXG5dXG5cbmV4cG9ydCBjbGFzcyBHYXJkZW4ge1xuICBwdWJsaWMgcmVhZG9ubHkgbG9nOiBMb2dnZXJcbiAgcHVibGljIHJlYWRvbmx5IGFjdGlvbkhhbmRsZXJzOiBQbHVnaW5BY3Rpb25NYXBcbiAgcHVibGljIHJlYWRvbmx5IG1vZHVsZUFjdGlvbkhhbmRsZXJzOiBNb2R1bGVBY3Rpb25NYXBcblxuICBwcml2YXRlIHJlYWRvbmx5IGxvYWRlZFBsdWdpbnM6IHsgW2tleTogc3RyaW5nXTogR2FyZGVuUGx1Z2luIH1cbiAgcHJpdmF0ZSBtb2R1bGVDb25maWdzOiBNb2R1bGVDb25maWdNYXBcbiAgcHJpdmF0ZSBtb2R1bGVzU2Nhbm5lZDogYm9vbGVhblxuICBwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdGVyZWRQbHVnaW5zOiB7IFtrZXk6IHN0cmluZ106IFBsdWdpbkZhY3RvcnkgfVxuICBwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2VOYW1lSW5kZXg6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH1cbiAgcHJpdmF0ZSByZWFkb25seSB0YXNrR3JhcGg6IFRhc2tHcmFwaFxuXG4gIHB1YmxpYyByZWFkb25seSBsb2NhbENvbmZpZ1N0b3JlOiBMb2NhbENvbmZpZ1N0b3JlXG4gIHB1YmxpYyByZWFkb25seSB2Y3M6IFZjc0hhbmRsZXJcbiAgcHVibGljIHJlYWRvbmx5IGNhY2hlOiBUcmVlQ2FjaGVcbiAgcHVibGljIHJlYWRvbmx5IGFjdGlvbnM6IEFjdGlvbkhlbHBlclxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHB1YmxpYyByZWFkb25seSBwcm9qZWN0Um9vdDogc3RyaW5nLFxuICAgIHB1YmxpYyByZWFkb25seSBwcm9qZWN0TmFtZTogc3RyaW5nLFxuICAgIHB1YmxpYyByZWFkb25seSBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQsXG4gICAgcHVibGljIHJlYWRvbmx5IHByb2plY3RTb3VyY2VzOiBTb3VyY2VDb25maWdbXSA9IFtdLFxuICAgIHB1YmxpYyByZWFkb25seSBidWlsZERpcjogQnVpbGREaXIsXG4gICAgbG9nZ2VyPzogTG9nZ2VyLFxuICApIHtcbiAgICB0aGlzLm1vZHVsZXNTY2FubmVkID0gZmFsc2VcbiAgICB0aGlzLmxvZyA9IGxvZ2dlciB8fCBnZXRMb2dnZXIoKVxuICAgIC8vIFRPRE86IFN1cHBvcnQgb3RoZXIgVkNTIG9wdGlvbnMuXG4gICAgdGhpcy52Y3MgPSBuZXcgR2l0SGFuZGxlcih0aGlzLnByb2plY3RSb290KVxuICAgIHRoaXMubG9jYWxDb25maWdTdG9yZSA9IG5ldyBMb2NhbENvbmZpZ1N0b3JlKHRoaXMucHJvamVjdFJvb3QpXG4gICAgdGhpcy5jYWNoZSA9IG5ldyBUcmVlQ2FjaGUoKVxuXG4gICAgdGhpcy5tb2R1bGVDb25maWdzID0ge31cbiAgICB0aGlzLnNlcnZpY2VOYW1lSW5kZXggPSB7fVxuICAgIHRoaXMubG9hZGVkUGx1Z2lucyA9IHt9XG4gICAgdGhpcy5yZWdpc3RlcmVkUGx1Z2lucyA9IHt9XG4gICAgdGhpcy5hY3Rpb25IYW5kbGVycyA9IDxQbHVnaW5BY3Rpb25NYXA+ZnJvbVBhaXJzKHBsdWdpbkFjdGlvbk5hbWVzLm1hcChuID0+IFtuLCB7fV0pKVxuICAgIHRoaXMubW9kdWxlQWN0aW9uSGFuZGxlcnMgPSA8TW9kdWxlQWN0aW9uTWFwPmZyb21QYWlycyhtb2R1bGVBY3Rpb25OYW1lcy5tYXAobiA9PiBbbiwge31dKSlcblxuICAgIHRoaXMudGFza0dyYXBoID0gbmV3IFRhc2tHcmFwaCh0aGlzKVxuICAgIHRoaXMuYWN0aW9ucyA9IG5ldyBBY3Rpb25IZWxwZXIodGhpcylcbiAgfVxuXG4gIHN0YXRpYyBhc3luYyBmYWN0b3J5KGN1cnJlbnREaXJlY3Rvcnk6IHN0cmluZywgeyBlbnYsIGNvbmZpZywgbG9nZ2VyLCBwbHVnaW5zID0ge30gfTogQ29udGV4dE9wdHMgPSB7fSkge1xuICAgIGxldCBwYXJzZWRDb25maWc6IEdhcmRlbkNvbmZpZ1xuXG4gICAgaWYgKGNvbmZpZykge1xuICAgICAgcGFyc2VkQ29uZmlnID0gPEdhcmRlbkNvbmZpZz52YWxpZGF0ZShjb25maWcsIGNvbmZpZ1NjaGVtYSwgeyBjb250ZXh0OiBcInJvb3QgY29uZmlndXJhdGlvblwiIH0pXG5cbiAgICAgIGlmICghcGFyc2VkQ29uZmlnLnByb2plY3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihgU3VwcGxpZWQgY29uZmlnIGRvZXMgbm90IGNvbnRhaW4gYSBwcm9qZWN0IGNvbmZpZ3VyYXRpb25gLCB7XG4gICAgICAgICAgY3VycmVudERpcmVjdG9yeSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbmZpZyA9IGF3YWl0IGZpbmRQcm9qZWN0Q29uZmlnKGN1cnJlbnREaXJlY3RvcnkpXG5cbiAgICAgIGlmICghY29uZmlnIHx8ICFjb25maWcucHJvamVjdCkge1xuICAgICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgICAgIGBOb3QgYSBwcm9qZWN0IGRpcmVjdG9yeSAob3IgYW55IG9mIHRoZSBwYXJlbnQgZGlyZWN0b3JpZXMpOiAke2N1cnJlbnREaXJlY3Rvcnl9YCxcbiAgICAgICAgICB7IGN1cnJlbnREaXJlY3RvcnkgfSxcbiAgICAgICAgKVxuICAgICAgfVxuXG4gICAgICBwYXJzZWRDb25maWcgPSBhd2FpdCByZXNvbHZlVGVtcGxhdGVTdHJpbmdzKGNvbmZpZyEsIG5ldyBQcm9qZWN0Q29uZmlnQ29udGV4dCgpKVxuICAgIH1cblxuICAgIGNvbnN0IHByb2plY3RSb290ID0gcGFyc2VkQ29uZmlnLnBhdGhcblxuICAgIGNvbnN0IHtcbiAgICAgIGRlZmF1bHRFbnZpcm9ubWVudCxcbiAgICAgIGVudmlyb25tZW50cyxcbiAgICAgIG5hbWU6IHByb2plY3ROYW1lLFxuICAgICAgZW52aXJvbm1lbnREZWZhdWx0cyxcbiAgICAgIHNvdXJjZXM6IHByb2plY3RTb3VyY2VzLFxuICAgIH0gPSBwYXJzZWRDb25maWcucHJvamVjdCFcblxuICAgIGlmICghZW52KSB7XG4gICAgICBlbnYgPSBkZWZhdWx0RW52aXJvbm1lbnRcbiAgICB9XG5cbiAgICBjb25zdCBwYXJ0cyA9IGVudi5zcGxpdChcIi5cIilcbiAgICBjb25zdCBlbnZpcm9ubWVudE5hbWUgPSBwYXJ0c1swXVxuICAgIGNvbnN0IG5hbWVzcGFjZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oXCIuXCIpIHx8IERFRkFVTFRfTkFNRVNQQUNFXG5cbiAgICBjb25zdCBlbnZpcm9ubWVudENvbmZpZyA9IGZpbmRCeU5hbWUoZW52aXJvbm1lbnRzLCBlbnZpcm9ubWVudE5hbWUpXG5cbiAgICBpZiAoIWVudmlyb25tZW50Q29uZmlnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IoYFByb2plY3QgJHtwcm9qZWN0TmFtZX0gZG9lcyBub3Qgc3BlY2lmeSBlbnZpcm9ubWVudCAke2Vudmlyb25tZW50TmFtZX1gLCB7XG4gICAgICAgIHByb2plY3ROYW1lLFxuICAgICAgICBlbnYsXG4gICAgICAgIGRlZmluZWRFbnZpcm9ubWVudHM6IGdldE5hbWVzKGVudmlyb25tZW50cyksXG4gICAgICB9KVxuICAgIH1cblxuICAgIGlmICghZW52aXJvbm1lbnRDb25maWcucHJvdmlkZXJzIHx8IGVudmlyb25tZW50Q29uZmlnLnByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoYEVudmlyb25tZW50ICcke2Vudmlyb25tZW50TmFtZX0nIGRvZXMgbm90IHNwZWNpZnkgYW55IHByb3ZpZGVyc2AsIHtcbiAgICAgICAgcHJvamVjdE5hbWUsXG4gICAgICAgIGVudixcbiAgICAgICAgZW52aXJvbm1lbnRDb25maWcsXG4gICAgICB9KVxuICAgIH1cblxuICAgIGlmIChuYW1lc3BhY2Uuc3RhcnRzV2l0aChcImdhcmRlbi1cIikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJhbWV0ZXJFcnJvcihgTmFtZXNwYWNlIGNhbm5vdCBzdGFydCB3aXRoIFwiZ2FyZGVuLVwiYCwge1xuICAgICAgICBlbnZpcm9ubWVudENvbmZpZyxcbiAgICAgICAgbmFtZXNwYWNlLFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBjb25zdCBmaXhlZFByb3ZpZGVycyA9IGZpeGVkUGx1Z2lucy5tYXAobmFtZSA9PiAoeyBuYW1lIH0pKVxuXG4gICAgY29uc3QgbWVyZ2VkUHJvdmlkZXJzID0gbWVyZ2UoXG4gICAgICBmaXhlZFByb3ZpZGVycyxcbiAgICAgIGtleUJ5KGVudmlyb25tZW50RGVmYXVsdHMucHJvdmlkZXJzLCBcIm5hbWVcIiksXG4gICAgICBrZXlCeShlbnZpcm9ubWVudENvbmZpZy5wcm92aWRlcnMsIFwibmFtZVwiKSxcbiAgICApXG5cbiAgICAvLyBSZXNvbHZlIHRoZSBwcm9qZWN0IGNvbmZpZ3VyYXRpb24gYmFzZWQgb24gc2VsZWN0ZWQgZW52aXJvbm1lbnRcbiAgICBjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG4gICAgICBuYW1lOiBlbnZpcm9ubWVudENvbmZpZy5uYW1lLFxuICAgICAgcHJvdmlkZXJzOiBPYmplY3QudmFsdWVzKG1lcmdlZFByb3ZpZGVycyksXG4gICAgICB2YXJpYWJsZXM6IG1lcmdlKHt9LCBlbnZpcm9ubWVudERlZmF1bHRzLnZhcmlhYmxlcywgZW52aXJvbm1lbnRDb25maWcudmFyaWFibGVzKSxcbiAgICB9XG5cbiAgICBjb25zdCBidWlsZERpciA9IGF3YWl0IEJ1aWxkRGlyLmZhY3RvcnkocHJvamVjdFJvb3QpXG5cbiAgICAvLyBSZWdpc3RlciBsb2cgd3JpdGVyc1xuICAgIGlmIChsb2dnZXIpIHtcbiAgICAgIGZvciAoY29uc3Qgd3JpdGVyQ29uZmlnIG9mIGZpbGVXcml0ZXJDb25maWdzKSB7XG4gICAgICAgIGxvZ2dlci53cml0ZXJzLnB1c2goXG4gICAgICAgICAgYXdhaXQgRmlsZVdyaXRlci5mYWN0b3J5KHtcbiAgICAgICAgICAgIGxldmVsOiBsb2dnZXIubGV2ZWwsXG4gICAgICAgICAgICByb290OiBwcm9qZWN0Um9vdCxcbiAgICAgICAgICAgIC4uLndyaXRlckNvbmZpZyxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGdhcmRlbiA9IG5ldyBHYXJkZW4oXG4gICAgICBwcm9qZWN0Um9vdCxcbiAgICAgIHByb2plY3ROYW1lLFxuICAgICAgZW52aXJvbm1lbnQsXG4gICAgICBwcm9qZWN0U291cmNlcyxcbiAgICAgIGJ1aWxkRGlyLFxuICAgICAgbG9nZ2VyLFxuICAgIClcblxuICAgIC8vIFJlZ2lzdGVyIHBsdWdpbnNcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBwbHVnaW5GYWN0b3J5XSBvZiBPYmplY3QuZW50cmllcyh7IC4uLmJ1aWx0aW5QbHVnaW5zLCAuLi5wbHVnaW5zIH0pKSB7XG4gICAgICBnYXJkZW4ucmVnaXN0ZXJQbHVnaW4obmFtZSwgcGx1Z2luRmFjdG9yeSlcbiAgICB9XG5cbiAgICAvLyBMb2FkIGNvbmZpZ3VyZWQgcGx1Z2luc1xuICAgIC8vIFZhbGlkYXRlIGNvbmZpZ3VyYXRpb25cbiAgICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGVudmlyb25tZW50LnByb3ZpZGVycykge1xuICAgICAgYXdhaXQgZ2FyZGVuLmxvYWRQbHVnaW4ocHJvdmlkZXIubmFtZSwgcHJvdmlkZXIpXG4gICAgfVxuXG4gICAgcmV0dXJuIGdhcmRlblxuICB9XG5cbiAgZ2V0UGx1Z2luQ29udGV4dChwcm92aWRlck5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBjcmVhdGVQbHVnaW5Db250ZXh0KHRoaXMsIHByb3ZpZGVyTmFtZSlcbiAgfVxuXG4gIGFzeW5jIGNsZWFyQnVpbGRzKCkge1xuICAgIHJldHVybiB0aGlzLmJ1aWxkRGlyLmNsZWFyKClcbiAgfVxuXG4gIGFzeW5jIGFkZFRhc2sodGFzazogVGFzaykge1xuICAgIGF3YWl0IHRoaXMudGFza0dyYXBoLmFkZFRhc2sodGFzaylcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3NUYXNrcygpOiBQcm9taXNlPFRhc2tSZXN1bHRzPiB7XG4gICAgcmV0dXJuIHRoaXMudGFza0dyYXBoLnByb2Nlc3NUYXNrcygpXG4gIH1cblxuICBwcml2YXRlIHJlZ2lzdGVyUGx1Z2luKG5hbWU6IHN0cmluZywgbW9kdWxlT3JGYWN0b3J5OiBSZWdpc3RlclBsdWdpblBhcmFtKSB7XG4gICAgbGV0IGZhY3Rvcnk6IFBsdWdpbkZhY3RvcnlcblxuICAgIGlmICh0eXBlb2YgbW9kdWxlT3JGYWN0b3J5ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGZhY3RvcnkgPSBtb2R1bGVPckZhY3RvcnlcblxuICAgIH0gZWxzZSBpZiAoaXNTdHJpbmcobW9kdWxlT3JGYWN0b3J5KSkge1xuICAgICAgbGV0IG1vZHVsZU5hbWVPckxvY2F0aW9uID0gbW9kdWxlT3JGYWN0b3J5XG4gICAgICBjb25zdCBwYXJzZWRMb2NhdGlvbiA9IHBhcnNlKG1vZHVsZU5hbWVPckxvY2F0aW9uKVxuXG4gICAgICAvLyBhbGxvdyByZWxhdGl2ZSByZWZlcmVuY2VzIHRvIHByb2plY3Qgcm9vdFxuICAgICAgaWYgKHBhcnNlKG1vZHVsZU5hbWVPckxvY2F0aW9uKS5kaXIgIT09IFwiXCIpIHtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5wcm9qZWN0Um9vdClcbiAgICAgICAgY29uc29sZS5sb2cobW9kdWxlTmFtZU9yTG9jYXRpb24pXG4gICAgICAgIG1vZHVsZU5hbWVPckxvY2F0aW9uID0gcmVzb2x2ZSh0aGlzLnByb2plY3RSb290LCBtb2R1bGVOYW1lT3JMb2NhdGlvbilcbiAgICAgIH1cblxuICAgICAgbGV0IHBsdWdpbk1vZHVsZVxuXG4gICAgICB0cnkge1xuICAgICAgICBwbHVnaW5Nb2R1bGUgPSByZXF1aXJlKG1vZHVsZU5hbWVPckxvY2F0aW9uKVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgICBgVW5hYmxlIHRvIGxvYWQgcGx1Z2luIFwiJHttb2R1bGVOYW1lT3JMb2NhdGlvbn1cIiAoY291bGQgbm90IGxvYWQgbW9kdWxlOiAke2Vycm9yLm1lc3NhZ2V9KWAsIHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG4gICAgICAgICAgICBtb2R1bGVOYW1lT3JMb2NhdGlvbixcbiAgICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBwbHVnaW5Nb2R1bGUgPSB2YWxpZGF0ZShcbiAgICAgICAgICBwbHVnaW5Nb2R1bGUsXG4gICAgICAgICAgcGx1Z2luTW9kdWxlU2NoZW1hLFxuICAgICAgICAgIHsgY29udGV4dDogYHBsdWdpbiBtb2R1bGUgXCIke21vZHVsZU5hbWVPckxvY2F0aW9ufVwiYCB9LFxuICAgICAgICApXG5cbiAgICAgICAgaWYgKHBsdWdpbk1vZHVsZS5uYW1lKSB7XG4gICAgICAgICAgbmFtZSA9IHBsdWdpbk1vZHVsZS5uYW1lXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHBhcnNlZExvY2F0aW9uLm5hbWUgPT09IFwiaW5kZXhcIikge1xuICAgICAgICAgICAgLy8gdXNlIHBhcmVudCBkaXJlY3RvcnkgbmFtZVxuICAgICAgICAgICAgbmFtZSA9IHBhcnNlZExvY2F0aW9uLmRpci5zcGxpdChzZXApLnNsaWNlKC0xKVswXVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuYW1lID0gcGFyc2VkTG9jYXRpb24ubmFtZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhbGlkYXRlKG5hbWUsIGpvaUlkZW50aWZpZXIoKSwgeyBjb250ZXh0OiBgbmFtZSBvZiBwbHVnaW4gXCIke21vZHVsZU5hbWVPckxvY2F0aW9ufVwiYCB9KVxuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHRocm93IG5ldyBQbHVnaW5FcnJvcihgVW5hYmxlIHRvIGxvYWQgcGx1Z2luOiAke2Vycn1gLCB7XG4gICAgICAgICAgbW9kdWxlTmFtZU9yTG9jYXRpb24sXG4gICAgICAgICAgZXJyLFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBmYWN0b3J5ID0gcGx1Z2luTW9kdWxlLmdhcmRlblBsdWdpblxuXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYEV4cGVjdGVkIHBsdWdpbiBmYWN0b3J5IGZ1bmN0aW9uLCBtb2R1bGUgbmFtZSBvciBtb2R1bGUgcGF0aGApXG4gICAgfVxuXG4gICAgdGhpcy5yZWdpc3RlcmVkUGx1Z2luc1tuYW1lXSA9IGZhY3RvcnlcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbG9hZFBsdWdpbihwbHVnaW5OYW1lOiBzdHJpbmcsIGNvbmZpZzogb2JqZWN0KSB7XG4gICAgY29uc3QgZmFjdG9yeSA9IHRoaXMucmVnaXN0ZXJlZFBsdWdpbnNbcGx1Z2luTmFtZV1cblxuICAgIGlmICghZmFjdG9yeSkge1xuICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihgQ29uZmlndXJlZCBwbHVnaW4gJyR7cGx1Z2luTmFtZX0nIGhhcyBub3QgYmVlbiByZWdpc3RlcmVkYCwge1xuICAgICAgICBuYW1lOiBwbHVnaW5OYW1lLFxuICAgICAgICBhdmFpbGFibGVQbHVnaW5zOiBPYmplY3Qua2V5cyh0aGlzLnJlZ2lzdGVyZWRQbHVnaW5zKSxcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgbGV0IHBsdWdpblxuXG4gICAgdHJ5IHtcbiAgICAgIHBsdWdpbiA9IGF3YWl0IGZhY3Rvcnkoe1xuICAgICAgICBwcm9qZWN0TmFtZTogdGhpcy5wcm9qZWN0TmFtZSxcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBsb2dFbnRyeTogdGhpcy5sb2csXG4gICAgICB9KVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUGx1Z2luRXJyb3IoYFVuZXhwZWN0ZWQgZXJyb3Igd2hlbiBsb2FkaW5nIHBsdWdpbiBcIiR7cGx1Z2luTmFtZX1cIjogJHtlcnJvcn1gLCB7XG4gICAgICAgIHBsdWdpbk5hbWUsXG4gICAgICAgIGVycm9yLFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBwbHVnaW4gPSB2YWxpZGF0ZShwbHVnaW4sIHBsdWdpblNjaGVtYSwgeyBjb250ZXh0OiBgcGx1Z2luIFwiJHtwbHVnaW5OYW1lfVwiYCB9KVxuXG4gICAgdGhpcy5sb2FkZWRQbHVnaW5zW3BsdWdpbk5hbWVdID0gcGx1Z2luXG5cbiAgICAvLyBhbGxvdyBwbHVnaW5zIHRvIGV4dGVuZCB0aGVpciBvd24gY29uZmlnICh0aGF0IGdldHMgcGFzc2VkIHRvIGFjdGlvbiBoYW5kbGVycylcbiAgICBjb25zdCBwcm92aWRlckNvbmZpZyA9IGZpbmRCeU5hbWUodGhpcy5lbnZpcm9ubWVudC5wcm92aWRlcnMsIHBsdWdpbk5hbWUpXG4gICAgaWYgKHByb3ZpZGVyQ29uZmlnKSB7XG4gICAgICBleHRlbmQocHJvdmlkZXJDb25maWcsIHBsdWdpbi5jb25maWcsIGNvbmZpZylcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5lbnZpcm9ubWVudC5wcm92aWRlcnMucHVzaChleHRlbmQoeyBuYW1lOiBwbHVnaW5OYW1lIH0sIHBsdWdpbi5jb25maWcsIGNvbmZpZykpXG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBtb2R1bGVQYXRoIG9mIHBsdWdpbi5tb2R1bGVzIHx8IFtdKSB7XG4gICAgICBsZXQgbW9kdWxlQ29uZmlnID0gYXdhaXQgdGhpcy5yZXNvbHZlTW9kdWxlKG1vZHVsZVBhdGgpXG4gICAgICBpZiAoIW1vZHVsZUNvbmZpZykge1xuICAgICAgICB0aHJvdyBuZXcgUGx1Z2luRXJyb3IoYENvdWxkIG5vdCBsb2FkIG1vZHVsZSBcIiR7bW9kdWxlUGF0aH1cIiBzcGVjaWZpZWQgaW4gcGx1Z2luIFwiJHtwbHVnaW5OYW1lfVwiYCwge1xuICAgICAgICAgIHBsdWdpbk5hbWUsXG4gICAgICAgICAgbW9kdWxlUGF0aCxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICAgIG1vZHVsZUNvbmZpZy5wbHVnaW4gPSBwbHVnaW5OYW1lXG4gICAgICBhd2FpdCB0aGlzLmFkZE1vZHVsZShtb2R1bGVDb25maWcpXG4gICAgfVxuXG4gICAgY29uc3QgYWN0aW9ucyA9IHBsdWdpbi5hY3Rpb25zIHx8IHt9XG5cbiAgICBmb3IgKGNvbnN0IGFjdGlvblR5cGUgb2YgcGx1Z2luQWN0aW9uTmFtZXMpIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSBhY3Rpb25zW2FjdGlvblR5cGVdXG4gICAgICBoYW5kbGVyICYmIHRoaXMuYWRkQWN0aW9uSGFuZGxlcihwbHVnaW5OYW1lLCBhY3Rpb25UeXBlLCBoYW5kbGVyKVxuICAgIH1cblxuICAgIGNvbnN0IG1vZHVsZUFjdGlvbnMgPSBwbHVnaW4ubW9kdWxlQWN0aW9ucyB8fCB7fVxuXG4gICAgZm9yIChjb25zdCBtb2R1bGVUeXBlIG9mIE9iamVjdC5rZXlzKG1vZHVsZUFjdGlvbnMpKSB7XG4gICAgICBmb3IgKGNvbnN0IGFjdGlvblR5cGUgb2YgbW9kdWxlQWN0aW9uTmFtZXMpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlciA9IG1vZHVsZUFjdGlvbnNbbW9kdWxlVHlwZV1bYWN0aW9uVHlwZV1cbiAgICAgICAgaGFuZGxlciAmJiB0aGlzLmFkZE1vZHVsZUFjdGlvbkhhbmRsZXIocGx1Z2luTmFtZSwgYWN0aW9uVHlwZSwgbW9kdWxlVHlwZSwgaGFuZGxlcilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldFBsdWdpbihwbHVnaW5OYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBwbHVnaW4gPSB0aGlzLmxvYWRlZFBsdWdpbnNbcGx1Z2luTmFtZV1cblxuICAgIGlmICghcGx1Z2luKSB7XG4gICAgICB0aHJvdyBuZXcgUGx1Z2luRXJyb3IoYENvdWxkIG5vdCBmaW5kIHBsdWdpbiAke3BsdWdpbk5hbWV9LiBBcmUgeW91IG1pc3NpbmcgYSBwcm92aWRlciBjb25maWd1cmF0aW9uP2AsIHtcbiAgICAgICAgcGx1Z2luTmFtZSxcbiAgICAgICAgYXZhaWxhYmxlUGx1Z2luczogT2JqZWN0LmtleXModGhpcy5sb2FkZWRQbHVnaW5zKSxcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHBsdWdpblxuICB9XG5cbiAgcHJpdmF0ZSBhZGRBY3Rpb25IYW5kbGVyPFQgZXh0ZW5kcyBrZXlvZiBQbHVnaW5BY3Rpb25zPihcbiAgICBwbHVnaW5OYW1lOiBzdHJpbmcsIGFjdGlvblR5cGU6IFQsIGhhbmRsZXI6IFBsdWdpbkFjdGlvbnNbVF0sXG4gICkge1xuICAgIGNvbnN0IHBsdWdpbiA9IHRoaXMuZ2V0UGx1Z2luKHBsdWdpbk5hbWUpXG4gICAgY29uc3Qgc2NoZW1hID0gcGx1Z2luQWN0aW9uRGVzY3JpcHRpb25zW2FjdGlvblR5cGVdLnJlc3VsdFNjaGVtYVxuXG4gICAgY29uc3Qgd3JhcHBlZCA9IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmFwcGx5KHBsdWdpbiwgYXJncylcbiAgICAgIHJldHVybiB2YWxpZGF0ZShyZXN1bHQsIHNjaGVtYSwgeyBjb250ZXh0OiBgJHthY3Rpb25UeXBlfSBvdXRwdXQgZnJvbSBwbHVnaW4gJHtwbHVnaW5OYW1lfWAgfSlcbiAgICB9XG4gICAgd3JhcHBlZFtcImFjdGlvblR5cGVcIl0gPSBhY3Rpb25UeXBlXG4gICAgd3JhcHBlZFtcInBsdWdpbk5hbWVcIl0gPSBwbHVnaW5OYW1lXG5cbiAgICB0aGlzLmFjdGlvbkhhbmRsZXJzW2FjdGlvblR5cGVdW3BsdWdpbk5hbWVdID0gd3JhcHBlZFxuICB9XG5cbiAgcHJpdmF0ZSBhZGRNb2R1bGVBY3Rpb25IYW5kbGVyPFQgZXh0ZW5kcyBrZXlvZiBNb2R1bGVBY3Rpb25zPihcbiAgICBwbHVnaW5OYW1lOiBzdHJpbmcsIGFjdGlvblR5cGU6IFQsIG1vZHVsZVR5cGU6IHN0cmluZywgaGFuZGxlcjogTW9kdWxlQWN0aW9uc1tUXSxcbiAgKSB7XG4gICAgY29uc3QgcGx1Z2luID0gdGhpcy5nZXRQbHVnaW4ocGx1Z2luTmFtZSlcbiAgICBjb25zdCBzY2hlbWEgPSBtb2R1bGVBY3Rpb25EZXNjcmlwdGlvbnNbYWN0aW9uVHlwZV0ucmVzdWx0U2NoZW1hXG5cbiAgICBjb25zdCB3cmFwcGVkID0gYXN5bmMgKC4uLmFyZ3MpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuYXBwbHkocGx1Z2luLCBhcmdzKVxuICAgICAgcmV0dXJuIHZhbGlkYXRlKHJlc3VsdCwgc2NoZW1hLCB7IGNvbnRleHQ6IGAke2FjdGlvblR5cGV9IG91dHB1dCBmcm9tIHBsdWdpbiAke3BsdWdpbk5hbWV9YCB9KVxuICAgIH1cbiAgICB3cmFwcGVkW1wiYWN0aW9uVHlwZVwiXSA9IGFjdGlvblR5cGVcbiAgICB3cmFwcGVkW1wicGx1Z2luTmFtZVwiXSA9IHBsdWdpbk5hbWVcbiAgICB3cmFwcGVkW1wibW9kdWxlVHlwZVwiXSA9IG1vZHVsZVR5cGVcblxuICAgIGlmICghdGhpcy5tb2R1bGVBY3Rpb25IYW5kbGVyc1thY3Rpb25UeXBlXSkge1xuICAgICAgdGhpcy5tb2R1bGVBY3Rpb25IYW5kbGVyc1thY3Rpb25UeXBlXSA9IHt9XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLm1vZHVsZUFjdGlvbkhhbmRsZXJzW2FjdGlvblR5cGVdW21vZHVsZVR5cGVdKSB7XG4gICAgICB0aGlzLm1vZHVsZUFjdGlvbkhhbmRsZXJzW2FjdGlvblR5cGVdW21vZHVsZVR5cGVdID0ge31cbiAgICB9XG5cbiAgICB0aGlzLm1vZHVsZUFjdGlvbkhhbmRsZXJzW2FjdGlvblR5cGVdW21vZHVsZVR5cGVdW3BsdWdpbk5hbWVdID0gd3JhcHBlZFxuICB9XG5cbiAgLypcbiAgICBSZXR1cm5zIGFsbCBtb2R1bGVzIHRoYXQgYXJlIHJlZ2lzdGVyZWQgaW4gdGhpcyBjb250ZXh0LlxuICAgIFNjYW5zIGZvciBtb2R1bGVzIGluIHRoZSBwcm9qZWN0IHJvb3QgaWYgaXQgaGFzbid0IGFscmVhZHkgYmVlbiBkb25lLlxuICAgKi9cbiAgYXN5bmMgZ2V0TW9kdWxlcyhuYW1lcz86IHN0cmluZ1tdLCBub1NjYW4/OiBib29sZWFuKTogUHJvbWlzZTxNb2R1bGVbXT4ge1xuICAgIGlmICghdGhpcy5tb2R1bGVzU2Nhbm5lZCAmJiAhbm9TY2FuKSB7XG4gICAgICBhd2FpdCB0aGlzLnNjYW5Nb2R1bGVzKClcbiAgICB9XG5cbiAgICBsZXQgY29uZmlnczogTW9kdWxlQ29uZmlnW11cblxuICAgIGlmICghIW5hbWVzKSB7XG4gICAgICBjb25maWdzID0gW11cbiAgICAgIGNvbnN0IG1pc3Npbmc6IHN0cmluZ1tdID0gW11cblxuICAgICAgZm9yIChjb25zdCBuYW1lIG9mIG5hbWVzKSB7XG4gICAgICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMubW9kdWxlQ29uZmlnc1tuYW1lXVxuXG4gICAgICAgIGlmICghbW9kdWxlKSB7XG4gICAgICAgICAgbWlzc2luZy5wdXNoKG5hbWUpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uZmlncy5wdXNoKG1vZHVsZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAobWlzc2luZy5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBDb3VsZCBub3QgZmluZCBtb2R1bGUocyk6ICR7bWlzc2luZy5qb2luKFwiLCBcIil9YCwge1xuICAgICAgICAgIG1pc3NpbmcsXG4gICAgICAgICAgYXZhaWxhYmxlOiBPYmplY3Qua2V5cyh0aGlzLm1vZHVsZUNvbmZpZ3MpLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25maWdzID0gT2JqZWN0LnZhbHVlcyh0aGlzLm1vZHVsZUNvbmZpZ3MpXG4gICAgfVxuXG4gICAgcmV0dXJuIEJsdWViaXJkLm1hcChjb25maWdzLCBjb25maWcgPT4gbW9kdWxlRnJvbUNvbmZpZyh0aGlzLCBjb25maWcpKVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG1vZHVsZSB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZS4gVGhyb3dzIGVycm9yIGlmIGl0IGRvZXNuJ3QgZXhpc3QuXG4gICAqL1xuICBhc3luYyBnZXRNb2R1bGUobmFtZTogc3RyaW5nLCBub1NjYW4/OiBib29sZWFuKTogUHJvbWlzZTxNb2R1bGU+IHtcbiAgICByZXR1cm4gKGF3YWl0IHRoaXMuZ2V0TW9kdWxlcyhbbmFtZV0sIG5vU2NhbikpWzBdXG4gIH1cblxuICAvKipcbiAgICogR2l2ZW4gdGhlIHByb3ZpZGVkIGxpc3RzIG9mIGJ1aWxkIGFuZCBzZXJ2aWNlIGRlcGVuZGVuY2llcywgcmV0dXJuIGEgbGlzdCBvZiBhbGwgbW9kdWxlc1xuICAgKiByZXF1aXJlZCB0byBzYXRpc2Z5IHRob3NlIGRlcGVuZGVuY2llcy5cbiAgICovXG4gIGFzeW5jIHJlc29sdmVNb2R1bGVEZXBlbmRlbmNpZXMoYnVpbGREZXBlbmRlbmNpZXM6IEJ1aWxkRGVwZW5kZW5jeUNvbmZpZ1tdLCBzZXJ2aWNlRGVwZW5kZW5jaWVzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IGJ1aWxkRGVwcyA9IGF3YWl0IEJsdWViaXJkLm1hcChidWlsZERlcGVuZGVuY2llcywgYXN5bmMgKGRlcCkgPT4ge1xuICAgICAgY29uc3QgbW9kdWxlS2V5ID0gZ2V0TW9kdWxlS2V5KGRlcC5uYW1lLCBkZXAucGx1Z2luKVxuICAgICAgY29uc3QgbW9kdWxlID0gYXdhaXQgdGhpcy5nZXRNb2R1bGUobW9kdWxlS2V5KVxuICAgICAgcmV0dXJuIFttb2R1bGVdLmNvbmNhdChhd2FpdCB0aGlzLnJlc29sdmVNb2R1bGVEZXBlbmRlbmNpZXMobW9kdWxlLmJ1aWxkLmRlcGVuZGVuY2llcywgW10pKVxuICAgIH0pXG5cbiAgICBjb25zdCBydW50aW1lRGVwcyA9IGF3YWl0IEJsdWViaXJkLm1hcChzZXJ2aWNlRGVwZW5kZW5jaWVzLCBhc3luYyAoc2VydmljZU5hbWUpID0+IHtcbiAgICAgIGNvbnN0IHNlcnZpY2UgPSBhd2FpdCB0aGlzLmdldFNlcnZpY2Uoc2VydmljZU5hbWUpXG4gICAgICByZXR1cm4gdGhpcy5yZXNvbHZlTW9kdWxlRGVwZW5kZW5jaWVzKFxuICAgICAgICBbeyBuYW1lOiBzZXJ2aWNlLm1vZHVsZS5uYW1lLCBjb3B5OiBbXSB9XSxcbiAgICAgICAgc2VydmljZS5jb25maWcuZGVwZW5kZW5jaWVzIHx8IFtdLFxuICAgICAgKVxuICAgIH0pXG5cbiAgICBjb25zdCBkZXBzID0gZmxhdHRlbihidWlsZERlcHMpLmNvbmNhdChmbGF0dGVuKHJ1bnRpbWVEZXBzKSlcblxuICAgIHJldHVybiBzb3J0QnkodW5pcUJ5KGRlcHMsIFwibmFtZVwiKSwgXCJuYW1lXCIpXG4gIH1cblxuICAvKipcbiAgICogR2l2ZW4gYSBtb2R1bGUsIGFuZCBhIGxpc3Qgb2YgZGVwZW5kZW5jaWVzLCByZXNvbHZlIHRoZSB2ZXJzaW9uIGZvciB0aGF0IGNvbWJpbmF0aW9uIG9mIG1vZHVsZXMuXG4gICAqIFRoZSBjb21iaW5lZCB2ZXJzaW9uIGlzIGEgZWl0aGVyIHRoZSBsYXRlc3QgZGlydHkgbW9kdWxlIHZlcnNpb24gKGlmIGFueSksIG9yIHRoZSBoYXNoIG9mIHRoZSBtb2R1bGUgdmVyc2lvblxuICAgKiBhbmQgdGhlIHZlcnNpb25zIG9mIGl0cyBkZXBlbmRlbmNpZXMgKGluIHNvcnRlZCBvcmRlcikuXG4gICAqL1xuICBhc3luYyByZXNvbHZlVmVyc2lvbihtb2R1bGVOYW1lOiBzdHJpbmcsIG1vZHVsZURlcGVuZGVuY2llczogQnVpbGREZXBlbmRlbmN5Q29uZmlnW10sIGZvcmNlID0gZmFsc2UpIHtcbiAgICBjb25zdCBjb25maWcgPSB0aGlzLm1vZHVsZUNvbmZpZ3NbbW9kdWxlTmFtZV1cbiAgICBjb25zdCBjYWNoZUtleSA9IFtcIm1vZHVsZVZlcnNpb25zXCIsIG1vZHVsZU5hbWVdXG5cbiAgICBpZiAoIWZvcmNlKSB7XG4gICAgICBjb25zdCBjYWNoZWQgPSA8TW9kdWxlVmVyc2lvbj50aGlzLmNhY2hlLmdldChjYWNoZUtleSlcblxuICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICByZXR1cm4gY2FjaGVkXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgZGVwZW5kZW5jeUtleXMgPSBtb2R1bGVEZXBlbmRlbmNpZXMubWFwKGRlcCA9PiBnZXRNb2R1bGVLZXkoZGVwLm5hbWUsIGRlcC5wbHVnaW4pKVxuICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IE9iamVjdC52YWx1ZXMocGlja0tleXModGhpcy5tb2R1bGVDb25maWdzLCBkZXBlbmRlbmN5S2V5cywgXCJtb2R1bGUgY29uZmlnXCIpKVxuICAgIGNvbnN0IGNhY2hlQ29udGV4dHMgPSBkZXBlbmRlbmNpZXMuY29uY2F0KFtjb25maWddKS5tYXAoYyA9PiBnZXRNb2R1bGVDYWNoZUNvbnRleHQoYykpXG5cbiAgICBjb25zdCB2ZXJzaW9uID0gYXdhaXQgdGhpcy52Y3MucmVzb2x2ZVZlcnNpb24oY29uZmlnLCBkZXBlbmRlbmNpZXMpXG5cbiAgICB0aGlzLmNhY2hlLnNldChjYWNoZUtleSwgdmVyc2lvbiwgLi4uY2FjaGVDb250ZXh0cylcbiAgICByZXR1cm4gdmVyc2lvblxuICB9XG5cbiAgLypcbiAgICBSZXR1cm5zIGFsbCBzZXJ2aWNlcyB0aGF0IGFyZSByZWdpc3RlcmVkIGluIHRoaXMgY29udGV4dCwgb3IgdGhlIG9uZXMgc3BlY2lmaWVkLlxuICAgIFNjYW5zIGZvciBtb2R1bGVzIGFuZCBzZXJ2aWNlcyBpbiB0aGUgcHJvamVjdCByb290IGlmIGl0IGhhc24ndCBhbHJlYWR5IGJlZW4gZG9uZS5cbiAgICovXG4gIGFzeW5jIGdldFNlcnZpY2VzKG5hbWVzPzogc3RyaW5nW10sIG5vU2Nhbj86IGJvb2xlYW4pOiBQcm9taXNlPFNlcnZpY2VbXT4ge1xuICAgIGlmICghdGhpcy5tb2R1bGVzU2Nhbm5lZCAmJiAhbm9TY2FuKSB7XG4gICAgICBhd2FpdCB0aGlzLnNjYW5Nb2R1bGVzKClcbiAgICB9XG5cbiAgICBjb25zdCBwaWNrZWQgPSBuYW1lcyA/IHBpY2tLZXlzKHRoaXMuc2VydmljZU5hbWVJbmRleCwgbmFtZXMsIFwic2VydmljZVwiKSA6IHRoaXMuc2VydmljZU5hbWVJbmRleFxuXG4gICAgcmV0dXJuIEJsdWViaXJkLm1hcChPYmplY3QuZW50cmllcyhwaWNrZWQpLCBhc3luYyAoW3NlcnZpY2VOYW1lLCBtb2R1bGVOYW1lXSkgPT4ge1xuICAgICAgY29uc3QgbW9kdWxlID0gYXdhaXQgdGhpcy5nZXRNb2R1bGUobW9kdWxlTmFtZSlcbiAgICAgIGNvbnN0IGNvbmZpZyA9IGZpbmRCeU5hbWUobW9kdWxlLnNlcnZpY2VDb25maWdzLCBzZXJ2aWNlTmFtZSkhXG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IHNlcnZpY2VOYW1lLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIG1vZHVsZSxcbiAgICAgICAgc3BlYzogY29uZmlnLnNwZWMsXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBzZXJ2aWNlIHdpdGggdGhlIHNwZWNpZmllZCBuYW1lLiBUaHJvd3MgZXJyb3IgaWYgaXQgZG9lc24ndCBleGlzdC5cbiAgICovXG4gIGFzeW5jIGdldFNlcnZpY2UobmFtZTogc3RyaW5nLCBub1NjYW4/OiBib29sZWFuKTogUHJvbWlzZTxTZXJ2aWNlPE1vZHVsZT4+IHtcbiAgICByZXR1cm4gKGF3YWl0IHRoaXMuZ2V0U2VydmljZXMoW25hbWVdLCBub1NjYW4pKVswXVxuICB9XG5cbiAgLypcbiAgICBTY2FucyB0aGUgcHJvamVjdCByb290IGZvciBtb2R1bGVzIGFuZCBhZGRzIHRoZW0gdG8gdGhlIGNvbnRleHQuXG4gICAqL1xuICBhc3luYyBzY2FuTW9kdWxlcyhmb3JjZSA9IGZhbHNlKSB7XG4gICAgcmV0dXJuIHNjYW5Mb2NrLmFjcXVpcmUoXCJzY2FuLW1vZHVsZXNcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMubW9kdWxlc1NjYW5uZWQgJiYgIWZvcmNlKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBsZXQgZXh0U291cmNlUGF0aHM6IHN0cmluZ1tdID0gW11cblxuICAgICAgLy8gQWRkIGV4dGVybmFsIHNvdXJjZXMgdGhhdCBhcmUgZGVmaW5lZCBhdCB0aGUgcHJvamVjdCBsZXZlbC4gRXh0ZXJuYWwgc291cmNlcyBhcmUgZWl0aGVyIGtlcHQgaW5cbiAgICAgIC8vIHRoZSAuZ2FyZGVuL3NvdXJjZXMgZGlyIChhbmQgY2xvbmVkIHRoZXJlIGlmIG5lZWRlZCksIG9yIHRoZXkncmUgbGlua2VkIHRvIGEgbG9jYWwgcGF0aCB2aWEgdGhlIGxpbmsgY29tbWFuZC5cbiAgICAgIGZvciAoY29uc3QgeyBuYW1lLCByZXBvc2l0b3J5VXJsIH0gb2YgdGhpcy5wcm9qZWN0U291cmNlcykge1xuICAgICAgICBjb25zdCBwYXRoID0gYXdhaXQgdGhpcy5sb2FkRXh0U291cmNlUGF0aCh7IG5hbWUsIHJlcG9zaXRvcnlVcmwsIHNvdXJjZVR5cGU6IFwicHJvamVjdFwiIH0pXG4gICAgICAgIGV4dFNvdXJjZVBhdGhzLnB1c2gocGF0aClcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGlyc1RvU2NhbiA9IFt0aGlzLnByb2plY3RSb290LCAuLi5leHRTb3VyY2VQYXRoc11cblxuICAgICAgY29uc3QgbW9kdWxlUGF0aHMgPSBmbGF0dGVuKGF3YWl0IEJsdWViaXJkLm1hcChkaXJzVG9TY2FuLCBhc3luYyBkaXIgPT4ge1xuICAgICAgICBjb25zdCBpZ25vcmVyID0gYXdhaXQgZ2V0SWdub3JlcihkaXIpXG4gICAgICAgIGNvbnN0IHNjYW5PcHRzID0ge1xuICAgICAgICAgIGZpbHRlcjogKHBhdGgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbFBhdGggPSByZWxhdGl2ZSh0aGlzLnByb2plY3RSb290LCBwYXRoKVxuICAgICAgICAgICAgcmV0dXJuICFpZ25vcmVyLmlnbm9yZXMocmVsUGF0aClcbiAgICAgICAgICB9LFxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhdGhzOiBzdHJpbmdbXSA9IFtdXG5cbiAgICAgICAgZm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHNjYW5EaXJlY3RvcnkoZGlyLCBzY2FuT3B0cykpIHtcbiAgICAgICAgICBpZiAoIWl0ZW0pIHtcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGFyc2VkUGF0aCA9IHBhcnNlKGl0ZW0ucGF0aClcblxuICAgICAgICAgIGlmIChwYXJzZWRQYXRoLmJhc2UgIT09IE1PRFVMRV9DT05GSUdfRklMRU5BTUUpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcGF0aHMucHVzaChwYXJzZWRQYXRoLmRpcilcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYXRoc1xuICAgICAgfSkpLmZpbHRlcihCb29sZWFuKVxuXG4gICAgICBhd2FpdCBCbHVlYmlyZC5tYXAobW9kdWxlUGF0aHMsIGFzeW5jIHBhdGggPT4ge1xuICAgICAgICBjb25zdCBjb25maWcgPSBhd2FpdCB0aGlzLnJlc29sdmVNb2R1bGUocGF0aClcbiAgICAgICAgY29uZmlnICYmIGF3YWl0IHRoaXMuYWRkTW9kdWxlKGNvbmZpZylcbiAgICAgIH0pXG5cbiAgICAgIHRoaXMubW9kdWxlc1NjYW5uZWQgPSB0cnVlXG5cbiAgICAgIGF3YWl0IHRoaXMuZGV0ZWN0Q2lyY3VsYXJEZXBlbmRlbmNpZXMoKVxuXG4gICAgICBjb25zdCBtb2R1bGVDb25maWdDb250ZXh0ID0gbmV3IE1vZHVsZUNvbmZpZ0NvbnRleHQoXG4gICAgICAgIHRoaXMsIHRoaXMuZW52aXJvbm1lbnQsIE9iamVjdC52YWx1ZXModGhpcy5tb2R1bGVDb25maWdzKSxcbiAgICAgIClcbiAgICAgIHRoaXMubW9kdWxlQ29uZmlncyA9IGF3YWl0IHJlc29sdmVUZW1wbGF0ZVN0cmluZ3ModGhpcy5tb2R1bGVDb25maWdzLCBtb2R1bGVDb25maWdDb250ZXh0KVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRldGVjdENpcmN1bGFyRGVwZW5kZW5jaWVzKCkge1xuICAgIGNvbnN0IG1vZHVsZXMgPSBhd2FpdCB0aGlzLmdldE1vZHVsZXMoKVxuICAgIGNvbnN0IHNlcnZpY2VzID0gYXdhaXQgdGhpcy5nZXRTZXJ2aWNlcygpXG5cbiAgICByZXR1cm4gZGV0ZWN0Q2lyY3VsYXJEZXBlbmRlbmNpZXMobW9kdWxlcywgc2VydmljZXMpXG4gIH1cblxuICAvKlxuICAgIEFkZHMgdGhlIHNwZWNpZmllZCBtb2R1bGUgdG8gdGhlIGNvbnRleHRcblxuICAgIEBwYXJhbSBmb3JjZSAtIGFkZCB0aGUgbW9kdWxlIGFnYWluLCBldmVuIGlmIGl0J3MgYWxyZWFkeSByZWdpc3RlcmVkXG4gICAqL1xuICBhc3luYyBhZGRNb2R1bGUoY29uZmlnOiBNb2R1bGVDb25maWcsIGZvcmNlID0gZmFsc2UpIHtcbiAgICBjb25zdCB2YWxpZGF0ZUhhbmRsZXIgPSBhd2FpdCB0aGlzLmdldE1vZHVsZUFjdGlvbkhhbmRsZXIoeyBhY3Rpb25UeXBlOiBcInZhbGlkYXRlXCIsIG1vZHVsZVR5cGU6IGNvbmZpZy50eXBlIH0pXG4gICAgY29uc3QgY3R4ID0gdGhpcy5nZXRQbHVnaW5Db250ZXh0KHZhbGlkYXRlSGFuZGxlcltcInBsdWdpbk5hbWVcIl0pXG5cbiAgICBjb25maWcgPSBhd2FpdCB2YWxpZGF0ZUhhbmRsZXIoeyBjdHgsIG1vZHVsZUNvbmZpZzogY29uZmlnIH0pXG5cbiAgICAvLyBGSVhNRTogdGhpcyBpcyByYXRoZXIgY2x1bXN5XG4gICAgY29uZmlnLm5hbWUgPSBnZXRNb2R1bGVLZXkoY29uZmlnLm5hbWUsIGNvbmZpZy5wbHVnaW4pXG5cbiAgICBpZiAoIWZvcmNlICYmIHRoaXMubW9kdWxlQ29uZmlnc1tjb25maWcubmFtZV0pIHtcbiAgICAgIGNvbnN0IHBhdGhBID0gcmVsYXRpdmUodGhpcy5wcm9qZWN0Um9vdCwgdGhpcy5tb2R1bGVDb25maWdzW2NvbmZpZy5uYW1lXS5wYXRoKVxuICAgICAgY29uc3QgcGF0aEIgPSByZWxhdGl2ZSh0aGlzLnByb2plY3RSb290LCBjb25maWcucGF0aClcblxuICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgYE1vZHVsZSAke2NvbmZpZy5uYW1lfSBpcyBkZWNsYXJlZCBtdWx0aXBsZSB0aW1lcyAoJyR7cGF0aEF9JyBhbmQgJyR7cGF0aEJ9JylgLFxuICAgICAgICB7IHBhdGhBLCBwYXRoQiB9LFxuICAgICAgKVxuICAgIH1cblxuICAgIHRoaXMubW9kdWxlQ29uZmlnc1tjb25maWcubmFtZV0gPSBjb25maWdcblxuICAgIC8vIEFkZCB0byBzZXJ2aWNlLW1vZHVsZSBtYXBcbiAgICBmb3IgKGNvbnN0IHNlcnZpY2VDb25maWcgb2YgY29uZmlnLnNlcnZpY2VDb25maWdzKSB7XG4gICAgICBjb25zdCBzZXJ2aWNlTmFtZSA9IHNlcnZpY2VDb25maWcubmFtZVxuXG4gICAgICBpZiAoIWZvcmNlICYmIHRoaXMuc2VydmljZU5hbWVJbmRleFtzZXJ2aWNlTmFtZV0pIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgICBgU2VydmljZSBuYW1lcyBtdXN0IGJlIHVuaXF1ZSAtICR7c2VydmljZU5hbWV9IGlzIGRlY2xhcmVkIG11bHRpcGxlIHRpbWVzIGAgK1xuICAgICAgICAgIGAoaW4gJyR7dGhpcy5zZXJ2aWNlTmFtZUluZGV4W3NlcnZpY2VOYW1lXX0nIGFuZCAnJHtjb25maWcubmFtZX0nKWAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgc2VydmljZU5hbWUsXG4gICAgICAgICAgICBtb2R1bGVBOiB0aGlzLnNlcnZpY2VOYW1lSW5kZXhbc2VydmljZU5hbWVdLFxuICAgICAgICAgICAgbW9kdWxlQjogY29uZmlnLm5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgKVxuICAgICAgfVxuXG4gICAgICB0aGlzLnNlcnZpY2VOYW1lSW5kZXhbc2VydmljZU5hbWVdID0gY29uZmlnLm5hbWVcbiAgICB9XG5cbiAgICBpZiAodGhpcy5tb2R1bGVzU2Nhbm5lZCkge1xuICAgICAgLy8gbmVlZCB0byByZS1ydW4gdGhpcyBpZiBhZGRpbmcgbW9kdWxlcyBhZnRlciBpbml0aWFsIHNjYW5cbiAgICAgIGF3YWl0IHRoaXMuZGV0ZWN0Q2lyY3VsYXJEZXBlbmRlbmNpZXMoKVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gICAgTWFwcyB0aGUgcHJvdmlkZWQgbmFtZSBvciBsb2NhdG9yIHRvIGEgTW9kdWxlLiBXZSBmaXJzdCBsb29rIGZvciBhIG1vZHVsZSBpbiB0aGVcbiAgICBwcm9qZWN0IHdpdGggdGhlIHByb3ZpZGVkIG5hbWUuIElmIGl0IGRvZXMgbm90IGV4aXN0LCB3ZSB0cmVhdCBpdCBhcyBhIHBhdGhcbiAgICAocmVzb2x2ZWQgd2l0aCB0aGUgcHJvamVjdCBwYXRoIGFzIGEgYmFzZSBwYXRoKSBhbmQgYXR0ZW1wdCB0byBsb2FkIHRoZSBtb2R1bGVcbiAgICBmcm9tIHRoZXJlLlxuICAgKi9cbiAgYXN5bmMgcmVzb2x2ZU1vZHVsZShuYW1lT3JMb2NhdGlvbjogc3RyaW5nKTogUHJvbWlzZTxNb2R1bGVDb25maWcgfCBudWxsPiB7XG4gICAgY29uc3QgcGFyc2VkUGF0aCA9IHBhcnNlKG5hbWVPckxvY2F0aW9uKVxuXG4gICAgaWYgKHBhcnNlZFBhdGguZGlyID09PSBcIlwiKSB7XG4gICAgICAvLyBMb29rcyBsaWtlIGEgbmFtZVxuICAgICAgY29uc3QgZXhpc3RpbmdNb2R1bGUgPSB0aGlzLm1vZHVsZUNvbmZpZ3NbbmFtZU9yTG9jYXRpb25dXG5cbiAgICAgIGlmICghZXhpc3RpbmdNb2R1bGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihgTW9kdWxlICR7bmFtZU9yTG9jYXRpb259IGNvdWxkIG5vdCBiZSBmb3VuZGAsIHtcbiAgICAgICAgICBuYW1lOiBuYW1lT3JMb2NhdGlvbixcbiAgICAgICAgfSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGV4aXN0aW5nTW9kdWxlXG4gICAgfVxuXG4gICAgLy8gTG9va3MgbGlrZSBhIHBhdGhcbiAgICBjb25zdCBwYXRoID0gcmVzb2x2ZSh0aGlzLnByb2plY3RSb290LCBuYW1lT3JMb2NhdGlvbilcbiAgICBjb25zdCBjb25maWcgPSBhd2FpdCBsb2FkQ29uZmlnKHRoaXMucHJvamVjdFJvb3QsIHBhdGgpXG5cbiAgICBpZiAoIWNvbmZpZyB8fCAhY29uZmlnLm1vZHVsZSkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICBjb25zdCBtb2R1bGVDb25maWcgPSBjbG9uZURlZXAoY29uZmlnLm1vZHVsZSlcblxuICAgIGlmIChtb2R1bGVDb25maWcucmVwb3NpdG9yeVVybCkge1xuICAgICAgbW9kdWxlQ29uZmlnLnBhdGggPSBhd2FpdCB0aGlzLmxvYWRFeHRTb3VyY2VQYXRoKHtcbiAgICAgICAgbmFtZTogbW9kdWxlQ29uZmlnLm5hbWUsXG4gICAgICAgIHJlcG9zaXRvcnlVcmw6IG1vZHVsZUNvbmZpZy5yZXBvc2l0b3J5VXJsLFxuICAgICAgICBzb3VyY2VUeXBlOiBcIm1vZHVsZVwiLFxuICAgICAgfSlcbiAgICB9XG5cbiAgICByZXR1cm4gbW9kdWxlQ29uZmlnXG4gIH1cblxuICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAvL3JlZ2lvbiBJbnRlcm5hbCBoZWxwZXJzXG4gIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgLyoqXG4gICAqIENsb25lcyB0aGUgcHJvamVjdC9tb2R1bGUgc291cmNlIGlmIG5lZWRlZCBhbmQgcmV0dXJucyB0aGUgcGF0aCAoZWl0aGVyIGZyb20gLmdhcmRlbi9zb3VyY2VzIG9yIGZyb20gYSBsb2NhbCBwYXRoKVxuICAgKi9cbiAgcHVibGljIGFzeW5jIGxvYWRFeHRTb3VyY2VQYXRoKHsgbmFtZSwgcmVwb3NpdG9yeVVybCwgc291cmNlVHlwZSB9OiB7XG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHJlcG9zaXRvcnlVcmw6IHN0cmluZyxcbiAgICBzb3VyY2VUeXBlOiBFeHRlcm5hbFNvdXJjZVR5cGUsXG4gIH0pOiBQcm9taXNlPHN0cmluZz4ge1xuXG4gICAgY29uc3QgbGlua2VkU291cmNlcyA9IGF3YWl0IGdldExpbmtlZFNvdXJjZXModGhpcywgc291cmNlVHlwZSlcblxuICAgIGNvbnN0IGxpbmtlZCA9IGZpbmRCeU5hbWUobGlua2VkU291cmNlcywgbmFtZSlcblxuICAgIGlmIChsaW5rZWQpIHtcbiAgICAgIHJldHVybiBsaW5rZWQucGF0aFxuICAgIH1cblxuICAgIGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLnZjcy5lbnN1cmVSZW1vdGVTb3VyY2UoeyBuYW1lLCBzb3VyY2VUeXBlLCB1cmw6IHJlcG9zaXRvcnlVcmwsIGxvZ0VudHJ5OiB0aGlzLmxvZyB9KVxuXG4gICAgcmV0dXJuIHBhdGhcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSBoYW5kbGVyIGZvciB0aGUgc3BlY2lmaWVkIGFjdGlvbi5cbiAgICovXG4gIHB1YmxpYyBnZXRBY3Rpb25IYW5kbGVyczxUIGV4dGVuZHMga2V5b2YgUGx1Z2luQWN0aW9ucz4oYWN0aW9uVHlwZTogVCwgcGx1Z2luTmFtZT86IHN0cmluZyk6IEFjdGlvbkhhbmRsZXJNYXA8VD4ge1xuICAgIHJldHVybiB0aGlzLmZpbHRlckFjdGlvbkhhbmRsZXJzKHRoaXMuYWN0aW9uSGFuZGxlcnNbYWN0aW9uVHlwZV0sIHBsdWdpbk5hbWUpXG4gIH1cblxuICAvKipcbiAgICogR2V0IGEgaGFuZGxlciBmb3IgdGhlIHNwZWNpZmllZCBtb2R1bGUgYWN0aW9uLlxuICAgKi9cbiAgcHVibGljIGdldE1vZHVsZUFjdGlvbkhhbmRsZXJzPFQgZXh0ZW5kcyBrZXlvZiBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9ucz4oXG4gICAgeyBhY3Rpb25UeXBlLCBtb2R1bGVUeXBlLCBwbHVnaW5OYW1lIH06XG4gICAgICB7IGFjdGlvblR5cGU6IFQsIG1vZHVsZVR5cGU6IHN0cmluZywgcGx1Z2luTmFtZT86IHN0cmluZyB9LFxuICApOiBNb2R1bGVBY3Rpb25IYW5kbGVyTWFwPFQ+IHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXJBY3Rpb25IYW5kbGVycygodGhpcy5tb2R1bGVBY3Rpb25IYW5kbGVyc1thY3Rpb25UeXBlXSB8fCB7fSlbbW9kdWxlVHlwZV0sIHBsdWdpbk5hbWUpXG4gIH1cblxuICBwcml2YXRlIGZpbHRlckFjdGlvbkhhbmRsZXJzKGhhbmRsZXJzLCBwbHVnaW5OYW1lPzogc3RyaW5nKSB7XG4gICAgLy8gbWFrZSBzdXJlIHBsdWdpbiBpcyBsb2FkZWRcbiAgICBpZiAoISFwbHVnaW5OYW1lKSB7XG4gICAgICB0aGlzLmdldFBsdWdpbihwbHVnaW5OYW1lKVxuICAgIH1cblxuICAgIGlmIChoYW5kbGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBoYW5kbGVycyA9IHt9XG4gICAgfVxuXG4gICAgcmV0dXJuICFwbHVnaW5OYW1lID8gaGFuZGxlcnMgOiBwaWNrQnkoaGFuZGxlcnMsIChoYW5kbGVyKSA9PiBoYW5kbGVyW1wicGx1Z2luTmFtZVwiXSA9PT0gcGx1Z2luTmFtZSlcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIGxhc3QgY29uZmlndXJlZCBoYW5kbGVyIGZvciB0aGUgc3BlY2lmaWVkIGFjdGlvbiAoYW5kIG9wdGlvbmFsbHkgbW9kdWxlIHR5cGUpLlxuICAgKi9cbiAgcHVibGljIGdldEFjdGlvbkhhbmRsZXI8VCBleHRlbmRzIGtleW9mIFBsdWdpbkFjdGlvbnM+KFxuICAgIHsgYWN0aW9uVHlwZSwgcGx1Z2luTmFtZSwgZGVmYXVsdEhhbmRsZXIgfTpcbiAgICAgIHsgYWN0aW9uVHlwZTogVCwgcGx1Z2luTmFtZT86IHN0cmluZywgZGVmYXVsdEhhbmRsZXI/OiBQbHVnaW5BY3Rpb25zW1RdIH0sXG4gICk6IFBsdWdpbkFjdGlvbnNbVF0ge1xuXG4gICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QudmFsdWVzKHRoaXMuZ2V0QWN0aW9uSGFuZGxlcnMoYWN0aW9uVHlwZSwgcGx1Z2luTmFtZSkpXG5cbiAgICBpZiAoaGFuZGxlcnMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gaGFuZGxlcnNbaGFuZGxlcnMubGVuZ3RoIC0gMV1cbiAgICB9IGVsc2UgaWYgKGRlZmF1bHRIYW5kbGVyKSB7XG4gICAgICBkZWZhdWx0SGFuZGxlcltcInBsdWdpbk5hbWVcIl0gPSBkZWZhdWx0UHJvdmlkZXIubmFtZVxuICAgICAgcmV0dXJuIGRlZmF1bHRIYW5kbGVyXG4gICAgfVxuXG4gICAgY29uc3QgZXJyb3JEZXRhaWxzID0ge1xuICAgICAgcmVxdWVzdGVkSGFuZGxlclR5cGU6IGFjdGlvblR5cGUsXG4gICAgICBlbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudC5uYW1lLFxuICAgICAgcGx1Z2luTmFtZSxcbiAgICB9XG5cbiAgICBpZiAocGx1Z2luTmFtZSkge1xuICAgICAgdGhyb3cgbmV3IFBsdWdpbkVycm9yKGBQbHVnaW4gJyR7cGx1Z2luTmFtZX0nIGRvZXMgbm90IGhhdmUgYSAnJHthY3Rpb25UeXBlfScgaGFuZGxlci5gLCBlcnJvckRldGFpbHMpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJhbWV0ZXJFcnJvcihcbiAgICAgICAgYE5vICcke2FjdGlvblR5cGV9JyBoYW5kbGVyIGNvbmZpZ3VyZWQgaW4gZW52aXJvbm1lbnQgJyR7dGhpcy5lbnZpcm9ubWVudC5uYW1lfScuIGAgK1xuICAgICAgICBgQXJlIHlvdSBtaXNzaW5nIGEgcHJvdmlkZXIgY29uZmlndXJhdGlvbj9gLFxuICAgICAgICBlcnJvckRldGFpbHMsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgbGFzdCBjb25maWd1cmVkIGhhbmRsZXIgZm9yIHRoZSBzcGVjaWZpZWQgYWN0aW9uLlxuICAgKi9cbiAgcHVibGljIGdldE1vZHVsZUFjdGlvbkhhbmRsZXI8VCBleHRlbmRzIGtleW9mIE1vZHVsZUFuZFNlcnZpY2VBY3Rpb25zPihcbiAgICB7IGFjdGlvblR5cGUsIG1vZHVsZVR5cGUsIHBsdWdpbk5hbWUsIGRlZmF1bHRIYW5kbGVyIH06XG4gICAgICB7IGFjdGlvblR5cGU6IFQsIG1vZHVsZVR5cGU6IHN0cmluZywgcGx1Z2luTmFtZT86IHN0cmluZywgZGVmYXVsdEhhbmRsZXI/OiBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9uc1tUXSB9LFxuICApOiBNb2R1bGVBbmRTZXJ2aWNlQWN0aW9uc1tUXSB7XG5cbiAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC52YWx1ZXModGhpcy5nZXRNb2R1bGVBY3Rpb25IYW5kbGVycyh7IGFjdGlvblR5cGUsIG1vZHVsZVR5cGUsIHBsdWdpbk5hbWUgfSkpXG5cbiAgICBpZiAoaGFuZGxlcnMubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gaGFuZGxlcnNbaGFuZGxlcnMubGVuZ3RoIC0gMV1cbiAgICB9IGVsc2UgaWYgKGRlZmF1bHRIYW5kbGVyKSB7XG4gICAgICBkZWZhdWx0SGFuZGxlcltcInBsdWdpbk5hbWVcIl0gPSBkZWZhdWx0UHJvdmlkZXIubmFtZVxuICAgICAgcmV0dXJuIGRlZmF1bHRIYW5kbGVyXG4gICAgfVxuXG4gICAgY29uc3QgZXJyb3JEZXRhaWxzID0ge1xuICAgICAgcmVxdWVzdGVkSGFuZGxlclR5cGU6IGFjdGlvblR5cGUsXG4gICAgICByZXF1ZXN0ZWRNb2R1bGVUeXBlOiBtb2R1bGVUeXBlLFxuICAgICAgZW52aXJvbm1lbnQ6IHRoaXMuZW52aXJvbm1lbnQubmFtZSxcbiAgICAgIHBsdWdpbk5hbWUsXG4gICAgfVxuXG4gICAgaWYgKHBsdWdpbk5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBQbHVnaW5FcnJvcihcbiAgICAgICAgYFBsdWdpbiAnJHtwbHVnaW5OYW1lfScgZG9lcyBub3QgaGF2ZSBhICcke2FjdGlvblR5cGV9JyBoYW5kbGVyIGZvciBtb2R1bGUgdHlwZSAnJHttb2R1bGVUeXBlfScuYCxcbiAgICAgICAgZXJyb3JEZXRhaWxzLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IoXG4gICAgICAgIGBObyAnJHthY3Rpb25UeXBlfScgaGFuZGxlciBjb25maWd1cmVkIGZvciBtb2R1bGUgdHlwZSAnJHttb2R1bGVUeXBlfScgaW4gZW52aXJvbm1lbnQgYCArXG4gICAgICAgIGAnJHt0aGlzLmVudmlyb25tZW50Lm5hbWV9Jy4gQXJlIHlvdSBtaXNzaW5nIGEgcHJvdmlkZXIgY29uZmlndXJhdGlvbj9gLFxuICAgICAgICBlcnJvckRldGFpbHMsXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgLy9lbmRyZWdpb25cbn1cbiJdfQ==
