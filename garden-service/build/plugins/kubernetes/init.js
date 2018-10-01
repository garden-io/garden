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
const Bluebird = require("bluebird");
const inquirer = require("inquirer");
const Joi = require("joi");
const lodash_1 = require("lodash");
const exceptions_1 = require("../../exceptions");
const util_1 = require("../../util/util");
const common_1 = require("../../config/common");
const api_1 = require("./api");
const namespace_1 = require("./namespace");
const kubectl_1 = require("./kubectl");
const kubernetes_1 = require("./kubernetes");
const system_1 = require("./system");
const helm_1 = require("./helm");
const MAX_STORED_USERNAMES = 5;
/**
 * Used by both the remote and local plugin
 */
function prepareNamespaces({ ctx }) {
    return __awaiter(this, void 0, void 0, function* () {
        const kubeContext = ctx.provider.config.context;
        try {
            // TODO: use API instead of kubectl (I just couldn't find which API call to make)
            yield kubectl_1.kubectl(kubeContext).call(["version"]);
        }
        catch (err) {
            // TODO: catch error properly
            if (err.detail.output) {
                throw new exceptions_1.DeploymentError(`Unable to connect to Kubernetes cluster. ` +
                    `Please make sure it is running, reachable and that you have the right context configured.`, {
                    kubeContext,
                    kubectlOutput: err.detail.output,
                });
            }
            throw err;
        }
        yield Bluebird.all([
            namespace_1.getMetadataNamespace(ctx, ctx.provider),
            namespace_1.getAppNamespace(ctx, ctx.provider),
        ]);
    });
}
function getRemoteEnvironmentStatus({ ctx }) {
    return __awaiter(this, void 0, void 0, function* () {
        const loggedIn = yield getLoginStatus({ ctx });
        if (!loggedIn) {
            return {
                ready: false,
                needUserInput: true,
            };
        }
        yield prepareNamespaces({ ctx });
        return {
            ready: true,
            needUserInput: false,
        };
    });
}
exports.getRemoteEnvironmentStatus = getRemoteEnvironmentStatus;
function getLocalEnvironmentStatus({ ctx }) {
    return __awaiter(this, void 0, void 0, function* () {
        let ready = true;
        let needUserInput = false;
        yield prepareNamespaces({ ctx });
        // TODO: check if mkcert has been installed
        // TODO: check if all certs have been generated
        // check if system services are deployed
        if (!system_1.isSystemGarden(ctx.provider)) {
            const sysGarden = yield system_1.getSystemGarden(ctx.provider);
            const sysStatus = yield sysGarden.actions.getStatus();
            const systemReady = sysStatus.providers[ctx.provider.config.name].ready &&
                lodash_1.every(lodash_1.values(sysStatus.services).map(s => s.state === "ready"));
            if (!systemReady) {
                ready = false;
            }
        }
        return {
            ready,
            needUserInput,
        };
    });
}
exports.getLocalEnvironmentStatus = getLocalEnvironmentStatus;
function prepareRemoteEnvironment({ ctx, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const loggedIn = yield getLoginStatus({ ctx, logEntry });
        if (!loggedIn) {
            yield login({ ctx, logEntry });
        }
        return {};
    });
}
exports.prepareRemoteEnvironment = prepareRemoteEnvironment;
function prepareLocalEnvironment({ ctx, force, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        // make sure system services are deployed
        if (!system_1.isSystemGarden(ctx.provider)) {
            yield configureSystemServices({ ctx, force, logEntry });
        }
        // TODO: make sure all certs have been generated
        return {};
    });
}
exports.prepareLocalEnvironment = prepareLocalEnvironment;
function cleanupEnvironment({ ctx, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const api = new api_1.KubeApi(ctx.provider);
        const namespace = yield namespace_1.getAppNamespace(ctx, ctx.provider);
        const entry = logEntry && logEntry.info({
            section: "kubernetes",
            msg: `Deleting namespace ${namespace} (this may take a while)`,
            status: "active",
        });
        try {
            // Note: Need to call the delete method with an empty object
            // TODO: any cast is required until https://github.com/kubernetes-client/javascript/issues/52 is fixed
            yield api.core.deleteNamespace(namespace, {});
        }
        catch (err) {
            entry && entry.setError(err.message);
            const availableNamespaces = yield namespace_1.getAllGardenNamespaces(api);
            throw new exceptions_1.NotFoundError(err, { namespace, availableNamespaces });
        }
        yield logout({ ctx, logEntry });
        // Wait until namespace has been deleted
        const startTime = new Date().getTime();
        while (true) {
            yield util_1.sleep(2000);
            const nsNames = yield namespace_1.getAllGardenNamespaces(api);
            if (!nsNames.includes(namespace)) {
                break;
            }
            const now = new Date().getTime();
            if (now - startTime > kubectl_1.KUBECTL_DEFAULT_TIMEOUT * 1000) {
                throw new exceptions_1.TimeoutError(`Timed out waiting for namespace ${namespace} delete to complete`, { namespace });
            }
        }
        return {};
    });
}
exports.cleanupEnvironment = cleanupEnvironment;
function getLoginStatus({ ctx }) {
    return __awaiter(this, void 0, void 0, function* () {
        const localConfig = yield ctx.localConfigStore.get();
        let currentUsername;
        if (localConfig.kubernetes) {
            currentUsername = localConfig.kubernetes.username;
        }
        return !!currentUsername;
    });
}
function login({ ctx, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const entry = logEntry && logEntry.info({ section: "kubernetes", msg: "Logging in..." });
        const localConfig = yield ctx.localConfigStore.get();
        let currentUsername;
        let prevUsernames = [];
        if (localConfig.kubernetes) {
            currentUsername = localConfig.kubernetes.username;
            prevUsernames = localConfig.kubernetes["previous-usernames"] || [];
        }
        if (currentUsername) {
            entry && entry.setDone({
                symbol: "info",
                msg: `Already logged in as user ${currentUsername}`,
            });
            return { loggedIn: true };
        }
        const promptName = "username";
        const newUserOption = "Add new user";
        let ans;
        const inputPrompt = () => __awaiter(this, void 0, void 0, function* () {
            return inquirer.prompt({
                name: promptName,
                message: "Enter username",
                validate: input => {
                    try {
                        Joi.attempt(input.trim(), common_1.joiIdentifier());
                    }
                    catch (err) {
                        return `Invalid username, please try again\nError: ${err.message}`;
                    }
                    return true;
                },
            });
        });
        const choicesPrompt = () => __awaiter(this, void 0, void 0, function* () {
            return inquirer.prompt({
                name: promptName,
                type: "list",
                message: "Log in as...",
                choices: [...prevUsernames, new inquirer.Separator(), newUserOption],
            });
        });
        if (prevUsernames.length > 0) {
            ans = (yield choicesPrompt());
            if (ans.username === newUserOption) {
                ans = (yield inputPrompt());
            }
        }
        else {
            ans = (yield inputPrompt());
        }
        const username = ans.username.trim();
        const newPrevUsernames = lodash_1.uniq([...prevUsernames, username].slice(-MAX_STORED_USERNAMES));
        yield ctx.localConfigStore.set([
            { keyPath: [kubernetes_1.name, "username"], value: username },
            { keyPath: [kubernetes_1.name, "previous-usernames"], value: newPrevUsernames },
        ]);
        return { loggedIn: true };
    });
}
function logout({ ctx, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const entry = logEntry && logEntry.info({ section: "kubernetes", msg: "Logging out..." });
        const localConfig = yield ctx.localConfigStore.get();
        const k8sConfig = localConfig.kubernetes || {};
        if (k8sConfig.username) {
            yield ctx.localConfigStore.delete([kubernetes_1.name, "username"]);
            entry && entry.setSuccess("Logged out");
        }
        else {
            entry && entry.setSuccess("Already logged out");
        }
    });
}
function configureSystemServices({ ctx, force, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = ctx.provider;
        const sysGarden = yield system_1.getSystemGarden(provider);
        const sysCtx = sysGarden.getPluginContext(provider.name);
        // TODO: need to add logic here to wait for tiller to be ready
        yield helm_1.helm(sysCtx.provider, "init", "--wait", "--service-account", "default", "--upgrade");
        const sysStatus = yield getLocalEnvironmentStatus({
            ctx: sysCtx,
            logEntry,
        });
        yield prepareLocalEnvironment({
            ctx: sysCtx,
            force,
            status: sysStatus,
            logEntry,
        });
        // only deploy services if configured to do so (minikube bundles the required services as addons)
        if (!provider.config._systemServices || provider.config._systemServices.length > 0) {
            const results = yield sysGarden.actions.deployServices({
                serviceNames: provider.config._systemServices,
            });
            const failed = lodash_1.values(results.taskResults).filter(r => !!r.error).length;
            if (failed) {
                throw new exceptions_1.PluginError(`local-kubernetes: ${failed} errors occurred when configuring environment`, {
                    results,
                });
            }
        }
    });
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9pbml0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxxQ0FBb0M7QUFDcEMscUNBQW9DO0FBQ3BDLDJCQUEwQjtBQUMxQixtQ0FBNEM7QUFFNUMsaURBQTRGO0FBTzVGLDBDQUF1QztBQUN2QyxnREFBbUQ7QUFDbkQsK0JBQStCO0FBQy9CLDJDQUlvQjtBQUNwQix1Q0FBNEQ7QUFDNUQsNkNBQW1EO0FBQ25ELHFDQUEwRDtBQUcxRCxpQ0FBNkI7QUFFN0IsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLENBQUE7QUFFOUI7O0dBRUc7QUFDSCxTQUFlLGlCQUFpQixDQUFDLEVBQUUsR0FBRyxFQUE4Qjs7UUFDbEUsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFBO1FBRS9DLElBQUk7WUFDRixpRkFBaUY7WUFDakYsTUFBTSxpQkFBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUE7U0FDN0M7UUFBQyxPQUFPLEdBQUcsRUFBRTtZQUNaLDZCQUE2QjtZQUM3QixJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO2dCQUNyQixNQUFNLElBQUksNEJBQWUsQ0FDdkIsMkNBQTJDO29CQUMzQywyRkFBMkYsRUFDM0Y7b0JBQ0UsV0FBVztvQkFDWCxhQUFhLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNO2lCQUNqQyxDQUNGLENBQUE7YUFDRjtZQUNELE1BQU0sR0FBRyxDQUFBO1NBQ1Y7UUFFRCxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUM7WUFDakIsZ0NBQW9CLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUM7WUFDdkMsMkJBQWUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQztTQUNuQyxDQUFDLENBQUE7SUFDSixDQUFDO0NBQUE7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LENBQUE7WUFFeEUsSUFBSSxNQUFNLEVBQUU7Z0JBQ1YsTUFBTSxJQUFJLHdCQUFXLENBQUMscUJBQXFCLE1BQU0sK0NBQStDLEVBQUU7b0JBQ2hHLE9BQU87aUJBQ1IsQ0FBQyxDQUFBO2FBQ0g7U0FDRjtJQUNILENBQUM7Q0FBQSIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvaW5pdC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBCbHVlYmlyZCBmcm9tIFwiYmx1ZWJpcmRcIlxuaW1wb3J0ICogYXMgaW5xdWlyZXIgZnJvbSBcImlucXVpcmVyXCJcbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCB7IHVuaXEsIGV2ZXJ5LCB2YWx1ZXMgfSBmcm9tIFwibG9kYXNoXCJcblxuaW1wb3J0IHsgRGVwbG95bWVudEVycm9yLCBOb3RGb3VuZEVycm9yLCBUaW1lb3V0RXJyb3IsIFBsdWdpbkVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHtcbiAgUHJlcGFyZUVudmlyb25tZW50UGFyYW1zLFxuICBDbGVhbnVwRW52aXJvbm1lbnRQYXJhbXMsXG4gIEdldEVudmlyb25tZW50U3RhdHVzUGFyYW1zLFxuICBQbHVnaW5BY3Rpb25QYXJhbXNCYXNlLFxufSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQgeyBzbGVlcCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgam9pSWRlbnRpZmllciB9IGZyb20gXCIuLi8uLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7IEt1YmVBcGkgfSBmcm9tIFwiLi9hcGlcIlxuaW1wb3J0IHtcbiAgZ2V0QXBwTmFtZXNwYWNlLFxuICBnZXRNZXRhZGF0YU5hbWVzcGFjZSxcbiAgZ2V0QWxsR2FyZGVuTmFtZXNwYWNlcyxcbn0gZnJvbSBcIi4vbmFtZXNwYWNlXCJcbmltcG9ydCB7IEtVQkVDVExfREVGQVVMVF9USU1FT1VULCBrdWJlY3RsIH0gZnJvbSBcIi4va3ViZWN0bFwiXG5pbXBvcnQgeyBuYW1lIGFzIHByb3ZpZGVyTmFtZSB9IGZyb20gXCIuL2t1YmVybmV0ZXNcIlxuaW1wb3J0IHsgaXNTeXN0ZW1HYXJkZW4sIGdldFN5c3RlbUdhcmRlbiB9IGZyb20gXCIuL3N5c3RlbVwiXG5pbXBvcnQgeyBQbHVnaW5Db250ZXh0IH0gZnJvbSBcIi4uLy4uL3BsdWdpbi1jb250ZXh0XCJcbmltcG9ydCB7IExvZ0VudHJ5IH0gZnJvbSBcIi4uLy4uL2xvZ2dlci9sb2ctZW50cnlcIlxuaW1wb3J0IHsgaGVsbSB9IGZyb20gXCIuL2hlbG1cIlxuXG5jb25zdCBNQVhfU1RPUkVEX1VTRVJOQU1FUyA9IDVcblxuLyoqXG4gKiBVc2VkIGJ5IGJvdGggdGhlIHJlbW90ZSBhbmQgbG9jYWwgcGx1Z2luXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByZXBhcmVOYW1lc3BhY2VzKHsgY3R4IH06IEdldEVudmlyb25tZW50U3RhdHVzUGFyYW1zKSB7XG4gIGNvbnN0IGt1YmVDb250ZXh0ID0gY3R4LnByb3ZpZGVyLmNvbmZpZy5jb250ZXh0XG5cbiAgdHJ5IHtcbiAgICAvLyBUT0RPOiB1c2UgQVBJIGluc3RlYWQgb2Yga3ViZWN0bCAoSSBqdXN0IGNvdWxkbid0IGZpbmQgd2hpY2ggQVBJIGNhbGwgdG8gbWFrZSlcbiAgICBhd2FpdCBrdWJlY3RsKGt1YmVDb250ZXh0KS5jYWxsKFtcInZlcnNpb25cIl0pXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIC8vIFRPRE86IGNhdGNoIGVycm9yIHByb3Blcmx5XG4gICAgaWYgKGVyci5kZXRhaWwub3V0cHV0KSB7XG4gICAgICB0aHJvdyBuZXcgRGVwbG95bWVudEVycm9yKFxuICAgICAgICBgVW5hYmxlIHRvIGNvbm5lY3QgdG8gS3ViZXJuZXRlcyBjbHVzdGVyLiBgICtcbiAgICAgICAgYFBsZWFzZSBtYWtlIHN1cmUgaXQgaXMgcnVubmluZywgcmVhY2hhYmxlIGFuZCB0aGF0IHlvdSBoYXZlIHRoZSByaWdodCBjb250ZXh0IGNvbmZpZ3VyZWQuYCxcbiAgICAgICAge1xuICAgICAgICAgIGt1YmVDb250ZXh0LFxuICAgICAgICAgIGt1YmVjdGxPdXRwdXQ6IGVyci5kZXRhaWwub3V0cHV0LFxuICAgICAgICB9LFxuICAgICAgKVxuICAgIH1cbiAgICB0aHJvdyBlcnJcbiAgfVxuXG4gIGF3YWl0IEJsdWViaXJkLmFsbChbXG4gICAgZ2V0TWV0YWRhdGFOYW1lc3BhY2UoY3R4LCBjdHgucHJvdmlkZXIpLFxuICAgIGdldEFwcE5hbWVzcGFjZShjdHgsIGN0eC5wcm92aWRlciksXG4gIF0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRSZW1vdGVFbnZpcm9ubWVudFN0YXR1cyh7IGN0eCB9OiBHZXRFbnZpcm9ubWVudFN0YXR1c1BhcmFtcykge1xuICBjb25zdCBsb2dnZWRJbiA9IGF3YWl0IGdldExvZ2luU3RhdHVzKHsgY3R4IH0pXG5cbiAgaWYgKCFsb2dnZWRJbikge1xuICAgIHJldHVybiB7XG4gICAgICByZWFkeTogZmFsc2UsXG4gICAgICBuZWVkVXNlcklucHV0OiB0cnVlLFxuICAgIH1cbiAgfVxuXG4gIGF3YWl0IHByZXBhcmVOYW1lc3BhY2VzKHsgY3R4IH0pXG5cbiAgcmV0dXJuIHtcbiAgICByZWFkeTogdHJ1ZSxcbiAgICBuZWVkVXNlcklucHV0OiBmYWxzZSxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0TG9jYWxFbnZpcm9ubWVudFN0YXR1cyh7IGN0eCB9OiBHZXRFbnZpcm9ubWVudFN0YXR1c1BhcmFtcykge1xuICBsZXQgcmVhZHkgPSB0cnVlXG4gIGxldCBuZWVkVXNlcklucHV0ID0gZmFsc2VcblxuICBhd2FpdCBwcmVwYXJlTmFtZXNwYWNlcyh7IGN0eCB9KVxuXG4gIC8vIFRPRE86IGNoZWNrIGlmIG1rY2VydCBoYXMgYmVlbiBpbnN0YWxsZWRcbiAgLy8gVE9ETzogY2hlY2sgaWYgYWxsIGNlcnRzIGhhdmUgYmVlbiBnZW5lcmF0ZWRcblxuICAvLyBjaGVjayBpZiBzeXN0ZW0gc2VydmljZXMgYXJlIGRlcGxveWVkXG4gIGlmICghaXNTeXN0ZW1HYXJkZW4oY3R4LnByb3ZpZGVyKSkge1xuICAgIGNvbnN0IHN5c0dhcmRlbiA9IGF3YWl0IGdldFN5c3RlbUdhcmRlbihjdHgucHJvdmlkZXIpXG4gICAgY29uc3Qgc3lzU3RhdHVzID0gYXdhaXQgc3lzR2FyZGVuLmFjdGlvbnMuZ2V0U3RhdHVzKClcblxuICAgIGNvbnN0IHN5c3RlbVJlYWR5ID0gc3lzU3RhdHVzLnByb3ZpZGVyc1tjdHgucHJvdmlkZXIuY29uZmlnLm5hbWVdLnJlYWR5ICYmXG4gICAgICBldmVyeSh2YWx1ZXMoc3lzU3RhdHVzLnNlcnZpY2VzKS5tYXAocyA9PiBzLnN0YXRlID09PSBcInJlYWR5XCIpKVxuXG4gICAgaWYgKCFzeXN0ZW1SZWFkeSkge1xuICAgICAgcmVhZHkgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcmVhZHksXG4gICAgbmVlZFVzZXJJbnB1dCxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJlcGFyZVJlbW90ZUVudmlyb25tZW50KHsgY3R4LCBsb2dFbnRyeSB9OiBQcmVwYXJlRW52aXJvbm1lbnRQYXJhbXMpIHtcbiAgY29uc3QgbG9nZ2VkSW4gPSBhd2FpdCBnZXRMb2dpblN0YXR1cyh7IGN0eCwgbG9nRW50cnkgfSlcblxuICBpZiAoIWxvZ2dlZEluKSB7XG4gICAgYXdhaXQgbG9naW4oeyBjdHgsIGxvZ0VudHJ5IH0pXG4gIH1cblxuICByZXR1cm4ge31cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByZXBhcmVMb2NhbEVudmlyb25tZW50KHsgY3R4LCBmb3JjZSwgbG9nRW50cnkgfTogUHJlcGFyZUVudmlyb25tZW50UGFyYW1zKSB7XG4gIC8vIG1ha2Ugc3VyZSBzeXN0ZW0gc2VydmljZXMgYXJlIGRlcGxveWVkXG4gIGlmICghaXNTeXN0ZW1HYXJkZW4oY3R4LnByb3ZpZGVyKSkge1xuICAgIGF3YWl0IGNvbmZpZ3VyZVN5c3RlbVNlcnZpY2VzKHsgY3R4LCBmb3JjZSwgbG9nRW50cnkgfSlcbiAgfVxuXG4gIC8vIFRPRE86IG1ha2Ugc3VyZSBhbGwgY2VydHMgaGF2ZSBiZWVuIGdlbmVyYXRlZFxuICByZXR1cm4ge31cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFudXBFbnZpcm9ubWVudCh7IGN0eCwgbG9nRW50cnkgfTogQ2xlYW51cEVudmlyb25tZW50UGFyYW1zKSB7XG4gIGNvbnN0IGFwaSA9IG5ldyBLdWJlQXBpKGN0eC5wcm92aWRlcilcbiAgY29uc3QgbmFtZXNwYWNlID0gYXdhaXQgZ2V0QXBwTmFtZXNwYWNlKGN0eCwgY3R4LnByb3ZpZGVyKVxuICBjb25zdCBlbnRyeSA9IGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LmluZm8oe1xuICAgIHNlY3Rpb246IFwia3ViZXJuZXRlc1wiLFxuICAgIG1zZzogYERlbGV0aW5nIG5hbWVzcGFjZSAke25hbWVzcGFjZX0gKHRoaXMgbWF5IHRha2UgYSB3aGlsZSlgLFxuICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgfSlcblxuICB0cnkge1xuICAgIC8vIE5vdGU6IE5lZWQgdG8gY2FsbCB0aGUgZGVsZXRlIG1ldGhvZCB3aXRoIGFuIGVtcHR5IG9iamVjdFxuICAgIC8vIFRPRE86IGFueSBjYXN0IGlzIHJlcXVpcmVkIHVudGlsIGh0dHBzOi8vZ2l0aHViLmNvbS9rdWJlcm5ldGVzLWNsaWVudC9qYXZhc2NyaXB0L2lzc3Vlcy81MiBpcyBmaXhlZFxuICAgIGF3YWl0IGFwaS5jb3JlLmRlbGV0ZU5hbWVzcGFjZShuYW1lc3BhY2UsIDxhbnk+e30pXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGVudHJ5ICYmIGVudHJ5LnNldEVycm9yKGVyci5tZXNzYWdlKVxuICAgIGNvbnN0IGF2YWlsYWJsZU5hbWVzcGFjZXMgPSBhd2FpdCBnZXRBbGxHYXJkZW5OYW1lc3BhY2VzKGFwaSlcbiAgICB0aHJvdyBuZXcgTm90Rm91bmRFcnJvcihlcnIsIHsgbmFtZXNwYWNlLCBhdmFpbGFibGVOYW1lc3BhY2VzIH0pXG4gIH1cblxuICBhd2FpdCBsb2dvdXQoeyBjdHgsIGxvZ0VudHJ5IH0pXG5cbiAgLy8gV2FpdCB1bnRpbCBuYW1lc3BhY2UgaGFzIGJlZW4gZGVsZXRlZFxuICBjb25zdCBzdGFydFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuICB3aGlsZSAodHJ1ZSkge1xuICAgIGF3YWl0IHNsZWVwKDIwMDApXG5cbiAgICBjb25zdCBuc05hbWVzID0gYXdhaXQgZ2V0QWxsR2FyZGVuTmFtZXNwYWNlcyhhcGkpXG4gICAgaWYgKCFuc05hbWVzLmluY2x1ZGVzKG5hbWVzcGFjZSkpIHtcbiAgICAgIGJyZWFrXG4gICAgfVxuXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKClcbiAgICBpZiAobm93IC0gc3RhcnRUaW1lID4gS1VCRUNUTF9ERUZBVUxUX1RJTUVPVVQgKiAxMDAwKSB7XG4gICAgICB0aHJvdyBuZXcgVGltZW91dEVycm9yKFxuICAgICAgICBgVGltZWQgb3V0IHdhaXRpbmcgZm9yIG5hbWVzcGFjZSAke25hbWVzcGFjZX0gZGVsZXRlIHRvIGNvbXBsZXRlYCxcbiAgICAgICAgeyBuYW1lc3BhY2UgfSxcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge31cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0TG9naW5TdGF0dXMoeyBjdHggfTogUGx1Z2luQWN0aW9uUGFyYW1zQmFzZSkge1xuICBjb25zdCBsb2NhbENvbmZpZyA9IGF3YWl0IGN0eC5sb2NhbENvbmZpZ1N0b3JlLmdldCgpXG4gIGxldCBjdXJyZW50VXNlcm5hbWVcbiAgaWYgKGxvY2FsQ29uZmlnLmt1YmVybmV0ZXMpIHtcbiAgICBjdXJyZW50VXNlcm5hbWUgPSBsb2NhbENvbmZpZy5rdWJlcm5ldGVzLnVzZXJuYW1lXG4gIH1cbiAgcmV0dXJuICEhY3VycmVudFVzZXJuYW1lXG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvZ2luKHsgY3R4LCBsb2dFbnRyeSB9OiBQbHVnaW5BY3Rpb25QYXJhbXNCYXNlKSB7XG4gIGNvbnN0IGVudHJ5ID0gbG9nRW50cnkgJiYgbG9nRW50cnkuaW5mbyh7IHNlY3Rpb246IFwia3ViZXJuZXRlc1wiLCBtc2c6IFwiTG9nZ2luZyBpbi4uLlwiIH0pXG4gIGNvbnN0IGxvY2FsQ29uZmlnID0gYXdhaXQgY3R4LmxvY2FsQ29uZmlnU3RvcmUuZ2V0KClcblxuICBsZXQgY3VycmVudFVzZXJuYW1lXG4gIGxldCBwcmV2VXNlcm5hbWVzOiBBcnJheTxzdHJpbmc+ID0gW11cblxuICBpZiAobG9jYWxDb25maWcua3ViZXJuZXRlcykge1xuICAgIGN1cnJlbnRVc2VybmFtZSA9IGxvY2FsQ29uZmlnLmt1YmVybmV0ZXMudXNlcm5hbWVcbiAgICBwcmV2VXNlcm5hbWVzID0gbG9jYWxDb25maWcua3ViZXJuZXRlc1tcInByZXZpb3VzLXVzZXJuYW1lc1wiXSB8fCBbXVxuICB9XG5cbiAgaWYgKGN1cnJlbnRVc2VybmFtZSkge1xuICAgIGVudHJ5ICYmIGVudHJ5LnNldERvbmUoe1xuICAgICAgc3ltYm9sOiBcImluZm9cIixcbiAgICAgIG1zZzogYEFscmVhZHkgbG9nZ2VkIGluIGFzIHVzZXIgJHtjdXJyZW50VXNlcm5hbWV9YCxcbiAgICB9KVxuXG4gICAgcmV0dXJuIHsgbG9nZ2VkSW46IHRydWUgfVxuICB9XG5cbiAgY29uc3QgcHJvbXB0TmFtZSA9IFwidXNlcm5hbWVcIlxuICBjb25zdCBuZXdVc2VyT3B0aW9uID0gXCJBZGQgbmV3IHVzZXJcIlxuICB0eXBlIEFucyA9IHsgW3Byb21wdE5hbWVdOiBzdHJpbmcgfVxuICBsZXQgYW5zOiBBbnNcblxuICBjb25zdCBpbnB1dFByb21wdCA9IGFzeW5jICgpID0+IHtcbiAgICByZXR1cm4gaW5xdWlyZXIucHJvbXB0KHtcbiAgICAgIG5hbWU6IHByb21wdE5hbWUsXG4gICAgICBtZXNzYWdlOiBcIkVudGVyIHVzZXJuYW1lXCIsXG4gICAgICB2YWxpZGF0ZTogaW5wdXQgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIEpvaS5hdHRlbXB0KGlucHV0LnRyaW0oKSwgam9pSWRlbnRpZmllcigpKVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICByZXR1cm4gYEludmFsaWQgdXNlcm5hbWUsIHBsZWFzZSB0cnkgYWdhaW5cXG5FcnJvcjogJHtlcnIubWVzc2FnZX1gXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH0sXG4gICAgfSlcbiAgfVxuICBjb25zdCBjaG9pY2VzUHJvbXB0ID0gYXN5bmMgKCkgPT4ge1xuICAgIHJldHVybiBpbnF1aXJlci5wcm9tcHQoe1xuICAgICAgbmFtZTogcHJvbXB0TmFtZSxcbiAgICAgIHR5cGU6IFwibGlzdFwiLFxuICAgICAgbWVzc2FnZTogXCJMb2cgaW4gYXMuLi5cIixcbiAgICAgIGNob2ljZXM6IFsuLi5wcmV2VXNlcm5hbWVzLCBuZXcgaW5xdWlyZXIuU2VwYXJhdG9yKCksIG5ld1VzZXJPcHRpb25dLFxuICAgIH0pXG4gIH1cbiAgaWYgKHByZXZVc2VybmFtZXMubGVuZ3RoID4gMCkge1xuICAgIGFucyA9IGF3YWl0IGNob2ljZXNQcm9tcHQoKSBhcyBBbnNcbiAgICBpZiAoYW5zLnVzZXJuYW1lID09PSBuZXdVc2VyT3B0aW9uKSB7XG4gICAgICBhbnMgPSBhd2FpdCBpbnB1dFByb21wdCgpIGFzIEFuc1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBhbnMgPSBhd2FpdCBpbnB1dFByb21wdCgpIGFzIEFuc1xuICB9XG5cbiAgY29uc3QgdXNlcm5hbWUgPSBhbnMudXNlcm5hbWUudHJpbSgpXG4gIGNvbnN0IG5ld1ByZXZVc2VybmFtZXMgPSB1bmlxKFsuLi5wcmV2VXNlcm5hbWVzLCB1c2VybmFtZV0uc2xpY2UoLU1BWF9TVE9SRURfVVNFUk5BTUVTKSlcblxuICBhd2FpdCBjdHgubG9jYWxDb25maWdTdG9yZS5zZXQoW1xuICAgIHsga2V5UGF0aDogW3Byb3ZpZGVyTmFtZSwgXCJ1c2VybmFtZVwiXSwgdmFsdWU6IHVzZXJuYW1lIH0sXG4gICAgeyBrZXlQYXRoOiBbcHJvdmlkZXJOYW1lLCBcInByZXZpb3VzLXVzZXJuYW1lc1wiXSwgdmFsdWU6IG5ld1ByZXZVc2VybmFtZXMgfSxcbiAgXSlcblxuICByZXR1cm4geyBsb2dnZWRJbjogdHJ1ZSB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvZ291dCh7IGN0eCwgbG9nRW50cnkgfTogUGx1Z2luQWN0aW9uUGFyYW1zQmFzZSkge1xuICBjb25zdCBlbnRyeSA9IGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LmluZm8oeyBzZWN0aW9uOiBcImt1YmVybmV0ZXNcIiwgbXNnOiBcIkxvZ2dpbmcgb3V0Li4uXCIgfSlcbiAgY29uc3QgbG9jYWxDb25maWcgPSBhd2FpdCBjdHgubG9jYWxDb25maWdTdG9yZS5nZXQoKVxuICBjb25zdCBrOHNDb25maWcgPSBsb2NhbENvbmZpZy5rdWJlcm5ldGVzIHx8IHt9XG5cbiAgaWYgKGs4c0NvbmZpZy51c2VybmFtZSkge1xuICAgIGF3YWl0IGN0eC5sb2NhbENvbmZpZ1N0b3JlLmRlbGV0ZShbcHJvdmlkZXJOYW1lLCBcInVzZXJuYW1lXCJdKVxuICAgIGVudHJ5ICYmIGVudHJ5LnNldFN1Y2Nlc3MoXCJMb2dnZWQgb3V0XCIpXG4gIH0gZWxzZSB7XG4gICAgZW50cnkgJiYgZW50cnkuc2V0U3VjY2VzcyhcIkFscmVhZHkgbG9nZ2VkIG91dFwiKVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbmZpZ3VyZVN5c3RlbVNlcnZpY2VzKFxuICB7IGN0eCwgZm9yY2UsIGxvZ0VudHJ5IH06XG4gICAgeyBjdHg6IFBsdWdpbkNvbnRleHQsIGZvcmNlOiBib29sZWFuLCBsb2dFbnRyeT86IExvZ0VudHJ5IH0sXG4pIHtcbiAgY29uc3QgcHJvdmlkZXIgPSBjdHgucHJvdmlkZXJcbiAgY29uc3Qgc3lzR2FyZGVuID0gYXdhaXQgZ2V0U3lzdGVtR2FyZGVuKHByb3ZpZGVyKVxuICBjb25zdCBzeXNDdHggPSBzeXNHYXJkZW4uZ2V0UGx1Z2luQ29udGV4dChwcm92aWRlci5uYW1lKVxuXG4gIC8vIFRPRE86IG5lZWQgdG8gYWRkIGxvZ2ljIGhlcmUgdG8gd2FpdCBmb3IgdGlsbGVyIHRvIGJlIHJlYWR5XG4gIGF3YWl0IGhlbG0oc3lzQ3R4LnByb3ZpZGVyLFxuICAgIFwiaW5pdFwiLCBcIi0td2FpdFwiLFxuICAgIFwiLS1zZXJ2aWNlLWFjY291bnRcIiwgXCJkZWZhdWx0XCIsXG4gICAgXCItLXVwZ3JhZGVcIixcbiAgKVxuXG4gIGNvbnN0IHN5c1N0YXR1cyA9IGF3YWl0IGdldExvY2FsRW52aXJvbm1lbnRTdGF0dXMoe1xuICAgIGN0eDogc3lzQ3R4LFxuICAgIGxvZ0VudHJ5LFxuICB9KVxuXG4gIGF3YWl0IHByZXBhcmVMb2NhbEVudmlyb25tZW50KHtcbiAgICBjdHg6IHN5c0N0eCxcbiAgICBmb3JjZSxcbiAgICBzdGF0dXM6IHN5c1N0YXR1cyxcbiAgICBsb2dFbnRyeSxcbiAgfSlcblxuICAvLyBvbmx5IGRlcGxveSBzZXJ2aWNlcyBpZiBjb25maWd1cmVkIHRvIGRvIHNvIChtaW5pa3ViZSBidW5kbGVzIHRoZSByZXF1aXJlZCBzZXJ2aWNlcyBhcyBhZGRvbnMpXG4gIGlmICghcHJvdmlkZXIuY29uZmlnLl9zeXN0ZW1TZXJ2aWNlcyB8fCBwcm92aWRlci5jb25maWcuX3N5c3RlbVNlcnZpY2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgc3lzR2FyZGVuLmFjdGlvbnMuZGVwbG95U2VydmljZXMoe1xuICAgICAgc2VydmljZU5hbWVzOiBwcm92aWRlci5jb25maWcuX3N5c3RlbVNlcnZpY2VzLFxuICAgIH0pXG5cbiAgICBjb25zdCBmYWlsZWQgPSB2YWx1ZXMocmVzdWx0cy50YXNrUmVzdWx0cykuZmlsdGVyKHIgPT4gISFyLmVycm9yKS5sZW5ndGhcblxuICAgIGlmIChmYWlsZWQpIHtcbiAgICAgIHRocm93IG5ldyBQbHVnaW5FcnJvcihgbG9jYWwta3ViZXJuZXRlczogJHtmYWlsZWR9IGVycm9ycyBvY2N1cnJlZCB3aGVuIGNvbmZpZ3VyaW5nIGVudmlyb25tZW50YCwge1xuICAgICAgICByZXN1bHRzLFxuICAgICAgfSlcbiAgICB9XG4gIH1cbn1cbiJdfQ==
