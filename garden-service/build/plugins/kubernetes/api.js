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
const client_node_1 = require("@kubernetes/client-node");
const path_1 = require("path");
const fs_1 = require("fs");
const js_yaml_1 = require("js-yaml");
const lodash_1 = require("lodash");
const exceptions_1 = require("../../exceptions");
const os_1 = require("os");
let kubeConfigStr;
let kubeConfig;
const configs = {};
const apiTypes = {
    apiExtensions: client_node_1.Apiextensions_v1beta1Api,
    apps: client_node_1.Apps_v1Api,
    core: client_node_1.Core_v1Api,
    extensions: client_node_1.Extensions_v1beta1Api,
    policy: client_node_1.Policy_v1beta1Api,
    rbac: client_node_1.RbacAuthorization_v1Api,
};
const crudMap = {
    Secret: {
        type: client_node_1.V1Secret,
        group: "core",
        read: "readNamespacedSecret",
        create: "createNamespacedSecret",
        patch: "patchNamespacedSecret",
        delete: "deleteNamespacedSecret",
    },
};
class KubernetesError extends exceptions_1.GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "kubernetes";
    }
}
exports.KubernetesError = KubernetesError;
class KubeApi {
    constructor(provider) {
        this.provider = provider;
        this.context = provider.config.context;
        const config = getSecret(this.context);
        for (const [name, cls] of Object.entries(apiTypes)) {
            const api = new cls(config.getCurrentCluster().server);
            this[name] = this.proxyApi(api, config);
        }
    }
    readBySpec(namespace, spec) {
        return __awaiter(this, void 0, void 0, function* () {
            // this is just awful, sorry. any better ideas? - JE
            const name = spec.metadata.name;
            switch (spec.kind) {
                case "ConfigMap":
                    return this.core.readNamespacedConfigMap(name, namespace);
                case "Endpoints":
                    return this.core.readNamespacedEndpoints(name, namespace);
                case "LimitRange":
                    return this.core.readNamespacedLimitRange(name, namespace);
                case "PersistentVolumeClaim":
                    return this.core.readNamespacedPersistentVolumeClaim(name, namespace);
                case "Pod":
                    return this.core.readNamespacedPod(name, namespace);
                case "PodTemplate":
                    return this.core.readNamespacedPodTemplate(name, namespace);
                case "ReplicationController":
                    return this.core.readNamespacedReplicationController(name, namespace);
                case "ResourceQuota":
                    return this.core.readNamespacedResourceQuota(name, namespace);
                case "Secret":
                    return this.core.readNamespacedSecret(name, namespace);
                case "Service":
                    return this.core.readNamespacedService(name, namespace);
                case "ServiceAccount":
                    return this.core.readNamespacedServiceAccount(name, namespace);
                case "DaemonSet":
                    return this.extensions.readNamespacedDaemonSet(name, namespace);
                case "Deployment":
                    return this.extensions.readNamespacedDeployment(name, namespace);
                case "Ingress":
                    return this.extensions.readNamespacedIngress(name, namespace);
                case "ReplicaSet":
                    return this.extensions.readNamespacedReplicaSet(name, namespace);
                case "StatefulSet":
                    return this.apps.readNamespacedStatefulSet(name, namespace);
                case "ClusterRole":
                    return this.rbac.readClusterRole(name);
                case "ClusterRoleBinding":
                    return this.rbac.readClusterRoleBinding(name);
                case "Role":
                    return this.rbac.readNamespacedRole(name, namespace);
                case "RoleBinding":
                    return this.rbac.readNamespacedRoleBinding(name, namespace);
                case "CustomResourceDefinition":
                    return this.apiExtensions.readCustomResourceDefinition(name);
                case "PodDisruptionBudget":
                    return this.policy.readNamespacedPodDisruptionBudget(name, namespace);
                default:
                    throw new exceptions_1.ConfigurationError(`Unsupported Kubernetes spec kind: ${spec.kind}`, {
                        spec,
                    });
            }
        });
    }
    upsert(kind, namespace, obj) {
        return __awaiter(this, void 0, void 0, function* () {
            const api = this[crudMap[kind].group];
            try {
                const res = yield api[crudMap[kind].read](obj.metadata.name, namespace);
                return res.body;
            }
            catch (err) {
                if (err.code === 404) {
                    try {
                        yield api[crudMap[kind].create](namespace, obj);
                    }
                    catch (err) {
                        if (err.code === 409) {
                            yield api[crudMap[kind].patch](name, namespace, obj);
                        }
                        else {
                            throw err;
                        }
                    }
                }
                else {
                    throw err;
                }
            }
            return obj;
        });
    }
    /**
     * Wrapping the API objects to deal with bugs.
     */
    proxyApi(api, config) {
        api.setDefaultAuthentication(config);
        return new Proxy(api, {
            get: (target, name, receiver) => {
                if (!(name in Object.getPrototypeOf(target))) { // assume methods live on the prototype
                    return Reflect.get(target, name, receiver);
                }
                return function (...args) {
                    const defaultHeaders = target["defaultHeaders"];
                    if (name.startsWith("patch")) {
                        // patch the patch bug... (https://github.com/kubernetes-client/javascript/issues/19)
                        target["defaultHeaders"] = Object.assign({}, defaultHeaders, { "content-type": "application/strategic-merge-patch+json" });
                    }
                    const output = target[name](...args);
                    target["defaultHeaders"] = defaultHeaders;
                    if (typeof output.then === "function") {
                        // the API errors are not properly formed Error objects
                        return output.catch(wrapError);
                    }
                    else {
                        return output;
                    }
                };
            },
        });
    }
}
exports.KubeApi = KubeApi;
function getSecret(context) {
    if (!kubeConfigStr) {
        const kubeConfigPath = process.env.KUBECONFIG || path_1.join(os_1.homedir(), ".kube", "config");
        kubeConfigStr = fs_1.readFileSync(kubeConfigPath).toString();
        kubeConfig = js_yaml_1.safeLoad(kubeConfigStr);
    }
    if (!configs[context]) {
        const kc = new client_node_1.KubeConfig();
        kc.loadFromString(kubeConfigStr);
        kc.setCurrentContext(context);
        // FIXME: need to patch a bug in the library here (https://github.com/kubernetes-client/javascript/pull/54)
        for (const [a, b] of lodash_1.zip(kubeConfig["clusters"] || [], kc.clusters)) {
            if (a && a["cluster"]["insecure-skip-tls-verify"] === true) {
                b.skipTLSVerify = true;
            }
        }
        configs[context] = kc;
    }
    return configs[context];
}
function wrapError(err) {
    if (!err.message) {
        const wrapped = new KubernetesError(`Got error from Kubernetes API - ${err.body.message}`, {
            body: err.body,
            request: lodash_1.omitBy(err.response.request, (v, k) => lodash_1.isObject(v) || k[0] === "_"),
        });
        wrapped.code = err.response.statusCode;
        throw wrapped;
    }
    else {
        throw err;
    }
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9hcGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILHlEQVNnQztBQUNoQywrQkFBMkI7QUFDM0IsMkJBQWlDO0FBQ2pDLHFDQUFrQztBQUNsQyxtQ0FBOEM7QUFDOUMsaURBQXNFO0FBRXRFLDJCQUE0QjtBQUc1QixJQUFJLGFBQXFCLENBQUE7QUFDekIsSUFBSSxVQUFlLENBQUE7QUFFbkIsTUFBTSxPQUFPLEdBQXNDLEVBQUUsQ0FBQTtBQVlyRCxNQUFNLFFBQVEsR0FBOEM7SUFDMUQsYUFBYSxFQUFFLHNDQUF3QjtJQUN2QyxJQUFJLEVBQUUsd0JBQVU7SUFDaEIsSUFBSSxFQUFFLHdCQUFVO0lBQ2hCLFVBQVUsRUFBRSxtQ0FBcUI7SUFDakMsTUFBTSxFQUFFLCtCQUFpQjtJQUN6QixJQUFJLEVBQUUscUNBQXVCO0NBQzlCLENBQUE7QUFFRCxNQUFNLE9BQU8sR0FBRztJQUNkLE1BQU0sRUFBRTtRQUNOLElBQUksRUFBRSxzQkFBUTtRQUNkLEtBQUssRUFBRSxNQUFNO1FBQ2IsSUFBSSxFQUFFLHNCQUFzQjtRQUM1QixNQUFNLEVBQUUsd0JBQXdCO1FBQ2hDLEtBQUssRUFBRSx1QkFBdUI7UUFDOUIsTUFBTSxFQUFFLHdCQUF3QjtLQUNqQztDQUNGLENBQUE7QUFJRCxNQUFhLGVBQWdCLFNBQVEsNEJBQWU7SUFBcEQ7O1FBQ0UsU0FBSSxHQUFHLFlBQVksQ0FBQTtJQUlyQixDQUFDO0NBQUE7QUFMRCwwQ0FLQztBQUVELE1BQWEsT0FBTztJQVVsQixZQUFtQixRQUE0QjtRQUE1QixhQUFRLEdBQVIsUUFBUSxDQUFvQjtRQUM3QyxJQUFJLENBQUMsT0FBTyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQ3RDLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7UUFFdEMsS0FBSyxNQUFNLENBQUMsSUFB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SUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUNwRCxDQUFFLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQTthQUM5QjtTQUNGO1FBRUQsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQTtLQUN0QjtJQUVELE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFBO0FBQ3pCLENBQUM7QUFFRCxTQUFTLFNBQVMsQ0FBQyxHQUFHO0lBQ3BCLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFO1FBQ2hCLE1BQU0sT0FBTyxHQUFHLElBQUksZUFBZSxDQUFDLG1DQUFtQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQ3pGLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSTtZQUNkLE9BQU8sRUFBRSxlQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxpQkFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7U0FDN0UsQ0FBQyxDQUFBO1FBQ0YsT0FBTyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQTtRQUN0QyxNQUFNLE9BQU8sQ0FBQTtLQUNkO1NBQU07UUFDTCxNQUFNLEdBQUcsQ0FBQTtLQUNWO0FBQ0gsQ0FBQyIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvYXBpLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIEt1YmVDb25maWcsXG4gIENvcmVfdjFBcGksXG4gIEV4dGVuc2lvbnNfdjFiZXRhMUFwaSxcbiAgUmJhY0F1dGhvcml6YXRpb25fdjFBcGksXG4gIEFwcHNfdjFBcGksXG4gIEFwaWV4dGVuc2lvbnNfdjFiZXRhMUFwaSxcbiAgVjFTZWNyZXQsXG4gIFBvbGljeV92MWJldGExQXBpLFxufSBmcm9tIFwiQGt1YmVybmV0ZXMvY2xpZW50LW5vZGVcIlxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gXCJmc1wiXG5pbXBvcnQgeyBzYWZlTG9hZCB9IGZyb20gXCJqcy15YW1sXCJcbmltcG9ydCB7IHppcCwgb21pdEJ5LCBpc09iamVjdCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgR2FyZGVuQmFzZUVycm9yLCBDb25maWd1cmF0aW9uRXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBLdWJlcm5ldGVzT2JqZWN0IH0gZnJvbSBcIi4vaGVsbVwiXG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSBcIm9zXCJcbmltcG9ydCB7IEt1YmVybmV0ZXNQcm92aWRlciB9IGZyb20gXCIuL2t1YmVybmV0ZXNcIlxuXG5sZXQga3ViZUNvbmZpZ1N0cjogc3RyaW5nXG5sZXQga3ViZUNvbmZpZzogYW55XG5cbmNvbnN0IGNvbmZpZ3M6IHsgW2NvbnRleHQ6IHN0cmluZ106IEt1YmVDb25maWcgfSA9IHt9XG5cbi8vIE5PVEU6IGJlIHdhcm5lZCwgdGhlIEFQSSBvZiB0aGUgY2xpZW50IGxpYnJhcnkgaXMgdmVyeSBsaWtlbHkgdG8gY2hhbmdlXG5cbnR5cGUgSzhzQXBpID0gQ29yZV92MUFwaVxuICB8IEV4dGVuc2lvbnNfdjFiZXRhMUFwaVxuICB8IFJiYWNBdXRob3JpemF0aW9uX3YxQXBpXG4gIHwgQXBwc192MUFwaVxuICB8IEFwaWV4dGVuc2lvbnNfdjFiZXRhMUFwaVxuICB8IFBvbGljeV92MWJldGExQXBpXG50eXBlIEs4c0FwaUNvbnN0cnVjdG9yPFQgZXh0ZW5kcyBLOHNBcGk+ID0gbmV3IChiYXNlUGF0aD86IHN0cmluZykgPT4gVFxuXG5jb25zdCBhcGlUeXBlczogeyBba2V5OiBzdHJpbmddOiBLOHNBcGlDb25zdHJ1Y3Rvcjxhbnk+IH0gPSB7XG4gIGFwaUV4dGVuc2lvbnM6IEFwaWV4dGVuc2lvbnNfdjFiZXRhMUFwaSxcbiAgYXBwczogQXBwc192MUFwaSxcbiAgY29yZTogQ29yZV92MUFwaSxcbiAgZXh0ZW5zaW9uczogRXh0ZW5zaW9uc192MWJldGExQXBpLFxuICBwb2xpY3k6IFBvbGljeV92MWJldGExQXBpLFxuICByYmFjOiBSYmFjQXV0aG9yaXphdGlvbl92MUFwaSxcbn1cblxuY29uc3QgY3J1ZE1hcCA9IHtcbiAgU2VjcmV0OiB7XG4gICAgdHlwZTogVjFTZWNyZXQsXG4gICAgZ3JvdXA6IFwiY29yZVwiLFxuICAgIHJlYWQ6IFwicmVhZE5hbWVzcGFjZWRTZWNyZXRcIixcbiAgICBjcmVhdGU6IFwiY3JlYXRlTmFtZXNwYWNlZFNlY3JldFwiLFxuICAgIHBhdGNoOiBcInBhdGNoTmFtZXNwYWNlZFNlY3JldFwiLFxuICAgIGRlbGV0ZTogXCJkZWxldGVOYW1lc3BhY2VkU2VjcmV0XCIsXG4gIH0sXG59XG5cbnR5cGUgQ3J1ZE1hcFR5cGUgPSB0eXBlb2YgY3J1ZE1hcFxuXG5leHBvcnQgY2xhc3MgS3ViZXJuZXRlc0Vycm9yIGV4dGVuZHMgR2FyZGVuQmFzZUVycm9yIHtcbiAgdHlwZSA9IFwia3ViZXJuZXRlc1wiXG5cbiAgY29kZT86IG51bWJlclxuICByZXNwb25zZT86IGFueVxufVxuXG5leHBvcnQgY2xhc3MgS3ViZUFwaSB7XG4gIHB1YmxpYyBjb250ZXh0OiBzdHJpbmdcblxuICBwdWJsaWMgYXBpRXh0ZW5zaW9uczogQXBpZXh0ZW5zaW9uc192MWJldGExQXBpXG4gIHB1YmxpYyBhcHBzOiBBcHBzX3YxQXBpXG4gIHB1YmxpYyBjb3JlOiBDb3JlX3YxQXBpXG4gIHB1YmxpYyBleHRlbnNpb25zOiBFeHRlbnNpb25zX3YxYmV0YTFBcGlcbiAgcHVibGljIHBvbGljeTogUG9saWN5X3YxYmV0YTFBcGlcbiAgcHVibGljIHJiYWM6IFJiYWNBdXRob3JpemF0aW9uX3YxQXBpXG5cbiAgY29uc3RydWN0b3IocHVibGljIHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIpIHtcbiAgICB0aGlzLmNvbnRleHQgPSBwcm92aWRlci5jb25maWcuY29udGV4dFxuICAgIGNvbnN0IGNvbmZpZyA9IGdldFNlY3JldCh0aGlzLmNvbnRleHQpXG5cbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBjbHNdIG9mIE9iamVjdC5lbnRyaWVzKGFwaVR5cGVzKSkge1xuICAgICAgY29uc3QgYXBpID0gbmV3IGNscyhjb25maWcuZ2V0Q3VycmVudENsdXN0ZXIoKS5zZXJ2ZXIpXG4gICAgICB0aGlzW25hbWVdID0gdGhpcy5wcm94eUFwaShhcGksIGNvbmZpZylcbiAgICB9XG4gIH1cblxuICBhc3luYyByZWFkQnlTcGVjKG5hbWVzcGFjZTogc3RyaW5nLCBzcGVjOiBLdWJlcm5ldGVzT2JqZWN0KSB7XG4gICAgLy8gdGhpcyBpcyBqdXN0IGF3ZnVsLCBzb3JyeS4gYW55IGJldHRlciBpZGVhcz8gLSBKRVxuICAgIGNvbnN0IG5hbWUgPSBzcGVjLm1ldGFkYXRhLm5hbWVcblxuICAgIHN3aXRjaCAoc3BlYy5raW5kKSB7XG4gICAgICBjYXNlIFwiQ29uZmlnTWFwXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRDb25maWdNYXAobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIkVuZHBvaW50c1wiOlxuICAgICAgICByZXR1cm4gdGhpcy5jb3JlLnJlYWROYW1lc3BhY2VkRW5kcG9pbnRzKG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJMaW1pdFJhbmdlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRMaW1pdFJhbmdlKG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJQZXJzaXN0ZW50Vm9sdW1lQ2xhaW1cIjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29yZS5yZWFkTmFtZXNwYWNlZFBlcnNpc3RlbnRWb2x1bWVDbGFpbShuYW1lLCBuYW1lc3BhY2UpXG4gICAgICBjYXNlIFwiUG9kXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRQb2QobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIlBvZFRlbXBsYXRlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRQb2RUZW1wbGF0ZShuYW1lLCBuYW1lc3BhY2UpXG4gICAgICBjYXNlIFwiUmVwbGljYXRpb25Db250cm9sbGVyXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRSZXBsaWNhdGlvbkNvbnRyb2xsZXIobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIlJlc291cmNlUXVvdGFcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29yZS5yZWFkTmFtZXNwYWNlZFJlc291cmNlUXVvdGEobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIlNlY3JldFwiOlxuICAgICAgICByZXR1cm4gdGhpcy5jb3JlLnJlYWROYW1lc3BhY2VkU2VjcmV0KG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJTZXJ2aWNlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmNvcmUucmVhZE5hbWVzcGFjZWRTZXJ2aWNlKG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJTZXJ2aWNlQWNjb3VudFwiOlxuICAgICAgICByZXR1cm4gdGhpcy5jb3JlLnJlYWROYW1lc3BhY2VkU2VydmljZUFjY291bnQobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIkRhZW1vblNldFwiOlxuICAgICAgICByZXR1cm4gdGhpcy5leHRlbnNpb25zLnJlYWROYW1lc3BhY2VkRGFlbW9uU2V0KG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJEZXBsb3ltZW50XCI6XG4gICAgICAgIHJldHVybiB0aGlzLmV4dGVuc2lvbnMucmVhZE5hbWVzcGFjZWREZXBsb3ltZW50KG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJJbmdyZXNzXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmV4dGVuc2lvbnMucmVhZE5hbWVzcGFjZWRJbmdyZXNzKG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJSZXBsaWNhU2V0XCI6XG4gICAgICAgIHJldHVybiB0aGlzLmV4dGVuc2lvbnMucmVhZE5hbWVzcGFjZWRSZXBsaWNhU2V0KG5hbWUsIG5hbWVzcGFjZSlcbiAgICAgIGNhc2UgXCJTdGF0ZWZ1bFNldFwiOlxuICAgICAgICByZXR1cm4gdGhpcy5hcHBzLnJlYWROYW1lc3BhY2VkU3RhdGVmdWxTZXQobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIkNsdXN0ZXJSb2xlXCI6XG4gICAgICAgIHJldHVybiB0aGlzLnJiYWMucmVhZENsdXN0ZXJSb2xlKG5hbWUpXG4gICAgICBjYXNlIFwiQ2x1c3RlclJvbGVCaW5kaW5nXCI6XG4gICAgICAgIHJldHVybiB0aGlzLnJiYWMucmVhZENsdXN0ZXJSb2xlQmluZGluZyhuYW1lKVxuICAgICAgY2FzZSBcIlJvbGVcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMucmJhYy5yZWFkTmFtZXNwYWNlZFJvbGUobmFtZSwgbmFtZXNwYWNlKVxuICAgICAgY2FzZSBcIlJvbGVCaW5kaW5nXCI6XG4gICAgICAgIHJldHVybiB0aGlzLnJiYWMucmVhZE5hbWVzcGFjZWRSb2xlQmluZGluZyhuYW1lLCBuYW1lc3BhY2UpXG4gICAgICBjYXNlIFwiQ3VzdG9tUmVzb3VyY2VEZWZpbml0aW9uXCI6XG4gICAgICAgIHJldHVybiB0aGlzLmFwaUV4dGVuc2lvbnMucmVhZEN1c3RvbVJlc291cmNlRGVmaW5pdGlvbihuYW1lKVxuICAgICAgY2FzZSBcIlBvZERpc3J1cHRpb25CdWRnZXRcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMucG9saWN5LnJlYWROYW1lc3BhY2VkUG9kRGlzcnVwdGlvbkJ1ZGdldChuYW1lLCBuYW1lc3BhY2UpXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBLdWJlcm5ldGVzIHNwZWMga2luZDogJHtzcGVjLmtpbmR9YCwge1xuICAgICAgICAgIHNwZWMsXG4gICAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgdXBzZXJ0PEsgZXh0ZW5kcyBrZXlvZiBDcnVkTWFwVHlwZT4oXG4gICAga2luZDogSywgbmFtZXNwYWNlOiBzdHJpbmcsIG9iajogS3ViZXJuZXRlc09iamVjdCxcbiAgKTogUHJvbWlzZTxLdWJlcm5ldGVzT2JqZWN0PiB7XG4gICAgY29uc3QgYXBpID0gdGhpc1tjcnVkTWFwW2tpbmRdLmdyb3VwXVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGFwaVtjcnVkTWFwW2tpbmRdLnJlYWRdKG9iai5tZXRhZGF0YS5uYW1lLCBuYW1lc3BhY2UpXG4gICAgICByZXR1cm4gcmVzLmJvZHlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIuY29kZSA9PT0gNDA0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgYXdhaXQgYXBpW2NydWRNYXBba2luZF0uY3JlYXRlXShuYW1lc3BhY2UsIDxhbnk+b2JqKVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IDQwOSkge1xuICAgICAgICAgICAgYXdhaXQgYXBpW2NydWRNYXBba2luZF0ucGF0Y2hdKG5hbWUsIG5hbWVzcGFjZSwgb2JqKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBlcnJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVyclxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmpcbiAgfVxuXG4gIC8qKlxuICAgKiBXcmFwcGluZyB0aGUgQVBJIG9iamVjdHMgdG8gZGVhbCB3aXRoIGJ1Z3MuXG4gICAqL1xuICBwcml2YXRlIHByb3h5QXBpPFQgZXh0ZW5kcyBLOHNBcGk+KGFwaTogVCwgY29uZmlnKTogVCB7XG4gICAgYXBpLnNldERlZmF1bHRBdXRoZW50aWNhdGlvbihjb25maWcpXG5cbiAgICByZXR1cm4gbmV3IFByb3h5KGFwaSwge1xuICAgICAgZ2V0OiAodGFyZ2V0OiBULCBuYW1lOiBzdHJpbmcsIHJlY2VpdmVyKSA9PiB7XG4gICAgICAgIGlmICghKG5hbWUgaW4gT2JqZWN0LmdldFByb3RvdHlwZU9mKHRhcmdldCkpKSB7IC8vIGFzc3VtZSBtZXRob2RzIGxpdmUgb24gdGhlIHByb3RvdHlwZVxuICAgICAgICAgIHJldHVybiBSZWZsZWN0LmdldCh0YXJnZXQsIG5hbWUsIHJlY2VpdmVyKVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKC4uLmFyZ3MpIHtcbiAgICAgICAgICBjb25zdCBkZWZhdWx0SGVhZGVycyA9IHRhcmdldFtcImRlZmF1bHRIZWFkZXJzXCJdXG5cbiAgICAgICAgICBpZiAobmFtZS5zdGFydHNXaXRoKFwicGF0Y2hcIikpIHtcbiAgICAgICAgICAgIC8vIHBhdGNoIHRoZSBwYXRjaCBidWcuLi4gKGh0dHBzOi8vZ2l0aHViLmNvbS9rdWJlcm5ldGVzLWNsaWVudC9qYXZhc2NyaXB0L2lzc3Vlcy8xOSlcbiAgICAgICAgICAgIHRhcmdldFtcImRlZmF1bHRIZWFkZXJzXCJdID0geyAuLi5kZWZhdWx0SGVhZGVycywgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9zdHJhdGVnaWMtbWVyZ2UtcGF0Y2granNvblwiIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBvdXRwdXQgPSB0YXJnZXRbbmFtZV0oLi4uYXJncylcbiAgICAgICAgICB0YXJnZXRbXCJkZWZhdWx0SGVhZGVyc1wiXSA9IGRlZmF1bHRIZWFkZXJzXG5cbiAgICAgICAgICBpZiAodHlwZW9mIG91dHB1dC50aGVuID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIC8vIHRoZSBBUEkgZXJyb3JzIGFyZSBub3QgcHJvcGVybHkgZm9ybWVkIEVycm9yIG9iamVjdHNcbiAgICAgICAgICAgIHJldHVybiBvdXRwdXQuY2F0Y2god3JhcEVycm9yKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb3V0cHV0XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pXG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0U2VjcmV0KGNvbnRleHQ6IHN0cmluZyk6IEt1YmVDb25maWcge1xuICBpZiAoIWt1YmVDb25maWdTdHIpIHtcbiAgICBjb25zdCBrdWJlQ29uZmlnUGF0aCA9IHByb2Nlc3MuZW52LktVQkVDT05GSUcgfHwgam9pbihob21lZGlyKCksIFwiLmt1YmVcIiwgXCJjb25maWdcIilcbiAgICBrdWJlQ29uZmlnU3RyID0gcmVhZEZpbGVTeW5jKGt1YmVDb25maWdQYXRoKS50b1N0cmluZygpXG4gICAga3ViZUNvbmZpZyA9IHNhZmVMb2FkKGt1YmVDb25maWdTdHIpXG4gIH1cblxuICBpZiAoIWNvbmZpZ3NbY29udGV4dF0pIHtcbiAgICBjb25zdCBrYyA9IG5ldyBLdWJlQ29uZmlnKClcblxuICAgIGtjLmxvYWRGcm9tU3RyaW5nKGt1YmVDb25maWdTdHIpXG4gICAga2Muc2V0Q3VycmVudENvbnRleHQoY29udGV4dClcblxuICAgIC8vIEZJWE1FOiBuZWVkIHRvIHBhdGNoIGEgYnVnIGluIHRoZSBsaWJyYXJ5IGhlcmUgKGh0dHBzOi8vZ2l0aHViLmNvbS9rdWJlcm5ldGVzLWNsaWVudC9qYXZhc2NyaXB0L3B1bGwvNTQpXG4gICAgZm9yIChjb25zdCBbYSwgYl0gb2YgemlwKGt1YmVDb25maWdbXCJjbHVzdGVyc1wiXSB8fCBbXSwga2MuY2x1c3RlcnMpKSB7XG4gICAgICBpZiAoYSAmJiBhW1wiY2x1c3RlclwiXVtcImluc2VjdXJlLXNraXAtdGxzLXZlcmlmeVwiXSA9PT0gdHJ1ZSkge1xuICAgICAgICAoPGFueT5iKS5za2lwVExTVmVyaWZ5ID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbmZpZ3NbY29udGV4dF0gPSBrY1xuICB9XG5cbiAgcmV0dXJuIGNvbmZpZ3NbY29udGV4dF1cbn1cblxuZnVuY3Rpb24gd3JhcEVycm9yKGVycikge1xuICBpZiAoIWVyci5tZXNzYWdlKSB7XG4gICAgY29uc3Qgd3JhcHBlZCA9IG5ldyBLdWJlcm5ldGVzRXJyb3IoYEdvdCBlcnJvciBmcm9tIEt1YmVybmV0ZXMgQVBJIC0gJHtlcnIuYm9keS5tZXNzYWdlfWAsIHtcbiAgICAgIGJvZHk6IGVyci5ib2R5LFxuICAgICAgcmVxdWVzdDogb21pdEJ5KGVyci5yZXNwb25zZS5yZXF1ZXN0LCAodiwgaykgPT4gaXNPYmplY3QodikgfHwga1swXSA9PT0gXCJfXCIpLFxuICAgIH0pXG4gICAgd3JhcHBlZC5jb2RlID0gZXJyLnJlc3BvbnNlLnN0YXR1c0NvZGVcbiAgICB0aHJvdyB3cmFwcGVkXG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgZXJyXG4gIH1cbn1cbiJdfQ==
