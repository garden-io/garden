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
const common_1 = require("../../config/common");
const service_1 = require("../../types/service");
const path_1 = require("path");
const Joi = require("joi");
const constants_1 = require("../../constants");
const generic_1 = require("../generic");
const common_2 = require("./common");
const service_2 = require("../../config/service");
const gcfServiceSchema = service_2.baseServiceSchema
    .keys({
    entrypoint: Joi.string()
        .description("The entrypoint for the function (exported name in the function's module)"),
    hostname: service_1.ingressHostnameSchema,
    path: Joi.string()
        .default(".")
        .description("The path of the module that contains the function."),
    project: Joi.string()
        .description("The Google Cloud project name of the function."),
})
    .description("Configuration for a Google Cloud Function.");
exports.gcfServicesSchema = common_1.joiArray(gcfServiceSchema)
    .min(1)
    .unique("name")
    .description("List of configurations for one or more Google Cloud Functions.");
const gcfModuleSpecSchema = Joi.object()
    .keys({
    functions: exports.gcfServicesSchema,
    tests: common_1.joiArray(generic_1.genericTestSchema),
});
function parseGcfModule({ moduleConfig }) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: check that each function exists at the specified path
        moduleConfig.spec = common_1.validate(moduleConfig.spec, gcfModuleSpecSchema, { context: `module ${moduleConfig.name}` });
        moduleConfig.serviceConfigs = moduleConfig.spec.functions.map(f => ({
            name: f.name,
            dependencies: f.dependencies,
            outputs: f.outputs,
            spec: f,
        }));
        moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
            name: t.name,
            dependencies: t.dependencies,
            timeout: t.timeout,
            spec: t,
        }));
        return moduleConfig;
    });
}
exports.parseGcfModule = parseGcfModule;
exports.gardenPlugin = () => ({
    actions: {
        getEnvironmentStatus: common_2.getEnvironmentStatus,
        prepareEnvironment: common_2.prepareEnvironment,
    },
    moduleActions: {
        "google-cloud-function": {
            validate: parseGcfModule,
            deployService({ ctx, module, service, runtimeContext, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO: provide env vars somehow to function
                    const project = common_2.getProject(service, ctx.provider);
                    const functionPath = path_1.resolve(service.module.path, service.spec.path);
                    const entrypoint = service.spec.entrypoint || service.name;
                    yield common_2.gcloud(project).call([
                        "beta", "functions",
                        "deploy", service.name,
                        `--source=${functionPath}`,
                        `--entry-point=${entrypoint}`,
                        // TODO: support other trigger types
                        "--trigger-http",
                    ]);
                    return getServiceStatus({ ctx, module, service, runtimeContext, logEntry });
                });
            },
            getServiceOutputs({ ctx, service }) {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO: we may want to pull this from the service status instead, along with other outputs
                    const project = common_2.getProject(service, ctx.provider);
                    return {
                        ingress: `https://${common_2.GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
                    };
                });
            },
        },
    },
});
function getServiceStatus({ ctx, service }) {
    return __awaiter(this, void 0, void 0, function* () {
        const project = common_2.getProject(service, ctx.provider);
        const functions = yield common_2.gcloud(project).json(["beta", "functions", "list"]);
        const providerId = `projects/${project}/locations/${common_2.GOOGLE_CLOUD_DEFAULT_REGION}/functions/${service.name}`;
        const status = functions.filter(f => f.name === providerId)[0];
        if (!status) {
            // not deployed yet
            return {};
        }
        // TODO: map states properly
        const state = status.status === "ACTIVE" ? "ready" : "unhealthy";
        return {
            providerId,
            providerVersion: status.versionId,
            version: status.labels[constants_1.GARDEN_ANNOTATION_KEYS_VERSION],
            state,
            updatedAt: status.updateTime,
            detail: status,
        };
    });
}
exports.getServiceStatus = getServiceStatus;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvZ29vZ2xlL2dvb2dsZS1jbG91ZC1mdW5jdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGdEQUc0QjtBQVM1QixpREFBd0Y7QUFDeEYsK0JBRWE7QUFDYiwyQkFBMEI7QUFDMUIsK0NBQWdFO0FBQ2hFLHdDQUErRDtBQUMvRCxxQ0FPaUI7QUFHakIsa0RBQXdEO0FBU3hELE1BQU0sZ0JBQWdCLEdBQUcsMkJBQWlCO0tBQ3ZDLElBQUksQ0FBQztJQUNKLFVBQVUsRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFO1NBQ3JCLFdBQVcsQ0FBQywwRUFBMEUsQ0FBQztJQUMxRixRQUFRLEVBQUUsK0JBQXFCO0lBQy9CLElBQUksRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFO1NBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQztTQUNaLFdBQVcsQ0FBQyxvREFBb0QsQ0FBQztJQUNwRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtTQUNsQixXQUFXLENBQUMsZ0RBQWdELENBQUM7Q0FDakUsQ0FBQztLQUNELFdBQVcsQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFBO0FBRS9DLFFBQUEsaUJBQWlCLEdBQUcsaUJBQVEsQ0FBQyxnQkFBZ0IsQ0FBQztLQUN4RCxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ04sTUFBTSxDQUFDLE1BQU0sQ0FBQztLQUNkLFdBQVcsQ0FBQyxnRUFBZ0UsQ0FBQyxDQUFBO0FBT2hGLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRTtLQUNyQyxJQUFJLENBQUM7SUFDSixTQUFTLEVBQUUseUJBQWlCO0lBQzVCLEtBQUssRUFBRSxpQkFBUSxDQUFDLDJCQUFpQixDQUFDO0NBQ25DLENBQUMsQ0FBQTtBQUlKLFNBQXNCLGNBQWMsQ0FDbEMsRUFBRSxZQUFZLEVBQW1DOztRQUVqRCw4REFBOEQ7UUFDOUQsWUFBWSxDQUFDLElBQUksR0FBRyxpQkFBUSxDQUMxQixZ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LENBQUMsQ0FBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUE7UUFDbEYsTUFBTSxVQUFVLEdBQUcsWUFBWSxPQUFPLGNBQWMsb0NBQTJCLGNBQWMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFBO1FBRTNHLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1FBRTlELElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDWCxtQkFBbUI7WUFDbkIsT0FBTyxFQUFFLENBQUE7U0FDVjtRQUVELDRCQUE0QjtRQUM1QixNQUFNLEtBQUssR0FBaUIsTUFBTSxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFBO1FBRTlFLE9BQU87WUFDTCxVQUFVO1lBQ1YsZUFBZSxFQUFFLE1BQU0sQ0FBQyxTQUFTO1lBQ2pDLE9BQU8sRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLDBDQUE4QixDQUFDO1lBQ3RELEtBQUs7WUFDTCxTQUFTLEVBQUUsTUFBTSxDQUFDLFVBQVU7WUFDNUIsTUFBTSxFQUFFLE1BQU07U0FDZixDQUFBO0lBQ0gsQ0FBQztDQUFBO0FBekJELDRDQXlCQyIsImZpbGUiOiJwbHVnaW5zL2dvb2dsZS9nb29nbGUtY2xvdWQtZnVuY3Rpb25zLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7XG4gIGpvaUFycmF5LFxuICB2YWxpZGF0ZSxcbn0gZnJvbSBcIi4uLy4uL2NvbmZpZy9jb21tb25cIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uLy4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBWYWxpZGF0ZU1vZHVsZVJlc3VsdCB9IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQge1xuICBEZXBsb3lTZXJ2aWNlUGFyYW1zLFxuICBHZXRTZXJ2aWNlT3V0cHV0c1BhcmFtcyxcbiAgR2V0U2VydmljZVN0YXR1c1BhcmFtcyxcbiAgVmFsaWRhdGVNb2R1bGVQYXJhbXMsXG59IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IFNlcnZpY2VTdGF0ZSwgU2VydmljZVN0YXR1cywgaW5ncmVzc0hvc3RuYW1lU2NoZW1hIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHtcbiAgcmVzb2x2ZSxcbn0gZnJvbSBcInBhdGhcIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IHsgR0FSREVOX0FOTk9UQVRJT05fS0VZU19WRVJTSU9OIH0gZnJvbSBcIi4uLy4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBHZW5lcmljVGVzdFNwZWMsIGdlbmVyaWNUZXN0U2NoZW1hIH0gZnJvbSBcIi4uL2dlbmVyaWNcIlxuaW1wb3J0IHtcbiAgcHJlcGFyZUVudmlyb25tZW50LFxuICBnY2xvdWQsXG4gIGdldEVudmlyb25tZW50U3RhdHVzLFxuICBnZXRQcm9qZWN0LFxuICBHT09HTEVfQ0xPVURfREVGQVVMVF9SRUdJT04sXG4gIEdvb2dsZUNsb3VkU2VydmljZVNwZWMsXG59IGZyb20gXCIuL2NvbW1vblwiXG5pbXBvcnQgeyBHYXJkZW5QbHVnaW4gfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQgeyBNb2R1bGVTcGVjIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9tb2R1bGVcIlxuaW1wb3J0IHsgYmFzZVNlcnZpY2VTY2hlbWEgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3NlcnZpY2VcIlxuXG5leHBvcnQgaW50ZXJmYWNlIEdjZlNlcnZpY2VTcGVjIGV4dGVuZHMgR29vZ2xlQ2xvdWRTZXJ2aWNlU3BlYyB7XG4gIGVudHJ5cG9pbnQ/OiBzdHJpbmcsXG4gIGZ1bmN0aW9uOiBzdHJpbmcsXG4gIGhvc3RuYW1lPzogc3RyaW5nXG4gIHBhdGg6IHN0cmluZyxcbn1cblxuY29uc3QgZ2NmU2VydmljZVNjaGVtYSA9IGJhc2VTZXJ2aWNlU2NoZW1hXG4gIC5rZXlzKHtcbiAgICBlbnRyeXBvaW50OiBKb2kuc3RyaW5nKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBlbnRyeXBvaW50IGZvciB0aGUgZnVuY3Rpb24gKGV4cG9ydGVkIG5hbWUgaW4gdGhlIGZ1bmN0aW9uJ3MgbW9kdWxlKVwiKSxcbiAgICBob3N0bmFtZTogaW5ncmVzc0hvc3RuYW1lU2NoZW1hLFxuICAgIHBhdGg6IEpvaS5zdHJpbmcoKVxuICAgICAgLmRlZmF1bHQoXCIuXCIpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgcGF0aCBvZiB0aGUgbW9kdWxlIHRoYXQgY29udGFpbnMgdGhlIGZ1bmN0aW9uLlwiKSxcbiAgICBwcm9qZWN0OiBKb2kuc3RyaW5nKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBHb29nbGUgQ2xvdWQgcHJvamVjdCBuYW1lIG9mIHRoZSBmdW5jdGlvbi5cIiksXG4gIH0pXG4gIC5kZXNjcmlwdGlvbihcIkNvbmZpZ3VyYXRpb24gZm9yIGEgR29vZ2xlIENsb3VkIEZ1bmN0aW9uLlwiKVxuXG5leHBvcnQgY29uc3QgZ2NmU2VydmljZXNTY2hlbWEgPSBqb2lBcnJheShnY2ZTZXJ2aWNlU2NoZW1hKVxuICAubWluKDEpXG4gIC51bmlxdWUoXCJuYW1lXCIpXG4gIC5kZXNjcmlwdGlvbihcIkxpc3Qgb2YgY29uZmlndXJhdGlvbnMgZm9yIG9uZSBvciBtb3JlIEdvb2dsZSBDbG91ZCBGdW5jdGlvbnMuXCIpXG5cbmV4cG9ydCBpbnRlcmZhY2UgR2NmTW9kdWxlU3BlYyBleHRlbmRzIE1vZHVsZVNwZWMge1xuICBmdW5jdGlvbnM6IEdjZlNlcnZpY2VTcGVjW10sXG4gIHRlc3RzOiBHZW5lcmljVGVzdFNwZWNbXSxcbn1cblxuY29uc3QgZ2NmTW9kdWxlU3BlY1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgZnVuY3Rpb25zOiBnY2ZTZXJ2aWNlc1NjaGVtYSxcbiAgICB0ZXN0czogam9pQXJyYXkoZ2VuZXJpY1Rlc3RTY2hlbWEpLFxuICB9KVxuXG5leHBvcnQgaW50ZXJmYWNlIEdjZk1vZHVsZSBleHRlbmRzIE1vZHVsZTxHY2ZNb2R1bGVTcGVjLCBHY2ZTZXJ2aWNlU3BlYywgR2VuZXJpY1Rlc3RTcGVjPiB7IH1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlR2NmTW9kdWxlKFxuICB7IG1vZHVsZUNvbmZpZyB9OiBWYWxpZGF0ZU1vZHVsZVBhcmFtczxHY2ZNb2R1bGU+LFxuKTogUHJvbWlzZTxWYWxpZGF0ZU1vZHVsZVJlc3VsdDxHY2ZNb2R1bGU+PiB7XG4gIC8vIFRPRE86IGNoZWNrIHRoYXQgZWFjaCBmdW5jdGlvbiBleGlzdHMgYXQgdGhlIHNwZWNpZmllZCBwYXRoXG4gIG1vZHVsZUNvbmZpZy5zcGVjID0gdmFsaWRhdGUoXG4gICAgbW9kdWxlQ29uZmlnLnNwZWMsIGdjZk1vZHVsZVNwZWNTY2hlbWEsIHsgY29udGV4dDogYG1vZHVsZSAke21vZHVsZUNvbmZpZy5uYW1lfWAgfSxcbiAgKVxuXG4gIG1vZHVsZUNvbmZpZy5zZXJ2aWNlQ29uZmlncyA9IG1vZHVsZUNvbmZpZy5zcGVjLmZ1bmN0aW9ucy5tYXAoZiA9PiAoe1xuICAgIG5hbWU6IGYubmFtZSxcbiAgICBkZXBlbmRlbmNpZXM6IGYuZGVwZW5kZW5jaWVzLFxuICAgIG91dHB1dHM6IGYub3V0cHV0cyxcbiAgICBzcGVjOiBmLFxuICB9KSlcblxuICBtb2R1bGVDb25maWcudGVzdENvbmZpZ3MgPSBtb2R1bGVDb25maWcuc3BlYy50ZXN0cy5tYXAodCA9PiAoe1xuICAgIG5hbWU6IHQubmFtZSxcbiAgICBkZXBlbmRlbmNpZXM6IHQuZGVwZW5kZW5jaWVzLFxuICAgIHRpbWVvdXQ6IHQudGltZW91dCxcbiAgICBzcGVjOiB0LFxuICB9KSlcblxuICByZXR1cm4gbW9kdWxlQ29uZmlnXG59XG5cbmV4cG9ydCBjb25zdCBnYXJkZW5QbHVnaW4gPSAoKTogR2FyZGVuUGx1Z2luID0+ICh7XG4gIGFjdGlvbnM6IHtcbiAgICBnZXRFbnZpcm9ubWVudFN0YXR1cyxcbiAgICBwcmVwYXJlRW52aXJvbm1lbnQsXG4gIH0sXG4gIG1vZHVsZUFjdGlvbnM6IHtcbiAgICBcImdvb2dsZS1jbG91ZC1mdW5jdGlvblwiOiB7XG4gICAgICB2YWxpZGF0ZTogcGFyc2VHY2ZNb2R1bGUsXG5cbiAgICAgIGFzeW5jIGRlcGxveVNlcnZpY2UoXG4gICAgICAgIHsgY3R4LCBtb2R1bGUsIHNlcnZpY2UsIHJ1bnRpbWVDb250ZXh0LCBsb2dFbnRyeSB9OiBEZXBsb3lTZXJ2aWNlUGFyYW1zPEdjZk1vZHVsZT4sXG4gICAgICApIHtcbiAgICAgICAgLy8gVE9ETzogcHJvdmlkZSBlbnYgdmFycyBzb21laG93IHRvIGZ1bmN0aW9uXG4gICAgICAgIGNvbnN0IHByb2plY3QgPSBnZXRQcm9qZWN0KHNlcnZpY2UsIGN0eC5wcm92aWRlcilcbiAgICAgICAgY29uc3QgZnVuY3Rpb25QYXRoID0gcmVzb2x2ZShzZXJ2aWNlLm1vZHVsZS5wYXRoLCBzZXJ2aWNlLnNwZWMucGF0aClcbiAgICAgICAgY29uc3QgZW50cnlwb2ludCA9IHNlcnZpY2Uuc3BlYy5lbnRyeXBvaW50IHx8IHNlcnZpY2UubmFtZVxuXG4gICAgICAgIGF3YWl0IGdjbG91ZChwcm9qZWN0KS5jYWxsKFtcbiAgICAgICAgICBcImJldGFcIiwgXCJmdW5jdGlvbnNcIixcbiAgICAgICAgICBcImRlcGxveVwiLCBzZXJ2aWNlLm5hbWUsXG4gICAgICAgICAgYC0tc291cmNlPSR7ZnVuY3Rpb25QYXRofWAsXG4gICAgICAgICAgYC0tZW50cnktcG9pbnQ9JHtlbnRyeXBvaW50fWAsXG4gICAgICAgICAgLy8gVE9ETzogc3VwcG9ydCBvdGhlciB0cmlnZ2VyIHR5cGVzXG4gICAgICAgICAgXCItLXRyaWdnZXItaHR0cFwiLFxuICAgICAgICBdKVxuXG4gICAgICAgIHJldHVybiBnZXRTZXJ2aWNlU3RhdHVzKHsgY3R4LCBtb2R1bGUsIHNlcnZpY2UsIHJ1bnRpbWVDb250ZXh0LCBsb2dFbnRyeSB9KVxuICAgICAgfSxcblxuICAgICAgYXN5bmMgZ2V0U2VydmljZU91dHB1dHMoeyBjdHgsIHNlcnZpY2UgfTogR2V0U2VydmljZU91dHB1dHNQYXJhbXM8R2NmTW9kdWxlPikge1xuICAgICAgICAvLyBUT0RPOiB3ZSBtYXkgd2FudCB0byBwdWxsIHRoaXMgZnJvbSB0aGUgc2VydmljZSBzdGF0dXMgaW5zdGVhZCwgYWxvbmcgd2l0aCBvdGhlciBvdXRwdXRzXG4gICAgICAgIGNvbnN0IHByb2plY3QgPSBnZXRQcm9qZWN0KHNlcnZpY2UsIGN0eC5wcm92aWRlcilcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGluZ3Jlc3M6IGBodHRwczovLyR7R09PR0xFX0NMT1VEX0RFRkFVTFRfUkVHSU9OfS0ke3Byb2plY3R9LmNsb3VkZnVuY3Rpb25zLm5ldC8ke3NlcnZpY2UubmFtZX1gLFxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U2VydmljZVN0YXR1cyhcbiAgeyBjdHgsIHNlcnZpY2UgfTogR2V0U2VydmljZVN0YXR1c1BhcmFtczxHY2ZNb2R1bGU+LFxuKTogUHJvbWlzZTxTZXJ2aWNlU3RhdHVzPiB7XG4gIGNvbnN0IHByb2plY3QgPSBnZXRQcm9qZWN0KHNlcnZpY2UsIGN0eC5wcm92aWRlcilcbiAgY29uc3QgZnVuY3Rpb25zOiBhbnlbXSA9IGF3YWl0IGdjbG91ZChwcm9qZWN0KS5qc29uKFtcImJldGFcIiwgXCJmdW5jdGlvbnNcIiwgXCJsaXN0XCJdKVxuICBjb25zdCBwcm92aWRlcklkID0gYHByb2plY3RzLyR7cHJvamVjdH0vbG9jYXRpb25zLyR7R09PR0xFX0NMT1VEX0RFRkFVTFRfUkVHSU9OfS9mdW5jdGlvbnMvJHtzZXJ2aWNlLm5hbWV9YFxuXG4gIGNvbnN0IHN0YXR1cyA9IGZ1bmN0aW9ucy5maWx0ZXIoZiA9PiBmLm5hbWUgPT09IHByb3ZpZGVySWQpWzBdXG5cbiAgaWYgKCFzdGF0dXMpIHtcbiAgICAvLyBub3QgZGVwbG95ZWQgeWV0XG4gICAgcmV0dXJuIHt9XG4gIH1cblxuICAvLyBUT0RPOiBtYXAgc3RhdGVzIHByb3Blcmx5XG4gIGNvbnN0IHN0YXRlOiBTZXJ2aWNlU3RhdGUgPSBzdGF0dXMuc3RhdHVzID09PSBcIkFDVElWRVwiID8gXCJyZWFkeVwiIDogXCJ1bmhlYWx0aHlcIlxuXG4gIHJldHVybiB7XG4gICAgcHJvdmlkZXJJZCxcbiAgICBwcm92aWRlclZlcnNpb246IHN0YXR1cy52ZXJzaW9uSWQsXG4gICAgdmVyc2lvbjogc3RhdHVzLmxhYmVsc1tHQVJERU5fQU5OT1RBVElPTl9LRVlTX1ZFUlNJT05dLFxuICAgIHN0YXRlLFxuICAgIHVwZGF0ZWRBdDogc3RhdHVzLnVwZGF0ZVRpbWUsXG4gICAgZGV0YWlsOiBzdGF0dXMsXG4gIH1cbn1cbiJdfQ==
