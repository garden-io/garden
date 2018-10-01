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
const exceptions_1 = require("../../exceptions");
const gcloud_1 = require("./gcloud");
exports.GOOGLE_CLOUD_DEFAULT_REGION = "us-central1";
function getEnvironmentStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        let sdkInfo;
        const output = {
            ready: true,
            detail: {
                sdkInstalled: true,
                sdkInitialized: true,
                betaComponentsInstalled: true,
                sdkInfo: {},
            },
        };
        try {
            sdkInfo = output.detail.sdkInfo = yield gcloud().json(["info"]);
        }
        catch (err) {
            output.ready = false;
            output.detail.sdkInstalled = false;
        }
        if (!sdkInfo.config.account) {
            output.ready = false;
            output.detail.sdkInitialized = false;
        }
        if (!sdkInfo.installation.components.beta) {
            output.ready = false;
            output.detail.betaComponentsInstalled = false;
        }
        return output;
    });
}
exports.getEnvironmentStatus = getEnvironmentStatus;
function prepareEnvironment({ status, logEntry }) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!status.detail.sdkInstalled) {
            throw new exceptions_1.ConfigurationError("Google Cloud SDK is not installed. " +
                "Please visit https://cloud.google.com/sdk/downloads for installation instructions.", {});
        }
        if (!status.detail.betaComponentsInstalled) {
            logEntry && logEntry.info({
                section: "google-cloud-functions",
                msg: `Installing gcloud SDK beta components...`,
            });
            yield gcloud().call(["components update"]);
            yield gcloud().call(["components install beta"]);
        }
        if (!status.detail.sdkInitialized) {
            logEntry && logEntry.info({
                section: "google-cloud-functions",
                msg: `Initializing SDK...`,
            });
            yield gcloud().tty(["init"], { silent: false });
        }
        return {};
    });
}
exports.prepareEnvironment = prepareEnvironment;
function gcloud(project, account) {
    return new gcloud_1.GCloud({ project, account });
}
exports.gcloud = gcloud;
function getProject(service, provider) {
    return service.spec.project || provider.config["default-project"] || null;
}
exports.getProject = getProject;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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UUFBa0I7SUFDN0YsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLElBQUksSUFBSSxDQUFBO0FBQzNFLENBQUM7QUFGRCxnQ0FFQyIsImZpbGUiOiJwbHVnaW5zL2dvb2dsZS9jb21tb24uanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uLy4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBQcmVwYXJlRW52aXJvbm1lbnRQYXJhbXMgfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL3BhcmFtc1wiXG5pbXBvcnQgeyBTZXJ2aWNlIH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgR2VuZXJpY1Rlc3RTcGVjIH0gZnJvbSBcIi4uL2dlbmVyaWNcIlxuaW1wb3J0IHsgR0Nsb3VkIH0gZnJvbSBcIi4vZ2Nsb3VkXCJcbmltcG9ydCB7IE1vZHVsZVNwZWMgfSBmcm9tIFwiLi4vLi4vY29uZmlnL21vZHVsZVwiXG5pbXBvcnQgeyBCYXNlU2VydmljZVNwZWMgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3NlcnZpY2VcIlxuaW1wb3J0IHsgUHJvdmlkZXIgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3Byb2plY3RcIlxuXG5leHBvcnQgY29uc3QgR09PR0xFX0NMT1VEX0RFRkFVTFRfUkVHSU9OID0gXCJ1cy1jZW50cmFsMVwiXG5cbmV4cG9ydCBpbnRlcmZhY2UgR29vZ2xlQ2xvdWRTZXJ2aWNlU3BlYyBleHRlbmRzIEJhc2VTZXJ2aWNlU3BlYyB7XG4gIHByb2plY3Q/OiBzdHJpbmcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR29vZ2xlQ2xvdWRNb2R1bGU8XG4gIE0gZXh0ZW5kcyBNb2R1bGVTcGVjID0gTW9kdWxlU3BlYyxcbiAgUyBleHRlbmRzIEdvb2dsZUNsb3VkU2VydmljZVNwZWMgPSBHb29nbGVDbG91ZFNlcnZpY2VTcGVjLFxuICBUIGV4dGVuZHMgR2VuZXJpY1Rlc3RTcGVjID0gR2VuZXJpY1Rlc3RTcGVjLFxuICA+IGV4dGVuZHMgTW9kdWxlPE0sIFMsIFQ+IHsgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0RW52aXJvbm1lbnRTdGF0dXMoKSB7XG4gIGxldCBzZGtJbmZvXG5cbiAgY29uc3Qgb3V0cHV0ID0ge1xuICAgIHJlYWR5OiB0cnVlLFxuICAgIGRldGFpbDoge1xuICAgICAgc2RrSW5zdGFsbGVkOiB0cnVlLFxuICAgICAgc2RrSW5pdGlhbGl6ZWQ6IHRydWUsXG4gICAgICBiZXRhQ29tcG9uZW50c0luc3RhbGxlZDogdHJ1ZSxcbiAgICAgIHNka0luZm86IHt9LFxuICAgIH0sXG4gIH1cblxuICB0cnkge1xuICAgIHNka0luZm8gPSBvdXRwdXQuZGV0YWlsLnNka0luZm8gPSBhd2FpdCBnY2xvdWQoKS5qc29uKFtcImluZm9cIl0pXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIG91dHB1dC5yZWFkeSA9IGZhbHNlXG4gICAgb3V0cHV0LmRldGFpbC5zZGtJbnN0YWxsZWQgPSBmYWxzZVxuICB9XG5cbiAgaWYgKCFzZGtJbmZvLmNvbmZpZy5hY2NvdW50KSB7XG4gICAgb3V0cHV0LnJlYWR5ID0gZmFsc2VcbiAgICBvdXRwdXQuZGV0YWlsLnNka0luaXRpYWxpemVkID0gZmFsc2VcbiAgfVxuXG4gIGlmICghc2RrSW5mby5pbnN0YWxsYXRpb24uY29tcG9uZW50cy5iZXRhKSB7XG4gICAgb3V0cHV0LnJlYWR5ID0gZmFsc2VcbiAgICBvdXRwdXQuZGV0YWlsLmJldGFDb21wb25lbnRzSW5zdGFsbGVkID0gZmFsc2VcbiAgfVxuXG4gIHJldHVybiBvdXRwdXRcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByZXBhcmVFbnZpcm9ubWVudCh7IHN0YXR1cywgbG9nRW50cnkgfTogUHJlcGFyZUVudmlyb25tZW50UGFyYW1zKSB7XG4gIGlmICghc3RhdHVzLmRldGFpbC5zZGtJbnN0YWxsZWQpIHtcbiAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgXCJHb29nbGUgQ2xvdWQgU0RLIGlzIG5vdCBpbnN0YWxsZWQuIFwiICtcbiAgICAgIFwiUGxlYXNlIHZpc2l0IGh0dHBzOi8vY2xvdWQuZ29vZ2xlLmNvbS9zZGsvZG93bmxvYWRzIGZvciBpbnN0YWxsYXRpb24gaW5zdHJ1Y3Rpb25zLlwiLFxuICAgICAge30sXG4gICAgKVxuICB9XG5cbiAgaWYgKCFzdGF0dXMuZGV0YWlsLmJldGFDb21wb25lbnRzSW5zdGFsbGVkKSB7XG4gICAgbG9nRW50cnkgJiYgbG9nRW50cnkuaW5mbyh7XG4gICAgICBzZWN0aW9uOiBcImdvb2dsZS1jbG91ZC1mdW5jdGlvbnNcIixcbiAgICAgIG1zZzogYEluc3RhbGxpbmcgZ2Nsb3VkIFNESyBiZXRhIGNvbXBvbmVudHMuLi5gLFxuICAgIH0pXG4gICAgYXdhaXQgZ2Nsb3VkKCkuY2FsbChbXCJjb21wb25lbnRzIHVwZGF0ZVwiXSlcbiAgICBhd2FpdCBnY2xvdWQoKS5jYWxsKFtcImNvbXBvbmVudHMgaW5zdGFsbCBiZXRhXCJdKVxuICB9XG5cbiAgaWYgKCFzdGF0dXMuZGV0YWlsLnNka0luaXRpYWxpemVkKSB7XG4gICAgbG9nRW50cnkgJiYgbG9nRW50cnkuaW5mbyh7XG4gICAgICBzZWN0aW9uOiBcImdvb2dsZS1jbG91ZC1mdW5jdGlvbnNcIixcbiAgICAgIG1zZzogYEluaXRpYWxpemluZyBTREsuLi5gLFxuICAgIH0pXG4gICAgYXdhaXQgZ2Nsb3VkKCkudHR5KFtcImluaXRcIl0sIHsgc2lsZW50OiBmYWxzZSB9KVxuICB9XG5cbiAgcmV0dXJuIHt9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnY2xvdWQocHJvamVjdD86IHN0cmluZywgYWNjb3VudD86IHN0cmluZykge1xuICByZXR1cm4gbmV3IEdDbG91ZCh7IHByb2plY3QsIGFjY291bnQgfSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByb2plY3Q8VCBleHRlbmRzIEdvb2dsZUNsb3VkTW9kdWxlPihzZXJ2aWNlOiBTZXJ2aWNlPFQ+LCBwcm92aWRlcjogUHJvdmlkZXIpIHtcbiAgcmV0dXJuIHNlcnZpY2Uuc3BlYy5wcm9qZWN0IHx8IHByb3ZpZGVyLmNvbmZpZ1tcImRlZmF1bHQtcHJvamVjdFwiXSB8fCBudWxsXG59XG4iXX0=
