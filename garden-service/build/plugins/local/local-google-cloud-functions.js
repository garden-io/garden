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
const google_cloud_functions_1 = require("../google/google-cloud-functions");
const constants_1 = require("../../constants");
const pluginName = "local-google-cloud-functions";
const emulatorModuleName = "local-gcf-container";
const baseContainerName = `${pluginName}--${emulatorModuleName}`;
const emulatorBaseModulePath = path_1.join(constants_1.STATIC_DIR, emulatorModuleName);
const emulatorPort = 8010;
exports.gardenPlugin = () => ({
    modules: [emulatorBaseModulePath],
    moduleActions: {
        "google-cloud-function": {
            validate(params) {
                return __awaiter(this, void 0, void 0, function* () {
                    const parsed = yield google_cloud_functions_1.parseGcfModule(params);
                    // convert the module and services to containers to run locally
                    const serviceConfigs = parsed.serviceConfigs.map((s) => {
                        const functionEntrypoint = s.spec.entrypoint || s.name;
                        const spec = {
                            name: s.name,
                            dependencies: s.dependencies,
                            outputs: {
                                ingress: `http://${s.name}:${emulatorPort}/local/local/${functionEntrypoint}`,
                            },
                            command: ["/app/start.sh", functionEntrypoint],
                            daemon: false,
                            ingresses: [{
                                    name: "default",
                                    hostname: s.spec.hostname,
                                    port: "http",
                                    path: "/",
                                }],
                            env: {},
                            healthCheck: { tcpPort: "http" },
                            ports: [
                                {
                                    name: "http",
                                    protocol: "TCP",
                                    containerPort: emulatorPort,
                                },
                            ],
                            volumes: [],
                        };
                        return {
                            name: spec.name,
                            dependencies: spec.dependencies,
                            outputs: spec.outputs,
                            spec,
                        };
                    });
                    return {
                        allowPublish: true,
                        build: {
                            command: [],
                            dependencies: parsed.build.dependencies.concat([{
                                    name: emulatorModuleName,
                                    plugin: pluginName,
                                    copy: [{
                                            source: "child/Dockerfile",
                                            target: "Dockerfile",
                                        }],
                                }]),
                        },
                        name: parsed.name,
                        path: parsed.path,
                        type: "container",
                        variables: parsed.variables,
                        spec: {
                            buildArgs: {
                                baseImageName: `${baseContainerName}:\${modules.${baseContainerName}.version}`,
                            },
                            image: `${parsed.name}:\${modules.${parsed.name}.version}`,
                            services: serviceConfigs.map(s => s.spec),
                            tests: [],
                        },
                        serviceConfigs,
                        testConfigs: parsed.testConfigs,
                    };
                });
            },
        },
    },
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvbG9jYWwvbG9jYWwtZ29vZ2xlLWNsb3VkLWZ1bmN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBR0gsK0JBQTJCO0FBQzNCLDZFQUd5QztBQUl6QywrQ0FBNEM7QUFPNUMsTUFBTSxVQUFVLEdBQUcsOEJBQThCLENBQUE7QUFDakQsTUFBTSxrQkFBa0IsR0FBRyxxQkFBcUIsQ0FBQTtBQUNoRCxNQUFNLGlCQUFpQixHQUFHLEdBQUcsVUFBVSxLQUFLLGtCQUFrQixFQUFFLENBQUE7QUFDaEUsTUFBTSxzQkFBc0IsR0FBRyxXQUFJLENBQUMsc0JBQVUsRUFBRSxrQkFBa0IsQ0FBQyxDQUFBO0FBQ25FLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQTtBQUVaLFFBQUEsWUFBWSxHQUFHLEdBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQy9DLE9BQU8sRUFBRSxDQUFDLHNCQUFzQixDQUFDO0lBRWpDLGFBQWEsRUFBRTtRQUNiLHVCQUF1QixFQUFFO1lBQ2pCLFFBQVEsQ0FBQyxNQUF1Qzs7b0JBQ3BELE1BQU0sTUFBTSxHQUFHLE1BQU0sdUNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtvQkFFM0MsK0RBQStEO29CQUMvRCxNQUFNLGNBQWMsR0FBMEMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTt3QkFDNUYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFBO3dCQUV0RCxNQUFNLElBQUksR0FBRzs0QkFDWCxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7NEJBQ1osWUFBWSxFQUFFLENBQUMsQ0FBQyxZQUFZOzRCQUM1QixPQUFPLEVBQUU7Z0NBQ1AsT0FBTyxFQUFFLFVBQVUsQ0FBQyxDQUFDLElBQUksSUFBSSxZQUFZLGdCQUFnQixrQkFBa0IsRUFBRTs2QkFDOUU7NEJBQ0QsT0FBTyxFQUFFLENBQUMsZUFBZSxFQUFFLGtCQUFrQixDQUFDOzRCQUM5QyxNQUFNLEVBQUUsS0FBSzs0QkFDYixTQUFTLEVBQUUsQ0FBQztvQ0FDVixJQUFJLEVBQUUsU0FBUztvQ0FDZixRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRO29DQUN6QixJQUFJLEVBQUUsTUFBTTtvQ0FDWixJQUFJLEVBQUUsR0FBRztpQ0FDVixDQUFDOzRCQUNGLEdBQUcsRUFBRSxFQUFFOzRCQUNQLFdBQVcsRUFBRSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUU7NEJBQ2hDLEtBQUssRUFBRTtnQ0FDTDtvQ0FDRSxJQUFJLEVBQUUsTUFBTTtvQ0FDWixRQUFRLEVBQXVCLEtBQUs7b0NBQ3BDLGFBQWEsRUFBRSxZQUFZO2lDQUM1Qjs2QkFDRjs0QkFDRCxPQUFPLEVBQUUsRUFBRTt5QkFDWixDQUFBO3dCQUVELE9BQU87NEJBQ0wsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJOzRCQUNmLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWTs0QkFDL0IsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPOzRCQUNyQixJQUFJO3lCQUNMLENBQUE7b0JBQ0gsQ0FBQyxDQUFDLENBQUE7b0JBRUYsT0FBTzt3QkFDTCxZQUFZLEVBQUUsSUFBSTt3QkFDbEIsS0FBSyxFQUFFOzRCQUNMLE9BQU8sRUFBRSxFQUFFOzRCQUNYLFlBQVksRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztvQ0FDOUMsSUFBSSxFQUFFLGtCQUFrQjtvQ0FDeEIsTUFBTSxFQUFFLFVBQVU7b0NBQ2xCLElBQUksRUFBRSxDQUFDOzRDQUNMLE1BQU0sRUFBRSxrQkFBa0I7NENBQzFCLE1BQU0sRUFBRSxZQUFZO3lDQUNyQixDQUFDO2lDQUNILENBQUMsQ0FBQzt5QkFDSjt3QkFDRCxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7d0JBQ2pCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTt3QkFDakIsSUFBSSxFQUFFLFdBQVc7d0JBQ2pCLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUzt3QkFFM0IsSUFBSSxFQUFFOzRCQUNKLFNBQVMsRUFBRTtnQ0FDVCxhQUFhLEVBQUUsR0FBRyxpQkFBaUIsZUFBZSxpQkFBaUIsV0FBVzs2QkFDL0U7NEJBQ0QsS0FBSyxFQUFFLEdBQUcsTUFBTSxDQUFDLElBQUksZUFBZSxNQUFNLENBQUMsSUFBSSxXQUFXOzRCQUMxRCxRQUFRLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUF1QixDQUFDLENBQUMsSUFBSSxDQUFDOzRCQUMvRCxLQUFLLEVBQUUsRUFBRTt5QkFDVjt3QkFFRCxjQUFjO3dCQUNkLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztxQkFDaEMsQ0FBQTtnQkFDSCxDQUFDO2FBQUE7U0FDRjtLQUNGO0NBQ0YsQ0FBQyxDQUFBIiwiZmlsZSI6InBsdWdpbnMvbG9jYWwvbG9jYWwtZ29vZ2xlLWNsb3VkLWZ1bmN0aW9ucy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBWYWxpZGF0ZU1vZHVsZVBhcmFtcyB9IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQge1xuICBHY2ZNb2R1bGUsXG4gIHBhcnNlR2NmTW9kdWxlLFxufSBmcm9tIFwiLi4vZ29vZ2xlL2dvb2dsZS1jbG91ZC1mdW5jdGlvbnNcIlxuaW1wb3J0IHtcbiAgR2FyZGVuUGx1Z2luLFxufSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5pbXBvcnQgeyBTVEFUSUNfRElSIH0gZnJvbSBcIi4uLy4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBTZXJ2aWNlQ29uZmlnIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9zZXJ2aWNlXCJcbmltcG9ydCB7XG4gIENvbnRhaW5lclNlcnZpY2VTcGVjLFxuICBTZXJ2aWNlUG9ydFByb3RvY29sLFxufSBmcm9tIFwiLi4vY29udGFpbmVyXCJcblxuY29uc3QgcGx1Z2luTmFtZSA9IFwibG9jYWwtZ29vZ2xlLWNsb3VkLWZ1bmN0aW9uc1wiXG5jb25zdCBlbXVsYXRvck1vZHVsZU5hbWUgPSBcImxvY2FsLWdjZi1jb250YWluZXJcIlxuY29uc3QgYmFzZUNvbnRhaW5lck5hbWUgPSBgJHtwbHVnaW5OYW1lfS0tJHtlbXVsYXRvck1vZHVsZU5hbWV9YFxuY29uc3QgZW11bGF0b3JCYXNlTW9kdWxlUGF0aCA9IGpvaW4oU1RBVElDX0RJUiwgZW11bGF0b3JNb2R1bGVOYW1lKVxuY29uc3QgZW11bGF0b3JQb3J0ID0gODAxMFxuXG5leHBvcnQgY29uc3QgZ2FyZGVuUGx1Z2luID0gKCk6IEdhcmRlblBsdWdpbiA9PiAoe1xuICBtb2R1bGVzOiBbZW11bGF0b3JCYXNlTW9kdWxlUGF0aF0sXG5cbiAgbW9kdWxlQWN0aW9uczoge1xuICAgIFwiZ29vZ2xlLWNsb3VkLWZ1bmN0aW9uXCI6IHtcbiAgICAgIGFzeW5jIHZhbGlkYXRlKHBhcmFtczogVmFsaWRhdGVNb2R1bGVQYXJhbXM8R2NmTW9kdWxlPikge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBhd2FpdCBwYXJzZUdjZk1vZHVsZShwYXJhbXMpXG5cbiAgICAgICAgLy8gY29udmVydCB0aGUgbW9kdWxlIGFuZCBzZXJ2aWNlcyB0byBjb250YWluZXJzIHRvIHJ1biBsb2NhbGx5XG4gICAgICAgIGNvbnN0IHNlcnZpY2VDb25maWdzOiBTZXJ2aWNlQ29uZmlnPENvbnRhaW5lclNlcnZpY2VTcGVjPltdID0gcGFyc2VkLnNlcnZpY2VDb25maWdzLm1hcCgocykgPT4ge1xuICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uRW50cnlwb2ludCA9IHMuc3BlYy5lbnRyeXBvaW50IHx8IHMubmFtZVxuXG4gICAgICAgICAgY29uc3Qgc3BlYyA9IHtcbiAgICAgICAgICAgIG5hbWU6IHMubmFtZSxcbiAgICAgICAgICAgIGRlcGVuZGVuY2llczogcy5kZXBlbmRlbmNpZXMsXG4gICAgICAgICAgICBvdXRwdXRzOiB7XG4gICAgICAgICAgICAgIGluZ3Jlc3M6IGBodHRwOi8vJHtzLm5hbWV9OiR7ZW11bGF0b3JQb3J0fS9sb2NhbC9sb2NhbC8ke2Z1bmN0aW9uRW50cnlwb2ludH1gLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNvbW1hbmQ6IFtcIi9hcHAvc3RhcnQuc2hcIiwgZnVuY3Rpb25FbnRyeXBvaW50XSxcbiAgICAgICAgICAgIGRhZW1vbjogZmFsc2UsXG4gICAgICAgICAgICBpbmdyZXNzZXM6IFt7XG4gICAgICAgICAgICAgIG5hbWU6IFwiZGVmYXVsdFwiLFxuICAgICAgICAgICAgICBob3N0bmFtZTogcy5zcGVjLmhvc3RuYW1lLFxuICAgICAgICAgICAgICBwb3J0OiBcImh0dHBcIixcbiAgICAgICAgICAgICAgcGF0aDogXCIvXCIsXG4gICAgICAgICAgICB9XSxcbiAgICAgICAgICAgIGVudjoge30sXG4gICAgICAgICAgICBoZWFsdGhDaGVjazogeyB0Y3BQb3J0OiBcImh0dHBcIiB9LFxuICAgICAgICAgICAgcG9ydHM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6IFwiaHR0cFwiLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOiA8U2VydmljZVBvcnRQcm90b2NvbD5cIlRDUFwiLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IGVtdWxhdG9yUG9ydCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB2b2x1bWVzOiBbXSxcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogc3BlYy5uYW1lLFxuICAgICAgICAgICAgZGVwZW5kZW5jaWVzOiBzcGVjLmRlcGVuZGVuY2llcyxcbiAgICAgICAgICAgIG91dHB1dHM6IHNwZWMub3V0cHV0cyxcbiAgICAgICAgICAgIHNwZWMsXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgYWxsb3dQdWJsaXNoOiB0cnVlLFxuICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICBjb21tYW5kOiBbXSxcbiAgICAgICAgICAgIGRlcGVuZGVuY2llczogcGFyc2VkLmJ1aWxkLmRlcGVuZGVuY2llcy5jb25jYXQoW3tcbiAgICAgICAgICAgICAgbmFtZTogZW11bGF0b3JNb2R1bGVOYW1lLFxuICAgICAgICAgICAgICBwbHVnaW46IHBsdWdpbk5hbWUsXG4gICAgICAgICAgICAgIGNvcHk6IFt7XG4gICAgICAgICAgICAgICAgc291cmNlOiBcImNoaWxkL0RvY2tlcmZpbGVcIixcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IFwiRG9ja2VyZmlsZVwiLFxuICAgICAgICAgICAgICB9XSxcbiAgICAgICAgICAgIH1dKSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIG5hbWU6IHBhcnNlZC5uYW1lLFxuICAgICAgICAgIHBhdGg6IHBhcnNlZC5wYXRoLFxuICAgICAgICAgIHR5cGU6IFwiY29udGFpbmVyXCIsXG4gICAgICAgICAgdmFyaWFibGVzOiBwYXJzZWQudmFyaWFibGVzLFxuXG4gICAgICAgICAgc3BlYzoge1xuICAgICAgICAgICAgYnVpbGRBcmdzOiB7XG4gICAgICAgICAgICAgIGJhc2VJbWFnZU5hbWU6IGAke2Jhc2VDb250YWluZXJOYW1lfTpcXCR7bW9kdWxlcy4ke2Jhc2VDb250YWluZXJOYW1lfS52ZXJzaW9ufWAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaW1hZ2U6IGAke3BhcnNlZC5uYW1lfTpcXCR7bW9kdWxlcy4ke3BhcnNlZC5uYW1lfS52ZXJzaW9ufWAsXG4gICAgICAgICAgICBzZXJ2aWNlczogc2VydmljZUNvbmZpZ3MubWFwKHMgPT4gPENvbnRhaW5lclNlcnZpY2VTcGVjPnMuc3BlYyksXG4gICAgICAgICAgICB0ZXN0czogW10sXG4gICAgICAgICAgfSxcblxuICAgICAgICAgIHNlcnZpY2VDb25maWdzLFxuICAgICAgICAgIHRlc3RDb25maWdzOiBwYXJzZWQudGVzdENvbmZpZ3MsXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pXG4iXX0=
