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
const exceptions_1 = require("../../exceptions");
const util_1 = require("../../util/util");
const api_1 = require("./api");
const kubectl_1 = require("./kubectl");
const namespace_1 = require("./namespace");
const Bluebird = require("bluebird");
const lodash_1 = require("lodash");
const is_subset_1 = require("../../util/is-subset");
// Handlers to check the rollout status for K8s objects where that applies.
// Using https://github.com/kubernetes/helm/blob/master/pkg/kube/wait.go as a reference here.
const objHandlers = {
    DaemonSet: checkDeploymentStatus,
    Deployment: checkDeploymentStatus,
    StatefulSet: checkDeploymentStatus,
    PersistentVolumeClaim: (api, namespace, obj) => __awaiter(this, void 0, void 0, function* () {
        const res = yield api.core.readNamespacedPersistentVolumeClaim(obj.metadata.name, namespace);
        const state = res.body.status.phase === "Bound" ? "ready" : "deploying";
        return { state, obj };
    }),
    Pod: (api, namespace, obj) => __awaiter(this, void 0, void 0, function* () {
        const res = yield api.core.readNamespacedPod(obj.metadata.name, namespace);
        return checkPodStatus(obj, [res.body]);
    }),
    ReplicaSet: (api, namespace, obj) => __awaiter(this, void 0, void 0, function* () {
        const res = yield api.core.listNamespacedPod(namespace, undefined, undefined, undefined, true, obj.spec.selector.matchLabels);
        return checkPodStatus(obj, res.body.items);
    }),
    ReplicationController: (api, namespace, obj) => __awaiter(this, void 0, void 0, function* () {
        const res = yield api.core.listNamespacedPod(namespace, undefined, undefined, undefined, true, obj.spec.selector);
        return checkPodStatus(obj, res.body.items);
    }),
    Service: (api, namespace, obj) => __awaiter(this, void 0, void 0, function* () {
        if (obj.spec.type === "ExternalName") {
            return { state: "ready", obj };
        }
        const status = yield api.core.readNamespacedService(obj.metadata.name, namespace);
        if (obj.spec.clusterIP !== "None" && status.body.spec.clusterIP === "") {
            return { state: "deploying", obj };
        }
        if (obj.spec.type === "LoadBalancer" && !status.body.status.loadBalancer.ingress) {
            return { state: "deploying", obj };
        }
        return { state: "ready", obj };
    }),
};
function checkPodStatus(obj, pods) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const pod of pods) {
            const ready = lodash_1.some(pod.status.conditions.map(c => c.type === "ready"));
            if (!ready) {
                return { state: "deploying", obj };
            }
        }
        return { state: "ready", obj };
    });
}
/**
 * Check the rollout status for the given Deployment, DaemonSet or StatefulSet.
 *
 * NOTE: This mostly replicates the logic in `kubectl rollout status`. Using that directly here
 * didn't pan out, since it doesn't look for events and just times out when errors occur during rollout.
 */
function checkDeploymentStatus(api, namespace, obj, resourceVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        //
        const out = {
            state: "unhealthy",
            obj,
            resourceVersion,
        };
        let statusRes;
        try {
            statusRes = (yield api.readBySpec(namespace, obj)).body;
        }
        catch (err) {
            if (err.code && err.code === 404) {
                // service is not running
                return out;
            }
            else {
                throw err;
            }
        }
        if (!resourceVersion) {
            resourceVersion = out.resourceVersion = parseInt(statusRes.metadata.resourceVersion, 10);
        }
        // TODO: try to come up with something more efficient. may need to wait for newer k8s version.
        // note: the resourceVersion parameter does not appear to work...
        const eventsRes = yield api.core.listNamespacedEvent(namespace);
        // const eventsRes = await this.kubeApi(
        //   "GET",
        //   [
        //     "apis", apiSection, "v1beta1",
        //     "watch",
        //     "namespaces", namespace,
        //     type + "s", service.fullName,
        //   ],
        //   { resourceVersion, watch: "false" },
        // )
        // look for errors and warnings in the events for the service, abort if we find any
        const events = eventsRes.body.items;
        for (let event of events) {
            const eventVersion = parseInt(event.metadata.resourceVersion, 10);
            if (eventVersion <= resourceVersion ||
                (!event.metadata.name.startsWith(obj.metadata.name + ".")
                    &&
                        !event.metadata.name.startsWith(obj.metadata.name + "-"))) {
                continue;
            }
            if (eventVersion > resourceVersion) {
                out.resourceVersion = eventVersion;
            }
            if (event.type === "Warning" || event.type === "Error") {
                if (event.reason === "Unhealthy") {
                    // still waiting on readiness probe
                    continue;
                }
                out.state = "unhealthy";
                out.lastError = `${event.reason} - ${event.message}`;
                return out;
            }
            let message = event.message;
            if (event.reason === event.reason.toUpperCase()) {
                // some events like ingress events are formatted this way
                message = `${event.reason} ${message}`;
            }
            if (message) {
                out.lastMessage = message;
            }
        }
        // See `https://github.com/kubernetes/kubernetes/blob/master/pkg/kubectl/rollout_status.go` for a reference
        // for this logic.
        out.state = "ready";
        let statusMsg = "";
        if (statusRes.metadata.generation > statusRes.status.observedGeneration) {
            statusMsg = `Waiting for spec update to be observed...`;
            out.state = "deploying";
        }
        else if (obj.kind === "DaemonSet") {
            const status = statusRes.status;
            const desired = status.desiredNumberScheduled || 0;
            const updated = status.updatedNumberScheduled || 0;
            const available = status.numberAvailable || 0;
            if (updated < desired) {
                statusMsg = `Waiting for rollout: ${updated} out of ${desired} new pods updated...`;
                out.state = "deploying";
            }
            else if (available < desired) {
                statusMsg = `Waiting for rollout: ${available} out of ${desired} updated pods available...`;
                out.state = "deploying";
            }
        }
        else if (obj.kind === "StatefulSet") {
            const status = statusRes.status;
            const statusSpec = statusRes.spec;
            const replicas = status.replicas;
            const updated = status.updatedReplicas || 0;
            const ready = status.readyReplicas || 0;
            if (replicas && ready < replicas) {
                statusMsg = `Waiting for rollout: ${ready} out of ${replicas} new pods updated...`;
                out.state = "deploying";
            }
            else if (statusSpec.updateStrategy.type === "RollingUpdate" && statusSpec.updateStrategy.rollingUpdate) {
                if (replicas && statusSpec.updateStrategy.rollingUpdate.partition) {
                    const desired = replicas - statusSpec.updateStrategy.rollingUpdate.partition;
                    if (updated < desired) {
                        statusMsg =
                            `Waiting for partitioned roll out to finish: ${updated} out of ${desired} new pods have been updated...`;
                        out.state = "deploying";
                    }
                }
            }
            else if (status.updateRevision !== status.currentRevision) {
                statusMsg = `Waiting for rolling update to complete...`;
                out.state = "deploying";
            }
        }
        else {
            const status = statusRes.status;
            const desired = 1; // TODO: service.count[env.name] || 1
            const updated = status.updatedReplicas || 0;
            const replicas = status.replicas || 0;
            const available = status.availableReplicas || 0;
            if (updated < desired) {
                statusMsg = `Waiting for rollout: ${updated} out of ${desired} new replicas updated...`;
                out.state = "deploying";
            }
            else if (replicas > updated) {
                statusMsg = `Waiting for rollout: ${replicas - updated} old replicas pending termination...`;
                out.state = "deploying";
            }
            else if (available < updated) {
                statusMsg = `Waiting for rollout: ${available} out of ${updated} updated replicas available...`;
                out.state = "deploying";
            }
        }
        out.lastMessage = statusMsg;
        return out;
    });
}
exports.checkDeploymentStatus = checkDeploymentStatus;
/**
 * Check if the specified Kubernetes objects are deployed and fully rolled out
 */
function checkObjectStatus(api, namespace, objects, prevStatuses) {
    return __awaiter(this, void 0, void 0, function* () {
        let ready = true;
        const statuses = yield Bluebird.map(objects, (obj, i) => __awaiter(this, void 0, void 0, function* () {
            const handler = objHandlers[obj.kind];
            const prevStatus = prevStatuses && prevStatuses[i];
            const status = handler
                ? yield handler(api, namespace, obj, prevStatus && prevStatus.resourceVersion)
                // if there is no explicit handler to check the status, we assume there's no rollout phase to wait for
                : { state: "ready", obj };
            if (status.state !== "ready") {
                ready = false;
            }
            return status;
        }));
        return { ready, statuses };
    });
}
exports.checkObjectStatus = checkObjectStatus;
/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
function waitForObjects({ ctx, provider, service, objects, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        let loops = 0;
        let lastMessage;
        const startTime = new Date().getTime();
        logEntry && logEntry.verbose({
            symbol: "info",
            section: service.name,
            msg: `Waiting for service to be ready...`,
        });
        const api = new api_1.KubeApi(provider);
        const namespace = yield namespace_1.getAppNamespace(ctx, provider);
        let prevStatuses = objects.map((obj) => ({
            state: "unknown",
            obj,
        }));
        while (true) {
            yield util_1.sleep(2000 + 1000 * loops);
            const { ready, statuses } = yield checkObjectStatus(api, namespace, objects, prevStatuses);
            for (const status of statuses) {
                if (status.lastError) {
                    throw new exceptions_1.DeploymentError(`Error deploying ${service.name}: ${status.lastError}`, {
                        serviceName: service.name,
                        status,
                    });
                }
                if (status.lastMessage && (!lastMessage || status.lastMessage !== lastMessage)) {
                    lastMessage = status.lastMessage;
                    logEntry && logEntry.verbose({
                        symbol: "info",
                        section: service.name,
                        msg: status.lastMessage,
                    });
                }
            }
            prevStatuses = statuses;
            if (ready) {
                break;
            }
            const now = new Date().getTime();
            if (now - startTime > kubectl_1.KUBECTL_DEFAULT_TIMEOUT * 1000) {
                throw new Error(`Timed out waiting for ${service.name} to deploy`);
            }
        }
        logEntry && logEntry.verbose({ symbol: "info", section: service.name, msg: `Service deployed` });
    });
}
exports.waitForObjects = waitForObjects;
/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
function compareDeployedObjects(ctx, objects) {
    return __awaiter(this, void 0, void 0, function* () {
        const existingObjects = yield Bluebird.map(objects, obj => getDeployedObject(ctx, ctx.provider, obj));
        for (let [obj, existingSpec] of lodash_1.zip(objects, existingObjects)) {
            if (existingSpec && obj) {
                // the API version may implicitly change when deploying
                existingSpec.apiVersion = obj.apiVersion;
                // the namespace property is silently dropped when added to non-namespaced
                if (obj.metadata.namespace && existingSpec.metadata.namespace === undefined) {
                    delete obj.metadata.namespace;
                }
                if (!existingSpec.metadata.annotations) {
                    existingSpec.metadata.annotations = {};
                }
                // handle auto-filled properties (this is a bit of a design issue in the K8s API)
                if (obj.kind === "Service" && obj.spec.clusterIP === "") {
                    delete obj.spec.clusterIP;
                }
                // handle properties that are omitted in the response because they have the default value
                // (another design issue in the K8s API)
                // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
                //       `kubectl diff` is ready, or server-side apply/diff is ready
                if (obj.kind === "DaemonSet") {
                    if (obj.spec.minReadySeconds === 0) {
                        delete obj.spec.minReadySeconds;
                    }
                    if (obj.spec.template.spec.hostNetwork === false) {
                        delete obj.spec.template.spec.hostNetwork;
                    }
                }
                // clean null values
                obj = removeNull(obj);
            }
            if (!existingSpec || !is_subset_1.isSubset(existingSpec, obj)) {
                // console.log(JSON.stringify(obj, null, 4))
                // console.log(JSON.stringify(existingSpec, null, 4))
                // console.log("----------------------------------------------------")
                // throw new Error("bla")
                return false;
            }
        }
        return true;
    });
}
exports.compareDeployedObjects = compareDeployedObjects;
function getDeployedObject(ctx, provider, obj) {
    return __awaiter(this, void 0, void 0, function* () {
        const api = new api_1.KubeApi(provider);
        const namespace = obj.metadata.namespace || (yield namespace_1.getAppNamespace(ctx, provider));
        try {
            const res = yield api.readBySpec(namespace, obj);
            return res.body;
        }
        catch (err) {
            if (err.code === 404) {
                return null;
            }
            else {
                throw err;
            }
        }
    });
}
/**
 * Recursively removes all null value properties from objects
 */
function removeNull(value) {
    if (lodash_1.isArray(value)) {
        return value.map(removeNull);
    }
    else if (lodash_1.isPlainObject(value)) {
        return lodash_1.mapValues(lodash_1.pickBy(value, v => v !== null), removeNull);
    }
    else {
        return value;
    }
}
exports.removeNull = removeNull;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9zdGF0dXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlEQUFrRDtBQUdsRCwwQ0FBdUM7QUFDdkMsK0JBQStCO0FBQy9CLHVDQUFtRDtBQUNuRCwyQ0FBNkM7QUFDN0MscUNBQW9DO0FBWXBDLG1DQUE2RTtBQUc3RSxvREFBK0M7QUFjL0MsMkVBQTJFO0FBQzNFLDZGQUE2RjtBQUM3RixNQUFNLFdBQVcsR0FBbUM7SUFDbEQsU0FBUyxFQUFFLHFCQUFxQjtJQUNoQyxVQUFVLEVBQUUscUJBQXFCO0lBQ2pDLFdBQVcsRUFBRSxxQkFBcUI7SUFFbEMscUJBQXFCLEVBQUUsQ0FBTyxHQUFHLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ25ELE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQTtRQUM1RixNQUFNLEtBQUssR0FBaUIsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUE7UUFDckYsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQTtJQUN2QixDQUFDLENBQUE7SUFFRCxHQUFHLEVBQUUsQ0FBTyxHQUFHLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ2pDLE1BQU0sR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQTtRQUMxRSxPQUFPLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtJQUN4QyxDQUFDLENBQUE7SUFFRCxV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QUU7UUFDbEIsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFBO0tBQzdCO1NBQU0sSUFBSSxzQkFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQy9CLE9BQWlDLGtCQUFTLENBQUMsZUFBTSxDQUFNLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQTtLQUM1RjtTQUFNO1FBQ0wsT0FBTyxLQUFLLENBQUE7S0FDYjtBQUNILENBQUM7QUFSRCxnQ0FRQyIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvc3RhdHVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IERlcGxveW1lbnRFcnJvciB9IGZyb20gXCIuLi8uLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IFBsdWdpbkNvbnRleHQgfSBmcm9tIFwiLi4vLi4vcGx1Z2luLWNvbnRleHRcIlxuaW1wb3J0IHsgU2VydmljZSwgU2VydmljZVN0YXRlIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHsgc2xlZXAgfSBmcm9tIFwiLi4vLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IEt1YmVBcGkgfSBmcm9tIFwiLi9hcGlcIlxuaW1wb3J0IHsgS1VCRUNUTF9ERUZBVUxUX1RJTUVPVVQgfSBmcm9tIFwiLi9rdWJlY3RsXCJcbmltcG9ydCB7IGdldEFwcE5hbWVzcGFjZSB9IGZyb20gXCIuL25hbWVzcGFjZVwiXG5pbXBvcnQgKiBhcyBCbHVlYmlyZCBmcm9tIFwiYmx1ZWJpcmRcIlxuaW1wb3J0IHsgS3ViZXJuZXRlc09iamVjdCB9IGZyb20gXCIuL2hlbG1cIlxuaW1wb3J0IHtcbiAgVjFQb2QsXG4gIFYxRGVwbG95bWVudCxcbiAgVjFEYWVtb25TZXQsXG4gIFYxRGFlbW9uU2V0U3RhdHVzLFxuICBWMVN0YXRlZnVsU2V0U3RhdHVzLFxuICBWMVN0YXRlZnVsU2V0LFxuICBWMVN0YXRlZnVsU2V0U3BlYyxcbiAgVjFEZXBsb3ltZW50U3RhdHVzLFxufSBmcm9tIFwiQGt1YmVybmV0ZXMvY2xpZW50LW5vZGVcIlxuaW1wb3J0IHsgc29tZSwgemlwLCBpc0FycmF5LCBpc1BsYWluT2JqZWN0LCBwaWNrQnksIG1hcFZhbHVlcyB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgS3ViZXJuZXRlc1Byb3ZpZGVyIH0gZnJvbSBcIi4va3ViZXJuZXRlc1wiXG5pbXBvcnQgeyBMb2dFbnRyeSB9IGZyb20gXCIuLi8uLi9sb2dnZXIvbG9nLWVudHJ5XCJcbmltcG9ydCB7IGlzU3Vic2V0IH0gZnJvbSBcIi4uLy4uL3V0aWwvaXMtc3Vic2V0XCJcblxuZXhwb3J0IGludGVyZmFjZSBSb2xsb3V0U3RhdHVzIHtcbiAgc3RhdGU6IFNlcnZpY2VTdGF0ZVxuICBvYmo6IEt1YmVybmV0ZXNPYmplY3RcbiAgbGFzdE1lc3NhZ2U/OiBzdHJpbmdcbiAgbGFzdEVycm9yPzogc3RyaW5nXG4gIHJlc291cmNlVmVyc2lvbj86IG51bWJlclxufVxuXG5pbnRlcmZhY2UgT2JqSGFuZGxlciB7XG4gIChhcGk6IEt1YmVBcGksIG5hbWVzcGFjZTogc3RyaW5nLCBvYmo6IEt1YmVybmV0ZXNPYmplY3QsIHJlc291cmNlVmVyc2lvbj86IG51bWJlcik6IFByb21pc2U8Um9sbG91dFN0YXR1cz5cbn1cblxuLy8gSGFuZGxlcnMgdG8gY2hlY2sgdGhlIHJvbGxvdXQgc3RhdHVzIGZvciBLOHMgb2JqZWN0cyB3aGVyZSB0aGF0IGFwcGxpZXMuXG4vLyBVc2luZyBodHRwczovL2dpdGh1Yi5jb20va3ViZXJuZXRlcy9oZWxtL2Jsb2IvbWFzdGVyL3BrZy9rdWJlL3dhaXQuZ28gYXMgYSByZWZlcmVuY2UgaGVyZS5cbmNvbnN0IG9iakhhbmRsZXJzOiB7IFtraW5kOiBzdHJpbmddOiBPYmpIYW5kbGVyIH0gPSB7XG4gIERhZW1vblNldDogY2hlY2tEZXBsb3ltZW50U3RhdHVzLFxuICBEZXBsb3ltZW50OiBjaGVja0RlcGxveW1lbnRTdGF0dXMsXG4gIFN0YXRlZnVsU2V0OiBjaGVja0RlcGxveW1lbnRTdGF0dXMsXG5cbiAgUGVyc2lzdGVudFZvbHVtZUNsYWltOiBhc3luYyAoYXBpLCBuYW1lc3BhY2UsIG9iaikgPT4ge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGFwaS5jb3JlLnJlYWROYW1lc3BhY2VkUGVyc2lzdGVudFZvbHVtZUNsYWltKG9iai5tZXRhZGF0YS5uYW1lLCBuYW1lc3BhY2UpXG4gICAgY29uc3Qgc3RhdGU6IFNlcnZpY2VTdGF0ZSA9IHJlcy5ib2R5LnN0YXR1cy5waGFzZSA9PT0gXCJCb3VuZFwiID8gXCJyZWFkeVwiIDogXCJkZXBsb3lpbmdcIlxuICAgIHJldHVybiB7IHN0YXRlLCBvYmogfVxuICB9LFxuXG4gIFBvZDogYXN5bmMgKGFwaSwgbmFtZXNwYWNlLCBvYmopID0+IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBhcGkuY29yZS5yZWFkTmFtZXNwYWNlZFBvZChvYmoubWV0YWRhdGEubmFtZSwgbmFtZXNwYWNlKVxuICAgIHJldHVybiBjaGVja1BvZFN0YXR1cyhvYmosIFtyZXMuYm9keV0pXG4gIH0sXG5cbiAgUmVwbGljYVNldDogYXN5bmMgKGFwaSwgbmFtZXNwYWNlLCBvYmopID0+IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBhcGkuY29yZS5saXN0TmFtZXNwYWNlZFBvZChcbiAgICAgIG5hbWVzcGFjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSwgb2JqLnNwZWMuc2VsZWN0b3IubWF0Y2hMYWJlbHMsXG4gICAgKVxuICAgIHJldHVybiBjaGVja1BvZFN0YXR1cyhvYmosIHJlcy5ib2R5Lml0ZW1zKVxuICB9LFxuICBSZXBsaWNhdGlvbkNvbnRyb2xsZXI6IGFzeW5jIChhcGksIG5hbWVzcGFjZSwgb2JqKSA9PiB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgYXBpLmNvcmUubGlzdE5hbWVzcGFjZWRQb2QoXG4gICAgICBuYW1lc3BhY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUsIG9iai5zcGVjLnNlbGVjdG9yLFxuICAgIClcbiAgICByZXR1cm4gY2hlY2tQb2RTdGF0dXMob2JqLCByZXMuYm9keS5pdGVtcylcbiAgfSxcblxuICBTZXJ2aWNlOiBhc3luYyAoYXBpLCBuYW1lc3BhY2UsIG9iaikgPT4ge1xuICAgIGlmIChvYmouc3BlYy50eXBlID09PSBcIkV4dGVybmFsTmFtZVwiKSB7XG4gICAgICByZXR1cm4geyBzdGF0ZTogXCJyZWFkeVwiLCBvYmogfVxuICAgIH1cblxuICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IGFwaS5jb3JlLnJlYWROYW1lc3BhY2VkU2VydmljZShvYmoubWV0YWRhdGEubmFtZSwgbmFtZXNwYWNlKVxuXG4gICAgaWYgKG9iai5zcGVjLmNsdXN0ZXJJUCAhPT0gXCJOb25lXCIgJiYgc3RhdHVzLmJvZHkuc3BlYy5jbHVzdGVySVAgPT09IFwiXCIpIHtcbiAgICAgIHJldHVybiB7IHN0YXRlOiBcImRlcGxveWluZ1wiLCBvYmogfVxuICAgIH1cblxuICAgIGlmIChvYmouc3BlYy50eXBlID09PSBcIkxvYWRCYWxhbmNlclwiICYmICFzdGF0dXMuYm9keS5zdGF0dXMubG9hZEJhbGFuY2VyLmluZ3Jlc3MpIHtcbiAgICAgIHJldHVybiB7IHN0YXRlOiBcImRlcGxveWluZ1wiLCBvYmogfVxuICAgIH1cblxuICAgIHJldHVybiB7IHN0YXRlOiBcInJlYWR5XCIsIG9iaiB9XG4gIH0sXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrUG9kU3RhdHVzKG9iajogS3ViZXJuZXRlc09iamVjdCwgcG9kczogVjFQb2RbXSk6IFByb21pc2U8Um9sbG91dFN0YXR1cz4ge1xuICBmb3IgKGNvbnN0IHBvZCBvZiBwb2RzKSB7XG4gICAgY29uc3QgcmVhZHkgPSBzb21lKHBvZC5zdGF0dXMuY29uZGl0aW9ucy5tYXAoYyA9PiBjLnR5cGUgPT09IFwicmVhZHlcIikpXG4gICAgaWYgKCFyZWFkeSkge1xuICAgICAgcmV0dXJuIHsgc3RhdGU6IFwiZGVwbG95aW5nXCIsIG9iaiB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHsgc3RhdGU6IFwicmVhZHlcIiwgb2JqIH1cbn1cblxuLyoqXG4gKiBDaGVjayB0aGUgcm9sbG91dCBzdGF0dXMgZm9yIHRoZSBnaXZlbiBEZXBsb3ltZW50LCBEYWVtb25TZXQgb3IgU3RhdGVmdWxTZXQuXG4gKlxuICogTk9URTogVGhpcyBtb3N0bHkgcmVwbGljYXRlcyB0aGUgbG9naWMgaW4gYGt1YmVjdGwgcm9sbG91dCBzdGF0dXNgLiBVc2luZyB0aGF0IGRpcmVjdGx5IGhlcmVcbiAqIGRpZG4ndCBwYW4gb3V0LCBzaW5jZSBpdCBkb2Vzbid0IGxvb2sgZm9yIGV2ZW50cyBhbmQganVzdCB0aW1lcyBvdXQgd2hlbiBlcnJvcnMgb2NjdXIgZHVyaW5nIHJvbGxvdXQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjaGVja0RlcGxveW1lbnRTdGF0dXMoXG4gIGFwaTogS3ViZUFwaSwgbmFtZXNwYWNlOiBzdHJpbmcsIG9iajogS3ViZXJuZXRlc09iamVjdCwgcmVzb3VyY2VWZXJzaW9uPzogbnVtYmVyLFxuKTogUHJvbWlzZTxSb2xsb3V0U3RhdHVzPiB7XG4gIC8vXG4gIGNvbnN0IG91dDogUm9sbG91dFN0YXR1cyA9IHtcbiAgICBzdGF0ZTogXCJ1bmhlYWx0aHlcIixcbiAgICBvYmosXG4gICAgcmVzb3VyY2VWZXJzaW9uLFxuICB9XG5cbiAgbGV0IHN0YXR1c1JlczogVjFEZXBsb3ltZW50IHwgVjFEYWVtb25TZXQgfCBWMVN0YXRlZnVsU2V0XG5cbiAgdHJ5IHtcbiAgICBzdGF0dXNSZXMgPSA8VjFEZXBsb3ltZW50IHwgVjFEYWVtb25TZXQgfCBWMVN0YXRlZnVsU2V0Pihhd2FpdCBhcGkucmVhZEJ5U3BlYyhuYW1lc3BhY2UsIG9iaikpLmJvZHlcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKGVyci5jb2RlICYmIGVyci5jb2RlID09PSA0MDQpIHtcbiAgICAgIC8vIHNlcnZpY2UgaXMgbm90IHJ1bm5pbmdcbiAgICAgIHJldHVybiBvdXRcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgaWYgKCFyZXNvdXJjZVZlcnNpb24pIHtcbiAgICByZXNvdXJjZVZlcnNpb24gPSBvdXQucmVzb3VyY2VWZXJzaW9uID0gcGFyc2VJbnQoc3RhdHVzUmVzLm1ldGFkYXRhLnJlc291cmNlVmVyc2lvbiwgMTApXG4gIH1cblxuICAvLyBUT0RPOiB0cnkgdG8gY29tZSB1cCB3aXRoIHNvbWV0aGluZyBtb3JlIGVmZmljaWVudC4gbWF5IG5lZWQgdG8gd2FpdCBmb3IgbmV3ZXIgazhzIHZlcnNpb24uXG4gIC8vIG5vdGU6IHRoZSByZXNvdXJjZVZlcnNpb24gcGFyYW1ldGVyIGRvZXMgbm90IGFwcGVhciB0byB3b3JrLi4uXG4gIGNvbnN0IGV2ZW50c1JlcyA9IGF3YWl0IGFwaS5jb3JlLmxpc3ROYW1lc3BhY2VkRXZlbnQobmFtZXNwYWNlKVxuXG4gIC8vIGNvbnN0IGV2ZW50c1JlcyA9IGF3YWl0IHRoaXMua3ViZUFwaShcbiAgLy8gICBcIkdFVFwiLFxuICAvLyAgIFtcbiAgLy8gICAgIFwiYXBpc1wiLCBhcGlTZWN0aW9uLCBcInYxYmV0YTFcIixcbiAgLy8gICAgIFwid2F0Y2hcIixcbiAgLy8gICAgIFwibmFtZXNwYWNlc1wiLCBuYW1lc3BhY2UsXG4gIC8vICAgICB0eXBlICsgXCJzXCIsIHNlcnZpY2UuZnVsbE5hbWUsXG4gIC8vICAgXSxcbiAgLy8gICB7IHJlc291cmNlVmVyc2lvbiwgd2F0Y2g6IFwiZmFsc2VcIiB9LFxuICAvLyApXG5cbiAgLy8gbG9vayBmb3IgZXJyb3JzIGFuZCB3YXJuaW5ncyBpbiB0aGUgZXZlbnRzIGZvciB0aGUgc2VydmljZSwgYWJvcnQgaWYgd2UgZmluZCBhbnlcbiAgY29uc3QgZXZlbnRzID0gZXZlbnRzUmVzLmJvZHkuaXRlbXNcblxuICBmb3IgKGxldCBldmVudCBvZiBldmVudHMpIHtcbiAgICBjb25zdCBldmVudFZlcnNpb24gPSBwYXJzZUludChldmVudC5tZXRhZGF0YS5yZXNvdXJjZVZlcnNpb24sIDEwKVxuXG4gICAgaWYgKFxuICAgICAgZXZlbnRWZXJzaW9uIDw9IDxudW1iZXI+cmVzb3VyY2VWZXJzaW9uIHx8XG4gICAgICAoXG4gICAgICAgICFldmVudC5tZXRhZGF0YS5uYW1lLnN0YXJ0c1dpdGgob2JqLm1ldGFkYXRhLm5hbWUgKyBcIi5cIilcbiAgICAgICAgJiZcbiAgICAgICAgIWV2ZW50Lm1ldGFkYXRhLm5hbWUuc3RhcnRzV2l0aChvYmoubWV0YWRhdGEubmFtZSArIFwiLVwiKVxuICAgICAgKVxuICAgICkge1xuICAgICAgY29udGludWVcbiAgICB9XG5cbiAgICBpZiAoZXZlbnRWZXJzaW9uID4gPG51bWJlcj5yZXNvdXJjZVZlcnNpb24pIHtcbiAgICAgIG91dC5yZXNvdXJjZVZlcnNpb24gPSBldmVudFZlcnNpb25cbiAgICB9XG5cbiAgICBpZiAoZXZlbnQudHlwZSA9PT0gXCJXYXJuaW5nXCIgfHwgZXZlbnQudHlwZSA9PT0gXCJFcnJvclwiKSB7XG4gICAgICBpZiAoZXZlbnQucmVhc29uID09PSBcIlVuaGVhbHRoeVwiKSB7XG4gICAgICAgIC8vIHN0aWxsIHdhaXRpbmcgb24gcmVhZGluZXNzIHByb2JlXG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG4gICAgICBvdXQuc3RhdGUgPSBcInVuaGVhbHRoeVwiXG4gICAgICBvdXQubGFzdEVycm9yID0gYCR7ZXZlbnQucmVhc29ufSAtICR7ZXZlbnQubWVzc2FnZX1gXG4gICAgICByZXR1cm4gb3V0XG4gICAgfVxuXG4gICAgbGV0IG1lc3NhZ2UgPSBldmVudC5tZXNzYWdlXG5cbiAgICBpZiAoZXZlbnQucmVhc29uID09PSBldmVudC5yZWFzb24udG9VcHBlckNhc2UoKSkge1xuICAgICAgLy8gc29tZSBldmVudHMgbGlrZSBpbmdyZXNzIGV2ZW50cyBhcmUgZm9ybWF0dGVkIHRoaXMgd2F5XG4gICAgICBtZXNzYWdlID0gYCR7ZXZlbnQucmVhc29ufSAke21lc3NhZ2V9YFxuICAgIH1cblxuICAgIGlmIChtZXNzYWdlKSB7XG4gICAgICBvdXQubGFzdE1lc3NhZ2UgPSBtZXNzYWdlXG4gICAgfVxuICB9XG5cbiAgLy8gU2VlIGBodHRwczovL2dpdGh1Yi5jb20va3ViZXJuZXRlcy9rdWJlcm5ldGVzL2Jsb2IvbWFzdGVyL3BrZy9rdWJlY3RsL3JvbGxvdXRfc3RhdHVzLmdvYCBmb3IgYSByZWZlcmVuY2VcbiAgLy8gZm9yIHRoaXMgbG9naWMuXG4gIG91dC5zdGF0ZSA9IFwicmVhZHlcIlxuICBsZXQgc3RhdHVzTXNnID0gXCJcIlxuXG4gIGlmIChzdGF0dXNSZXMubWV0YWRhdGEuZ2VuZXJhdGlvbiA+IHN0YXR1c1Jlcy5zdGF0dXMub2JzZXJ2ZWRHZW5lcmF0aW9uKSB7XG4gICAgc3RhdHVzTXNnID0gYFdhaXRpbmcgZm9yIHNwZWMgdXBkYXRlIHRvIGJlIG9ic2VydmVkLi4uYFxuICAgIG91dC5zdGF0ZSA9IFwiZGVwbG95aW5nXCJcbiAgfSBlbHNlIGlmIChvYmoua2luZCA9PT0gXCJEYWVtb25TZXRcIikge1xuICAgIGNvbnN0IHN0YXR1cyA9IDxWMURhZW1vblNldFN0YXR1cz5zdGF0dXNSZXMuc3RhdHVzXG5cbiAgICBjb25zdCBkZXNpcmVkID0gc3RhdHVzLmRlc2lyZWROdW1iZXJTY2hlZHVsZWQgfHwgMFxuICAgIGNvbnN0IHVwZGF0ZWQgPSBzdGF0dXMudXBkYXRlZE51bWJlclNjaGVkdWxlZCB8fCAwXG4gICAgY29uc3QgYXZhaWxhYmxlID0gc3RhdHVzLm51bWJlckF2YWlsYWJsZSB8fCAwXG5cbiAgICBpZiAodXBkYXRlZCA8IGRlc2lyZWQpIHtcbiAgICAgIHN0YXR1c01zZyA9IGBXYWl0aW5nIGZvciByb2xsb3V0OiAke3VwZGF0ZWR9IG91dCBvZiAke2Rlc2lyZWR9IG5ldyBwb2RzIHVwZGF0ZWQuLi5gXG4gICAgICBvdXQuc3RhdGUgPSBcImRlcGxveWluZ1wiXG4gICAgfSBlbHNlIGlmIChhdmFpbGFibGUgPCBkZXNpcmVkKSB7XG4gICAgICBzdGF0dXNNc2cgPSBgV2FpdGluZyBmb3Igcm9sbG91dDogJHthdmFpbGFibGV9IG91dCBvZiAke2Rlc2lyZWR9IHVwZGF0ZWQgcG9kcyBhdmFpbGFibGUuLi5gXG4gICAgICBvdXQuc3RhdGUgPSBcImRlcGxveWluZ1wiXG4gICAgfVxuICB9IGVsc2UgaWYgKG9iai5raW5kID09PSBcIlN0YXRlZnVsU2V0XCIpIHtcbiAgICBjb25zdCBzdGF0dXMgPSA8VjFTdGF0ZWZ1bFNldFN0YXR1cz5zdGF0dXNSZXMuc3RhdHVzXG4gICAgY29uc3Qgc3RhdHVzU3BlYyA9IDxWMVN0YXRlZnVsU2V0U3BlYz5zdGF0dXNSZXMuc3BlY1xuXG4gICAgY29uc3QgcmVwbGljYXMgPSBzdGF0dXMucmVwbGljYXNcbiAgICBjb25zdCB1cGRhdGVkID0gc3RhdHVzLnVwZGF0ZWRSZXBsaWNhcyB8fCAwXG4gICAgY29uc3QgcmVhZHkgPSBzdGF0dXMucmVhZHlSZXBsaWNhcyB8fCAwXG5cbiAgICBpZiAocmVwbGljYXMgJiYgcmVhZHkgPCByZXBsaWNhcykge1xuICAgICAgc3RhdHVzTXNnID0gYFdhaXRpbmcgZm9yIHJvbGxvdXQ6ICR7cmVhZHl9IG91dCBvZiAke3JlcGxpY2FzfSBuZXcgcG9kcyB1cGRhdGVkLi4uYFxuICAgICAgb3V0LnN0YXRlID0gXCJkZXBsb3lpbmdcIlxuICAgIH0gZWxzZSBpZiAoc3RhdHVzU3BlYy51cGRhdGVTdHJhdGVneS50eXBlID09PSBcIlJvbGxpbmdVcGRhdGVcIiAmJiBzdGF0dXNTcGVjLnVwZGF0ZVN0cmF0ZWd5LnJvbGxpbmdVcGRhdGUpIHtcbiAgICAgIGlmIChyZXBsaWNhcyAmJiBzdGF0dXNTcGVjLnVwZGF0ZVN0cmF0ZWd5LnJvbGxpbmdVcGRhdGUucGFydGl0aW9uKSB7XG4gICAgICAgIGNvbnN0IGRlc2lyZWQgPSByZXBsaWNhcyAtIHN0YXR1c1NwZWMudXBkYXRlU3RyYXRlZ3kucm9sbGluZ1VwZGF0ZS5wYXJ0aXRpb25cbiAgICAgICAgaWYgKHVwZGF0ZWQgPCBkZXNpcmVkKSB7XG4gICAgICAgICAgc3RhdHVzTXNnID1cbiAgICAgICAgICAgIGBXYWl0aW5nIGZvciBwYXJ0aXRpb25lZCByb2xsIG91dCB0byBmaW5pc2g6ICR7dXBkYXRlZH0gb3V0IG9mICR7ZGVzaXJlZH0gbmV3IHBvZHMgaGF2ZSBiZWVuIHVwZGF0ZWQuLi5gXG4gICAgICAgICAgb3V0LnN0YXRlID0gXCJkZXBsb3lpbmdcIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzdGF0dXMudXBkYXRlUmV2aXNpb24gIT09IHN0YXR1cy5jdXJyZW50UmV2aXNpb24pIHtcbiAgICAgIHN0YXR1c01zZyA9IGBXYWl0aW5nIGZvciByb2xsaW5nIHVwZGF0ZSB0byBjb21wbGV0ZS4uLmBcbiAgICAgIG91dC5zdGF0ZSA9IFwiZGVwbG95aW5nXCJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgc3RhdHVzID0gPFYxRGVwbG95bWVudFN0YXR1cz5zdGF0dXNSZXMuc3RhdHVzXG5cbiAgICBjb25zdCBkZXNpcmVkID0gMSAvLyBUT0RPOiBzZXJ2aWNlLmNvdW50W2Vudi5uYW1lXSB8fCAxXG4gICAgY29uc3QgdXBkYXRlZCA9IHN0YXR1cy51cGRhdGVkUmVwbGljYXMgfHwgMFxuICAgIGNvbnN0IHJlcGxpY2FzID0gc3RhdHVzLnJlcGxpY2FzIHx8IDBcbiAgICBjb25zdCBhdmFpbGFibGUgPSBzdGF0dXMuYXZhaWxhYmxlUmVwbGljYXMgfHwgMFxuXG4gICAgaWYgKHVwZGF0ZWQgPCBkZXNpcmVkKSB7XG4gICAgICBzdGF0dXNNc2cgPSBgV2FpdGluZyBmb3Igcm9sbG91dDogJHt1cGRhdGVkfSBvdXQgb2YgJHtkZXNpcmVkfSBuZXcgcmVwbGljYXMgdXBkYXRlZC4uLmBcbiAgICAgIG91dC5zdGF0ZSA9IFwiZGVwbG95aW5nXCJcbiAgICB9IGVsc2UgaWYgKHJlcGxpY2FzID4gdXBkYXRlZCkge1xuICAgICAgc3RhdHVzTXNnID0gYFdhaXRpbmcgZm9yIHJvbGxvdXQ6ICR7cmVwbGljYXMgLSB1cGRhdGVkfSBvbGQgcmVwbGljYXMgcGVuZGluZyB0ZXJtaW5hdGlvbi4uLmBcbiAgICAgIG91dC5zdGF0ZSA9IFwiZGVwbG95aW5nXCJcbiAgICB9IGVsc2UgaWYgKGF2YWlsYWJsZSA8IHVwZGF0ZWQpIHtcbiAgICAgIHN0YXR1c01zZyA9IGBXYWl0aW5nIGZvciByb2xsb3V0OiAke2F2YWlsYWJsZX0gb3V0IG9mICR7dXBkYXRlZH0gdXBkYXRlZCByZXBsaWNhcyBhdmFpbGFibGUuLi5gXG4gICAgICBvdXQuc3RhdGUgPSBcImRlcGxveWluZ1wiXG4gICAgfVxuICB9XG5cbiAgb3V0Lmxhc3RNZXNzYWdlID0gc3RhdHVzTXNnXG5cbiAgcmV0dXJuIG91dFxufVxuXG4vKipcbiAqIENoZWNrIGlmIHRoZSBzcGVjaWZpZWQgS3ViZXJuZXRlcyBvYmplY3RzIGFyZSBkZXBsb3llZCBhbmQgZnVsbHkgcm9sbGVkIG91dFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2hlY2tPYmplY3RTdGF0dXMoXG4gIGFwaTogS3ViZUFwaSwgbmFtZXNwYWNlOiBzdHJpbmcsIG9iamVjdHM6IEt1YmVybmV0ZXNPYmplY3RbXSwgcHJldlN0YXR1c2VzPzogUm9sbG91dFN0YXR1c1tdLFxuKSB7XG4gIGxldCByZWFkeSA9IHRydWVcblxuICBjb25zdCBzdGF0dXNlczogUm9sbG91dFN0YXR1c1tdID0gYXdhaXQgQmx1ZWJpcmQubWFwKG9iamVjdHMsIGFzeW5jIChvYmosIGkpID0+IHtcbiAgICBjb25zdCBoYW5kbGVyID0gb2JqSGFuZGxlcnNbb2JqLmtpbmRdXG4gICAgY29uc3QgcHJldlN0YXR1cyA9IHByZXZTdGF0dXNlcyAmJiBwcmV2U3RhdHVzZXNbaV1cbiAgICBjb25zdCBzdGF0dXM6IFJvbGxvdXRTdGF0dXMgPSBoYW5kbGVyXG4gICAgICA/IGF3YWl0IGhhbmRsZXIoYXBpLCBuYW1lc3BhY2UsIG9iaiwgcHJldlN0YXR1cyAmJiBwcmV2U3RhdHVzLnJlc291cmNlVmVyc2lvbilcbiAgICAgIC8vIGlmIHRoZXJlIGlzIG5vIGV4cGxpY2l0IGhhbmRsZXIgdG8gY2hlY2sgdGhlIHN0YXR1cywgd2UgYXNzdW1lIHRoZXJlJ3Mgbm8gcm9sbG91dCBwaGFzZSB0byB3YWl0IGZvclxuICAgICAgOiB7IHN0YXRlOiBcInJlYWR5XCIsIG9iaiB9XG5cbiAgICBpZiAoc3RhdHVzLnN0YXRlICE9PSBcInJlYWR5XCIpIHtcbiAgICAgIHJlYWR5ID0gZmFsc2VcbiAgICB9XG5cbiAgICByZXR1cm4gc3RhdHVzXG4gIH0pXG5cbiAgcmV0dXJuIHsgcmVhZHksIHN0YXR1c2VzIH1cbn1cblxuaW50ZXJmYWNlIFdhaXRQYXJhbXMge1xuICBjdHg6IFBsdWdpbkNvbnRleHQsXG4gIHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIsXG4gIHNlcnZpY2U6IFNlcnZpY2UsXG4gIG9iamVjdHM6IEt1YmVybmV0ZXNPYmplY3RbXSxcbiAgbG9nRW50cnk/OiBMb2dFbnRyeSxcbn1cblxuLyoqXG4gKiBXYWl0IHVudGlsIHRoZSByb2xsb3V0IGlzIGNvbXBsZXRlIGZvciBlYWNoIG9mIHRoZSBnaXZlbiBLdWJlcm5ldGVzIG9iamVjdHNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JPYmplY3RzKHsgY3R4LCBwcm92aWRlciwgc2VydmljZSwgb2JqZWN0cywgbG9nRW50cnkgfTogV2FpdFBhcmFtcykge1xuICBsZXQgbG9vcHMgPSAwXG4gIGxldCBsYXN0TWVzc2FnZVxuICBjb25zdCBzdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuXG4gIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LnZlcmJvc2Uoe1xuICAgIHN5bWJvbDogXCJpbmZvXCIsXG4gICAgc2VjdGlvbjogc2VydmljZS5uYW1lLFxuICAgIG1zZzogYFdhaXRpbmcgZm9yIHNlcnZpY2UgdG8gYmUgcmVhZHkuLi5gLFxuICB9KVxuXG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKHByb3ZpZGVyKVxuICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBwcm92aWRlcilcbiAgbGV0IHByZXZTdGF0dXNlczogUm9sbG91dFN0YXR1c1tdID0gb2JqZWN0cy5tYXAoKG9iaikgPT4gKHtcbiAgICBzdGF0ZTogPFNlcnZpY2VTdGF0ZT5cInVua25vd25cIixcbiAgICBvYmosXG4gIH0pKVxuXG4gIHdoaWxlICh0cnVlKSB7XG4gICAgYXdhaXQgc2xlZXAoMjAwMCArIDEwMDAgKiBsb29wcylcblxuICAgIGNvbnN0IHsgcmVhZHksIHN0YXR1c2VzIH0gPSBhd2FpdCBjaGVja09iamVjdFN0YXR1cyhhcGksIG5hbWVzcGFjZSwgb2JqZWN0cywgcHJldlN0YXR1c2VzKVxuXG4gICAgZm9yIChjb25zdCBzdGF0dXMgb2Ygc3RhdHVzZXMpIHtcbiAgICAgIGlmIChzdGF0dXMubGFzdEVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBEZXBsb3ltZW50RXJyb3IoYEVycm9yIGRlcGxveWluZyAke3NlcnZpY2UubmFtZX06ICR7c3RhdHVzLmxhc3RFcnJvcn1gLCB7XG4gICAgICAgICAgc2VydmljZU5hbWU6IHNlcnZpY2UubmFtZSxcbiAgICAgICAgICBzdGF0dXMsXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIGlmIChzdGF0dXMubGFzdE1lc3NhZ2UgJiYgKCFsYXN0TWVzc2FnZSB8fCBzdGF0dXMubGFzdE1lc3NhZ2UgIT09IGxhc3RNZXNzYWdlKSkge1xuICAgICAgICBsYXN0TWVzc2FnZSA9IHN0YXR1cy5sYXN0TWVzc2FnZVxuICAgICAgICBsb2dFbnRyeSAmJiBsb2dFbnRyeS52ZXJib3NlKHtcbiAgICAgICAgICBzeW1ib2w6IFwiaW5mb1wiLFxuICAgICAgICAgIHNlY3Rpb246IHNlcnZpY2UubmFtZSxcbiAgICAgICAgICBtc2c6IHN0YXR1cy5sYXN0TWVzc2FnZSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBwcmV2U3RhdHVzZXMgPSBzdGF0dXNlc1xuXG4gICAgaWYgKHJlYWR5KSB7XG4gICAgICBicmVha1xuICAgIH1cblxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpXG5cbiAgICBpZiAobm93IC0gc3RhcnRUaW1lID4gS1VCRUNUTF9ERUZBVUxUX1RJTUVPVVQgKiAxMDAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFRpbWVkIG91dCB3YWl0aW5nIGZvciAke3NlcnZpY2UubmFtZX0gdG8gZGVwbG95YClcbiAgICB9XG4gIH1cblxuICBsb2dFbnRyeSAmJiBsb2dFbnRyeS52ZXJib3NlKHsgc3ltYm9sOiBcImluZm9cIiwgc2VjdGlvbjogc2VydmljZS5uYW1lLCBtc2c6IGBTZXJ2aWNlIGRlcGxveWVkYCB9KVxufVxuXG4vKipcbiAqIENoZWNrIGlmIGVhY2ggb2YgdGhlIGdpdmVuIEt1YmVybmV0ZXMgb2JqZWN0cyBtYXRjaGVzIHdoYXQncyBpbnN0YWxsZWQgaW4gdGhlIGNsdXN0ZXJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbXBhcmVEZXBsb3llZE9iamVjdHMoY3R4OiBQbHVnaW5Db250ZXh0LCBvYmplY3RzOiBLdWJlcm5ldGVzT2JqZWN0W10pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgZXhpc3RpbmdPYmplY3RzID0gYXdhaXQgQmx1ZWJpcmQubWFwKG9iamVjdHMsIG9iaiA9PiBnZXREZXBsb3llZE9iamVjdChjdHgsIGN0eC5wcm92aWRlciwgb2JqKSlcblxuICBmb3IgKGxldCBbb2JqLCBleGlzdGluZ1NwZWNdIG9mIHppcChvYmplY3RzLCBleGlzdGluZ09iamVjdHMpKSB7XG4gICAgaWYgKGV4aXN0aW5nU3BlYyAmJiBvYmopIHtcbiAgICAgIC8vIHRoZSBBUEkgdmVyc2lvbiBtYXkgaW1wbGljaXRseSBjaGFuZ2Ugd2hlbiBkZXBsb3lpbmdcbiAgICAgIGV4aXN0aW5nU3BlYy5hcGlWZXJzaW9uID0gb2JqLmFwaVZlcnNpb25cblxuICAgICAgLy8gdGhlIG5hbWVzcGFjZSBwcm9wZXJ0eSBpcyBzaWxlbnRseSBkcm9wcGVkIHdoZW4gYWRkZWQgdG8gbm9uLW5hbWVzcGFjZWRcbiAgICAgIGlmIChvYmoubWV0YWRhdGEubmFtZXNwYWNlICYmIGV4aXN0aW5nU3BlYy5tZXRhZGF0YS5uYW1lc3BhY2UgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBkZWxldGUgb2JqLm1ldGFkYXRhLm5hbWVzcGFjZVxuICAgICAgfVxuXG4gICAgICBpZiAoIWV4aXN0aW5nU3BlYy5tZXRhZGF0YS5hbm5vdGF0aW9ucykge1xuICAgICAgICBleGlzdGluZ1NwZWMubWV0YWRhdGEuYW5ub3RhdGlvbnMgPSB7fVxuICAgICAgfVxuXG4gICAgICAvLyBoYW5kbGUgYXV0by1maWxsZWQgcHJvcGVydGllcyAodGhpcyBpcyBhIGJpdCBvZiBhIGRlc2lnbiBpc3N1ZSBpbiB0aGUgSzhzIEFQSSlcbiAgICAgIGlmIChvYmoua2luZCA9PT0gXCJTZXJ2aWNlXCIgJiYgb2JqLnNwZWMuY2x1c3RlcklQID09PSBcIlwiKSB7XG4gICAgICAgIGRlbGV0ZSBvYmouc3BlYy5jbHVzdGVySVBcbiAgICAgIH1cblxuICAgICAgLy8gaGFuZGxlIHByb3BlcnRpZXMgdGhhdCBhcmUgb21pdHRlZCBpbiB0aGUgcmVzcG9uc2UgYmVjYXVzZSB0aGV5IGhhdmUgdGhlIGRlZmF1bHQgdmFsdWVcbiAgICAgIC8vIChhbm90aGVyIGRlc2lnbiBpc3N1ZSBpbiB0aGUgSzhzIEFQSSlcbiAgICAgIC8vIE5PVEU6IHRoaXMgYXBwcm9hY2ggd29uJ3QgZmx5IGluIHRoZSBsb25nIHJ1biwgYnV0IGhvcGVmdWxseSB3ZSBjYW4gY2xpbWIgb3V0IG9mIHRoaXMgbWVzcyB3aGVuXG4gICAgICAvLyAgICAgICBga3ViZWN0bCBkaWZmYCBpcyByZWFkeSwgb3Igc2VydmVyLXNpZGUgYXBwbHkvZGlmZiBpcyByZWFkeVxuICAgICAgaWYgKG9iai5raW5kID09PSBcIkRhZW1vblNldFwiKSB7XG4gICAgICAgIGlmIChvYmouc3BlYy5taW5SZWFkeVNlY29uZHMgPT09IDApIHtcbiAgICAgICAgICBkZWxldGUgb2JqLnNwZWMubWluUmVhZHlTZWNvbmRzXG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9iai5zcGVjLnRlbXBsYXRlLnNwZWMuaG9zdE5ldHdvcmsgPT09IGZhbHNlKSB7XG4gICAgICAgICAgZGVsZXRlIG9iai5zcGVjLnRlbXBsYXRlLnNwZWMuaG9zdE5ldHdvcmtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBjbGVhbiBudWxsIHZhbHVlc1xuICAgICAgb2JqID0gPEt1YmVybmV0ZXNPYmplY3Q+cmVtb3ZlTnVsbChvYmopXG4gICAgfVxuXG4gICAgaWYgKCFleGlzdGluZ1NwZWMgfHwgIWlzU3Vic2V0KGV4aXN0aW5nU3BlYywgb2JqKSkge1xuICAgICAgLy8gY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkob2JqLCBudWxsLCA0KSlcbiAgICAgIC8vIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nU3BlYywgbnVsbCwgNCkpXG4gICAgICAvLyBjb25zb2xlLmxvZyhcIi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cIilcbiAgICAgIC8vIHRocm93IG5ldyBFcnJvcihcImJsYVwiKVxuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRydWVcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0RGVwbG95ZWRPYmplY3QoY3R4OiBQbHVnaW5Db250ZXh0LCBwcm92aWRlcjogS3ViZXJuZXRlc1Byb3ZpZGVyLCBvYmo6IEt1YmVybmV0ZXNPYmplY3QpIHtcbiAgY29uc3QgYXBpID0gbmV3IEt1YmVBcGkocHJvdmlkZXIpXG4gIGNvbnN0IG5hbWVzcGFjZSA9IG9iai5tZXRhZGF0YS5uYW1lc3BhY2UgfHwgYXdhaXQgZ2V0QXBwTmFtZXNwYWNlKGN0eCwgcHJvdmlkZXIpXG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXMgPSBhd2FpdCBhcGkucmVhZEJ5U3BlYyhuYW1lc3BhY2UsIG9iailcbiAgICByZXR1cm4gcmVzLmJvZHlcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKGVyci5jb2RlID09PSA0MDQpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IGVyclxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IHJlbW92ZXMgYWxsIG51bGwgdmFsdWUgcHJvcGVydGllcyBmcm9tIG9iamVjdHNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZU51bGw8VD4odmFsdWU6IFQgfCBJdGVyYWJsZTxUPik6IFQgfCBJdGVyYWJsZTxUPiB8IHsgW0sgaW4ga2V5b2YgVF06IFRbS10gfSB7XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZS5tYXAocmVtb3ZlTnVsbClcbiAgfSBlbHNlIGlmIChpc1BsYWluT2JqZWN0KHZhbHVlKSkge1xuICAgIHJldHVybiA8eyBbSyBpbiBrZXlvZiBUXTogVFtLXSB9Pm1hcFZhbHVlcyhwaWNrQnkoPGFueT52YWx1ZSwgdiA9PiB2ICE9PSBudWxsKSwgcmVtb3ZlTnVsbClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gdmFsdWVcbiAgfVxufVxuIl19
