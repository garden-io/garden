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
const common_1 = require("./common");
const common_2 = require("./common");
const util_1 = require("../../util/util");
exports.gardenPlugin = () => ({
    actions: {
        getEnvironmentStatus: common_2.getEnvironmentStatus,
        prepareEnvironment: common_2.prepareEnvironment,
    },
    moduleActions: {
        container: {
            getServiceStatus() {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO
                    // const project = this.getProject(service, env)
                    //
                    // const appStatus = await this.gcloud(project).json(["app", "describe"])
                    // const services = await this.gcloud(project).json(["app", "services", "list"])
                    // const instances: any[] = await this.gcloud(project).json(["app", "instances", "list"])
                    return {};
                });
            },
            deployService({ ctx, service, runtimeContext, logEntry }) {
                return __awaiter(this, void 0, void 0, function* () {
                    logEntry && logEntry.info({
                        section: service.name,
                        msg: `Deploying app...`,
                    });
                    const config = service.spec;
                    // prepare app.yaml
                    const appYaml = {
                        runtime: "custom",
                        env: "flex",
                        env_variables: Object.assign({}, runtimeContext.envVars, service.spec.env),
                    };
                    if (config.healthCheck) {
                        if (config.healthCheck.tcpPort || config.healthCheck.command) {
                            logEntry && logEntry.warn({
                                section: service.name,
                                msg: "GAE only supports httpGet health checks",
                            });
                        }
                        if (config.healthCheck.httpGet) {
                            appYaml.liveness_check = { path: config.healthCheck.httpGet.path };
                            appYaml.readiness_check = { path: config.healthCheck.httpGet.path };
                        }
                    }
                    // write app.yaml to build context
                    const appYamlPath = path_1.join(service.module.path, "app.yaml");
                    yield util_1.dumpYaml(appYamlPath, appYaml);
                    // deploy to GAE
                    const project = common_1.getProject(service, ctx.provider);
                    yield common_1.gcloud(project).call([
                        "app", "deploy", "--quiet",
                    ], { cwd: service.module.path });
                    logEntry && logEntry.info({ section: service.name, msg: `App deployed` });
                    return {};
                });
            },
            getServiceOutputs({ ctx, service }) {
                return __awaiter(this, void 0, void 0, function* () {
                    // TODO: we may want to pull this from the service status instead, along with other outputs
                    const project = common_1.getProject(service, ctx.provider);
                    return {
                        ingress: `https://${common_2.GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
                    };
                });
            },
        },
    },
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvZ29vZ2xlL2dvb2dsZS1hcHAtZW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFPSCwrQkFBMkI7QUFDM0IscUNBR2lCO0FBQ2pCLHFDQUlpQjtBQU1qQiwwQ0FBMEM7QUFXN0IsUUFBQSxZQUFZLEdBQUcsR0FBaUIsRUFBRSxDQUFDLENBQUM7SUFDL0MsT0FBTyxFQUFFO1FBQ1Asb0JBQW9CLEVBQXBCLDZCQUFvQjtRQUNwQixrQkFBa0IsRUFBbEIsMkJBQWtCO0tBQ25CO0lBQ0QsYUFBYSxFQUFFO1FBQ2IsU0FBUyxFQUFFO1lBQ0gsZ0JBQWdCOztvQkFDcEIsT0FBTztvQkFDUCxnREFBZ0Q7b0JBQ2hELEVBQUU7b0JBQ0YseUVBQXlFO29CQUN6RSxnRkFBZ0Y7b0JBQ2hGLHlGQUF5RjtvQkFFekYsT0FBTyxFQUFFLENBQUE7Z0JBQ1gsQ0FBQzthQUFBO1lBRUssYUFBYSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUE4Qzs7b0JBQ3hHLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDO3dCQUN4QixPQUFPLEVBQUUsT0FBTyxDQUFDLElBQUk7d0JBQ3JCLEdBQUcsRUFBRSxrQkFBa0I7cUJBQ3hCLENBQUMsQ0FBQTtvQkFFRixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFBO29CQUUzQixtQkFBbUI7b0JBQ25CLE1BQU0sT0FBTyxHQUFRO3dCQUNuQixPQUFPLEVBQUUsUUFBUTt3QkFDakIsR0FBRyxFQUFFLE1BQU07d0JBQ1gsYUFBYSxvQkFBTyxjQUFjLENBQUMsT0FBTyxFQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFFO3FCQUNsRSxDQUFBO29CQUVELElBQUksTUFBTSxDQUFDLFdBQVcsRUFBRTt3QkFDdEIsSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRTs0QkFDNUQsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUM7Z0NBQ3hCLE9BQU8sRUFBRSxPQUFPLENBQUMsSUFBSTtnQ0FDckIsR0FBRyxFQUFFLHlDQUF5Qzs2QkFDL0MsQ0FBQyxDQUFBO3lCQUNIO3dCQUNELElBQUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUU7NEJBQzlCLE9BQU8sQ0FBQyxjQUFjLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUE7NEJBQ2xFLE9BQU8sQ0FBQyxlQUFlLEdBQUcsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUE7eUJBQ3BFO3FCQUNGO29CQUVELGtDQUFrQztvQkFDbEMsTUFBTSxXQUFXLEdBQUcsV0FBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFBO29CQUN6RCxNQUFNLGVBQVEsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUE7b0JBRXBDLGdCQUFnQjtvQkFDaEIsTUFBTSxPQUFPLEdBQUcsbUJBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFBO29CQUVqRCxNQUFNLGVBQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUM7d0JBQ3pCLEtBQUssRUFBRSxRQUFRLEVBQUUsU0FBUztxQkFDM0IsRUFBRSxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUE7b0JBRWhDLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUE7b0JBRXpFLE9BQU8sRUFBRSxDQUFBO2dCQUNYLENBQUM7YUFBQTtZQUVLLGlCQUFpQixDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBa0Q7O29CQUN0RiwyRkFBMkY7b0JBQzNGLE1BQU0sT0FBTyxHQUFHLG1CQUFVLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQTtvQkFFakQsT0FBTzt3QkFDTCxPQUFPLEVBQUUsV0FBVyxvQ0FBMkIsSUFBSSxPQUFPLHVCQUF1QixPQUFPLENBQUMsSUFBSSxFQUFFO3FCQUNoRyxDQUFBO2dCQUNILENBQUM7YUFBQTtTQUNGO0tBQ0Y7Q0FDRixDQUFDLENBQUEiLCJmaWxlIjoicGx1Z2lucy9nb29nbGUvZ29vZ2xlLWFwcC1lbmdpbmUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHtcbiAgRGVwbG95U2VydmljZVBhcmFtcyxcbiAgR2V0U2VydmljZU91dHB1dHNQYXJhbXMsXG59IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vcGFyYW1zXCJcbmltcG9ydCB7IFNlcnZpY2VTdGF0dXMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcInBhdGhcIlxuaW1wb3J0IHtcbiAgZ2Nsb3VkLFxuICBnZXRQcm9qZWN0LFxufSBmcm9tIFwiLi9jb21tb25cIlxuaW1wb3J0IHtcbiAgZ2V0RW52aXJvbm1lbnRTdGF0dXMsXG4gIEdPT0dMRV9DTE9VRF9ERUZBVUxUX1JFR0lPTixcbiAgcHJlcGFyZUVudmlyb25tZW50LFxufSBmcm9tIFwiLi9jb21tb25cIlxuaW1wb3J0IHtcbiAgQ29udGFpbmVyTW9kdWxlLFxuICBDb250YWluZXJNb2R1bGVTcGVjLFxuICBDb250YWluZXJTZXJ2aWNlU3BlYyxcbn0gZnJvbSBcIi4uL2NvbnRhaW5lclwiXG5pbXBvcnQgeyBkdW1wWWFtbCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHtcbiAgR2FyZGVuUGx1Z2luLFxufSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BsdWdpblwiXG5cbmV4cG9ydCBpbnRlcmZhY2UgR29vZ2xlQXBwRW5naW5lU2VydmljZVNwZWMgZXh0ZW5kcyBDb250YWluZXJTZXJ2aWNlU3BlYyB7XG4gIHByb2plY3Q/OiBzdHJpbmdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHb29nbGVBcHBFbmdpbmVNb2R1bGUgZXh0ZW5kcyBDb250YWluZXJNb2R1bGU8Q29udGFpbmVyTW9kdWxlU3BlYywgR29vZ2xlQXBwRW5naW5lU2VydmljZVNwZWM+IHsgfVxuXG5leHBvcnQgY29uc3QgZ2FyZGVuUGx1Z2luID0gKCk6IEdhcmRlblBsdWdpbiA9PiAoe1xuICBhY3Rpb25zOiB7XG4gICAgZ2V0RW52aXJvbm1lbnRTdGF0dXMsXG4gICAgcHJlcGFyZUVudmlyb25tZW50LFxuICB9LFxuICBtb2R1bGVBY3Rpb25zOiB7XG4gICAgY29udGFpbmVyOiB7XG4gICAgICBhc3luYyBnZXRTZXJ2aWNlU3RhdHVzKCk6IFByb21pc2U8U2VydmljZVN0YXR1cz4ge1xuICAgICAgICAvLyBUT0RPXG4gICAgICAgIC8vIGNvbnN0IHByb2plY3QgPSB0aGlzLmdldFByb2plY3Qoc2VydmljZSwgZW52KVxuICAgICAgICAvL1xuICAgICAgICAvLyBjb25zdCBhcHBTdGF0dXMgPSBhd2FpdCB0aGlzLmdjbG91ZChwcm9qZWN0KS5qc29uKFtcImFwcFwiLCBcImRlc2NyaWJlXCJdKVxuICAgICAgICAvLyBjb25zdCBzZXJ2aWNlcyA9IGF3YWl0IHRoaXMuZ2Nsb3VkKHByb2plY3QpLmpzb24oW1wiYXBwXCIsIFwic2VydmljZXNcIiwgXCJsaXN0XCJdKVxuICAgICAgICAvLyBjb25zdCBpbnN0YW5jZXM6IGFueVtdID0gYXdhaXQgdGhpcy5nY2xvdWQocHJvamVjdCkuanNvbihbXCJhcHBcIiwgXCJpbnN0YW5jZXNcIiwgXCJsaXN0XCJdKVxuXG4gICAgICAgIHJldHVybiB7fVxuICAgICAgfSxcblxuICAgICAgYXN5bmMgZGVwbG95U2VydmljZSh7IGN0eCwgc2VydmljZSwgcnVudGltZUNvbnRleHQsIGxvZ0VudHJ5IH06IERlcGxveVNlcnZpY2VQYXJhbXM8R29vZ2xlQXBwRW5naW5lTW9kdWxlPikge1xuICAgICAgICBsb2dFbnRyeSAmJiBsb2dFbnRyeS5pbmZvKHtcbiAgICAgICAgICBzZWN0aW9uOiBzZXJ2aWNlLm5hbWUsXG4gICAgICAgICAgbXNnOiBgRGVwbG95aW5nIGFwcC4uLmAsXG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgY29uZmlnID0gc2VydmljZS5zcGVjXG5cbiAgICAgICAgLy8gcHJlcGFyZSBhcHAueWFtbFxuICAgICAgICBjb25zdCBhcHBZYW1sOiBhbnkgPSB7XG4gICAgICAgICAgcnVudGltZTogXCJjdXN0b21cIixcbiAgICAgICAgICBlbnY6IFwiZmxleFwiLFxuICAgICAgICAgIGVudl92YXJpYWJsZXM6IHsgLi4ucnVudGltZUNvbnRleHQuZW52VmFycywgLi4uc2VydmljZS5zcGVjLmVudiB9LFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvbmZpZy5oZWFsdGhDaGVjaykge1xuICAgICAgICAgIGlmIChjb25maWcuaGVhbHRoQ2hlY2sudGNwUG9ydCB8fCBjb25maWcuaGVhbHRoQ2hlY2suY29tbWFuZCkge1xuICAgICAgICAgICAgbG9nRW50cnkgJiYgbG9nRW50cnkud2Fybih7XG4gICAgICAgICAgICAgIHNlY3Rpb246IHNlcnZpY2UubmFtZSxcbiAgICAgICAgICAgICAgbXNnOiBcIkdBRSBvbmx5IHN1cHBvcnRzIGh0dHBHZXQgaGVhbHRoIGNoZWNrc1wiLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNvbmZpZy5oZWFsdGhDaGVjay5odHRwR2V0KSB7XG4gICAgICAgICAgICBhcHBZYW1sLmxpdmVuZXNzX2NoZWNrID0geyBwYXRoOiBjb25maWcuaGVhbHRoQ2hlY2suaHR0cEdldC5wYXRoIH1cbiAgICAgICAgICAgIGFwcFlhbWwucmVhZGluZXNzX2NoZWNrID0geyBwYXRoOiBjb25maWcuaGVhbHRoQ2hlY2suaHR0cEdldC5wYXRoIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyB3cml0ZSBhcHAueWFtbCB0byBidWlsZCBjb250ZXh0XG4gICAgICAgIGNvbnN0IGFwcFlhbWxQYXRoID0gam9pbihzZXJ2aWNlLm1vZHVsZS5wYXRoLCBcImFwcC55YW1sXCIpXG4gICAgICAgIGF3YWl0IGR1bXBZYW1sKGFwcFlhbWxQYXRoLCBhcHBZYW1sKVxuXG4gICAgICAgIC8vIGRlcGxveSB0byBHQUVcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IGdldFByb2plY3Qoc2VydmljZSwgY3R4LnByb3ZpZGVyKVxuXG4gICAgICAgIGF3YWl0IGdjbG91ZChwcm9qZWN0KS5jYWxsKFtcbiAgICAgICAgICBcImFwcFwiLCBcImRlcGxveVwiLCBcIi0tcXVpZXRcIixcbiAgICAgICAgXSwgeyBjd2Q6IHNlcnZpY2UubW9kdWxlLnBhdGggfSlcblxuICAgICAgICBsb2dFbnRyeSAmJiBsb2dFbnRyeS5pbmZvKHsgc2VjdGlvbjogc2VydmljZS5uYW1lLCBtc2c6IGBBcHAgZGVwbG95ZWRgIH0pXG5cbiAgICAgICAgcmV0dXJuIHt9XG4gICAgICB9LFxuXG4gICAgICBhc3luYyBnZXRTZXJ2aWNlT3V0cHV0cyh7IGN0eCwgc2VydmljZSB9OiBHZXRTZXJ2aWNlT3V0cHV0c1BhcmFtczxHb29nbGVBcHBFbmdpbmVNb2R1bGU+KSB7XG4gICAgICAgIC8vIFRPRE86IHdlIG1heSB3YW50IHRvIHB1bGwgdGhpcyBmcm9tIHRoZSBzZXJ2aWNlIHN0YXR1cyBpbnN0ZWFkLCBhbG9uZyB3aXRoIG90aGVyIG91dHB1dHNcbiAgICAgICAgY29uc3QgcHJvamVjdCA9IGdldFByb2plY3Qoc2VydmljZSwgY3R4LnByb3ZpZGVyKVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaW5ncmVzczogYGh0dHBzOi8vJHtHT09HTEVfQ0xPVURfREVGQVVMVF9SRUdJT059LSR7cHJvamVjdH0uY2xvdWRmdW5jdGlvbnMubmV0LyR7c2VydmljZS5uYW1lfWAsXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pXG4iXX0=
