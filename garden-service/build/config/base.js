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
const path_1 = require("path");
const util_1 = require("../util/util");
const module_1 = require("./module");
const common_1 = require("./common");
const exceptions_1 = require("../exceptions");
const Joi = require("joi");
const yaml = require("js-yaml");
const fs_extra_1 = require("fs-extra");
const project_1 = require("../config/project");
const lodash_1 = require("lodash");
const CONFIG_FILENAME = "garden.yml";
exports.configSchema = Joi.object()
    .keys({
    // TODO: should this be called apiVersion?
    version: Joi.string()
        .default("0")
        .only("0")
        .description("The schema version of the config file (currently not used)."),
    dirname: Joi.string().meta({ internal: true }),
    path: Joi.string().meta({ internal: true }),
    module: module_1.baseModuleSpecSchema,
    project: project_1.projectSchema,
})
    .optionalKeys(["module", "project"])
    .required()
    .description("The garden.yml config file.");
const baseModuleSchemaKeys = Object.keys(module_1.baseModuleSpecSchema.describe().children);
function loadConfig(projectRoot, path) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: nicer error messages when load/validation fails
        const absPath = path_1.join(path, CONFIG_FILENAME);
        let fileData;
        let spec;
        // loadConfig returns null if config file is not found in the given directory
        try {
            fileData = yield fs_extra_1.readFile(absPath);
        }
        catch (err) {
            return undefined;
        }
        try {
            spec = yaml.safeLoad(fileData) || {};
        }
        catch (err) {
            throw new exceptions_1.ConfigurationError(`Could not parse ${CONFIG_FILENAME} in directory ${path} as valid YAML`, err);
        }
        if (spec.module) {
            /*
              We allow specifying modules by name only as a shorthand:
        
                dependencies:
                  - foo-module
                  - name: foo-module // same as the above
             */
            if (spec.module.build && spec.module.build.dependencies) {
                spec.module.build.dependencies = spec.module.build.dependencies
                    .map(dep => (typeof dep) === "string" ? { name: dep } : dep);
            }
        }
        const parsed = common_1.validate(spec, exports.configSchema, { context: path_1.relative(projectRoot, absPath) });
        const dirname = path_1.basename(path);
        const project = parsed.project;
        let moduleConfig = parsed.module;
        if (project) {
            // we include the default local environment unless explicitly overridden
            for (const env of project_1.defaultEnvironments) {
                if (!util_1.findByName(project.environments, env.name)) {
                    project.environments.push(env);
                }
            }
            // the default environment is the first specified environment in the config, unless specified
            const defaultEnvironment = project.defaultEnvironment;
            if (defaultEnvironment === "") {
                project.defaultEnvironment = project.environments[0].name;
            }
            else {
                if (!util_1.findByName(project.environments, defaultEnvironment)) {
                    throw new exceptions_1.ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
                        defaultEnvironment,
                        availableEnvironments: util_1.getNames(project.environments),
                    });
                }
            }
        }
        if (moduleConfig) {
            // Built-in keys are validated here and the rest are put into the `spec` field
            moduleConfig = {
                allowPublish: moduleConfig.allowPublish,
                build: moduleConfig.build,
                description: moduleConfig.description,
                name: moduleConfig.name,
                path,
                repositoryUrl: moduleConfig.repositoryUrl,
                serviceConfigs: [],
                spec: lodash_1.omit(moduleConfig, baseModuleSchemaKeys),
                testConfigs: [],
                type: moduleConfig.type,
                variables: moduleConfig.variables,
            };
        }
        return {
            version: parsed.version,
            dirname,
            path,
            module: moduleConfig,
            project,
        };
    });
}
exports.loadConfig = loadConfig;
function findProjectConfig(path) {
    return __awaiter(this, void 0, void 0, function* () {
        let config;
        let sepCount = path.split(path_1.sep).length - 1;
        for (let i = 0; i < sepCount; i++) {
            config = yield loadConfig(path, path);
            if (!config || !config.project) {
                path = path_1.resolve(path, "..");
            }
            else if (config.project) {
                return config;
            }
        }
        return config;
    });
}
exports.findProjectConfig = findProjectConfig;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Y0FBYyxFQUFFLEVBQUU7Z0JBQ2xCLElBQUksRUFBRSxhQUFJLENBQUMsWUFBWSxFQUFFLG9CQUFvQixDQUFDO2dCQUM5QyxXQUFXLEVBQUUsRUFBRTtnQkFDZixJQUFJLEVBQUUsWUFBWSxDQUFDLElBQUk7Z0JBQ3ZCLFNBQVMsRUFBRSxZQUFZLENBQUMsU0FBUzthQUNsQyxDQUFBO1NBQ0Y7UUFFRCxPQUFPO1lBQ0wsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPO1lBQ3ZCLE9BQU87WUFDUCxJQUFJO1lBQ0osTUFBTSxFQUFFLFlBQVk7WUFDcEIsT0FBTztTQUNSLENBQUE7SUFDSCxDQUFDO0NBQUE7QUF0RkQsZ0NBc0ZDO0FBRUQsU0FBc0IsaUJBQWlCLENBQUMsSUFBWTs7UUFDbEQsSUFBSSxNQUFnQyxDQUFBO1FBRXBDLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBRyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQTtRQUN6QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2pDLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDckMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUU7Z0JBQzlCLElBQUksR0FBRyxjQUFPLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFBO2FBQzNCO2lCQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRTtnQkFDekIsT0FBTyxNQUFNLENBQUE7YUFDZDtTQUNGO1FBRUQsT0FBTyxNQUFNLENBQUE7SUFDZixDQUFDO0NBQUE7QUFkRCw4Q0FjQyIsImZpbGUiOiJjb25maWcvYmFzZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBqb2luLCByZWxhdGl2ZSwgYmFzZW5hbWUsIHNlcCwgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7XG4gIGZpbmRCeU5hbWUsXG4gIGdldE5hbWVzLFxufSBmcm9tIFwiLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IGJhc2VNb2R1bGVTcGVjU2NoZW1hLCBNb2R1bGVDb25maWcgfSBmcm9tIFwiLi9tb2R1bGVcIlxuaW1wb3J0IHsgdmFsaWRhdGUgfSBmcm9tIFwiLi9jb21tb25cIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0ICogYXMgeWFtbCBmcm9tIFwianMteWFtbFwiXG5pbXBvcnQgeyByZWFkRmlsZSB9IGZyb20gXCJmcy1leHRyYVwiXG5pbXBvcnQgeyBkZWZhdWx0RW52aXJvbm1lbnRzLCBQcm9qZWN0Q29uZmlnLCBwcm9qZWN0U2NoZW1hIH0gZnJvbSBcIi4uL2NvbmZpZy9wcm9qZWN0XCJcbmltcG9ydCB7IG9taXQgfSBmcm9tIFwibG9kYXNoXCJcblxuY29uc3QgQ09ORklHX0ZJTEVOQU1FID0gXCJnYXJkZW4ueW1sXCJcblxuZXhwb3J0IGludGVyZmFjZSBHYXJkZW5Db25maWcge1xuICB2ZXJzaW9uOiBzdHJpbmdcbiAgZGlybmFtZTogc3RyaW5nXG4gIHBhdGg6IHN0cmluZ1xuICBtb2R1bGU/OiBNb2R1bGVDb25maWdcbiAgcHJvamVjdD86IFByb2plY3RDb25maWdcbn1cblxuZXhwb3J0IGNvbnN0IGNvbmZpZ1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgLy8gVE9ETzogc2hvdWxkIHRoaXMgYmUgY2FsbGVkIGFwaVZlcnNpb24/XG4gICAgdmVyc2lvbjogSm9pLnN0cmluZygpXG4gICAgICAuZGVmYXVsdChcIjBcIilcbiAgICAgIC5vbmx5KFwiMFwiKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIHNjaGVtYSB2ZXJzaW9uIG9mIHRoZSBjb25maWcgZmlsZSAoY3VycmVudGx5IG5vdCB1c2VkKS5cIiksXG4gICAgZGlybmFtZTogSm9pLnN0cmluZygpLm1ldGEoeyBpbnRlcm5hbDogdHJ1ZSB9KSxcbiAgICBwYXRoOiBKb2kuc3RyaW5nKCkubWV0YSh7IGludGVybmFsOiB0cnVlIH0pLFxuICAgIG1vZHVsZTogYmFzZU1vZHVsZVNwZWNTY2hlbWEsXG4gICAgcHJvamVjdDogcHJvamVjdFNjaGVtYSxcbiAgfSlcbiAgLm9wdGlvbmFsS2V5cyhbXCJtb2R1bGVcIiwgXCJwcm9qZWN0XCJdKVxuICAucmVxdWlyZWQoKVxuICAuZGVzY3JpcHRpb24oXCJUaGUgZ2FyZGVuLnltbCBjb25maWcgZmlsZS5cIilcblxuY29uc3QgYmFzZU1vZHVsZVNjaGVtYUtleXMgPSBPYmplY3Qua2V5cyhiYXNlTW9kdWxlU3BlY1NjaGVtYS5kZXNjcmliZSgpLmNoaWxkcmVuKVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZENvbmZpZyhwcm9qZWN0Um9vdDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBQcm9taXNlPEdhcmRlbkNvbmZpZyB8IHVuZGVmaW5lZD4ge1xuICAvLyBUT0RPOiBuaWNlciBlcnJvciBtZXNzYWdlcyB3aGVuIGxvYWQvdmFsaWRhdGlvbiBmYWlsc1xuICBjb25zdCBhYnNQYXRoID0gam9pbihwYXRoLCBDT05GSUdfRklMRU5BTUUpXG4gIGxldCBmaWxlRGF0YVxuICBsZXQgc3BlYzogYW55XG5cbiAgLy8gbG9hZENvbmZpZyByZXR1cm5zIG51bGwgaWYgY29uZmlnIGZpbGUgaXMgbm90IGZvdW5kIGluIHRoZSBnaXZlbiBkaXJlY3RvcnlcbiAgdHJ5IHtcbiAgICBmaWxlRGF0YSA9IGF3YWl0IHJlYWRGaWxlKGFic1BhdGgpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiB1bmRlZmluZWRcbiAgfVxuXG4gIHRyeSB7XG4gICAgc3BlYyA9IHlhbWwuc2FmZUxvYWQoZmlsZURhdGEpIHx8IHt9XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoYENvdWxkIG5vdCBwYXJzZSAke0NPTkZJR19GSUxFTkFNRX0gaW4gZGlyZWN0b3J5ICR7cGF0aH0gYXMgdmFsaWQgWUFNTGAsIGVycilcbiAgfVxuXG4gIGlmIChzcGVjLm1vZHVsZSkge1xuICAgIC8qXG4gICAgICBXZSBhbGxvdyBzcGVjaWZ5aW5nIG1vZHVsZXMgYnkgbmFtZSBvbmx5IGFzIGEgc2hvcnRoYW5kOlxuXG4gICAgICAgIGRlcGVuZGVuY2llczpcbiAgICAgICAgICAtIGZvby1tb2R1bGVcbiAgICAgICAgICAtIG5hbWU6IGZvby1tb2R1bGUgLy8gc2FtZSBhcyB0aGUgYWJvdmVcbiAgICAgKi9cbiAgICBpZiAoc3BlYy5tb2R1bGUuYnVpbGQgJiYgc3BlYy5tb2R1bGUuYnVpbGQuZGVwZW5kZW5jaWVzKSB7XG4gICAgICBzcGVjLm1vZHVsZS5idWlsZC5kZXBlbmRlbmNpZXMgPSBzcGVjLm1vZHVsZS5idWlsZC5kZXBlbmRlbmNpZXNcbiAgICAgICAgLm1hcChkZXAgPT4gKHR5cGVvZiBkZXApID09PSBcInN0cmluZ1wiID8geyBuYW1lOiBkZXAgfSA6IGRlcClcbiAgICB9XG4gIH1cblxuICBjb25zdCBwYXJzZWQgPSA8R2FyZGVuQ29uZmlnPnZhbGlkYXRlKHNwZWMsIGNvbmZpZ1NjaGVtYSwgeyBjb250ZXh0OiByZWxhdGl2ZShwcm9qZWN0Um9vdCwgYWJzUGF0aCkgfSlcblxuICBjb25zdCBkaXJuYW1lID0gYmFzZW5hbWUocGF0aClcbiAgY29uc3QgcHJvamVjdCA9IHBhcnNlZC5wcm9qZWN0XG4gIGxldCBtb2R1bGVDb25maWcgPSBwYXJzZWQubW9kdWxlXG5cbiAgaWYgKHByb2plY3QpIHtcbiAgICAvLyB3ZSBpbmNsdWRlIHRoZSBkZWZhdWx0IGxvY2FsIGVudmlyb25tZW50IHVubGVzcyBleHBsaWNpdGx5IG92ZXJyaWRkZW5cbiAgICBmb3IgKGNvbnN0IGVudiBvZiBkZWZhdWx0RW52aXJvbm1lbnRzKSB7XG4gICAgICBpZiAoIWZpbmRCeU5hbWUocHJvamVjdC5lbnZpcm9ubWVudHMsIGVudi5uYW1lKSkge1xuICAgICAgICBwcm9qZWN0LmVudmlyb25tZW50cy5wdXNoKGVudilcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB0aGUgZGVmYXVsdCBlbnZpcm9ubWVudCBpcyB0aGUgZmlyc3Qgc3BlY2lmaWVkIGVudmlyb25tZW50IGluIHRoZSBjb25maWcsIHVubGVzcyBzcGVjaWZpZWRcbiAgICBjb25zdCBkZWZhdWx0RW52aXJvbm1lbnQgPSBwcm9qZWN0LmRlZmF1bHRFbnZpcm9ubWVudFxuXG4gICAgaWYgKGRlZmF1bHRFbnZpcm9ubWVudCA9PT0gXCJcIikge1xuICAgICAgcHJvamVjdC5kZWZhdWx0RW52aXJvbm1lbnQgPSBwcm9qZWN0LmVudmlyb25tZW50c1swXS5uYW1lXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICghZmluZEJ5TmFtZShwcm9qZWN0LmVudmlyb25tZW50cywgZGVmYXVsdEVudmlyb25tZW50KSkge1xuICAgICAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKGBUaGUgc3BlY2lmaWVkIGRlZmF1bHQgZW52aXJvbm1lbnQgJHtkZWZhdWx0RW52aXJvbm1lbnR9IGlzIG5vdCBkZWZpbmVkYCwge1xuICAgICAgICAgIGRlZmF1bHRFbnZpcm9ubWVudCxcbiAgICAgICAgICBhdmFpbGFibGVFbnZpcm9ubWVudHM6IGdldE5hbWVzKHByb2plY3QuZW52aXJvbm1lbnRzKSxcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAobW9kdWxlQ29uZmlnKSB7XG4gICAgLy8gQnVpbHQtaW4ga2V5cyBhcmUgdmFsaWRhdGVkIGhlcmUgYW5kIHRoZSByZXN0IGFyZSBwdXQgaW50byB0aGUgYHNwZWNgIGZpZWxkXG4gICAgbW9kdWxlQ29uZmlnID0ge1xuICAgICAgYWxsb3dQdWJsaXNoOiBtb2R1bGVDb25maWcuYWxsb3dQdWJsaXNoLFxuICAgICAgYnVpbGQ6IG1vZHVsZUNvbmZpZy5idWlsZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBtb2R1bGVDb25maWcuZGVzY3JpcHRpb24sXG4gICAgICBuYW1lOiBtb2R1bGVDb25maWcubmFtZSxcbiAgICAgIHBhdGgsXG4gICAgICByZXBvc2l0b3J5VXJsOiBtb2R1bGVDb25maWcucmVwb3NpdG9yeVVybCxcbiAgICAgIHNlcnZpY2VDb25maWdzOiBbXSxcbiAgICAgIHNwZWM6IG9taXQobW9kdWxlQ29uZmlnLCBiYXNlTW9kdWxlU2NoZW1hS2V5cyksXG4gICAgICB0ZXN0Q29uZmlnczogW10sXG4gICAgICB0eXBlOiBtb2R1bGVDb25maWcudHlwZSxcbiAgICAgIHZhcmlhYmxlczogbW9kdWxlQ29uZmlnLnZhcmlhYmxlcyxcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHZlcnNpb246IHBhcnNlZC52ZXJzaW9uLFxuICAgIGRpcm5hbWUsXG4gICAgcGF0aCxcbiAgICBtb2R1bGU6IG1vZHVsZUNvbmZpZyxcbiAgICBwcm9qZWN0LFxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5kUHJvamVjdENvbmZpZyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPEdhcmRlbkNvbmZpZyB8IHVuZGVmaW5lZD4ge1xuICBsZXQgY29uZmlnOiBHYXJkZW5Db25maWcgfCB1bmRlZmluZWRcblxuICBsZXQgc2VwQ291bnQgPSBwYXRoLnNwbGl0KHNlcCkubGVuZ3RoIC0gMVxuICBmb3IgKGxldCBpID0gMDsgaSA8IHNlcENvdW50OyBpKyspIHtcbiAgICBjb25maWcgPSBhd2FpdCBsb2FkQ29uZmlnKHBhdGgsIHBhdGgpXG4gICAgaWYgKCFjb25maWcgfHwgIWNvbmZpZy5wcm9qZWN0KSB7XG4gICAgICBwYXRoID0gcmVzb2x2ZShwYXRoLCBcIi4uXCIpXG4gICAgfSBlbHNlIGlmIChjb25maWcucHJvamVjdCkge1xuICAgICAgcmV0dXJuIGNvbmZpZ1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjb25maWdcbn1cbiJdfQ==
