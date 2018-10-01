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
const config_templates_1 = require("./config-templates");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const common_1 = require("../../config/common");
const util_1 = require("../../util/util");
const constants_1 = require("../../constants");
function prepareNewModuleConfig(name, type, path) {
    const moduleTypeTemplate = {
        container: config_templates_1.containerTemplate,
        "google-cloud-function": config_templates_1.googleCloudFunctionTemplate,
        "npm-package": config_templates_1.npmPackageTemplate,
    }[type];
    return {
        name,
        type,
        path,
        config: {
            module: Object.assign({}, config_templates_1.moduleTemplate(name, type), moduleTypeTemplate(name)),
        },
    };
}
exports.prepareNewModuleConfig = prepareNewModuleConfig;
function dumpConfig(configOpts, schema, logger) {
    return __awaiter(this, void 0, void 0, function* () {
        const { config, name, path } = configOpts;
        const yamlPath = path_1.join(path, constants_1.MODULE_CONFIG_FILENAME);
        const task = logger.info({
            msg: `Writing config for ${name}`,
            status: "active",
        });
        if (yield fs_extra_1.pathExists(yamlPath)) {
            task.setWarn({ msg: `Garden config file already exists at path, skipping`, append: true });
            return;
        }
        try {
            common_1.validate(config, schema);
            yield util_1.dumpYaml(yamlPath, config);
            task.setSuccess();
        }
        catch (err) {
            task.setError({ msg: `Generated config is invalid, skipping`, append: true });
            throw err;
        }
    });
}
exports.dumpConfig = dumpConfig;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9oZWxwZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFHSCx5REFRMkI7QUFDM0IsK0JBQTJCO0FBQzNCLHVDQUFxQztBQUNyQyxnREFBOEM7QUFDOUMsMENBQTBDO0FBQzFDLCtDQUF3RDtBQUd4RCxTQUFnQixzQkFBc0IsQ0FBQyxJQUFZLEVBQUUsSUFBZ0IsRUFBRSxJQUFZO0lBQ2pGLE1BQU0sa0JBQWtCLEdBQUc7UUFDekIsU0FBUyxFQUFFLG9DQUFpQjtRQUM1Qix1QkFBdUIsRUFBRSw4Q0FBMkI7UUFDcEQsYUFBYSxFQUFFLHFDQUFrQjtLQUNsQyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ1AsT0FBTztRQUNMLElBQUk7UUFDSixJQUFJO1FBQ0osSUFBSTtRQUNKLE1BQU0sRUFBRTtZQUNOLE1BQU0sb0JBQ0QsaUNBQWMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQzFCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUM1QjtTQUNGO0tBQ0YsQ0FBQTtBQUNILENBQUM7QUFqQkQsd0RBaUJDO0FBRUQsU0FBc0IsVUFBVSxDQUFDLFVBQXNCLEVBQUUsTUFBa0IsRUFBRSxNQUFlOztRQUMxRixNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxVQUFVLENBQUE7UUFDekMsTUFBTSxRQUFRLEdBQUcsV0FBSSxDQUFDLElBQUksRUFBRSxrQ0FBc0IsQ0FBQyxDQUFBO1FBQ25ELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDdkIsR0FBRyxFQUFFLHNCQUFzQixJQUFJLEVBQUU7WUFDakMsTUFBTSxFQUFFLFFBQVE7U0FDakIsQ0FBQyxDQUFBO1FBRUYsSUFBSSxNQUFNLHFCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxxREFBcUQsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtZQUMxRixPQUFNO1NBQ1A7UUFFRCxJQUFJO1lBQ0YsaUJBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUE7WUFDeEIsTUFBTSxlQUFRLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxDQUFBO1lBQ2hDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQTtTQUNsQjtRQUFDLE9BQU8sR0FBRyxFQUFFO1lBQ1osSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtZQUM3RSxNQUFNLEdBQUcsQ0FBQTtTQUNWO0lBQ0gsQ0FBQztDQUFBO0FBckJELGdDQXFCQyIsImZpbGUiOiJjb21tYW5kcy9jcmVhdGUvaGVscGVycy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBKb2kgZnJvbSBcImpvaVwiXG5pbXBvcnQge1xuICBjb250YWluZXJUZW1wbGF0ZSxcbiAgZ29vZ2xlQ2xvdWRGdW5jdGlvblRlbXBsYXRlLFxuICBucG1QYWNrYWdlVGVtcGxhdGUsXG4gIE1vZHVsZUNvbmZpZ09wdHMsXG4gIE1vZHVsZVR5cGUsXG4gIG1vZHVsZVRlbXBsYXRlLFxuICBDb25maWdPcHRzLFxufSBmcm9tIFwiLi9jb25maWctdGVtcGxhdGVzXCJcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBwYXRoRXhpc3RzIH0gZnJvbSBcImZzLWV4dHJhXCJcbmltcG9ydCB7IHZhbGlkYXRlIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9jb21tb25cIlxuaW1wb3J0IHsgZHVtcFlhbWwgfSBmcm9tIFwiLi4vLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IE1PRFVMRV9DT05GSUdfRklMRU5BTUUgfSBmcm9tIFwiLi4vLi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IExvZ05vZGUgfSBmcm9tIFwiLi4vLi4vbG9nZ2VyL2xvZy1ub2RlXCJcblxuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVOZXdNb2R1bGVDb25maWcobmFtZTogc3RyaW5nLCB0eXBlOiBNb2R1bGVUeXBlLCBwYXRoOiBzdHJpbmcpOiBNb2R1bGVDb25maWdPcHRzIHtcbiAgY29uc3QgbW9kdWxlVHlwZVRlbXBsYXRlID0ge1xuICAgIGNvbnRhaW5lcjogY29udGFpbmVyVGVtcGxhdGUsXG4gICAgXCJnb29nbGUtY2xvdWQtZnVuY3Rpb25cIjogZ29vZ2xlQ2xvdWRGdW5jdGlvblRlbXBsYXRlLFxuICAgIFwibnBtLXBhY2thZ2VcIjogbnBtUGFja2FnZVRlbXBsYXRlLFxuICB9W3R5cGVdXG4gIHJldHVybiB7XG4gICAgbmFtZSxcbiAgICB0eXBlLFxuICAgIHBhdGgsXG4gICAgY29uZmlnOiB7XG4gICAgICBtb2R1bGU6IHtcbiAgICAgICAgLi4ubW9kdWxlVGVtcGxhdGUobmFtZSwgdHlwZSksXG4gICAgICAgIC4uLm1vZHVsZVR5cGVUZW1wbGF0ZShuYW1lKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZHVtcENvbmZpZyhjb25maWdPcHRzOiBDb25maWdPcHRzLCBzY2hlbWE6IEpvaS5TY2hlbWEsIGxvZ2dlcjogTG9nTm9kZSkge1xuICBjb25zdCB7IGNvbmZpZywgbmFtZSwgcGF0aCB9ID0gY29uZmlnT3B0c1xuICBjb25zdCB5YW1sUGF0aCA9IGpvaW4ocGF0aCwgTU9EVUxFX0NPTkZJR19GSUxFTkFNRSlcbiAgY29uc3QgdGFzayA9IGxvZ2dlci5pbmZvKHtcbiAgICBtc2c6IGBXcml0aW5nIGNvbmZpZyBmb3IgJHtuYW1lfWAsXG4gICAgc3RhdHVzOiBcImFjdGl2ZVwiLFxuICB9KVxuXG4gIGlmIChhd2FpdCBwYXRoRXhpc3RzKHlhbWxQYXRoKSkge1xuICAgIHRhc2suc2V0V2Fybih7IG1zZzogYEdhcmRlbiBjb25maWcgZmlsZSBhbHJlYWR5IGV4aXN0cyBhdCBwYXRoLCBza2lwcGluZ2AsIGFwcGVuZDogdHJ1ZSB9KVxuICAgIHJldHVyblxuICB9XG5cbiAgdHJ5IHtcbiAgICB2YWxpZGF0ZShjb25maWcsIHNjaGVtYSlcbiAgICBhd2FpdCBkdW1wWWFtbCh5YW1sUGF0aCwgY29uZmlnKVxuICAgIHRhc2suc2V0U3VjY2VzcygpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHRhc2suc2V0RXJyb3IoeyBtc2c6IGBHZW5lcmF0ZWQgY29uZmlnIGlzIGludmFsaWQsIHNraXBwaW5nYCwgYXBwZW5kOiB0cnVlIH0pXG4gICAgdGhyb3cgZXJyXG4gIH1cbn1cbiJdfQ==
