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
const execa = require("execa");
const Joi = require("joi");
const js_yaml_1 = require("js-yaml");
const lodash_1 = require("lodash");
const path_1 = require("path");
const common_1 = require("../../config/common");
const util_1 = require("../../util/util");
const namespace_1 = require("./namespace");
const constants_1 = require("../../constants");
const base_1 = require("../../vcs/base");
const status_1 = require("./status");
const generic_1 = require("../generic");
const api_1 = require("./api");
const parameterValueSchema = Joi.alternatives(common_1.joiPrimitive(), Joi.array().items(Joi.lazy(() => parameterValueSchema)), Joi.object().pattern(/.+/, Joi.lazy(() => parameterValueSchema)));
const helmModuleSpecSchema = Joi.object().keys({
    // TODO: support placing a helm chart in the module directory
    chart: Joi.string()
        .required()
        .description("A valid Helm chart name or URI."),
    repo: Joi.string()
        .description("The repository URL to fetch the chart from."),
    dependencies: common_1.joiArray(common_1.joiIdentifier())
        .description("List of names of services that should be deployed before this chart."),
    version: Joi.string()
        .description("The chart version to deploy."),
    parameters: Joi.object()
        .pattern(/.+/, parameterValueSchema)
        .default(() => ({}), "{}")
        .description("Map of parameters to pass to Helm when rendering the templates. May include arrays and nested objects."),
});
const helmStatusCodeMap = {
    // see https://github.com/kubernetes/helm/blob/master/_proto/hapi/release/status.proto
    0: "unknown",
    1: "ready",
    2: "missing",
    3: "stopped",
    4: "unhealthy",
    5: "stopped",
    6: "deploying",
    7: "deploying",
    8: "deploying",
};
exports.helmHandlers = {
    validate({ moduleConfig }) {
        return __awaiter(this, void 0, void 0, function* () {
            moduleConfig.spec = common_1.validate(moduleConfig.spec, helmModuleSpecSchema, { context: `helm module ${moduleConfig.name}` });
            const { chart, version, parameters, dependencies } = moduleConfig.spec;
            moduleConfig.serviceConfigs = [{
                    name: moduleConfig.name,
                    dependencies,
                    outputs: {},
                    spec: { chart, version, parameters, dependencies },
                }];
            // TODO: make sure at least either a chart is specified, or module contains a helm chart
            return moduleConfig;
        });
    },
    getBuildStatus: generic_1.getGenericModuleBuildStatus,
    build,
    getServiceStatus,
    deployService({ ctx, module, service, logEntry }) {
        return __awaiter(this, void 0, void 0, function* () {
            const provider = ctx.provider;
            const chartPath = yield getChartPath(module);
            const valuesPath = getValuesPath(chartPath);
            const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
            const releaseName = getReleaseName(namespace, service);
            const releaseStatus = yield getReleaseStatus(ctx.provider, releaseName);
            if (releaseStatus.state === "missing") {
                yield helm(provider, "install", chartPath, "--name", releaseName, "--namespace", namespace, "--values", valuesPath, "--wait");
            }
            else {
                yield helm(provider, "upgrade", releaseName, chartPath, "--namespace", namespace, "--values", valuesPath, "--wait");
            }
            const objects = yield getChartObjects(ctx, service);
            yield status_1.waitForObjects({ ctx, provider, service, objects, logEntry });
            return {};
        });
    },
    deleteService(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { ctx, logEntry, service } = params;
            const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
            const releaseName = getReleaseName(namespace, service);
            yield helm(ctx.provider, "delete", "--purge", releaseName);
            logEntry && logEntry.setSuccess("Service deleted");
            return yield getServiceStatus(params);
        });
    },
};
function build({ ctx, module, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const buildPath = module.buildPath;
        const config = module;
        // fetch the chart
        const fetchArgs = [
            "fetch", config.spec.chart,
            "--destination", buildPath,
            "--untar",
        ];
        if (config.spec.version) {
            fetchArgs.push("--version", config.spec.version);
        }
        if (config.spec.repo) {
            fetchArgs.push("--repo", config.spec.repo);
        }
        logEntry && logEntry.setState("Fetching chart...");
        yield helm(ctx.provider, ...fetchArgs);
        const chartPath = yield getChartPath(module);
        // create the values.yml file (merge the configured parameters into the default values)
        logEntry && logEntry.setState("Preparing chart...");
        const values = js_yaml_1.safeLoad(yield helm(ctx.provider, "inspect", "values", chartPath)) || {};
        Object.entries(flattenValues(config.spec.parameters))
            .map(([k, v]) => lodash_1.set(values, k, v));
        const valuesPath = getValuesPath(chartPath);
        yield util_1.dumpYaml(valuesPath, values);
        // keep track of which version has been built
        const buildVersionFilePath = path_1.join(buildPath, constants_1.GARDEN_BUILD_VERSION_FILENAME);
        const version = module.version;
        yield base_1.writeTreeVersionFile(buildVersionFilePath, {
            latestCommit: version.versionString,
            dirtyTimestamp: version.dirtyTimestamp,
        });
        return { fresh: true };
    });
}
function helm(provider, ...args) {
    return execa.stdout("helm", [
        "--kube-context", provider.config.context,
        ...args,
    ]);
}
exports.helm = helm;
function getChartPath(module) {
    return __awaiter(this, void 0, void 0, function* () {
        const splitName = module.spec.chart.split("/");
        const chartDir = splitName[splitName.length - 1];
        return path_1.join(module.buildPath, chartDir);
    });
}
function getValuesPath(chartPath) {
    return path_1.join(chartPath, "garden-values.yml");
}
function getChartObjects(ctx, service) {
    return __awaiter(this, void 0, void 0, function* () {
        const chartPath = yield getChartPath(service.module);
        const valuesPath = getValuesPath(chartPath);
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const releaseName = getReleaseName(namespace, service);
        const objects = js_yaml_1.safeLoadAll(yield helm(ctx.provider, "template", "--name", releaseName, "--namespace", namespace, "--values", valuesPath, chartPath));
        return objects.filter(obj => obj !== null).map((obj) => {
            if (!obj.metadata.annotations) {
                obj.metadata.annotations = {};
            }
            return obj;
        });
    });
}
function getServiceStatus({ ctx, service, module, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        // need to build to be able to check the status
        const buildStatus = yield generic_1.getGenericModuleBuildStatus({ ctx, module, logEntry });
        if (!buildStatus.ready) {
            yield build({ ctx, module, logEntry });
        }
        // first check if the installed objects on the cluster match the current code
        const objects = yield getChartObjects(ctx, service);
        const matched = yield status_1.compareDeployedObjects(ctx, objects);
        if (!matched) {
            return { state: "outdated" };
        }
        // then check if the rollout is complete
        const version = module.version;
        const api = new api_1.KubeApi(ctx.provider);
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const { ready } = yield status_1.checkObjectStatus(api, namespace, objects);
        // TODO: set state to "unhealthy" if any status is "unhealthy"
        const state = ready ? "ready" : "deploying";
        return { state, version: version.versionString };
    });
}
function getReleaseName(namespace, service) {
    return `${namespace}--${service.name}`;
}
function getReleaseStatus(provider, releaseName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = JSON.parse(yield helm(provider, "status", releaseName, "--output", "json"));
            const statusCode = res.info.status.code;
            return {
                state: helmStatusCodeMap[statusCode],
                detail: res,
            };
        }
        catch (_) {
            // release doesn't exist
            return { state: "missing" };
        }
    });
}
// adapted from https://gist.github.com/penguinboy/762197
function flattenValues(object, prefix = "") {
    return Object.keys(object).reduce((prev, element) => object[element] && typeof object[element] === "object" && !Array.isArray(object[element])
        ? Object.assign({}, prev, flattenValues(object[element], `${prefix}${element}.`)) : Object.assign({}, prev, { [`${prefix}${element}`]: object[element] }), {});
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9oZWxtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCwrQkFBK0I7QUFDL0IsMkJBQTBCO0FBQzFCLHFDQUdnQjtBQUNoQixtQ0FBNEI7QUFDNUIsK0JBQTJCO0FBRTNCLGdEQU00QjtBQWU1QiwwQ0FBMEM7QUFFMUMsMkNBQTZDO0FBQzdDLCtDQUErRDtBQUMvRCx5Q0FBcUQ7QUFFckQscUNBQW9GO0FBQ3BGLHdDQUF3RDtBQUV4RCwrQkFBK0I7QUEwQi9CLE1BQU0sb0JBQW9CLEdBQUcsR0FBRyxDQUFDLFlBQVksQ0FDM0MscUJBQVksRUFBRSxFQUNkLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEVBQ3ZELEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUNqRSxDQUFBO0FBRUQsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDO0lBQzdDLDZEQUE2RDtJQUM3RCxLQUFLLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtTQUNoQixRQUFRLEVBQUU7U0FDVixXQUFXLENBQUMsaUNBQWlDLENBQUM7SUFDakQsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUU7U0FDZixXQUFXLENBQUMsNkNBQTZDLENBQUM7SUFDN0QsWUFBWSxFQUFFLGlCQUFRLENBQUMsc0JBQWEsRUFBRSxDQUFDO1NBQ3BDLFdBQVcsQ0FBQyxzRUFBc0UsQ0FBQztJQUN0RixPQUFPLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtTQUNsQixXQUFXLENBQUMsOEJBQThCLENBQUM7SUFDOUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUU7U0FDckIsT0FBTyxDQUFDLElBQUksRUFBRSxvQkFBb0IsQ0FBQztTQUNuQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUM7U0FDekIsV0FBVyxDQUNWLHdHQUF3RyxDQUN6RztDQUNKLENBQUMsQ0FBQTtBQUVGLE1BQU0saUJBQWlCLEdBQXFDO0lBQzFELHNGQUFzRjtJQUN0RixDQUFDLEVBQUUsU0FBUztJQUNaLENBQUMsRUFBRSxPQUFPO0lBQ1YsQ0FBQyxFQUFFLFNBQVM7SUFDWixDQUFDLEVBQUUsU0FBUztJQUNaLENBQUMsRUFBRSxXQUFXO0lBQ2QsQ0FBQyxFQUFFLFNBQVM7SUFDWixDQUFDLEVBQUUsV0FBVztJQUNkLENBQUMsRUFBRSxXQUFXO0lBQ2QsQ0FBQyxFQUFFLFdBQVc7Q0FDZixDQUFBO0FBRVksUUFBQSxZQUFZLEdBQWlEO0lBQ2xFLFFBQVEsQ0FBQyxFQUFFLFlBQVksRUFBd0I7O1lBQ25ELFlBQVksQ0FBQyxJQUFJLEdBQUcsaUJBQVEsQ0FDMUIsWUFBWSxDQUFDLElBQUksRUFDakIsb0JBQW9CLEVBQ3BCLEVBQUUsT0FBTyxFQUFFLGVBQWUsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFFLENBQ2hELENBQUE7WUFFRCxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQTtZQUV0RSxZQUFZLENBQUMsY0FBYyxHQUFHLENBQUM7b0JBQzdCLElBQUksRUFBRSxZQUFZLENBQUMsSUFBSTtvQkFDdkIsWUFBWTtvQkFDWixPQUFPLEVBQUUsRUFBRTtvQkFDWCxJQUFJLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUU7aUJBQ25ELENBQUMsQ0FBQTtZQUVGLHdGQUF3RjtZQUN4RixPQUFPLFlBQVksQ0FBQTtRQUNyQixDQUFDO0tBQUE7SUFFRCxjQUFjLEVBQUUscUNBQTJCO0lBQzNDLEtBQUs7SUFDTCxnQkFBZ0I7SUFFVixhQUFhLENBQ2pCLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFtQzs7WUFFbkUsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQTtZQUM3QixNQUFNLFNBQVMsR0FBRyxNQUFNLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUM1QyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDM0MsTUFBTSxTQUFTLEdBQUcsTUFBTSwyQkFBZSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7WUFDMUQsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQTtZQUV0RCxNQUFNLGFBQWEsR0FBRyxNQUFNLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUE7WUFFdkUsSUFBSSxhQUFhLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRTtnQkFDckMsTUFBTSxJQUFJLENBQUMsUUFBUSxFQUNqQixTQUFTLEVBQUUsU0FBUyxFQUNwQixRQUFRLEVBQUUsV0FBVyxFQUNyQixhQUFhLEVBQUUsU0FBUyxFQUN4QixVQUFVLEVBQUUsVUFBVSxFQUN0QixRQUFRLENBQ1QsQ0FBQTthQUNGO2lCQUFNO2dCQUNMLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFDakIsU0FBUyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQ2pDLGFBQWEsRUFBRSxTQUFTLEVBQ3hCLFVBQVUsRUFBRSxVQUFVLEVBQ3RCLFFBQVEsQ0FDVCxDQUFBO2FBQ0Y7WUFFRCxNQUFNLE9BQU8sR0FBRyxNQUFNLGVBQWUsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDbkQsTUFBTSx1QkFBYyxDQUFDLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUE7WUFFbkUsT0FBTyxFQUFFLENBQUE7UUFDWCxDQUFDO0tBQUE7SUFFSyxhQUFhLENBQUMsTUFBMkI7O1lBQzdDLE1BQU0sRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQTtZQUN6QyxNQUFNLFNBQVMsR0FBRyxNQUFNLDJCQUFlLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtZQUMxRCxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1lBQ3RELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQTtZQUMxRCxRQUFRLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO1lBRWxELE9BQU8sTUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN2QyxDQUFDO0tBQUE7Q0FDRixDQUFBO0FBRUQsU0FBZSxLQUFLLENBQUMsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBaUM7O1FBQzNFLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUE7UUFDbEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFBO1FBRXJCLGtCQUFrQjtRQUNsQixNQUFNLFNBQVMsR0FBRztZQUNoQixPQUFPLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLO1lBQzFCLGVBQWUsRUFBRSxTQUFTO1lBQzFCLFNBQVM7U0FDVixDQUFBO1FBQ0QsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUN2QixTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFBO1NBQ2pEO1FBQ0QsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTtZQUNwQixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1NBQzNDO1FBQ0QsUUFBUSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQTtRQUNsRCxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUE7UUFFdEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUE7UUFFNUMsdUZBQXVGO1FBQ3ZGLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUE7UUFDbkQsTUFBTSxNQUFNLEdBQUcsa0JBQVEsQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7UUFFdkYsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzthQUNsRCxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsWUFBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUVyQyxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDM0MsTUFBTSxlQUFRLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBRWxDLDZDQUE2QztRQUM3QyxNQUFNLG9CQUFvQixHQUFHLFdBQUksQ0FBQyxTQUFTLEVBQUUseUNBQTZCLENBQUMsQ0FBQTtRQUMzRSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQzlCLE1BQU0sMkJBQW9CLENBQUMsb0JBQW9CLEVBQUU7WUFDL0MsWUFBWSxFQUFFLE9BQU8sQ0FBQyxhQUFhO1lBQ25DLGNBQWMsRUFBRSxPQUFPLENBQUMsY0FBYztTQUN2QyxDQUFDLENBQUE7UUFFRixPQUFPLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFBO0lBQ3hCLENBQUM7Q0FBQTtBQUVELFNBQWdCLElBQUksQ0FBQyxRQUE0QixFQUFFLEdBQUcsSUFBYztJQUNsRSxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1FBQzFCLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTztRQUN6QyxHQUFHLElBQUk7S0FDUixDQUFDLENBQUE7QUFDSixDQUFDO0FBTEQsb0JBS0M7QUFFRCxTQUFlLFlBQVksQ0FBQyxNQUFrQjs7UUFDNUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQzlDLE1BQU0sUUFBUSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQ2hELE9BQU8sV0FBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUE7SUFDekMsQ0FBQztDQUFBO0FBRUQsU0FBUyxhQUFhLENBQUMsU0FBaUI7SUFDdEMsT0FBTyxXQUFJLENBQUMsU0FBUyxFQUFFLG1CQUFtQixDQUFDLENBQUE7QUFDN0MsQ0FBQztBQUVELFNBQWUsZUFBZSxDQUFDLEdBQWtCLEVBQUUsT0FBZ0I7O1FBQ2pFLE1BQU0sU0FBUyxHQUFHLE1BQU0sWUFBWSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUNwRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDM0MsTUFBTSxTQUFTLEdBQUcsTUFBTSwyQkFBZSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUE7UUFDMUQsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUV0RCxNQUFNLE9BQU8sR0FBdUIscUJBQVcsQ0FBQyxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUNyRSxVQUFVLEVBQ1YsUUFBUSxFQUFFLFdBQVcsRUFDckIsYUFBYSxFQUFFLFNBQVMsRUFDeEIsVUFBVSxFQUFFLFVBQVUsRUFDdEIsU0FBUyxDQUNWLENBQUMsQ0FBQTtRQUVGLE9BQU8sT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUNyRCxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUU7Z0JBQzdCLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQTthQUM5QjtZQUNELE9BQU8sR0FBRyxDQUFBO1FBQ1osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0NBQUE7QUFFRCxTQUFlLGdCQUFnQixDQUM3QixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBc0M7O1FBRXRFLCtDQUErQztRQUMvQyxNQUFNLFdBQVcsR0FBRyxNQUFNLHFDQUEyQixDQUFDLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFBO1FBQ2hGLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFO1lBQ3RCLE1BQU0sS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFBO1NBQ3ZDO1FBRUQsNkVBQTZFO1FBQzdFLE1BQU0sT0FBTyxHQUFHLE1BQU0sZUFBZSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUNuRCxNQUFNLE9BQU8sR0FBRyxNQUFNLCtCQUFzQixDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUUxRCxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQ1osT0FBTyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQTtTQUM3QjtRQUVELHdDQUF3QztRQUN4QyxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFBO1FBQzlCLE1BQU0sR0FBRyxHQUFHLElBQUksYUFBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUNyQyxNQUFNLFNBQVMsR0FBRyxNQUFNLDJCQUFlLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUMxRCxNQUFNLEVBQUUsS0FBSyxFQUFFLEdBQUcsTUFBTSwwQkFBaUIsQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBRWxFLDhEQUE4RDtRQUM5RCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFBO1FBRTNDLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxhQUFhLEVBQUUsQ0FBQTtJQUNsRCxDQUFDO0NBQUE7QUFFRCxTQUFTLGNBQWMsQ0FBQyxTQUFpQixFQUFFLE9BQWdCO0lBQ3pELE9BQU8sR0FBRyxTQUFTLEtBQUssT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO0FBQ3hDLENBQUM7QUFFRCxTQUFlLGdCQUFnQixDQUFDLFFBQTRCLEVBQUUsV0FBbUI7O1FBQy9FLElBQUk7WUFDRixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFBO1lBQ3ZGLE1BQU0sVUFBVSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQTtZQUN2QyxPQUFPO2dCQUNMLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxVQUFVLENBQUM7Z0JBQ3BDLE1BQU0sRUFBRSxHQUFHO2FBQ1osQ0FBQTtTQUNGO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVix3QkFBd0I7WUFDeEIsT0FBTyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQTtTQUM1QjtJQUNILENBQUM7Q0FBQTtBQUVELHlEQUF5RDtBQUN6RCxTQUFTLGFBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxHQUFHLEVBQUU7SUFDeEMsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FDL0IsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FDaEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZGLENBQUMsbUJBQU0sSUFBSSxFQUFLLGFBQWEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEVBQUUsR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLENBQUMsRUFDdEUsQ0FBQyxtQkFBTSxJQUFJLEVBQUssRUFBRSxDQUFDLEdBQUcsTUFBTSxHQUFHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUUsRUFDbEUsRUFBRSxDQUNILENBQUE7QUFDSCxDQUFDIiwiZmlsZSI6InBsdWdpbnMva3ViZXJuZXRlcy9oZWxtLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCBleGVjYSA9IHJlcXVpcmUoXCJleGVjYVwiKVxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IHtcbiAgc2FmZUxvYWQsXG4gIHNhZmVMb2FkQWxsLFxufSBmcm9tIFwianMteWFtbFwiXG5pbXBvcnQgeyBzZXQgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBQbHVnaW5Db250ZXh0IH0gZnJvbSBcIi4uLy4uL3BsdWdpbi1jb250ZXh0XCJcbmltcG9ydCB7XG4gIGpvaUFycmF5LFxuICBqb2lJZGVudGlmaWVyLFxuICBqb2lQcmltaXRpdmUsXG4gIFByaW1pdGl2ZSxcbiAgdmFsaWRhdGUsXG59IGZyb20gXCIuLi8uLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7IE1vZHVsZSB9IGZyb20gXCIuLi8uLi90eXBlcy9tb2R1bGVcIlxuaW1wb3J0IHsgTW9kdWxlQW5kU2VydmljZUFjdGlvbnMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQge1xuICBCdWlsZE1vZHVsZVBhcmFtcyxcbiAgRGVwbG95U2VydmljZVBhcmFtcyxcbiAgR2V0U2VydmljZVN0YXR1c1BhcmFtcyxcbiAgVmFsaWRhdGVNb2R1bGVQYXJhbXMsXG4gIERlbGV0ZVNlcnZpY2VQYXJhbXMsXG59IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7XG4gIEJ1aWxkUmVzdWx0LFxuICBWYWxpZGF0ZU1vZHVsZVJlc3VsdCxcbn0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9vdXRwdXRzXCJcbmltcG9ydCB7IFNlcnZpY2UsIFNlcnZpY2VTdGF0dXMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBkdW1wWWFtbCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgS3ViZXJuZXRlc1Byb3ZpZGVyIH0gZnJvbSBcIi4va3ViZXJuZXRlc1wiXG5pbXBvcnQgeyBnZXRBcHBOYW1lc3BhY2UgfSBmcm9tIFwiLi9uYW1lc3BhY2VcIlxuaW1wb3J0IHsgR0FSREVOX0JVSUxEX1ZFUlNJT05fRklMRU5BTUUgfSBmcm9tIFwiLi4vLi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IHdyaXRlVHJlZVZlcnNpb25GaWxlIH0gZnJvbSBcIi4uLy4uL3Zjcy9iYXNlXCJcbmltcG9ydCB7IFNlcnZpY2VTdGF0ZSB9IGZyb20gXCIuLi8uLi90eXBlcy9zZXJ2aWNlXCJcbmltcG9ydCB7IGNvbXBhcmVEZXBsb3llZE9iamVjdHMsIHdhaXRGb3JPYmplY3RzLCBjaGVja09iamVjdFN0YXR1cyB9IGZyb20gXCIuL3N0YXR1c1wiXG5pbXBvcnQgeyBnZXRHZW5lcmljTW9kdWxlQnVpbGRTdGF0dXMgfSBmcm9tIFwiLi4vZ2VuZXJpY1wiXG5pbXBvcnQgeyBTZXJ2aWNlU3BlYyB9IGZyb20gXCIuLi8uLi9jb25maWcvc2VydmljZVwiXG5pbXBvcnQgeyBLdWJlQXBpIH0gZnJvbSBcIi4vYXBpXCJcblxuZXhwb3J0IGludGVyZmFjZSBLdWJlcm5ldGVzT2JqZWN0IHtcbiAgYXBpVmVyc2lvbjogc3RyaW5nXG4gIGtpbmQ6IHN0cmluZ1xuICBtZXRhZGF0YToge1xuICAgIGFubm90YXRpb25zPzogb2JqZWN0LFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBuYW1lc3BhY2U/OiBzdHJpbmcsXG4gICAgbGFiZWxzPzogb2JqZWN0LFxuICB9XG4gIHNwZWM/OiBhbnlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWxtU2VydmljZVNwZWMgZXh0ZW5kcyBTZXJ2aWNlU3BlYyB7XG4gIGNoYXJ0OiBzdHJpbmdcbiAgcmVwbz86IHN0cmluZ1xuICBkZXBlbmRlbmNpZXM6IHN0cmluZ1tdXG4gIHZlcnNpb24/OiBzdHJpbmdcbiAgcGFyYW1ldGVyczogeyBba2V5OiBzdHJpbmddOiBQcmltaXRpdmUgfVxufVxuXG5leHBvcnQgdHlwZSBIZWxtTW9kdWxlU3BlYyA9IEhlbG1TZXJ2aWNlU3BlY1xuXG5leHBvcnQgaW50ZXJmYWNlIEhlbG1Nb2R1bGUgZXh0ZW5kcyBNb2R1bGU8SGVsbU1vZHVsZVNwZWMsIEhlbG1TZXJ2aWNlU3BlYz4geyB9XG5cbmNvbnN0IHBhcmFtZXRlclZhbHVlU2NoZW1hID0gSm9pLmFsdGVybmF0aXZlcyhcbiAgam9pUHJpbWl0aXZlKCksXG4gIEpvaS5hcnJheSgpLml0ZW1zKEpvaS5sYXp5KCgpID0+IHBhcmFtZXRlclZhbHVlU2NoZW1hKSksXG4gIEpvaS5vYmplY3QoKS5wYXR0ZXJuKC8uKy8sIEpvaS5sYXp5KCgpID0+IHBhcmFtZXRlclZhbHVlU2NoZW1hKSksXG4pXG5cbmNvbnN0IGhlbG1Nb2R1bGVTcGVjU2NoZW1hID0gSm9pLm9iamVjdCgpLmtleXMoe1xuICAvLyBUT0RPOiBzdXBwb3J0IHBsYWNpbmcgYSBoZWxtIGNoYXJ0IGluIHRoZSBtb2R1bGUgZGlyZWN0b3J5XG4gIGNoYXJ0OiBKb2kuc3RyaW5nKClcbiAgICAucmVxdWlyZWQoKVxuICAgIC5kZXNjcmlwdGlvbihcIkEgdmFsaWQgSGVsbSBjaGFydCBuYW1lIG9yIFVSSS5cIiksXG4gIHJlcG86IEpvaS5zdHJpbmcoKVxuICAgIC5kZXNjcmlwdGlvbihcIlRoZSByZXBvc2l0b3J5IFVSTCB0byBmZXRjaCB0aGUgY2hhcnQgZnJvbS5cIiksXG4gIGRlcGVuZGVuY2llczogam9pQXJyYXkoam9pSWRlbnRpZmllcigpKVxuICAgIC5kZXNjcmlwdGlvbihcIkxpc3Qgb2YgbmFtZXMgb2Ygc2VydmljZXMgdGhhdCBzaG91bGQgYmUgZGVwbG95ZWQgYmVmb3JlIHRoaXMgY2hhcnQuXCIpLFxuICB2ZXJzaW9uOiBKb2kuc3RyaW5nKClcbiAgICAuZGVzY3JpcHRpb24oXCJUaGUgY2hhcnQgdmVyc2lvbiB0byBkZXBsb3kuXCIpLFxuICBwYXJhbWV0ZXJzOiBKb2kub2JqZWN0KClcbiAgICAucGF0dGVybigvLisvLCBwYXJhbWV0ZXJWYWx1ZVNjaGVtYSlcbiAgICAuZGVmYXVsdCgoKSA9PiAoe30pLCBcInt9XCIpXG4gICAgLmRlc2NyaXB0aW9uKFxuICAgICAgXCJNYXAgb2YgcGFyYW1ldGVycyB0byBwYXNzIHRvIEhlbG0gd2hlbiByZW5kZXJpbmcgdGhlIHRlbXBsYXRlcy4gTWF5IGluY2x1ZGUgYXJyYXlzIGFuZCBuZXN0ZWQgb2JqZWN0cy5cIixcbiAgICApLFxufSlcblxuY29uc3QgaGVsbVN0YXR1c0NvZGVNYXA6IHsgW2NvZGU6IG51bWJlcl06IFNlcnZpY2VTdGF0ZSB9ID0ge1xuICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2t1YmVybmV0ZXMvaGVsbS9ibG9iL21hc3Rlci9fcHJvdG8vaGFwaS9yZWxlYXNlL3N0YXR1cy5wcm90b1xuICAwOiBcInVua25vd25cIiwgICAvLyBVTktOT1dOXG4gIDE6IFwicmVhZHlcIiwgICAgIC8vIERFUExPWUVEXG4gIDI6IFwibWlzc2luZ1wiLCAgIC8vIERFTEVURURcbiAgMzogXCJzdG9wcGVkXCIsICAgLy8gU1VQRVJTRURFRFxuICA0OiBcInVuaGVhbHRoeVwiLCAvLyBGQUlMRURcbiAgNTogXCJzdG9wcGVkXCIsICAgLy8gREVMRVRJTkdcbiAgNjogXCJkZXBsb3lpbmdcIiwgLy8gUEVORElOR19JTlNUQUxMXG4gIDc6IFwiZGVwbG95aW5nXCIsIC8vIFBFTkRJTkdfVVBHUkFERVxuICA4OiBcImRlcGxveWluZ1wiLCAvLyBQRU5ESU5HX1JPTExCQUNLXG59XG5cbmV4cG9ydCBjb25zdCBoZWxtSGFuZGxlcnM6IFBhcnRpYWw8TW9kdWxlQW5kU2VydmljZUFjdGlvbnM8SGVsbU1vZHVsZT4+ID0ge1xuICBhc3luYyB2YWxpZGF0ZSh7IG1vZHVsZUNvbmZpZyB9OiBWYWxpZGF0ZU1vZHVsZVBhcmFtcyk6IFByb21pc2U8VmFsaWRhdGVNb2R1bGVSZXN1bHQ+IHtcbiAgICBtb2R1bGVDb25maWcuc3BlYyA9IHZhbGlkYXRlKFxuICAgICAgbW9kdWxlQ29uZmlnLnNwZWMsXG4gICAgICBoZWxtTW9kdWxlU3BlY1NjaGVtYSxcbiAgICAgIHsgY29udGV4dDogYGhlbG0gbW9kdWxlICR7bW9kdWxlQ29uZmlnLm5hbWV9YCB9LFxuICAgIClcblxuICAgIGNvbnN0IHsgY2hhcnQsIHZlcnNpb24sIHBhcmFtZXRlcnMsIGRlcGVuZGVuY2llcyB9ID0gbW9kdWxlQ29uZmlnLnNwZWNcblxuICAgIG1vZHVsZUNvbmZpZy5zZXJ2aWNlQ29uZmlncyA9IFt7XG4gICAgICBuYW1lOiBtb2R1bGVDb25maWcubmFtZSxcbiAgICAgIGRlcGVuZGVuY2llcyxcbiAgICAgIG91dHB1dHM6IHt9LFxuICAgICAgc3BlYzogeyBjaGFydCwgdmVyc2lvbiwgcGFyYW1ldGVycywgZGVwZW5kZW5jaWVzIH0sXG4gICAgfV1cblxuICAgIC8vIFRPRE86IG1ha2Ugc3VyZSBhdCBsZWFzdCBlaXRoZXIgYSBjaGFydCBpcyBzcGVjaWZpZWQsIG9yIG1vZHVsZSBjb250YWlucyBhIGhlbG0gY2hhcnRcbiAgICByZXR1cm4gbW9kdWxlQ29uZmlnXG4gIH0sXG5cbiAgZ2V0QnVpbGRTdGF0dXM6IGdldEdlbmVyaWNNb2R1bGVCdWlsZFN0YXR1cyxcbiAgYnVpbGQsXG4gIGdldFNlcnZpY2VTdGF0dXMsXG5cbiAgYXN5bmMgZGVwbG95U2VydmljZShcbiAgICB7IGN0eCwgbW9kdWxlLCBzZXJ2aWNlLCBsb2dFbnRyeSB9OiBEZXBsb3lTZXJ2aWNlUGFyYW1zPEhlbG1Nb2R1bGU+LFxuICApOiBQcm9taXNlPFNlcnZpY2VTdGF0dXM+IHtcbiAgICBjb25zdCBwcm92aWRlciA9IGN0eC5wcm92aWRlclxuICAgIGNvbnN0IGNoYXJ0UGF0aCA9IGF3YWl0IGdldENoYXJ0UGF0aChtb2R1bGUpXG4gICAgY29uc3QgdmFsdWVzUGF0aCA9IGdldFZhbHVlc1BhdGgoY2hhcnRQYXRoKVxuICAgIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcbiAgICBjb25zdCByZWxlYXNlTmFtZSA9IGdldFJlbGVhc2VOYW1lKG5hbWVzcGFjZSwgc2VydmljZSlcblxuICAgIGNvbnN0IHJlbGVhc2VTdGF0dXMgPSBhd2FpdCBnZXRSZWxlYXNlU3RhdHVzKGN0eC5wcm92aWRlciwgcmVsZWFzZU5hbWUpXG5cbiAgICBpZiAocmVsZWFzZVN0YXR1cy5zdGF0ZSA9PT0gXCJtaXNzaW5nXCIpIHtcbiAgICAgIGF3YWl0IGhlbG0ocHJvdmlkZXIsXG4gICAgICAgIFwiaW5zdGFsbFwiLCBjaGFydFBhdGgsXG4gICAgICAgIFwiLS1uYW1lXCIsIHJlbGVhc2VOYW1lLFxuICAgICAgICBcIi0tbmFtZXNwYWNlXCIsIG5hbWVzcGFjZSxcbiAgICAgICAgXCItLXZhbHVlc1wiLCB2YWx1ZXNQYXRoLFxuICAgICAgICBcIi0td2FpdFwiLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCBoZWxtKHByb3ZpZGVyLFxuICAgICAgICBcInVwZ3JhZGVcIiwgcmVsZWFzZU5hbWUsIGNoYXJ0UGF0aCxcbiAgICAgICAgXCItLW5hbWVzcGFjZVwiLCBuYW1lc3BhY2UsXG4gICAgICAgIFwiLS12YWx1ZXNcIiwgdmFsdWVzUGF0aCxcbiAgICAgICAgXCItLXdhaXRcIixcbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBvYmplY3RzID0gYXdhaXQgZ2V0Q2hhcnRPYmplY3RzKGN0eCwgc2VydmljZSlcbiAgICBhd2FpdCB3YWl0Rm9yT2JqZWN0cyh7IGN0eCwgcHJvdmlkZXIsIHNlcnZpY2UsIG9iamVjdHMsIGxvZ0VudHJ5IH0pXG5cbiAgICByZXR1cm4ge31cbiAgfSxcblxuICBhc3luYyBkZWxldGVTZXJ2aWNlKHBhcmFtczogRGVsZXRlU2VydmljZVBhcmFtcyk6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICAgIGNvbnN0IHsgY3R4LCBsb2dFbnRyeSwgc2VydmljZSB9ID0gcGFyYW1zXG4gICAgY29uc3QgbmFtZXNwYWNlID0gYXdhaXQgZ2V0QXBwTmFtZXNwYWNlKGN0eCwgY3R4LnByb3ZpZGVyKVxuICAgIGNvbnN0IHJlbGVhc2VOYW1lID0gZ2V0UmVsZWFzZU5hbWUobmFtZXNwYWNlLCBzZXJ2aWNlKVxuICAgIGF3YWl0IGhlbG0oY3R4LnByb3ZpZGVyLCBcImRlbGV0ZVwiLCBcIi0tcHVyZ2VcIiwgcmVsZWFzZU5hbWUpXG4gICAgbG9nRW50cnkgJiYgbG9nRW50cnkuc2V0U3VjY2VzcyhcIlNlcnZpY2UgZGVsZXRlZFwiKVxuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNlcnZpY2VTdGF0dXMocGFyYW1zKVxuICB9LFxufVxuXG5hc3luYyBmdW5jdGlvbiBidWlsZCh7IGN0eCwgbW9kdWxlLCBsb2dFbnRyeSB9OiBCdWlsZE1vZHVsZVBhcmFtczxIZWxtTW9kdWxlPik6IFByb21pc2U8QnVpbGRSZXN1bHQ+IHtcbiAgY29uc3QgYnVpbGRQYXRoID0gbW9kdWxlLmJ1aWxkUGF0aFxuICBjb25zdCBjb25maWcgPSBtb2R1bGVcblxuICAvLyBmZXRjaCB0aGUgY2hhcnRcbiAgY29uc3QgZmV0Y2hBcmdzID0gW1xuICAgIFwiZmV0Y2hcIiwgY29uZmlnLnNwZWMuY2hhcnQsXG4gICAgXCItLWRlc3RpbmF0aW9uXCIsIGJ1aWxkUGF0aCxcbiAgICBcIi0tdW50YXJcIixcbiAgXVxuICBpZiAoY29uZmlnLnNwZWMudmVyc2lvbikge1xuICAgIGZldGNoQXJncy5wdXNoKFwiLS12ZXJzaW9uXCIsIGNvbmZpZy5zcGVjLnZlcnNpb24pXG4gIH1cbiAgaWYgKGNvbmZpZy5zcGVjLnJlcG8pIHtcbiAgICBmZXRjaEFyZ3MucHVzaChcIi0tcmVwb1wiLCBjb25maWcuc3BlYy5yZXBvKVxuICB9XG4gIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LnNldFN0YXRlKFwiRmV0Y2hpbmcgY2hhcnQuLi5cIilcbiAgYXdhaXQgaGVsbShjdHgucHJvdmlkZXIsIC4uLmZldGNoQXJncylcblxuICBjb25zdCBjaGFydFBhdGggPSBhd2FpdCBnZXRDaGFydFBhdGgobW9kdWxlKVxuXG4gIC8vIGNyZWF0ZSB0aGUgdmFsdWVzLnltbCBmaWxlIChtZXJnZSB0aGUgY29uZmlndXJlZCBwYXJhbWV0ZXJzIGludG8gdGhlIGRlZmF1bHQgdmFsdWVzKVxuICBsb2dFbnRyeSAmJiBsb2dFbnRyeS5zZXRTdGF0ZShcIlByZXBhcmluZyBjaGFydC4uLlwiKVxuICBjb25zdCB2YWx1ZXMgPSBzYWZlTG9hZChhd2FpdCBoZWxtKGN0eC5wcm92aWRlciwgXCJpbnNwZWN0XCIsIFwidmFsdWVzXCIsIGNoYXJ0UGF0aCkpIHx8IHt9XG5cbiAgT2JqZWN0LmVudHJpZXMoZmxhdHRlblZhbHVlcyhjb25maWcuc3BlYy5wYXJhbWV0ZXJzKSlcbiAgICAubWFwKChbaywgdl0pID0+IHNldCh2YWx1ZXMsIGssIHYpKVxuXG4gIGNvbnN0IHZhbHVlc1BhdGggPSBnZXRWYWx1ZXNQYXRoKGNoYXJ0UGF0aClcbiAgYXdhaXQgZHVtcFlhbWwodmFsdWVzUGF0aCwgdmFsdWVzKVxuXG4gIC8vIGtlZXAgdHJhY2sgb2Ygd2hpY2ggdmVyc2lvbiBoYXMgYmVlbiBidWlsdFxuICBjb25zdCBidWlsZFZlcnNpb25GaWxlUGF0aCA9IGpvaW4oYnVpbGRQYXRoLCBHQVJERU5fQlVJTERfVkVSU0lPTl9GSUxFTkFNRSlcbiAgY29uc3QgdmVyc2lvbiA9IG1vZHVsZS52ZXJzaW9uXG4gIGF3YWl0IHdyaXRlVHJlZVZlcnNpb25GaWxlKGJ1aWxkVmVyc2lvbkZpbGVQYXRoLCB7XG4gICAgbGF0ZXN0Q29tbWl0OiB2ZXJzaW9uLnZlcnNpb25TdHJpbmcsXG4gICAgZGlydHlUaW1lc3RhbXA6IHZlcnNpb24uZGlydHlUaW1lc3RhbXAsXG4gIH0pXG5cbiAgcmV0dXJuIHsgZnJlc2g6IHRydWUgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaGVsbShwcm92aWRlcjogS3ViZXJuZXRlc1Byb3ZpZGVyLCAuLi5hcmdzOiBzdHJpbmdbXSkge1xuICByZXR1cm4gZXhlY2Euc3Rkb3V0KFwiaGVsbVwiLCBbXG4gICAgXCItLWt1YmUtY29udGV4dFwiLCBwcm92aWRlci5jb25maWcuY29udGV4dCxcbiAgICAuLi5hcmdzLFxuICBdKVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRDaGFydFBhdGgobW9kdWxlOiBIZWxtTW9kdWxlKSB7XG4gIGNvbnN0IHNwbGl0TmFtZSA9IG1vZHVsZS5zcGVjLmNoYXJ0LnNwbGl0KFwiL1wiKVxuICBjb25zdCBjaGFydERpciA9IHNwbGl0TmFtZVtzcGxpdE5hbWUubGVuZ3RoIC0gMV1cbiAgcmV0dXJuIGpvaW4obW9kdWxlLmJ1aWxkUGF0aCwgY2hhcnREaXIpXG59XG5cbmZ1bmN0aW9uIGdldFZhbHVlc1BhdGgoY2hhcnRQYXRoOiBzdHJpbmcpIHtcbiAgcmV0dXJuIGpvaW4oY2hhcnRQYXRoLCBcImdhcmRlbi12YWx1ZXMueW1sXCIpXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldENoYXJ0T2JqZWN0cyhjdHg6IFBsdWdpbkNvbnRleHQsIHNlcnZpY2U6IFNlcnZpY2UpIHtcbiAgY29uc3QgY2hhcnRQYXRoID0gYXdhaXQgZ2V0Q2hhcnRQYXRoKHNlcnZpY2UubW9kdWxlKVxuICBjb25zdCB2YWx1ZXNQYXRoID0gZ2V0VmFsdWVzUGF0aChjaGFydFBhdGgpXG4gIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcbiAgY29uc3QgcmVsZWFzZU5hbWUgPSBnZXRSZWxlYXNlTmFtZShuYW1lc3BhY2UsIHNlcnZpY2UpXG5cbiAgY29uc3Qgb2JqZWN0cyA9IDxLdWJlcm5ldGVzT2JqZWN0W10+c2FmZUxvYWRBbGwoYXdhaXQgaGVsbShjdHgucHJvdmlkZXIsXG4gICAgXCJ0ZW1wbGF0ZVwiLFxuICAgIFwiLS1uYW1lXCIsIHJlbGVhc2VOYW1lLFxuICAgIFwiLS1uYW1lc3BhY2VcIiwgbmFtZXNwYWNlLFxuICAgIFwiLS12YWx1ZXNcIiwgdmFsdWVzUGF0aCxcbiAgICBjaGFydFBhdGgsXG4gICkpXG5cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT09IG51bGwpLm1hcCgob2JqKSA9PiB7XG4gICAgaWYgKCFvYmoubWV0YWRhdGEuYW5ub3RhdGlvbnMpIHtcbiAgICAgIG9iai5tZXRhZGF0YS5hbm5vdGF0aW9ucyA9IHt9XG4gICAgfVxuICAgIHJldHVybiBvYmpcbiAgfSlcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0U2VydmljZVN0YXR1cyhcbiAgeyBjdHgsIHNlcnZpY2UsIG1vZHVsZSwgbG9nRW50cnkgfTogR2V0U2VydmljZVN0YXR1c1BhcmFtczxIZWxtTW9kdWxlPixcbik6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICAvLyBuZWVkIHRvIGJ1aWxkIHRvIGJlIGFibGUgdG8gY2hlY2sgdGhlIHN0YXR1c1xuICBjb25zdCBidWlsZFN0YXR1cyA9IGF3YWl0IGdldEdlbmVyaWNNb2R1bGVCdWlsZFN0YXR1cyh7IGN0eCwgbW9kdWxlLCBsb2dFbnRyeSB9KVxuICBpZiAoIWJ1aWxkU3RhdHVzLnJlYWR5KSB7XG4gICAgYXdhaXQgYnVpbGQoeyBjdHgsIG1vZHVsZSwgbG9nRW50cnkgfSlcbiAgfVxuXG4gIC8vIGZpcnN0IGNoZWNrIGlmIHRoZSBpbnN0YWxsZWQgb2JqZWN0cyBvbiB0aGUgY2x1c3RlciBtYXRjaCB0aGUgY3VycmVudCBjb2RlXG4gIGNvbnN0IG9iamVjdHMgPSBhd2FpdCBnZXRDaGFydE9iamVjdHMoY3R4LCBzZXJ2aWNlKVxuICBjb25zdCBtYXRjaGVkID0gYXdhaXQgY29tcGFyZURlcGxveWVkT2JqZWN0cyhjdHgsIG9iamVjdHMpXG5cbiAgaWYgKCFtYXRjaGVkKSB7XG4gICAgcmV0dXJuIHsgc3RhdGU6IFwib3V0ZGF0ZWRcIiB9XG4gIH1cblxuICAvLyB0aGVuIGNoZWNrIGlmIHRoZSByb2xsb3V0IGlzIGNvbXBsZXRlXG4gIGNvbnN0IHZlcnNpb24gPSBtb2R1bGUudmVyc2lvblxuICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShjdHgucHJvdmlkZXIpXG4gIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcbiAgY29uc3QgeyByZWFkeSB9ID0gYXdhaXQgY2hlY2tPYmplY3RTdGF0dXMoYXBpLCBuYW1lc3BhY2UsIG9iamVjdHMpXG5cbiAgLy8gVE9ETzogc2V0IHN0YXRlIHRvIFwidW5oZWFsdGh5XCIgaWYgYW55IHN0YXR1cyBpcyBcInVuaGVhbHRoeVwiXG4gIGNvbnN0IHN0YXRlID0gcmVhZHkgPyBcInJlYWR5XCIgOiBcImRlcGxveWluZ1wiXG5cbiAgcmV0dXJuIHsgc3RhdGUsIHZlcnNpb246IHZlcnNpb24udmVyc2lvblN0cmluZyB9XG59XG5cbmZ1bmN0aW9uIGdldFJlbGVhc2VOYW1lKG5hbWVzcGFjZTogc3RyaW5nLCBzZXJ2aWNlOiBTZXJ2aWNlKSB7XG4gIHJldHVybiBgJHtuYW1lc3BhY2V9LS0ke3NlcnZpY2UubmFtZX1gXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFJlbGVhc2VTdGF0dXMocHJvdmlkZXI6IEt1YmVybmV0ZXNQcm92aWRlciwgcmVsZWFzZU5hbWU6IHN0cmluZyk6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IEpTT04ucGFyc2UoYXdhaXQgaGVsbShwcm92aWRlciwgXCJzdGF0dXNcIiwgcmVsZWFzZU5hbWUsIFwiLS1vdXRwdXRcIiwgXCJqc29uXCIpKVxuICAgIGNvbnN0IHN0YXR1c0NvZGUgPSByZXMuaW5mby5zdGF0dXMuY29kZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0ZTogaGVsbVN0YXR1c0NvZGVNYXBbc3RhdHVzQ29kZV0sXG4gICAgICBkZXRhaWw6IHJlcyxcbiAgICB9XG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvLyByZWxlYXNlIGRvZXNuJ3QgZXhpc3RcbiAgICByZXR1cm4geyBzdGF0ZTogXCJtaXNzaW5nXCIgfVxuICB9XG59XG5cbi8vIGFkYXB0ZWQgZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wZW5ndWluYm95Lzc2MjE5N1xuZnVuY3Rpb24gZmxhdHRlblZhbHVlcyhvYmplY3QsIHByZWZpeCA9IFwiXCIpIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iamVjdCkucmVkdWNlKFxuICAgIChwcmV2LCBlbGVtZW50KSA9PlxuICAgICAgb2JqZWN0W2VsZW1lbnRdICYmIHR5cGVvZiBvYmplY3RbZWxlbWVudF0gPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkob2JqZWN0W2VsZW1lbnRdKVxuICAgICAgICA/IHsgLi4ucHJldiwgLi4uZmxhdHRlblZhbHVlcyhvYmplY3RbZWxlbWVudF0sIGAke3ByZWZpeH0ke2VsZW1lbnR9LmApIH1cbiAgICAgICAgOiB7IC4uLnByZXYsIC4uLnsgW2Ake3ByZWZpeH0ke2VsZW1lbnR9YF06IG9iamVjdFtlbGVtZW50XSB9IH0sXG4gICAge30sXG4gIClcbn1cbiJdfQ==
