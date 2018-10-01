"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const Joi = require("joi");
const module_1 = require("../../config/module");
/**
 * Ideally there would be some mechanism to discover available module types,
 * and for plugins to expose a minimal config for the given type along with
 * a list of providers per environment, rather than hard coding these values.
 *
 * Alternatively, consider co-locating the templates with the plugins.
 */
exports.MODULE_PROVIDER_MAP = {
    container: "local-kubernetes",
    "google-cloud-function": "local-google-cloud-functions",
    "npm-package": "npm-package",
};
exports.availableModuleTypes = Object.keys(exports.MODULE_PROVIDER_MAP);
exports.moduleSchema = Joi.object().keys({
    module: module_1.baseModuleSpecSchema,
});
const noCase = (str) => str.replace(/-|_/g, " ");
const titleize = (str) => lodash_1.capitalize(noCase(str));
function containerTemplate(moduleName) {
    return {
        services: [
            {
                name: `${moduleName}-service`,
                ports: [{
                        name: "http",
                        containerPort: 8080,
                    }],
                ingresses: [{
                        path: "/",
                        port: "http",
                    }],
            },
        ],
    };
}
exports.containerTemplate = containerTemplate;
function googleCloudFunctionTemplate(moduleName) {
    return {
        functions: [{
                name: `${moduleName}-google-cloud-function`,
                entrypoint: lodash_1.camelCase(`${moduleName}-google-cloud-function`),
            }],
    };
}
exports.googleCloudFunctionTemplate = googleCloudFunctionTemplate;
function npmPackageTemplate(_moduleName) {
    return {};
}
exports.npmPackageTemplate = npmPackageTemplate;
exports.projectTemplate = (name, moduleTypes) => {
    const providers = lodash_1.uniq(moduleTypes).map(type => ({ name: exports.MODULE_PROVIDER_MAP[type] }));
    return {
        name,
        environments: [
            {
                name: "local",
                providers,
                variables: {},
            },
        ],
    };
};
exports.moduleTemplate = (name, type) => ({
    name,
    type,
    description: `${titleize(name)} ${noCase(type)}`,
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9jb25maWctdGVtcGxhdGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7O0FBRUgsbUNBQW9EO0FBQ3BELDJCQUEwQjtBQU0xQixnREFBd0Y7QUFFeEY7Ozs7OztHQU1HO0FBQ1UsUUFBQSxtQkFBbUIsR0FBRztJQUNqQyxTQUFTLEVBQUUsa0JBQWtCO0lBQzdCLHVCQUF1QixFQUFFLDhCQUE4QjtJQUN2RCxhQUFhLEVBQUUsYUFBYTtDQUM3QixDQUFBO0FBRVksUUFBQSxvQkFBb0IsR0FBaUIsTUFBTSxDQUFDLElBQUksQ0FBQywyQkFBbUIsQ0FBQyxDQUFBO0FBSXJFLFFBQUEsWUFBWSxHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQUM7SUFDNUMsTUFBTSxFQUFFLDZCQUFvQjtDQUM3QixDQUFDLENBQUE7QUFpQkYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFBO0FBQ3hELE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FBQyxtQkFBVSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0FBRXpELFNBQWdCLGlCQUFpQixDQUFDLFVBQWtCO0lBQ2xELE9BQU87UUFDTCxRQUFRLEVBQUU7WUFDUjtnQkFDRSxJQUFJLEVBQUUsR0FBRyxVQUFVLFVBQVU7Z0JBQzdCLEtBQUssRUFBRSxDQUFDO3dCQUNOLElBQUksRUFBRSxNQUFNO3dCQUNaLGFBQWEsRUFBRSxJQUFJO3FCQUNwQixDQUFDO2dCQUNGLFNBQVMsRUFBRSxDQUFDO3dCQUNWLElBQUksRUFBRSxHQUFHO3dCQUNULElBQUksRUFBRSxNQUFNO3FCQUNiLENBQUM7YUFDSDtTQUNGO0tBQ0YsQ0FBQTtBQUNILENBQUM7QUFoQkQsOENBZ0JDO0FBRUQsU0FBZ0IsMkJBQTJCLENBQUMsVUFBa0I7SUFDNUQsT0FBTztRQUNMLFNBQVMsRUFBRSxDQUFDO2dCQUNWLElBQUksRUFBRSxHQUFHLFVBQVUsd0JBQXdCO2dCQUMzQyxVQUFVLEVBQUUsa0JBQVMsQ0FBQyxHQUFHLFVBQVUsd0JBQXdCLENBQUM7YUFDN0QsQ0FBQztLQUNILENBQUE7QUFDSCxDQUFDO0FBUEQsa0VBT0M7QUFFRCxTQUFnQixrQkFBa0IsQ0FBQyxXQUFtQjtJQUNwRCxPQUFPLEVBQUUsQ0FBQTtBQUNYLENBQUM7QUFGRCxnREFFQztBQUVZLFFBQUEsZUFBZSxHQUFHLENBQUMsSUFBWSxFQUFFLFdBQXlCLEVBQTBCLEVBQUU7SUFDakcsTUFBTSxTQUFTLEdBQUcsYUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsMkJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDdEYsT0FBTztRQUNMLElBQUk7UUFDSixZQUFZLEVBQUU7WUFDWjtnQkFDRSxJQUFJLEVBQUUsT0FBTztnQkFDYixTQUFTO2dCQUNULFNBQVMsRUFBRSxFQUFFO2FBQ2Q7U0FDRjtLQUNGLENBQUE7QUFDSCxDQUFDLENBQUE7QUFFWSxRQUFBLGNBQWMsR0FBRyxDQUFDLElBQVksRUFBRSxJQUFnQixFQUEyQixFQUFFLENBQUMsQ0FBQztJQUMxRixJQUFJO0lBQ0osSUFBSTtJQUNKLFdBQVcsRUFBRSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7Q0FDakQsQ0FBQyxDQUFBIiwiZmlsZSI6ImNvbW1hbmRzL2NyZWF0ZS9jb25maWctdGVtcGxhdGVzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGNhcGl0YWxpemUsIGNhbWVsQ2FzZSwgdW5pcSB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuXG5pbXBvcnQgeyBEZWVwUGFydGlhbCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgQ29udGFpbmVyTW9kdWxlU3BlYyB9IGZyb20gXCIuLi8uLi9wbHVnaW5zL2NvbnRhaW5lclwiXG5pbXBvcnQgeyBHY2ZNb2R1bGVTcGVjIH0gZnJvbSBcIi4uLy4uL3BsdWdpbnMvZ29vZ2xlL2dvb2dsZS1jbG91ZC1mdW5jdGlvbnNcIlxuaW1wb3J0IHsgUHJvamVjdENvbmZpZyB9IGZyb20gXCIuLi8uLi9jb25maWcvcHJvamVjdFwiXG5pbXBvcnQgeyBCYXNlTW9kdWxlU3BlYywgTW9kdWxlQ29uZmlnLCBiYXNlTW9kdWxlU3BlY1NjaGVtYSB9IGZyb20gXCIuLi8uLi9jb25maWcvbW9kdWxlXCJcblxuLyoqXG4gKiBJZGVhbGx5IHRoZXJlIHdvdWxkIGJlIHNvbWUgbWVjaGFuaXNtIHRvIGRpc2NvdmVyIGF2YWlsYWJsZSBtb2R1bGUgdHlwZXMsXG4gKiBhbmQgZm9yIHBsdWdpbnMgdG8gZXhwb3NlIGEgbWluaW1hbCBjb25maWcgZm9yIHRoZSBnaXZlbiB0eXBlIGFsb25nIHdpdGhcbiAqIGEgbGlzdCBvZiBwcm92aWRlcnMgcGVyIGVudmlyb25tZW50LCByYXRoZXIgdGhhbiBoYXJkIGNvZGluZyB0aGVzZSB2YWx1ZXMuXG4gKlxuICogQWx0ZXJuYXRpdmVseSwgY29uc2lkZXIgY28tbG9jYXRpbmcgdGhlIHRlbXBsYXRlcyB3aXRoIHRoZSBwbHVnaW5zLlxuICovXG5leHBvcnQgY29uc3QgTU9EVUxFX1BST1ZJREVSX01BUCA9IHtcbiAgY29udGFpbmVyOiBcImxvY2FsLWt1YmVybmV0ZXNcIixcbiAgXCJnb29nbGUtY2xvdWQtZnVuY3Rpb25cIjogXCJsb2NhbC1nb29nbGUtY2xvdWQtZnVuY3Rpb25zXCIsXG4gIFwibnBtLXBhY2thZ2VcIjogXCJucG0tcGFja2FnZVwiLFxufVxuXG5leHBvcnQgY29uc3QgYXZhaWxhYmxlTW9kdWxlVHlwZXMgPSA8TW9kdWxlVHlwZVtdPk9iamVjdC5rZXlzKE1PRFVMRV9QUk9WSURFUl9NQVApXG5cbmV4cG9ydCB0eXBlIE1vZHVsZVR5cGUgPSBrZXlvZiB0eXBlb2YgTU9EVUxFX1BST1ZJREVSX01BUFxuXG5leHBvcnQgY29uc3QgbW9kdWxlU2NoZW1hID0gSm9pLm9iamVjdCgpLmtleXMoe1xuICBtb2R1bGU6IGJhc2VNb2R1bGVTcGVjU2NoZW1hLFxufSlcblxuZXhwb3J0IGludGVyZmFjZSBDb25maWdPcHRzIHtcbiAgbmFtZTogc3RyaW5nXG4gIHBhdGg6IHN0cmluZ1xuICBjb25maWc6IHsgbW9kdWxlOiBQYXJ0aWFsPE1vZHVsZUNvbmZpZz4gfSB8IFBhcnRpYWw8UHJvamVjdENvbmZpZz5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBNb2R1bGVDb25maWdPcHRzIGV4dGVuZHMgQ29uZmlnT3B0cyB7XG4gIHR5cGU6IE1vZHVsZVR5cGVcbiAgY29uZmlnOiB7IG1vZHVsZTogUGFydGlhbDxNb2R1bGVDb25maWc+IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9qZWN0Q29uZmlnT3B0cyBleHRlbmRzIENvbmZpZ09wdHMge1xuICBjb25maWc6IFBhcnRpYWw8UHJvamVjdENvbmZpZz5cbn1cblxuY29uc3Qgbm9DYXNlID0gKHN0cjogc3RyaW5nKSA9PiBzdHIucmVwbGFjZSgvLXxfL2csIFwiIFwiKVxuY29uc3QgdGl0bGVpemUgPSAoc3RyOiBzdHJpbmcpID0+IGNhcGl0YWxpemUobm9DYXNlKHN0cikpXG5cbmV4cG9ydCBmdW5jdGlvbiBjb250YWluZXJUZW1wbGF0ZShtb2R1bGVOYW1lOiBzdHJpbmcpOiBEZWVwUGFydGlhbDxDb250YWluZXJNb2R1bGVTcGVjPiB7XG4gIHJldHVybiB7XG4gICAgc2VydmljZXM6IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogYCR7bW9kdWxlTmFtZX0tc2VydmljZWAsXG4gICAgICAgIHBvcnRzOiBbe1xuICAgICAgICAgIG5hbWU6IFwiaHR0cFwiLFxuICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODAsXG4gICAgICAgIH1dLFxuICAgICAgICBpbmdyZXNzZXM6IFt7XG4gICAgICAgICAgcGF0aDogXCIvXCIsXG4gICAgICAgICAgcG9ydDogXCJodHRwXCIsXG4gICAgICAgIH1dLFxuICAgICAgfSxcbiAgICBdLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnb29nbGVDbG91ZEZ1bmN0aW9uVGVtcGxhdGUobW9kdWxlTmFtZTogc3RyaW5nKTogRGVlcFBhcnRpYWw8R2NmTW9kdWxlU3BlYz4ge1xuICByZXR1cm4ge1xuICAgIGZ1bmN0aW9uczogW3tcbiAgICAgIG5hbWU6IGAke21vZHVsZU5hbWV9LWdvb2dsZS1jbG91ZC1mdW5jdGlvbmAsXG4gICAgICBlbnRyeXBvaW50OiBjYW1lbENhc2UoYCR7bW9kdWxlTmFtZX0tZ29vZ2xlLWNsb3VkLWZ1bmN0aW9uYCksXG4gICAgfV0sXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5wbVBhY2thZ2VUZW1wbGF0ZShfbW9kdWxlTmFtZTogc3RyaW5nKTogYW55IHtcbiAgcmV0dXJuIHt9XG59XG5cbmV4cG9ydCBjb25zdCBwcm9qZWN0VGVtcGxhdGUgPSAobmFtZTogc3RyaW5nLCBtb2R1bGVUeXBlczogTW9kdWxlVHlwZVtdKTogUGFydGlhbDxQcm9qZWN0Q29uZmlnPiA9PiB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IHVuaXEobW9kdWxlVHlwZXMpLm1hcCh0eXBlID0+ICh7IG5hbWU6IE1PRFVMRV9QUk9WSURFUl9NQVBbdHlwZV0gfSkpXG4gIHJldHVybiB7XG4gICAgbmFtZSxcbiAgICBlbnZpcm9ubWVudHM6IFtcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJsb2NhbFwiLFxuICAgICAgICBwcm92aWRlcnMsXG4gICAgICAgIHZhcmlhYmxlczoge30sXG4gICAgICB9LFxuICAgIF0sXG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IG1vZHVsZVRlbXBsYXRlID0gKG5hbWU6IHN0cmluZywgdHlwZTogTW9kdWxlVHlwZSk6IFBhcnRpYWw8QmFzZU1vZHVsZVNwZWM+ID0+ICh7XG4gIG5hbWUsXG4gIHR5cGUsXG4gIGRlc2NyaXB0aW9uOiBgJHt0aXRsZWl6ZShuYW1lKX0gJHtub0Nhc2UodHlwZSl9YCxcbn0pXG4iXX0=
