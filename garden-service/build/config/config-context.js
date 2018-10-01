"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const common_1 = require("./common");
const project_1 = require("./project");
const exceptions_1 = require("../exceptions");
const template_string_1 = require("../template-string");
const Joi = require("joi");
function schema(joiSchema) {
    return (target, propName) => {
        target.constructor._schemas = Object.assign({}, target.constructor._schemas || {}, { [propName]: joiSchema });
    };
}
exports.schema = schema;
// Note: we're using classes here to be able to use decorators to describe each context node and key
class ConfigContext {
    constructor(rootContext) {
        this._rootContext = rootContext || this;
        this._resolvedValues = {};
    }
    static getSchema() {
        const schemas = this._schemas;
        return Joi.object().keys(schemas).required();
    }
    resolve({ key, nodePath, stack }) {
        return __awaiter(this, void 0, void 0, function* () {
            const path = key.join(".");
            const fullPath = nodePath.concat(key).join(".");
            // if the key has previously been resolved, return it directly
            const resolved = this._resolvedValues[path];
            if (resolved) {
                return resolved;
            }
            stack = [...stack || []];
            if (stack.includes(fullPath)) {
                throw new exceptions_1.ConfigurationError(`Circular reference detected when resolving key ${path} (${stack.join(" -> ")})`, {
                    nodePath,
                    fullPath,
                    stack,
                });
            }
            // keep track of which resolvers have been called, in order to detect circular references
            let value = this;
            for (let p = 0; p < key.length; p++) {
                const nextKey = key[p];
                const lookupPath = key.slice(0, p + 1);
                const remainder = key.slice(p + 1);
                const nestedNodePath = nodePath.concat(lookupPath);
                const stackEntry = nestedNodePath.join(".");
                if (nextKey.startsWith("_")) {
                    value = undefined;
                }
                else {
                    value = value instanceof Map ? value.get(nextKey) : value[nextKey];
                }
                if (typeof value === "function") {
                    // call the function to resolve the value, then continue
                    value = yield value();
                }
                // handle nested contexts
                if (value instanceof ConfigContext) {
                    const nestedKey = remainder;
                    stack.push(stackEntry);
                    value = yield value.resolve({ key: nestedKey, nodePath: nestedNodePath, stack });
                    break;
                }
                // handle templated strings in context variables
                if (lodash_1.isString(value)) {
                    stack.push(stackEntry);
                    value = yield template_string_1.resolveTemplateString(value, this._rootContext, stack);
                }
                if (value === undefined) {
                    break;
                }
            }
            if (value === undefined) {
                throw new exceptions_1.ConfigurationError(`Could not find key: ${path}`, {
                    nodePath,
                    fullPath,
                    stack,
                });
            }
            if (!common_1.isPrimitive(value)) {
                throw new exceptions_1.ConfigurationError(`Config value at ${path} exists but is not a primitive (string, number or boolean)`, {
                    value,
                    path,
                    fullPath,
                    context,
                });
            }
            this._resolvedValues[path] = value;
            return value;
        });
    }
}
exports.ConfigContext = ConfigContext;
class LocalContext extends ConfigContext {
    constructor(root) {
        super(root);
        this.env = process.env;
        this.platform = process.platform;
    }
}
__decorate([
    schema(common_1.joiStringMap(Joi.string()).description("A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env).")),
    __metadata("design:type", Object)
], LocalContext.prototype, "env", void 0);
__decorate([
    schema(Joi.string()
        .description("A string indicating the platform that the framework is running on " +
        "(see https://nodejs.org/api/process.html#process_process_platform)")
        .example("posix")),
    __metadata("design:type", String)
], LocalContext.prototype, "platform", void 0);
/**
 * This context is available for template strings under the `project` key in configuration files.
 */
class ProjectConfigContext extends ConfigContext {
    constructor() {
        super();
        this.local = new LocalContext(this);
    }
}
__decorate([
    schema(LocalContext.getSchema()),
    __metadata("design:type", LocalContext)
], ProjectConfigContext.prototype, "local", void 0);
exports.ProjectConfigContext = ProjectConfigContext;
class EnvironmentContext extends ConfigContext {
    constructor(root, name) {
        super(root);
        this.name = name;
    }
}
__decorate([
    schema(Joi.string()
        .description("The name of the environment Garden is running against.")
        .example("local")),
    __metadata("design:type", String)
], EnvironmentContext.prototype, "name", void 0);
const exampleVersion = "v17ad4cb3fd";
class ModuleContext extends ConfigContext {
    constructor(root, module) {
        super(root);
        this.path = module.path;
        this.version = module.version.versionString;
        this.buildPath = module.buildPath;
    }
}
__decorate([
    schema(Joi.string().description("The local path of the module.").example("/home/me/code/my-project/my-module")),
    __metadata("design:type", String)
], ModuleContext.prototype, "path", void 0);
__decorate([
    schema(Joi.string().description("The current version of the module.").example(exampleVersion)),
    __metadata("design:type", String)
], ModuleContext.prototype, "version", void 0);
__decorate([
    schema(Joi.string()
        .description("The build path of the module.")
        .example("/home/me/code/my-project/.garden/build/my-module")),
    __metadata("design:type", String)
], ModuleContext.prototype, "buildPath", void 0);
const exampleOutputs = { ingress: "http://my-service/path/to/endpoint" };
class ServiceContext extends ConfigContext {
    // TODO: add ingresses
    constructor(root, service, outputs) {
        super(root);
        this.outputs = outputs;
        this.version = service.module.version.versionString;
    }
}
__decorate([
    schema(common_1.joiIdentifierMap(common_1.joiPrimitive()
        .description("The outputs defined by the service (see individual plugins for details).")
        .example(exampleOutputs))),
    __metadata("design:type", Object)
], ServiceContext.prototype, "outputs", void 0);
__decorate([
    schema(Joi.string().description("The current version of the service.").example(exampleVersion)),
    __metadata("design:type", String)
], ServiceContext.prototype, "version", void 0);
/**
 * This context is available for template strings under the `module` key in configuration files.
 * It is a superset of the context available under the `project` key.
 */
class ModuleConfigContext extends ProjectConfigContext {
    constructor(garden, environment, moduleConfigs) {
        super();
        const _this = this;
        this.environment = new EnvironmentContext(_this, environment.name);
        this.modules = new Map(moduleConfigs.map((config) => [config.name, () => __awaiter(this, void 0, void 0, function* () {
                const module = yield garden.getModule(config.name);
                return new ModuleContext(_this, module);
            })]));
        const serviceNames = lodash_1.flatten(moduleConfigs.map(m => m.serviceConfigs)).map(s => s.name);
        this.services = new Map(serviceNames.map((name) => [name, () => __awaiter(this, void 0, void 0, function* () {
                const service = yield garden.getService(name);
                const outputs = Object.assign({}, service.config.outputs, yield garden.actions.getServiceOutputs({ service }));
                return new ServiceContext(_this, service, outputs);
            })]));
        this.providers = new Map(environment.providers.map(p => [p.name, p]));
        // this.config = new SecretsContextNode(ctx)
        this.variables = environment.variables;
    }
}
__decorate([
    schema(EnvironmentContext.getSchema()
        .description("Information about the environment that Garden is running against.")),
    __metadata("design:type", EnvironmentContext)
], ModuleConfigContext.prototype, "environment", void 0);
__decorate([
    schema(common_1.joiIdentifierMap(ModuleContext.getSchema())
        .description("Retrieve information about modules that are defined in the project.")
        .example({ "my-module": { path: "/home/me/code/my-project/my-module", version: exampleVersion } })),
    __metadata("design:type", Map)
], ModuleConfigContext.prototype, "modules", void 0);
__decorate([
    schema(common_1.joiIdentifierMap(ServiceContext.getSchema())
        .description("Retrieve information about services that are defined in the project.")
        .example({ "my-service": { outputs: exampleOutputs, version: exampleVersion } })),
    __metadata("design:type", Map)
], ModuleConfigContext.prototype, "services", void 0);
__decorate([
    schema(common_1.joiIdentifierMap(project_1.providerConfigBaseSchema)
        .description("A map of all configured plugins/providers for this environment and their configuration.")
        .example({ kubernetes: { name: "local-kubernetes", context: "my-kube-context" } })),
    __metadata("design:type", Map)
], ModuleConfigContext.prototype, "providers", void 0);
__decorate([
    schema(common_1.joiIdentifierMap(common_1.joiPrimitive())
        .description("A map of all variables defined in the project configuration.")
        .example({ "team-name": "bananaramallama", "some-service-endpoint": "https://someservice.com/api/v2" })),
    __metadata("design:type", Object)
], ModuleConfigContext.prototype, "variables", void 0);
exports.ModuleConfigContext = ModuleConfigContext;
// class RemoteConfigContext extends ConfigContext {
//   constructor(private ctx: PluginContext) {
//     super()
//   }
//   async resolve({ key }: ResolveParams) {
//     const { value } = await this.ctx.getSecret({ key })
//     return value === null ? undefined : value
//   }
// }

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbmZpZy9jb25maWctY29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsbUNBQTBDO0FBRTFDLHFDQUE2RztBQUM3Ryx1Q0FBMkU7QUFFM0UsOENBQWtEO0FBRWxELHdEQUEwRDtBQUMxRCwyQkFBMEI7QUFZMUIsU0FBZ0IsTUFBTSxDQUFDLFNBQXFCO0lBQzFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUU7UUFDMUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLHFCQUFRLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxJQUFJLEVBQUUsSUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFNBQVMsR0FBRSxDQUFBO0lBQy9GLENBQUMsQ0FBQTtBQUNILENBQUM7QUFKRCx3QkFJQztBQUVELG9HQUFvRztBQUNwRyxNQUFzQixhQUFhO0lBSWpDLFlBQVksV0FBMkI7UUFDckMsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLElBQUksSUFBSSxDQUFBO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFBO0lBQzNCLENBQUM7SUFFRCxNQUFNLENBQUMsU0FBUztRQUNkLE1BQU0sT0FBTyxHQUFTLElBQUssQ0FBQyxRQUFRLENBQUE7UUFDcEMsT0FBTyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFBO0lBQzlDLENBQUM7SUFFSyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBd0I7O1lBQzFELE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7WUFDMUIsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7WUFFL0MsOERBQThEO1lBQzlELE1B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T0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLENBQUMsQ0FDckc7OEJBQ2UsR0FBRztvREFBc0M7QUFPekQ7SUFMQyxNQUFNLENBQ0wseUJBQWdCLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDO1NBQ3pDLFdBQVcsQ0FBQyxzRUFBc0UsQ0FBQztTQUNuRixPQUFPLENBQUMsRUFBRSxZQUFZLEVBQUUsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsRUFBRSxDQUFDLENBQ25GOzhCQUNnQixHQUFHO3FEQUF1QztBQU8zRDtJQUxDLE1BQU0sQ0FDTCx5QkFBZ0IsQ0FBQyxrQ0FBd0IsQ0FBQztTQUN2QyxXQUFXLENBQUMseUZBQXlGLENBQUM7U0FDdEcsT0FBTyxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FDckY7OEJBQ2lCLEdBQUc7c0RBQWtCO0FBYXZDO0lBTEMsTUFBTSxDQUNMLHlCQUFnQixDQUFDLHFCQUFZLEVBQUUsQ0FBQztTQUM3QixXQUFXLENBQUMsOERBQThELENBQUM7U0FDM0UsT0FBTyxDQUFDLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLGdDQUFnQyxFQUFFLENBQUMsQ0FDMUc7O3NEQUM2QjtBQXZDaEMsa0RBOEVDO0FBRUQsb0RBQW9EO0FBQ3BELDhDQUE4QztBQUM5QyxjQUFjO0FBQ2QsTUFBTTtBQUVOLDRDQUE0QztBQUM1QywwREFBMEQ7QUFDMUQsZ0RBQWdEO0FBQ2hELE1BQU07QUFDTixJQUFJIiwiZmlsZSI6ImNvbmZpZy9jb25maWctY29udGV4dC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBpc1N0cmluZywgZmxhdHRlbiB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBQcmltaXRpdmVNYXAsIGlzUHJpbWl0aXZlLCBQcmltaXRpdmUsIGpvaUlkZW50aWZpZXJNYXAsIGpvaVN0cmluZ01hcCwgam9pUHJpbWl0aXZlIH0gZnJvbSBcIi4vY29tbW9uXCJcbmltcG9ydCB7IFByb3ZpZGVyLCBFbnZpcm9ubWVudCwgcHJvdmlkZXJDb25maWdCYXNlU2NoZW1hIH0gZnJvbSBcIi4vcHJvamVjdFwiXG5pbXBvcnQgeyBNb2R1bGVDb25maWcgfSBmcm9tIFwiLi9tb2R1bGVcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgU2VydmljZSB9IGZyb20gXCIuLi90eXBlcy9zZXJ2aWNlXCJcbmltcG9ydCB7IHJlc29sdmVUZW1wbGF0ZVN0cmluZyB9IGZyb20gXCIuLi90ZW1wbGF0ZS1zdHJpbmdcIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4uL2dhcmRlblwiXG5cbmV4cG9ydCB0eXBlIENvbnRleHRLZXkgPSBzdHJpbmdbXVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRleHRSZXNvbHZlUGFyYW1zIHtcbiAga2V5OiBDb250ZXh0S2V5XG4gIG5vZGVQYXRoOiBDb250ZXh0S2V5XG4gIC8vIGEgbGlzdCBvZiBwcmV2aW91c2x5IHJlc29sdmVkIHBhdGhzLCB1c2VkIHRvIGRldGVjdCBjaXJjdWxhciByZWZlcmVuY2VzXG4gIHN0YWNrPzogc3RyaW5nW11cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjaGVtYShqb2lTY2hlbWE6IEpvaS5TY2hlbWEpIHtcbiAgcmV0dXJuICh0YXJnZXQsIHByb3BOYW1lKSA9PiB7XG4gICAgdGFyZ2V0LmNvbnN0cnVjdG9yLl9zY2hlbWFzID0geyAuLi50YXJnZXQuY29uc3RydWN0b3IuX3NjaGVtYXMgfHwge30sIFtwcm9wTmFtZV06IGpvaVNjaGVtYSB9XG4gIH1cbn1cblxuLy8gTm90ZTogd2UncmUgdXNpbmcgY2xhc3NlcyBoZXJlIHRvIGJlIGFibGUgdG8gdXNlIGRlY29yYXRvcnMgdG8gZGVzY3JpYmUgZWFjaCBjb250ZXh0IG5vZGUgYW5kIGtleVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbmZpZ0NvbnRleHQge1xuICBwcml2YXRlIHJlYWRvbmx5IF9yb290Q29udGV4dDogQ29uZmlnQ29udGV4dFxuICBwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZFZhbHVlczogeyBbcGF0aDogc3RyaW5nXTogc3RyaW5nIH1cblxuICBjb25zdHJ1Y3Rvcihyb290Q29udGV4dD86IENvbmZpZ0NvbnRleHQpIHtcbiAgICB0aGlzLl9yb290Q29udGV4dCA9IHJvb3RDb250ZXh0IHx8IHRoaXNcbiAgICB0aGlzLl9yZXNvbHZlZFZhbHVlcyA9IHt9XG4gIH1cblxuICBzdGF0aWMgZ2V0U2NoZW1hKCkge1xuICAgIGNvbnN0IHNjaGVtYXMgPSAoPGFueT50aGlzKS5fc2NoZW1hc1xuICAgIHJldHVybiBKb2kub2JqZWN0KCkua2V5cyhzY2hlbWFzKS5yZXF1aXJlZCgpXG4gIH1cblxuICBhc3luYyByZXNvbHZlKHsga2V5LCBub2RlUGF0aCwgc3RhY2sgfTogQ29udGV4dFJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFByaW1pdGl2ZT4ge1xuICAgIGNvbnN0IHBhdGggPSBrZXkuam9pbihcIi5cIilcbiAgICBjb25zdCBmdWxsUGF0aCA9IG5vZGVQYXRoLmNvbmNhdChrZXkpLmpvaW4oXCIuXCIpXG5cbiAgICAvLyBpZiB0aGUga2V5IGhhcyBwcmV2aW91c2x5IGJlZW4gcmVzb2x2ZWQsIHJldHVybiBpdCBkaXJlY3RseVxuICAgIGNvbnN0IHJlc29sdmVkID0gdGhpcy5fcmVzb2x2ZWRWYWx1ZXNbcGF0aF1cblxuICAgIGlmIChyZXNvbHZlZCkge1xuICAgICAgcmV0dXJuIHJlc29sdmVkXG4gICAgfVxuXG4gICAgc3RhY2sgPSBbLi4uc3RhY2sgfHwgW11dXG5cbiAgICBpZiAoc3RhY2suaW5jbHVkZXMoZnVsbFBhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgICBgQ2lyY3VsYXIgcmVmZXJlbmNlIGRldGVjdGVkIHdoZW4gcmVzb2x2aW5nIGtleSAke3BhdGh9ICgke3N0YWNrLmpvaW4oXCIgLT4gXCIpfSlgLFxuICAgICAgICB7XG4gICAgICAgICAgbm9kZVBhdGgsXG4gICAgICAgICAgZnVsbFBhdGgsXG4gICAgICAgICAgc3RhY2ssXG4gICAgICAgIH0sXG4gICAgICApXG4gICAgfVxuXG4gICAgLy8ga2VlcCB0cmFjayBvZiB3aGljaCByZXNvbHZlcnMgaGF2ZSBiZWVuIGNhbGxlZCwgaW4gb3JkZXIgdG8gZGV0ZWN0IGNpcmN1bGFyIHJlZmVyZW5jZXNcbiAgICBsZXQgdmFsdWU6IGFueSA9IHRoaXNcblxuICAgIGZvciAobGV0IHAgPSAwOyBwIDwga2V5Lmxlbmd0aDsgcCsrKSB7XG4gICAgICBjb25zdCBuZXh0S2V5ID0ga2V5W3BdXG4gICAgICBjb25zdCBsb29rdXBQYXRoID0ga2V5LnNsaWNlKDAsIHAgKyAxKVxuICAgICAgY29uc3QgcmVtYWluZGVyID0ga2V5LnNsaWNlKHAgKyAxKVxuICAgICAgY29uc3QgbmVzdGVkTm9kZVBhdGggPSBub2RlUGF0aC5jb25jYXQobG9va3VwUGF0aClcbiAgICAgIGNvbnN0IHN0YWNrRW50cnkgPSBuZXN0ZWROb2RlUGF0aC5qb2luKFwiLlwiKVxuXG4gICAgICBpZiAobmV4dEtleS5zdGFydHNXaXRoKFwiX1wiKSkge1xuICAgICAgICB2YWx1ZSA9IHVuZGVmaW5lZFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZSBpbnN0YW5jZW9mIE1hcCA/IHZhbHVlLmdldChuZXh0S2V5KSA6IHZhbHVlW25leHRLZXldXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAvLyBjYWxsIHRoZSBmdW5jdGlvbiB0byByZXNvbHZlIHRoZSB2YWx1ZSwgdGhlbiBjb250aW51ZVxuICAgICAgICB2YWx1ZSA9IGF3YWl0IHZhbHVlKClcbiAgICAgIH1cblxuICAgICAgLy8gaGFuZGxlIG5lc3RlZCBjb250ZXh0c1xuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQ29uZmlnQ29udGV4dCkge1xuICAgICAgICBjb25zdCBuZXN0ZWRLZXkgPSByZW1haW5kZXJcbiAgICAgICAgc3RhY2sucHVzaChzdGFja0VudHJ5KVxuICAgICAgICB2YWx1ZSA9IGF3YWl0IHZhbHVlLnJlc29sdmUoeyBrZXk6IG5lc3RlZEtleSwgbm9kZVBhdGg6IG5lc3RlZE5vZGVQYXRoLCBzdGFjayB9KVxuICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICAvLyBoYW5kbGUgdGVtcGxhdGVkIHN0cmluZ3MgaW4gY29udGV4dCB2YXJpYWJsZXNcbiAgICAgIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICAgICAgc3RhY2sucHVzaChzdGFja0VudHJ5KVxuICAgICAgICB2YWx1ZSA9IGF3YWl0IHJlc29sdmVUZW1wbGF0ZVN0cmluZyh2YWx1ZSwgdGhpcy5fcm9vdENvbnRleHQsIHN0YWNrKVxuICAgICAgfVxuXG4gICAgICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKGBDb3VsZCBub3QgZmluZCBrZXk6ICR7cGF0aH1gLCB7XG4gICAgICAgIG5vZGVQYXRoLFxuICAgICAgICBmdWxsUGF0aCxcbiAgICAgICAgc3RhY2ssXG4gICAgICB9KVxuICAgIH1cblxuICAgIGlmICghaXNQcmltaXRpdmUodmFsdWUpKSB7XG4gICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgICBgQ29uZmlnIHZhbHVlIGF0ICR7cGF0aH0gZXhpc3RzIGJ1dCBpcyBub3QgYSBwcmltaXRpdmUgKHN0cmluZywgbnVtYmVyIG9yIGJvb2xlYW4pYCxcbiAgICAgICAge1xuICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgZnVsbFBhdGgsXG4gICAgICAgICAgY29udGV4dCxcbiAgICAgICAgfSxcbiAgICAgIClcbiAgICB9XG5cbiAgICB0aGlzLl9yZXNvbHZlZFZhbHVlc1twYXRoXSA9IHZhbHVlXG4gICAgcmV0dXJuIHZhbHVlXG4gIH1cbn1cblxuY2xhc3MgTG9jYWxDb250ZXh0IGV4dGVuZHMgQ29uZmlnQ29udGV4dCB7XG4gIEBzY2hlbWEoXG4gICAgam9pU3RyaW5nTWFwKEpvaS5zdHJpbmcoKSkuZGVzY3JpcHRpb24oXG4gICAgICBcIkEgbWFwIG9mIGFsbCBsb2NhbCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgKHNlZSBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZW52KS5cIixcbiAgICApLFxuICApXG4gIHB1YmxpYyBlbnY6IHR5cGVvZiBwcm9jZXNzLmVudlxuXG4gIEBzY2hlbWEoXG4gICAgSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXG4gICAgICAgIFwiQSBzdHJpbmcgaW5kaWNhdGluZyB0aGUgcGxhdGZvcm0gdGhhdCB0aGUgZnJhbWV3b3JrIGlzIHJ1bm5pbmcgb24gXCIgK1xuICAgICAgICBcIihzZWUgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3BsYXRmb3JtKVwiLFxuICAgICAgKVxuICAgICAgLmV4YW1wbGUoXCJwb3NpeFwiKSxcbiAgKVxuICBwdWJsaWMgcGxhdGZvcm06IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKHJvb3Q6IENvbmZpZ0NvbnRleHQpIHtcbiAgICBzdXBlcihyb290KVxuICAgIHRoaXMuZW52ID0gcHJvY2Vzcy5lbnZcbiAgICB0aGlzLnBsYXRmb3JtID0gcHJvY2Vzcy5wbGF0Zm9ybVxuICB9XG59XG5cbi8qKlxuICogVGhpcyBjb250ZXh0IGlzIGF2YWlsYWJsZSBmb3IgdGVtcGxhdGUgc3RyaW5ncyB1bmRlciB0aGUgYHByb2plY3RgIGtleSBpbiBjb25maWd1cmF0aW9uIGZpbGVzLlxuICovXG5leHBvcnQgY2xhc3MgUHJvamVjdENvbmZpZ0NvbnRleHQgZXh0ZW5kcyBDb25maWdDb250ZXh0IHtcbiAgQHNjaGVtYShMb2NhbENvbnRleHQuZ2V0U2NoZW1hKCkpXG4gIHB1YmxpYyBsb2NhbDogTG9jYWxDb250ZXh0XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoKVxuICAgIHRoaXMubG9jYWwgPSBuZXcgTG9jYWxDb250ZXh0KHRoaXMpXG4gIH1cbn1cblxuY2xhc3MgRW52aXJvbm1lbnRDb250ZXh0IGV4dGVuZHMgQ29uZmlnQ29udGV4dCB7XG4gIEBzY2hlbWEoXG4gICAgSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgbmFtZSBvZiB0aGUgZW52aXJvbm1lbnQgR2FyZGVuIGlzIHJ1bm5pbmcgYWdhaW5zdC5cIilcbiAgICAgIC5leGFtcGxlKFwibG9jYWxcIiksXG4gIClcbiAgcHVibGljIG5hbWU6IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKHJvb3Q6IENvbmZpZ0NvbnRleHQsIG5hbWU6IHN0cmluZykge1xuICAgIHN1cGVyKHJvb3QpXG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICB9XG59XG5cbmNvbnN0IGV4YW1wbGVWZXJzaW9uID0gXCJ2MTdhZDRjYjNmZFwiXG5cbmNsYXNzIE1vZHVsZUNvbnRleHQgZXh0ZW5kcyBDb25maWdDb250ZXh0IHtcbiAgQHNjaGVtYShKb2kuc3RyaW5nKCkuZGVzY3JpcHRpb24oXCJUaGUgbG9jYWwgcGF0aCBvZiB0aGUgbW9kdWxlLlwiKS5leGFtcGxlKFwiL2hvbWUvbWUvY29kZS9teS1wcm9qZWN0L215LW1vZHVsZVwiKSlcbiAgcHVibGljIHBhdGg6IHN0cmluZ1xuXG4gIEBzY2hlbWEoSm9pLnN0cmluZygpLmRlc2NyaXB0aW9uKFwiVGhlIGN1cnJlbnQgdmVyc2lvbiBvZiB0aGUgbW9kdWxlLlwiKS5leGFtcGxlKGV4YW1wbGVWZXJzaW9uKSlcbiAgcHVibGljIHZlcnNpb246IHN0cmluZ1xuXG4gIEBzY2hlbWEoXG4gICAgSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgYnVpbGQgcGF0aCBvZiB0aGUgbW9kdWxlLlwiKVxuICAgICAgLmV4YW1wbGUoXCIvaG9tZS9tZS9jb2RlL215LXByb2plY3QvLmdhcmRlbi9idWlsZC9teS1tb2R1bGVcIiksXG4gIClcbiAgcHVibGljIGJ1aWxkUGF0aDogc3RyaW5nXG5cbiAgY29uc3RydWN0b3Iocm9vdDogQ29uZmlnQ29udGV4dCwgbW9kdWxlOiBNb2R1bGUpIHtcbiAgICBzdXBlcihyb290KVxuICAgIHRoaXMucGF0aCA9IG1vZHVsZS5wYXRoXG4gICAgdGhpcy52ZXJzaW9uID0gbW9kdWxlLnZlcnNpb24udmVyc2lvblN0cmluZ1xuICAgIHRoaXMuYnVpbGRQYXRoID0gbW9kdWxlLmJ1aWxkUGF0aFxuICB9XG59XG5cbmNvbnN0IGV4YW1wbGVPdXRwdXRzID0geyBpbmdyZXNzOiBcImh0dHA6Ly9teS1zZXJ2aWNlL3BhdGgvdG8vZW5kcG9pbnRcIiB9XG5cbmNsYXNzIFNlcnZpY2VDb250ZXh0IGV4dGVuZHMgQ29uZmlnQ29udGV4dCB7XG4gIEBzY2hlbWEoXG4gICAgam9pSWRlbnRpZmllck1hcChqb2lQcmltaXRpdmUoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIG91dHB1dHMgZGVmaW5lZCBieSB0aGUgc2VydmljZSAoc2VlIGluZGl2aWR1YWwgcGx1Z2lucyBmb3IgZGV0YWlscykuXCIpXG4gICAgICAuZXhhbXBsZShleGFtcGxlT3V0cHV0cyksXG4gICAgKSlcbiAgcHVibGljIG91dHB1dHM6IFByaW1pdGl2ZU1hcFxuXG4gIEBzY2hlbWEoSm9pLnN0cmluZygpLmRlc2NyaXB0aW9uKFwiVGhlIGN1cnJlbnQgdmVyc2lvbiBvZiB0aGUgc2VydmljZS5cIikuZXhhbXBsZShleGFtcGxlVmVyc2lvbikpXG4gIHB1YmxpYyB2ZXJzaW9uOiBzdHJpbmdcblxuICAvLyBUT0RPOiBhZGQgaW5ncmVzc2VzXG5cbiAgY29uc3RydWN0b3Iocm9vdDogQ29uZmlnQ29udGV4dCwgc2VydmljZTogU2VydmljZSwgb3V0cHV0czogUHJpbWl0aXZlTWFwKSB7XG4gICAgc3VwZXIocm9vdClcbiAgICB0aGlzLm91dHB1dHMgPSBvdXRwdXRzXG4gICAgdGhpcy52ZXJzaW9uID0gc2VydmljZS5tb2R1bGUudmVyc2lvbi52ZXJzaW9uU3RyaW5nXG4gIH1cbn1cblxuLyoqXG4gKiBUaGlzIGNvbnRleHQgaXMgYXZhaWxhYmxlIGZvciB0ZW1wbGF0ZSBzdHJpbmdzIHVuZGVyIHRoZSBgbW9kdWxlYCBrZXkgaW4gY29uZmlndXJhdGlvbiBmaWxlcy5cbiAqIEl0IGlzIGEgc3VwZXJzZXQgb2YgdGhlIGNvbnRleHQgYXZhaWxhYmxlIHVuZGVyIHRoZSBgcHJvamVjdGAga2V5LlxuICovXG5leHBvcnQgY2xhc3MgTW9kdWxlQ29uZmlnQ29udGV4dCBleHRlbmRzIFByb2plY3RDb25maWdDb250ZXh0IHtcbiAgQHNjaGVtYShcbiAgICBFbnZpcm9ubWVudENvbnRleHQuZ2V0U2NoZW1hKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIkluZm9ybWF0aW9uIGFib3V0IHRoZSBlbnZpcm9ubWVudCB0aGF0IEdhcmRlbiBpcyBydW5uaW5nIGFnYWluc3QuXCIpLFxuICApXG4gIHB1YmxpYyBlbnZpcm9ubWVudDogRW52aXJvbm1lbnRDb250ZXh0XG5cbiAgQHNjaGVtYShcbiAgICBqb2lJZGVudGlmaWVyTWFwKE1vZHVsZUNvbnRleHQuZ2V0U2NoZW1hKCkpXG4gICAgICAuZGVzY3JpcHRpb24oXCJSZXRyaWV2ZSBpbmZvcm1hdGlvbiBhYm91dCBtb2R1bGVzIHRoYXQgYXJlIGRlZmluZWQgaW4gdGhlIHByb2plY3QuXCIpXG4gICAgICAuZXhhbXBsZSh7IFwibXktbW9kdWxlXCI6IHsgcGF0aDogXCIvaG9tZS9tZS9jb2RlL215LXByb2plY3QvbXktbW9kdWxlXCIsIHZlcnNpb246IGV4YW1wbGVWZXJzaW9uIH0gfSksXG4gIClcbiAgcHVibGljIG1vZHVsZXM6IE1hcDxzdHJpbmcsICgpID0+IFByb21pc2U8TW9kdWxlQ29udGV4dD4+XG5cbiAgQHNjaGVtYShcbiAgICBqb2lJZGVudGlmaWVyTWFwKFNlcnZpY2VDb250ZXh0LmdldFNjaGVtYSgpKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiUmV0cmlldmUgaW5mb3JtYXRpb24gYWJvdXQgc2VydmljZXMgdGhhdCBhcmUgZGVmaW5lZCBpbiB0aGUgcHJvamVjdC5cIilcbiAgICAgIC5leGFtcGxlKHsgXCJteS1zZXJ2aWNlXCI6IHsgb3V0cHV0czogZXhhbXBsZU91dHB1dHMsIHZlcnNpb246IGV4YW1wbGVWZXJzaW9uIH0gfSksXG4gIClcbiAgcHVibGljIHNlcnZpY2VzOiBNYXA8c3RyaW5nLCAoKSA9PiBQcm9taXNlPFNlcnZpY2VDb250ZXh0Pj5cblxuICBAc2NoZW1hKFxuICAgIGpvaUlkZW50aWZpZXJNYXAocHJvdmlkZXJDb25maWdCYXNlU2NoZW1hKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiQSBtYXAgb2YgYWxsIGNvbmZpZ3VyZWQgcGx1Z2lucy9wcm92aWRlcnMgZm9yIHRoaXMgZW52aXJvbm1lbnQgYW5kIHRoZWlyIGNvbmZpZ3VyYXRpb24uXCIpXG4gICAgICAuZXhhbXBsZSh7IGt1YmVybmV0ZXM6IHsgbmFtZTogXCJsb2NhbC1rdWJlcm5ldGVzXCIsIGNvbnRleHQ6IFwibXkta3ViZS1jb250ZXh0XCIgfSB9KSxcbiAgKVxuICBwdWJsaWMgcHJvdmlkZXJzOiBNYXA8c3RyaW5nLCBQcm92aWRlcj5cblxuICAvLyBOT1RFOiBUaGlzIGhhcyBzb21lIG5lZ2F0aXZlIHBlcmZvcm1hbmNlIGltcGxpY2F0aW9ucyBhbmQgbWF5IG5vdCBiZSBzb21ldGhpbmcgd2Ugd2FudCB0byBzdXBwb3J0LFxuICAvLyAgICAgICBzbyBJJ20gZGlzYWJsaW5nIHRoaXMgZmVhdHVyZSBmb3Igbm93LlxuICAvL1xuICAvLyBAZGVzY3JpcHRpb24oXCJVc2UgdGhpcyB0byBsb29rIHVwIHZhbHVlcyB0aGF0IGFyZSBjb25maWd1cmVkIGluIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlwiKVxuICAvLyBwdWJsaWMgY29uZmlnOiBSZW1vdGVDb25maWdDb250ZXh0XG5cbiAgQHNjaGVtYShcbiAgICBqb2lJZGVudGlmaWVyTWFwKGpvaVByaW1pdGl2ZSgpKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiQSBtYXAgb2YgYWxsIHZhcmlhYmxlcyBkZWZpbmVkIGluIHRoZSBwcm9qZWN0IGNvbmZpZ3VyYXRpb24uXCIpXG4gICAgICAuZXhhbXBsZSh7IFwidGVhbS1uYW1lXCI6IFwiYmFuYW5hcmFtYWxsYW1hXCIsIFwic29tZS1zZXJ2aWNlLWVuZHBvaW50XCI6IFwiaHR0cHM6Ly9zb21lc2VydmljZS5jb20vYXBpL3YyXCIgfSksXG4gIClcbiAgcHVibGljIHZhcmlhYmxlczogUHJpbWl0aXZlTWFwXG5cbiAgY29uc3RydWN0b3IoXG4gICAgZ2FyZGVuOiBHYXJkZW4sXG4gICAgZW52aXJvbm1lbnQ6IEVudmlyb25tZW50LFxuICAgIG1vZHVsZUNvbmZpZ3M6IE1vZHVsZUNvbmZpZ1tdLFxuICApIHtcbiAgICBzdXBlcigpXG5cbiAgICBjb25zdCBfdGhpcyA9IHRoaXNcblxuICAgIHRoaXMuZW52aXJvbm1lbnQgPSBuZXcgRW52aXJvbm1lbnRDb250ZXh0KF90aGlzLCBlbnZpcm9ubWVudC5uYW1lKVxuXG4gICAgdGhpcy5tb2R1bGVzID0gbmV3IE1hcChtb2R1bGVDb25maWdzLm1hcCgoY29uZmlnKSA9PlxuICAgICAgPFtzdHJpbmcsICgpID0+IFByb21pc2U8TW9kdWxlQ29udGV4dD5dPltjb25maWcubmFtZSwgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCBtb2R1bGUgPSBhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlKGNvbmZpZy5uYW1lKVxuICAgICAgICByZXR1cm4gbmV3IE1vZHVsZUNvbnRleHQoX3RoaXMsIG1vZHVsZSlcbiAgICAgIH1dLFxuICAgICkpXG5cbiAgICBjb25zdCBzZXJ2aWNlTmFtZXMgPSBmbGF0dGVuKG1vZHVsZUNvbmZpZ3MubWFwKG0gPT4gbS5zZXJ2aWNlQ29uZmlncykpLm1hcChzID0+IHMubmFtZSlcblxuICAgIHRoaXMuc2VydmljZXMgPSBuZXcgTWFwKHNlcnZpY2VOYW1lcy5tYXAoKG5hbWUpID0+XG4gICAgICA8W3N0cmluZywgKCkgPT4gUHJvbWlzZTxTZXJ2aWNlQ29udGV4dD5dPltuYW1lLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHNlcnZpY2UgPSBhd2FpdCBnYXJkZW4uZ2V0U2VydmljZShuYW1lKVxuICAgICAgICBjb25zdCBvdXRwdXRzID0ge1xuICAgICAgICAgIC4uLnNlcnZpY2UuY29uZmlnLm91dHB1dHMsXG4gICAgICAgICAgLi4uYXdhaXQgZ2FyZGVuLmFjdGlvbnMuZ2V0U2VydmljZU91dHB1dHMoeyBzZXJ2aWNlIH0pLFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgU2VydmljZUNvbnRleHQoX3RoaXMsIHNlcnZpY2UsIG91dHB1dHMpXG4gICAgICB9XSxcbiAgICApKVxuXG4gICAgdGhpcy5wcm92aWRlcnMgPSBuZXcgTWFwKGVudmlyb25tZW50LnByb3ZpZGVycy5tYXAocCA9PiA8W3N0cmluZywgUHJvdmlkZXJdPltwLm5hbWUsIHBdKSlcblxuICAgIC8vIHRoaXMuY29uZmlnID0gbmV3IFNlY3JldHNDb250ZXh0Tm9kZShjdHgpXG5cbiAgICB0aGlzLnZhcmlhYmxlcyA9IGVudmlyb25tZW50LnZhcmlhYmxlc1xuICB9XG59XG5cbi8vIGNsYXNzIFJlbW90ZUNvbmZpZ0NvbnRleHQgZXh0ZW5kcyBDb25maWdDb250ZXh0IHtcbi8vICAgY29uc3RydWN0b3IocHJpdmF0ZSBjdHg6IFBsdWdpbkNvbnRleHQpIHtcbi8vICAgICBzdXBlcigpXG4vLyAgIH1cblxuLy8gICBhc3luYyByZXNvbHZlKHsga2V5IH06IFJlc29sdmVQYXJhbXMpIHtcbi8vICAgICBjb25zdCB7IHZhbHVlIH0gPSBhd2FpdCB0aGlzLmN0eC5nZXRTZWNyZXQoeyBrZXkgfSlcbi8vICAgICByZXR1cm4gdmFsdWUgPT09IG51bGwgPyB1bmRlZmluZWQgOiB2YWx1ZVxuLy8gICB9XG4vLyB9XG4iXX0=
