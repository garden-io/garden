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
const lodash_1 = require("lodash");
const Bluebird = require("bluebird");
const chalk_1 = require("chalk");
const base_1 = require("./base");
const service_1 = require("../types/service");
const watch_1 = require("../watch");
const util_1 = require("../util/util");
const push_1 = require("./push");
class DeployTask extends base_1.Task {
    constructor({ garden, service, force, forceBuild, logEntry }) {
        super({ garden, force, version: service.module.version });
        this.type = "deploy";
        this.service = service;
        this.forceBuild = forceBuild;
        this.logEntry = logEntry;
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            const serviceDeps = this.service.config.dependencies;
            const services = yield this.garden.getServices(serviceDeps);
            const deps = yield Bluebird.map(services, (service) => __awaiter(this, void 0, void 0, function* () {
                return new DeployTask({
                    garden: this.garden,
                    service,
                    force: false,
                    forceBuild: this.forceBuild,
                });
            }));
            deps.push(new push_1.PushTask({
                garden: this.garden,
                module: this.service.module,
                forceBuild: this.forceBuild,
            }));
            return deps;
        });
    }
    getName() {
        return this.service.name;
    }
    getDescription() {
        return `deploying service ${this.service.name} (from module ${this.service.module.name})`;
    }
    process() {
        return __awaiter(this, void 0, void 0, function* () {
            const logEntry = (this.logEntry || this.garden.log).info({
                section: this.service.name,
                msg: "Checking status",
                status: "active",
            });
            // TODO: get version from build task results
            const { versionString } = yield this.service.module.version;
            const status = yield this.garden.actions.getServiceStatus({ service: this.service, logEntry });
            if (!this.force &&
                versionString === status.version &&
                status.state === "ready") {
                // already deployed and ready
                logEntry.setSuccess({
                    msg: `Version ${versionString} already deployed`,
                    append: true,
                });
                return status;
            }
            logEntry.setState("Deploying");
            const dependencies = yield this.garden.getServices(this.service.config.dependencies);
            let result;
            try {
                result = yield this.garden.actions.deployService({
                    service: this.service,
                    runtimeContext: yield service_1.prepareRuntimeContext(this.garden, this.service.module, dependencies),
                    logEntry,
                    force: this.force,
                });
            }
            catch (err) {
                logEntry.setError();
                throw err;
            }
            logEntry.setSuccess({ msg: chalk_1.default.green(`Ready`), append: true });
            return result;
        });
    }
}
exports.DeployTask = DeployTask;
function getDeployTasks({ garden, module, serviceNames, force = false, forceBuild = false, includeDependants = false }) {
    return __awaiter(this, void 0, void 0, function* () {
        const modulesToProcess = includeDependants
            ? (yield watch_1.withDependants(garden, [module], yield watch_1.computeAutoReloadDependants(garden)))
            : [module];
        const moduleServices = lodash_1.flatten(yield Bluebird.map(modulesToProcess, m => garden.getServices(util_1.getNames(m.serviceConfigs))));
        const servicesToProcess = serviceNames
            ? moduleServices.filter(s => serviceNames.includes(s.name))
            : moduleServices;
        return servicesToProcess.map(service => new DeployTask({ garden, service, force, forceBuild }));
    });
}
exports.getDeployTasks = getDeployTasks;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFpQixHQUFHLEtBQUssRUFJekY7O1FBR0gsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUI7WUFDeEMsQ0FBQyxDQUFDLENBQUMsTUFBTSxzQkFBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLE1BQU0sbUNBQTJCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNyRixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUVaLE1BQU0sY0FBYyxHQUFHLGdCQUFPLENBQUMsTUFBTSxRQUFRLENBQUMsR0FBRyxDQUMvQyxnQkFBZ0IsRUFDaEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQVEsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFFdkQsTUFBTSxpQkFBaUIsR0FBRyxZQUFZO1lBQ3BDLENBQUMsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0QsQ0FBQyxDQUFDLGNBQWMsQ0FBQTtRQUVsQixPQUFPLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksVUFBVSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQ2pHLENBQUM7Q0FBQTtBQXJCRCx3Q0FxQkMiLCJmaWxlIjoidGFza3MvZGVwbG95LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGZsYXR0ZW4gfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCAqIGFzIEJsdWViaXJkIGZyb20gXCJibHVlYmlyZFwiXG5pbXBvcnQgY2hhbGsgZnJvbSBcImNoYWxrXCJcbmltcG9ydCB7IExvZ0VudHJ5IH0gZnJvbSBcIi4uL2xvZ2dlci9sb2ctZW50cnlcIlxuaW1wb3J0IHsgVGFzayB9IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHtcbiAgU2VydmljZSxcbiAgU2VydmljZVN0YXR1cyxcbiAgcHJlcGFyZVJ1bnRpbWVDb250ZXh0LFxufSBmcm9tIFwiLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7IHdpdGhEZXBlbmRhbnRzLCBjb21wdXRlQXV0b1JlbG9hZERlcGVuZGFudHMgfSBmcm9tIFwiLi4vd2F0Y2hcIlxuaW1wb3J0IHsgZ2V0TmFtZXMgfSBmcm9tIFwiLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuaW1wb3J0IHsgUHVzaFRhc2sgfSBmcm9tIFwiLi9wdXNoXCJcblxuZXhwb3J0IGludGVyZmFjZSBEZXBsb3lUYXNrUGFyYW1zIHtcbiAgZ2FyZGVuOiBHYXJkZW5cbiAgc2VydmljZTogU2VydmljZVxuICBmb3JjZTogYm9vbGVhblxuICBmb3JjZUJ1aWxkOiBib29sZWFuXG4gIGxvZ0VudHJ5PzogTG9nRW50cnlcbn1cblxuZXhwb3J0IGNsYXNzIERlcGxveVRhc2sgZXh0ZW5kcyBUYXNrIHtcbiAgdHlwZSA9IFwiZGVwbG95XCJcblxuICBwcml2YXRlIHNlcnZpY2U6IFNlcnZpY2VcbiAgcHJpdmF0ZSBmb3JjZUJ1aWxkOiBib29sZWFuXG4gIHByaXZhdGUgbG9nRW50cnk/OiBMb2dFbnRyeVxuXG4gIGNvbnN0cnVjdG9yKHsgZ2FyZGVuLCBzZXJ2aWNlLCBmb3JjZSwgZm9yY2VCdWlsZCwgbG9nRW50cnkgfTogRGVwbG95VGFza1BhcmFtcykge1xuICAgIHN1cGVyKHsgZ2FyZGVuLCBmb3JjZSwgdmVyc2lvbjogc2VydmljZS5tb2R1bGUudmVyc2lvbiB9KVxuICAgIHRoaXMuc2VydmljZSA9IHNlcnZpY2VcbiAgICB0aGlzLmZvcmNlQnVpbGQgPSBmb3JjZUJ1aWxkXG4gICAgdGhpcy5sb2dFbnRyeSA9IGxvZ0VudHJ5XG4gIH1cblxuICBhc3luYyBnZXREZXBlbmRlbmNpZXMoKSB7XG4gICAgY29uc3Qgc2VydmljZURlcHMgPSB0aGlzLnNlcnZpY2UuY29uZmlnLmRlcGVuZGVuY2llc1xuICAgIGNvbnN0IHNlcnZpY2VzID0gYXdhaXQgdGhpcy5nYXJkZW4uZ2V0U2VydmljZXMoc2VydmljZURlcHMpXG5cbiAgICBjb25zdCBkZXBzOiBUYXNrW10gPSBhd2FpdCBCbHVlYmlyZC5tYXAoc2VydmljZXMsIGFzeW5jIChzZXJ2aWNlKSA9PiB7XG4gICAgICByZXR1cm4gbmV3IERlcGxveVRhc2soe1xuICAgICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgICBzZXJ2aWNlLFxuICAgICAgICBmb3JjZTogZmFsc2UsXG4gICAgICAgIGZvcmNlQnVpbGQ6IHRoaXMuZm9yY2VCdWlsZCxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIGRlcHMucHVzaChuZXcgUHVzaFRhc2soe1xuICAgICAgZ2FyZGVuOiB0aGlzLmdhcmRlbixcbiAgICAgIG1vZHVsZTogdGhpcy5zZXJ2aWNlLm1vZHVsZSxcbiAgICAgIGZvcmNlQnVpbGQ6IHRoaXMuZm9yY2VCdWlsZCxcbiAgICB9KSlcblxuICAgIHJldHVybiBkZXBzXG4gIH1cblxuICBwcm90ZWN0ZWQgZ2V0TmFtZSgpIHtcbiAgICByZXR1cm4gdGhpcy5zZXJ2aWNlLm5hbWVcbiAgfVxuXG4gIGdldERlc2NyaXB0aW9uKCkge1xuICAgIHJldHVybiBgZGVwbG95aW5nIHNlcnZpY2UgJHt0aGlzLnNlcnZpY2UubmFtZX0gKGZyb20gbW9kdWxlICR7dGhpcy5zZXJ2aWNlLm1vZHVsZS5uYW1lfSlgXG4gIH1cblxuICBhc3luYyBwcm9jZXNzKCk6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICAgIGNvbnN0IGxvZ0VudHJ5ID0gKHRoaXMubG9nRW50cnkgfHwgdGhpcy5nYXJkZW4ubG9nKS5pbmZvKHtcbiAgICAgIHNlY3Rpb246IHRoaXMuc2VydmljZS5uYW1lLFxuICAgICAgbXNnOiBcIkNoZWNraW5nIHN0YXR1c1wiLFxuICAgICAgc3RhdHVzOiBcImFjdGl2ZVwiLFxuICAgIH0pXG5cbiAgICAvLyBUT0RPOiBnZXQgdmVyc2lvbiBmcm9tIGJ1aWxkIHRhc2sgcmVzdWx0c1xuICAgIGNvbnN0IHsgdmVyc2lvblN0cmluZyB9ID0gYXdhaXQgdGhpcy5zZXJ2aWNlLm1vZHVsZS52ZXJzaW9uXG4gICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgdGhpcy5nYXJkZW4uYWN0aW9ucy5nZXRTZXJ2aWNlU3RhdHVzKHsgc2VydmljZTogdGhpcy5zZXJ2aWNlLCBsb2dFbnRyeSB9KVxuXG4gICAgaWYgKFxuICAgICAgIXRoaXMuZm9yY2UgJiZcbiAgICAgIHZlcnNpb25TdHJpbmcgPT09IHN0YXR1cy52ZXJzaW9uICYmXG4gICAgICBzdGF0dXMuc3RhdGUgPT09IFwicmVhZHlcIlxuICAgICkge1xuICAgICAgLy8gYWxyZWFkeSBkZXBsb3llZCBhbmQgcmVhZHlcbiAgICAgIGxvZ0VudHJ5LnNldFN1Y2Nlc3Moe1xuICAgICAgICBtc2c6IGBWZXJzaW9uICR7dmVyc2lvblN0cmluZ30gYWxyZWFkeSBkZXBsb3llZGAsXG4gICAgICAgIGFwcGVuZDogdHJ1ZSxcbiAgICAgIH0pXG4gICAgICByZXR1cm4gc3RhdHVzXG4gICAgfVxuXG4gICAgbG9nRW50cnkuc2V0U3RhdGUoXCJEZXBsb3lpbmdcIilcblxuICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuZ2FyZGVuLmdldFNlcnZpY2VzKHRoaXMuc2VydmljZS5jb25maWcuZGVwZW5kZW5jaWVzKVxuXG4gICAgbGV0IHJlc3VsdDogU2VydmljZVN0YXR1c1xuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmdhcmRlbi5hY3Rpb25zLmRlcGxveVNlcnZpY2Uoe1xuICAgICAgICBzZXJ2aWNlOiB0aGlzLnNlcnZpY2UsXG4gICAgICAgIHJ1bnRpbWVDb250ZXh0OiBhd2FpdCBwcmVwYXJlUnVudGltZUNvbnRleHQodGhpcy5nYXJkZW4sIHRoaXMuc2VydmljZS5tb2R1bGUsIGRlcGVuZGVuY2llcyksXG4gICAgICAgIGxvZ0VudHJ5LFxuICAgICAgICBmb3JjZTogdGhpcy5mb3JjZSxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2dFbnRyeS5zZXRFcnJvcigpXG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG5cbiAgICBsb2dFbnRyeS5zZXRTdWNjZXNzKHsgbXNnOiBjaGFsay5ncmVlbihgUmVhZHlgKSwgYXBwZW5kOiB0cnVlIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXREZXBsb3lUYXNrcyhcbiAgeyBnYXJkZW4sIG1vZHVsZSwgc2VydmljZU5hbWVzLCBmb3JjZSA9IGZhbHNlLCBmb3JjZUJ1aWxkID0gZmFsc2UsIGluY2x1ZGVEZXBlbmRhbnRzID0gZmFsc2UgfTpcbiAgICB7XG4gICAgICBnYXJkZW46IEdhcmRlbiwgbW9kdWxlOiBNb2R1bGUsIHNlcnZpY2VOYW1lcz86IHN0cmluZ1tdIHwgbnVsbCxcbiAgICAgIGZvcmNlPzogYm9vbGVhbiwgZm9yY2VCdWlsZD86IGJvb2xlYW4sIGluY2x1ZGVEZXBlbmRhbnRzPzogYm9vbGVhbixcbiAgICB9LFxuKSB7XG5cbiAgY29uc3QgbW9kdWxlc1RvUHJvY2VzcyA9IGluY2x1ZGVEZXBlbmRhbnRzXG4gICAgPyAoYXdhaXQgd2l0aERlcGVuZGFudHMoZ2FyZGVuLCBbbW9kdWxlXSwgYXdhaXQgY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzKGdhcmRlbikpKVxuICAgIDogW21vZHVsZV1cblxuICBjb25zdCBtb2R1bGVTZXJ2aWNlcyA9IGZsYXR0ZW4oYXdhaXQgQmx1ZWJpcmQubWFwKFxuICAgIG1vZHVsZXNUb1Byb2Nlc3MsXG4gICAgbSA9PiBnYXJkZW4uZ2V0U2VydmljZXMoZ2V0TmFtZXMobS5zZXJ2aWNlQ29uZmlncykpKSlcblxuICBjb25zdCBzZXJ2aWNlc1RvUHJvY2VzcyA9IHNlcnZpY2VOYW1lc1xuICAgID8gbW9kdWxlU2VydmljZXMuZmlsdGVyKHMgPT4gc2VydmljZU5hbWVzLmluY2x1ZGVzKHMubmFtZSkpXG4gICAgOiBtb2R1bGVTZXJ2aWNlc1xuXG4gIHJldHVybiBzZXJ2aWNlc1RvUHJvY2Vzcy5tYXAoc2VydmljZSA9PiBuZXcgRGVwbG95VGFzayh7IGdhcmRlbiwgc2VydmljZSwgZm9yY2UsIGZvcmNlQnVpbGQgfSkpXG59XG4iXX0=
