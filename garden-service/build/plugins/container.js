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
const childProcess = require("child-process-promise");
const common_1 = require("../config/common");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const dedent = require("dedent");
const exceptions_1 = require("../exceptions");
const service_1 = require("../types/service");
const constants_1 = require("../constants");
const util_1 = require("../util/util");
const lodash_1 = require("lodash");
const generic_1 = require("./generic");
const service_2 = require("../config/service");
const ingressSchema = Joi.object()
    .keys({
    hostname: service_1.ingressHostnameSchema,
    path: Joi.string().uri({ relativeOnly: true })
        .default("/")
        .description("The path which should be routed to the service."),
    port: Joi.string()
        .required()
        .description("The name of the container port where the specified paths should be routed."),
});
const healthCheckSchema = Joi.object()
    .keys({
    httpGet: Joi.object()
        .keys({
        path: Joi.string()
            .uri({ relativeOnly: true })
            .required()
            .description("The path of the service's health check endpoint."),
        port: Joi.string()
            .required()
            .description("The name of the port where the service's health check endpoint should be available."),
        scheme: Joi.string().allow("HTTP", "HTTPS").default("HTTP"),
    })
        .description("Set this to check the service's health by making an HTTP request"),
    command: Joi.array().items(Joi.string())
        .description("Set this to check the service's health by running a command in its container."),
    tcpPort: Joi.string()
        .description("Set this to check the service's health by checking if this TCP port is accepting connections."),
}).xor("httpGet", "command", "tcpPort");
const portSchema = Joi.object()
    .keys({
    name: common_1.joiIdentifier()
        .required()
        .description("The name of the port (used when referencing the port elsewhere in the service configuration."),
    protocol: Joi.string()
        .allow("TCP", "UDP")
        .default(constants_1.DEFAULT_PORT_PROTOCOL)
        .description("The protocol of the service container port."),
    containerPort: Joi.number()
        .required()
        .description("The port number on the service container."),
    hostPort: Joi.number()
        .meta({ deprecated: true }),
    nodePort: Joi.number()
        .description("Set this to expose the service on the specified port on the host node " +
        "(may not be supported by all providers)."),
})
    .required();
const volumeSchema = Joi.object()
    .keys({
    name: common_1.joiIdentifier()
        .required()
        .description("The name of the allocated volume."),
    containerPath: Joi.string()
        .required()
        .description("The path where the volume should be mounted in the container."),
    hostPath: Joi.string()
        .meta({ deprecated: true }),
});
const serviceSchema = service_2.baseServiceSchema
    .keys({
    command: Joi.array().items(Joi.string())
        .description("The arguments to run the container with when starting the service."),
    daemon: Joi.boolean()
        .default(false)
        .description("Whether to run the service as a daemon (to ensure only one runs per node)."),
    ingresses: common_1.joiArray(ingressSchema)
        .description("List of ingress endpoints that the service exposes.")
        .example([{
            path: "/api",
            port: "http",
        }]),
    env: common_1.joiEnvVars(),
    healthCheck: healthCheckSchema
        .description("Specify how the service's health should be checked after deploying."),
    ports: common_1.joiArray(portSchema)
        .unique("name")
        .description("List of ports that the service container exposes."),
    volumes: common_1.joiArray(volumeSchema)
        .unique("name")
        .description("List of volumes that should be mounted when deploying the container."),
});
exports.containerRegistryConfigSchema = Joi.object()
    .keys({
    hostname: Joi.string()
        .hostname()
        .required()
        .description("The hostname (and optionally port, if not the default port) of the registry.")
        .example("gcr.io"),
    port: Joi.number()
        .integer()
        .description("The port where the registry listens on, if not the default."),
    namespace: Joi.string()
        .default("_")
        .description("The namespace in the registry where images should be pushed.")
        .example("my-project"),
})
    .required()
    .description(dedent `
    The registry where built containers should be pushed to, and then pulled to the cluster when deploying
    services.
  `);
exports.containerTestSchema = generic_1.genericTestSchema;
exports.defaultNamespace = "_";
exports.defaultTag = "latest";
exports.containerModuleSpecSchema = Joi.object()
    .keys({
    buildArgs: Joi.object()
        .pattern(/.+/, common_1.joiPrimitive())
        .default(() => ({}), "{}")
        .description("Specify build arguments when building the container image."),
    // TODO: validate the image name format
    image: Joi.string()
        .description("Specify the image name for the container. Should be a valid docker image identifier. If specified and " +
        "the module does not contain a Dockerfile, this image will be used to deploy the container services. " +
        "If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image."),
    services: common_1.joiArray(serviceSchema)
        .unique("name")
        .description("List of services to deploy from this container module."),
    tests: common_1.joiArray(exports.containerTestSchema)
        .description("A list of tests to run in the module."),
})
    .description("Configuration for a container module.");
exports.helpers = {
    /**
     * Returns the image ID used locally, when building and deploying to local environments
     * (when we don't need to push to remote registries).
     */
    getLocalImageId(module) {
        return __awaiter(this, void 0, void 0, function* () {
            if (yield exports.helpers.hasDockerfile(module)) {
                const { versionString } = module.version;
                return `${module.name}:${versionString}`;
            }
            else {
                return module.spec.image;
            }
        });
    },
    /**
     * Returns the image ID to be used for publishing to container registries
     * (not to be confused with the ID used when pushing to private deployment registries).
     */
    getPublicImageId(module) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: allow setting a default user/org prefix in the project/plugin config
            const image = module.spec.image;
            if (image) {
                let [imageName, version] = util_1.splitFirst(image, ":");
                if (version) {
                    // we use the version in the image name, if specified
                    // (allows specifying version on source images, and also setting specific version name when publishing images)
                    return image;
                }
                else {
                    const { versionString } = module.version;
                    return `${imageName}:${versionString}`;
                }
            }
            else {
                return exports.helpers.getLocalImageId(module);
            }
        });
    },
    /**
     * Returns the image ID to be used when pushing to deployment registries.
     */
    getDeploymentImageId(module, registryConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const localId = yield exports.helpers.getLocalImageId(module);
            if (!registryConfig) {
                return localId;
            }
            const parsedId = exports.helpers.parseImageId(localId);
            const host = registryConfig.port ? `${registryConfig.hostname}:${registryConfig.port}` : registryConfig.hostname;
            return exports.helpers.unparseImageId({
                host,
                namespace: registryConfig.namespace,
                repository: parsedId.repository,
                tag: parsedId.tag,
            });
        });
    },
    parseImageId(imageId) {
        const parts = imageId.split("/");
        let [repository, tag] = parts[0].split(":");
        if (!tag) {
            tag = exports.defaultTag;
        }
        if (parts.length === 1) {
            return {
                namespace: exports.defaultNamespace,
                repository,
                tag,
            };
        }
        else if (parts.length === 2) {
            return {
                namespace: parts[0],
                repository,
                tag,
            };
        }
        else if (parts.length === 3) {
            return {
                host: parts[0],
                namespace: parts[1],
                repository,
                tag,
            };
        }
        else {
            throw new exceptions_1.ConfigurationError(`Invalid container image tag: ${imageId}`, { imageId });
        }
    },
    unparseImageId(parsed) {
        const name = `${parsed.repository}:${parsed.tag}`;
        if (parsed.host) {
            return `${parsed.host}/${parsed.namespace}/${name}`;
        }
        else if (parsed.namespace) {
            return `${parsed.namespace}/${name}`;
        }
        else {
            return name;
        }
    },
    pullImage(module) {
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = yield exports.helpers.getPublicImageId(module);
            yield exports.helpers.dockerCli(module, `pull ${identifier}`);
        });
    },
    imageExistsLocally(module) {
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = yield exports.helpers.getLocalImageId(module);
            const exists = (yield exports.helpers.dockerCli(module, `images ${identifier} -q`)).stdout.trim().length > 0;
            return exists ? identifier : null;
        });
    },
    dockerCli(module, args) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: use dockerode instead of CLI
            return childProcess.exec("docker " + args, { cwd: module.buildPath, maxBuffer: 1024 * 1024 });
        });
    },
    hasDockerfile(module) {
        return __awaiter(this, void 0, void 0, function* () {
            const buildPath = module.buildPath;
            return fs_extra_1.pathExists(path_1.join(buildPath, "Dockerfile"));
        });
    },
};
function validateContainerModule({ moduleConfig }) {
    return __awaiter(this, void 0, void 0, function* () {
        moduleConfig.spec = common_1.validate(moduleConfig.spec, exports.containerModuleSpecSchema, { context: `module ${moduleConfig.name}` });
        // validate services
        moduleConfig.serviceConfigs = moduleConfig.spec.services.map(spec => {
            // make sure ports are correctly configured
            const name = spec.name;
            const definedPorts = spec.ports;
            const portsByName = lodash_1.keyBy(spec.ports, "name");
            for (const ingress of spec.ingresses) {
                const ingressPort = ingress.port;
                if (!portsByName[ingressPort]) {
                    throw new exceptions_1.ConfigurationError(`Service ${name} does not define port ${ingressPort} defined in ingress`, { definedPorts, ingressPort });
                }
            }
            if (spec.healthCheck && spec.healthCheck.httpGet) {
                const healthCheckHttpPort = spec.healthCheck.httpGet.port;
                if (!portsByName[healthCheckHttpPort]) {
                    throw new exceptions_1.ConfigurationError(`Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`, { definedPorts, healthCheckHttpPort });
                }
            }
            if (spec.healthCheck && spec.healthCheck.tcpPort) {
                const healthCheckTcpPort = spec.healthCheck.tcpPort;
                if (!portsByName[healthCheckTcpPort]) {
                    throw new exceptions_1.ConfigurationError(`Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`, { definedPorts, healthCheckTcpPort });
                }
            }
            return {
                name,
                dependencies: spec.dependencies,
                outputs: spec.outputs,
                spec,
            };
        });
        moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
            name: t.name,
            dependencies: t.dependencies,
            spec: t,
            timeout: t.timeout,
        }));
        // make sure we can build the thing
        if (!moduleConfig.spec.image && !(yield fs_extra_1.pathExists(path_1.join(moduleConfig.path, "Dockerfile")))) {
            throw new exceptions_1.ConfigurationError(`Module ${moduleConfig.name} neither specifies image nor provides Dockerfile`, {});
        }
        return moduleConfig;
    });
}
exports.validateContainerModule = validateContainerModule;
// TODO: rename this plugin to docker
exports.gardenPlugin = () => ({
    moduleActions: {
        container: {
            validate: validateContainerModule,
            getBuildStatus({ module, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    const identifier = yield exports.helpers.imageExistsLocally(module);
                    if (identifier) {
                        logEntry && logEntry.debug({
                            section: module.name,
                            msg: `Image ${identifier} already exists`,
                            symbol: "info",
                        });
                    }
                    return { ready: !!identifier };
                });
            },
            build({ module, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    const buildPath = module.buildPath;
                    const image = module.spec.image;
                    if (!!image && !(yield exports.helpers.hasDockerfile(module))) {
                        if (yield exports.helpers.imageExistsLocally(module)) {
                            return { fresh: false };
                        }
                        logEntry && logEntry.setState(`Pulling image ${image}...`);
                        yield exports.helpers.pullImage(module);
                        return { fetched: true };
                    }
                    const identifier = yield exports.helpers.getLocalImageId(module);
                    // build doesn't exist, so we create it
                    logEntry && logEntry.setState(`Building ${identifier}...`);
                    const buildArgs = Object.entries(module.spec.buildArgs).map(([key, value]) => {
                        // TODO: may need to escape this
                        return `--build-arg ${key}=${value}`;
                    }).join(" ");
                    // TODO: log error if it occurs
                    // TODO: stream output to log if at debug log level
                    yield exports.helpers.dockerCli(module, `build ${buildArgs} -t ${identifier} ${buildPath}`);
                    return { fresh: true, details: { identifier } };
                });
            },
            publishModule({ module, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!(yield exports.helpers.hasDockerfile(module))) {
                        logEntry && logEntry.setState({ msg: `Nothing to publish` });
                        return { published: false };
                    }
                    const localId = yield exports.helpers.getLocalImageId(module);
                    const remoteId = yield exports.helpers.getPublicImageId(module);
                    logEntry && logEntry.setState({ msg: `Publishing image ${remoteId}...` });
                    if (localId !== remoteId) {
                        yield exports.helpers.dockerCli(module, `tag ${localId} ${remoteId}`);
                    }
                    // TODO: log error if it occurs
                    // TODO: stream output to log if at debug log level
                    // TODO: check if module already exists remotely?
                    yield exports.helpers.dockerCli(module, `push ${remoteId}`);
                    return { published: true, message: `Published ${remoteId}` };
                });
            },
        },
    },
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,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K0I7b0JBQy9CLG1EQUFtRDtvQkFDbkQsaURBQWlEO29CQUNqRCxNQUFNLGVBQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLFFBQVEsUUFBUSxFQUFFLENBQUMsQ0FBQTtvQkFFbkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLGFBQWEsUUFBUSxFQUFFLEVBQUUsQ0FBQTtnQkFDOUQsQ0FBQzthQUFBO1NBQ0Y7S0FDRjtDQUNGLENBQUMsQ0FBQSIsImZpbGUiOiJwbHVnaW5zL2NvbnRhaW5lci5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBKb2kgZnJvbSBcImpvaVwiXG5pbXBvcnQgKiBhcyBjaGlsZFByb2Nlc3MgZnJvbSBcImNoaWxkLXByb2Nlc3MtcHJvbWlzZVwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7XG4gIGpvaUVudlZhcnMsXG4gIGpvaUlkZW50aWZpZXIsXG4gIGpvaUFycmF5LFxuICB2YWxpZGF0ZSxcbiAgUHJpbWl0aXZlTWFwLFxuICBqb2lQcmltaXRpdmUsXG59IGZyb20gXCIuLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7IHBhdGhFeGlzdHMgfSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgeyBDb25maWd1cmF0aW9uRXJyb3IgfSBmcm9tIFwiLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQge1xuICBHYXJkZW5QbHVnaW4sXG59IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vcGx1Z2luXCJcbmltcG9ydCB7XG4gIEJ1aWxkTW9kdWxlUGFyYW1zLFxuICBHZXRCdWlsZFN0YXR1c1BhcmFtcyxcbiAgVmFsaWRhdGVNb2R1bGVQYXJhbXMsXG4gIFB1Ymxpc2hNb2R1bGVQYXJhbXMsXG59IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IFNlcnZpY2UsIGluZ3Jlc3NIb3N0bmFtZVNjaGVtYSB9IGZyb20gXCIuLi90eXBlcy9zZXJ2aWNlXCJcbmltcG9ydCB7IERFRkFVTFRfUE9SVF9QUk9UT0NPTCB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxuaW1wb3J0IHsgc3BsaXRGaXJzdCB9IGZyb20gXCIuLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsga2V5QnkgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7IGdlbmVyaWNUZXN0U2NoZW1hLCBHZW5lcmljVGVzdFNwZWMgfSBmcm9tIFwiLi9nZW5lcmljXCJcbmltcG9ydCB7IE1vZHVsZVNwZWMsIE1vZHVsZUNvbmZpZyB9IGZyb20gXCIuLi9jb25maWcvbW9kdWxlXCJcbmltcG9ydCB7IEJhc2VTZXJ2aWNlU3BlYywgU2VydmljZUNvbmZpZywgYmFzZVNlcnZpY2VTY2hlbWEgfSBmcm9tIFwiLi4vY29uZmlnL3NlcnZpY2VcIlxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRhaW5lckluZ3Jlc3NTcGVjIHtcbiAgaG9zdG5hbWU/OiBzdHJpbmdcbiAgcGF0aDogc3RyaW5nXG4gIHBvcnQ6IHN0cmluZ1xufVxuXG5leHBvcnQgdHlwZSBTZXJ2aWNlUG9ydFByb3RvY29sID0gXCJUQ1BcIiB8IFwiVURQXCJcblxuZXhwb3J0IGludGVyZmFjZSBTZXJ2aWNlUG9ydFNwZWMge1xuICBuYW1lOiBzdHJpbmdcbiAgcHJvdG9jb2w6IFNlcnZpY2VQb3J0UHJvdG9jb2xcbiAgY29udGFpbmVyUG9ydDogbnVtYmVyXG4gIGhvc3RQb3J0PzogbnVtYmVyXG4gIG5vZGVQb3J0PzogbnVtYmVyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmljZVZvbHVtZVNwZWMge1xuICBuYW1lOiBzdHJpbmdcbiAgY29udGFpbmVyUGF0aDogc3RyaW5nXG4gIGhvc3RQYXRoPzogc3RyaW5nXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmljZUhlYWx0aENoZWNrU3BlYyB7XG4gIGh0dHBHZXQ/OiB7XG4gICAgcGF0aDogc3RyaW5nLFxuICAgIHBvcnQ6IHN0cmluZyxcbiAgICBzY2hlbWU/OiBcIkhUVFBcIiB8IFwiSFRUUFNcIixcbiAgfSxcbiAgY29tbWFuZD86IHN0cmluZ1tdLFxuICB0Y3BQb3J0Pzogc3RyaW5nLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRhaW5lclNlcnZpY2VTcGVjIGV4dGVuZHMgQmFzZVNlcnZpY2VTcGVjIHtcbiAgY29tbWFuZDogc3RyaW5nW10sXG4gIGRhZW1vbjogYm9vbGVhblxuICBpbmdyZXNzZXM6IENvbnRhaW5lckluZ3Jlc3NTcGVjW10sXG4gIGVudjogUHJpbWl0aXZlTWFwLFxuICBoZWFsdGhDaGVjaz86IFNlcnZpY2VIZWFsdGhDaGVja1NwZWMsXG4gIHBvcnRzOiBTZXJ2aWNlUG9ydFNwZWNbXSxcbiAgdm9sdW1lczogU2VydmljZVZvbHVtZVNwZWNbXSxcbn1cblxuZXhwb3J0IHR5cGUgQ29udGFpbmVyU2VydmljZUNvbmZpZyA9IFNlcnZpY2VDb25maWc8Q29udGFpbmVyU2VydmljZVNwZWM+XG5cbmNvbnN0IGluZ3Jlc3NTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIGhvc3RuYW1lOiBpbmdyZXNzSG9zdG5hbWVTY2hlbWEsXG4gICAgcGF0aDogSm9pLnN0cmluZygpLnVyaSg8YW55PnsgcmVsYXRpdmVPbmx5OiB0cnVlIH0pXG4gICAgICAuZGVmYXVsdChcIi9cIilcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBwYXRoIHdoaWNoIHNob3VsZCBiZSByb3V0ZWQgdG8gdGhlIHNlcnZpY2UuXCIpLFxuICAgIHBvcnQ6IEpvaS5zdHJpbmcoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBuYW1lIG9mIHRoZSBjb250YWluZXIgcG9ydCB3aGVyZSB0aGUgc3BlY2lmaWVkIHBhdGhzIHNob3VsZCBiZSByb3V0ZWQuXCIpLFxuICB9KVxuXG5jb25zdCBoZWFsdGhDaGVja1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgaHR0cEdldDogSm9pLm9iamVjdCgpXG4gICAgICAua2V5cyh7XG4gICAgICAgIHBhdGg6IEpvaS5zdHJpbmcoKVxuICAgICAgICAgIC51cmkoPGFueT57IHJlbGF0aXZlT25seTogdHJ1ZSB9KVxuICAgICAgICAgIC5yZXF1aXJlZCgpXG4gICAgICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIHBhdGggb2YgdGhlIHNlcnZpY2UncyBoZWFsdGggY2hlY2sgZW5kcG9pbnQuXCIpLFxuICAgICAgICBwb3J0OiBKb2kuc3RyaW5nKClcbiAgICAgICAgICAucmVxdWlyZWQoKVxuICAgICAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBuYW1lIG9mIHRoZSBwb3J0IHdoZXJlIHRoZSBzZXJ2aWNlJ3MgaGVhbHRoIGNoZWNrIGVuZHBvaW50IHNob3VsZCBiZSBhdmFpbGFibGUuXCIpLFxuICAgICAgICBzY2hlbWU6IEpvaS5zdHJpbmcoKS5hbGxvdyhcIkhUVFBcIiwgXCJIVFRQU1wiKS5kZWZhdWx0KFwiSFRUUFwiKSxcbiAgICAgIH0pXG4gICAgICAuZGVzY3JpcHRpb24oXCJTZXQgdGhpcyB0byBjaGVjayB0aGUgc2VydmljZSdzIGhlYWx0aCBieSBtYWtpbmcgYW4gSFRUUCByZXF1ZXN0XCIpLFxuICAgIGNvbW1hbmQ6IEpvaS5hcnJheSgpLml0ZW1zKEpvaS5zdHJpbmcoKSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIlNldCB0aGlzIHRvIGNoZWNrIHRoZSBzZXJ2aWNlJ3MgaGVhbHRoIGJ5IHJ1bm5pbmcgYSBjb21tYW5kIGluIGl0cyBjb250YWluZXIuXCIpLFxuICAgIHRjcFBvcnQ6IEpvaS5zdHJpbmcoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiU2V0IHRoaXMgdG8gY2hlY2sgdGhlIHNlcnZpY2UncyBoZWFsdGggYnkgY2hlY2tpbmcgaWYgdGhpcyBUQ1AgcG9ydCBpcyBhY2NlcHRpbmcgY29ubmVjdGlvbnMuXCIpLFxuICB9KS54b3IoXCJodHRwR2V0XCIsIFwiY29tbWFuZFwiLCBcInRjcFBvcnRcIilcblxuY29uc3QgcG9ydFNjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgbmFtZTogam9pSWRlbnRpZmllcigpXG4gICAgICAucmVxdWlyZWQoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIG5hbWUgb2YgdGhlIHBvcnQgKHVzZWQgd2hlbiByZWZlcmVuY2luZyB0aGUgcG9ydCBlbHNld2hlcmUgaW4gdGhlIHNlcnZpY2UgY29uZmlndXJhdGlvbi5cIiksXG4gICAgcHJvdG9jb2w6IEpvaS5zdHJpbmcoKVxuICAgICAgLmFsbG93KFwiVENQXCIsIFwiVURQXCIpXG4gICAgICAuZGVmYXVsdChERUZBVUxUX1BPUlRfUFJPVE9DT0wpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcHJvdG9jb2wgb2YgdGhlIHNlcnZpY2UgY29udGFpbmVyIHBvcnQuXCIpLFxuICAgIGNvbnRhaW5lclBvcnQ6IEpvaS5udW1iZXIoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBwb3J0IG51bWJlciBvbiB0aGUgc2VydmljZSBjb250YWluZXIuXCIpLFxuICAgIGhvc3RQb3J0OiBKb2kubnVtYmVyKClcbiAgICAgIC5tZXRhKHsgZGVwcmVjYXRlZDogdHJ1ZSB9KSxcbiAgICBub2RlUG9ydDogSm9pLm51bWJlcigpXG4gICAgICAuZGVzY3JpcHRpb24oXG4gICAgICAgIFwiU2V0IHRoaXMgdG8gZXhwb3NlIHRoZSBzZXJ2aWNlIG9uIHRoZSBzcGVjaWZpZWQgcG9ydCBvbiB0aGUgaG9zdCBub2RlIFwiICtcbiAgICAgICAgXCIobWF5IG5vdCBiZSBzdXBwb3J0ZWQgYnkgYWxsIHByb3ZpZGVycykuXCIsXG4gICAgICApLFxuICB9KVxuICAucmVxdWlyZWQoKVxuXG5jb25zdCB2b2x1bWVTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIG5hbWU6IGpvaUlkZW50aWZpZXIoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBuYW1lIG9mIHRoZSBhbGxvY2F0ZWQgdm9sdW1lLlwiKSxcbiAgICBjb250YWluZXJQYXRoOiBKb2kuc3RyaW5nKClcbiAgICAgIC5yZXF1aXJlZCgpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcGF0aCB3aGVyZSB0aGUgdm9sdW1lIHNob3VsZCBiZSBtb3VudGVkIGluIHRoZSBjb250YWluZXIuXCIpLFxuICAgIGhvc3RQYXRoOiBKb2kuc3RyaW5nKClcbiAgICAgIC5tZXRhKHsgZGVwcmVjYXRlZDogdHJ1ZSB9KSxcbiAgfSlcblxuY29uc3Qgc2VydmljZVNjaGVtYSA9IGJhc2VTZXJ2aWNlU2NoZW1hXG4gIC5rZXlzKHtcbiAgICBjb21tYW5kOiBKb2kuYXJyYXkoKS5pdGVtcyhKb2kuc3RyaW5nKCkpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgYXJndW1lbnRzIHRvIHJ1biB0aGUgY29udGFpbmVyIHdpdGggd2hlbiBzdGFydGluZyB0aGUgc2VydmljZS5cIiksXG4gICAgZGFlbW9uOiBKb2kuYm9vbGVhbigpXG4gICAgICAuZGVmYXVsdChmYWxzZSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIldoZXRoZXIgdG8gcnVuIHRoZSBzZXJ2aWNlIGFzIGEgZGFlbW9uICh0byBlbnN1cmUgb25seSBvbmUgcnVucyBwZXIgbm9kZSkuXCIpLFxuICAgIGluZ3Jlc3Nlczogam9pQXJyYXkoaW5ncmVzc1NjaGVtYSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIkxpc3Qgb2YgaW5ncmVzcyBlbmRwb2ludHMgdGhhdCB0aGUgc2VydmljZSBleHBvc2VzLlwiKVxuICAgICAgLmV4YW1wbGUoW3tcbiAgICAgICAgcGF0aDogXCIvYXBpXCIsXG4gICAgICAgIHBvcnQ6IFwiaHR0cFwiLFxuICAgICAgfV0pLFxuICAgIGVudjogam9pRW52VmFycygpLFxuICAgIGhlYWx0aENoZWNrOiBoZWFsdGhDaGVja1NjaGVtYVxuICAgICAgLmRlc2NyaXB0aW9uKFwiU3BlY2lmeSBob3cgdGhlIHNlcnZpY2UncyBoZWFsdGggc2hvdWxkIGJlIGNoZWNrZWQgYWZ0ZXIgZGVwbG95aW5nLlwiKSxcbiAgICBwb3J0czogam9pQXJyYXkocG9ydFNjaGVtYSlcbiAgICAgIC51bmlxdWUoXCJuYW1lXCIpXG4gICAgICAuZGVzY3JpcHRpb24oXCJMaXN0IG9mIHBvcnRzIHRoYXQgdGhlIHNlcnZpY2UgY29udGFpbmVyIGV4cG9zZXMuXCIpLFxuICAgIHZvbHVtZXM6IGpvaUFycmF5KHZvbHVtZVNjaGVtYSlcbiAgICAgIC51bmlxdWUoXCJuYW1lXCIpXG4gICAgICAuZGVzY3JpcHRpb24oXCJMaXN0IG9mIHZvbHVtZXMgdGhhdCBzaG91bGQgYmUgbW91bnRlZCB3aGVuIGRlcGxveWluZyB0aGUgY29udGFpbmVyLlwiKSxcbiAgfSlcblxuZXhwb3J0IGludGVyZmFjZSBDb250YWluZXJSZWdpc3RyeUNvbmZpZyB7XG4gIGhvc3RuYW1lOiBzdHJpbmcsXG4gIHBvcnQ/OiBudW1iZXIsXG4gIG5hbWVzcGFjZTogc3RyaW5nLFxufVxuXG5leHBvcnQgY29uc3QgY29udGFpbmVyUmVnaXN0cnlDb25maWdTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIGhvc3RuYW1lOiBKb2kuc3RyaW5nKClcbiAgICAgIC5ob3N0bmFtZSgpXG4gICAgICAucmVxdWlyZWQoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGhvc3RuYW1lIChhbmQgb3B0aW9uYWxseSBwb3J0LCBpZiBub3QgdGhlIGRlZmF1bHQgcG9ydCkgb2YgdGhlIHJlZ2lzdHJ5LlwiKVxuICAgICAgLmV4YW1wbGUoXCJnY3IuaW9cIiksXG4gICAgcG9ydDogSm9pLm51bWJlcigpXG4gICAgICAuaW50ZWdlcigpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcG9ydCB3aGVyZSB0aGUgcmVnaXN0cnkgbGlzdGVucyBvbiwgaWYgbm90IHRoZSBkZWZhdWx0LlwiKSxcbiAgICBuYW1lc3BhY2U6IEpvaS5zdHJpbmcoKVxuICAgICAgLmRlZmF1bHQoXCJfXCIpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgbmFtZXNwYWNlIGluIHRoZSByZWdpc3RyeSB3aGVyZSBpbWFnZXMgc2hvdWxkIGJlIHB1c2hlZC5cIilcbiAgICAgIC5leGFtcGxlKFwibXktcHJvamVjdFwiKSxcbiAgfSlcbiAgLnJlcXVpcmVkKClcbiAgLmRlc2NyaXB0aW9uKGRlZGVudGBcbiAgICBUaGUgcmVnaXN0cnkgd2hlcmUgYnVpbHQgY29udGFpbmVycyBzaG91bGQgYmUgcHVzaGVkIHRvLCBhbmQgdGhlbiBwdWxsZWQgdG8gdGhlIGNsdXN0ZXIgd2hlbiBkZXBsb3lpbmdcbiAgICBzZXJ2aWNlcy5cbiAgYClcblxuZXhwb3J0IGludGVyZmFjZSBDb250YWluZXJTZXJ2aWNlIGV4dGVuZHMgU2VydmljZTxDb250YWluZXJNb2R1bGU+IHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRhaW5lclRlc3RTcGVjIGV4dGVuZHMgR2VuZXJpY1Rlc3RTcGVjIHsgfVxuXG5leHBvcnQgY29uc3QgY29udGFpbmVyVGVzdFNjaGVtYSA9IGdlbmVyaWNUZXN0U2NoZW1hXG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGFpbmVyTW9kdWxlU3BlYyBleHRlbmRzIE1vZHVsZVNwZWMge1xuICBidWlsZEFyZ3M6IFByaW1pdGl2ZU1hcCxcbiAgaW1hZ2U/OiBzdHJpbmcsXG4gIHNlcnZpY2VzOiBDb250YWluZXJTZXJ2aWNlU3BlY1tdLFxuICB0ZXN0czogQ29udGFpbmVyVGVzdFNwZWNbXSxcbn1cblxuZXhwb3J0IHR5cGUgQ29udGFpbmVyTW9kdWxlQ29uZmlnID0gTW9kdWxlQ29uZmlnPENvbnRhaW5lck1vZHVsZVNwZWM+XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0TmFtZXNwYWNlID0gXCJfXCJcbmV4cG9ydCBjb25zdCBkZWZhdWx0VGFnID0gXCJsYXRlc3RcIlxuXG5leHBvcnQgY29uc3QgY29udGFpbmVyTW9kdWxlU3BlY1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgYnVpbGRBcmdzOiBKb2kub2JqZWN0KClcbiAgICAgIC5wYXR0ZXJuKC8uKy8sIGpvaVByaW1pdGl2ZSgpKVxuICAgICAgLmRlZmF1bHQoKCkgPT4gKHt9KSwgXCJ7fVwiKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiU3BlY2lmeSBidWlsZCBhcmd1bWVudHMgd2hlbiBidWlsZGluZyB0aGUgY29udGFpbmVyIGltYWdlLlwiKSxcbiAgICAvLyBUT0RPOiB2YWxpZGF0ZSB0aGUgaW1hZ2UgbmFtZSBmb3JtYXRcbiAgICBpbWFnZTogSm9pLnN0cmluZygpXG4gICAgICAuZGVzY3JpcHRpb24oXG4gICAgICAgIFwiU3BlY2lmeSB0aGUgaW1hZ2UgbmFtZSBmb3IgdGhlIGNvbnRhaW5lci4gU2hvdWxkIGJlIGEgdmFsaWQgZG9ja2VyIGltYWdlIGlkZW50aWZpZXIuIElmIHNwZWNpZmllZCBhbmQgXCIgK1xuICAgICAgICBcInRoZSBtb2R1bGUgZG9lcyBub3QgY29udGFpbiBhIERvY2tlcmZpbGUsIHRoaXMgaW1hZ2Ugd2lsbCBiZSB1c2VkIHRvIGRlcGxveSB0aGUgY29udGFpbmVyIHNlcnZpY2VzLiBcIiArXG4gICAgICAgIFwiSWYgc3BlY2lmaWVkIGFuZCB0aGUgbW9kdWxlIGRvZXMgY29udGFpbiBhIERvY2tlcmZpbGUsIHRoaXMgaWRlbnRpZmllciBpcyB1c2VkIHdoZW4gcHVzaGluZyB0aGUgYnVpbHQgaW1hZ2UuXCIsXG4gICAgICApLFxuICAgIHNlcnZpY2VzOiBqb2lBcnJheShzZXJ2aWNlU2NoZW1hKVxuICAgICAgLnVuaXF1ZShcIm5hbWVcIilcbiAgICAgIC5kZXNjcmlwdGlvbihcIkxpc3Qgb2Ygc2VydmljZXMgdG8gZGVwbG95IGZyb20gdGhpcyBjb250YWluZXIgbW9kdWxlLlwiKSxcbiAgICB0ZXN0czogam9pQXJyYXkoY29udGFpbmVyVGVzdFNjaGVtYSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIkEgbGlzdCBvZiB0ZXN0cyB0byBydW4gaW4gdGhlIG1vZHVsZS5cIiksXG4gIH0pXG4gIC5kZXNjcmlwdGlvbihcIkNvbmZpZ3VyYXRpb24gZm9yIGEgY29udGFpbmVyIG1vZHVsZS5cIilcblxuZXhwb3J0IGludGVyZmFjZSBDb250YWluZXJNb2R1bGU8XG4gIE0gZXh0ZW5kcyBDb250YWluZXJNb2R1bGVTcGVjID0gQ29udGFpbmVyTW9kdWxlU3BlYyxcbiAgUyBleHRlbmRzIENvbnRhaW5lclNlcnZpY2VTcGVjID0gQ29udGFpbmVyU2VydmljZVNwZWMsXG4gIFQgZXh0ZW5kcyBDb250YWluZXJUZXN0U3BlYyA9IENvbnRhaW5lclRlc3RTcGVjLFxuICA+IGV4dGVuZHMgTW9kdWxlPE0sIFMsIFQ+IHsgfVxuXG5pbnRlcmZhY2UgUGFyc2VkSW1hZ2VJZCB7XG4gIGhvc3Q/OiBzdHJpbmdcbiAgbmFtZXNwYWNlPzogc3RyaW5nXG4gIHJlcG9zaXRvcnk6IHN0cmluZ1xuICB0YWc6IHN0cmluZ1xufVxuXG5leHBvcnQgY29uc3QgaGVscGVycyA9IHtcbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGltYWdlIElEIHVzZWQgbG9jYWxseSwgd2hlbiBidWlsZGluZyBhbmQgZGVwbG95aW5nIHRvIGxvY2FsIGVudmlyb25tZW50c1xuICAgKiAod2hlbiB3ZSBkb24ndCBuZWVkIHRvIHB1c2ggdG8gcmVtb3RlIHJlZ2lzdHJpZXMpLlxuICAgKi9cbiAgYXN5bmMgZ2V0TG9jYWxJbWFnZUlkKG1vZHVsZTogQ29udGFpbmVyTW9kdWxlKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoYXdhaXQgaGVscGVycy5oYXNEb2NrZXJmaWxlKG1vZHVsZSkpIHtcbiAgICAgIGNvbnN0IHsgdmVyc2lvblN0cmluZyB9ID0gbW9kdWxlLnZlcnNpb25cbiAgICAgIHJldHVybiBgJHttb2R1bGUubmFtZX06JHt2ZXJzaW9uU3RyaW5nfWBcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG1vZHVsZS5zcGVjLmltYWdlIVxuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgaW1hZ2UgSUQgdG8gYmUgdXNlZCBmb3IgcHVibGlzaGluZyB0byBjb250YWluZXIgcmVnaXN0cmllc1xuICAgKiAobm90IHRvIGJlIGNvbmZ1c2VkIHdpdGggdGhlIElEIHVzZWQgd2hlbiBwdXNoaW5nIHRvIHByaXZhdGUgZGVwbG95bWVudCByZWdpc3RyaWVzKS5cbiAgICovXG4gIGFzeW5jIGdldFB1YmxpY0ltYWdlSWQobW9kdWxlOiBDb250YWluZXJNb2R1bGUpIHtcbiAgICAvLyBUT0RPOiBhbGxvdyBzZXR0aW5nIGEgZGVmYXVsdCB1c2VyL29yZyBwcmVmaXggaW4gdGhlIHByb2plY3QvcGx1Z2luIGNvbmZpZ1xuICAgIGNvbnN0IGltYWdlID0gbW9kdWxlLnNwZWMuaW1hZ2VcblxuICAgIGlmIChpbWFnZSkge1xuICAgICAgbGV0IFtpbWFnZU5hbWUsIHZlcnNpb25dID0gc3BsaXRGaXJzdChpbWFnZSwgXCI6XCIpXG5cbiAgICAgIGlmICh2ZXJzaW9uKSB7XG4gICAgICAgIC8vIHdlIHVzZSB0aGUgdmVyc2lvbiBpbiB0aGUgaW1hZ2UgbmFtZSwgaWYgc3BlY2lmaWVkXG4gICAgICAgIC8vIChhbGxvd3Mgc3BlY2lmeWluZyB2ZXJzaW9uIG9uIHNvdXJjZSBpbWFnZXMsIGFuZCBhbHNvIHNldHRpbmcgc3BlY2lmaWMgdmVyc2lvbiBuYW1lIHdoZW4gcHVibGlzaGluZyBpbWFnZXMpXG4gICAgICAgIHJldHVybiBpbWFnZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgeyB2ZXJzaW9uU3RyaW5nIH0gPSBtb2R1bGUudmVyc2lvblxuICAgICAgICByZXR1cm4gYCR7aW1hZ2VOYW1lfToke3ZlcnNpb25TdHJpbmd9YFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaGVscGVycy5nZXRMb2NhbEltYWdlSWQobW9kdWxlKVxuICAgIH1cbiAgfSxcblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgaW1hZ2UgSUQgdG8gYmUgdXNlZCB3aGVuIHB1c2hpbmcgdG8gZGVwbG95bWVudCByZWdpc3RyaWVzLlxuICAgKi9cbiAgYXN5bmMgZ2V0RGVwbG95bWVudEltYWdlSWQobW9kdWxlOiBDb250YWluZXJNb2R1bGUsIHJlZ2lzdHJ5Q29uZmlnPzogQ29udGFpbmVyUmVnaXN0cnlDb25maWcpIHtcbiAgICBjb25zdCBsb2NhbElkID0gYXdhaXQgaGVscGVycy5nZXRMb2NhbEltYWdlSWQobW9kdWxlKVxuXG4gICAgaWYgKCFyZWdpc3RyeUNvbmZpZykge1xuICAgICAgcmV0dXJuIGxvY2FsSWRcbiAgICB9XG5cbiAgICBjb25zdCBwYXJzZWRJZCA9IGhlbHBlcnMucGFyc2VJbWFnZUlkKGxvY2FsSWQpXG5cbiAgICBjb25zdCBob3N0ID0gcmVnaXN0cnlDb25maWcucG9ydCA/IGAke3JlZ2lzdHJ5Q29uZmlnLmhvc3RuYW1lfToke3JlZ2lzdHJ5Q29uZmlnLnBvcnR9YCA6IHJlZ2lzdHJ5Q29uZmlnLmhvc3RuYW1lXG5cbiAgICByZXR1cm4gaGVscGVycy51bnBhcnNlSW1hZ2VJZCh7XG4gICAgICBob3N0LFxuICAgICAgbmFtZXNwYWNlOiByZWdpc3RyeUNvbmZpZy5uYW1lc3BhY2UsXG4gICAgICByZXBvc2l0b3J5OiBwYXJzZWRJZC5yZXBvc2l0b3J5LFxuICAgICAgdGFnOiBwYXJzZWRJZC50YWcsXG4gICAgfSlcbiAgfSxcblxuICBwYXJzZUltYWdlSWQoaW1hZ2VJZDogc3RyaW5nKTogUGFyc2VkSW1hZ2VJZCB7XG4gICAgY29uc3QgcGFydHMgPSBpbWFnZUlkLnNwbGl0KFwiL1wiKVxuICAgIGxldCBbcmVwb3NpdG9yeSwgdGFnXSA9IHBhcnRzWzBdLnNwbGl0KFwiOlwiKVxuICAgIGlmICghdGFnKSB7XG4gICAgICB0YWcgPSBkZWZhdWx0VGFnXG4gICAgfVxuXG4gICAgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZXNwYWNlOiBkZWZhdWx0TmFtZXNwYWNlLFxuICAgICAgICByZXBvc2l0b3J5LFxuICAgICAgICB0YWcsXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChwYXJ0cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5hbWVzcGFjZTogcGFydHNbMF0sXG4gICAgICAgIHJlcG9zaXRvcnksXG4gICAgICAgIHRhZyxcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHBhcnRzLmxlbmd0aCA9PT0gMykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaG9zdDogcGFydHNbMF0sXG4gICAgICAgIG5hbWVzcGFjZTogcGFydHNbMV0sXG4gICAgICAgIHJlcG9zaXRvcnksXG4gICAgICAgIHRhZyxcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihgSW52YWxpZCBjb250YWluZXIgaW1hZ2UgdGFnOiAke2ltYWdlSWR9YCwgeyBpbWFnZUlkIH0pXG4gICAgfVxuICB9LFxuXG4gIHVucGFyc2VJbWFnZUlkKHBhcnNlZDogUGFyc2VkSW1hZ2VJZCkge1xuICAgIGNvbnN0IG5hbWUgPSBgJHtwYXJzZWQucmVwb3NpdG9yeX06JHtwYXJzZWQudGFnfWBcblxuICAgIGlmIChwYXJzZWQuaG9zdCkge1xuICAgICAgcmV0dXJuIGAke3BhcnNlZC5ob3N0fS8ke3BhcnNlZC5uYW1lc3BhY2V9LyR7bmFtZX1gXG4gICAgfSBlbHNlIGlmIChwYXJzZWQubmFtZXNwYWNlKSB7XG4gICAgICByZXR1cm4gYCR7cGFyc2VkLm5hbWVzcGFjZX0vJHtuYW1lfWBcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG5hbWVcbiAgICB9XG4gIH0sXG5cbiAgYXN5bmMgcHVsbEltYWdlKG1vZHVsZTogQ29udGFpbmVyTW9kdWxlKSB7XG4gICAgY29uc3QgaWRlbnRpZmllciA9IGF3YWl0IGhlbHBlcnMuZ2V0UHVibGljSW1hZ2VJZChtb2R1bGUpXG4gICAgYXdhaXQgaGVscGVycy5kb2NrZXJDbGkobW9kdWxlLCBgcHVsbCAke2lkZW50aWZpZXJ9YClcbiAgfSxcblxuICBhc3luYyBpbWFnZUV4aXN0c0xvY2FsbHkobW9kdWxlOiBDb250YWluZXJNb2R1bGUpIHtcbiAgICBjb25zdCBpZGVudGlmaWVyID0gYXdhaXQgaGVscGVycy5nZXRMb2NhbEltYWdlSWQobW9kdWxlKVxuICAgIGNvbnN0IGV4aXN0cyA9IChhd2FpdCBoZWxwZXJzLmRvY2tlckNsaShtb2R1bGUsIGBpbWFnZXMgJHtpZGVudGlmaWVyfSAtcWApKS5zdGRvdXQudHJpbSgpLmxlbmd0aCA+IDBcbiAgICByZXR1cm4gZXhpc3RzID8gaWRlbnRpZmllciA6IG51bGxcbiAgfSxcblxuICBhc3luYyBkb2NrZXJDbGkobW9kdWxlOiBDb250YWluZXJNb2R1bGUsIGFyZ3MpIHtcbiAgICAvLyBUT0RPOiB1c2UgZG9ja2Vyb2RlIGluc3RlYWQgb2YgQ0xJXG4gICAgcmV0dXJuIGNoaWxkUHJvY2Vzcy5leGVjKFwiZG9ja2VyIFwiICsgYXJncywgeyBjd2Q6IG1vZHVsZS5idWlsZFBhdGgsIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgfSlcbiAgfSxcblxuICBhc3luYyBoYXNEb2NrZXJmaWxlKG1vZHVsZTogQ29udGFpbmVyTW9kdWxlKSB7XG4gICAgY29uc3QgYnVpbGRQYXRoID0gbW9kdWxlLmJ1aWxkUGF0aFxuICAgIHJldHVybiBwYXRoRXhpc3RzKGpvaW4oYnVpbGRQYXRoLCBcIkRvY2tlcmZpbGVcIikpXG4gIH0sXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUNvbnRhaW5lck1vZHVsZSh7IG1vZHVsZUNvbmZpZyB9OiBWYWxpZGF0ZU1vZHVsZVBhcmFtczxDb250YWluZXJNb2R1bGU+KSB7XG4gIG1vZHVsZUNvbmZpZy5zcGVjID0gdmFsaWRhdGUobW9kdWxlQ29uZmlnLnNwZWMsIGNvbnRhaW5lck1vZHVsZVNwZWNTY2hlbWEsIHsgY29udGV4dDogYG1vZHVsZSAke21vZHVsZUNvbmZpZy5uYW1lfWAgfSlcblxuICAvLyB2YWxpZGF0ZSBzZXJ2aWNlc1xuICBtb2R1bGVDb25maWcuc2VydmljZUNvbmZpZ3MgPSBtb2R1bGVDb25maWcuc3BlYy5zZXJ2aWNlcy5tYXAoc3BlYyA9PiB7XG4gICAgLy8gbWFrZSBzdXJlIHBvcnRzIGFyZSBjb3JyZWN0bHkgY29uZmlndXJlZFxuICAgIGNvbnN0IG5hbWUgPSBzcGVjLm5hbWVcbiAgICBjb25zdCBkZWZpbmVkUG9ydHMgPSBzcGVjLnBvcnRzXG4gICAgY29uc3QgcG9ydHNCeU5hbWUgPSBrZXlCeShzcGVjLnBvcnRzLCBcIm5hbWVcIilcblxuICAgIGZvciAoY29uc3QgaW5ncmVzcyBvZiBzcGVjLmluZ3Jlc3Nlcykge1xuICAgICAgY29uc3QgaW5ncmVzc1BvcnQgPSBpbmdyZXNzLnBvcnRcblxuICAgICAgaWYgKCFwb3J0c0J5TmFtZVtpbmdyZXNzUG9ydF0pIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgICBgU2VydmljZSAke25hbWV9IGRvZXMgbm90IGRlZmluZSBwb3J0ICR7aW5ncmVzc1BvcnR9IGRlZmluZWQgaW4gaW5ncmVzc2AsXG4gICAgICAgICAgeyBkZWZpbmVkUG9ydHMsIGluZ3Jlc3NQb3J0IH0sXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3BlYy5oZWFsdGhDaGVjayAmJiBzcGVjLmhlYWx0aENoZWNrLmh0dHBHZXQpIHtcbiAgICAgIGNvbnN0IGhlYWx0aENoZWNrSHR0cFBvcnQgPSBzcGVjLmhlYWx0aENoZWNrLmh0dHBHZXQucG9ydFxuXG4gICAgICBpZiAoIXBvcnRzQnlOYW1lW2hlYWx0aENoZWNrSHR0cFBvcnRdKSB7XG4gICAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICAgICAgYFNlcnZpY2UgJHtuYW1lfSBkb2VzIG5vdCBkZWZpbmUgcG9ydCAke2hlYWx0aENoZWNrSHR0cFBvcnR9IGRlZmluZWQgaW4gaHR0cEdldCBoZWFsdGggY2hlY2tgLFxuICAgICAgICAgIHsgZGVmaW5lZFBvcnRzLCBoZWFsdGhDaGVja0h0dHBQb3J0IH0sXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc3BlYy5oZWFsdGhDaGVjayAmJiBzcGVjLmhlYWx0aENoZWNrLnRjcFBvcnQpIHtcbiAgICAgIGNvbnN0IGhlYWx0aENoZWNrVGNwUG9ydCA9IHNwZWMuaGVhbHRoQ2hlY2sudGNwUG9ydFxuXG4gICAgICBpZiAoIXBvcnRzQnlOYW1lW2hlYWx0aENoZWNrVGNwUG9ydF0pIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgICBgU2VydmljZSAke25hbWV9IGRvZXMgbm90IGRlZmluZSBwb3J0ICR7aGVhbHRoQ2hlY2tUY3BQb3J0fSBkZWZpbmVkIGluIHRjcFBvcnQgaGVhbHRoIGNoZWNrYCxcbiAgICAgICAgICB7IGRlZmluZWRQb3J0cywgaGVhbHRoQ2hlY2tUY3BQb3J0IH0sXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbmFtZSxcbiAgICAgIGRlcGVuZGVuY2llczogc3BlYy5kZXBlbmRlbmNpZXMsXG4gICAgICBvdXRwdXRzOiBzcGVjLm91dHB1dHMsXG4gICAgICBzcGVjLFxuICAgIH1cbiAgfSlcblxuICBtb2R1bGVDb25maWcudGVzdENvbmZpZ3MgPSBtb2R1bGVDb25maWcuc3BlYy50ZXN0cy5tYXAodCA9PiAoe1xuICAgIG5hbWU6IHQubmFtZSxcbiAgICBkZXBlbmRlbmNpZXM6IHQuZGVwZW5kZW5jaWVzLFxuICAgIHNwZWM6IHQsXG4gICAgdGltZW91dDogdC50aW1lb3V0LFxuICB9KSlcblxuICAvLyBtYWtlIHN1cmUgd2UgY2FuIGJ1aWxkIHRoZSB0aGluZ1xuICBpZiAoIW1vZHVsZUNvbmZpZy5zcGVjLmltYWdlICYmICEoYXdhaXQgcGF0aEV4aXN0cyhqb2luKG1vZHVsZUNvbmZpZy5wYXRoLCBcIkRvY2tlcmZpbGVcIikpKSkge1xuICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoXG4gICAgICBgTW9kdWxlICR7bW9kdWxlQ29uZmlnLm5hbWV9IG5laXRoZXIgc3BlY2lmaWVzIGltYWdlIG5vciBwcm92aWRlcyBEb2NrZXJmaWxlYCxcbiAgICAgIHt9LFxuICAgIClcbiAgfVxuXG4gIHJldHVybiBtb2R1bGVDb25maWdcbn1cblxuLy8gVE9ETzogcmVuYW1lIHRoaXMgcGx1Z2luIHRvIGRvY2tlclxuZXhwb3J0IGNvbnN0IGdhcmRlblBsdWdpbiA9ICgpOiBHYXJkZW5QbHVnaW4gPT4gKHtcbiAgbW9kdWxlQWN0aW9uczoge1xuICAgIGNvbnRhaW5lcjoge1xuICAgICAgdmFsaWRhdGU6IHZhbGlkYXRlQ29udGFpbmVyTW9kdWxlLFxuXG4gICAgICBhc3luYyBnZXRCdWlsZFN0YXR1cyh7IG1vZHVsZSwgbG9nRW50cnkgfTogR2V0QnVpbGRTdGF0dXNQYXJhbXM8Q29udGFpbmVyTW9kdWxlPikge1xuICAgICAgICBjb25zdCBpZGVudGlmaWVyID0gYXdhaXQgaGVscGVycy5pbWFnZUV4aXN0c0xvY2FsbHkobW9kdWxlKVxuXG4gICAgICAgIGlmIChpZGVudGlmaWVyKSB7XG4gICAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkuZGVidWcoe1xuICAgICAgICAgICAgc2VjdGlvbjogbW9kdWxlLm5hbWUsXG4gICAgICAgICAgICBtc2c6IGBJbWFnZSAke2lkZW50aWZpZXJ9IGFscmVhZHkgZXhpc3RzYCxcbiAgICAgICAgICAgIHN5bWJvbDogXCJpbmZvXCIsXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IHJlYWR5OiAhIWlkZW50aWZpZXIgfVxuICAgICAgfSxcblxuICAgICAgYXN5bmMgYnVpbGQoeyBtb2R1bGUsIGxvZ0VudHJ5IH06IEJ1aWxkTW9kdWxlUGFyYW1zPENvbnRhaW5lck1vZHVsZT4pIHtcbiAgICAgICAgY29uc3QgYnVpbGRQYXRoID0gbW9kdWxlLmJ1aWxkUGF0aFxuICAgICAgICBjb25zdCBpbWFnZSA9IG1vZHVsZS5zcGVjLmltYWdlXG5cbiAgICAgICAgaWYgKCEhaW1hZ2UgJiYgIShhd2FpdCBoZWxwZXJzLmhhc0RvY2tlcmZpbGUobW9kdWxlKSkpIHtcbiAgICAgICAgICBpZiAoYXdhaXQgaGVscGVycy5pbWFnZUV4aXN0c0xvY2FsbHkobW9kdWxlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgZnJlc2g6IGZhbHNlIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkuc2V0U3RhdGUoYFB1bGxpbmcgaW1hZ2UgJHtpbWFnZX0uLi5gKVxuICAgICAgICAgIGF3YWl0IGhlbHBlcnMucHVsbEltYWdlKG1vZHVsZSlcbiAgICAgICAgICByZXR1cm4geyBmZXRjaGVkOiB0cnVlIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGlkZW50aWZpZXIgPSBhd2FpdCBoZWxwZXJzLmdldExvY2FsSW1hZ2VJZChtb2R1bGUpXG5cbiAgICAgICAgLy8gYnVpbGQgZG9lc24ndCBleGlzdCwgc28gd2UgY3JlYXRlIGl0XG4gICAgICAgIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LnNldFN0YXRlKGBCdWlsZGluZyAke2lkZW50aWZpZXJ9Li4uYClcblxuICAgICAgICBjb25zdCBidWlsZEFyZ3MgPSBPYmplY3QuZW50cmllcyhtb2R1bGUuc3BlYy5idWlsZEFyZ3MpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgLy8gVE9ETzogbWF5IG5lZWQgdG8gZXNjYXBlIHRoaXNcbiAgICAgICAgICByZXR1cm4gYC0tYnVpbGQtYXJnICR7a2V5fT0ke3ZhbHVlfWBcbiAgICAgICAgfSkuam9pbihcIiBcIilcblxuICAgICAgICAvLyBUT0RPOiBsb2cgZXJyb3IgaWYgaXQgb2NjdXJzXG4gICAgICAgIC8vIFRPRE86IHN0cmVhbSBvdXRwdXQgdG8gbG9nIGlmIGF0IGRlYnVnIGxvZyBsZXZlbFxuICAgICAgICBhd2FpdCBoZWxwZXJzLmRvY2tlckNsaShtb2R1bGUsIGBidWlsZCAke2J1aWxkQXJnc30gLXQgJHtpZGVudGlmaWVyfSAke2J1aWxkUGF0aH1gKVxuXG4gICAgICAgIHJldHVybiB7IGZyZXNoOiB0cnVlLCBkZXRhaWxzOiB7IGlkZW50aWZpZXIgfSB9XG4gICAgICB9LFxuXG4gICAgICBhc3luYyBwdWJsaXNoTW9kdWxlKHsgbW9kdWxlLCBsb2dFbnRyeSB9OiBQdWJsaXNoTW9kdWxlUGFyYW1zPENvbnRhaW5lck1vZHVsZT4pIHtcbiAgICAgICAgaWYgKCEoYXdhaXQgaGVscGVycy5oYXNEb2NrZXJmaWxlKG1vZHVsZSkpKSB7XG4gICAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkuc2V0U3RhdGUoeyBtc2c6IGBOb3RoaW5nIHRvIHB1Ymxpc2hgIH0pXG4gICAgICAgICAgcmV0dXJuIHsgcHVibGlzaGVkOiBmYWxzZSB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsb2NhbElkID0gYXdhaXQgaGVscGVycy5nZXRMb2NhbEltYWdlSWQobW9kdWxlKVxuICAgICAgICBjb25zdCByZW1vdGVJZCA9IGF3YWl0IGhlbHBlcnMuZ2V0UHVibGljSW1hZ2VJZChtb2R1bGUpXG5cbiAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkuc2V0U3RhdGUoeyBtc2c6IGBQdWJsaXNoaW5nIGltYWdlICR7cmVtb3RlSWR9Li4uYCB9KVxuXG4gICAgICAgIGlmIChsb2NhbElkICE9PSByZW1vdGVJZCkge1xuICAgICAgICAgIGF3YWl0IGhlbHBlcnMuZG9ja2VyQ2xpKG1vZHVsZSwgYHRhZyAke2xvY2FsSWR9ICR7cmVtb3RlSWR9YClcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRPRE86IGxvZyBlcnJvciBpZiBpdCBvY2N1cnNcbiAgICAgICAgLy8gVE9ETzogc3RyZWFtIG91dHB1dCB0byBsb2cgaWYgYXQgZGVidWcgbG9nIGxldmVsXG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGlmIG1vZHVsZSBhbHJlYWR5IGV4aXN0cyByZW1vdGVseT9cbiAgICAgICAgYXdhaXQgaGVscGVycy5kb2NrZXJDbGkobW9kdWxlLCBgcHVzaCAke3JlbW90ZUlkfWApXG5cbiAgICAgICAgcmV0dXJuIHsgcHVibGlzaGVkOiB0cnVlLCBtZXNzYWdlOiBgUHVibGlzaGVkICR7cmVtb3RlSWR9YCB9XG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KVxuIl19
