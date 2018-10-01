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
const path_1 = require("path");
const url_1 = require("url");
const constants_1 = require("../../constants");
const exceptions_1 = require("../../exceptions");
const garden_1 = require("../../garden");
const common_1 = require("../../config/common");
const generic_1 = require("../generic");
const namespace_1 = require("../kubernetes/namespace");
const lodash_1 = require("lodash");
const util_1 = require("../../util/util");
const execa = require("execa");
const api_1 = require("../kubernetes/api");
const status_1 = require("../kubernetes/status");
const system_1 = require("../kubernetes/system");
const project_1 = require("../../config/project");
const dedent = require("dedent");
const systemProjectPath = path_1.join(constants_1.STATIC_DIR, "openfaas", "system");
exports.stackFilename = "stack.yml";
exports.FAAS_CLI_IMAGE_ID = "openfaas/faas-cli:0.7.3";
exports.openfaasModuleSpecSchame = generic_1.genericModuleSpecSchema
    .keys({
    dependencies: common_1.joiArray(Joi.string())
        .description("The names of services/functions that this function depends on at runtime."),
    handler: Joi.string()
        .default(".")
        .uri({ relativeOnly: true })
        .description("Specify which directory under the module contains the handler file/function."),
    image: Joi.string()
        .description("The image name to use for the built OpenFaaS container (defaults to the module name)"),
    lang: Joi.string()
        .required()
        .description("The OpenFaaS language template to use to build this function."),
})
    .unknown(false)
    .description("The module specification for an OpenFaaS module.");
const configSchema = project_1.providerConfigBaseSchema
    .keys({
    hostname: Joi.string()
        .hostname()
        .description(dedent `
        The hostname to configure for the function gateway.
        Defaults to the default hostname of the configured Kubernetes provider.

        Important: If you have other types of services, this should be different from their ingress hostnames,
        or the other services should not expose paths under /function and /system to avoid routing conflicts.`)
        .example("functions.mydomain.com"),
});
function gardenPlugin({ config }) {
    config = common_1.validate(config, configSchema, { context: "OpenFaaS provider config" });
    return {
        modules: [path_1.join(constants_1.STATIC_DIR, "openfaas", "builder")],
        actions: {
            getEnvironmentStatus({ ctx }) {
                return __awaiter(this, void 0, void 0, function* () {
                    const ofGarden = yield getOpenFaasGarden(ctx);
                    const status = yield ofGarden.actions.getStatus();
                    const envReady = lodash_1.every(lodash_1.values(status.providers).map(s => s.ready));
                    const servicesReady = lodash_1.every(lodash_1.values(status.services).map(s => s.state === "ready"));
                    return {
                        ready: envReady && servicesReady,
                        detail: status,
                    };
                });
            },
            prepareEnvironment({ ctx, force }) {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO: refactor to dedupe similar code in local-kubernetes
                    const ofGarden = yield getOpenFaasGarden(ctx);
                    yield ofGarden.actions.prepareEnvironment({ force });
                    const results = yield ofGarden.actions.deployServices({});
                    const failed = lodash_1.values(results.taskResults).filter(r => !!r.error).length;
                    if (failed) {
                        throw new exceptions_1.PluginError(`openfaas: ${failed} errors occurred when configuring environment`, {
                            results,
                        });
                    }
                    return {};
                });
            },
            cleanupEnvironment({ ctx }) {
                return __awaiter(this, void 0, void 0, function* () {
                    const ofGarden = yield getOpenFaasGarden(ctx);
                    return ofGarden.actions.cleanupEnvironment({});
                });
            },
        },
        moduleActions: {
            openfaas: {
                validate({ moduleConfig }) {
                    return __awaiter(this, void 0, void 0, function* () {
                        moduleConfig.spec = common_1.validate(moduleConfig.spec, exports.openfaasModuleSpecSchame, { context: `module ${moduleConfig.name}` });
                        moduleConfig.build.command = [
                            "faas-cli",
                            "build",
                            "-f", exports.stackFilename,
                        ];
                        moduleConfig.build.dependencies.push({
                            name: "builder",
                            plugin: "openfaas",
                            copy: [{
                                    source: "*",
                                    target: ".",
                                }],
                        });
                        moduleConfig.serviceConfigs = [{
                                dependencies: [],
                                name: moduleConfig.name,
                                outputs: {},
                                spec: {
                                    name: moduleConfig.name,
                                    dependencies: [],
                                    outputs: {},
                                },
                            }];
                        moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
                            name: t.name,
                            dependencies: t.dependencies,
                            spec: t,
                            timeout: t.timeout,
                        }));
                        return moduleConfig;
                    });
                },
                getBuildStatus: generic_1.getGenericModuleBuildStatus,
                build(params) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { ctx, module } = params;
                        // prepare the stack.yml file, before handing off the build to the generic handler
                        yield writeStackFile(ctx, module, {});
                        return generic_1.buildGenericModule(params);
                    });
                },
                // TODO: design and implement a proper test flow for openfaas functions
                testModule: generic_1.testGenericModule,
                getServiceStatus,
                getServiceOutputs({ ctx, service }) {
                    return __awaiter(this, void 0, void 0, function* () {
                        return {
                            endpoint: yield getInternalServiceUrl(ctx, service),
                        };
                    });
                },
                deployService(params) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { ctx, module, service, logEntry, runtimeContext } = params;
                        // write the stack file again with environment variables
                        yield writeStackFile(ctx, module, runtimeContext.envVars);
                        // use faas-cli to do the deployment
                        yield execa("faas-cli", ["deploy", "-f", exports.stackFilename], { cwd: module.buildPath });
                        // wait until deployment is ready
                        const k8sProvider = getK8sProvider(ctx);
                        const namespace = yield namespace_1.getAppNamespace(ctx, k8sProvider);
                        const api = new api_1.KubeApi(k8sProvider);
                        const deployment = (yield api.apps.readNamespacedDeployment(service.name, namespace)).body;
                        yield status_1.waitForObjects({ ctx, provider: k8sProvider, service, logEntry, objects: [deployment] });
                        // TODO: avoid duplicate work here
                        return getServiceStatus(params);
                    });
                },
                deleteService(params) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { ctx, logEntry, service, runtimeContext } = params;
                        let status;
                        let found = true;
                        try {
                            status = yield getServiceStatus({
                                ctx,
                                service,
                                runtimeContext,
                                module: service.module,
                            });
                            found = !!status.state;
                            yield execa("faas-cli", ["remove", "-f", exports.stackFilename], { cwd: service.module.buildPath });
                        }
                        catch (err) {
                            found = false;
                        }
                        if (logEntry) {
                            found ? logEntry.setSuccess("Service deleted") : logEntry.setWarn("Service not deployed");
                        }
                        return status;
                    });
                },
            },
        },
    };
}
exports.gardenPlugin = gardenPlugin;
function writeStackFile(ctx, module, envVars) {
    return __awaiter(this, void 0, void 0, function* () {
        const image = getImageName(module);
        const stackPath = path_1.join(module.buildPath, exports.stackFilename);
        return util_1.dumpYaml(stackPath, {
            provider: {
                name: "faas",
                gateway: getExternalGatewayUrl(ctx),
            },
            functions: {
                [module.name]: {
                    lang: module.spec.lang,
                    handler: module.spec.handler,
                    image,
                    environment: envVars,
                },
            },
        });
    });
}
function getServiceStatus({ ctx, service }) {
    return __awaiter(this, void 0, void 0, function* () {
        const k8sProvider = getK8sProvider(ctx);
        const ingresses = [{
                hostname: getExternalGatewayHostname(ctx.provider, k8sProvider),
                path: getServicePath(service),
                port: k8sProvider.config.ingressHttpPort,
                protocol: "http",
            }];
        const namespace = yield namespace_1.getAppNamespace(ctx, k8sProvider);
        const api = new api_1.KubeApi(k8sProvider);
        let deployment;
        try {
            deployment = (yield api.apps.readNamespacedDeployment(service.name, namespace)).body;
        }
        catch (err) {
            if (err.code === 404) {
                return {};
            }
            else {
                throw err;
            }
        }
        const container = util_1.findByName(deployment.spec.template.spec.containers, "hello-function");
        const version = util_1.findByName(container.env, "GARDEN_VERSION").value;
        const status = yield status_1.checkDeploymentStatus(api, namespace, deployment);
        return {
            state: status.state,
            version,
            ingresses,
        };
    });
}
function getImageName(module) {
    return `${module.name || module.spec.image}:${module.version.versionString}`;
}
// NOTE: we're currently not using the CRD/operator, but might change that in the future
//
// async function createFunctionObject(service: OpenFaasService, namespace: string): Promise<KubernetesObject> {
//   const image = await getImageName(service.module)
//   return {
//     apiVersion: "openfaas.com/v1alpha2",
//     kind: "Function",
//     metadata: {
//       name: service.name,
//       namespace,
//     },
//     spec: {
//       name: service.name,
//       image,
//       labels: {
//         "com.openfaas.scale.min": "1",
//         "com.openfaas.scale.max": "5",
//       },
//       environment: {
//         write_debug: "true",
//       },
//       limits: {
//         cpu: DEFAULT_CPU_LIMIT,
//         memory: DEFAULT_MEMORY_LIMIT,
//       },
//       requests: {
//         cpu: DEFAULT_CPU_REQUEST,
//         memory: DEFAULT_MEMORY_REQUEST,
//       },
//     },
//   }
// }
function getK8sProvider(ctx) {
    const provider = ctx.providers["local-kubernetes"] || ctx.providers.kubernetes;
    if (!provider) {
        throw new exceptions_1.ConfigurationError(`openfaas requires a kubernetes (or local-kubernetes) provider to be configured`, {
            configuredProviders: Object.keys(ctx.providers),
        });
    }
    return provider;
}
function getServicePath(service) {
    return path_1.join("/", "function", service.name);
}
function getInternalGatewayUrl(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        const k8sProvider = getK8sProvider(ctx);
        const namespace = yield getOpenfaasNamespace(ctx, k8sProvider, true);
        return `http://gateway.${namespace}.svc.cluster.local:8080`;
    });
}
function getExternalGatewayHostname(provider, k8sProvider) {
    const hostname = provider.config.hostname || k8sProvider.config.defaultHostname;
    if (!hostname) {
        throw new exceptions_1.ConfigurationError(`openfaas: Must configure hostname if no default hostname is configured on Kubernetes provider.`, {
            config: provider,
        });
    }
    return hostname;
}
function getExternalGatewayUrl(ctx) {
    const k8sProvider = getK8sProvider(ctx);
    const hostname = getExternalGatewayHostname(ctx.provider, k8sProvider);
    const ingressPort = k8sProvider.config.ingressHttpPort;
    return `http://${hostname}:${ingressPort}`;
}
function getInternalServiceUrl(ctx, service) {
    return __awaiter(this, void 0, void 0, function* () {
        return url_1.resolve(yield getInternalGatewayUrl(ctx), getServicePath(service));
    });
}
function getOpenfaasNamespace(ctx, k8sProvider, skipCreate) {
    return __awaiter(this, void 0, void 0, function* () {
        return namespace_1.getNamespace({ ctx, provider: k8sProvider, skipCreate, suffix: "openfaas" });
    });
}
function getOpenFaasGarden(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: figure out good way to retrieve namespace from kubernetes plugin through an exposed interface
        // (maybe allow plugins to expose arbitrary data on the Provider object?)
        const k8sProvider = getK8sProvider(ctx);
        const namespace = yield getOpenfaasNamespace(ctx, k8sProvider, true);
        const functionNamespace = yield namespace_1.getAppNamespace(ctx, k8sProvider);
        const hostname = getExternalGatewayHostname(ctx.provider, k8sProvider);
        // TODO: allow passing variables/parameters here to be parsed as part of the garden.yml project config
        // (this would allow us to use a garden.yml for the project config, instead of speccing it here)
        return garden_1.Garden.factory(systemProjectPath, {
            env: "default",
            config: {
                version: "0",
                dirname: "system",
                path: systemProjectPath,
                project: {
                    name: `${ctx.projectName}-openfaas`,
                    environmentDefaults: {
                        providers: [],
                        variables: {},
                    },
                    defaultEnvironment: "default",
                    environments: [
                        {
                            name: "default",
                            providers: [
                                Object.assign({}, k8sProvider.config, { namespace, 
                                    // TODO: this is clumsy, we should find a better way to configure this
                                    _system: system_1.systemSymbol }),
                            ],
                            variables: {
                                "function-namespace": functionNamespace,
                                "gateway-hostname": hostname,
                            },
                        },
                    ],
                },
            },
        });
    });
}
exports.getOpenFaasGarden = getOpenFaasGarden;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvb3BlbmZhYXMvb3BlbmZhYXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILDJCQUEwQjtBQUMxQiwrQkFBMkI7QUFDM0IsNkJBQTJDO0FBQzNDLCtDQUE0QztBQUM1QyxpREFBa0U7QUFDbEUseUNBQXFDO0FBRXJDLGdEQUFzRTtBQWN0RSx3Q0FPbUI7QUFFbkIsdURBQXVFO0FBT3ZFLG1DQUFzQztBQUN0QywwQ0FBc0Q7QUFDdEQsK0JBQThCO0FBQzlCLDJDQUEyQztBQUMzQyxpREFBNEU7QUFDNUUsaURBQW1EO0FBR25ELGtEQUF5RTtBQUN6RSxpQ0FBaUM7QUFFakMsTUFBTSxpQkFBaUIsR0FBRyxXQUFJLENBQUMsc0JBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUE7QUFDbkQsUUFBQSxhQUFhLEdBQUcsV0FBVyxDQUFBO0FBQzNCLFFBQUEsaUJBQWlCLEdBQUcseUJBQXlCLENBQUE7QUFRN0MsUUFBQSx3QkFBd0IsR0FBRyxpQ0FBdUI7S0FDNUQsSUFBSSxDQUFDO0lBQ0osWUFBWSxFQUFFLGlCQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1NBQ2pDLFdBQVcsQ0FBQywyRUFBMkUsQ0FBQztJQUMzRixPQUFPLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtTQUNsQixPQUFPLENBQUMsR0FBRyxDQUFDO1NBQ1osR0FBRyxDQUFPLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRyxDQUFDO1NBQ2xDLFdBQVcsQ0FBQyw4RUFBOEUsQ0FBQztJQUM5RixLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtTQUNoQixXQUFXLENBQUMsc0ZBQXNGLENBQUM7SUFDdEcsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUU7U0FDZixRQUFRLEVBQUU7U0FDVixXQUFXLENBQUMsK0RBQStELENBQUM7Q0FDaEYsQ0FBQztLQUNELE9BQU8sQ0FBQyxLQUFLLENBQUM7S0FD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QUFDLENBQUE7UUFDcEUsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLDJCQUFlLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFBO1FBRWpFLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUE7UUFFdEUsc0dBQXNHO1FBQ3RHLGdHQUFnRztRQUNoRyxPQUFPLGVBQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUU7WUFDdkMsR0FBRyxFQUFFLFNBQVM7WUFDZCxNQUFNLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLFFBQVE7Z0JBQ2pCLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLE9BQU8sRUFBRTtvQkFDUCxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsV0FBVyxXQUFXO29CQUNuQyxtQkFBbUIsRUFBRTt3QkFDbkIsU0FBUyxFQUFFLEVBQUU7d0JBQ2IsU0FBUyxFQUFFLEVBQUU7cUJBQ2Q7b0JBQ0Qsa0JBQWtCLEVBQUUsU0FBUztvQkFDN0IsWUFBWSxFQUFFO3dCQUNaOzRCQUNFLElBQUksRUFBRSxTQUFTOzRCQUNmLFNBQVMsRUFBRTtrREFFSixXQUFXLENBQUMsTUFBTSxJQUNyQixTQUFTO29DQUNULHNFQUFzRTtvQ0FDdEUsT0FBTyxFQUFFLHFCQUFZOzZCQUV4Qjs0QkFDRCxTQUFTLEVBQUU7Z0NBQ1Qsb0JBQW9CLEVBQUUsaUJBQWlCO2dDQUN2QyxrQkFBa0IsRUFBRSxRQUFROzZCQUM3Qjt5QkFDRjtxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQztDQUFBO0FBNUNELDhDQTRDQyIsImZpbGUiOiJwbHVnaW5zL29wZW5mYWFzL29wZW5mYWFzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyByZXNvbHZlIGFzIHVybFJlc29sdmUgfSBmcm9tIFwidXJsXCJcbmltcG9ydCB7IFNUQVRJQ19ESVIgfSBmcm9tIFwiLi4vLi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IFBsdWdpbkVycm9yLCBDb25maWd1cmF0aW9uRXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vLi4vZ2FyZGVuXCJcbmltcG9ydCB7IFBsdWdpbkNvbnRleHQgfSBmcm9tIFwiLi4vLi4vcGx1Z2luLWNvbnRleHRcIlxuaW1wb3J0IHsgam9pQXJyYXksIHZhbGlkYXRlLCBQcmltaXRpdmVNYXAgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7IFZhbGlkYXRlTW9kdWxlUmVzdWx0IH0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9vdXRwdXRzXCJcbmltcG9ydCB7XG4gIFByZXBhcmVFbnZpcm9ubWVudFBhcmFtcyxcbiAgR2V0RW52aXJvbm1lbnRTdGF0dXNQYXJhbXMsXG4gIFZhbGlkYXRlTW9kdWxlUGFyYW1zLFxuICBEZWxldGVTZXJ2aWNlUGFyYW1zLFxufSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQge1xuICBTZXJ2aWNlU3RhdHVzLFxuICBTZXJ2aWNlSW5ncmVzcyxcbiAgU2VydmljZSxcbn0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHtcbiAgYnVpbGRHZW5lcmljTW9kdWxlLFxuICBHZW5lcmljTW9kdWxlU3BlYyxcbiAgZ2VuZXJpY01vZHVsZVNwZWNTY2hlbWEsXG4gIEdlbmVyaWNUZXN0U3BlYyxcbiAgdGVzdEdlbmVyaWNNb2R1bGUsXG4gIGdldEdlbmVyaWNNb2R1bGVCdWlsZFN0YXR1cyxcbn0gZnJvbSBcIi4uL2dlbmVyaWNcIlxuaW1wb3J0IHsgS3ViZXJuZXRlc1Byb3ZpZGVyIH0gZnJvbSBcIi4uL2t1YmVybmV0ZXMva3ViZXJuZXRlc1wiXG5pbXBvcnQgeyBnZXROYW1lc3BhY2UsIGdldEFwcE5hbWVzcGFjZSB9IGZyb20gXCIuLi9rdWJlcm5ldGVzL25hbWVzcGFjZVwiXG5pbXBvcnQge1xuICBEZXBsb3lTZXJ2aWNlUGFyYW1zLFxuICBHZXRTZXJ2aWNlU3RhdHVzUGFyYW1zLFxuICBCdWlsZE1vZHVsZVBhcmFtcyxcbiAgR2V0U2VydmljZU91dHB1dHNQYXJhbXMsXG59IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IGV2ZXJ5LCB2YWx1ZXMgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7IGR1bXBZYW1sLCBmaW5kQnlOYW1lIH0gZnJvbSBcIi4uLy4uL3V0aWwvdXRpbFwiXG5pbXBvcnQgKiBhcyBleGVjYSBmcm9tIFwiZXhlY2FcIlxuaW1wb3J0IHsgS3ViZUFwaSB9IGZyb20gXCIuLi9rdWJlcm5ldGVzL2FwaVwiXG5pbXBvcnQgeyB3YWl0Rm9yT2JqZWN0cywgY2hlY2tEZXBsb3ltZW50U3RhdHVzIH0gZnJvbSBcIi4uL2t1YmVybmV0ZXMvc3RhdHVzXCJcbmltcG9ydCB7IHN5c3RlbVN5bWJvbCB9IGZyb20gXCIuLi9rdWJlcm5ldGVzL3N5c3RlbVwiXG5pbXBvcnQgeyBCYXNlU2VydmljZVNwZWMgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3NlcnZpY2VcIlxuaW1wb3J0IHsgR2FyZGVuUGx1Z2luIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9wbHVnaW5cIlxuaW1wb3J0IHsgUHJvdmlkZXIsIHByb3ZpZGVyQ29uZmlnQmFzZVNjaGVtYSB9IGZyb20gXCIuLi8uLi9jb25maWcvcHJvamVjdFwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5jb25zdCBzeXN0ZW1Qcm9qZWN0UGF0aCA9IGpvaW4oU1RBVElDX0RJUiwgXCJvcGVuZmFhc1wiLCBcInN5c3RlbVwiKVxuZXhwb3J0IGNvbnN0IHN0YWNrRmlsZW5hbWUgPSBcInN0YWNrLnltbFwiXG5leHBvcnQgY29uc3QgRkFBU19DTElfSU1BR0VfSUQgPSBcIm9wZW5mYWFzL2ZhYXMtY2xpOjAuNy4zXCJcblxuZXhwb3J0IGludGVyZmFjZSBPcGVuRmFhc01vZHVsZVNwZWMgZXh0ZW5kcyBHZW5lcmljTW9kdWxlU3BlYyB7XG4gIGhhbmRsZXI6IHN0cmluZ1xuICBpbWFnZTogc3RyaW5nXG4gIGxhbmc6IHN0cmluZ1xufVxuXG5leHBvcnQgY29uc3Qgb3BlbmZhYXNNb2R1bGVTcGVjU2NoYW1lID0gZ2VuZXJpY01vZHVsZVNwZWNTY2hlbWFcbiAgLmtleXMoe1xuICAgIGRlcGVuZGVuY2llczogam9pQXJyYXkoSm9pLnN0cmluZygpKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIG5hbWVzIG9mIHNlcnZpY2VzL2Z1bmN0aW9ucyB0aGF0IHRoaXMgZnVuY3Rpb24gZGVwZW5kcyBvbiBhdCBydW50aW1lLlwiKSxcbiAgICBoYW5kbGVyOiBKb2kuc3RyaW5nKClcbiAgICAgIC5kZWZhdWx0KFwiLlwiKVxuICAgICAgLnVyaSgoPGFueT57IHJlbGF0aXZlT25seTogdHJ1ZSB9KSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIlNwZWNpZnkgd2hpY2ggZGlyZWN0b3J5IHVuZGVyIHRoZSBtb2R1bGUgY29udGFpbnMgdGhlIGhhbmRsZXIgZmlsZS9mdW5jdGlvbi5cIiksXG4gICAgaW1hZ2U6IEpvaS5zdHJpbmcoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGltYWdlIG5hbWUgdG8gdXNlIGZvciB0aGUgYnVpbHQgT3BlbkZhYVMgY29udGFpbmVyIChkZWZhdWx0cyB0byB0aGUgbW9kdWxlIG5hbWUpXCIpLFxuICAgIGxhbmc6IEpvaS5zdHJpbmcoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBPcGVuRmFhUyBsYW5ndWFnZSB0ZW1wbGF0ZSB0byB1c2UgdG8gYnVpbGQgdGhpcyBmdW5jdGlvbi5cIiksXG4gIH0pXG4gIC51bmtub3duKGZhbHNlKVxuICAuZGVzY3JpcHRpb24oXCJUaGUgbW9kdWxlIHNwZWNpZmljYXRpb24gZm9yIGFuIE9wZW5GYWFTIG1vZHVsZS5cIilcblxuZXhwb3J0IGludGVyZmFjZSBPcGVuRmFhc01vZHVsZSBleHRlbmRzIE1vZHVsZTxPcGVuRmFhc01vZHVsZVNwZWMsIEJhc2VTZXJ2aWNlU3BlYywgR2VuZXJpY1Rlc3RTcGVjPiB7IH1cbmV4cG9ydCBpbnRlcmZhY2UgT3BlbkZhYXNTZXJ2aWNlIGV4dGVuZHMgU2VydmljZTxPcGVuRmFhc01vZHVsZT4geyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3BlbkZhYXNDb25maWcgZXh0ZW5kcyBQcm92aWRlciB7XG4gIGhvc3RuYW1lOiBzdHJpbmdcbn1cblxuY29uc3QgY29uZmlnU2NoZW1hID0gcHJvdmlkZXJDb25maWdCYXNlU2NoZW1hXG4gIC5rZXlzKHtcbiAgICBob3N0bmFtZTogSm9pLnN0cmluZygpXG4gICAgICAuaG9zdG5hbWUoKVxuICAgICAgLmRlc2NyaXB0aW9uKGRlZGVudGBcbiAgICAgICAgVGhlIGhvc3RuYW1lIHRvIGNvbmZpZ3VyZSBmb3IgdGhlIGZ1bmN0aW9uIGdhdGV3YXkuXG4gICAgICAgIERlZmF1bHRzIHRvIHRoZSBkZWZhdWx0IGhvc3RuYW1lIG9mIHRoZSBjb25maWd1cmVkIEt1YmVybmV0ZXMgcHJvdmlkZXIuXG5cbiAgICAgICAgSW1wb3J0YW50OiBJZiB5b3UgaGF2ZSBvdGhlciB0eXBlcyBvZiBzZXJ2aWNlcywgdGhpcyBzaG91bGQgYmUgZGlmZmVyZW50IGZyb20gdGhlaXIgaW5ncmVzcyBob3N0bmFtZXMsXG4gICAgICAgIG9yIHRoZSBvdGhlciBzZXJ2aWNlcyBzaG91bGQgbm90IGV4cG9zZSBwYXRocyB1bmRlciAvZnVuY3Rpb24gYW5kIC9zeXN0ZW0gdG8gYXZvaWQgcm91dGluZyBjb25mbGljdHMuYCxcbiAgICAgIClcbiAgICAgIC5leGFtcGxlKFwiZnVuY3Rpb25zLm15ZG9tYWluLmNvbVwiKSxcbiAgfSlcblxudHlwZSBPcGVuRmFhc1Byb3ZpZGVyID0gUHJvdmlkZXI8T3BlbkZhYXNDb25maWc+XG5cbmV4cG9ydCBmdW5jdGlvbiBnYXJkZW5QbHVnaW4oeyBjb25maWcgfTogeyBjb25maWc6IE9wZW5GYWFzQ29uZmlnIH0pOiBHYXJkZW5QbHVnaW4ge1xuICBjb25maWcgPSB2YWxpZGF0ZShjb25maWcsIGNvbmZpZ1NjaGVtYSwgeyBjb250ZXh0OiBcIk9wZW5GYWFTIHByb3ZpZGVyIGNvbmZpZ1wiIH0pXG5cbiAgcmV0dXJuIHtcbiAgICBtb2R1bGVzOiBbam9pbihTVEFUSUNfRElSLCBcIm9wZW5mYWFzXCIsIFwiYnVpbGRlclwiKV0sXG4gICAgYWN0aW9uczoge1xuICAgICAgYXN5bmMgZ2V0RW52aXJvbm1lbnRTdGF0dXMoeyBjdHggfTogR2V0RW52aXJvbm1lbnRTdGF0dXNQYXJhbXMpIHtcbiAgICAgICAgY29uc3Qgb2ZHYXJkZW4gPSBhd2FpdCBnZXRPcGVuRmFhc0dhcmRlbihjdHgpXG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IG9mR2FyZGVuLmFjdGlvbnMuZ2V0U3RhdHVzKClcbiAgICAgICAgY29uc3QgZW52UmVhZHkgPSBldmVyeSh2YWx1ZXMoc3RhdHVzLnByb3ZpZGVycykubWFwKHMgPT4gcy5yZWFkeSkpXG4gICAgICAgIGNvbnN0IHNlcnZpY2VzUmVhZHkgPSBldmVyeSh2YWx1ZXMoc3RhdHVzLnNlcnZpY2VzKS5tYXAocyA9PiBzLnN0YXRlID09PSBcInJlYWR5XCIpKVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVhZHk6IGVudlJlYWR5ICYmIHNlcnZpY2VzUmVhZHksXG4gICAgICAgICAgZGV0YWlsOiBzdGF0dXMsXG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIGFzeW5jIHByZXBhcmVFbnZpcm9ubWVudCh7IGN0eCwgZm9yY2UgfTogUHJlcGFyZUVudmlyb25tZW50UGFyYW1zKSB7XG4gICAgICAgIC8vIFRPRE86IHJlZmFjdG9yIHRvIGRlZHVwZSBzaW1pbGFyIGNvZGUgaW4gbG9jYWwta3ViZXJuZXRlc1xuICAgICAgICBjb25zdCBvZkdhcmRlbiA9IGF3YWl0IGdldE9wZW5GYWFzR2FyZGVuKGN0eClcblxuICAgICAgICBhd2FpdCBvZkdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7IGZvcmNlIH0pXG5cbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IG9mR2FyZGVuLmFjdGlvbnMuZGVwbG95U2VydmljZXMoe30pXG4gICAgICAgIGNvbnN0IGZhaWxlZCA9IHZhbHVlcyhyZXN1bHRzLnRhc2tSZXN1bHRzKS5maWx0ZXIociA9PiAhIXIuZXJyb3IpLmxlbmd0aFxuXG4gICAgICAgIGlmIChmYWlsZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGx1Z2luRXJyb3IoYG9wZW5mYWFzOiAke2ZhaWxlZH0gZXJyb3JzIG9jY3VycmVkIHdoZW4gY29uZmlndXJpbmcgZW52aXJvbm1lbnRgLCB7XG4gICAgICAgICAgICByZXN1bHRzLFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge31cbiAgICAgIH0sXG5cbiAgICAgIGFzeW5jIGNsZWFudXBFbnZpcm9ubWVudCh7IGN0eCB9KSB7XG4gICAgICAgIGNvbnN0IG9mR2FyZGVuID0gYXdhaXQgZ2V0T3BlbkZhYXNHYXJkZW4oY3R4KVxuXG4gICAgICAgIHJldHVybiBvZkdhcmRlbi5hY3Rpb25zLmNsZWFudXBFbnZpcm9ubWVudCh7fSlcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtb2R1bGVBY3Rpb25zOiB7XG4gICAgICBvcGVuZmFhczoge1xuICAgICAgICBhc3luYyB2YWxpZGF0ZSh7IG1vZHVsZUNvbmZpZyB9OiBWYWxpZGF0ZU1vZHVsZVBhcmFtczxPcGVuRmFhc01vZHVsZT4pOiBQcm9taXNlPFZhbGlkYXRlTW9kdWxlUmVzdWx0PiB7XG4gICAgICAgICAgbW9kdWxlQ29uZmlnLnNwZWMgPSB2YWxpZGF0ZShcbiAgICAgICAgICAgIG1vZHVsZUNvbmZpZy5zcGVjLFxuICAgICAgICAgICAgb3BlbmZhYXNNb2R1bGVTcGVjU2NoYW1lLFxuICAgICAgICAgICAgeyBjb250ZXh0OiBgbW9kdWxlICR7bW9kdWxlQ29uZmlnLm5hbWV9YCB9LFxuICAgICAgICAgIClcblxuICAgICAgICAgIG1vZHVsZUNvbmZpZy5idWlsZC5jb21tYW5kID0gW1xuICAgICAgICAgICAgXCJmYWFzLWNsaVwiLFxuICAgICAgICAgICAgXCJidWlsZFwiLFxuICAgICAgICAgICAgXCItZlwiLCBzdGFja0ZpbGVuYW1lLFxuICAgICAgICAgIF1cblxuICAgICAgICAgIG1vZHVsZUNvbmZpZy5idWlsZC5kZXBlbmRlbmNpZXMucHVzaCh7XG4gICAgICAgICAgICBuYW1lOiBcImJ1aWxkZXJcIixcbiAgICAgICAgICAgIHBsdWdpbjogXCJvcGVuZmFhc1wiLFxuICAgICAgICAgICAgY29weTogW3tcbiAgICAgICAgICAgICAgc291cmNlOiBcIipcIixcbiAgICAgICAgICAgICAgdGFyZ2V0OiBcIi5cIixcbiAgICAgICAgICAgIH1dLFxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICBtb2R1bGVDb25maWcuc2VydmljZUNvbmZpZ3MgPSBbe1xuICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBbXSxcbiAgICAgICAgICAgIG5hbWU6IG1vZHVsZUNvbmZpZy5uYW1lLFxuICAgICAgICAgICAgb3V0cHV0czoge30sXG4gICAgICAgICAgICBzcGVjOiB7XG4gICAgICAgICAgICAgIG5hbWU6IG1vZHVsZUNvbmZpZy5uYW1lLFxuICAgICAgICAgICAgICBkZXBlbmRlbmNpZXM6IFtdLFxuICAgICAgICAgICAgICBvdXRwdXRzOiB7fSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfV1cblxuICAgICAgICAgIG1vZHVsZUNvbmZpZy50ZXN0Q29uZmlncyA9IG1vZHVsZUNvbmZpZy5zcGVjLnRlc3RzLm1hcCh0ID0+ICh7XG4gICAgICAgICAgICBuYW1lOiB0Lm5hbWUsXG4gICAgICAgICAgICBkZXBlbmRlbmNpZXM6IHQuZGVwZW5kZW5jaWVzLFxuICAgICAgICAgICAgc3BlYzogdCxcbiAgICAgICAgICAgIHRpbWVvdXQ6IHQudGltZW91dCxcbiAgICAgICAgICB9KSlcblxuICAgICAgICAgIHJldHVybiBtb2R1bGVDb25maWdcbiAgICAgICAgfSxcblxuICAgICAgICBnZXRCdWlsZFN0YXR1czogZ2V0R2VuZXJpY01vZHVsZUJ1aWxkU3RhdHVzLFxuXG4gICAgICAgIGFzeW5jIGJ1aWxkKHBhcmFtczogQnVpbGRNb2R1bGVQYXJhbXM8T3BlbkZhYXNNb2R1bGU+KSB7XG4gICAgICAgICAgY29uc3QgeyBjdHgsIG1vZHVsZSB9ID0gcGFyYW1zXG5cbiAgICAgICAgICAvLyBwcmVwYXJlIHRoZSBzdGFjay55bWwgZmlsZSwgYmVmb3JlIGhhbmRpbmcgb2ZmIHRoZSBidWlsZCB0byB0aGUgZ2VuZXJpYyBoYW5kbGVyXG4gICAgICAgICAgYXdhaXQgd3JpdGVTdGFja0ZpbGUoY3R4LCBtb2R1bGUsIHt9KVxuXG4gICAgICAgICAgcmV0dXJuIGJ1aWxkR2VuZXJpY01vZHVsZShwYXJhbXMpXG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gVE9ETzogZGVzaWduIGFuZCBpbXBsZW1lbnQgYSBwcm9wZXIgdGVzdCBmbG93IGZvciBvcGVuZmFhcyBmdW5jdGlvbnNcbiAgICAgICAgdGVzdE1vZHVsZTogdGVzdEdlbmVyaWNNb2R1bGUsXG5cbiAgICAgICAgZ2V0U2VydmljZVN0YXR1cyxcblxuICAgICAgICBhc3luYyBnZXRTZXJ2aWNlT3V0cHV0cyh7IGN0eCwgc2VydmljZSB9OiBHZXRTZXJ2aWNlT3V0cHV0c1BhcmFtczxPcGVuRmFhc01vZHVsZT4pIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZW5kcG9pbnQ6IGF3YWl0IGdldEludGVybmFsU2VydmljZVVybChjdHgsIHNlcnZpY2UpLFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBkZXBsb3lTZXJ2aWNlKHBhcmFtczogRGVwbG95U2VydmljZVBhcmFtczxPcGVuRmFhc01vZHVsZT4pOiBQcm9taXNlPFNlcnZpY2VTdGF0dXM+IHtcbiAgICAgICAgICBjb25zdCB7IGN0eCwgbW9kdWxlLCBzZXJ2aWNlLCBsb2dFbnRyeSwgcnVudGltZUNvbnRleHQgfSA9IHBhcmFtc1xuXG4gICAgICAgICAgLy8gd3JpdGUgdGhlIHN0YWNrIGZpbGUgYWdhaW4gd2l0aCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICAgICAgICBhd2FpdCB3cml0ZVN0YWNrRmlsZShjdHgsIG1vZHVsZSwgcnVudGltZUNvbnRleHQuZW52VmFycylcblxuICAgICAgICAgIC8vIHVzZSBmYWFzLWNsaSB0byBkbyB0aGUgZGVwbG95bWVudFxuICAgICAgICAgIGF3YWl0IGV4ZWNhKFwiZmFhcy1jbGlcIiwgW1wiZGVwbG95XCIsIFwiLWZcIiwgc3RhY2tGaWxlbmFtZV0sIHsgY3dkOiBtb2R1bGUuYnVpbGRQYXRoIH0pXG5cbiAgICAgICAgICAvLyB3YWl0IHVudGlsIGRlcGxveW1lbnQgaXMgcmVhZHlcbiAgICAgICAgICBjb25zdCBrOHNQcm92aWRlciA9IGdldEs4c1Byb3ZpZGVyKGN0eClcbiAgICAgICAgICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBrOHNQcm92aWRlcilcbiAgICAgICAgICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShrOHNQcm92aWRlcilcblxuICAgICAgICAgIGNvbnN0IGRlcGxveW1lbnQgPSAoYXdhaXQgYXBpLmFwcHMucmVhZE5hbWVzcGFjZWREZXBsb3ltZW50KHNlcnZpY2UubmFtZSwgbmFtZXNwYWNlKSkuYm9keVxuXG4gICAgICAgICAgYXdhaXQgd2FpdEZvck9iamVjdHMoeyBjdHgsIHByb3ZpZGVyOiBrOHNQcm92aWRlciwgc2VydmljZSwgbG9nRW50cnksIG9iamVjdHM6IFtkZXBsb3ltZW50XSB9KVxuXG4gICAgICAgICAgLy8gVE9ETzogYXZvaWQgZHVwbGljYXRlIHdvcmsgaGVyZVxuICAgICAgICAgIHJldHVybiBnZXRTZXJ2aWNlU3RhdHVzKHBhcmFtcylcbiAgICAgICAgfSxcblxuICAgICAgICBhc3luYyBkZWxldGVTZXJ2aWNlKHBhcmFtczogRGVsZXRlU2VydmljZVBhcmFtczxPcGVuRmFhc01vZHVsZT4pOiBQcm9taXNlPFNlcnZpY2VTdGF0dXM+IHtcbiAgICAgICAgICBjb25zdCB7IGN0eCwgbG9nRW50cnksIHNlcnZpY2UsIHJ1bnRpbWVDb250ZXh0IH0gPSBwYXJhbXNcbiAgICAgICAgICBsZXQgc3RhdHVzXG4gICAgICAgICAgbGV0IGZvdW5kID0gdHJ1ZVxuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHN0YXR1cyA9IGF3YWl0IGdldFNlcnZpY2VTdGF0dXMoe1xuICAgICAgICAgICAgICBjdHgsXG4gICAgICAgICAgICAgIHNlcnZpY2UsXG4gICAgICAgICAgICAgIHJ1bnRpbWVDb250ZXh0LFxuICAgICAgICAgICAgICBtb2R1bGU6IHNlcnZpY2UubW9kdWxlLFxuICAgICAgICAgICAgfSlcblxuICAgICAgICAgICAgZm91bmQgPSAhIXN0YXR1cy5zdGF0ZVxuXG4gICAgICAgICAgICBhd2FpdCBleGVjYShcImZhYXMtY2xpXCIsIFtcInJlbW92ZVwiLCBcIi1mXCIsIHN0YWNrRmlsZW5hbWVdLCB7IGN3ZDogc2VydmljZS5tb2R1bGUuYnVpbGRQYXRoIH0pXG5cbiAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGZvdW5kID0gZmFsc2VcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobG9nRW50cnkpIHtcbiAgICAgICAgICAgIGZvdW5kID8gbG9nRW50cnkuc2V0U3VjY2VzcyhcIlNlcnZpY2UgZGVsZXRlZFwiKSA6IGxvZ0VudHJ5LnNldFdhcm4oXCJTZXJ2aWNlIG5vdCBkZXBsb3llZFwiKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBzdGF0dXNcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiB3cml0ZVN0YWNrRmlsZShcbiAgY3R4OiBQbHVnaW5Db250ZXh0LCBtb2R1bGU6IE9wZW5GYWFzTW9kdWxlLCBlbnZWYXJzOiBQcmltaXRpdmVNYXAsXG4pIHtcbiAgY29uc3QgaW1hZ2UgPSBnZXRJbWFnZU5hbWUobW9kdWxlKVxuXG4gIGNvbnN0IHN0YWNrUGF0aCA9IGpvaW4obW9kdWxlLmJ1aWxkUGF0aCwgc3RhY2tGaWxlbmFtZSlcblxuICByZXR1cm4gZHVtcFlhbWwoc3RhY2tQYXRoLCB7XG4gICAgcHJvdmlkZXI6IHtcbiAgICAgIG5hbWU6IFwiZmFhc1wiLFxuICAgICAgZ2F0ZXdheTogZ2V0RXh0ZXJuYWxHYXRld2F5VXJsKGN0eCksXG4gICAgfSxcbiAgICBmdW5jdGlvbnM6IHtcbiAgICAgIFttb2R1bGUubmFtZV06IHtcbiAgICAgICAgbGFuZzogbW9kdWxlLnNwZWMubGFuZyxcbiAgICAgICAgaGFuZGxlcjogbW9kdWxlLnNwZWMuaGFuZGxlcixcbiAgICAgICAgaW1hZ2UsXG4gICAgICAgIGVudmlyb25tZW50OiBlbnZWYXJzLFxuICAgICAgfSxcbiAgICB9LFxuICB9KVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXJ2aWNlU3RhdHVzKHsgY3R4LCBzZXJ2aWNlIH06IEdldFNlcnZpY2VTdGF0dXNQYXJhbXM8T3BlbkZhYXNNb2R1bGU+KSB7XG4gIGNvbnN0IGs4c1Byb3ZpZGVyID0gZ2V0SzhzUHJvdmlkZXIoY3R4KVxuXG4gIGNvbnN0IGluZ3Jlc3NlczogU2VydmljZUluZ3Jlc3NbXSA9IFt7XG4gICAgaG9zdG5hbWU6IGdldEV4dGVybmFsR2F0ZXdheUhvc3RuYW1lKGN0eC5wcm92aWRlciwgazhzUHJvdmlkZXIpLFxuICAgIHBhdGg6IGdldFNlcnZpY2VQYXRoKHNlcnZpY2UpLFxuICAgIHBvcnQ6IGs4c1Byb3ZpZGVyLmNvbmZpZy5pbmdyZXNzSHR0cFBvcnQsXG4gICAgcHJvdG9jb2w6IFwiaHR0cFwiLFxuICB9XVxuXG4gIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGs4c1Byb3ZpZGVyKVxuICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShrOHNQcm92aWRlcilcblxuICBsZXQgZGVwbG95bWVudFxuXG4gIHRyeSB7XG4gICAgZGVwbG95bWVudCA9IChhd2FpdCBhcGkuYXBwcy5yZWFkTmFtZXNwYWNlZERlcGxveW1lbnQoc2VydmljZS5uYW1lLCBuYW1lc3BhY2UpKS5ib2R5XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuY29kZSA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4ge31cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgY29uc3QgY29udGFpbmVyOiBhbnkgPSBmaW5kQnlOYW1lKGRlcGxveW1lbnQuc3BlYy50ZW1wbGF0ZS5zcGVjLmNvbnRhaW5lcnMsIFwiaGVsbG8tZnVuY3Rpb25cIilcbiAgY29uc3QgdmVyc2lvbiA9IGZpbmRCeU5hbWU8YW55Pihjb250YWluZXIuZW52LCBcIkdBUkRFTl9WRVJTSU9OXCIpLnZhbHVlXG4gIGNvbnN0IHN0YXR1cyA9IGF3YWl0IGNoZWNrRGVwbG95bWVudFN0YXR1cyhhcGksIG5hbWVzcGFjZSwgZGVwbG95bWVudClcblxuICByZXR1cm4ge1xuICAgIHN0YXRlOiBzdGF0dXMuc3RhdGUsXG4gICAgdmVyc2lvbixcbiAgICBpbmdyZXNzZXMsXG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0SW1hZ2VOYW1lKG1vZHVsZTogT3BlbkZhYXNNb2R1bGUpIHtcbiAgcmV0dXJuIGAke21vZHVsZS5uYW1lIHx8IG1vZHVsZS5zcGVjLmltYWdlfToke21vZHVsZS52ZXJzaW9uLnZlcnNpb25TdHJpbmd9YFxufVxuXG4vLyBOT1RFOiB3ZSdyZSBjdXJyZW50bHkgbm90IHVzaW5nIHRoZSBDUkQvb3BlcmF0b3IsIGJ1dCBtaWdodCBjaGFuZ2UgdGhhdCBpbiB0aGUgZnV0dXJlXG4vL1xuLy8gYXN5bmMgZnVuY3Rpb24gY3JlYXRlRnVuY3Rpb25PYmplY3Qoc2VydmljZTogT3BlbkZhYXNTZXJ2aWNlLCBuYW1lc3BhY2U6IHN0cmluZyk6IFByb21pc2U8S3ViZXJuZXRlc09iamVjdD4ge1xuLy8gICBjb25zdCBpbWFnZSA9IGF3YWl0IGdldEltYWdlTmFtZShzZXJ2aWNlLm1vZHVsZSlcblxuLy8gICByZXR1cm4ge1xuLy8gICAgIGFwaVZlcnNpb246IFwib3BlbmZhYXMuY29tL3YxYWxwaGEyXCIsXG4vLyAgICAga2luZDogXCJGdW5jdGlvblwiLFxuLy8gICAgIG1ldGFkYXRhOiB7XG4vLyAgICAgICBuYW1lOiBzZXJ2aWNlLm5hbWUsXG4vLyAgICAgICBuYW1lc3BhY2UsXG4vLyAgICAgfSxcbi8vICAgICBzcGVjOiB7XG4vLyAgICAgICBuYW1lOiBzZXJ2aWNlLm5hbWUsXG4vLyAgICAgICBpbWFnZSxcbi8vICAgICAgIGxhYmVsczoge1xuLy8gICAgICAgICBcImNvbS5vcGVuZmFhcy5zY2FsZS5taW5cIjogXCIxXCIsXG4vLyAgICAgICAgIFwiY29tLm9wZW5mYWFzLnNjYWxlLm1heFwiOiBcIjVcIixcbi8vICAgICAgIH0sXG4vLyAgICAgICBlbnZpcm9ubWVudDoge1xuLy8gICAgICAgICB3cml0ZV9kZWJ1ZzogXCJ0cnVlXCIsXG4vLyAgICAgICB9LFxuLy8gICAgICAgbGltaXRzOiB7XG4vLyAgICAgICAgIGNwdTogREVGQVVMVF9DUFVfTElNSVQsXG4vLyAgICAgICAgIG1lbW9yeTogREVGQVVMVF9NRU1PUllfTElNSVQsXG4vLyAgICAgICB9LFxuLy8gICAgICAgcmVxdWVzdHM6IHtcbi8vICAgICAgICAgY3B1OiBERUZBVUxUX0NQVV9SRVFVRVNULFxuLy8gICAgICAgICBtZW1vcnk6IERFRkFVTFRfTUVNT1JZX1JFUVVFU1QsXG4vLyAgICAgICB9LFxuLy8gICAgIH0sXG4vLyAgIH1cbi8vIH1cblxuZnVuY3Rpb24gZ2V0SzhzUHJvdmlkZXIoY3R4OiBQbHVnaW5Db250ZXh0KTogS3ViZXJuZXRlc1Byb3ZpZGVyIHtcbiAgY29uc3QgcHJvdmlkZXIgPSBjdHgucHJvdmlkZXJzW1wibG9jYWwta3ViZXJuZXRlc1wiXSB8fCBjdHgucHJvdmlkZXJzLmt1YmVybmV0ZXNcblxuICBpZiAoIXByb3ZpZGVyKSB7XG4gICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihgb3BlbmZhYXMgcmVxdWlyZXMgYSBrdWJlcm5ldGVzIChvciBsb2NhbC1rdWJlcm5ldGVzKSBwcm92aWRlciB0byBiZSBjb25maWd1cmVkYCwge1xuICAgICAgY29uZmlndXJlZFByb3ZpZGVyczogT2JqZWN0LmtleXMoY3R4LnByb3ZpZGVycyksXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBwcm92aWRlclxufVxuXG5mdW5jdGlvbiBnZXRTZXJ2aWNlUGF0aChzZXJ2aWNlOiBPcGVuRmFhc1NlcnZpY2UpIHtcbiAgcmV0dXJuIGpvaW4oXCIvXCIsIFwiZnVuY3Rpb25cIiwgc2VydmljZS5uYW1lKVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbnRlcm5hbEdhdGV3YXlVcmwoY3R4OiBQbHVnaW5Db250ZXh0KSB7XG4gIGNvbnN0IGs4c1Byb3ZpZGVyID0gZ2V0SzhzUHJvdmlkZXIoY3R4KVxuICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRPcGVuZmFhc05hbWVzcGFjZShjdHgsIGs4c1Byb3ZpZGVyLCB0cnVlKVxuICByZXR1cm4gYGh0dHA6Ly9nYXRld2F5LiR7bmFtZXNwYWNlfS5zdmMuY2x1c3Rlci5sb2NhbDo4MDgwYFxufVxuXG5mdW5jdGlvbiBnZXRFeHRlcm5hbEdhdGV3YXlIb3N0bmFtZShwcm92aWRlcjogT3BlbkZhYXNQcm92aWRlciwgazhzUHJvdmlkZXI6IEt1YmVybmV0ZXNQcm92aWRlcikge1xuICBjb25zdCBob3N0bmFtZSA9IHByb3ZpZGVyLmNvbmZpZy5ob3N0bmFtZSB8fCBrOHNQcm92aWRlci5jb25maWcuZGVmYXVsdEhvc3RuYW1lXG5cbiAgaWYgKCFob3N0bmFtZSkge1xuICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICBgb3BlbmZhYXM6IE11c3QgY29uZmlndXJlIGhvc3RuYW1lIGlmIG5vIGRlZmF1bHQgaG9zdG5hbWUgaXMgY29uZmlndXJlZCBvbiBLdWJlcm5ldGVzIHByb3ZpZGVyLmAsXG4gICAgICB7XG4gICAgICAgIGNvbmZpZzogcHJvdmlkZXIsXG4gICAgICB9LFxuICAgIClcbiAgfVxuXG4gIHJldHVybiBob3N0bmFtZVxufVxuXG5mdW5jdGlvbiBnZXRFeHRlcm5hbEdhdGV3YXlVcmwoY3R4OiBQbHVnaW5Db250ZXh0KSB7XG4gIGNvbnN0IGs4c1Byb3ZpZGVyID0gZ2V0SzhzUHJvdmlkZXIoY3R4KVxuICBjb25zdCBob3N0bmFtZSA9IGdldEV4dGVybmFsR2F0ZXdheUhvc3RuYW1lKGN0eC5wcm92aWRlciwgazhzUHJvdmlkZXIpXG4gIGNvbnN0IGluZ3Jlc3NQb3J0ID0gazhzUHJvdmlkZXIuY29uZmlnLmluZ3Jlc3NIdHRwUG9ydFxuICByZXR1cm4gYGh0dHA6Ly8ke2hvc3RuYW1lfToke2luZ3Jlc3NQb3J0fWBcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW50ZXJuYWxTZXJ2aWNlVXJsKGN0eDogUGx1Z2luQ29udGV4dCwgc2VydmljZTogT3BlbkZhYXNTZXJ2aWNlKSB7XG4gIHJldHVybiB1cmxSZXNvbHZlKGF3YWl0IGdldEludGVybmFsR2F0ZXdheVVybChjdHgpLCBnZXRTZXJ2aWNlUGF0aChzZXJ2aWNlKSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0T3BlbmZhYXNOYW1lc3BhY2UoY3R4OiBQbHVnaW5Db250ZXh0LCBrOHNQcm92aWRlcjogS3ViZXJuZXRlc1Byb3ZpZGVyLCBza2lwQ3JlYXRlPzogYm9vbGVhbikge1xuICByZXR1cm4gZ2V0TmFtZXNwYWNlKHsgY3R4LCBwcm92aWRlcjogazhzUHJvdmlkZXIsIHNraXBDcmVhdGUsIHN1ZmZpeDogXCJvcGVuZmFhc1wiIH0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRPcGVuRmFhc0dhcmRlbihjdHg6IFBsdWdpbkNvbnRleHQpOiBQcm9taXNlPEdhcmRlbj4ge1xuICAvLyBUT0RPOiBmaWd1cmUgb3V0IGdvb2Qgd2F5IHRvIHJldHJpZXZlIG5hbWVzcGFjZSBmcm9tIGt1YmVybmV0ZXMgcGx1Z2luIHRocm91Z2ggYW4gZXhwb3NlZCBpbnRlcmZhY2VcbiAgLy8gKG1heWJlIGFsbG93IHBsdWdpbnMgdG8gZXhwb3NlIGFyYml0cmFyeSBkYXRhIG9uIHRoZSBQcm92aWRlciBvYmplY3Q/KVxuICBjb25zdCBrOHNQcm92aWRlciA9IGdldEs4c1Byb3ZpZGVyKGN0eClcbiAgY29uc3QgbmFtZXNwYWNlID0gYXdhaXQgZ2V0T3BlbmZhYXNOYW1lc3BhY2UoY3R4LCBrOHNQcm92aWRlciwgdHJ1ZSlcbiAgY29uc3QgZnVuY3Rpb25OYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBrOHNQcm92aWRlcilcblxuICBjb25zdCBob3N0bmFtZSA9IGdldEV4dGVybmFsR2F0ZXdheUhvc3RuYW1lKGN0eC5wcm92aWRlciwgazhzUHJvdmlkZXIpXG5cbiAgLy8gVE9ETzogYWxsb3cgcGFzc2luZyB2YXJpYWJsZXMvcGFyYW1ldGVycyBoZXJlIHRvIGJlIHBhcnNlZCBhcyBwYXJ0IG9mIHRoZSBnYXJkZW4ueW1sIHByb2plY3QgY29uZmlnXG4gIC8vICh0aGlzIHdvdWxkIGFsbG93IHVzIHRvIHVzZSBhIGdhcmRlbi55bWwgZm9yIHRoZSBwcm9qZWN0IGNvbmZpZywgaW5zdGVhZCBvZiBzcGVjY2luZyBpdCBoZXJlKVxuICByZXR1cm4gR2FyZGVuLmZhY3Rvcnkoc3lzdGVtUHJvamVjdFBhdGgsIHtcbiAgICBlbnY6IFwiZGVmYXVsdFwiLFxuICAgIGNvbmZpZzoge1xuICAgICAgdmVyc2lvbjogXCIwXCIsXG4gICAgICBkaXJuYW1lOiBcInN5c3RlbVwiLFxuICAgICAgcGF0aDogc3lzdGVtUHJvamVjdFBhdGgsXG4gICAgICBwcm9qZWN0OiB7XG4gICAgICAgIG5hbWU6IGAke2N0eC5wcm9qZWN0TmFtZX0tb3BlbmZhYXNgLFxuICAgICAgICBlbnZpcm9ubWVudERlZmF1bHRzOiB7XG4gICAgICAgICAgcHJvdmlkZXJzOiBbXSxcbiAgICAgICAgICB2YXJpYWJsZXM6IHt9LFxuICAgICAgICB9LFxuICAgICAgICBkZWZhdWx0RW52aXJvbm1lbnQ6IFwiZGVmYXVsdFwiLFxuICAgICAgICBlbnZpcm9ubWVudHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiBcImRlZmF1bHRcIixcbiAgICAgICAgICAgIHByb3ZpZGVyczogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgLi4uazhzUHJvdmlkZXIuY29uZmlnLFxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZSxcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIGNsdW1zeSwgd2Ugc2hvdWxkIGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGNvbmZpZ3VyZSB0aGlzXG4gICAgICAgICAgICAgICAgX3N5c3RlbTogc3lzdGVtU3ltYm9sLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHZhcmlhYmxlczoge1xuICAgICAgICAgICAgICBcImZ1bmN0aW9uLW5hbWVzcGFjZVwiOiBmdW5jdGlvbk5hbWVzcGFjZSxcbiAgICAgICAgICAgICAgXCJnYXRld2F5LWhvc3RuYW1lXCI6IGhvc3RuYW1lLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9LFxuICB9KVxufVxuIl19
