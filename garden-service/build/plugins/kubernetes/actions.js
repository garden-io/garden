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
const split = require("split");
const moment = require("moment");
const exceptions_1 = require("../../exceptions");
const container_1 = require("../container");
const util_1 = require("../../util/util");
const api_1 = require("./api");
const namespace_1 = require("./namespace");
const kubectl_1 = require("./kubectl");
const constants_1 = require("../../constants");
const deployment_1 = require("./deployment");
function validate(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = yield container_1.validateContainerModule(params);
        // validate ingress specs
        const provider = params.ctx.provider;
        for (const serviceConfig of config.serviceConfigs) {
            for (const ingressSpec of serviceConfig.spec.ingresses) {
                const hostname = ingressSpec.hostname || provider.config.defaultHostname;
                if (!hostname) {
                    throw new exceptions_1.ConfigurationError(`No hostname configured for one of the ingresses on service ${serviceConfig.name}. ` +
                        `Please configure a default hostname or specify a hostname for the ingress.`, {
                        serviceName: serviceConfig.name,
                        ingressSpec,
                    });
                }
                // make sure the hostname is set
                ingressSpec.hostname = hostname;
            }
        }
    });
}
exports.validate = validate;
function deleteService(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ctx, logEntry, service } = params;
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const provider = ctx.provider;
        yield deployment_1.deleteContainerService({ provider, namespace, serviceName: service.name, logEntry });
        return deployment_1.getContainerServiceStatus(params);
    });
}
exports.deleteService = deleteService;
function getServiceOutputs({ service }) {
    return __awaiter(this, void 0, void 0, function* () {
        return {
            host: service.name,
        };
    });
}
exports.getServiceOutputs = getServiceOutputs;
function execInService(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { ctx, service, command } = params;
        const api = new api_1.KubeApi(ctx.provider);
        const status = yield deployment_1.getContainerServiceStatus(params);
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        // TODO: this check should probably live outside of the plugin
        if (!status.state || status.state !== "ready") {
            throw new exceptions_1.DeploymentError(`Service ${service.name} is not running`, {
                name: service.name,
                state: status.state,
            });
        }
        // get a running pod
        // NOTE: the awkward function signature called out here: https://github.com/kubernetes-client/javascript/issues/53
        const podsRes = yield api.core.listNamespacedPod(namespace, undefined, undefined, undefined, undefined, `service=${service.name}`);
        const pod = podsRes.body.items[0];
        if (!pod) {
            // This should not happen because of the prior status check, but checking to be sure
            throw new exceptions_1.DeploymentError(`Could not find running pod for ${service.name}`, {
                serviceName: service.name,
            });
        }
        // exec in the pod via kubectl
        const kubecmd = ["exec", "-it", pod.metadata.name, "--", ...command];
        const res = yield kubectl_1.kubectl(api.context, namespace).tty(kubecmd, {
            ignoreError: true,
            silent: false,
            timeout: 999999,
            tty: true,
        });
        return { code: res.code, output: res.output };
    });
}
exports.execInService = execInService;
function runModule({ ctx, module, command, interactive, runtimeContext, silent, timeout }) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = ctx.provider.config.context;
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const envArgs = Object.entries(runtimeContext.envVars).map(([k, v]) => `--env=${k}=${v}`);
        const commandStr = command.join(" ");
        const image = yield container_1.helpers.getLocalImageId(module);
        const version = module.version;
        const opts = [
            `--image=${image}`,
            "--restart=Never",
            "--command",
            "--tty",
            "--rm",
            "-i",
            "--quiet",
        ];
        const kubecmd = [
            "run", `run-${module.name}-${Math.round(new Date().getTime())}`,
            ...opts,
            ...envArgs,
            "--",
            "/bin/sh",
            "-c",
            commandStr,
        ];
        const startedAt = new Date();
        const res = yield kubectl_1.kubectl(context, namespace).tty(kubecmd, {
            ignoreError: true,
            silent: !interactive || silent,
            timeout,
            tty: interactive,
        });
        return {
            moduleName: module.name,
            command,
            version,
            success: res.code === 0,
            startedAt,
            completedAt: new Date(),
            output: res.output,
        };
    });
}
exports.runModule = runModule;
function runService({ ctx, service, interactive, runtimeContext, silent, timeout, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        return runModule({
            ctx,
            module: service.module,
            command: service.spec.command || [],
            interactive,
            runtimeContext,
            silent,
            timeout,
            logEntry,
        });
    });
}
exports.runService = runService;
function testModule({ ctx, interactive, module, runtimeContext, silent, testConfig, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const testName = testConfig.name;
        const command = testConfig.spec.command;
        runtimeContext.envVars = Object.assign({}, runtimeContext.envVars, testConfig.spec.env);
        const timeout = testConfig.timeout || constants_1.DEFAULT_TEST_TIMEOUT;
        const result = yield runModule({
            ctx,
            module,
            command,
            interactive,
            runtimeContext,
            silent,
            timeout,
            logEntry,
        });
        const api = new api_1.KubeApi(ctx.provider);
        // store test result
        const testResult = Object.assign({}, result, { testName });
        const ns = yield namespace_1.getMetadataNamespace(ctx, ctx.provider);
        const resultKey = getTestResultKey(module, testName, result.version);
        const body = {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
                name: resultKey,
                annotations: {
                    "garden.io/generated": "true",
                },
            },
            data: util_1.serializeValues(testResult),
        };
        try {
            yield api.core.createNamespacedConfigMap(ns, body);
        }
        catch (err) {
            if (err.code === 409) {
                yield api.core.patchNamespacedConfigMap(resultKey, ns, body);
            }
            else {
                throw err;
            }
        }
        return testResult;
    });
}
exports.testModule = testModule;
function getTestResult({ ctx, module, testName, version }) {
    return __awaiter(this, void 0, void 0, function* () {
        const api = new api_1.KubeApi(ctx.provider);
        const ns = yield namespace_1.getMetadataNamespace(ctx, ctx.provider);
        const resultKey = getTestResultKey(module, testName, version);
        try {
            const res = yield api.core.readNamespacedConfigMap(resultKey, ns);
            return util_1.deserializeValues(res.body.data);
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
exports.getTestResult = getTestResult;
function getServiceLogs({ ctx, service, stream, tail }) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = ctx.provider.config.context;
        const resourceType = service.spec.daemon ? "daemonset" : "deployment";
        const kubectlArgs = ["logs", `${resourceType}/${service.name}`, "--timestamps=true"];
        if (tail) {
            kubectlArgs.push("--follow");
        }
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const proc = kubectl_1.kubectl(context, namespace).spawn(kubectlArgs);
        let timestamp;
        proc.stdout
            .pipe(split())
            .on("data", (s) => {
            if (!s) {
                return;
            }
            const [timestampStr, msg] = util_1.splitFirst(s, " ");
            try {
                timestamp = moment(timestampStr).toDate();
            }
            catch (_a) { }
            void stream.write({ serviceName: service.name, timestamp, msg });
        });
        proc.stderr.pipe(process.stderr);
        return new Promise((resolve, reject) => {
            proc.on("error", reject);
            proc.on("exit", () => {
                resolve({});
            });
        });
    });
}
exports.getServiceLogs = getServiceLogs;
function getTestResultKey(module, testName, version) {
    return `test-result--${module.name}--${testName}--${version.versionString}`;
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9hY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCwrQkFBOEI7QUFDOUIsaUNBQWlDO0FBRWpDLGlEQUFzRTtBQWF0RSw0Q0FBZ0Y7QUFDaEYsMENBQWdGO0FBQ2hGLCtCQUErQjtBQUMvQiwyQ0FBbUU7QUFDbkUsdUNBQW1DO0FBQ25DLCtDQUFzRDtBQUV0RCw2Q0FBZ0Y7QUFJaEYsU0FBc0IsUUFBUSxDQUFDLE1BQTZDOztRQUMxRSxNQUFNLE1BQU0sR0FBRyxNQUFNLG1DQUF1QixDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBRXBELHlCQUF5QjtRQUN6QixNQUFNLFFBQVEsR0FBdUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUE7UUFFeEQsS0FBSyxNQUFNLGFBQWEsSUFBSSxNQUFNLENBQUMsY0FBYyxFQUFFO1lBQ2pELEtBQUssTUFBTSxXQUFXLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7Z0JBQ3RELE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUE7Z0JBRXhFLElBQUksQ0FBQyxRQUFRLEVBQUU7b0JBQ2IsTUFBTSxJQUFJLCtCQUFrQixDQUMxQiw4REFBOEQsYUFBYSxDQUFDLElBQUksSUFBSTt3QkFDcEYsNEVBQTRFLEVBQzVFO3dCQUNFLFdBQVcsRUFBRSxhQUFhLENBQUMsSUFBSTt3QkFDL0IsV0FBVztxQkFDWixDQUNGLENBQUE7aUJBQ0Y7Z0JBRUQsZ0NBQWdDO2dCQUNoQyxXQUFXLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQTthQUNoQztTQUNGO0lBQ0gsQ0FBQztDQUFBO0FBekJELDRCQXlCQztBQUVELFNBQXNCLGFBQWEsQ0FBQyxNQUEyQjs7UUFDN0QsTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLEdBQUcsTUFBTSxDQUFB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LEVBQUU7Z0JBQ25CLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUNiLENBQUMsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDO0NBQUE7QUF0Q0Qsd0NBc0NDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxNQUF1QixFQUFFLFFBQWdCLEVBQUUsT0FBc0I7SUFDekYsT0FBTyxnQkFBZ0IsTUFBTSxDQUFDLElBQUksS0FBSyxRQUFRLEtBQUssT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFBO0FBQzdFLENBQUMiLCJmaWxlIjoicGx1Z2lucy9rdWJlcm5ldGVzL2FjdGlvbnMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgc3BsaXQgZnJvbSBcInNwbGl0XCJcbmltcG9ydCBtb21lbnQgPSByZXF1aXJlKFwibW9tZW50XCIpXG5cbmltcG9ydCB7IERlcGxveW1lbnRFcnJvciwgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgR2V0U2VydmljZUxvZ3NSZXN1bHQsIFJ1blJlc3VsdCwgVGVzdFJlc3VsdCB9IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQge1xuICBFeGVjSW5TZXJ2aWNlUGFyYW1zLFxuICBHZXRTZXJ2aWNlTG9nc1BhcmFtcyxcbiAgR2V0U2VydmljZU91dHB1dHNQYXJhbXMsXG4gIEdldFRlc3RSZXN1bHRQYXJhbXMsXG4gIFJ1bk1vZHVsZVBhcmFtcyxcbiAgVGVzdE1vZHVsZVBhcmFtcyxcbiAgRGVsZXRlU2VydmljZVBhcmFtcyxcbiAgUnVuU2VydmljZVBhcmFtcyxcbn0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9wYXJhbXNcIlxuaW1wb3J0IHsgTW9kdWxlVmVyc2lvbiB9IGZyb20gXCIuLi8uLi92Y3MvYmFzZVwiXG5pbXBvcnQgeyBDb250YWluZXJNb2R1bGUsIGhlbHBlcnMsIHZhbGlkYXRlQ29udGFpbmVyTW9kdWxlIH0gZnJvbSBcIi4uL2NvbnRhaW5lclwiXG5pbXBvcnQgeyBkZXNlcmlhbGl6ZVZhbHVlcywgc2VyaWFsaXplVmFsdWVzLCBzcGxpdEZpcnN0IH0gZnJvbSBcIi4uLy4uL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBLdWJlQXBpIH0gZnJvbSBcIi4vYXBpXCJcbmltcG9ydCB7IGdldEFwcE5hbWVzcGFjZSwgZ2V0TWV0YWRhdGFOYW1lc3BhY2UgfSBmcm9tIFwiLi9uYW1lc3BhY2VcIlxuaW1wb3J0IHsga3ViZWN0bCB9IGZyb20gXCIuL2t1YmVjdGxcIlxuaW1wb3J0IHsgREVGQVVMVF9URVNUX1RJTUVPVVQgfSBmcm9tIFwiLi4vLi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IEt1YmVybmV0ZXNQcm92aWRlciB9IGZyb20gXCIuL2t1YmVybmV0ZXNcIlxuaW1wb3J0IHsgZGVsZXRlQ29udGFpbmVyU2VydmljZSwgZ2V0Q29udGFpbmVyU2VydmljZVN0YXR1cyB9IGZyb20gXCIuL2RlcGxveW1lbnRcIlxuaW1wb3J0IHsgU2VydmljZVN0YXR1cyB9IGZyb20gXCIuLi8uLi90eXBlcy9zZXJ2aWNlXCJcbmltcG9ydCB7IFZhbGlkYXRlTW9kdWxlUGFyYW1zIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3BsdWdpbi9wYXJhbXNcIlxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGUocGFyYW1zOiBWYWxpZGF0ZU1vZHVsZVBhcmFtczxDb250YWluZXJNb2R1bGU+KSB7XG4gIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHZhbGlkYXRlQ29udGFpbmVyTW9kdWxlKHBhcmFtcylcblxuICAvLyB2YWxpZGF0ZSBpbmdyZXNzIHNwZWNzXG4gIGNvbnN0IHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIgPSBwYXJhbXMuY3R4LnByb3ZpZGVyXG5cbiAgZm9yIChjb25zdCBzZXJ2aWNlQ29uZmlnIG9mIGNvbmZpZy5zZXJ2aWNlQ29uZmlncykge1xuICAgIGZvciAoY29uc3QgaW5ncmVzc1NwZWMgb2Ygc2VydmljZUNvbmZpZy5zcGVjLmluZ3Jlc3Nlcykge1xuICAgICAgY29uc3QgaG9zdG5hbWUgPSBpbmdyZXNzU3BlYy5ob3N0bmFtZSB8fCBwcm92aWRlci5jb25maWcuZGVmYXVsdEhvc3RuYW1lXG5cbiAgICAgIGlmICghaG9zdG5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IENvbmZpZ3VyYXRpb25FcnJvcihcbiAgICAgICAgICBgTm8gaG9zdG5hbWUgY29uZmlndXJlZCBmb3Igb25lIG9mIHRoZSBpbmdyZXNzZXMgb24gc2VydmljZSAke3NlcnZpY2VDb25maWcubmFtZX0uIGAgK1xuICAgICAgICAgIGBQbGVhc2UgY29uZmlndXJlIGEgZGVmYXVsdCBob3N0bmFtZSBvciBzcGVjaWZ5IGEgaG9zdG5hbWUgZm9yIHRoZSBpbmdyZXNzLmAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgc2VydmljZU5hbWU6IHNlcnZpY2VDb25maWcubmFtZSxcbiAgICAgICAgICAgIGluZ3Jlc3NTcGVjLFxuICAgICAgICAgIH0sXG4gICAgICAgIClcbiAgICAgIH1cblxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSBob3N0bmFtZSBpcyBzZXRcbiAgICAgIGluZ3Jlc3NTcGVjLmhvc3RuYW1lID0gaG9zdG5hbWVcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZVNlcnZpY2UocGFyYW1zOiBEZWxldGVTZXJ2aWNlUGFyYW1zKTogUHJvbWlzZTxTZXJ2aWNlU3RhdHVzPiB7XG4gIGNvbnN0IHsgY3R4LCBsb2dFbnRyeSwgc2VydmljZSB9ID0gcGFyYW1zXG4gIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcbiAgY29uc3QgcHJvdmlkZXIgPSBjdHgucHJvdmlkZXJcblxuICBhd2FpdCBkZWxldGVDb250YWluZXJTZXJ2aWNlKFxuICAgIHsgcHJvdmlkZXIsIG5hbWVzcGFjZSwgc2VydmljZU5hbWU6IHNlcnZpY2UubmFtZSwgbG9nRW50cnkgfSlcblxuICByZXR1cm4gZ2V0Q29udGFpbmVyU2VydmljZVN0YXR1cyhwYXJhbXMpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTZXJ2aWNlT3V0cHV0cyh7IHNlcnZpY2UgfTogR2V0U2VydmljZU91dHB1dHNQYXJhbXM8Q29udGFpbmVyTW9kdWxlPikge1xuICByZXR1cm4ge1xuICAgIGhvc3Q6IHNlcnZpY2UubmFtZSxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZXhlY0luU2VydmljZShwYXJhbXM6IEV4ZWNJblNlcnZpY2VQYXJhbXM8Q29udGFpbmVyTW9kdWxlPikge1xuICBjb25zdCB7IGN0eCwgc2VydmljZSwgY29tbWFuZCB9ID0gcGFyYW1zXG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKGN0eC5wcm92aWRlcilcbiAgY29uc3Qgc3RhdHVzID0gYXdhaXQgZ2V0Q29udGFpbmVyU2VydmljZVN0YXR1cyhwYXJhbXMpXG4gIGNvbnN0IG5hbWVzcGFjZSA9IGF3YWl0IGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlcilcblxuICAvLyBUT0RPOiB0aGlzIGNoZWNrIHNob3VsZCBwcm9iYWJseSBsaXZlIG91dHNpZGUgb2YgdGhlIHBsdWdpblxuICBpZiAoIXN0YXR1cy5zdGF0ZSB8fCBzdGF0dXMuc3RhdGUgIT09IFwicmVhZHlcIikge1xuICAgIHRocm93IG5ldyBEZXBsb3ltZW50RXJyb3IoYFNlcnZpY2UgJHtzZXJ2aWNlLm5hbWV9IGlzIG5vdCBydW5uaW5nYCwge1xuICAgICAgbmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgc3RhdGU6IHN0YXR1cy5zdGF0ZSxcbiAgICB9KVxuICB9XG5cbiAgLy8gZ2V0IGEgcnVubmluZyBwb2RcbiAgLy8gTk9URTogdGhlIGF3a3dhcmQgZnVuY3Rpb24gc2lnbmF0dXJlIGNhbGxlZCBvdXQgaGVyZTogaHR0cHM6Ly9naXRodWIuY29tL2t1YmVybmV0ZXMtY2xpZW50L2phdmFzY3JpcHQvaXNzdWVzLzUzXG4gIGNvbnN0IHBvZHNSZXMgPSBhd2FpdCBhcGkuY29yZS5saXN0TmFtZXNwYWNlZFBvZChcbiAgICBuYW1lc3BhY2UsXG4gICAgdW5kZWZpbmVkLFxuICAgIHVuZGVmaW5lZCxcbiAgICB1bmRlZmluZWQsXG4gICAgdW5kZWZpbmVkLFxuICAgIGBzZXJ2aWNlPSR7c2VydmljZS5uYW1lfWAsXG4gIClcbiAgY29uc3QgcG9kID0gcG9kc1Jlcy5ib2R5Lml0ZW1zWzBdXG5cbiAgaWYgKCFwb2QpIHtcbiAgICAvLyBUaGlzIHNob3VsZCBub3QgaGFwcGVuIGJlY2F1c2Ugb2YgdGhlIHByaW9yIHN0YXR1cyBjaGVjaywgYnV0IGNoZWNraW5nIHRvIGJlIHN1cmVcbiAgICB0aHJvdyBuZXcgRGVwbG95bWVudEVycm9yKGBDb3VsZCBub3QgZmluZCBydW5uaW5nIHBvZCBmb3IgJHtzZXJ2aWNlLm5hbWV9YCwge1xuICAgICAgc2VydmljZU5hbWU6IHNlcnZpY2UubmFtZSxcbiAgICB9KVxuICB9XG5cbiAgLy8gZXhlYyBpbiB0aGUgcG9kIHZpYSBrdWJlY3RsXG4gIGNvbnN0IGt1YmVjbWQgPSBbXCJleGVjXCIsIFwiLWl0XCIsIHBvZC5tZXRhZGF0YS5uYW1lLCBcIi0tXCIsIC4uLmNvbW1hbmRdXG4gIGNvbnN0IHJlcyA9IGF3YWl0IGt1YmVjdGwoYXBpLmNvbnRleHQsIG5hbWVzcGFjZSkudHR5KGt1YmVjbWQsIHtcbiAgICBpZ25vcmVFcnJvcjogdHJ1ZSxcbiAgICBzaWxlbnQ6IGZhbHNlLFxuICAgIHRpbWVvdXQ6IDk5OTk5OSxcbiAgICB0dHk6IHRydWUsXG4gIH0pXG5cbiAgcmV0dXJuIHsgY29kZTogcmVzLmNvZGUsIG91dHB1dDogcmVzLm91dHB1dCB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5Nb2R1bGUoXG4gIHsgY3R4LCBtb2R1bGUsIGNvbW1hbmQsIGludGVyYWN0aXZlLCBydW50aW1lQ29udGV4dCwgc2lsZW50LCB0aW1lb3V0IH06IFJ1bk1vZHVsZVBhcmFtczxDb250YWluZXJNb2R1bGU+LFxuKTogUHJvbWlzZTxSdW5SZXN1bHQ+IHtcbiAgY29uc3QgY29udGV4dCA9IGN0eC5wcm92aWRlci5jb25maWcuY29udGV4dFxuICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBjdHgucHJvdmlkZXIpXG5cbiAgY29uc3QgZW52QXJncyA9IE9iamVjdC5lbnRyaWVzKHJ1bnRpbWVDb250ZXh0LmVudlZhcnMpLm1hcCgoW2ssIHZdKSA9PiBgLS1lbnY9JHtrfT0ke3Z9YClcblxuICBjb25zdCBjb21tYW5kU3RyID0gY29tbWFuZC5qb2luKFwiIFwiKVxuICBjb25zdCBpbWFnZSA9IGF3YWl0IGhlbHBlcnMuZ2V0TG9jYWxJbWFnZUlkKG1vZHVsZSlcbiAgY29uc3QgdmVyc2lvbiA9IG1vZHVsZS52ZXJzaW9uXG5cbiAgY29uc3Qgb3B0cyA9IFtcbiAgICBgLS1pbWFnZT0ke2ltYWdlfWAsXG4gICAgXCItLXJlc3RhcnQ9TmV2ZXJcIixcbiAgICBcIi0tY29tbWFuZFwiLFxuICAgIFwiLS10dHlcIixcbiAgICBcIi0tcm1cIixcbiAgICBcIi1pXCIsXG4gICAgXCItLXF1aWV0XCIsXG4gIF1cblxuICBjb25zdCBrdWJlY21kID0gW1xuICAgIFwicnVuXCIsIGBydW4tJHttb2R1bGUubmFtZX0tJHtNYXRoLnJvdW5kKG5ldyBEYXRlKCkuZ2V0VGltZSgpKX1gLFxuICAgIC4uLm9wdHMsXG4gICAgLi4uZW52QXJncyxcbiAgICBcIi0tXCIsXG4gICAgXCIvYmluL3NoXCIsXG4gICAgXCItY1wiLFxuICAgIGNvbW1hbmRTdHIsXG4gIF1cblxuICBjb25zdCBzdGFydGVkQXQgPSBuZXcgRGF0ZSgpXG5cbiAgY29uc3QgcmVzID0gYXdhaXQga3ViZWN0bChjb250ZXh0LCBuYW1lc3BhY2UpLnR0eShrdWJlY21kLCB7XG4gICAgaWdub3JlRXJyb3I6IHRydWUsXG4gICAgc2lsZW50OiAhaW50ZXJhY3RpdmUgfHwgc2lsZW50LCAvLyBzaG91bGRuJ3QgYmUgc2lsZW50IGluIGludGVyYWN0aXZlIG1vZGVcbiAgICB0aW1lb3V0LFxuICAgIHR0eTogaW50ZXJhY3RpdmUsXG4gIH0pXG5cbiAgcmV0dXJuIHtcbiAgICBtb2R1bGVOYW1lOiBtb2R1bGUubmFtZSxcbiAgICBjb21tYW5kLFxuICAgIHZlcnNpb24sXG4gICAgc3VjY2VzczogcmVzLmNvZGUgPT09IDAsXG4gICAgc3RhcnRlZEF0LFxuICAgIGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgIG91dHB1dDogcmVzLm91dHB1dCxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuU2VydmljZShcbiAgeyBjdHgsIHNlcnZpY2UsIGludGVyYWN0aXZlLCBydW50aW1lQ29udGV4dCwgc2lsZW50LCB0aW1lb3V0LCBsb2dFbnRyeSB9OlxuICAgIFJ1blNlcnZpY2VQYXJhbXM8Q29udGFpbmVyTW9kdWxlPixcbikge1xuICByZXR1cm4gcnVuTW9kdWxlKHtcbiAgICBjdHgsXG4gICAgbW9kdWxlOiBzZXJ2aWNlLm1vZHVsZSxcbiAgICBjb21tYW5kOiBzZXJ2aWNlLnNwZWMuY29tbWFuZCB8fCBbXSxcbiAgICBpbnRlcmFjdGl2ZSxcbiAgICBydW50aW1lQ29udGV4dCxcbiAgICBzaWxlbnQsXG4gICAgdGltZW91dCxcbiAgICBsb2dFbnRyeSxcbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRlc3RNb2R1bGUoXG4gIHsgY3R4LCBpbnRlcmFjdGl2ZSwgbW9kdWxlLCBydW50aW1lQ29udGV4dCwgc2lsZW50LCB0ZXN0Q29uZmlnLCBsb2dFbnRyeSB9OlxuICAgIFRlc3RNb2R1bGVQYXJhbXM8Q29udGFpbmVyTW9kdWxlPixcbik6IFByb21pc2U8VGVzdFJlc3VsdD4ge1xuICBjb25zdCB0ZXN0TmFtZSA9IHRlc3RDb25maWcubmFtZVxuICBjb25zdCBjb21tYW5kID0gdGVzdENvbmZpZy5zcGVjLmNvbW1hbmRcbiAgcnVudGltZUNvbnRleHQuZW52VmFycyA9IHsgLi4ucnVudGltZUNvbnRleHQuZW52VmFycywgLi4udGVzdENvbmZpZy5zcGVjLmVudiB9XG4gIGNvbnN0IHRpbWVvdXQgPSB0ZXN0Q29uZmlnLnRpbWVvdXQgfHwgREVGQVVMVF9URVNUX1RJTUVPVVRcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Nb2R1bGUoe1xuICAgIGN0eCxcbiAgICBtb2R1bGUsXG4gICAgY29tbWFuZCxcbiAgICBpbnRlcmFjdGl2ZSxcbiAgICBydW50aW1lQ29udGV4dCxcbiAgICBzaWxlbnQsXG4gICAgdGltZW91dCxcbiAgICBsb2dFbnRyeSxcbiAgfSlcblxuICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShjdHgucHJvdmlkZXIpXG5cbiAgLy8gc3RvcmUgdGVzdCByZXN1bHRcbiAgY29uc3QgdGVzdFJlc3VsdDogVGVzdFJlc3VsdCA9IHtcbiAgICAuLi5yZXN1bHQsXG4gICAgdGVzdE5hbWUsXG4gIH1cblxuICBjb25zdCBucyA9IGF3YWl0IGdldE1ldGFkYXRhTmFtZXNwYWNlKGN0eCwgY3R4LnByb3ZpZGVyKVxuICBjb25zdCByZXN1bHRLZXkgPSBnZXRUZXN0UmVzdWx0S2V5KG1vZHVsZSwgdGVzdE5hbWUsIHJlc3VsdC52ZXJzaW9uKVxuICBjb25zdCBib2R5ID0ge1xuICAgIGFwaVZlcnNpb246IFwidjFcIixcbiAgICBraW5kOiBcIkNvbmZpZ01hcFwiLFxuICAgIG1ldGFkYXRhOiB7XG4gICAgICBuYW1lOiByZXN1bHRLZXksXG4gICAgICBhbm5vdGF0aW9uczoge1xuICAgICAgICBcImdhcmRlbi5pby9nZW5lcmF0ZWRcIjogXCJ0cnVlXCIsXG4gICAgICB9LFxuICAgIH0sXG4gICAgZGF0YTogc2VyaWFsaXplVmFsdWVzKHRlc3RSZXN1bHQpLFxuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBhcGkuY29yZS5jcmVhdGVOYW1lc3BhY2VkQ29uZmlnTWFwKG5zLCA8YW55PmJvZHkpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuY29kZSA9PT0gNDA5KSB7XG4gICAgICBhd2FpdCBhcGkuY29yZS5wYXRjaE5hbWVzcGFjZWRDb25maWdNYXAocmVzdWx0S2V5LCBucywgYm9keSlcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRlc3RSZXN1bHRcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFRlc3RSZXN1bHQoXG4gIHsgY3R4LCBtb2R1bGUsIHRlc3ROYW1lLCB2ZXJzaW9uIH06IEdldFRlc3RSZXN1bHRQYXJhbXM8Q29udGFpbmVyTW9kdWxlPixcbikge1xuICBjb25zdCBhcGkgPSBuZXcgS3ViZUFwaShjdHgucHJvdmlkZXIpXG4gIGNvbnN0IG5zID0gYXdhaXQgZ2V0TWV0YWRhdGFOYW1lc3BhY2UoY3R4LCBjdHgucHJvdmlkZXIpXG4gIGNvbnN0IHJlc3VsdEtleSA9IGdldFRlc3RSZXN1bHRLZXkobW9kdWxlLCB0ZXN0TmFtZSwgdmVyc2lvbilcblxuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGFwaS5jb3JlLnJlYWROYW1lc3BhY2VkQ29uZmlnTWFwKHJlc3VsdEtleSwgbnMpXG4gICAgcmV0dXJuIDxUZXN0UmVzdWx0PmRlc2VyaWFsaXplVmFsdWVzKHJlcy5ib2R5LmRhdGEpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmIChlcnIuY29kZSA9PT0gNDA0KSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNlcnZpY2VMb2dzKFxuICB7IGN0eCwgc2VydmljZSwgc3RyZWFtLCB0YWlsIH06IEdldFNlcnZpY2VMb2dzUGFyYW1zPENvbnRhaW5lck1vZHVsZT4sXG4pIHtcbiAgY29uc3QgY29udGV4dCA9IGN0eC5wcm92aWRlci5jb25maWcuY29udGV4dFxuICBjb25zdCByZXNvdXJjZVR5cGUgPSBzZXJ2aWNlLnNwZWMuZGFlbW9uID8gXCJkYWVtb25zZXRcIiA6IFwiZGVwbG95bWVudFwiXG5cbiAgY29uc3Qga3ViZWN0bEFyZ3MgPSBbXCJsb2dzXCIsIGAke3Jlc291cmNlVHlwZX0vJHtzZXJ2aWNlLm5hbWV9YCwgXCItLXRpbWVzdGFtcHM9dHJ1ZVwiXVxuXG4gIGlmICh0YWlsKSB7XG4gICAga3ViZWN0bEFyZ3MucHVzaChcIi0tZm9sbG93XCIpXG4gIH1cblxuICBjb25zdCBuYW1lc3BhY2UgPSBhd2FpdCBnZXRBcHBOYW1lc3BhY2UoY3R4LCBjdHgucHJvdmlkZXIpXG4gIGNvbnN0IHByb2MgPSBrdWJlY3RsKGNvbnRleHQsIG5hbWVzcGFjZSkuc3Bhd24oa3ViZWN0bEFyZ3MpXG4gIGxldCB0aW1lc3RhbXA6IERhdGVcblxuICBwcm9jLnN0ZG91dFxuICAgIC5waXBlKHNwbGl0KCkpXG4gICAgLm9uKFwiZGF0YVwiLCAocykgPT4ge1xuICAgICAgaWYgKCFzKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgY29uc3QgW3RpbWVzdGFtcFN0ciwgbXNnXSA9IHNwbGl0Rmlyc3QocywgXCIgXCIpXG4gICAgICB0cnkge1xuICAgICAgICB0aW1lc3RhbXAgPSBtb21lbnQodGltZXN0YW1wU3RyKS50b0RhdGUoKVxuICAgICAgfSBjYXRjaCB7IH1cbiAgICAgIHZvaWQgc3RyZWFtLndyaXRlKHsgc2VydmljZU5hbWU6IHNlcnZpY2UubmFtZSwgdGltZXN0YW1wLCBtc2cgfSlcbiAgICB9KVxuXG4gIHByb2Muc3RkZXJyLnBpcGUocHJvY2Vzcy5zdGRlcnIpXG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPEdldFNlcnZpY2VMb2dzUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcHJvYy5vbihcImVycm9yXCIsIHJlamVjdClcblxuICAgIHByb2Mub24oXCJleGl0XCIsICgpID0+IHtcbiAgICAgIHJlc29sdmUoe30pXG4gICAgfSlcbiAgfSlcbn1cblxuZnVuY3Rpb24gZ2V0VGVzdFJlc3VsdEtleShtb2R1bGU6IENvbnRhaW5lck1vZHVsZSwgdGVzdE5hbWU6IHN0cmluZywgdmVyc2lvbjogTW9kdWxlVmVyc2lvbikge1xuICByZXR1cm4gYHRlc3QtcmVzdWx0LS0ke21vZHVsZS5uYW1lfS0tJHt0ZXN0TmFtZX0tLSR7dmVyc2lvbi52ZXJzaW9uU3RyaW5nfWBcbn1cbiJdfQ==
