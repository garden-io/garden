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
Object.defineProperty(exports, "__esModule", { value: true });
const Joi = require("joi");
const util_1 = require("../util/util");
const common_1 = require("../config/common");
const module_1 = require("./module");
const service_1 = require("../config/service");
const common_2 = require("../config/common");
const dedent = require("dedent");
const url_1 = require("url");
const base_1 = require("../vcs/base");
const normalizeUrl = require("normalize-url");
exports.serviceSchema = Joi.object()
    .options({ presence: "required" })
    .keys({
    name: common_1.joiIdentifier()
        .description("The name of the service."),
    module: Joi.object().unknown(true),
    config: service_1.serviceConfigSchema,
    spec: Joi.object()
        .description("The raw configuration of the service (specific to each plugin)."),
});
function serviceFromConfig(module, config) {
    return {
        name: config.name,
        module,
        config,
        spec: config.spec,
    };
}
exports.serviceFromConfig = serviceFromConfig;
exports.ingressHostnameSchema = Joi.string()
    .hostname()
    .description(dedent `
    The hostname that should route to this service. Defaults to the default hostname configured
    in the provider configuration.

    Note that if you're developing locally you may need to add this hostname to your hosts file.
  `);
const portSchema = Joi.number()
    .description(dedent `
    The port number that the service is exposed on internally.
    This defaults to the first specified port for the service.
  `);
exports.serviceIngressSpecSchema = Joi.object()
    .keys({
    hostname: exports.ingressHostnameSchema,
    port: portSchema,
    path: Joi.string()
        .default("/")
        .description("The ingress path that should be matched to route to this service."),
    protocol: Joi.string()
        .only("http", "https")
        .required()
        .description("The protocol to use for the ingress."),
});
exports.serviceIngressSchema = exports.serviceIngressSpecSchema
    .keys({
    hostname: Joi.string()
        .required()
        .description("The hostname where the service can be accessed."),
    port: portSchema
        .required(),
})
    .description("A description of a deployed service ingress.");
exports.serviceStatusSchema = Joi.object()
    .keys({
    providerId: Joi.string()
        .description("The ID used for the service by the provider (if not the same as the service name)."),
    providerVersion: Joi.string()
        .description("The provider version of the deployed service (if different from the Garden module version."),
    version: Joi.string()
        .description("The Garden module version of the deployed service."),
    state: Joi.string()
        .only("ready", "deploying", "stopped", "unhealthy", "unknown", "outdated", "missing")
        .default("unknown")
        .description("The current deployment status of the service."),
    runningReplicas: Joi.number()
        .description("How many replicas of the service are currently running."),
    ingresses: Joi.array()
        .items(exports.serviceIngressSchema)
        .description("List of currently deployed ingress endpoints for the service."),
    lastMessage: Joi.string()
        .allow("")
        .description("Latest status message of the service (if any)."),
    lastError: Joi.string()
        .description("Latest error status message of the service (if any)."),
    createdAt: Joi.string()
        .description("When the service was first deployed by the provider."),
    updatedAt: Joi.string()
        .description("When the service was last updated by the provider."),
    detail: Joi.object()
        .meta({ extendable: true })
        .description("Additional detail, specific to the provider."),
});
const runtimeDependencySchema = Joi.object()
    .keys({
    version: base_1.moduleVersionSchema,
    outputs: common_1.joiEnvVars()
        .description("The outputs provided by the service (e.g. ingress URLs etc.)."),
});
exports.runtimeContextSchema = Joi.object()
    .options({ presence: "required" })
    .keys({
    envVars: Joi.object().pattern(/.+/, common_1.joiPrimitive())
        .default(() => ({}), "{}")
        .unknown(false)
        .description("Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
        "(must be uppercase) and values must be primitives."),
    dependencies: common_1.joiIdentifierMap(runtimeDependencySchema)
        .description("Map of all the services that this service or test depends on, and their metadata."),
});
function prepareRuntimeContext(garden, module, serviceDependencies) {
    return __awaiter(this, void 0, void 0, function* () {
        const buildDepKeys = module.build.dependencies.map(dep => module_1.getModuleKey(dep.name, dep.plugin));
        const buildDependencies = yield garden.getModules(buildDepKeys);
        const { versionString } = module.version;
        const envVars = {
            GARDEN_VERSION: versionString,
        };
        for (const [key, value] of Object.entries(garden.environment.variables)) {
            const envVarName = `GARDEN_VARIABLES_${key.replace(/-/g, "_").toUpperCase()}`;
            envVars[envVarName] = value;
        }
        const deps = {};
        for (const m of buildDependencies) {
            deps[m.name] = {
                version: m.version.versionString,
                outputs: {},
            };
        }
        for (const dep of serviceDependencies) {
            if (!deps[dep.name]) {
                deps[dep.name] = {
                    version: dep.module.version.versionString,
                    outputs: {},
                };
            }
            const depContext = deps[dep.name];
            const outputs = Object.assign({}, yield garden.actions.getServiceOutputs({ service: dep }), dep.config.outputs);
            const serviceEnvName = util_1.getEnvVarName(dep.name);
            common_2.validate(outputs, service_1.serviceOutputsSchema, { context: `outputs for service ${dep.name}` });
            for (const [key, value] of Object.entries(outputs)) {
                const envVarName = `GARDEN_SERVICES_${serviceEnvName}_${key}`.toUpperCase();
                envVars[envVarName] = value;
                depContext.outputs[key] = value;
            }
        }
        return {
            envVars,
            dependencies: deps,
        };
    });
}
exports.prepareRuntimeContext = prepareRuntimeContext;
function getIngressUrl(ingress) {
    return normalizeUrl(url_1.format({
        protocol: ingress.protocol,
        hostname: ingress.hostname,
        port: ingress.port,
        pathname: ingress.path,
    }));
}
exports.getIngressUrl = getIngressUrl;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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TyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQTthQUNoQztTQUNGO1FBRUQsT0FBTztZQUNMLE9BQU87WUFDUCxZQUFZLEVBQUUsSUFBSTtTQUNuQixDQUFBO0lBQ0gsQ0FBQztDQUFBO0FBbERELHNEQWtEQztBQUVELFNBQWdCLGFBQWEsQ0FBQyxPQUF1QjtJQUNuRCxPQUFPLFlBQVksQ0FBQyxZQUFNLENBQUM7UUFDekIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO1FBQzFCLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUTtRQUMxQixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7UUFDbEIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxJQUFJO0tBQ3ZCLENBQUMsQ0FBQyxDQUFBO0FBQ0wsQ0FBQztBQVBELHNDQU9DIiwiZmlsZSI6InR5cGVzL3NlcnZpY2UuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IHsgZ2V0RW52VmFyTmFtZSB9IGZyb20gXCIuLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgUHJpbWl0aXZlTWFwLCBqb2lJZGVudGlmaWVyLCBqb2lFbnZWYXJzLCBqb2lJZGVudGlmaWVyTWFwLCBqb2lQcmltaXRpdmUgfSBmcm9tIFwiLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBNb2R1bGUsIGdldE1vZHVsZUtleSB9IGZyb20gXCIuL21vZHVsZVwiXG5pbXBvcnQgeyBzZXJ2aWNlT3V0cHV0c1NjaGVtYSwgU2VydmljZUNvbmZpZywgc2VydmljZUNvbmZpZ1NjaGVtYSB9IGZyb20gXCIuLi9jb25maWcvc2VydmljZVwiXG5pbXBvcnQgeyB2YWxpZGF0ZSB9IGZyb20gXCIuLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgeyBmb3JtYXQgfSBmcm9tIFwidXJsXCJcbmltcG9ydCB7IG1vZHVsZVZlcnNpb25TY2hlbWEgfSBmcm9tIFwiLi4vdmNzL2Jhc2VcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4uL2dhcmRlblwiXG5pbXBvcnQgbm9ybWFsaXplVXJsID0gcmVxdWlyZShcIm5vcm1hbGl6ZS11cmxcIilcblxuZXhwb3J0IGludGVyZmFjZSBTZXJ2aWNlPE0gZXh0ZW5kcyBNb2R1bGUgPSBNb2R1bGU+IHtcbiAgbmFtZTogc3RyaW5nXG4gIG1vZHVsZTogTVxuICBjb25maWc6IE1bXCJzZXJ2aWNlQ29uZmlnc1wiXVswXVxuICBzcGVjOiBNW1wic2VydmljZUNvbmZpZ3NcIl1bMF1bXCJzcGVjXCJdXG59XG5cbmV4cG9ydCBjb25zdCBzZXJ2aWNlU2NoZW1hID0gSm9pLm9iamVjdCgpXG4gIC5vcHRpb25zKHsgcHJlc2VuY2U6IFwicmVxdWlyZWRcIiB9KVxuICAua2V5cyh7XG4gICAgbmFtZTogam9pSWRlbnRpZmllcigpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgbmFtZSBvZiB0aGUgc2VydmljZS5cIiksXG4gICAgbW9kdWxlOiBKb2kub2JqZWN0KCkudW5rbm93bih0cnVlKSwgICAvLyBUaGlzIGNhdXNlcyBhIHN0YWNrIG92ZXJmbG93OiBKb2kubGF6eSgoKSA9PiBtb2R1bGVTY2hlbWEpLFxuICAgIGNvbmZpZzogc2VydmljZUNvbmZpZ1NjaGVtYSxcbiAgICBzcGVjOiBKb2kub2JqZWN0KClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSByYXcgY29uZmlndXJhdGlvbiBvZiB0aGUgc2VydmljZSAoc3BlY2lmaWMgdG8gZWFjaCBwbHVnaW4pLlwiKSxcbiAgfSlcblxuZXhwb3J0IGZ1bmN0aW9uIHNlcnZpY2VGcm9tQ29uZmlnPE0gZXh0ZW5kcyBNb2R1bGUgPSBNb2R1bGU+KG1vZHVsZTogTSwgY29uZmlnOiBTZXJ2aWNlQ29uZmlnKTogU2VydmljZTxNPiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogY29uZmlnLm5hbWUsXG4gICAgbW9kdWxlLFxuICAgIGNvbmZpZyxcbiAgICBzcGVjOiBjb25maWcuc3BlYyxcbiAgfVxufVxuXG5leHBvcnQgdHlwZSBTZXJ2aWNlU3RhdGUgPSBcInJlYWR5XCIgfCBcImRlcGxveWluZ1wiIHwgXCJzdG9wcGVkXCIgfCBcInVuaGVhbHRoeVwiIHwgXCJ1bmtub3duXCIgfCBcIm91dGRhdGVkXCIgfCBcIm1pc3NpbmdcIlxuXG4vLyBUT0RPOiBzdXBwb3J0IFRDUCwgVURQIGFuZCBnUlBDXG5leHBvcnQgdHlwZSBTZXJ2aWNlUHJvdG9jb2wgPSBcImh0dHBcIiB8IFwiaHR0cHNcIiAgLy8gfCBcInRjcFwiIHwgXCJ1ZHBcIlxuXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZpY2VJbmdyZXNzU3BlYyB7XG4gIGhvc3RuYW1lPzogc3RyaW5nXG4gIHBhdGg6IHN0cmluZ1xuICBwb3J0OiBudW1iZXJcbiAgcHJvdG9jb2w6IFNlcnZpY2VQcm90b2NvbFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZpY2VJbmdyZXNzIGV4dGVuZHMgU2VydmljZUluZ3Jlc3NTcGVjIHtcbiAgaG9zdG5hbWU6IHN0cmluZ1xufVxuXG5leHBvcnQgY29uc3QgaW5ncmVzc0hvc3RuYW1lU2NoZW1hID0gSm9pLnN0cmluZygpXG4gIC5ob3N0bmFtZSgpXG4gIC5kZXNjcmlwdGlvbihkZWRlbnRgXG4gICAgVGhlIGhvc3RuYW1lIHRoYXQgc2hvdWxkIHJvdXRlIHRvIHRoaXMgc2VydmljZS4gRGVmYXVsdHMgdG8gdGhlIGRlZmF1bHQgaG9zdG5hbWUgY29uZmlndXJlZFxuICAgIGluIHRoZSBwcm92aWRlciBjb25maWd1cmF0aW9uLlxuXG4gICAgTm90ZSB0aGF0IGlmIHlvdSdyZSBkZXZlbG9waW5nIGxvY2FsbHkgeW91IG1heSBuZWVkIHRvIGFkZCB0aGlzIGhvc3RuYW1lIHRvIHlvdXIgaG9zdHMgZmlsZS5cbiAgYClcblxuY29uc3QgcG9ydFNjaGVtYSA9IEpvaS5udW1iZXIoKVxuICAuZGVzY3JpcHRpb24oZGVkZW50YFxuICAgIFRoZSBwb3J0IG51bWJlciB0aGF0IHRoZSBzZXJ2aWNlIGlzIGV4cG9zZWQgb24gaW50ZXJuYWxseS5cbiAgICBUaGlzIGRlZmF1bHRzIHRvIHRoZSBmaXJzdCBzcGVjaWZpZWQgcG9ydCBmb3IgdGhlIHNlcnZpY2UuXG4gIGApXG5cbmV4cG9ydCBjb25zdCBzZXJ2aWNlSW5ncmVzc1NwZWNTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIGhvc3RuYW1lOiBpbmdyZXNzSG9zdG5hbWVTY2hlbWEsXG4gICAgcG9ydDogcG9ydFNjaGVtYSxcbiAgICBwYXRoOiBKb2kuc3RyaW5nKClcbiAgICAgIC5kZWZhdWx0KFwiL1wiKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGluZ3Jlc3MgcGF0aCB0aGF0IHNob3VsZCBiZSBtYXRjaGVkIHRvIHJvdXRlIHRvIHRoaXMgc2VydmljZS5cIiksXG4gICAgcHJvdG9jb2w6IEpvaS5zdHJpbmcoKVxuICAgICAgLm9ubHkoXCJodHRwXCIsIFwiaHR0cHNcIilcbiAgICAgIC5yZXF1aXJlZCgpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcHJvdG9jb2wgdG8gdXNlIGZvciB0aGUgaW5ncmVzcy5cIiksXG4gIH0pXG5cbmV4cG9ydCBjb25zdCBzZXJ2aWNlSW5ncmVzc1NjaGVtYSA9IHNlcnZpY2VJbmdyZXNzU3BlY1NjaGVtYVxuICAua2V5cyh7XG4gICAgaG9zdG5hbWU6IEpvaS5zdHJpbmcoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBob3N0bmFtZSB3aGVyZSB0aGUgc2VydmljZSBjYW4gYmUgYWNjZXNzZWQuXCIpLFxuICAgIHBvcnQ6IHBvcnRTY2hlbWFcbiAgICAgIC5yZXF1aXJlZCgpLFxuICB9KVxuICAuZGVzY3JpcHRpb24oXCJBIGRlc2NyaXB0aW9uIG9mIGEgZGVwbG95ZWQgc2VydmljZSBpbmdyZXNzLlwiKVxuXG4vLyBUT0RPOiByZXZpc2UgdGhpcyBzY2hlbWFcbmV4cG9ydCBpbnRlcmZhY2UgU2VydmljZVN0YXR1cyB7XG4gIHByb3ZpZGVySWQ/OiBzdHJpbmdcbiAgcHJvdmlkZXJWZXJzaW9uPzogc3RyaW5nXG4gIHZlcnNpb24/OiBzdHJpbmdcbiAgc3RhdGU/OiBTZXJ2aWNlU3RhdGVcbiAgcnVubmluZ1JlcGxpY2FzPzogbnVtYmVyXG4gIGluZ3Jlc3Nlcz86IFNlcnZpY2VJbmdyZXNzW10sXG4gIGxhc3RNZXNzYWdlPzogc3RyaW5nXG4gIGxhc3RFcnJvcj86IHN0cmluZ1xuICBjcmVhdGVkQXQ/OiBzdHJpbmdcbiAgdXBkYXRlZEF0Pzogc3RyaW5nXG4gIGRldGFpbD86IGFueVxufVxuXG5leHBvcnQgY29uc3Qgc2VydmljZVN0YXR1c1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgcHJvdmlkZXJJZDogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgSUQgdXNlZCBmb3IgdGhlIHNlcnZpY2UgYnkgdGhlIHByb3ZpZGVyIChpZiBub3QgdGhlIHNhbWUgYXMgdGhlIHNlcnZpY2UgbmFtZSkuXCIpLFxuICAgIHByb3ZpZGVyVmVyc2lvbjogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcHJvdmlkZXIgdmVyc2lvbiBvZiB0aGUgZGVwbG95ZWQgc2VydmljZSAoaWYgZGlmZmVyZW50IGZyb20gdGhlIEdhcmRlbiBtb2R1bGUgdmVyc2lvbi5cIiksXG4gICAgdmVyc2lvbjogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgR2FyZGVuIG1vZHVsZSB2ZXJzaW9uIG9mIHRoZSBkZXBsb3llZCBzZXJ2aWNlLlwiKSxcbiAgICBzdGF0ZTogSm9pLnN0cmluZygpXG4gICAgICAub25seShcInJlYWR5XCIsIFwiZGVwbG95aW5nXCIsIFwic3RvcHBlZFwiLCBcInVuaGVhbHRoeVwiLCBcInVua25vd25cIiwgXCJvdXRkYXRlZFwiLCBcIm1pc3NpbmdcIilcbiAgICAgIC5kZWZhdWx0KFwidW5rbm93blwiKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGN1cnJlbnQgZGVwbG95bWVudCBzdGF0dXMgb2YgdGhlIHNlcnZpY2UuXCIpLFxuICAgIHJ1bm5pbmdSZXBsaWNhczogSm9pLm51bWJlcigpXG4gICAgICAuZGVzY3JpcHRpb24oXCJIb3cgbWFueSByZXBsaWNhcyBvZiB0aGUgc2VydmljZSBhcmUgY3VycmVudGx5IHJ1bm5pbmcuXCIpLFxuICAgIGluZ3Jlc3NlczogSm9pLmFycmF5KClcbiAgICAgIC5pdGVtcyhzZXJ2aWNlSW5ncmVzc1NjaGVtYSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIkxpc3Qgb2YgY3VycmVudGx5IGRlcGxveWVkIGluZ3Jlc3MgZW5kcG9pbnRzIGZvciB0aGUgc2VydmljZS5cIiksXG4gICAgbGFzdE1lc3NhZ2U6IEpvaS5zdHJpbmcoKVxuICAgICAgLmFsbG93KFwiXCIpXG4gICAgICAuZGVzY3JpcHRpb24oXCJMYXRlc3Qgc3RhdHVzIG1lc3NhZ2Ugb2YgdGhlIHNlcnZpY2UgKGlmIGFueSkuXCIpLFxuICAgIGxhc3RFcnJvcjogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJMYXRlc3QgZXJyb3Igc3RhdHVzIG1lc3NhZ2Ugb2YgdGhlIHNlcnZpY2UgKGlmIGFueSkuXCIpLFxuICAgIGNyZWF0ZWRBdDogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJXaGVuIHRoZSBzZXJ2aWNlIHdhcyBmaXJzdCBkZXBsb3llZCBieSB0aGUgcHJvdmlkZXIuXCIpLFxuICAgIHVwZGF0ZWRBdDogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXCJXaGVuIHRoZSBzZXJ2aWNlIHdhcyBsYXN0IHVwZGF0ZWQgYnkgdGhlIHByb3ZpZGVyLlwiKSxcbiAgICBkZXRhaWw6IEpvaS5vYmplY3QoKVxuICAgICAgLm1ldGEoeyBleHRlbmRhYmxlOiB0cnVlIH0pXG4gICAgICAuZGVzY3JpcHRpb24oXCJBZGRpdGlvbmFsIGRldGFpbCwgc3BlY2lmaWMgdG8gdGhlIHByb3ZpZGVyLlwiKSxcbiAgfSlcblxuZXhwb3J0IHR5cGUgUnVudGltZUNvbnRleHQgPSB7XG4gIGVudlZhcnM6IFByaW1pdGl2ZU1hcFxuICBkZXBlbmRlbmNpZXM6IHtcbiAgICBbbmFtZTogc3RyaW5nXToge1xuICAgICAgdmVyc2lvbjogc3RyaW5nLFxuICAgICAgb3V0cHV0czogUHJpbWl0aXZlTWFwLFxuICAgIH0sXG4gIH0sXG59XG5cbmNvbnN0IHJ1bnRpbWVEZXBlbmRlbmN5U2NoZW1hID0gSm9pLm9iamVjdCgpXG4gIC5rZXlzKHtcbiAgICB2ZXJzaW9uOiBtb2R1bGVWZXJzaW9uU2NoZW1hLFxuICAgIG91dHB1dHM6IGpvaUVudlZhcnMoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIG91dHB1dHMgcHJvdmlkZWQgYnkgdGhlIHNlcnZpY2UgKGUuZy4gaW5ncmVzcyBVUkxzIGV0Yy4pLlwiKSxcbiAgfSlcblxuZXhwb3J0IGNvbnN0IHJ1bnRpbWVDb250ZXh0U2NoZW1hID0gSm9pLm9iamVjdCgpXG4gIC5vcHRpb25zKHsgcHJlc2VuY2U6IFwicmVxdWlyZWRcIiB9KVxuICAua2V5cyh7XG4gICAgZW52VmFyczogSm9pLm9iamVjdCgpLnBhdHRlcm4oLy4rLywgam9pUHJpbWl0aXZlKCkpXG4gICAgICAuZGVmYXVsdCgoKSA9PiAoe30pLCBcInt9XCIpXG4gICAgICAudW5rbm93bihmYWxzZSlcbiAgICAgIC5kZXNjcmlwdGlvbihcbiAgICAgICAgXCJLZXkvdmFsdWUgbWFwIG9mIGVudmlyb25tZW50IHZhcmlhYmxlcy4gS2V5cyBtdXN0IGJlIHZhbGlkIFBPU0lYIGVudmlyb25tZW50IHZhcmlhYmxlIG5hbWVzIFwiICtcbiAgICAgICAgXCIobXVzdCBiZSB1cHBlcmNhc2UpIGFuZCB2YWx1ZXMgbXVzdCBiZSBwcmltaXRpdmVzLlwiLFxuICAgICAgKSxcbiAgICBkZXBlbmRlbmNpZXM6IGpvaUlkZW50aWZpZXJNYXAocnVudGltZURlcGVuZGVuY3lTY2hlbWEpXG4gICAgICAuZGVzY3JpcHRpb24oXCJNYXAgb2YgYWxsIHRoZSBzZXJ2aWNlcyB0aGF0IHRoaXMgc2VydmljZSBvciB0ZXN0IGRlcGVuZHMgb24sIGFuZCB0aGVpciBtZXRhZGF0YS5cIiksXG4gIH0pXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcmVwYXJlUnVudGltZUNvbnRleHQoXG4gIGdhcmRlbjogR2FyZGVuLCBtb2R1bGU6IE1vZHVsZSwgc2VydmljZURlcGVuZGVuY2llczogU2VydmljZVtdLFxuKTogUHJvbWlzZTxSdW50aW1lQ29udGV4dD4ge1xuICBjb25zdCBidWlsZERlcEtleXMgPSBtb2R1bGUuYnVpbGQuZGVwZW5kZW5jaWVzLm1hcChkZXAgPT4gZ2V0TW9kdWxlS2V5KGRlcC5uYW1lLCBkZXAucGx1Z2luKSlcbiAgY29uc3QgYnVpbGREZXBlbmRlbmNpZXM6IE1vZHVsZVtdID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZXMoYnVpbGREZXBLZXlzKVxuICBjb25zdCB7IHZlcnNpb25TdHJpbmcgfSA9IG1vZHVsZS52ZXJzaW9uXG4gIGNvbnN0IGVudlZhcnMgPSB7XG4gICAgR0FSREVOX1ZFUlNJT046IHZlcnNpb25TdHJpbmcsXG4gIH1cblxuICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhnYXJkZW4uZW52aXJvbm1lbnQudmFyaWFibGVzKSkge1xuICAgIGNvbnN0IGVudlZhck5hbWUgPSBgR0FSREVOX1ZBUklBQkxFU18ke2tleS5yZXBsYWNlKC8tL2csIFwiX1wiKS50b1VwcGVyQ2FzZSgpfWBcbiAgICBlbnZWYXJzW2VudlZhck5hbWVdID0gdmFsdWVcbiAgfVxuXG4gIGNvbnN0IGRlcHMgPSB7fVxuXG4gIGZvciAoY29uc3QgbSBvZiBidWlsZERlcGVuZGVuY2llcykge1xuICAgIGRlcHNbbS5uYW1lXSA9IHtcbiAgICAgIHZlcnNpb246IG0udmVyc2lvbi52ZXJzaW9uU3RyaW5nLFxuICAgICAgb3V0cHV0czoge30sXG4gICAgfVxuICB9XG5cbiAgZm9yIChjb25zdCBkZXAgb2Ygc2VydmljZURlcGVuZGVuY2llcykge1xuICAgIGlmICghZGVwc1tkZXAubmFtZV0pIHtcbiAgICAgIGRlcHNbZGVwLm5hbWVdID0ge1xuICAgICAgICB2ZXJzaW9uOiBkZXAubW9kdWxlLnZlcnNpb24udmVyc2lvblN0cmluZyxcbiAgICAgICAgb3V0cHV0czoge30sXG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGRlcENvbnRleHQgPSBkZXBzW2RlcC5uYW1lXVxuXG4gICAgY29uc3Qgb3V0cHV0cyA9IHsgLi4uYXdhaXQgZ2FyZGVuLmFjdGlvbnMuZ2V0U2VydmljZU91dHB1dHMoeyBzZXJ2aWNlOiBkZXAgfSksIC4uLmRlcC5jb25maWcub3V0cHV0cyB9XG4gICAgY29uc3Qgc2VydmljZUVudk5hbWUgPSBnZXRFbnZWYXJOYW1lKGRlcC5uYW1lKVxuXG4gICAgdmFsaWRhdGUob3V0cHV0cywgc2VydmljZU91dHB1dHNTY2hlbWEsIHsgY29udGV4dDogYG91dHB1dHMgZm9yIHNlcnZpY2UgJHtkZXAubmFtZX1gIH0pXG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvdXRwdXRzKSkge1xuICAgICAgY29uc3QgZW52VmFyTmFtZSA9IGBHQVJERU5fU0VSVklDRVNfJHtzZXJ2aWNlRW52TmFtZX1fJHtrZXl9YC50b1VwcGVyQ2FzZSgpXG5cbiAgICAgIGVudlZhcnNbZW52VmFyTmFtZV0gPSB2YWx1ZVxuICAgICAgZGVwQ29udGV4dC5vdXRwdXRzW2tleV0gPSB2YWx1ZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZW52VmFycyxcbiAgICBkZXBlbmRlbmNpZXM6IGRlcHMsXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEluZ3Jlc3NVcmwoaW5ncmVzczogU2VydmljZUluZ3Jlc3MpIHtcbiAgcmV0dXJuIG5vcm1hbGl6ZVVybChmb3JtYXQoe1xuICAgIHByb3RvY29sOiBpbmdyZXNzLnByb3RvY29sLFxuICAgIGhvc3RuYW1lOiBpbmdyZXNzLmhvc3RuYW1lLFxuICAgIHBvcnQ6IGluZ3Jlc3MucG9ydCxcbiAgICBwYXRobmFtZTogaW5ncmVzcy5wYXRoLFxuICB9KSlcbn1cbiJdfQ==
