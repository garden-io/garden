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
const lodash_1 = require("lodash");
const path_1 = require("path");
const common_1 = require("../config/common");
const test_1 = require("../config/test");
const base_1 = require("../vcs/base");
const constants_1 = require("../constants");
const execa = require("execa");
exports.name = "generic";
exports.genericTestSchema = test_1.baseTestSpecSchema
    .keys({
    command: Joi.array().items(Joi.string())
        .description("The command to run in the module build context in order to test it."),
    env: common_1.joiEnvVars(),
})
    .description("The test specification of a generic module.");
exports.genericModuleSpecSchema = Joi.object()
    .keys({
    env: common_1.joiEnvVars(),
    tests: common_1.joiArray(exports.genericTestSchema)
        .description("A list of tests to run in the module."),
})
    .unknown(false)
    .description("The module specification for a generic module.");
function parseGenericModule({ moduleConfig }) {
    return __awaiter(this, void 0, void 0, function* () {
        moduleConfig.spec = common_1.validate(moduleConfig.spec, exports.genericModuleSpecSchema, { context: `module ${moduleConfig.name}` });
        moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
            name: t.name,
            dependencies: t.dependencies,
            spec: t,
            timeout: t.timeout,
        }));
        return moduleConfig;
    });
}
exports.parseGenericModule = parseGenericModule;
function getGenericModuleBuildStatus({ module }) {
    return __awaiter(this, void 0, void 0, function* () {
        const buildVersionFilePath = path_1.join(module.buildPath, constants_1.GARDEN_BUILD_VERSION_FILENAME);
        let builtVersion = null;
        try {
            builtVersion = yield base_1.readModuleVersionFile(buildVersionFilePath);
        }
        catch (_) {
            // just ignore this error, can be caused by an outdated format
        }
        if (builtVersion && builtVersion.versionString === module.version.versionString) {
            return { ready: true };
        }
        return { ready: false };
    });
}
exports.getGenericModuleBuildStatus = getGenericModuleBuildStatus;
function buildGenericModule({ module }) {
    return __awaiter(this, void 0, void 0, function* () {
        const config = module;
        const output = {};
        const buildPath = module.buildPath;
        if (config.build.command.length) {
            const res = yield execa.shell(config.build.command.join(" "), {
                cwd: buildPath,
                env: Object.assign({}, process.env, lodash_1.mapValues(module.spec.env, v => v.toString())),
            });
            output.fresh = true;
            output.buildLog = res.stdout + res.stderr;
        }
        // keep track of which version has been built
        const buildVersionFilePath = path_1.join(buildPath, constants_1.GARDEN_BUILD_VERSION_FILENAME);
        yield base_1.writeModuleVersionFile(buildVersionFilePath, module.version);
        return output;
    });
}
exports.buildGenericModule = buildGenericModule;
function testGenericModule({ module, testConfig }) {
    return __awaiter(this, void 0, void 0, function* () {
        const startedAt = new Date();
        const command = testConfig.spec.command;
        const result = yield execa.shell(command.join(" "), {
            cwd: module.path,
            env: Object.assign({}, process.env, lodash_1.mapValues(module.spec.env, v => v + ""), lodash_1.mapValues(testConfig.spec.env, v => v + "")),
            reject: false,
        });
        return {
            moduleName: module.name,
            command,
            testName: testConfig.name,
            version: module.version,
            success: result.code === 0,
            startedAt,
            completedAt: new Date(),
            output: result.stdout + result.stderr,
        };
    });
}
exports.testGenericModule = testGenericModule;
exports.genericPlugin = {
    moduleActions: {
        generic: {
            validate: parseGenericModule,
            getBuildStatus: getGenericModuleBuildStatus,
            build: buildGenericModule,
            testModule: testGenericModule,
        },
    },
};
exports.gardenPlugin = () => exports.genericPlugin;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUMvQztZQUNELE1BQU0sRUFBRSxLQUFLO1NBQ2QsQ0FDRixDQUFBO1FBRUQsT0FBTztZQUNMLFVBQVUsRUFBRSxNQUFNLENBQUMsSUFBSTtZQUN2QixPQUFPO1lBQ1AsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO1lBQ3pCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTztZQUN2QixPQUFPLEVBQUUsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDO1lBQzFCLFNBQVM7WUFDVCxXQUFXLEVBQUUsSUFBSSxJQUFJLEVBQUU7WUFDdkIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU07U0FDdEMsQ0FBQTtJQUNILENBQUM7Q0FBQTtBQTVCRCw4Q0E0QkM7QUFFWSxRQUFBLGFBQWEsR0FBaUI7SUFDekMsYUFBYSxFQUFFO1FBQ2IsT0FBTyxFQUFFO1lBQ1AsUUFBUSxFQUFFLGtCQUFrQjtZQUM1QixjQUFjLEVBQUUsMkJBQTJCO1lBQzNDLEtBQUssRUFBRSxrQkFBa0I7WUFDekIsVUFBVSxFQUFFLGlCQUFpQjtTQUM5QjtLQUNGO0NBQ0YsQ0FBQTtBQUVZLFFBQUEsWUFBWSxHQUFHLEdBQUcsRUFBRSxDQUFDLHFCQUFhLENBQUEiLCJmaWxlIjoicGx1Z2lucy9nZW5lcmljLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCB7IG1hcFZhbHVlcyB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7XG4gIGpvaUFycmF5LFxuICBqb2lFbnZWYXJzLFxuICB2YWxpZGF0ZSxcbn0gZnJvbSBcIi4uL2NvbmZpZy9jb21tb25cIlxuaW1wb3J0IHtcbiAgR2FyZGVuUGx1Z2luLFxufSBmcm9tIFwiLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7XG4gIEJ1aWxkUmVzdWx0LFxuICBCdWlsZFN0YXR1cyxcbiAgVmFsaWRhdGVNb2R1bGVSZXN1bHQsXG4gIFRlc3RSZXN1bHQsXG59IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQge1xuICBCdWlsZE1vZHVsZVBhcmFtcyxcbiAgR2V0QnVpbGRTdGF0dXNQYXJhbXMsXG4gIFZhbGlkYXRlTW9kdWxlUGFyYW1zLFxuICBUZXN0TW9kdWxlUGFyYW1zLFxufSBmcm9tIFwiLi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQgeyBCYXNlU2VydmljZVNwZWMgfSBmcm9tIFwiLi4vY29uZmlnL3NlcnZpY2VcIlxuaW1wb3J0IHsgQmFzZVRlc3RTcGVjLCBiYXNlVGVzdFNwZWNTY2hlbWEgfSBmcm9tIFwiLi4vY29uZmlnL3Rlc3RcIlxuaW1wb3J0IHsgcmVhZE1vZHVsZVZlcnNpb25GaWxlLCB3cml0ZU1vZHVsZVZlcnNpb25GaWxlLCBNb2R1bGVWZXJzaW9uIH0gZnJvbSBcIi4uL3Zjcy9iYXNlXCJcbmltcG9ydCB7IEdBUkRFTl9CVUlMRF9WRVJTSU9OX0ZJTEVOQU1FIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBNb2R1bGVTcGVjLCBNb2R1bGVDb25maWcgfSBmcm9tIFwiLi4vY29uZmlnL21vZHVsZVwiXG5pbXBvcnQgZXhlY2EgPSByZXF1aXJlKFwiZXhlY2FcIilcblxuZXhwb3J0IGNvbnN0IG5hbWUgPSBcImdlbmVyaWNcIlxuXG5leHBvcnQgaW50ZXJmYWNlIEdlbmVyaWNUZXN0U3BlYyBleHRlbmRzIEJhc2VUZXN0U3BlYyB7XG4gIGNvbW1hbmQ6IHN0cmluZ1tdLFxuICBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0sXG59XG5cbmV4cG9ydCBjb25zdCBnZW5lcmljVGVzdFNjaGVtYSA9IGJhc2VUZXN0U3BlY1NjaGVtYVxuICAua2V5cyh7XG4gICAgY29tbWFuZDogSm9pLmFycmF5KCkuaXRlbXMoSm9pLnN0cmluZygpKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGNvbW1hbmQgdG8gcnVuIGluIHRoZSBtb2R1bGUgYnVpbGQgY29udGV4dCBpbiBvcmRlciB0byB0ZXN0IGl0LlwiKSxcbiAgICBlbnY6IGpvaUVudlZhcnMoKSxcbiAgfSlcbiAgLmRlc2NyaXB0aW9uKFwiVGhlIHRlc3Qgc3BlY2lmaWNhdGlvbiBvZiBhIGdlbmVyaWMgbW9kdWxlLlwiKVxuXG5leHBvcnQgaW50ZXJmYWNlIEdlbmVyaWNNb2R1bGVTcGVjIGV4dGVuZHMgTW9kdWxlU3BlYyB7XG4gIGVudjogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSxcbiAgdGVzdHM6IEdlbmVyaWNUZXN0U3BlY1tdLFxufVxuXG5leHBvcnQgY29uc3QgZ2VuZXJpY01vZHVsZVNwZWNTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIGVudjogam9pRW52VmFycygpLFxuICAgIHRlc3RzOiBqb2lBcnJheShnZW5lcmljVGVzdFNjaGVtYSlcbiAgICAgIC5kZXNjcmlwdGlvbihcIkEgbGlzdCBvZiB0ZXN0cyB0byBydW4gaW4gdGhlIG1vZHVsZS5cIiksXG4gIH0pXG4gIC51bmtub3duKGZhbHNlKVxuICAuZGVzY3JpcHRpb24oXCJUaGUgbW9kdWxlIHNwZWNpZmljYXRpb24gZm9yIGEgZ2VuZXJpYyBtb2R1bGUuXCIpXG5cbmV4cG9ydCBpbnRlcmZhY2UgR2VuZXJpY01vZHVsZSBleHRlbmRzIE1vZHVsZTxHZW5lcmljTW9kdWxlU3BlYywgQmFzZVNlcnZpY2VTcGVjLCBHZW5lcmljVGVzdFNwZWM+IHsgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VHZW5lcmljTW9kdWxlKFxuICB7IG1vZHVsZUNvbmZpZyB9OiBWYWxpZGF0ZU1vZHVsZVBhcmFtczxHZW5lcmljTW9kdWxlPixcbik6IFByb21pc2U8VmFsaWRhdGVNb2R1bGVSZXN1bHQ+IHtcbiAgbW9kdWxlQ29uZmlnLnNwZWMgPSB2YWxpZGF0ZShtb2R1bGVDb25maWcuc3BlYywgZ2VuZXJpY01vZHVsZVNwZWNTY2hlbWEsIHsgY29udGV4dDogYG1vZHVsZSAke21vZHVsZUNvbmZpZy5uYW1lfWAgfSlcblxuICBtb2R1bGVDb25maWcudGVzdENvbmZpZ3MgPSBtb2R1bGVDb25maWcuc3BlYy50ZXN0cy5tYXAodCA9PiAoe1xuICAgIG5hbWU6IHQubmFtZSxcbiAgICBkZXBlbmRlbmNpZXM6IHQuZGVwZW5kZW5jaWVzLFxuICAgIHNwZWM6IHQsXG4gICAgdGltZW91dDogdC50aW1lb3V0LFxuICB9KSlcblxuICByZXR1cm4gbW9kdWxlQ29uZmlnXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRHZW5lcmljTW9kdWxlQnVpbGRTdGF0dXMoeyBtb2R1bGUgfTogR2V0QnVpbGRTdGF0dXNQYXJhbXMpOiBQcm9taXNlPEJ1aWxkU3RhdHVzPiB7XG4gIGNvbnN0IGJ1aWxkVmVyc2lvbkZpbGVQYXRoID0gam9pbihtb2R1bGUuYnVpbGRQYXRoLCBHQVJERU5fQlVJTERfVkVSU0lPTl9GSUxFTkFNRSlcbiAgbGV0IGJ1aWx0VmVyc2lvbjogTW9kdWxlVmVyc2lvbiB8IG51bGwgPSBudWxsXG5cbiAgdHJ5IHtcbiAgICBidWlsdFZlcnNpb24gPSBhd2FpdCByZWFkTW9kdWxlVmVyc2lvbkZpbGUoYnVpbGRWZXJzaW9uRmlsZVBhdGgpXG4gIH0gY2F0Y2ggKF8pIHtcbiAgICAvLyBqdXN0IGlnbm9yZSB0aGlzIGVycm9yLCBjYW4gYmUgY2F1c2VkIGJ5IGFuIG91dGRhdGVkIGZvcm1hdFxuICB9XG5cbiAgaWYgKGJ1aWx0VmVyc2lvbiAmJiBidWlsdFZlcnNpb24udmVyc2lvblN0cmluZyA9PT0gbW9kdWxlLnZlcnNpb24udmVyc2lvblN0cmluZykge1xuICAgIHJldHVybiB7IHJlYWR5OiB0cnVlIH1cbiAgfVxuXG4gIHJldHVybiB7IHJlYWR5OiBmYWxzZSB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBidWlsZEdlbmVyaWNNb2R1bGUoeyBtb2R1bGUgfTogQnVpbGRNb2R1bGVQYXJhbXM8R2VuZXJpY01vZHVsZT4pOiBQcm9taXNlPEJ1aWxkUmVzdWx0PiB7XG4gIGNvbnN0IGNvbmZpZzogTW9kdWxlQ29uZmlnID0gbW9kdWxlXG4gIGNvbnN0IG91dHB1dDogQnVpbGRSZXN1bHQgPSB7fVxuICBjb25zdCBidWlsZFBhdGggPSBtb2R1bGUuYnVpbGRQYXRoXG5cbiAgaWYgKGNvbmZpZy5idWlsZC5jb21tYW5kLmxlbmd0aCkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGV4ZWNhLnNoZWxsKFxuICAgICAgY29uZmlnLmJ1aWxkLmNvbW1hbmQuam9pbihcIiBcIiksXG4gICAgICB7XG4gICAgICAgIGN3ZDogYnVpbGRQYXRoLFxuICAgICAgICBlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIC4uLm1hcFZhbHVlcyhtb2R1bGUuc3BlYy5lbnYsIHYgPT4gdi50b1N0cmluZygpKSB9LFxuICAgICAgfSxcbiAgICApXG5cbiAgICBvdXRwdXQuZnJlc2ggPSB0cnVlXG4gICAgb3V0cHV0LmJ1aWxkTG9nID0gcmVzLnN0ZG91dCArIHJlcy5zdGRlcnJcbiAgfVxuXG4gIC8vIGtlZXAgdHJhY2sgb2Ygd2hpY2ggdmVyc2lvbiBoYXMgYmVlbiBidWlsdFxuICBjb25zdCBidWlsZFZlcnNpb25GaWxlUGF0aCA9IGpvaW4oYnVpbGRQYXRoLCBHQVJERU5fQlVJTERfVkVSU0lPTl9GSUxFTkFNRSlcbiAgYXdhaXQgd3JpdGVNb2R1bGVWZXJzaW9uRmlsZShidWlsZFZlcnNpb25GaWxlUGF0aCwgbW9kdWxlLnZlcnNpb24pXG5cbiAgcmV0dXJuIG91dHB1dFxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdGVzdEdlbmVyaWNNb2R1bGUoeyBtb2R1bGUsIHRlc3RDb25maWcgfTogVGVzdE1vZHVsZVBhcmFtczxHZW5lcmljTW9kdWxlPik6IFByb21pc2U8VGVzdFJlc3VsdD4ge1xuICBjb25zdCBzdGFydGVkQXQgPSBuZXcgRGF0ZSgpXG4gIGNvbnN0IGNvbW1hbmQgPSB0ZXN0Q29uZmlnLnNwZWMuY29tbWFuZFxuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWNhLnNoZWxsKFxuICAgIGNvbW1hbmQuam9pbihcIiBcIiksXG4gICAge1xuICAgICAgY3dkOiBtb2R1bGUucGF0aCxcbiAgICAgIGVudjoge1xuICAgICAgICAuLi5wcm9jZXNzLmVudixcbiAgICAgICAgLy8gbmVlZCB0byBjYXN0IHRoZSB2YWx1ZXMgdG8gc3RyaW5nc1xuICAgICAgICAuLi5tYXBWYWx1ZXMobW9kdWxlLnNwZWMuZW52LCB2ID0+IHYgKyBcIlwiKSxcbiAgICAgICAgLi4ubWFwVmFsdWVzKHRlc3RDb25maWcuc3BlYy5lbnYsIHYgPT4gdiArIFwiXCIpLFxuICAgICAgfSxcbiAgICAgIHJlamVjdDogZmFsc2UsXG4gICAgfSxcbiAgKVxuXG4gIHJldHVybiB7XG4gICAgbW9kdWxlTmFtZTogbW9kdWxlLm5hbWUsXG4gICAgY29tbWFuZCxcbiAgICB0ZXN0TmFtZTogdGVzdENvbmZpZy5uYW1lLFxuICAgIHZlcnNpb246IG1vZHVsZS52ZXJzaW9uLFxuICAgIHN1Y2Nlc3M6IHJlc3VsdC5jb2RlID09PSAwLFxuICAgIHN0YXJ0ZWRBdCxcbiAgICBjb21wbGV0ZWRBdDogbmV3IERhdGUoKSxcbiAgICBvdXRwdXQ6IHJlc3VsdC5zdGRvdXQgKyByZXN1bHQuc3RkZXJyLFxuICB9XG59XG5cbmV4cG9ydCBjb25zdCBnZW5lcmljUGx1Z2luOiBHYXJkZW5QbHVnaW4gPSB7XG4gIG1vZHVsZUFjdGlvbnM6IHtcbiAgICBnZW5lcmljOiB7XG4gICAgICB2YWxpZGF0ZTogcGFyc2VHZW5lcmljTW9kdWxlLFxuICAgICAgZ2V0QnVpbGRTdGF0dXM6IGdldEdlbmVyaWNNb2R1bGVCdWlsZFN0YXR1cyxcbiAgICAgIGJ1aWxkOiBidWlsZEdlbmVyaWNNb2R1bGUsXG4gICAgICB0ZXN0TW9kdWxlOiB0ZXN0R2VuZXJpY01vZHVsZSxcbiAgICB9LFxuICB9LFxufVxuXG5leHBvcnQgY29uc3QgZ2FyZGVuUGx1Z2luID0gKCkgPT4gZ2VuZXJpY1BsdWdpblxuIl19
