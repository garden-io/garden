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
const Docker = require("dockerode");
const child_process_promise_1 = require("child-process-promise");
const exceptions_1 = require("../../exceptions");
const container_1 = require("../container");
const lodash_1 = require("lodash");
const util_1 = require("../../util/util");
// should this be configurable and/or global across providers?
const DEPLOY_TIMEOUT = 30;
const pluginName = "local-docker-swarm";
exports.gardenPlugin = () => ({
    actions: {
        getEnvironmentStatus,
        prepareEnvironment,
    },
    moduleActions: {
        container: {
            getServiceStatus,
            deployService({ ctx, module, service, runtimeContext, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO: split this method up and test
                    const { versionString } = service.module.version;
                    logEntry && logEntry.info({ section: service.name, msg: `Deploying version ${versionString}` });
                    const identifier = yield container_1.helpers.getLocalImageId(module);
                    const ports = service.spec.ports.map(p => {
                        const port = {
                            Protocol: p.protocol ? p.protocol.toLowerCase() : "tcp",
                            TargetPort: p.containerPort,
                        };
                        if (p.hostPort) {
                            port.PublishedPort = p.hostPort;
                        }
                    });
                    const envVars = lodash_1.map(Object.assign({}, runtimeContext.envVars, service.spec.env), (v, k) => `${k}=${v}`);
                    const volumeMounts = service.spec.volumes.map(v => {
                        // TODO-LOW: Support named volumes
                        if (v.hostPath) {
                            return {
                                Type: "bind",
                                Source: v.hostPath,
                                Target: v.containerPath,
                            };
                        }
                        else {
                            return {
                                Type: "tmpfs",
                                Target: v.containerPath,
                            };
                        }
                    });
                    const opts = {
                        Name: getSwarmServiceName(ctx, service.name),
                        Labels: {
                            environment: ctx.environment.name,
                            provider: pluginName,
                        },
                        TaskTemplate: {
                            ContainerSpec: {
                                Image: identifier,
                                Command: service.spec.command,
                                Env: envVars,
                                Mounts: volumeMounts,
                            },
                            Resources: {
                                Limits: {},
                                Reservations: {},
                            },
                            RestartPolicy: {},
                            Placement: {},
                        },
                        Mode: {
                            Replicated: {
                                Replicas: 1,
                            },
                        },
                        UpdateConfig: {
                            Parallelism: 1,
                        },
                        IngressSpec: {
                            Ports: ports,
                        },
                    };
                    const docker = getDocker();
                    const serviceStatus = yield getServiceStatus({ ctx, service, module, runtimeContext, logEntry });
                    let swarmServiceStatus;
                    let serviceId;
                    if (serviceStatus.providerId) {
                        const swarmService = yield docker.getService(serviceStatus.providerId);
                        swarmServiceStatus = yield swarmService.inspect();
                        opts.version = parseInt(swarmServiceStatus.Version.Index, 10);
                        logEntry && logEntry.verbose({
                            section: service.name,
                            msg: `Updating existing Swarm service (version ${opts.version})`,
                        });
                        yield swarmService.update(opts);
                        serviceId = serviceStatus.providerId;
                    }
                    else {
                        logEntry && logEntry.verbose({
                            section: service.name,
                            msg: `Creating new Swarm service`,
                        });
                        const swarmService = yield docker.createService(opts);
                        serviceId = swarmService.ID;
                    }
                    // Wait for service to be ready
                    const start = new Date().getTime();
                    while (true) {
                        yield util_1.sleep(1000);
                        const { lastState, lastError } = yield getServiceState(serviceId);
                        if (lastError) {
                            throw new exceptions_1.DeploymentError(`Service ${service.name} ${lastState}: ${lastError}`, {
                                service,
                                state: lastState,
                                error: lastError,
                            });
                        }
                        if (mapContainerState(lastState) === "ready") {
                            break;
                        }
                        if (new Date().getTime() - start > DEPLOY_TIMEOUT * 1000) {
                            throw new exceptions_1.DeploymentError(`Timed out deploying ${service.name} (status: ${lastState}`, {
                                service,
                                state: lastState,
                            });
                        }
                    }
                    logEntry && logEntry.info({
                        section: service.name,
                        msg: `Ready`,
                    });
                    return getServiceStatus({ ctx, module, service, runtimeContext, logEntry });
                });
            },
            getServiceOutputs({ ctx, service }) {
                return __awaiter(this, void 0, void 0, function* () {
                    return {
                        host: getSwarmServiceName(ctx, service.name),
                    };
                });
            },
            execInService({ ctx, service, command, runtimeContext, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    const status = yield getServiceStatus({
                        ctx,
                        service,
                        module: service.module,
                        runtimeContext,
                        logEntry,
                    });
                    if (!status.state || status.state !== "ready") {
                        throw new exceptions_1.DeploymentError(`Service ${service.name} is not running`, {
                            name: service.name,
                            state: status.state,
                        });
                    }
                    // This is ugly, but dockerode doesn't have this, or at least it's too cumbersome to implement.
                    const swarmServiceName = getSwarmServiceName(ctx, service.name);
                    const servicePsCommand = [
                        "docker", "service", "ps",
                        "-f", `'name=${swarmServiceName}.1'`,
                        "-f", `'desired-state=running'`,
                        swarmServiceName,
                        "-q",
                    ];
                    let res = yield child_process_promise_1.exec(servicePsCommand.join(" "));
                    const serviceContainerId = `${swarmServiceName}.1.${res.stdout.trim()}`;
                    const execCommand = ["docker", "exec", serviceContainerId, ...command];
                    res = yield child_process_promise_1.exec(execCommand.join(" "));
                    return { code: 0, output: "", stdout: res.stdout, stderr: res.stderr };
                });
            },
        },
    },
});
function getEnvironmentStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const docker = getDocker();
        try {
            yield docker.swarmInspect();
            return {
                ready: true,
            };
        }
        catch (err) {
            if (err.statusCode === 503) {
                // swarm has not been initialized
                return {
                    ready: false,
                    services: [],
                };
            }
            else {
                throw err;
            }
        }
    });
}
function prepareEnvironment() {
    return __awaiter(this, void 0, void 0, function* () {
        yield getDocker().swarmInit({});
        return {};
    });
}
function getServiceStatus({ ctx, service }) {
    return __awaiter(this, void 0, void 0, function* () {
        const docker = getDocker();
        const swarmServiceName = getSwarmServiceName(ctx, service.name);
        const swarmService = docker.getService(swarmServiceName);
        let swarmServiceStatus;
        try {
            swarmServiceStatus = yield swarmService.inspect();
        }
        catch (err) {
            if (err.statusCode === 404) {
                // service does not exist
                return {};
            }
            else {
                throw err;
            }
        }
        const image = swarmServiceStatus.Spec.TaskTemplate.ContainerSpec.Image;
        const version = image.split(":")[1];
        const { lastState, lastError } = yield getServiceState(swarmServiceStatus.ID);
        return {
            providerId: swarmServiceStatus.ID,
            version,
            runningReplicas: swarmServiceStatus.Spec.Mode.Replicated.Replicas,
            state: mapContainerState(lastState),
            lastError: lastError || undefined,
            createdAt: swarmServiceStatus.CreatedAt,
            updatedAt: swarmServiceStatus.UpdatedAt,
        };
    });
}
function getDocker() {
    return new Docker();
}
// see schema in https://docs.docker.com/engine/api/v1.35/#operation/TaskList
const taskStateMap = {
    new: "deploying",
    allocated: "deploying",
    pending: "deploying",
    assigned: "deploying",
    accepted: "deploying",
    preparing: "deploying",
    starting: "deploying",
    running: "ready",
    ready: "ready",
    complete: "stopped",
    shutdown: "stopped",
    failed: "unhealthy",
    rejected: "unhealthy",
};
function mapContainerState(lastState) {
    return lastState ? taskStateMap[lastState] : undefined;
}
function getSwarmServiceName(ctx, serviceName) {
    return `${ctx.projectName}--${serviceName}`;
}
function getServiceTask(serviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        let tasks = yield getDocker().listTasks({
        // Service: this.getSwarmServiceName(service.name),
        });
        // For whatever (presumably totally reasonable) reason, the filter option above does not work.
        tasks = tasks.filter(t => t.ServiceID === serviceId);
        tasks = lodash_1.sortBy(tasks, ["CreatedAt"]).reverse();
        return tasks[0];
    });
}
function getServiceState(serviceId) {
    return __awaiter(this, void 0, void 0, function* () {
        const task = yield getServiceTask(serviceId);
        let lastState;
        let lastError;
        if (task) {
            lastState = task.Status.State;
            lastError = task.Status.Err || null;
        }
        return { lastState, lastError };
    });
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvbG9jYWwvbG9jYWwtZG9ja2VyLXN3YXJtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxvQ0FBbUM7QUFDbkMsaUVBQTRDO0FBQzVDLGlEQUFrRDtBQVdsRCw0Q0FHcUI7QUFDckIsbUNBR2U7QUFDZiwwQ0FBdUM7QUFHdkMsOERBQThEO0FBQzlELE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQTtBQUV6QixNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQTtBQUUxQixRQUFBLFlBQVksR0FBRyxHQUFpQixFQUFFLENBQUMsQ0FBQztJQUMvQyxPQUFPLEVBQUU7UUFDUCxvQkFBb0I7UUFDcEIsa0JBQWtCO0tBQ25CO0lBQ0QsYUFBYSxFQUFFO1FBQ2IsU0FBUyxFQUFFO1lBQ1QsZ0JBQWdCO1lBRVYsYUFBYSxDQUNqQixFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQXdDOztvQkFFeEYsc0NBQXNDO29CQUN0QyxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUE7b0JBRWhELFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLHFCQUFxQixhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUE7b0JBRS9GLE1BQU0sVUFBVSxHQUFHLE1BQU0sbUJBQU8sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUE7b0JBQ3hELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDdkMsTUFBTSxJQUFJLEdBQVE7NEJBQ2hCLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFD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O1FBQ3RDLG1EQUFtRDtTQUNwRCxDQUFDLENBQUE7UUFDRiw4RkFBOEY7UUFDOUYsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxLQUFLLFNBQVMsQ0FBQyxDQUFBO1FBQ3BELEtBQUssR0FBRyxlQUFNLENBQUMsS0FBSyxFQUFFLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUU5QyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNqQixDQUFDO0NBQUE7QUFFRCxTQUFlLGVBQWUsQ0FBQyxTQUFpQjs7UUFDOUMsTUFBTSxJQUFJLEdBQUcsTUFBTSxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUE7UUFFNUMsSUFBSSxTQUFTLENBQUE7UUFDYixJQUFJLFNBQVMsQ0FBQTtRQUViLElBQUksSUFBSSxFQUFFO1lBQ1IsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFBO1lBQzdCLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUE7U0FDcEM7UUFFRCxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFBO0lBQ2pDLENBQUM7Q0FBQSIsImZpbGUiOiJwbHVnaW5zL2xvY2FsL2xvY2FsLWRvY2tlci1zd2FybS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBEb2NrZXIgZnJvbSBcImRvY2tlcm9kZVwiXG5pbXBvcnQgeyBleGVjIH0gZnJvbSBcImNoaWxkLXByb2Nlc3MtcHJvbWlzZVwiXG5pbXBvcnQgeyBEZXBsb3ltZW50RXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBQbHVnaW5Db250ZXh0IH0gZnJvbSBcIi4uLy4uL3BsdWdpbi1jb250ZXh0XCJcbmltcG9ydCB7XG4gIEdhcmRlblBsdWdpbixcbn0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9wbHVnaW5cIlxuaW1wb3J0IHtcbiAgRGVwbG95U2VydmljZVBhcmFtcyxcbiAgRXhlY0luU2VydmljZVBhcmFtcyxcbiAgR2V0U2VydmljZU91dHB1dHNQYXJhbXMsXG4gIEdldFNlcnZpY2VTdGF0dXNQYXJhbXMsXG59IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7XG4gIGhlbHBlcnMsXG4gIENvbnRhaW5lck1vZHVsZSxcbn0gZnJvbSBcIi4uL2NvbnRhaW5lclwiXG5pbXBvcnQge1xuICBtYXAsXG4gIHNvcnRCeSxcbn0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgU2VydmljZVN0YXRlLCBTZXJ2aWNlU3RhdHVzIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuXG4vLyBzaG91bGQgdGhpcyBiZSBjb25maWd1cmFibGUgYW5kL29yIGdsb2JhbCBhY3Jvc3MgcHJvdmlkZXJzP1xuY29uc3QgREVQTE9ZX1RJTUVPVVQgPSAzMFxuXG5jb25zdCBwbHVnaW5OYW1lID0gXCJsb2NhbC1kb2NrZXItc3dhcm1cIlxuXG5leHBvcnQgY29uc3QgZ2FyZGVuUGx1Z2luID0gKCk6IEdhcmRlblBsdWdpbiA9PiAoe1xuICBhY3Rpb25zOiB7XG4gICAgZ2V0RW52aXJvbm1lbnRTdGF0dXMsXG4gICAgcHJlcGFyZUVudmlyb25tZW50LFxuICB9LFxuICBtb2R1bGVBY3Rpb25zOiB7XG4gICAgY29udGFpbmVyOiB7XG4gICAgICBnZXRTZXJ2aWNlU3RhdHVzLFxuXG4gICAgICBhc3luYyBkZXBsb3lTZXJ2aWNlKFxuICAgICAgICB7IGN0eCwgbW9kdWxlLCBzZXJ2aWNlLCBydW50aW1lQ29udGV4dCwgbG9nRW50cnkgfTogRGVwbG95U2VydmljZVBhcmFtczxDb250YWluZXJNb2R1bGU+LFxuICAgICAgKSB7XG4gICAgICAgIC8vIFRPRE86IHNwbGl0IHRoaXMgbWV0aG9kIHVwIGFuZCB0ZXN0XG4gICAgICAgIGNvbnN0IHsgdmVyc2lvblN0cmluZyB9ID0gc2VydmljZS5tb2R1bGUudmVyc2lvblxuXG4gICAgICAgIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LmluZm8oeyBzZWN0aW9uOiBzZXJ2aWNlLm5hbWUsIG1zZzogYERlcGxveWluZyB2ZXJzaW9uICR7dmVyc2lvblN0cmluZ31gIH0pXG5cbiAgICAgICAgY29uc3QgaWRlbnRpZmllciA9IGF3YWl0IGhlbHBlcnMuZ2V0TG9jYWxJbWFnZUlkKG1vZHVsZSlcbiAgICAgICAgY29uc3QgcG9ydHMgPSBzZXJ2aWNlLnNwZWMucG9ydHMubWFwKHAgPT4ge1xuICAgICAgICAgIGNvbnN0IHBvcnQ6IGFueSA9IHtcbiAgICAgICAgICAgIFByb3RvY29sOiBwLnByb3RvY29sID8gcC5wcm90b2NvbC50b0xvd2VyQ2FzZSgpIDogXCJ0Y3BcIixcbiAgICAgICAgICAgIFRhcmdldFBvcnQ6IHAuY29udGFpbmVyUG9ydCxcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocC5ob3N0UG9ydCkge1xuICAgICAgICAgICAgcG9ydC5QdWJsaXNoZWRQb3J0ID0gcC5ob3N0UG9ydFxuICAgICAgICAgIH1cbiAgICAgICAgfSlcblxuICAgICAgICBjb25zdCBlbnZWYXJzID0gbWFwKHsgLi4ucnVudGltZUNvbnRleHQuZW52VmFycywgLi4uc2VydmljZS5zcGVjLmVudiB9LCAodiwgaykgPT4gYCR7a309JHt2fWApXG5cbiAgICAgICAgY29uc3Qgdm9sdW1lTW91bnRzID0gc2VydmljZS5zcGVjLnZvbHVtZXMubWFwKHYgPT4ge1xuICAgICAgICAgIC8vIFRPRE8tTE9XOiBTdXBwb3J0IG5hbWVkIHZvbHVtZXNcbiAgICAgICAgICBpZiAodi5ob3N0UGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgVHlwZTogXCJiaW5kXCIsXG4gICAgICAgICAgICAgIFNvdXJjZTogdi5ob3N0UGF0aCxcbiAgICAgICAgICAgICAgVGFyZ2V0OiB2LmNvbnRhaW5lclBhdGgsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIFR5cGU6IFwidG1wZnNcIixcbiAgICAgICAgICAgICAgVGFyZ2V0OiB2LmNvbnRhaW5lclBhdGgsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICAgIGNvbnN0IG9wdHM6IGFueSA9IHtcbiAgICAgICAgICBOYW1lOiBnZXRTd2FybVNlcnZpY2VOYW1lKGN0eCwgc2VydmljZS5uYW1lKSxcbiAgICAgICAgICBMYWJlbHM6IHtcbiAgICAgICAgICAgIGVudmlyb25tZW50OiBjdHguZW52aXJvbm1lbnQubmFtZSxcbiAgICAgICAgICAgIHByb3ZpZGVyOiBwbHVnaW5OYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgVGFza1RlbXBsYXRlOiB7XG4gICAgICAgICAgICBDb250YWluZXJTcGVjOiB7XG4gICAgICAgICAgICAgIEltYWdlOiBpZGVudGlmaWVyLFxuICAgICAgICAgICAgICBDb21tYW5kOiBzZXJ2aWNlLnNwZWMuY29tbWFuZCxcbiAgICAgICAgICAgICAgRW52OiBlbnZWYXJzLFxuICAgICAgICAgICAgICBNb3VudHM6IHZvbHVtZU1vdW50cyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBSZXNvdXJjZXM6IHtcbiAgICAgICAgICAgICAgTGltaXRzOiB7fSxcbiAgICAgICAgICAgICAgUmVzZXJ2YXRpb25zOiB7fSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBSZXN0YXJ0UG9saWN5OiB7fSxcbiAgICAgICAgICAgIFBsYWNlbWVudDoge30sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBNb2RlOiB7XG4gICAgICAgICAgICBSZXBsaWNhdGVkOiB7XG4gICAgICAgICAgICAgIFJlcGxpY2FzOiAxLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFVwZGF0ZUNvbmZpZzoge1xuICAgICAgICAgICAgUGFyYWxsZWxpc206IDEsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBJbmdyZXNzU3BlYzoge1xuICAgICAgICAgICAgUG9ydHM6IHBvcnRzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkb2NrZXIgPSBnZXREb2NrZXIoKVxuICAgICAgICBjb25zdCBzZXJ2aWNlU3RhdHVzID0gYXdhaXQgZ2V0U2VydmljZVN0YXR1cyh7IGN0eCwgc2VydmljZSwgbW9kdWxlLCBydW50aW1lQ29udGV4dCwgbG9nRW50cnkgfSlcbiAgICAgICAgbGV0IHN3YXJtU2VydmljZVN0YXR1c1xuICAgICAgICBsZXQgc2VydmljZUlkXG5cbiAgICAgICAgaWYgKHNlcnZpY2VTdGF0dXMucHJvdmlkZXJJZCkge1xuICAgICAgICAgIGNvbnN0IHN3YXJtU2VydmljZSA9IGF3YWl0IGRvY2tlci5nZXRTZXJ2aWNlKHNlcnZpY2VTdGF0dXMucHJvdmlkZXJJZClcbiAgICAgICAgICBzd2FybVNlcnZpY2VTdGF0dXMgPSBhd2FpdCBzd2FybVNlcnZpY2UuaW5zcGVjdCgpXG4gICAgICAgICAgb3B0cy52ZXJzaW9uID0gcGFyc2VJbnQoc3dhcm1TZXJ2aWNlU3RhdHVzLlZlcnNpb24uSW5kZXgsIDEwKVxuICAgICAgICAgIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LnZlcmJvc2Uoe1xuICAgICAgICAgICAgc2VjdGlvbjogc2VydmljZS5uYW1lLFxuICAgICAgICAgICAgbXNnOiBgVXBkYXRpbmcgZXhpc3RpbmcgU3dhcm0gc2VydmljZSAodmVyc2lvbiAke29wdHMudmVyc2lvbn0pYCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIGF3YWl0IHN3YXJtU2VydmljZS51cGRhdGUob3B0cylcbiAgICAgICAgICBzZXJ2aWNlSWQgPSBzZXJ2aWNlU3RhdHVzLnByb3ZpZGVySWRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2dFbnRyeSAmJiBsb2dFbnRyeS52ZXJib3NlKHtcbiAgICAgICAgICAgIHNlY3Rpb246IHNlcnZpY2UubmFtZSxcbiAgICAgICAgICAgIG1zZzogYENyZWF0aW5nIG5ldyBTd2FybSBzZXJ2aWNlYCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIGNvbnN0IHN3YXJtU2VydmljZSA9IGF3YWl0IGRvY2tlci5jcmVhdGVTZXJ2aWNlKG9wdHMpXG4gICAgICAgICAgc2VydmljZUlkID0gc3dhcm1TZXJ2aWNlLklEXG4gICAgICAgIH1cblxuICAgICAgICAvLyBXYWl0IGZvciBzZXJ2aWNlIHRvIGJlIHJlYWR5XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gbmV3IERhdGUoKS5nZXRUaW1lKClcblxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgIGF3YWl0IHNsZWVwKDEwMDApXG5cbiAgICAgICAgICBjb25zdCB7IGxhc3RTdGF0ZSwgbGFzdEVycm9yIH0gPSBhd2FpdCBnZXRTZXJ2aWNlU3RhdGUoc2VydmljZUlkKVxuXG4gICAgICAgICAgaWYgKGxhc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IERlcGxveW1lbnRFcnJvcihgU2VydmljZSAke3NlcnZpY2UubmFtZX0gJHtsYXN0U3RhdGV9OiAke2xhc3RFcnJvcn1gLCB7XG4gICAgICAgICAgICAgIHNlcnZpY2UsXG4gICAgICAgICAgICAgIHN0YXRlOiBsYXN0U3RhdGUsXG4gICAgICAgICAgICAgIGVycm9yOiBsYXN0RXJyb3IsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChtYXBDb250YWluZXJTdGF0ZShsYXN0U3RhdGUpID09PSBcInJlYWR5XCIpIHtcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gc3RhcnQgPiBERVBMT1lfVElNRU9VVCAqIDEwMDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBEZXBsb3ltZW50RXJyb3IoYFRpbWVkIG91dCBkZXBsb3lpbmcgJHtzZXJ2aWNlLm5hbWV9IChzdGF0dXM6ICR7bGFzdFN0YXRlfWAsIHtcbiAgICAgICAgICAgICAgc2VydmljZSxcbiAgICAgICAgICAgICAgc3RhdGU6IGxhc3RTdGF0ZSxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkuaW5mbyh7XG4gICAgICAgICAgc2VjdGlvbjogc2VydmljZS5uYW1lLFxuICAgICAgICAgIG1zZzogYFJlYWR5YCxcbiAgICAgICAgfSlcblxuICAgICAgICByZXR1cm4gZ2V0U2VydmljZVN0YXR1cyh7IGN0eCwgbW9kdWxlLCBzZXJ2aWNlLCBydW50aW1lQ29udGV4dCwgbG9nRW50cnkgfSlcbiAgICAgIH0sXG5cbiAgICAgIGFzeW5jIGdldFNlcnZpY2VPdXRwdXRzKHsgY3R4LCBzZXJ2aWNlIH06IEdldFNlcnZpY2VPdXRwdXRzUGFyYW1zPENvbnRhaW5lck1vZHVsZT4pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBob3N0OiBnZXRTd2FybVNlcnZpY2VOYW1lKGN0eCwgc2VydmljZS5uYW1lKSxcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgYXN5bmMgZXhlY0luU2VydmljZShcbiAgICAgICAgeyBjdHgsIHNlcnZpY2UsIGNvbW1hbmQsIHJ1bnRpbWVDb250ZXh0LCBsb2dFbnRyeSB9OiBFeGVjSW5TZXJ2aWNlUGFyYW1zPENvbnRhaW5lck1vZHVsZT4sXG4gICAgICApIHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgZ2V0U2VydmljZVN0YXR1cyh7XG4gICAgICAgICAgY3R4LFxuICAgICAgICAgIHNlcnZpY2UsXG4gICAgICAgICAgbW9kdWxlOiBzZXJ2aWNlLm1vZHVsZSxcbiAgICAgICAgICBydW50aW1lQ29udGV4dCxcbiAgICAgICAgICBsb2dFbnRyeSxcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAoIXN0YXR1cy5zdGF0ZSB8fCBzdGF0dXMuc3RhdGUgIT09IFwicmVhZHlcIikge1xuICAgICAgICAgIHRocm93IG5ldyBEZXBsb3ltZW50RXJyb3IoYFNlcnZpY2UgJHtzZXJ2aWNlLm5hbWV9IGlzIG5vdCBydW5uaW5nYCwge1xuICAgICAgICAgICAgbmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgICAgICAgc3RhdGU6IHN0YXR1cy5zdGF0ZSxcbiAgICAgICAgICB9KVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhpcyBpcyB1Z2x5LCBidXQgZG9ja2Vyb2RlIGRvZXNuJ3QgaGF2ZSB0aGlzLCBvciBhdCBsZWFzdCBpdCdzIHRvbyBjdW1iZXJzb21lIHRvIGltcGxlbWVudC5cbiAgICAgICAgY29uc3Qgc3dhcm1TZXJ2aWNlTmFtZSA9IGdldFN3YXJtU2VydmljZU5hbWUoY3R4LCBzZXJ2aWNlLm5hbWUpXG4gICAgICAgIGNvbnN0IHNlcnZpY2VQc0NvbW1hbmQgPSBbXG4gICAgICAgICAgXCJkb2NrZXJcIiwgXCJzZXJ2aWNlXCIsIFwicHNcIixcbiAgICAgICAgICBcIi1mXCIsIGAnbmFtZT0ke3N3YXJtU2VydmljZU5hbWV9LjEnYCxcbiAgICAgICAgICBcIi1mXCIsIGAnZGVzaXJlZC1zdGF0ZT1ydW5uaW5nJ2AsXG4gICAgICAgICAgc3dhcm1TZXJ2aWNlTmFtZSxcbiAgICAgICAgICBcIi1xXCIsXG4gICAgICAgIF1cbiAgICAgICAgbGV0IHJlcyA9IGF3YWl0IGV4ZWMoc2VydmljZVBzQ29tbWFuZC5qb2luKFwiIFwiKSlcbiAgICAgICAgY29uc3Qgc2VydmljZUNvbnRhaW5lcklkID0gYCR7c3dhcm1TZXJ2aWNlTmFtZX0uMS4ke3Jlcy5zdGRvdXQudHJpbSgpfWBcblxuICAgICAgICBjb25zdCBleGVjQ29tbWFuZCA9IFtcImRvY2tlclwiLCBcImV4ZWNcIiwgc2VydmljZUNvbnRhaW5lcklkLCAuLi5jb21tYW5kXVxuICAgICAgICByZXMgPSBhd2FpdCBleGVjKGV4ZWNDb21tYW5kLmpvaW4oXCIgXCIpKVxuXG4gICAgICAgIHJldHVybiB7IGNvZGU6IDAsIG91dHB1dDogXCJcIiwgc3Rkb3V0OiByZXMuc3Rkb3V0LCBzdGRlcnI6IHJlcy5zdGRlcnIgfVxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSlcblxuYXN5bmMgZnVuY3Rpb24gZ2V0RW52aXJvbm1lbnRTdGF0dXMoKSB7XG4gIGNvbnN0IGRvY2tlciA9IGdldERvY2tlcigpXG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBkb2NrZXIuc3dhcm1JbnNwZWN0KClcblxuICAgIHJldHVybiB7XG4gICAgICByZWFkeTogdHJ1ZSxcbiAgICB9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuc3RhdHVzQ29kZSA9PT0gNTAzKSB7XG4gICAgICAvLyBzd2FybSBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlYWR5OiBmYWxzZSxcbiAgICAgICAgc2VydmljZXM6IFtdLFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJlcGFyZUVudmlyb25tZW50KCkge1xuICBhd2FpdCBnZXREb2NrZXIoKS5zd2FybUluaXQoe30pXG4gIHJldHVybiB7fVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZXJ2aWNlU3RhdHVzKHsgY3R4LCBzZXJ2aWNlIH06IEdldFNlcnZpY2VTdGF0dXNQYXJhbXM8Q29udGFpbmVyTW9kdWxlPik6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICBjb25zdCBkb2NrZXIgPSBnZXREb2NrZXIoKVxuICBjb25zdCBzd2FybVNlcnZpY2VOYW1lID0gZ2V0U3dhcm1TZXJ2aWNlTmFtZShjdHgsIHNlcnZpY2UubmFtZSlcbiAgY29uc3Qgc3dhcm1TZXJ2aWNlID0gZG9ja2VyLmdldFNlcnZpY2Uoc3dhcm1TZXJ2aWNlTmFtZSlcblxuICBsZXQgc3dhcm1TZXJ2aWNlU3RhdHVzXG5cbiAgdHJ5IHtcbiAgICBzd2FybVNlcnZpY2VTdGF0dXMgPSBhd2FpdCBzd2FybVNlcnZpY2UuaW5zcGVjdCgpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG4gICAgICAvLyBzZXJ2aWNlIGRvZXMgbm90IGV4aXN0XG4gICAgICByZXR1cm4ge31cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgY29uc3QgaW1hZ2UgPSBzd2FybVNlcnZpY2VTdGF0dXMuU3BlYy5UYXNrVGVtcGxhdGUuQ29udGFpbmVyU3BlYy5JbWFnZVxuICBjb25zdCB2ZXJzaW9uID0gaW1hZ2Uuc3BsaXQoXCI6XCIpWzFdXG5cbiAgY29uc3QgeyBsYXN0U3RhdGUsIGxhc3RFcnJvciB9ID0gYXdhaXQgZ2V0U2VydmljZVN0YXRlKHN3YXJtU2VydmljZVN0YXR1cy5JRClcblxuICByZXR1cm4ge1xuICAgIHByb3ZpZGVySWQ6IHN3YXJtU2VydmljZVN0YXR1cy5JRCxcbiAgICB2ZXJzaW9uLFxuICAgIHJ1bm5pbmdSZXBsaWNhczogc3dhcm1TZXJ2aWNlU3RhdHVzLlNwZWMuTW9kZS5SZXBsaWNhdGVkLlJlcGxpY2FzLFxuICAgIHN0YXRlOiBtYXBDb250YWluZXJTdGF0ZShsYXN0U3RhdGUpLFxuICAgIGxhc3RFcnJvcjogbGFzdEVycm9yIHx8IHVuZGVmaW5lZCxcbiAgICBjcmVhdGVkQXQ6IHN3YXJtU2VydmljZVN0YXR1cy5DcmVhdGVkQXQsXG4gICAgdXBkYXRlZEF0OiBzd2FybVNlcnZpY2VTdGF0dXMuVXBkYXRlZEF0LFxuICB9XG59XG5cbmZ1bmN0aW9uIGdldERvY2tlcigpIHtcbiAgcmV0dXJuIG5ldyBEb2NrZXIoKVxufVxuXG4vLyBzZWUgc2NoZW1hIGluIGh0dHBzOi8vZG9jcy5kb2NrZXIuY29tL2VuZ2luZS9hcGkvdjEuMzUvI29wZXJhdGlvbi9UYXNrTGlzdFxuY29uc3QgdGFza1N0YXRlTWFwOiB7IFtrZXk6IHN0cmluZ106IFNlcnZpY2VTdGF0ZSB9ID0ge1xuICBuZXc6IFwiZGVwbG95aW5nXCIsXG4gIGFsbG9jYXRlZDogXCJkZXBsb3lpbmdcIixcbiAgcGVuZGluZzogXCJkZXBsb3lpbmdcIixcbiAgYXNzaWduZWQ6IFwiZGVwbG95aW5nXCIsXG4gIGFjY2VwdGVkOiBcImRlcGxveWluZ1wiLFxuICBwcmVwYXJpbmc6IFwiZGVwbG95aW5nXCIsXG4gIHN0YXJ0aW5nOiBcImRlcGxveWluZ1wiLFxuICBydW5uaW5nOiBcInJlYWR5XCIsXG4gIHJlYWR5OiBcInJlYWR5XCIsXG4gIGNvbXBsZXRlOiBcInN0b3BwZWRcIixcbiAgc2h1dGRvd246IFwic3RvcHBlZFwiLFxuICBmYWlsZWQ6IFwidW5oZWFsdGh5XCIsXG4gIHJlamVjdGVkOiBcInVuaGVhbHRoeVwiLFxufVxuXG5mdW5jdGlvbiBtYXBDb250YWluZXJTdGF0ZShsYXN0U3RhdGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFNlcnZpY2VTdGF0ZSB8IHVuZGVmaW5lZCB7XG4gIHJldHVybiBsYXN0U3RhdGUgPyB0YXNrU3RhdGVNYXBbbGFzdFN0YXRlXSA6IHVuZGVmaW5lZFxufVxuXG5mdW5jdGlvbiBnZXRTd2FybVNlcnZpY2VOYW1lKGN0eDogUGx1Z2luQ29udGV4dCwgc2VydmljZU5hbWU6IHN0cmluZykge1xuICByZXR1cm4gYCR7Y3R4LnByb2plY3ROYW1lfS0tJHtzZXJ2aWNlTmFtZX1gXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFNlcnZpY2VUYXNrKHNlcnZpY2VJZDogc3RyaW5nKSB7XG4gIGxldCB0YXNrcyA9IGF3YWl0IGdldERvY2tlcigpLmxpc3RUYXNrcyh7XG4gICAgLy8gU2VydmljZTogdGhpcy5nZXRTd2FybVNlcnZpY2VOYW1lKHNlcnZpY2UubmFtZSksXG4gIH0pXG4gIC8vIEZvciB3aGF0ZXZlciAocHJlc3VtYWJseSB0b3RhbGx5IHJlYXNvbmFibGUpIHJlYXNvbiwgdGhlIGZpbHRlciBvcHRpb24gYWJvdmUgZG9lcyBub3Qgd29yay5cbiAgdGFza3MgPSB0YXNrcy5maWx0ZXIodCA9PiB0LlNlcnZpY2VJRCA9PT0gc2VydmljZUlkKVxuICB0YXNrcyA9IHNvcnRCeSh0YXNrcywgW1wiQ3JlYXRlZEF0XCJdKS5yZXZlcnNlKClcblxuICByZXR1cm4gdGFza3NbMF1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2VydmljZVN0YXRlKHNlcnZpY2VJZDogc3RyaW5nKSB7XG4gIGNvbnN0IHRhc2sgPSBhd2FpdCBnZXRTZXJ2aWNlVGFzayhzZXJ2aWNlSWQpXG5cbiAgbGV0IGxhc3RTdGF0ZVxuICBsZXQgbGFzdEVycm9yXG5cbiAgaWYgKHRhc2spIHtcbiAgICBsYXN0U3RhdGUgPSB0YXNrLlN0YXR1cy5TdGF0ZVxuICAgIGxhc3RFcnJvciA9IHRhc2suU3RhdHVzLkVyciB8fCBudWxsXG4gIH1cblxuICByZXR1cm4geyBsYXN0U3RhdGUsIGxhc3RFcnJvciB9XG59XG4iXX0=
