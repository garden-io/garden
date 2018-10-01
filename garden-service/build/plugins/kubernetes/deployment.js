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
const container_1 = require("../container");
const lodash_1 = require("lodash");
const ingress_1 = require("./ingress");
const service_1 = require("./service");
const status_1 = require("./status");
const kubectl_1 = require("./kubectl");
const namespace_1 = require("./namespace");
const constants_1 = require("../../constants");
const api_1 = require("./api");
exports.DEFAULT_CPU_REQUEST = "10m";
exports.DEFAULT_CPU_LIMIT = "500m";
exports.DEFAULT_MEMORY_REQUEST = "128Mi";
exports.DEFAULT_MEMORY_LIMIT = "512Mi";
function getContainerServiceStatus({ ctx, module, service, runtimeContext }) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
        const version = module.version;
        const objects = yield createContainerObjects(ctx, service, runtimeContext);
        const matched = yield status_1.compareDeployedObjects(ctx, objects);
        const api = new api_1.KubeApi(ctx.provider);
        const ingresses = yield ingress_1.getIngresses(service, api);
        return {
            ingresses,
            state: matched ? "ready" : "outdated",
            version: matched ? version.versionString : undefined,
        };
    });
}
exports.getContainerServiceStatus = getContainerServiceStatus;
function deployContainerService(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ctx, service, runtimeContext, force, logEntry } = params;
        const provider = ctx.provider;
        const namespace = yield namespace_1.getAppNamespace(ctx, provider);
        const objects = yield createContainerObjects(ctx, service, runtimeContext);
        // TODO: use Helm instead of kubectl apply
        const pruneSelector = "service=" + service.name;
        yield kubectl_1.applyMany(provider.config.context, objects, { force, namespace, pruneSelector });
        yield status_1.waitForObjects({ ctx, provider, service, objects, logEntry });
        return getContainerServiceStatus(params);
    });
}
exports.deployContainerService = deployContainerService;
function createContainerObjects(ctx, service, runtimeContext) {
    return __awaiter(this, void 0, void 0, function* () {
        const version = service.module.version;
        const provider = ctx.provider;
        const namespace = yield namespace_1.getAppNamespace(ctx, provider);
        const deployment = yield createDeployment(provider, service, runtimeContext, namespace);
        const kubeservices = yield service_1.createServices(service, namespace);
        const api = new api_1.KubeApi(provider);
        const ingresses = yield ingress_1.createIngresses(api, namespace, service);
        const objects = [deployment, ...kubeservices, ...ingresses];
        return objects.map(obj => {
            lodash_1.set(obj, ["metadata", "annotations", "garden.io/generated"], "true");
            lodash_1.set(obj, ["metadata", "annotations", constants_1.GARDEN_ANNOTATION_KEYS_VERSION], version.versionString);
            lodash_1.set(obj, ["metadata", "labels", "module"], service.module.name);
            lodash_1.set(obj, ["metadata", "labels", "service"], service.name);
            return obj;
        });
    });
}
exports.createContainerObjects = createContainerObjects;
function createDeployment(provider, service, runtimeContext, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        const spec = service.spec;
        // TODO: support specifying replica count
        const configuredReplicas = 1; // service.spec.count[env.name] || 1
        const labels = {
            module: service.module.name,
            service: service.name,
        };
        // TODO: moar type-safety
        const deployment = {
            kind: "Deployment",
            apiVersion: "extensions/v1beta1",
            metadata: {
                name: service.name,
                annotations: {
                    // we can use this to avoid overriding the replica count if it has been manually scaled
                    "garden.io/configured.replicas": configuredReplicas.toString(),
                },
                namespace,
                labels,
            },
            spec: {
                selector: {
                    matchLabels: {
                        service: service.name,
                    },
                },
                template: {
                    metadata: {
                        labels,
                    },
                    spec: {
                        // TODO: set this for non-system pods
                        // automountServiceAccountToken: false,  // this prevents the pod from accessing the kubernetes API
                        containers: [],
                        // TODO: make restartPolicy configurable
                        restartPolicy: "Always",
                        terminationGracePeriodSeconds: 10,
                        dnsPolicy: "ClusterFirst",
                    },
                },
            },
        };
        const envVars = Object.assign({}, runtimeContext.envVars, service.spec.env);
        const env = lodash_1.toPairs(envVars).map(([name, value]) => ({ name, value: value + "" }));
        // expose some metadata to the container
        env.push({
            name: "POD_NAME",
            valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
        });
        env.push({
            name: "POD_NAMESPACE",
            valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } },
        });
        env.push({
            name: "POD_IP",
            valueFrom: { fieldRef: { fieldPath: "status.podIP" } },
        });
        const registryConfig = provider.name === "local-kubernetes" ? undefined : provider.config.deploymentRegistry;
        const image = yield container_1.helpers.getDeploymentImageId(service.module, registryConfig);
        const container = {
            name: service.name,
            image,
            env,
            ports: [],
            // TODO: make these configurable
            resources: {
                requests: {
                    cpu: exports.DEFAULT_CPU_REQUEST,
                    memory: exports.DEFAULT_MEMORY_REQUEST,
                },
                limits: {
                    cpu: exports.DEFAULT_CPU_LIMIT,
                    memory: exports.DEFAULT_MEMORY_LIMIT,
                },
            },
            imagePullPolicy: "IfNotPresent",
        };
        if (service.spec.command && service.spec.command.length > 0) {
            container.args = service.spec.command;
        }
        // if (config.entrypoint) {
        //   container.command = [config.entrypoint]
        // }
        if (spec.healthCheck) {
            container.readinessProbe = {
                initialDelaySeconds: 10,
                periodSeconds: 5,
                timeoutSeconds: 3,
                successThreshold: 2,
                failureThreshold: 5,
            };
            container.livenessProbe = {
                initialDelaySeconds: 15,
                periodSeconds: 5,
                timeoutSeconds: 3,
                successThreshold: 1,
                failureThreshold: 3,
            };
            const portsByName = lodash_1.keyBy(spec.ports, "name");
            if (spec.healthCheck.httpGet) {
                const httpGet = lodash_1.extend({}, spec.healthCheck.httpGet);
                httpGet.port = portsByName[httpGet.port].containerPort;
                container.readinessProbe.httpGet = httpGet;
                container.livenessProbe.httpGet = httpGet;
            }
            else if (spec.healthCheck.command) {
                container.readinessProbe.exec = { command: spec.healthCheck.command.map(s => s.toString()) };
                container.livenessProbe.exec = container.readinessProbe.exec;
            }
            else if (spec.healthCheck.tcpPort) {
                container.readinessProbe.tcpSocket = {
                    port: portsByName[spec.healthCheck.tcpPort].containerPort,
                };
                container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket;
            }
            else {
                throw new Error("Must specify type of health check when configuring health check.");
            }
        }
        // if (service.privileged) {
        //   container.securityContext = {
        //     privileged: true,
        //   }
        // }
        if (spec.volumes && spec.volumes.length) {
            const volumes = [];
            const volumeMounts = [];
            for (const volume of spec.volumes) {
                const volumeName = volume.name;
                const volumeType = !!volume.hostPath ? "hostPath" : "emptyDir";
                if (!volumeName) {
                    throw new Error("Must specify volume name");
                }
                if (volumeType === "emptyDir") {
                    volumes.push({
                        name: volumeName,
                        emptyDir: {},
                    });
                    volumeMounts.push({
                        name: volumeName,
                        mountPath: volume.containerPath,
                    });
                }
                else if (volumeType === "hostPath") {
                    volumes.push({
                        name: volumeName,
                        hostPath: {
                            path: volume.hostPath,
                        },
                    });
                    volumeMounts.push({
                        name: volumeName,
                        mountPath: volume.containerPath || volume.hostPath,
                    });
                }
                else {
                    throw new Error("Unsupported volume type: " + volumeType);
                }
            }
            deployment.spec.template.spec.volumes = volumes;
            container.volumeMounts = volumeMounts;
        }
        const ports = spec.ports;
        for (const port of ports) {
            container.ports.push({
                protocol: port.protocol,
                containerPort: port.containerPort,
            });
        }
        if (spec.daemon) {
            // this runs a pod on every node
            deployment.kind = "DaemonSet";
            deployment.spec.updateStrategy = {
                type: "RollingUpdate",
            };
            for (const port of ports.filter(p => p.hostPort)) {
                // For daemons we can expose host ports directly on the Pod, as opposed to only via the Service resource.
                // This allows us to choose any port.
                // TODO: validate that conflicting ports are not defined.
                container.ports.push({
                    protocol: port.protocol,
                    containerPort: port.containerPort,
                    hostPort: port.hostPort,
                });
            }
        }
        else {
            deployment.spec.replicas = configuredReplicas;
            deployment.spec.strategy = {
                type: "RollingUpdate",
                rollingUpdate: {
                    maxUnavailable: "34%",
                    maxSurge: "34%",
                },
            };
            deployment.spec.revisionHistoryLimit = 3;
        }
        if (provider.config.imagePullSecrets.length > 0) {
            // add any configured imagePullSecrets
            deployment.spec.template.spec.imagePullSecrets = provider.config.imagePullSecrets.map(s => ({ name: s.name }));
        }
        deployment.spec.template.spec.containers = [container];
        return deployment;
    });
}
exports.createDeployment = createDeployment;
function deleteContainerService({ namespace, provider, serviceName, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = provider.config.context;
        yield deleteContainerDeployment({ namespace, provider, serviceName, logEntry });
        yield kubectl_1.deleteObjectsByLabel({
            context,
            namespace,
            labelKey: "service",
            labelValue: serviceName,
            objectTypes: ["deployment", "service", "ingress"],
            includeUninitialized: false,
        });
    });
}
exports.deleteContainerService = deleteContainerService;
function deleteContainerDeployment({ namespace, provider, serviceName, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        let found = true;
        const api = new api_1.KubeApi(provider);
        try {
            yield api.extensions.deleteNamespacedDeployment(serviceName, namespace, {});
        }
        catch (err) {
            if (err.code === 404) {
                found = false;
            }
            else {
                throw err;
            }
        }
        if (logEntry) {
            found ? logEntry.setSuccess("Service deleted") : logEntry.setWarn("Service not deployed");
        }
    });
}
exports.deleteContainerDeployment = deleteContainerDeployment;
function pushModule({ ctx, module, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield container_1.helpers.hasDockerfile(module))) {
            logEntry && logEntry.setState({ msg: `Nothing to push` });
            return { pushed: false };
        }
        const localId = yield container_1.helpers.getLocalImageId(module);
        const remoteId = yield container_1.helpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry);
        logEntry && logEntry.setState({ msg: `Pushing image ${remoteId}...` });
        yield container_1.helpers.dockerCli(module, `tag ${localId} ${remoteId}`);
        yield container_1.helpers.dockerCli(module, `push ${remoteId}`);
        return { pushed: true, message: `Pushed ${localId}` };
    });
}
exports.pushModule = pushModule;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9kZXBsb3ltZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFHSCw0Q0FBeUU7QUFDekUsbUNBQW9EO0FBRXBELHVDQUF5RDtBQUN6RCx1Q0FBMEM7QUFDMUMscUNBQWlFO0FBQ2pFLHVDQUEyRDtBQUMzRCwyQ0FBNkM7QUFHN0MsK0NBQWdFO0FBQ2hFLCtCQUErQjtBQUdsQixRQUFBLG1CQUFtQixHQUFHLEtBQUssQ0FBQTtBQUMzQixRQUFBLGlCQUFpQixHQUFHLE1BQU0sQ0FBQTtBQUMxQixRQUFBLHNCQUFzQixHQUFHLE9BQU8sQ0FBQTtBQUNoQyxRQUFBLG9CQUFvQixHQUFHLE9BQU8sQ0FBQTtBQVEzQyxTQUFzQix5QkFBeUIsQ0FDN0MsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQTJDOztRQUVqRixxR0FBcUc7UUFDckcsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQTtRQUM5QixNQUFNLE9BQU8sR0FBRyxNQUFNLHNCQUFzQixDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsY0FBYyxDQUFDLENBQUE7UUFDMUUsTUFBTSxPQUFPLEdBQUcsTUFBTSwrQkFBc0IsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxhQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO1FBQ3JDLE1BQU0sU0FBUyxHQUFHLE1BQU0sc0JBQVksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUE7UUFFbEQsT0FBTztZQUNMLFNBQVM7WUFDVCxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVU7WUFDckMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNyRCxD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RUFBRSxPQUFPLEVBQUUsVUFBVSxPQUFPLEVBQUUsRUFBRSxDQUFBO0lBQ3ZELENBQUM7Q0FBQTtBQWZELGdDQWVDIiwiZmlsZSI6InBsdWdpbnMva3ViZXJuZXRlcy9kZXBsb3ltZW50LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IERlcGxveVNlcnZpY2VQYXJhbXMsIEdldFNlcnZpY2VTdGF0dXNQYXJhbXMsIFB1c2hNb2R1bGVQYXJhbXMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQgeyBoZWxwZXJzLCBDb250YWluZXJNb2R1bGUsIENvbnRhaW5lclNlcnZpY2UgfSBmcm9tIFwiLi4vY29udGFpbmVyXCJcbmltcG9ydCB7IHRvUGFpcnMsIGV4dGVuZCwga2V5QnksIHNldCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgUnVudGltZUNvbnRleHQsIFNlcnZpY2VTdGF0dXMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBjcmVhdGVJbmdyZXNzZXMsIGdldEluZ3Jlc3NlcyB9IGZyb20gXCIuL2luZ3Jlc3NcIlxuaW1wb3J0IHsgY3JlYXRlU2VydmljZXMgfSBmcm9tIFwiLi9zZXJ2aWNlXCJcbmltcG9ydCB7IHdhaXRGb3JPYmplY3RzLCBjb21wYXJlRGVwbG95ZWRPYmplY3RzIH0gZnJvbSBcIi4vc3RhdHVzXCJcbmltcG9ydCB7IGFwcGx5TWFueSwgZGVsZXRlT2JqZWN0c0J5TGFiZWwgfSBmcm9tIFwiLi9rdWJlY3RsXCJcbmltcG9ydCB7IGdldEFwcE5hbWVzcGFjZSB9IGZyb20gXCIuL25hbWVzcGFjZVwiXG5pbXBvcnQgeyBLdWJlcm5ldGVzT2JqZWN0IH0gZnJvbSBcIi4vaGVsbVwiXG5pbXBvcnQgeyBQbHVnaW5Db250ZXh0IH0gZnJvbSBcIi4uLy4uL3BsdWdpbi1jb250ZXh0XCJcbmltcG9ydCB7IEdBUkRFTl9BTk5PVEFUSU9OX0tFWVNfVkVSU0lPTiB9IGZyb20gXCIuLi8uLi9jb25zdGFudHNcIlxuaW1wb3J0IHsgS3ViZUFwaSB9IGZyb20gXCIuL2FwaVwiXG5pbXBvcnQgeyBLdWJlcm5ldGVzUHJvdmlkZXIgfSBmcm9tIFwiLi9rdWJlcm5ldGVzXCJcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfQ1BVX1JFUVVFU1QgPSBcIjEwbVwiXG5leHBvcnQgY29uc3QgREVGQVVMVF9DUFVfTElNSVQgPSBcIjUwMG1cIlxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTUVNT1JZX1JFUVVFU1QgPSBcIjEyOE1pXCJcbmV4cG9ydCBjb25zdCBERUZBVUxUX01FTU9SWV9MSU1JVCA9IFwiNTEyTWlcIlxuXG5pbnRlcmZhY2UgS3ViZUVudlZhciB7XG4gIG5hbWU6IHN0cmluZ1xuICB2YWx1ZT86IHN0cmluZ1xuICB2YWx1ZUZyb20/OiB7IGZpZWxkUmVmOiB7IGZpZWxkUGF0aDogc3RyaW5nIH0gfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0Q29udGFpbmVyU2VydmljZVN0YXR1cyhcbiAgeyBjdHgsIG1vZHVsZSwgc2VydmljZSwgcnVudGltZUNvbnRleHQgfTogR2V0U2VydmljZVN0YXR1c1BhcmFtczxDb250YWluZXJNb2R1bGU+LFxuKTogUHJvbWlzZTxTZXJ2aWNlU3RhdHVzPiB7XG4gIC8vIFRPRE86IGhhc2ggYW5kIGNvbXBhcmUgYWxsIHRoZSBjb25maWd1cmF0aW9uIGZpbGVzIChvdGhlcndpc2UgaW50ZXJuYWwgY2hhbmdlcyBkb24ndCBnZXQgZGVwbG95ZWQpXG4gIGNvbnN0IHZlcnNpb24gPSBtb2R1bGUudmVyc2lvblxuICBjb25zdCBvYmplY3RzID0gYXdhaXQgY3JlYXRlQ29udGFpbmVyT2JqZWN0cyhjdHgsIHNlcnZpY2UsIHJ1bnRpbWVDb250ZXh0KVxuICBjb25zdCBtYXRjaGVkID0gYXdhaXQgY29tcGFyZURlcGxveWVkT2JqZWN0cyhjdHgsIG9iamVjdHMpXG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKGN0eC5wcm92aWRlcilcbiAgY29uc3QgaW5ncmVzc2VzID0gYXdhaXQgZ2V0SW5ncmVzc2VzKHNlcnZpY2UsIGFwaSlcblxuICByZXR1cm4ge1xuICAgIGluZ3Jlc3NlcyxcbiAgICBzdGF0ZTogbWF0Y2hlZCA/IFwicmVhZHlcIiA6IFwib3V0ZGF0ZWRcIixcbiAgICB2ZXJzaW9uOiBtYXRjaGVkID8gdmVyc2lvbi52ZXJzaW9uU3RyaW5nIDogdW5kZWZpbmVkLFxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZXBsb3lDb250YWluZXJTZXJ2aWNlKHBhcmFtczogRGVwbG95U2VydmljZVBhcmFtczxDb250YWluZXJNb2R1bGU+KTogUHJvbWlzZTxTZXJ2aWNlU3RhdHVzPiB7XG4gIGNvbnN0IHsgY3R4LCBzZXJ2aWNlLCBydW50aW1lQ29udGV4dCwgZm9yY2UsIGxvZ0VudHJ5IH0gPSBwYXJhbXNcblxuICBjb25zdCBwcm92aWRlciA9IGN0eC5wcm92aWRlclxuICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBwcm92aWRlcilcbiAgY29uc3Qgb2JqZWN0cyA9IGF3YWl0IGNyZWF0ZUNvbnRhaW5lck9iamVjdHMoY3R4LCBzZXJ2aWNlLCBydW50aW1lQ29udGV4dClcblxuICAvLyBUT0RPOiB1c2UgSGVsbSBpbnN0ZWFkIG9mIGt1YmVjdGwgYXBwbHlcbiAgY29uc3QgcHJ1bmVTZWxlY3RvciA9IFwic2VydmljZT1cIiArIHNlcnZpY2UubmFtZVxuICBhd2FpdCBhcHBseU1hbnkocHJvdmlkZXIuY29uZmlnLmNvbnRleHQsIG9iamVjdHMsIHsgZm9yY2UsIG5hbWVzcGFjZSwgcHJ1bmVTZWxlY3RvciB9KVxuICBhd2FpdCB3YWl0Rm9yT2JqZWN0cyh7IGN0eCwgcHJvdmlkZXIsIHNlcnZpY2UsIG9iamVjdHMsIGxvZ0VudHJ5IH0pXG5cbiAgcmV0dXJuIGdldENvbnRhaW5lclNlcnZpY2VTdGF0dXMocGFyYW1zKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlQ29udGFpbmVyT2JqZWN0cyhcbiAgY3R4OiBQbHVnaW5Db250ZXh0LCBzZXJ2aWNlOiBDb250YWluZXJTZXJ2aWNlLCBydW50aW1lQ29udGV4dDogUnVudGltZUNvbnRleHQsXG4pIHtcbiAgY29uc3QgdmVyc2lvbiA9IHNlcnZpY2UubW9kdWxlLnZlcnNpb25cbiAgY29uc3QgcHJvdmlkZXIgPSBjdHgucHJvdmlkZXJcbiAgY29uc3QgbmFtZXNwYWNlID0gYXdhaXQgZ2V0QXBwTmFtZXNwYWNlKGN0eCwgcHJvdmlkZXIpXG4gIGNvbnN0IGRlcGxveW1lbnQgPSBhd2FpdCBjcmVhdGVEZXBsb3ltZW50KHByb3ZpZGVyLCBzZXJ2aWNlLCBydW50aW1lQ29udGV4dCwgbmFtZXNwYWNlKVxuICBjb25zdCBrdWJlc2VydmljZXMgPSBhd2FpdCBjcmVhdGVTZXJ2aWNlcyhzZXJ2aWNlLCBuYW1lc3BhY2UpXG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKHByb3ZpZGVyKVxuICBjb25zdCBpbmdyZXNzZXMgPSBhd2FpdCBjcmVhdGVJbmdyZXNzZXMoYXBpLCBuYW1lc3BhY2UsIHNlcnZpY2UpXG5cbiAgY29uc3Qgb2JqZWN0cyA9IFtkZXBsb3ltZW50LCAuLi5rdWJlc2VydmljZXMsIC4uLmluZ3Jlc3Nlc11cblxuICByZXR1cm4gb2JqZWN0cy5tYXAob2JqID0+IHtcbiAgICBzZXQob2JqLCBbXCJtZXRhZGF0YVwiLCBcImFubm90YXRpb25zXCIsIFwiZ2FyZGVuLmlvL2dlbmVyYXRlZFwiXSwgXCJ0cnVlXCIpXG4gICAgc2V0KG9iaiwgW1wibWV0YWRhdGFcIiwgXCJhbm5vdGF0aW9uc1wiLCBHQVJERU5fQU5OT1RBVElPTl9LRVlTX1ZFUlNJT05dLCB2ZXJzaW9uLnZlcnNpb25TdHJpbmcpXG4gICAgc2V0KG9iaiwgW1wibWV0YWRhdGFcIiwgXCJsYWJlbHNcIiwgXCJtb2R1bGVcIl0sIHNlcnZpY2UubW9kdWxlLm5hbWUpXG4gICAgc2V0KG9iaiwgW1wibWV0YWRhdGFcIiwgXCJsYWJlbHNcIiwgXCJzZXJ2aWNlXCJdLCBzZXJ2aWNlLm5hbWUpXG4gICAgcmV0dXJuIG9ialxuICB9KVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlRGVwbG95bWVudChcbiAgcHJvdmlkZXI6IEt1YmVybmV0ZXNQcm92aWRlciwgc2VydmljZTogQ29udGFpbmVyU2VydmljZSwgcnVudGltZUNvbnRleHQ6IFJ1bnRpbWVDb250ZXh0LCBuYW1lc3BhY2U6IHN0cmluZyxcbik6IFByb21pc2U8S3ViZXJuZXRlc09iamVjdD4ge1xuICBjb25zdCBzcGVjID0gc2VydmljZS5zcGVjXG4gIC8vIFRPRE86IHN1cHBvcnQgc3BlY2lmeWluZyByZXBsaWNhIGNvdW50XG4gIGNvbnN0IGNvbmZpZ3VyZWRSZXBsaWNhcyA9IDEgLy8gc2VydmljZS5zcGVjLmNvdW50W2Vudi5uYW1lXSB8fCAxXG5cbiAgY29uc3QgbGFiZWxzID0ge1xuICAgIG1vZHVsZTogc2VydmljZS5tb2R1bGUubmFtZSxcbiAgICBzZXJ2aWNlOiBzZXJ2aWNlLm5hbWUsXG4gIH1cblxuICAvLyBUT0RPOiBtb2FyIHR5cGUtc2FmZXR5XG4gIGNvbnN0IGRlcGxveW1lbnQ6IGFueSA9IHtcbiAgICBraW5kOiBcIkRlcGxveW1lbnRcIixcbiAgICBhcGlWZXJzaW9uOiBcImV4dGVuc2lvbnMvdjFiZXRhMVwiLFxuICAgIG1ldGFkYXRhOiB7XG4gICAgICBuYW1lOiBzZXJ2aWNlLm5hbWUsXG4gICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICAvLyB3ZSBjYW4gdXNlIHRoaXMgdG8gYXZvaWQgb3ZlcnJpZGluZyB0aGUgcmVwbGljYSBjb3VudCBpZiBpdCBoYXMgYmVlbiBtYW51YWxseSBzY2FsZWRcbiAgICAgICAgXCJnYXJkZW4uaW8vY29uZmlndXJlZC5yZXBsaWNhc1wiOiBjb25maWd1cmVkUmVwbGljYXMudG9TdHJpbmcoKSxcbiAgICAgIH0sXG4gICAgICBuYW1lc3BhY2UsXG4gICAgICBsYWJlbHMsXG4gICAgfSxcbiAgICBzcGVjOiB7XG4gICAgICBzZWxlY3Rvcjoge1xuICAgICAgICBtYXRjaExhYmVsczoge1xuICAgICAgICAgIHNlcnZpY2U6IHNlcnZpY2UubmFtZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICB0ZW1wbGF0ZToge1xuICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgIGxhYmVscyxcbiAgICAgICAgfSxcbiAgICAgICAgc3BlYzoge1xuICAgICAgICAgIC8vIFRPRE86IHNldCB0aGlzIGZvciBub24tc3lzdGVtIHBvZHNcbiAgICAgICAgICAvLyBhdXRvbW91bnRTZXJ2aWNlQWNjb3VudFRva2VuOiBmYWxzZSwgIC8vIHRoaXMgcHJldmVudHMgdGhlIHBvZCBmcm9tIGFjY2Vzc2luZyB0aGUga3ViZXJuZXRlcyBBUElcbiAgICAgICAgICBjb250YWluZXJzOiBbXSxcbiAgICAgICAgICAvLyBUT0RPOiBtYWtlIHJlc3RhcnRQb2xpY3kgY29uZmlndXJhYmxlXG4gICAgICAgICAgcmVzdGFydFBvbGljeTogXCJBbHdheXNcIixcbiAgICAgICAgICB0ZXJtaW5hdGlvbkdyYWNlUGVyaW9kU2Vjb25kczogMTAsXG4gICAgICAgICAgZG5zUG9saWN5OiBcIkNsdXN0ZXJGaXJzdFwiLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9XG5cbiAgY29uc3QgZW52VmFycyA9IHsgLi4ucnVudGltZUNvbnRleHQuZW52VmFycywgLi4uc2VydmljZS5zcGVjLmVudiB9XG5cbiAgY29uc3QgZW52OiBLdWJlRW52VmFyW10gPSB0b1BhaXJzKGVudlZhcnMpLm1hcCgoW25hbWUsIHZhbHVlXSkgPT4gKHsgbmFtZSwgdmFsdWU6IHZhbHVlICsgXCJcIiB9KSlcblxuICAvLyBleHBvc2Ugc29tZSBtZXRhZGF0YSB0byB0aGUgY29udGFpbmVyXG4gIGVudi5wdXNoKHtcbiAgICBuYW1lOiBcIlBPRF9OQU1FXCIsXG4gICAgdmFsdWVGcm9tOiB7IGZpZWxkUmVmOiB7IGZpZWxkUGF0aDogXCJtZXRhZGF0YS5uYW1lXCIgfSB9LFxuICB9KVxuXG4gIGVudi5wdXNoKHtcbiAgICBuYW1lOiBcIlBPRF9OQU1FU1BBQ0VcIixcbiAgICB2YWx1ZUZyb206IHsgZmllbGRSZWY6IHsgZmllbGRQYXRoOiBcIm1ldGFkYXRhLm5hbWVzcGFjZVwiIH0gfSxcbiAgfSlcblxuICBlbnYucHVzaCh7XG4gICAgbmFtZTogXCJQT0RfSVBcIixcbiAgICB2YWx1ZUZyb206IHsgZmllbGRSZWY6IHsgZmllbGRQYXRoOiBcInN0YXR1cy5wb2RJUFwiIH0gfSxcbiAgfSlcblxuICBjb25zdCByZWdpc3RyeUNvbmZpZyA9IHByb3ZpZGVyLm5hbWUgPT09IFwibG9jYWwta3ViZXJuZXRlc1wiID8gdW5kZWZpbmVkIDogcHJvdmlkZXIuY29uZmlnLmRlcGxveW1lbnRSZWdpc3RyeVxuICBjb25zdCBpbWFnZSA9IGF3YWl0IGhlbHBlcnMuZ2V0RGVwbG95bWVudEltYWdlSWQoc2VydmljZS5tb2R1bGUsIHJlZ2lzdHJ5Q29uZmlnKVxuXG4gIGNvbnN0IGNvbnRhaW5lcjogYW55ID0ge1xuICAgIG5hbWU6IHNlcnZpY2UubmFtZSxcbiAgICBpbWFnZSxcbiAgICBlbnYsXG4gICAgcG9ydHM6IFtdLFxuICAgIC8vIFRPRE86IG1ha2UgdGhlc2UgY29uZmlndXJhYmxlXG4gICAgcmVzb3VyY2VzOiB7XG4gICAgICByZXF1ZXN0czoge1xuICAgICAgICBjcHU6IERFRkFVTFRfQ1BVX1JFUVVFU1QsXG4gICAgICAgIG1lbW9yeTogREVGQVVMVF9NRU1PUllfUkVRVUVTVCxcbiAgICAgIH0sXG4gICAgICBsaW1pdHM6IHtcbiAgICAgICAgY3B1OiBERUZBVUxUX0NQVV9MSU1JVCxcbiAgICAgICAgbWVtb3J5OiBERUZBVUxUX01FTU9SWV9MSU1JVCxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBpbWFnZVB1bGxQb2xpY3k6IFwiSWZOb3RQcmVzZW50XCIsXG4gIH1cblxuICBpZiAoc2VydmljZS5zcGVjLmNvbW1hbmQgJiYgc2VydmljZS5zcGVjLmNvbW1hbmQubGVuZ3RoID4gMCkge1xuICAgIGNvbnRhaW5lci5hcmdzID0gc2VydmljZS5zcGVjLmNvbW1hbmRcbiAgfVxuXG4gIC8vIGlmIChjb25maWcuZW50cnlwb2ludCkge1xuICAvLyAgIGNvbnRhaW5lci5jb21tYW5kID0gW2NvbmZpZy5lbnRyeXBvaW50XVxuICAvLyB9XG5cbiAgaWYgKHNwZWMuaGVhbHRoQ2hlY2spIHtcbiAgICBjb250YWluZXIucmVhZGluZXNzUHJvYmUgPSB7XG4gICAgICBpbml0aWFsRGVsYXlTZWNvbmRzOiAxMCxcbiAgICAgIHBlcmlvZFNlY29uZHM6IDUsXG4gICAgICB0aW1lb3V0U2Vjb25kczogMyxcbiAgICAgIHN1Y2Nlc3NUaHJlc2hvbGQ6IDIsXG4gICAgICBmYWlsdXJlVGhyZXNob2xkOiA1LFxuICAgIH1cblxuICAgIGNvbnRhaW5lci5saXZlbmVzc1Byb2JlID0ge1xuICAgICAgaW5pdGlhbERlbGF5U2Vjb25kczogMTUsXG4gICAgICBwZXJpb2RTZWNvbmRzOiA1LFxuICAgICAgdGltZW91dFNlY29uZHM6IDMsXG4gICAgICBzdWNjZXNzVGhyZXNob2xkOiAxLFxuICAgICAgZmFpbHVyZVRocmVzaG9sZDogMyxcbiAgICB9XG5cbiAgICBjb25zdCBwb3J0c0J5TmFtZSA9IGtleUJ5KHNwZWMucG9ydHMsIFwibmFtZVwiKVxuXG4gICAgaWYgKHNwZWMuaGVhbHRoQ2hlY2suaHR0cEdldCkge1xuICAgICAgY29uc3QgaHR0cEdldDogYW55ID0gZXh0ZW5kKHt9LCBzcGVjLmhlYWx0aENoZWNrLmh0dHBHZXQpXG4gICAgICBodHRwR2V0LnBvcnQgPSBwb3J0c0J5TmFtZVtodHRwR2V0LnBvcnRdLmNvbnRhaW5lclBvcnRcblxuICAgICAgY29udGFpbmVyLnJlYWRpbmVzc1Byb2JlLmh0dHBHZXQgPSBodHRwR2V0XG4gICAgICBjb250YWluZXIubGl2ZW5lc3NQcm9iZS5odHRwR2V0ID0gaHR0cEdldFxuICAgIH0gZWxzZSBpZiAoc3BlYy5oZWFsdGhDaGVjay5jb21tYW5kKSB7XG4gICAgICBjb250YWluZXIucmVhZGluZXNzUHJvYmUuZXhlYyA9IHsgY29tbWFuZDogc3BlYy5oZWFsdGhDaGVjay5jb21tYW5kLm1hcChzID0+IHMudG9TdHJpbmcoKSkgfVxuICAgICAgY29udGFpbmVyLmxpdmVuZXNzUHJvYmUuZXhlYyA9IGNvbnRhaW5lci5yZWFkaW5lc3NQcm9iZS5leGVjXG4gICAgfSBlbHNlIGlmIChzcGVjLmhlYWx0aENoZWNrLnRjcFBvcnQpIHtcbiAgICAgIGNvbnRhaW5lci5yZWFkaW5lc3NQcm9iZS50Y3BTb2NrZXQgPSB7XG4gICAgICAgIHBvcnQ6IHBvcnRzQnlOYW1lW3NwZWMuaGVhbHRoQ2hlY2sudGNwUG9ydF0uY29udGFpbmVyUG9ydCxcbiAgICAgIH1cbiAgICAgIGNvbnRhaW5lci5saXZlbmVzc1Byb2JlLnRjcFNvY2tldCA9IGNvbnRhaW5lci5yZWFkaW5lc3NQcm9iZS50Y3BTb2NrZXRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTXVzdCBzcGVjaWZ5IHR5cGUgb2YgaGVhbHRoIGNoZWNrIHdoZW4gY29uZmlndXJpbmcgaGVhbHRoIGNoZWNrLlwiKVxuICAgIH1cbiAgfVxuXG4gIC8vIGlmIChzZXJ2aWNlLnByaXZpbGVnZWQpIHtcbiAgLy8gICBjb250YWluZXIuc2VjdXJpdHlDb250ZXh0ID0ge1xuICAvLyAgICAgcHJpdmlsZWdlZDogdHJ1ZSxcbiAgLy8gICB9XG4gIC8vIH1cblxuICBpZiAoc3BlYy52b2x1bWVzICYmIHNwZWMudm9sdW1lcy5sZW5ndGgpIHtcbiAgICBjb25zdCB2b2x1bWVzOiBhbnlbXSA9IFtdXG4gICAgY29uc3Qgdm9sdW1lTW91bnRzOiBhbnlbXSA9IFtdXG5cbiAgICBmb3IgKGNvbnN0IHZvbHVtZSBvZiBzcGVjLnZvbHVtZXMpIHtcbiAgICAgIGNvbnN0IHZvbHVtZU5hbWUgPSB2b2x1bWUubmFtZVxuICAgICAgY29uc3Qgdm9sdW1lVHlwZSA9ICEhdm9sdW1lLmhvc3RQYXRoID8gXCJob3N0UGF0aFwiIDogXCJlbXB0eURpclwiXG5cbiAgICAgIGlmICghdm9sdW1lTmFtZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJNdXN0IHNwZWNpZnkgdm9sdW1lIG5hbWVcIilcbiAgICAgIH1cblxuICAgICAgaWYgKHZvbHVtZVR5cGUgPT09IFwiZW1wdHlEaXJcIikge1xuICAgICAgICB2b2x1bWVzLnB1c2goe1xuICAgICAgICAgIG5hbWU6IHZvbHVtZU5hbWUsXG4gICAgICAgICAgZW1wdHlEaXI6IHt9LFxuICAgICAgICB9KVxuICAgICAgICB2b2x1bWVNb3VudHMucHVzaCh7XG4gICAgICAgICAgbmFtZTogdm9sdW1lTmFtZSxcbiAgICAgICAgICBtb3VudFBhdGg6IHZvbHVtZS5jb250YWluZXJQYXRoLFxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIGlmICh2b2x1bWVUeXBlID09PSBcImhvc3RQYXRoXCIpIHtcbiAgICAgICAgdm9sdW1lcy5wdXNoKHtcbiAgICAgICAgICBuYW1lOiB2b2x1bWVOYW1lLFxuICAgICAgICAgIGhvc3RQYXRoOiB7XG4gICAgICAgICAgICBwYXRoOiB2b2x1bWUuaG9zdFBhdGgsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSlcbiAgICAgICAgdm9sdW1lTW91bnRzLnB1c2goe1xuICAgICAgICAgIG5hbWU6IHZvbHVtZU5hbWUsXG4gICAgICAgICAgbW91bnRQYXRoOiB2b2x1bWUuY29udGFpbmVyUGF0aCB8fCB2b2x1bWUuaG9zdFBhdGgsXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnN1cHBvcnRlZCB2b2x1bWUgdHlwZTogXCIgKyB2b2x1bWVUeXBlKVxuICAgICAgfVxuICAgIH1cblxuICAgIGRlcGxveW1lbnQuc3BlYy50ZW1wbGF0ZS5zcGVjLnZvbHVtZXMgPSB2b2x1bWVzXG4gICAgY29udGFpbmVyLnZvbHVtZU1vdW50cyA9IHZvbHVtZU1vdW50c1xuICB9XG5cbiAgY29uc3QgcG9ydHMgPSBzcGVjLnBvcnRzXG5cbiAgZm9yIChjb25zdCBwb3J0IG9mIHBvcnRzKSB7XG4gICAgY29udGFpbmVyLnBvcnRzLnB1c2goe1xuICAgICAgcHJvdG9jb2w6IHBvcnQucHJvdG9jb2wsXG4gICAgICBjb250YWluZXJQb3J0OiBwb3J0LmNvbnRhaW5lclBvcnQsXG4gICAgfSlcbiAgfVxuXG4gIGlmIChzcGVjLmRhZW1vbikge1xuICAgIC8vIHRoaXMgcnVucyBhIHBvZCBvbiBldmVyeSBub2RlXG4gICAgZGVwbG95bWVudC5raW5kID0gXCJEYWVtb25TZXRcIlxuICAgIGRlcGxveW1lbnQuc3BlYy51cGRhdGVTdHJhdGVneSA9IHtcbiAgICAgIHR5cGU6IFwiUm9sbGluZ1VwZGF0ZVwiLFxuICAgIH1cblxuICAgIGZvciAoY29uc3QgcG9ydCBvZiBwb3J0cy5maWx0ZXIocCA9PiBwLmhvc3RQb3J0KSkge1xuICAgICAgLy8gRm9yIGRhZW1vbnMgd2UgY2FuIGV4cG9zZSBob3N0IHBvcnRzIGRpcmVjdGx5IG9uIHRoZSBQb2QsIGFzIG9wcG9zZWQgdG8gb25seSB2aWEgdGhlIFNlcnZpY2UgcmVzb3VyY2UuXG4gICAgICAvLyBUaGlzIGFsbG93cyB1cyB0byBjaG9vc2UgYW55IHBvcnQuXG4gICAgICAvLyBUT0RPOiB2YWxpZGF0ZSB0aGF0IGNvbmZsaWN0aW5nIHBvcnRzIGFyZSBub3QgZGVmaW5lZC5cbiAgICAgIGNvbnRhaW5lci5wb3J0cy5wdXNoKHtcbiAgICAgICAgcHJvdG9jb2w6IHBvcnQucHJvdG9jb2wsXG4gICAgICAgIGNvbnRhaW5lclBvcnQ6IHBvcnQuY29udGFpbmVyUG9ydCxcbiAgICAgICAgaG9zdFBvcnQ6IHBvcnQuaG9zdFBvcnQsXG4gICAgICB9KVxuICAgIH1cblxuICB9IGVsc2Uge1xuICAgIGRlcGxveW1lbnQuc3BlYy5yZXBsaWNhcyA9IGNvbmZpZ3VyZWRSZXBsaWNhc1xuICAgIGRlcGxveW1lbnQuc3BlYy5zdHJhdGVneSA9IHtcbiAgICAgIHR5cGU6IFwiUm9sbGluZ1VwZGF0ZVwiLFxuICAgICAgcm9sbGluZ1VwZGF0ZToge1xuICAgICAgICBtYXhVbmF2YWlsYWJsZTogXCIzNCVcIixcbiAgICAgICAgbWF4U3VyZ2U6IFwiMzQlXCIsXG4gICAgICB9LFxuICAgIH1cbiAgICBkZXBsb3ltZW50LnNwZWMucmV2aXNpb25IaXN0b3J5TGltaXQgPSAzXG4gIH1cblxuICBpZiAocHJvdmlkZXIuY29uZmlnLmltYWdlUHVsbFNlY3JldHMubGVuZ3RoID4gMCkge1xuICAgIC8vIGFkZCBhbnkgY29uZmlndXJlZCBpbWFnZVB1bGxTZWNyZXRzXG4gICAgZGVwbG95bWVudC5zcGVjLnRlbXBsYXRlLnNwZWMuaW1hZ2VQdWxsU2VjcmV0cyA9IHByb3ZpZGVyLmNvbmZpZy5pbWFnZVB1bGxTZWNyZXRzLm1hcChzID0+ICh7IG5hbWU6IHMubmFtZSB9KSlcbiAgfVxuXG4gIGRlcGxveW1lbnQuc3BlYy50ZW1wbGF0ZS5zcGVjLmNvbnRhaW5lcnMgPSBbY29udGFpbmVyXVxuXG4gIHJldHVybiBkZXBsb3ltZW50XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxldGVDb250YWluZXJTZXJ2aWNlKFxuICB7IG5hbWVzcGFjZSwgcHJvdmlkZXIsIHNlcnZpY2VOYW1lLCBsb2dFbnRyeSB9LFxuKSB7XG5cbiAgY29uc3QgY29udGV4dCA9IHByb3ZpZGVyLmNvbmZpZy5jb250ZXh0XG4gIGF3YWl0IGRlbGV0ZUNvbnRhaW5lckRlcGxveW1lbnQoeyBuYW1lc3BhY2UsIHByb3ZpZGVyLCBzZXJ2aWNlTmFtZSwgbG9nRW50cnkgfSlcbiAgYXdhaXQgZGVsZXRlT2JqZWN0c0J5TGFiZWwoe1xuICAgIGNvbnRleHQsXG4gICAgbmFtZXNwYWNlLFxuICAgIGxhYmVsS2V5OiBcInNlcnZpY2VcIixcbiAgICBsYWJlbFZhbHVlOiBzZXJ2aWNlTmFtZSxcbiAgICBvYmplY3RUeXBlczogW1wiZGVwbG95bWVudFwiLCBcInNlcnZpY2VcIiwgXCJpbmdyZXNzXCJdLFxuICAgIGluY2x1ZGVVbmluaXRpYWxpemVkOiBmYWxzZSxcbiAgfSlcblxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlQ29udGFpbmVyRGVwbG95bWVudChcbiAgeyBuYW1lc3BhY2UsIHByb3ZpZGVyLCBzZXJ2aWNlTmFtZSwgbG9nRW50cnkgfSxcbikge1xuXG4gIGxldCBmb3VuZCA9IHRydWVcbiAgY29uc3QgYXBpID0gbmV3IEt1YmVBcGkocHJvdmlkZXIpXG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBhcGkuZXh0ZW5zaW9ucy5kZWxldGVOYW1lc3BhY2VkRGVwbG95bWVudChzZXJ2aWNlTmFtZSwgbmFtZXNwYWNlLCA8YW55Pnt9KVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoZXJyLmNvZGUgPT09IDQwNCkge1xuICAgICAgZm91bmQgPSBmYWxzZVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH1cblxuICBpZiAobG9nRW50cnkpIHtcbiAgICBmb3VuZCA/IGxvZ0VudHJ5LnNldFN1Y2Nlc3MoXCJTZXJ2aWNlIGRlbGV0ZWRcIikgOiBsb2dFbnRyeS5zZXRXYXJuKFwiU2VydmljZSBub3QgZGVwbG95ZWRcIilcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHVzaE1vZHVsZSh7IGN0eCwgbW9kdWxlLCBsb2dFbnRyeSB9OiBQdXNoTW9kdWxlUGFyYW1zPENvbnRhaW5lck1vZHVsZT4pIHtcbiAgaWYgKCEoYXdhaXQgaGVscGVycy5oYXNEb2NrZXJmaWxlKG1vZHVsZSkpKSB7XG4gICAgbG9nRW50cnkgJiYgbG9nRW50cnkuc2V0U3RhdGUoeyBtc2c6IGBOb3RoaW5nIHRvIHB1c2hgIH0pXG4gICAgcmV0dXJuIHsgcHVzaGVkOiBmYWxzZSB9XG4gIH1cblxuICBjb25zdCBsb2NhbElkID0gYXdhaXQgaGVscGVycy5nZXRMb2NhbEltYWdlSWQobW9kdWxlKVxuICBjb25zdCByZW1vdGVJZCA9IGF3YWl0IGhlbHBlcnMuZ2V0RGVwbG95bWVudEltYWdlSWQobW9kdWxlLCBjdHgucHJvdmlkZXIuY29uZmlnLmRlcGxveW1lbnRSZWdpc3RyeSlcblxuICBsb2dFbnRyeSAmJiBsb2dFbnRyeS5zZXRTdGF0ZSh7IG1zZzogYFB1c2hpbmcgaW1hZ2UgJHtyZW1vdGVJZH0uLi5gIH0pXG5cbiAgYXdhaXQgaGVscGVycy5kb2NrZXJDbGkobW9kdWxlLCBgdGFnICR7bG9jYWxJZH0gJHtyZW1vdGVJZH1gKVxuICBhd2FpdCBoZWxwZXJzLmRvY2tlckNsaShtb2R1bGUsIGBwdXNoICR7cmVtb3RlSWR9YClcblxuICByZXR1cm4geyBwdXNoZWQ6IHRydWUsIG1lc3NhZ2U6IGBQdXNoZWQgJHtsb2NhbElkfWAgfVxufVxuIl19
