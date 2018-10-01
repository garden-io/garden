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
const js_yaml_1 = require("js-yaml");
const Joi = require("joi");
const path_1 = require("path");
const common_1 = require("../../config/common");
const kubernetes_1 = require("./kubernetes");
const fs_extra_1 = require("fs-extra");
const os_1 = require("os");
const init_1 = require("./init");
// TODO: split this into separate plugins to handle Docker for Mac and Minikube
// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "minikube"];
const kubeConfigPath = path_1.join(os_1.homedir(), ".kube", "config");
function getKubeConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return js_yaml_1.safeLoad((yield fs_extra_1.readFile(kubeConfigPath)).toString());
        }
        catch (_a) {
            return {};
        }
    });
}
/**
 * Automatically set docker environment variables for minikube
 * TODO: it would be better to explicitly provide those to docker instead of using process.env
 */
function setMinikubeDockerEnv() {
    return __awaiter(this, void 0, void 0, function* () {
        const minikubeEnv = yield execa.stdout("minikube", ["docker-env", "--shell=bash"]);
        for (const line of minikubeEnv.split("\n")) {
            const matched = line.match(/^export (\w+)="(.+)"$/);
            if (matched) {
                process.env[matched[1]] = matched[2];
            }
        }
    });
}
const configSchema = kubernetes_1.kubernetesConfigBase
    .keys({
    ingressHostname: Joi.string()
        .description("The hostname of the cluster's ingress controller."),
    _system: Joi.any().meta({ internal: true }),
    _systemServices: Joi.array().items(Joi.string())
        .meta({ internal: true })
        .description("The system services which should be automatically deployed to the cluster."),
})
    .description("The provider configuration for the local-kubernetes plugin.");
exports.name = "local-kubernetes";
function gardenPlugin({ projectName, config, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        config = common_1.validate(config, configSchema, { context: "local-kubernetes provider config" });
        let context = config.context;
        let defaultHostname = config.defaultHostname;
        let systemServices;
        if (!context) {
            // automatically detect supported kubectl context if not explicitly configured
            const kubeConfig = yield getKubeConfig();
            const currentContext = kubeConfig["current-context"];
            if (currentContext && supportedContexts.includes(currentContext)) {
                // prefer current context if set and supported
                context = currentContext;
                logEntry.debug({ section: exports.name, msg: `Using current context: ${context}` });
            }
            else if (kubeConfig.contexts) {
                const availableContexts = kubeConfig.contexts.map(c => c.name);
                for (const supportedContext of supportedContexts) {
                    if (availableContexts.includes(supportedContext)) {
                        context = supportedContext;
                        logEntry.debug({ section: exports.name, msg: `Using detected context: ${context}` });
                        break;
                    }
                }
            }
        }
        if (!context) {
            context = supportedContexts[0];
            logEntry.debug({ section: exports.name, msg: `No kubectl context auto-detected, using default: ${context}` });
        }
        if (context === "minikube") {
            yield execa("minikube", ["config", "set", "WantUpdateNotification", "false"]);
            if (!defaultHostname) {
                // use the nip.io service to give a hostname to the instance, if none is explicitly configured
                const minikubeIp = yield execa.stdout("minikube", ["ip"]);
                defaultHostname = `${projectName}.${minikubeIp}.nip.io`;
            }
            yield Promise.all([
                // TODO: wait for ingress addon to be ready, if it was previously disabled
                execa("minikube", ["addons", "enable", "ingress"]),
                setMinikubeDockerEnv(),
            ]);
            systemServices = [];
        }
        else {
            if (!defaultHostname) {
                defaultHostname = `${projectName}.local.app.garden`;
            }
        }
        const k8sConfig = {
            name: config.name,
            context,
            defaultHostname,
            defaultUsername: "default",
            deploymentRegistry: {
                hostname: "foo.garden",
                namespace: "_",
            },
            forceSsl: false,
            imagePullSecrets: config.imagePullSecrets,
            ingressHttpPort: 80,
            ingressHttpsPort: 443,
            ingressClass: "nginx",
            tlsCertificates: config.tlsCertificates,
            // TODO: support SSL on local deployments
            _system: config._system,
            _systemServices: systemServices,
        };
        const plugin = kubernetes_1.gardenPlugin({ config: k8sConfig });
        // override the environment configuration steps
        plugin.actions.getEnvironmentStatus = init_1.getLocalEnvironmentStatus;
        plugin.actions.prepareEnvironment = init_1.prepareLocalEnvironment;
        // no need to push before deploying locally
        delete plugin.moduleActions.container.pushModule;
        return plugin;
    });
}
exports.gardenPlugin = gardenPlugin;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9sb2NhbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsK0JBQThCO0FBQzlCLHFDQUFrQztBQUNsQywyQkFBMEI7QUFDMUIsK0JBQTJCO0FBRTNCLGdEQUE4QztBQUM5Qyw2Q0FLcUI7QUFDckIsdUNBQW1DO0FBQ25DLDJCQUE0QjtBQUM1QixpQ0FBMkU7QUFFM0UsK0VBQStFO0FBRS9FLDhGQUE4RjtBQUM5RixzREFBc0Q7QUFDdEQsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLG9CQUFvQixFQUFFLFVBQVUsQ0FBQyxDQUFBO0FBQzVELE1BQU0sY0FBYyxHQUFHLFdBQUksQ0FBQyxZQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUE7QUFFekQsU0FBZSxhQUFhOztRQUMxQixJQUFJO1lBQ0YsT0FBTyxrQkFBUSxDQUFDLENBQUMsTUFBTSxtQkFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQTtTQUM3RDtRQUFDLFdBQU07WUFDTixPQUFPLEVBQUUsQ0FBQTtTQUNWO0lBQ0gsQ0FBQztDQUFBO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZSxvQkFBb0I7O1FBQ2pDLE1BQU0sV0FBVyxHQUFHLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQTtRQUNsRixLQUFLLE1BQU0sSUFBSSxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDMUMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFBO1lBQ25ELElBQUksT0FBTyxFQUFFO2dCQUNYLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFBO2FBQ3JDO1NB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LENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQTtRQUVqRCxPQUFPLE1BQU0sQ0FBQTtJQUNmLENBQUM7Q0FBQTtBQXRGRCxvQ0FzRkMiLCJmaWxlIjoicGx1Z2lucy9rdWJlcm5ldGVzL2xvY2FsLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIGV4ZWNhIGZyb20gXCJleGVjYVwiXG5pbXBvcnQgeyBzYWZlTG9hZCB9IGZyb20gXCJqcy15YW1sXCJcbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBHYXJkZW5QbHVnaW4gfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQgeyB2YWxpZGF0ZSB9IGZyb20gXCIuLi8uLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7XG4gIGdhcmRlblBsdWdpbiBhcyBrOHNQbHVnaW4sXG4gIEt1YmVybmV0ZXNCYXNlQ29uZmlnLFxuICBrdWJlcm5ldGVzQ29uZmlnQmFzZSxcbiAgS3ViZXJuZXRlc0NvbmZpZyxcbn0gZnJvbSBcIi4va3ViZXJuZXRlc1wiXG5pbXBvcnQgeyByZWFkRmlsZSB9IGZyb20gXCJmcy1leHRyYVwiXG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSBcIm9zXCJcbmltcG9ydCB7IGdldExvY2FsRW52aXJvbm1lbnRTdGF0dXMsIHByZXBhcmVMb2NhbEVudmlyb25tZW50IH0gZnJvbSBcIi4vaW5pdFwiXG5cbi8vIFRPRE86IHNwbGl0IHRoaXMgaW50byBzZXBhcmF0ZSBwbHVnaW5zIHRvIGhhbmRsZSBEb2NrZXIgZm9yIE1hYyBhbmQgTWluaWt1YmVcblxuLy8gbm90ZTogdGhpcyBpcyBpbiBvcmRlciBvZiBwcmVmZXJlbmNlLCBpbiBjYXNlIG5laXRoZXIgaXMgc2V0IGFzIHRoZSBjdXJyZW50IGt1YmVjdGwgY29udGV4dFxuLy8gYW5kIG5vbmUgaXMgZXhwbGljaXRseSBjb25maWd1cmVkIGluIHRoZSBnYXJkZW4ueW1sXG5jb25zdCBzdXBwb3J0ZWRDb250ZXh0cyA9IFtcImRvY2tlci1mb3ItZGVza3RvcFwiLCBcIm1pbmlrdWJlXCJdXG5jb25zdCBrdWJlQ29uZmlnUGF0aCA9IGpvaW4oaG9tZWRpcigpLCBcIi5rdWJlXCIsIFwiY29uZmlnXCIpXG5cbmFzeW5jIGZ1bmN0aW9uIGdldEt1YmVDb25maWcoKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gc2FmZUxvYWQoKGF3YWl0IHJlYWRGaWxlKGt1YmVDb25maWdQYXRoKSkudG9TdHJpbmcoKSlcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHt9XG4gIH1cbn1cblxuLyoqXG4gKiBBdXRvbWF0aWNhbGx5IHNldCBkb2NrZXIgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBtaW5pa3ViZVxuICogVE9ETzogaXQgd291bGQgYmUgYmV0dGVyIHRvIGV4cGxpY2l0bHkgcHJvdmlkZSB0aG9zZSB0byBkb2NrZXIgaW5zdGVhZCBvZiB1c2luZyBwcm9jZXNzLmVudlxuICovXG5hc3luYyBmdW5jdGlvbiBzZXRNaW5pa3ViZURvY2tlckVudigpIHtcbiAgY29uc3QgbWluaWt1YmVFbnYgPSBhd2FpdCBleGVjYS5zdGRvdXQoXCJtaW5pa3ViZVwiLCBbXCJkb2NrZXItZW52XCIsIFwiLS1zaGVsbD1iYXNoXCJdKVxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbWluaWt1YmVFbnYuc3BsaXQoXCJcXG5cIikpIHtcbiAgICBjb25zdCBtYXRjaGVkID0gbGluZS5tYXRjaCgvXmV4cG9ydCAoXFx3Kyk9XCIoLispXCIkLylcbiAgICBpZiAobWF0Y2hlZCkge1xuICAgICAgcHJvY2Vzcy5lbnZbbWF0Y2hlZFsxXV0gPSBtYXRjaGVkWzJdXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTG9jYWxLdWJlcm5ldGVzQ29uZmlnIGV4dGVuZHMgS3ViZXJuZXRlc0Jhc2VDb25maWcge1xuICBfc3lzdGVtPzogU3ltYm9sXG4gIF9zeXN0ZW1TZXJ2aWNlcz86IHN0cmluZ1tdXG59XG5cbmNvbnN0IGNvbmZpZ1NjaGVtYSA9IGt1YmVybmV0ZXNDb25maWdCYXNlXG4gIC5rZXlzKHtcbiAgICBpbmdyZXNzSG9zdG5hbWU6IEpvaS5zdHJpbmcoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGhvc3RuYW1lIG9mIHRoZSBjbHVzdGVyJ3MgaW5ncmVzcyBjb250cm9sbGVyLlwiKSxcbiAgICBfc3lzdGVtOiBKb2kuYW55KCkubWV0YSh7IGludGVybmFsOiB0cnVlIH0pLFxuICAgIF9zeXN0ZW1TZXJ2aWNlczogSm9pLmFycmF5KCkuaXRlbXMoSm9pLnN0cmluZygpKVxuICAgICAgLm1ldGEoeyBpbnRlcm5hbDogdHJ1ZSB9KVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIHN5c3RlbSBzZXJ2aWNlcyB3aGljaCBzaG91bGQgYmUgYXV0b21hdGljYWxseSBkZXBsb3llZCB0byB0aGUgY2x1c3Rlci5cIiksXG4gIH0pXG4gIC5kZXNjcmlwdGlvbihcIlRoZSBwcm92aWRlciBjb25maWd1cmF0aW9uIGZvciB0aGUgbG9jYWwta3ViZXJuZXRlcyBwbHVnaW4uXCIpXG5cbmV4cG9ydCBjb25zdCBuYW1lID0gXCJsb2NhbC1rdWJlcm5ldGVzXCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdhcmRlblBsdWdpbih7IHByb2plY3ROYW1lLCBjb25maWcsIGxvZ0VudHJ5IH0pOiBQcm9taXNlPEdhcmRlblBsdWdpbj4ge1xuICBjb25maWcgPSB2YWxpZGF0ZShjb25maWcsIGNvbmZpZ1NjaGVtYSwgeyBjb250ZXh0OiBcImxvY2FsLWt1YmVybmV0ZXMgcHJvdmlkZXIgY29uZmlnXCIgfSlcblxuICBsZXQgY29udGV4dCA9IGNvbmZpZy5jb250ZXh0XG4gIGxldCBkZWZhdWx0SG9zdG5hbWUgPSBjb25maWcuZGVmYXVsdEhvc3RuYW1lXG4gIGxldCBzeXN0ZW1TZXJ2aWNlc1xuXG4gIGlmICghY29udGV4dCkge1xuICAgIC8vIGF1dG9tYXRpY2FsbHkgZGV0ZWN0IHN1cHBvcnRlZCBrdWJlY3RsIGNvbnRleHQgaWYgbm90IGV4cGxpY2l0bHkgY29uZmlndXJlZFxuICAgIGNvbnN0IGt1YmVDb25maWcgPSBhd2FpdCBnZXRLdWJlQ29uZmlnKClcbiAgICBjb25zdCBjdXJyZW50Q29udGV4dCA9IGt1YmVDb25maWdbXCJjdXJyZW50LWNvbnRleHRcIl1cblxuICAgIGlmIChjdXJyZW50Q29udGV4dCAmJiBzdXBwb3J0ZWRDb250ZXh0cy5pbmNsdWRlcyhjdXJyZW50Q29udGV4dCkpIHtcbiAgICAgIC8vIHByZWZlciBjdXJyZW50IGNvbnRleHQgaWYgc2V0IGFuZCBzdXBwb3J0ZWRcbiAgICAgIGNvbnRleHQgPSBjdXJyZW50Q29udGV4dFxuICAgICAgbG9nRW50cnkuZGVidWcoeyBzZWN0aW9uOiBuYW1lLCBtc2c6IGBVc2luZyBjdXJyZW50IGNvbnRleHQ6ICR7Y29udGV4dH1gIH0pXG4gICAgfSBlbHNlIGlmIChrdWJlQ29uZmlnLmNvbnRleHRzKSB7XG4gICAgICBjb25zdCBhdmFpbGFibGVDb250ZXh0cyA9IGt1YmVDb25maWcuY29udGV4dHMubWFwKGMgPT4gYy5uYW1lKVxuXG4gICAgICBmb3IgKGNvbnN0IHN1cHBvcnRlZENvbnRleHQgb2Ygc3VwcG9ydGVkQ29udGV4dHMpIHtcbiAgICAgICAgaWYgKGF2YWlsYWJsZUNvbnRleHRzLmluY2x1ZGVzKHN1cHBvcnRlZENvbnRleHQpKSB7XG4gICAgICAgICAgY29udGV4dCA9IHN1cHBvcnRlZENvbnRleHRcbiAgICAgICAgICBsb2dFbnRyeS5kZWJ1Zyh7IHNlY3Rpb246IG5hbWUsIG1zZzogYFVzaW5nIGRldGVjdGVkIGNvbnRleHQ6ICR7Y29udGV4dH1gIH0pXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmICghY29udGV4dCkge1xuICAgIGNvbnRleHQgPSBzdXBwb3J0ZWRDb250ZXh0c1swXVxuICAgIGxvZ0VudHJ5LmRlYnVnKHsgc2VjdGlvbjogbmFtZSwgbXNnOiBgTm8ga3ViZWN0bCBjb250ZXh0IGF1dG8tZGV0ZWN0ZWQsIHVzaW5nIGRlZmF1bHQ6ICR7Y29udGV4dH1gIH0pXG4gIH1cblxuICBpZiAoY29udGV4dCA9PT0gXCJtaW5pa3ViZVwiKSB7XG4gICAgYXdhaXQgZXhlY2EoXCJtaW5pa3ViZVwiLCBbXCJjb25maWdcIiwgXCJzZXRcIiwgXCJXYW50VXBkYXRlTm90aWZpY2F0aW9uXCIsIFwiZmFsc2VcIl0pXG5cbiAgICBpZiAoIWRlZmF1bHRIb3N0bmFtZSkge1xuICAgICAgLy8gdXNlIHRoZSBuaXAuaW8gc2VydmljZSB0byBnaXZlIGEgaG9zdG5hbWUgdG8gdGhlIGluc3RhbmNlLCBpZiBub25lIGlzIGV4cGxpY2l0bHkgY29uZmlndXJlZFxuICAgICAgY29uc3QgbWluaWt1YmVJcCA9IGF3YWl0IGV4ZWNhLnN0ZG91dChcIm1pbmlrdWJlXCIsIFtcImlwXCJdKVxuICAgICAgZGVmYXVsdEhvc3RuYW1lID0gYCR7cHJvamVjdE5hbWV9LiR7bWluaWt1YmVJcH0ubmlwLmlvYFxuICAgIH1cblxuICAgIGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgIC8vIFRPRE86IHdhaXQgZm9yIGluZ3Jlc3MgYWRkb24gdG8gYmUgcmVhZHksIGlmIGl0IHdhcyBwcmV2aW91c2x5IGRpc2FibGVkXG4gICAgICBleGVjYShcIm1pbmlrdWJlXCIsIFtcImFkZG9uc1wiLCBcImVuYWJsZVwiLCBcImluZ3Jlc3NcIl0pLFxuICAgICAgc2V0TWluaWt1YmVEb2NrZXJFbnYoKSxcbiAgICBdKVxuXG4gICAgc3lzdGVtU2VydmljZXMgPSBbXVxuICB9IGVsc2Uge1xuICAgIGlmICghZGVmYXVsdEhvc3RuYW1lKSB7XG4gICAgICBkZWZhdWx0SG9zdG5hbWUgPSBgJHtwcm9qZWN0TmFtZX0ubG9jYWwuYXBwLmdhcmRlbmBcbiAgICB9XG4gIH1cblxuICBjb25zdCBrOHNDb25maWc6IEt1YmVybmV0ZXNDb25maWcgPSB7XG4gICAgbmFtZTogY29uZmlnLm5hbWUsXG4gICAgY29udGV4dCxcbiAgICBkZWZhdWx0SG9zdG5hbWUsXG4gICAgZGVmYXVsdFVzZXJuYW1lOiBcImRlZmF1bHRcIixcbiAgICBkZXBsb3ltZW50UmVnaXN0cnk6IHtcbiAgICAgIGhvc3RuYW1lOiBcImZvby5nYXJkZW5cIiwgICAvLyB0aGlzIGlzIG5vdCB1c2VkIGJ5IHRoaXMgcGx1Z2luLCBidXQgcmVxdWlyZWQgYnkgdGhlIGJhc2UgcGx1Z2luXG4gICAgICBuYW1lc3BhY2U6IFwiX1wiLFxuICAgIH0sXG4gICAgZm9yY2VTc2w6IGZhbHNlLFxuICAgIGltYWdlUHVsbFNlY3JldHM6IGNvbmZpZy5pbWFnZVB1bGxTZWNyZXRzLFxuICAgIGluZ3Jlc3NIdHRwUG9ydDogODAsXG4gICAgaW5ncmVzc0h0dHBzUG9ydDogNDQzLFxuICAgIGluZ3Jlc3NDbGFzczogXCJuZ2lueFwiLFxuICAgIHRsc0NlcnRpZmljYXRlczogY29uZmlnLnRsc0NlcnRpZmljYXRlcyxcbiAgICAvLyBUT0RPOiBzdXBwb3J0IFNTTCBvbiBsb2NhbCBkZXBsb3ltZW50c1xuICAgIF9zeXN0ZW06IGNvbmZpZy5fc3lzdGVtLFxuICAgIF9zeXN0ZW1TZXJ2aWNlczogc3lzdGVtU2VydmljZXMsXG4gIH1cblxuICBjb25zdCBwbHVnaW4gPSBrOHNQbHVnaW4oeyBjb25maWc6IGs4c0NvbmZpZyB9KVxuXG4gIC8vIG92ZXJyaWRlIHRoZSBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uIHN0ZXBzXG4gIHBsdWdpbi5hY3Rpb25zIS5nZXRFbnZpcm9ubWVudFN0YXR1cyA9IGdldExvY2FsRW52aXJvbm1lbnRTdGF0dXNcbiAgcGx1Z2luLmFjdGlvbnMhLnByZXBhcmVFbnZpcm9ubWVudCA9IHByZXBhcmVMb2NhbEVudmlyb25tZW50XG5cbiAgLy8gbm8gbmVlZCB0byBwdXNoIGJlZm9yZSBkZXBsb3lpbmcgbG9jYWxseVxuICBkZWxldGUgcGx1Z2luLm1vZHVsZUFjdGlvbnMhLmNvbnRhaW5lci5wdXNoTW9kdWxlXG5cbiAgcmV0dXJuIHBsdWdpblxufVxuIl19
