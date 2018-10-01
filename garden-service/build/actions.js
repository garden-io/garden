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
const chalk_1 = require("chalk");
const service_1 = require("./types/service");
const lodash_1 = require("lodash");
const process_1 = require("./process");
const deploy_1 = require("./tasks/deploy");
const plugin_context_1 = require("./plugin-context");
const exceptions_1 = require("./exceptions");
class ActionHelper {
    constructor(garden) {
        this.garden = garden;
    }
    //===========================================================================
    //region Environment Actions
    //===========================================================================
    getEnvironmentStatus({ pluginName }) {
        return __awaiter(this, void 0, void 0, function* () {
            const handlers = this.garden.getActionHandlers("getEnvironmentStatus", pluginName);
            return Bluebird.props(lodash_1.mapValues(handlers, h => h(Object.assign({}, this.commonParams(h)))));
        });
    }
    /**
     * Checks environment status and calls prepareEnvironment for each provider that isn't flagged as ready.
     *
     * If any of the getEnvironmentStatus handlers returns needUserInput=true, this throws and guides the user to
     * run `garden init`
     */
    prepareEnvironment({ force = false, pluginName, logEntry, allowUserInput = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            const handlers = this.garden.getActionHandlers("prepareEnvironment", pluginName);
            const statuses = yield this.getEnvironmentStatus({ pluginName });
            const needUserInput = Object.entries(statuses)
                .map(([name, status]) => (Object.assign({}, status, { name })))
                .filter(status => status.needUserInput === true);
            if (!allowUserInput && needUserInput.length > 0) {
                const names = needUserInput.map(s => s.name).join(", ");
                const msgPrefix = needUserInput.length === 1
                    ? `Plugin ${names} has been updated or hasn't been configured, and requires user input.`
                    : `Plugins ${names} have been updated or haven't been configured, and require user input.`;
                throw new exceptions_1.ConfigurationError(`${msgPrefix}. Please run \`garden init\` and then re-run this command.`, { statuses });
            }
            const output = {};
            // sequentially go through the preparation steps, to allow plugins to request user input
            for (const [name, handler] of Object.entries(handlers)) {
                const status = statuses[name] || { ready: false };
                if (status.ready && !force) {
                    continue;
                }
                const envLogEntry = (logEntry || this.garden.log).info({
                    status: "active",
                    section: name,
                    msg: "Preparing environment...",
                });
                yield handler(Object.assign({}, this.commonParams(handler), { force, status, logEntry: envLogEntry }));
                envLogEntry.setSuccess("Configured");
                output[name] = true;
            }
            return output;
        });
    }
    cleanupEnvironment({ pluginName }) {
        return __awaiter(this, void 0, void 0, function* () {
            const handlers = this.garden.getActionHandlers("cleanupEnvironment", pluginName);
            yield Bluebird.each(lodash_1.values(handlers), h => h(Object.assign({}, this.commonParams(h))));
            return this.getEnvironmentStatus({ pluginName });
        });
    }
    getSecret(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { pluginName } = params;
            return this.callActionHandler({ actionType: "getSecret", pluginName, params: lodash_1.omit(params, ["pluginName"]) });
        });
    }
    setSecret(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { pluginName } = params;
            return this.callActionHandler({ actionType: "setSecret", pluginName, params: lodash_1.omit(params, ["pluginName"]) });
        });
    }
    deleteSecret(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { pluginName } = params;
            return this.callActionHandler({ actionType: "deleteSecret", pluginName, params: lodash_1.omit(params, ["pluginName"]) });
        });
    }
    //endregion
    //===========================================================================
    //region Module Actions
    //===========================================================================
    getBuildStatus(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({
                params,
                actionType: "getBuildStatus",
                defaultHandler: () => __awaiter(this, void 0, void 0, function* () { return ({ ready: false }); }),
            });
        });
    }
    build(params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.garden.buildDir.syncDependencyProducts(params.module);
            return this.callModuleHandler({ params, actionType: "build" });
        });
    }
    pushModule(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({ params, actionType: "pushModule", defaultHandler: dummyPushHandler });
        });
    }
    publishModule(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({ params, actionType: "publishModule", defaultHandler: dummyPublishHandler });
        });
    }
    runModule(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({ params, actionType: "runModule" });
        });
    }
    testModule(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({ params, actionType: "testModule" });
        });
    }
    getTestResult(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callModuleHandler({
                params,
                actionType: "getTestResult",
                defaultHandler: () => __awaiter(this, void 0, void 0, function* () { return null; }),
            });
        });
    }
    //endregion
    //===========================================================================
    //region Service Actions
    //===========================================================================
    getServiceStatus(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({ params, actionType: "getServiceStatus" });
        });
    }
    deployService(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({ params, actionType: "deployService" });
        });
    }
    deleteService(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const logEntry = this.garden.log.info({
                section: params.service.name,
                msg: "Deleting...",
                status: "active",
            });
            return this.callServiceHandler({
                params: Object.assign({}, params, { logEntry }),
                actionType: "deleteService",
                defaultHandler: dummyDeleteServiceHandler,
            });
        });
    }
    getServiceOutputs(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({
                params,
                actionType: "getServiceOutputs",
                defaultHandler: () => __awaiter(this, void 0, void 0, function* () { return ({}); }),
            });
        });
    }
    execInService(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({ params, actionType: "execInService" });
        });
    }
    getServiceLogs(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({ params, actionType: "getServiceLogs", defaultHandler: dummyLogStreamer });
        });
    }
    runService(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.callServiceHandler({ params, actionType: "runService" });
        });
    }
    //endregion
    //===========================================================================
    //region Helper Methods
    //===========================================================================
    getStatus() {
        return __awaiter(this, void 0, void 0, function* () {
            const envStatus = yield this.getEnvironmentStatus({});
            const services = lodash_1.keyBy(yield this.garden.getServices(), "name");
            const serviceStatus = yield Bluebird.props(lodash_1.mapValues(services, (service) => __awaiter(this, void 0, void 0, function* () {
                const dependencies = yield this.garden.getServices(service.config.dependencies);
                const runtimeContext = yield service_1.prepareRuntimeContext(this.garden, service.module, dependencies);
                return this.getServiceStatus({ service, runtimeContext });
            })));
            return {
                providers: envStatus,
                services: serviceStatus,
            };
        });
    }
    deployServices({ serviceNames, force = false, forceBuild = false }) {
        return __awaiter(this, void 0, void 0, function* () {
            const services = yield this.garden.getServices(serviceNames);
            return process_1.processServices({
                services,
                garden: this.garden,
                watch: false,
                handler: (module) => __awaiter(this, void 0, void 0, function* () {
                    return deploy_1.getDeployTasks({
                        garden: this.garden,
                        module,
                        serviceNames,
                        force,
                        forceBuild,
                        includeDependants: false,
                    });
                }),
            });
        });
    }
    //endregion
    // TODO: find a nicer way to do this (like a type-safe wrapper function)
    commonParams(handler, logEntry) {
        return {
            ctx: plugin_context_1.createPluginContext(this.garden, handler["pluginName"]),
            // TODO: find a better way for handlers to log during execution
            logEntry,
        };
    }
    callActionHandler({ params, actionType, pluginName, defaultHandler }) {
        return __awaiter(this, void 0, void 0, function* () {
            const handler = this.garden.getActionHandler({
                actionType,
                pluginName,
                defaultHandler,
            });
            const handlerParams = Object.assign({}, this.commonParams(handler), params);
            return handler(handlerParams);
        });
    }
    callModuleHandler({ params, actionType, defaultHandler }) {
        return __awaiter(this, void 0, void 0, function* () {
            // the type system is messing me up here, not sure why I need the any cast... - j.e.
            const { module, pluginName } = params;
            const handler = yield this.garden.getModuleActionHandler({
                moduleType: module.type,
                actionType,
                pluginName,
                defaultHandler,
            });
            const handlerParams = Object.assign({}, this.commonParams(handler), lodash_1.omit(params, ["module"]), { module: lodash_1.omit(module, ["_ConfigType"]) });
            // TODO: figure out why this doesn't compile without the function cast
            return handler(handlerParams);
        });
    }
    callServiceHandler({ params, actionType, defaultHandler }) {
        return __awaiter(this, void 0, void 0, function* () {
            const { service } = params;
            const module = service.module;
            const handler = yield this.garden.getModuleActionHandler({
                moduleType: module.type,
                actionType,
                pluginName: params.pluginName,
                defaultHandler,
            });
            // TODO: figure out why this doesn't compile without the casts
            const deps = yield this.garden.getServices(service.config.dependencies);
            const runtimeContext = (params.runtimeContext || (yield service_1.prepareRuntimeContext(this.garden, module, deps)));
            const handlerParams = Object.assign({}, this.commonParams(handler), params, { module,
                runtimeContext });
            return handler(handlerParams);
        });
    }
}
exports.ActionHelper = ActionHelper;
const dummyLogStreamer = ({ service, logEntry }) => __awaiter(this, void 0, void 0, function* () {
    logEntry && logEntry.warn({
        section: service.name,
        msg: chalk_1.default.yellow(`No handler for log retrieval available for module type ${service.module.type}`),
    });
    return {};
});
const dummyPushHandler = () => __awaiter(this, void 0, void 0, function* () {
    return { pushed: false };
});
const dummyPublishHandler = ({ module }) => __awaiter(this, void 0, void 0, function* () {
    return {
        message: chalk_1.default.yellow(`No publish handler available for module type ${module.type}`),
        published: false,
    };
});
const dummyDeleteServiceHandler = ({ module, logEntry }) => __awaiter(this, void 0, void 0, function* () {
    const msg = `No delete service handler available for module type ${module.type}`;
    logEntry && logEntry.setError(msg);
    return {};
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFFLE9BQU8sRUFBRSxRQUFRLEVBQXdCLEVBQUUsRUFBRTtJQUM3RSxRQUFRLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQztRQUN4QixPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUk7UUFDckIsR0FBRyxFQUFFLGVBQUssQ0FBQyxNQUFNLENBQUMsMERBQTBELE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7S0FDbkcsQ0FBQyxDQUFBO0lBQ0YsT0FBTyxFQUFFLENBQUE7QUFDWCxDQUFDLENBQUEsQ0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsR0FBUyxFQUFFO0lBQ2xDLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUE7QUFDMUIsQ0FBQyxDQUFBLENBQUE7QUFFRCxNQUFNLG1CQUFtQixHQUFHLENBQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFO0lBQy9DLE9BQU87UUFDTCxPQUFPLEVBQUUsZUFBSyxDQUFDLE1BQU0sQ0FBQyxnREFBZ0QsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BGLFNBQVMsRUFBRSxLQUFLO0tBQ2pCLENBQUE7QUFDSCxDQUFDLENBQUEsQ0FBQTtBQUVELE1BQU0seUJBQXlCLEdBQUcsQ0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQXVCLEVBQUUsRUFBRTtJQUNwRixNQUFNLEdBQUcsR0FBRyx1REFBdUQsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ2hGLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ2xDLE9BQU8sRUFBRSxDQUFBO0FBQ1gsQ0FBQyxDQUFBLENBQUEiLCJmaWxlIjoiYWN0aW9ucy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgQmx1ZWJpcmQgPSByZXF1aXJlKFwiYmx1ZWJpcmRcIilcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4vZ2FyZGVuXCJcbmltcG9ydCB7IFByaW1pdGl2ZU1hcCB9IGZyb20gXCIuL2NvbmZpZy9jb21tb25cIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7IE1vZHVsZUFjdGlvbnMsIFNlcnZpY2VBY3Rpb25zLCBQbHVnaW5BY3Rpb25zIH0gZnJvbSBcIi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQge1xuICBCdWlsZFJlc3VsdCxcbiAgQnVpbGRTdGF0dXMsXG4gIERlbGV0ZVNlY3JldFJlc3VsdCxcbiAgRW52aXJvbm1lbnRTdGF0dXNNYXAsXG4gIEV4ZWNJblNlcnZpY2VSZXN1bHQsXG4gIEdldFNlY3JldFJlc3VsdCxcbiAgR2V0U2VydmljZUxvZ3NSZXN1bHQsXG4gIE1vZHVsZUFjdGlvbk91dHB1dHMsXG4gIFB1c2hSZXN1bHQsXG4gIFJ1blJlc3VsdCxcbiAgU2VydmljZUFjdGlvbk91dHB1dHMsXG4gIFNldFNlY3JldFJlc3VsdCxcbiAgVGVzdFJlc3VsdCxcbiAgUGx1Z2luQWN0aW9uT3V0cHV0cyxcbiAgUHVibGlzaFJlc3VsdCxcbn0gZnJvbSBcIi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IHtcbiAgQnVpbGRNb2R1bGVQYXJhbXMsXG4gIERlbGV0ZVNlY3JldFBhcmFtcyxcbiAgRGVwbG95U2VydmljZVBhcmFtcyxcbiAgRGVsZXRlU2VydmljZVBhcmFtcyxcbiAgRXhlY0luU2VydmljZVBhcmFtcyxcbiAgR2V0U2VjcmV0UGFyYW1zLFxuICBHZXRCdWlsZFN0YXR1c1BhcmFtcyxcbiAgR2V0U2VydmljZUxvZ3NQYXJhbXMsXG4gIEdldFNlcnZpY2VPdXRwdXRzUGFyYW1zLFxuICBHZXRTZXJ2aWNlU3RhdHVzUGFyYW1zLFxuICBHZXRUZXN0UmVzdWx0UGFyYW1zLFxuICBNb2R1bGVBY3Rpb25QYXJhbXMsXG4gIFBsdWdpbkFjdGlvbkNvbnRleHRQYXJhbXMsXG4gIFBsdWdpbkFjdGlvblBhcmFtcyxcbiAgUGx1Z2luQWN0aW9uUGFyYW1zQmFzZSxcbiAgUGx1Z2luU2VydmljZUFjdGlvblBhcmFtc0Jhc2UsXG4gIFB1c2hNb2R1bGVQYXJhbXMsXG4gIFJ1bk1vZHVsZVBhcmFtcyxcbiAgUnVuU2VydmljZVBhcmFtcyxcbiAgU2VydmljZUFjdGlvblBhcmFtcyxcbiAgU2V0U2VjcmV0UGFyYW1zLFxuICBUZXN0TW9kdWxlUGFyYW1zLFxuICBHZXRFbnZpcm9ubWVudFN0YXR1c1BhcmFtcyxcbiAgUGx1Z2luTW9kdWxlQWN0aW9uUGFyYW1zQmFzZSxcbiAgUHVibGlzaE1vZHVsZVBhcmFtcyxcbn0gZnJvbSBcIi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQge1xuICBTZXJ2aWNlLFxuICBTZXJ2aWNlU3RhdHVzLFxuICBwcmVwYXJlUnVudGltZUNvbnRleHQsXG59IGZyb20gXCIuL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHsgbWFwVmFsdWVzLCB2YWx1ZXMsIGtleUJ5LCBvbWl0IH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyBPbWl0IH0gZnJvbSBcIi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IFJ1bnRpbWVDb250ZXh0IH0gZnJvbSBcIi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBwcm9jZXNzU2VydmljZXMsIFByb2Nlc3NSZXN1bHRzIH0gZnJvbSBcIi4vcHJvY2Vzc1wiXG5pbXBvcnQgeyBnZXREZXBsb3lUYXNrcyB9IGZyb20gXCIuL3Rhc2tzL2RlcGxveVwiXG5pbXBvcnQgeyBMb2dFbnRyeSB9IGZyb20gXCIuL2xvZ2dlci9sb2ctZW50cnlcIlxuaW1wb3J0IHsgY3JlYXRlUGx1Z2luQ29udGV4dCB9IGZyb20gXCIuL3BsdWdpbi1jb250ZXh0XCJcbmltcG9ydCB7IENsZWFudXBFbnZpcm9ubWVudFBhcmFtcyB9IGZyb20gXCIuL3R5cGVzL3BsdWdpbi9wYXJhbXNcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4vZXhjZXB0aW9uc1wiXG5cbnR5cGUgVHlwZUd1YXJkID0ge1xuICByZWFkb25seSBbUCBpbiBrZXlvZiAoUGx1Z2luQWN0aW9uUGFyYW1zIHwgTW9kdWxlQWN0aW9uUGFyYW1zPGFueT4pXTogKC4uLmFyZ3M6IGFueVtdKSA9PiBQcm9taXNlPGFueT5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb250ZXh0U3RhdHVzIHtcbiAgcHJvdmlkZXJzOiBFbnZpcm9ubWVudFN0YXR1c01hcFxuICBzZXJ2aWNlczogeyBbbmFtZTogc3RyaW5nXTogU2VydmljZVN0YXR1cyB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVwbG95U2VydmljZXNQYXJhbXMge1xuICBzZXJ2aWNlTmFtZXM/OiBzdHJpbmdbXSxcbiAgZm9yY2U/OiBib29sZWFuXG4gIGZvcmNlQnVpbGQ/OiBib29sZWFuXG59XG5cbi8vIGF2b2lkIGhhdmluZyB0byBzcGVjaWZ5IGNvbW1vbiBwYXJhbXMgb24gZWFjaCBhY3Rpb24gaGVscGVyIGNhbGxcbnR5cGUgQWN0aW9uSGVscGVyUGFyYW1zPFQgZXh0ZW5kcyBQbHVnaW5BY3Rpb25QYXJhbXNCYXNlPiA9XG4gIE9taXQ8VCwga2V5b2YgUGx1Z2luQWN0aW9uQ29udGV4dFBhcmFtcz4gJiB7IHBsdWdpbk5hbWU/OiBzdHJpbmcgfVxudHlwZSBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8VCBleHRlbmRzIFBsdWdpbk1vZHVsZUFjdGlvblBhcmFtc0Jhc2U+ID1cbiAgT21pdDxULCBrZXlvZiBQbHVnaW5BY3Rpb25Db250ZXh0UGFyYW1zPiAmIHsgcGx1Z2luTmFtZT86IHN0cmluZyB9XG4vLyBhZGRpdGlvbmFsbHkgbWFrZSBydW50aW1lQ29udGV4dCBwYXJhbSBvcHRpb25hbFxudHlwZSBTZXJ2aWNlQWN0aW9uSGVscGVyUGFyYW1zPFQgZXh0ZW5kcyBQbHVnaW5TZXJ2aWNlQWN0aW9uUGFyYW1zQmFzZT4gPVxuICBPbWl0PFQsIFwibW9kdWxlXCIgfCBcInJ1bnRpbWVDb250ZXh0XCIgfCBrZXlvZiBQbHVnaW5BY3Rpb25Db250ZXh0UGFyYW1zPlxuICAmIHsgcnVudGltZUNvbnRleHQ/OiBSdW50aW1lQ29udGV4dCwgcGx1Z2luTmFtZT86IHN0cmluZyB9XG5cbnR5cGUgUmVxdWlyZVBsdWdpbk5hbWU8VD4gPSBUICYgeyBwbHVnaW5OYW1lOiBzdHJpbmcgfVxuXG5leHBvcnQgY2xhc3MgQWN0aW9uSGVscGVyIGltcGxlbWVudHMgVHlwZUd1YXJkIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBnYXJkZW46IEdhcmRlbikgeyB9XG5cbiAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy9yZWdpb24gRW52aXJvbm1lbnQgQWN0aW9uc1xuICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGFzeW5jIGdldEVudmlyb25tZW50U3RhdHVzKFxuICAgIHsgcGx1Z2luTmFtZSB9OiBBY3Rpb25IZWxwZXJQYXJhbXM8R2V0RW52aXJvbm1lbnRTdGF0dXNQYXJhbXM+LFxuICApOiBQcm9taXNlPEVudmlyb25tZW50U3RhdHVzTWFwPiB7XG4gICAgY29uc3QgaGFuZGxlcnMgPSB0aGlzLmdhcmRlbi5nZXRBY3Rpb25IYW5kbGVycyhcImdldEVudmlyb25tZW50U3RhdHVzXCIsIHBsdWdpbk5hbWUpXG4gICAgcmV0dXJuIEJsdWViaXJkLnByb3BzKG1hcFZhbHVlcyhoYW5kbGVycywgaCA9PiBoKHsgLi4udGhpcy5jb21tb25QYXJhbXMoaCkgfSkpKVxuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrcyBlbnZpcm9ubWVudCBzdGF0dXMgYW5kIGNhbGxzIHByZXBhcmVFbnZpcm9ubWVudCBmb3IgZWFjaCBwcm92aWRlciB0aGF0IGlzbid0IGZsYWdnZWQgYXMgcmVhZHkuXG4gICAqXG4gICAqIElmIGFueSBvZiB0aGUgZ2V0RW52aXJvbm1lbnRTdGF0dXMgaGFuZGxlcnMgcmV0dXJucyBuZWVkVXNlcklucHV0PXRydWUsIHRoaXMgdGhyb3dzIGFuZCBndWlkZXMgdGhlIHVzZXIgdG9cbiAgICogcnVuIGBnYXJkZW4gaW5pdGBcbiAgICovXG4gIGFzeW5jIHByZXBhcmVFbnZpcm9ubWVudChcbiAgICB7IGZvcmNlID0gZmFsc2UsIHBsdWdpbk5hbWUsIGxvZ0VudHJ5LCBhbGxvd1VzZXJJbnB1dCA9IGZhbHNlIH06XG4gICAgICB7IGZvcmNlPzogYm9vbGVhbiwgcGx1Z2luTmFtZT86IHN0cmluZywgbG9nRW50cnk/OiBMb2dFbnRyeSwgYWxsb3dVc2VySW5wdXQ/OiBib29sZWFuIH0sXG4gICkge1xuICAgIGNvbnN0IGhhbmRsZXJzID0gdGhpcy5nYXJkZW4uZ2V0QWN0aW9uSGFuZGxlcnMoXCJwcmVwYXJlRW52aXJvbm1lbnRcIiwgcGx1Z2luTmFtZSlcbiAgICBjb25zdCBzdGF0dXNlcyA9IGF3YWl0IHRoaXMuZ2V0RW52aXJvbm1lbnRTdGF0dXMoeyBwbHVnaW5OYW1lIH0pXG5cbiAgICBjb25zdCBuZWVkVXNlcklucHV0ID0gT2JqZWN0LmVudHJpZXMoc3RhdHVzZXMpXG4gICAgICAubWFwKChbbmFtZSwgc3RhdHVzXSkgPT4gKHsgLi4uc3RhdHVzLCBuYW1lIH0pKVxuICAgICAgLmZpbHRlcihzdGF0dXMgPT4gc3RhdHVzLm5lZWRVc2VySW5wdXQgPT09IHRydWUpXG5cbiAgICBpZiAoIWFsbG93VXNlcklucHV0ICYmIG5lZWRVc2VySW5wdXQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbmFtZXMgPSBuZWVkVXNlcklucHV0Lm1hcChzID0+IHMubmFtZSkuam9pbihcIiwgXCIpXG4gICAgICBjb25zdCBtc2dQcmVmaXggPSBuZWVkVXNlcklucHV0Lmxlbmd0aCA9PT0gMVxuICAgICAgICA/IGBQbHVnaW4gJHtuYW1lc30gaGFzIGJlZW4gdXBkYXRlZCBvciBoYXNuJ3QgYmVlbiBjb25maWd1cmVkLCBhbmQgcmVxdWlyZXMgdXNlciBpbnB1dC5gXG4gICAgICAgIDogYFBsdWdpbnMgJHtuYW1lc30gaGF2ZSBiZWVuIHVwZGF0ZWQgb3IgaGF2ZW4ndCBiZWVuIGNvbmZpZ3VyZWQsIGFuZCByZXF1aXJlIHVzZXIgaW5wdXQuYFxuXG4gICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgICBgJHttc2dQcmVmaXh9LiBQbGVhc2UgcnVuIFxcYGdhcmRlbiBpbml0XFxgIGFuZCB0aGVuIHJlLXJ1biB0aGlzIGNvbW1hbmQuYCxcbiAgICAgICAgeyBzdGF0dXNlcyB9LFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IG91dHB1dCA9IHt9XG5cbiAgICAvLyBzZXF1ZW50aWFsbHkgZ28gdGhyb3VnaCB0aGUgcHJlcGFyYXRpb24gc3RlcHMsIHRvIGFsbG93IHBsdWdpbnMgdG8gcmVxdWVzdCB1c2VyIGlucHV0XG4gICAgZm9yIChjb25zdCBbbmFtZSwgaGFuZGxlcl0gb2YgT2JqZWN0LmVudHJpZXMoaGFuZGxlcnMpKSB7XG4gICAgICBjb25zdCBzdGF0dXMgPSBzdGF0dXNlc1tuYW1lXSB8fCB7IHJlYWR5OiBmYWxzZSB9XG5cbiAgICAgIGlmIChzdGF0dXMucmVhZHkgJiYgIWZvcmNlKSB7XG4gICAgICAgIGNvbnRpbnVlXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGVudkxvZ0VudHJ5ID0gKGxvZ0VudHJ5IHx8IHRoaXMuZ2FyZGVuLmxvZykuaW5mbyh7XG4gICAgICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgICAgICAgc2VjdGlvbjogbmFtZSxcbiAgICAgICAgbXNnOiBcIlByZXBhcmluZyBlbnZpcm9ubWVudC4uLlwiLFxuICAgICAgfSlcblxuICAgICAgYXdhaXQgaGFuZGxlcih7IC4uLnRoaXMuY29tbW9uUGFyYW1zKGhhbmRsZXIpLCBmb3JjZSwgc3RhdHVzLCBsb2dFbnRyeTogZW52TG9nRW50cnkgfSlcblxuICAgICAgZW52TG9nRW50cnkuc2V0U3VjY2VzcyhcIkNvbmZpZ3VyZWRcIilcblxuICAgICAgb3V0cHV0W25hbWVdID0gdHJ1ZVxuICAgIH1cblxuICAgIHJldHVybiBvdXRwdXRcbiAgfVxuXG4gIGFzeW5jIGNsZWFudXBFbnZpcm9ubWVudChcbiAgICB7IHBsdWdpbk5hbWUgfTogQWN0aW9uSGVscGVyUGFyYW1zPENsZWFudXBFbnZpcm9ubWVudFBhcmFtcz4sXG4gICk6IFByb21pc2U8RW52aXJvbm1lbnRTdGF0dXNNYXA+IHtcbiAgICBjb25zdCBoYW5kbGVycyA9IHRoaXMuZ2FyZGVuLmdldEFjdGlvbkhhbmRsZXJzKFwiY2xlYW51cEVudmlyb25tZW50XCIsIHBsdWdpbk5hbWUpXG4gICAgYXdhaXQgQmx1ZWJpcmQuZWFjaCh2YWx1ZXMoaGFuZGxlcnMpLCBoID0+IGgoeyAuLi50aGlzLmNvbW1vblBhcmFtcyhoKSB9KSlcbiAgICByZXR1cm4gdGhpcy5nZXRFbnZpcm9ubWVudFN0YXR1cyh7IHBsdWdpbk5hbWUgfSlcbiAgfVxuXG4gIGFzeW5jIGdldFNlY3JldChwYXJhbXM6IFJlcXVpcmVQbHVnaW5OYW1lPEFjdGlvbkhlbHBlclBhcmFtczxHZXRTZWNyZXRQYXJhbXM+Pik6IFByb21pc2U8R2V0U2VjcmV0UmVzdWx0PiB7XG4gICAgY29uc3QgeyBwbHVnaW5OYW1lIH0gPSBwYXJhbXNcbiAgICByZXR1cm4gdGhpcy5jYWxsQWN0aW9uSGFuZGxlcih7IGFjdGlvblR5cGU6IFwiZ2V0U2VjcmV0XCIsIHBsdWdpbk5hbWUsIHBhcmFtczogb21pdChwYXJhbXMsIFtcInBsdWdpbk5hbWVcIl0pIH0pXG4gIH1cblxuICBhc3luYyBzZXRTZWNyZXQocGFyYW1zOiBSZXF1aXJlUGx1Z2luTmFtZTxBY3Rpb25IZWxwZXJQYXJhbXM8U2V0U2VjcmV0UGFyYW1zPj4pOiBQcm9taXNlPFNldFNlY3JldFJlc3VsdD4ge1xuICAgIGNvbnN0IHsgcGx1Z2luTmFtZSB9ID0gcGFyYW1zXG4gICAgcmV0dXJuIHRoaXMuY2FsbEFjdGlvbkhhbmRsZXIoeyBhY3Rpb25UeXBlOiBcInNldFNlY3JldFwiLCBwbHVnaW5OYW1lLCBwYXJhbXM6IG9taXQocGFyYW1zLCBbXCJwbHVnaW5OYW1lXCJdKSB9KVxuICB9XG5cbiAgYXN5bmMgZGVsZXRlU2VjcmV0KHBhcmFtczogUmVxdWlyZVBsdWdpbk5hbWU8QWN0aW9uSGVscGVyUGFyYW1zPERlbGV0ZVNlY3JldFBhcmFtcz4+KTogUHJvbWlzZTxEZWxldGVTZWNyZXRSZXN1bHQ+IHtcbiAgICBjb25zdCB7IHBsdWdpbk5hbWUgfSA9IHBhcmFtc1xuICAgIHJldHVybiB0aGlzLmNhbGxBY3Rpb25IYW5kbGVyKHsgYWN0aW9uVHlwZTogXCJkZWxldGVTZWNyZXRcIiwgcGx1Z2luTmFtZSwgcGFyYW1zOiBvbWl0KHBhcmFtcywgW1wicGx1Z2luTmFtZVwiXSkgfSlcbiAgfVxuXG4gIC8vZW5kcmVnaW9uXG5cbiAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgLy9yZWdpb24gTW9kdWxlIEFjdGlvbnNcbiAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICBhc3luYyBnZXRCdWlsZFN0YXR1czxUIGV4dGVuZHMgTW9kdWxlPihcbiAgICBwYXJhbXM6IE1vZHVsZUFjdGlvbkhlbHBlclBhcmFtczxHZXRCdWlsZFN0YXR1c1BhcmFtczxUPj4sXG4gICk6IFByb21pc2U8QnVpbGRTdGF0dXM+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsTW9kdWxlSGFuZGxlcih7XG4gICAgICBwYXJhbXMsXG4gICAgICBhY3Rpb25UeXBlOiBcImdldEJ1aWxkU3RhdHVzXCIsXG4gICAgICBkZWZhdWx0SGFuZGxlcjogYXN5bmMgKCkgPT4gKHsgcmVhZHk6IGZhbHNlIH0pLFxuICAgIH0pXG4gIH1cblxuICBhc3luYyBidWlsZDxUIGV4dGVuZHMgTW9kdWxlPihwYXJhbXM6IE1vZHVsZUFjdGlvbkhlbHBlclBhcmFtczxCdWlsZE1vZHVsZVBhcmFtczxUPj4pOiBQcm9taXNlPEJ1aWxkUmVzdWx0PiB7XG4gICAgYXdhaXQgdGhpcy5nYXJkZW4uYnVpbGREaXIuc3luY0RlcGVuZGVuY3lQcm9kdWN0cyhwYXJhbXMubW9kdWxlKVxuICAgIHJldHVybiB0aGlzLmNhbGxNb2R1bGVIYW5kbGVyKHsgcGFyYW1zLCBhY3Rpb25UeXBlOiBcImJ1aWxkXCIgfSlcbiAgfVxuXG4gIGFzeW5jIHB1c2hNb2R1bGU8VCBleHRlbmRzIE1vZHVsZT4ocGFyYW1zOiBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8UHVzaE1vZHVsZVBhcmFtczxUPj4pOiBQcm9taXNlPFB1c2hSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsTW9kdWxlSGFuZGxlcih7IHBhcmFtcywgYWN0aW9uVHlwZTogXCJwdXNoTW9kdWxlXCIsIGRlZmF1bHRIYW5kbGVyOiBkdW1teVB1c2hIYW5kbGVyIH0pXG4gIH1cblxuICBhc3luYyBwdWJsaXNoTW9kdWxlPFQgZXh0ZW5kcyBNb2R1bGU+KFxuICAgIHBhcmFtczogTW9kdWxlQWN0aW9uSGVscGVyUGFyYW1zPFB1Ymxpc2hNb2R1bGVQYXJhbXM8VD4+LFxuICApOiBQcm9taXNlPFB1Ymxpc2hSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsTW9kdWxlSGFuZGxlcih7IHBhcmFtcywgYWN0aW9uVHlwZTogXCJwdWJsaXNoTW9kdWxlXCIsIGRlZmF1bHRIYW5kbGVyOiBkdW1teVB1Ymxpc2hIYW5kbGVyIH0pXG4gIH1cblxuICBhc3luYyBydW5Nb2R1bGU8VCBleHRlbmRzIE1vZHVsZT4ocGFyYW1zOiBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8UnVuTW9kdWxlUGFyYW1zPFQ+Pik6IFByb21pc2U8UnVuUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuY2FsbE1vZHVsZUhhbmRsZXIoeyBwYXJhbXMsIGFjdGlvblR5cGU6IFwicnVuTW9kdWxlXCIgfSlcbiAgfVxuXG4gIGFzeW5jIHRlc3RNb2R1bGU8VCBleHRlbmRzIE1vZHVsZT4ocGFyYW1zOiBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8VGVzdE1vZHVsZVBhcmFtczxUPj4pOiBQcm9taXNlPFRlc3RSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsTW9kdWxlSGFuZGxlcih7IHBhcmFtcywgYWN0aW9uVHlwZTogXCJ0ZXN0TW9kdWxlXCIgfSlcbiAgfVxuXG4gIGFzeW5jIGdldFRlc3RSZXN1bHQ8VCBleHRlbmRzIE1vZHVsZT4oXG4gICAgcGFyYW1zOiBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8R2V0VGVzdFJlc3VsdFBhcmFtczxUPj4sXG4gICk6IFByb21pc2U8VGVzdFJlc3VsdCB8IG51bGw+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsTW9kdWxlSGFuZGxlcih7XG4gICAgICBwYXJhbXMsXG4gICAgICBhY3Rpb25UeXBlOiBcImdldFRlc3RSZXN1bHRcIixcbiAgICAgIGRlZmF1bHRIYW5kbGVyOiBhc3luYyAoKSA9PiBudWxsLFxuICAgIH0pXG4gIH1cblxuICAvL2VuZHJlZ2lvblxuXG4gIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vcmVnaW9uIFNlcnZpY2UgQWN0aW9uc1xuICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gIGFzeW5jIGdldFNlcnZpY2VTdGF0dXMocGFyYW1zOiBTZXJ2aWNlQWN0aW9uSGVscGVyUGFyYW1zPEdldFNlcnZpY2VTdGF0dXNQYXJhbXM+KTogUHJvbWlzZTxTZXJ2aWNlU3RhdHVzPiB7XG4gICAgcmV0dXJuIHRoaXMuY2FsbFNlcnZpY2VIYW5kbGVyKHsgcGFyYW1zLCBhY3Rpb25UeXBlOiBcImdldFNlcnZpY2VTdGF0dXNcIiB9KVxuICB9XG5cbiAgYXN5bmMgZGVwbG95U2VydmljZShwYXJhbXM6IFNlcnZpY2VBY3Rpb25IZWxwZXJQYXJhbXM8RGVwbG95U2VydmljZVBhcmFtcz4pOiBQcm9taXNlPFNlcnZpY2VTdGF0dXM+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsU2VydmljZUhhbmRsZXIoeyBwYXJhbXMsIGFjdGlvblR5cGU6IFwiZGVwbG95U2VydmljZVwiIH0pXG4gIH1cblxuICBhc3luYyBkZWxldGVTZXJ2aWNlKHBhcmFtczogU2VydmljZUFjdGlvbkhlbHBlclBhcmFtczxEZWxldGVTZXJ2aWNlUGFyYW1zPik6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICAgIGNvbnN0IGxvZ0VudHJ5ID0gdGhpcy5nYXJkZW4ubG9nLmluZm8oe1xuICAgICAgc2VjdGlvbjogcGFyYW1zLnNlcnZpY2UubmFtZSxcbiAgICAgIG1zZzogXCJEZWxldGluZy4uLlwiLFxuICAgICAgc3RhdHVzOiBcImFjdGl2ZVwiLFxuICAgIH0pXG4gICAgcmV0dXJuIHRoaXMuY2FsbFNlcnZpY2VIYW5kbGVyKHtcbiAgICAgIHBhcmFtczogeyAuLi5wYXJhbXMsIGxvZ0VudHJ5IH0sXG4gICAgICBhY3Rpb25UeXBlOiBcImRlbGV0ZVNlcnZpY2VcIixcbiAgICAgIGRlZmF1bHRIYW5kbGVyOiBkdW1teURlbGV0ZVNlcnZpY2VIYW5kbGVyLFxuICAgIH0pXG4gIH1cblxuICBhc3luYyBnZXRTZXJ2aWNlT3V0cHV0cyhwYXJhbXM6IFNlcnZpY2VBY3Rpb25IZWxwZXJQYXJhbXM8R2V0U2VydmljZU91dHB1dHNQYXJhbXM+KTogUHJvbWlzZTxQcmltaXRpdmVNYXA+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsU2VydmljZUhhbmRsZXIoe1xuICAgICAgcGFyYW1zLFxuICAgICAgYWN0aW9uVHlwZTogXCJnZXRTZXJ2aWNlT3V0cHV0c1wiLFxuICAgICAgZGVmYXVsdEhhbmRsZXI6IGFzeW5jICgpID0+ICh7fSksXG4gICAgfSlcbiAgfVxuXG4gIGFzeW5jIGV4ZWNJblNlcnZpY2UocGFyYW1zOiBTZXJ2aWNlQWN0aW9uSGVscGVyUGFyYW1zPEV4ZWNJblNlcnZpY2VQYXJhbXM+KTogUHJvbWlzZTxFeGVjSW5TZXJ2aWNlUmVzdWx0PiB7XG4gICAgcmV0dXJuIHRoaXMuY2FsbFNlcnZpY2VIYW5kbGVyKHsgcGFyYW1zLCBhY3Rpb25UeXBlOiBcImV4ZWNJblNlcnZpY2VcIiB9KVxuICB9XG5cbiAgYXN5bmMgZ2V0U2VydmljZUxvZ3MocGFyYW1zOiBTZXJ2aWNlQWN0aW9uSGVscGVyUGFyYW1zPEdldFNlcnZpY2VMb2dzUGFyYW1zPik6IFByb21pc2U8R2V0U2VydmljZUxvZ3NSZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsU2VydmljZUhhbmRsZXIoeyBwYXJhbXMsIGFjdGlvblR5cGU6IFwiZ2V0U2VydmljZUxvZ3NcIiwgZGVmYXVsdEhhbmRsZXI6IGR1bW15TG9nU3RyZWFtZXIgfSlcbiAgfVxuXG4gIGFzeW5jIHJ1blNlcnZpY2UocGFyYW1zOiBTZXJ2aWNlQWN0aW9uSGVscGVyUGFyYW1zPFJ1blNlcnZpY2VQYXJhbXM+KTogUHJvbWlzZTxSdW5SZXN1bHQ+IHtcbiAgICByZXR1cm4gdGhpcy5jYWxsU2VydmljZUhhbmRsZXIoeyBwYXJhbXMsIGFjdGlvblR5cGU6IFwicnVuU2VydmljZVwiIH0pXG4gIH1cblxuICAvL2VuZHJlZ2lvblxuXG4gIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4gIC8vcmVnaW9uIEhlbHBlciBNZXRob2RzXG4gIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgYXN5bmMgZ2V0U3RhdHVzKCk6IFByb21pc2U8Q29udGV4dFN0YXR1cz4ge1xuICAgIGNvbnN0IGVudlN0YXR1czogRW52aXJvbm1lbnRTdGF0dXNNYXAgPSBhd2FpdCB0aGlzLmdldEVudmlyb25tZW50U3RhdHVzKHt9KVxuICAgIGNvbnN0IHNlcnZpY2VzID0ga2V5QnkoYXdhaXQgdGhpcy5nYXJkZW4uZ2V0U2VydmljZXMoKSwgXCJuYW1lXCIpXG5cbiAgICBjb25zdCBzZXJ2aWNlU3RhdHVzID0gYXdhaXQgQmx1ZWJpcmQucHJvcHMobWFwVmFsdWVzKHNlcnZpY2VzLCBhc3luYyAoc2VydmljZTogU2VydmljZSkgPT4ge1xuICAgICAgY29uc3QgZGVwZW5kZW5jaWVzID0gYXdhaXQgdGhpcy5nYXJkZW4uZ2V0U2VydmljZXMoc2VydmljZS5jb25maWcuZGVwZW5kZW5jaWVzKVxuICAgICAgY29uc3QgcnVudGltZUNvbnRleHQgPSBhd2FpdCBwcmVwYXJlUnVudGltZUNvbnRleHQodGhpcy5nYXJkZW4sIHNlcnZpY2UubW9kdWxlLCBkZXBlbmRlbmNpZXMpXG4gICAgICByZXR1cm4gdGhpcy5nZXRTZXJ2aWNlU3RhdHVzKHsgc2VydmljZSwgcnVudGltZUNvbnRleHQgfSlcbiAgICB9KSlcblxuICAgIHJldHVybiB7XG4gICAgICBwcm92aWRlcnM6IGVudlN0YXR1cyxcbiAgICAgIHNlcnZpY2VzOiBzZXJ2aWNlU3RhdHVzLFxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGRlcGxveVNlcnZpY2VzKFxuICAgIHsgc2VydmljZU5hbWVzLCBmb3JjZSA9IGZhbHNlLCBmb3JjZUJ1aWxkID0gZmFsc2UgfTogRGVwbG95U2VydmljZXNQYXJhbXMsXG4gICk6IFByb21pc2U8UHJvY2Vzc1Jlc3VsdHM+IHtcbiAgICBjb25zdCBzZXJ2aWNlcyA9IGF3YWl0IHRoaXMuZ2FyZGVuLmdldFNlcnZpY2VzKHNlcnZpY2VOYW1lcylcblxuICAgIHJldHVybiBwcm9jZXNzU2VydmljZXMoe1xuICAgICAgc2VydmljZXMsXG4gICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgd2F0Y2g6IGZhbHNlLFxuICAgICAgaGFuZGxlcjogYXN5bmMgKG1vZHVsZSkgPT4gZ2V0RGVwbG95VGFza3Moe1xuICAgICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgICBtb2R1bGUsXG4gICAgICAgIHNlcnZpY2VOYW1lcyxcbiAgICAgICAgZm9yY2UsXG4gICAgICAgIGZvcmNlQnVpbGQsXG4gICAgICAgIGluY2x1ZGVEZXBlbmRhbnRzOiBmYWxzZSxcbiAgICAgIH0pLFxuICAgIH0pXG4gIH1cblxuICAvL2VuZHJlZ2lvblxuXG4gIC8vIFRPRE86IGZpbmQgYSBuaWNlciB3YXkgdG8gZG8gdGhpcyAobGlrZSBhIHR5cGUtc2FmZSB3cmFwcGVyIGZ1bmN0aW9uKVxuICBwcml2YXRlIGNvbW1vblBhcmFtcyhoYW5kbGVyLCBsb2dFbnRyeT86IExvZ0VudHJ5KTogUGx1Z2luQWN0aW9uUGFyYW1zQmFzZSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGN0eDogY3JlYXRlUGx1Z2luQ29udGV4dCh0aGlzLmdhcmRlbiwgaGFuZGxlcltcInBsdWdpbk5hbWVcIl0pLFxuICAgICAgLy8gVE9ETzogZmluZCBhIGJldHRlciB3YXkgZm9yIGhhbmRsZXJzIHRvIGxvZyBkdXJpbmcgZXhlY3V0aW9uXG4gICAgICBsb2dFbnRyeSxcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhbGxBY3Rpb25IYW5kbGVyPFQgZXh0ZW5kcyBrZXlvZiBQbHVnaW5BY3Rpb25zPihcbiAgICB7IHBhcmFtcywgYWN0aW9uVHlwZSwgcGx1Z2luTmFtZSwgZGVmYXVsdEhhbmRsZXIgfTpcbiAgICAgIHtcbiAgICAgICAgcGFyYW1zOiBBY3Rpb25IZWxwZXJQYXJhbXM8UGx1Z2luQWN0aW9uUGFyYW1zW1RdPixcbiAgICAgICAgYWN0aW9uVHlwZTogVCxcbiAgICAgICAgcGx1Z2luTmFtZT86IHN0cmluZyxcbiAgICAgICAgZGVmYXVsdEhhbmRsZXI/OiBQbHVnaW5BY3Rpb25zW1RdLFxuICAgICAgfSxcbiAgKTogUHJvbWlzZTxQbHVnaW5BY3Rpb25PdXRwdXRzW1RdPiB7XG4gICAgY29uc3QgaGFuZGxlciA9IHRoaXMuZ2FyZGVuLmdldEFjdGlvbkhhbmRsZXIoe1xuICAgICAgYWN0aW9uVHlwZSxcbiAgICAgIHBsdWdpbk5hbWUsXG4gICAgICBkZWZhdWx0SGFuZGxlcixcbiAgICB9KVxuICAgIGNvbnN0IGhhbmRsZXJQYXJhbXM6IFBsdWdpbkFjdGlvblBhcmFtc1tUXSA9IHtcbiAgICAgIC4uLnRoaXMuY29tbW9uUGFyYW1zKGhhbmRsZXIpLFxuICAgICAgLi4uPG9iamVjdD5wYXJhbXMsXG4gICAgfVxuICAgIHJldHVybiAoPEZ1bmN0aW9uPmhhbmRsZXIpKGhhbmRsZXJQYXJhbXMpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhbGxNb2R1bGVIYW5kbGVyPFQgZXh0ZW5kcyBrZXlvZiBPbWl0PE1vZHVsZUFjdGlvbnMsIFwiZGVzY3JpYmVUeXBlXCIgfCBcInZhbGlkYXRlXCI+PihcbiAgICB7IHBhcmFtcywgYWN0aW9uVHlwZSwgZGVmYXVsdEhhbmRsZXIgfTpcbiAgICAgIHsgcGFyYW1zOiBNb2R1bGVBY3Rpb25IZWxwZXJQYXJhbXM8TW9kdWxlQWN0aW9uUGFyYW1zW1RdPiwgYWN0aW9uVHlwZTogVCwgZGVmYXVsdEhhbmRsZXI/OiBNb2R1bGVBY3Rpb25zW1RdIH0sXG4gICk6IFByb21pc2U8TW9kdWxlQWN0aW9uT3V0cHV0c1tUXT4ge1xuICAgIC8vIHRoZSB0eXBlIHN5c3RlbSBpcyBtZXNzaW5nIG1lIHVwIGhlcmUsIG5vdCBzdXJlIHdoeSBJIG5lZWQgdGhlIGFueSBjYXN0Li4uIC0gai5lLlxuICAgIGNvbnN0IHsgbW9kdWxlLCBwbHVnaW5OYW1lIH0gPSA8YW55PnBhcmFtc1xuICAgIGNvbnN0IGhhbmRsZXIgPSBhd2FpdCB0aGlzLmdhcmRlbi5nZXRNb2R1bGVBY3Rpb25IYW5kbGVyKHtcbiAgICAgIG1vZHVsZVR5cGU6IG1vZHVsZS50eXBlLFxuICAgICAgYWN0aW9uVHlwZSxcbiAgICAgIHBsdWdpbk5hbWUsXG4gICAgICBkZWZhdWx0SGFuZGxlcixcbiAgICB9KVxuICAgIGNvbnN0IGhhbmRsZXJQYXJhbXM6IGFueSA9IHtcbiAgICAgIC4uLnRoaXMuY29tbW9uUGFyYW1zKGhhbmRsZXIpLFxuICAgICAgLi4ub21pdCg8b2JqZWN0PnBhcmFtcywgW1wibW9kdWxlXCJdKSxcbiAgICAgIG1vZHVsZTogb21pdChtb2R1bGUsIFtcIl9Db25maWdUeXBlXCJdKSxcbiAgICB9XG4gICAgLy8gVE9ETzogZmlndXJlIG91dCB3aHkgdGhpcyBkb2Vzbid0IGNvbXBpbGUgd2l0aG91dCB0aGUgZnVuY3Rpb24gY2FzdFxuICAgIHJldHVybiAoPEZ1bmN0aW9uPmhhbmRsZXIpKGhhbmRsZXJQYXJhbXMpXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhbGxTZXJ2aWNlSGFuZGxlcjxUIGV4dGVuZHMga2V5b2YgU2VydmljZUFjdGlvbnM+KFxuICAgIHsgcGFyYW1zLCBhY3Rpb25UeXBlLCBkZWZhdWx0SGFuZGxlciB9OlxuICAgICAgeyBwYXJhbXM6IFNlcnZpY2VBY3Rpb25IZWxwZXJQYXJhbXM8U2VydmljZUFjdGlvblBhcmFtc1tUXT4sIGFjdGlvblR5cGU6IFQsIGRlZmF1bHRIYW5kbGVyPzogU2VydmljZUFjdGlvbnNbVF0gfSxcbiAgKTogUHJvbWlzZTxTZXJ2aWNlQWN0aW9uT3V0cHV0c1tUXT4ge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gPGFueT5wYXJhbXNcbiAgICBjb25zdCBtb2R1bGUgPSBzZXJ2aWNlLm1vZHVsZVxuXG4gICAgY29uc3QgaGFuZGxlciA9IGF3YWl0IHRoaXMuZ2FyZGVuLmdldE1vZHVsZUFjdGlvbkhhbmRsZXIoe1xuICAgICAgbW9kdWxlVHlwZTogbW9kdWxlLnR5cGUsXG4gICAgICBhY3Rpb25UeXBlLFxuICAgICAgcGx1Z2luTmFtZTogcGFyYW1zLnBsdWdpbk5hbWUsXG4gICAgICBkZWZhdWx0SGFuZGxlcixcbiAgICB9KVxuXG4gICAgLy8gVE9ETzogZmlndXJlIG91dCB3aHkgdGhpcyBkb2Vzbid0IGNvbXBpbGUgd2l0aG91dCB0aGUgY2FzdHNcbiAgICBjb25zdCBkZXBzID0gYXdhaXQgdGhpcy5nYXJkZW4uZ2V0U2VydmljZXMoc2VydmljZS5jb25maWcuZGVwZW5kZW5jaWVzKVxuICAgIGNvbnN0IHJ1bnRpbWVDb250ZXh0ID0gKCg8YW55PnBhcmFtcykucnVudGltZUNvbnRleHQgfHwgYXdhaXQgcHJlcGFyZVJ1bnRpbWVDb250ZXh0KHRoaXMuZ2FyZGVuLCBtb2R1bGUsIGRlcHMpKVxuXG4gICAgY29uc3QgaGFuZGxlclBhcmFtczogYW55ID0ge1xuICAgICAgLi4udGhpcy5jb21tb25QYXJhbXMoaGFuZGxlciksXG4gICAgICAuLi48b2JqZWN0PnBhcmFtcyxcbiAgICAgIG1vZHVsZSxcbiAgICAgIHJ1bnRpbWVDb250ZXh0LFxuICAgIH1cblxuICAgIHJldHVybiAoPEZ1bmN0aW9uPmhhbmRsZXIpKGhhbmRsZXJQYXJhbXMpXG4gIH1cbn1cblxuY29uc3QgZHVtbXlMb2dTdHJlYW1lciA9IGFzeW5jICh7IHNlcnZpY2UsIGxvZ0VudHJ5IH06IEdldFNlcnZpY2VMb2dzUGFyYW1zKSA9PiB7XG4gIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5Lndhcm4oe1xuICAgIHNlY3Rpb246IHNlcnZpY2UubmFtZSxcbiAgICBtc2c6IGNoYWxrLnllbGxvdyhgTm8gaGFuZGxlciBmb3IgbG9nIHJldHJpZXZhbCBhdmFpbGFibGUgZm9yIG1vZHVsZSB0eXBlICR7c2VydmljZS5tb2R1bGUudHlwZX1gKSxcbiAgfSlcbiAgcmV0dXJuIHt9XG59XG5cbmNvbnN0IGR1bW15UHVzaEhhbmRsZXIgPSBhc3luYyAoKSA9PiB7XG4gIHJldHVybiB7IHB1c2hlZDogZmFsc2UgfVxufVxuXG5jb25zdCBkdW1teVB1Ymxpc2hIYW5kbGVyID0gYXN5bmMgKHsgbW9kdWxlIH0pID0+IHtcbiAgcmV0dXJuIHtcbiAgICBtZXNzYWdlOiBjaGFsay55ZWxsb3coYE5vIHB1Ymxpc2ggaGFuZGxlciBhdmFpbGFibGUgZm9yIG1vZHVsZSB0eXBlICR7bW9kdWxlLnR5cGV9YCksXG4gICAgcHVibGlzaGVkOiBmYWxzZSxcbiAgfVxufVxuXG5jb25zdCBkdW1teURlbGV0ZVNlcnZpY2VIYW5kbGVyID0gYXN5bmMgKHsgbW9kdWxlLCBsb2dFbnRyeSB9OiBEZWxldGVTZXJ2aWNlUGFyYW1zKSA9PiB7XG4gIGNvbnN0IG1zZyA9IGBObyBkZWxldGUgc2VydmljZSBoYW5kbGVyIGF2YWlsYWJsZSBmb3IgbW9kdWxlIHR5cGUgJHttb2R1bGUudHlwZX1gXG4gIGxvZ0VudHJ5ICYmIGxvZ0VudHJ5LnNldEVycm9yKG1zZylcbiAgcmV0dXJuIHt9XG59XG4iXX0=
