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
const url_1 = require("url");
const axios_1 = require("axios");
const chalk_1 = require("chalk");
const util_1 = require("util");
const base_1 = require("./base");
const util_2 = require("../util/util");
const exceptions_1 = require("../exceptions");
const lodash_1 = require("lodash");
const service_1 = require("../types/service");
const dedent = require("dedent");
const callArgs = {
    serviceAndPath: new base_1.StringParameter({
        help: "The name of the service(s) to call followed by the ingress path (e.g. my-container/somepath).",
        required: true,
    }),
};
class CallCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "call";
        this.help = "Call a service ingress endpoint.";
        this.description = dedent `
    This command resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
    outputs the result.

    Examples:

        garden call my-container
        garden call my-container/some-path

    Note: Currently only supports simple GET requests for HTTP/HTTPS ingresses.
  `;
        this.arguments = callArgs;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            let [serviceName, path] = util_2.splitFirst(args.serviceAndPath, "/");
            // TODO: better error when service doesn't exist
            const service = yield garden.getService(serviceName);
            const status = yield garden.actions.getServiceStatus({ service });
            if (status.state !== "ready") {
                throw new exceptions_1.RuntimeError(`Service ${service.name} is not running`, {
                    serviceName: service.name,
                    status,
                });
            }
            if (!status.ingresses) {
                throw new exceptions_1.ParameterError(`Service ${service.name} has no active ingresses`, {
                    serviceName: service.name,
                    serviceStatus: status,
                });
            }
            // find the correct endpoint to call
            let matchedIngress = null;
            let matchedPath;
            // we can't easily support raw TCP or UDP in a command like this
            const ingresses = status.ingresses.filter(e => e.protocol === "http" || e.protocol === "https");
            if (!path) {
                // if no path is specified and there's a root endpoint (path === "/") we use that
                const rootIngress = lodash_1.find(ingresses, e => e.path === "/");
                if (rootIngress) {
                    matchedIngress = rootIngress;
                    matchedPath = "/";
                }
                else {
                    // if there's no root endpoint, pick the first endpoint
                    matchedIngress = ingresses[0];
                    matchedPath = ingresses[0].path;
                }
                path = matchedPath;
            }
            else {
                path = "/" + path;
                for (const ingress of status.ingresses) {
                    if (ingress.path) {
                        if (path.startsWith(ingress.path) && (!matchedPath || ingress.path.length > matchedPath.length)) {
                            matchedIngress = ingress;
                            matchedPath = ingress.path;
                        }
                    }
                    else if (!matchedPath) {
                        matchedIngress = ingress;
                    }
                }
            }
            if (!matchedIngress) {
                throw new exceptions_1.ParameterError(`Service ${service.name} does not have an HTTP/HTTPS ingress at ${path}`, {
                    serviceName: service.name,
                    path,
                    availableIngresses: status.ingresses,
                });
            }
            const url = url_1.resolve(service_1.getIngressUrl(matchedIngress), path || matchedPath);
            // TODO: support POST requests with request body
            const method = "get";
            const entry = garden.log.info({
                msg: chalk_1.default.cyan(`Sending ${matchedIngress.protocol.toUpperCase()} GET request to `) + url + "\n",
                status: "active",
            });
            // this is to accept self-signed certs
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            const req = axios_1.default({
                method,
                url,
                headers: {
                    host: matchedIngress.hostname,
                },
            });
            // TODO: add verbose and debug logging (request/response headers etc.)
            let res;
            try {
                res = yield req;
                entry.setSuccess();
                garden.log.info(chalk_1.default.green(`${res.status} ${res.statusText}\n`));
            }
            catch (err) {
                res = err.response;
                entry.setError();
                const error = res ? `${res.status} ${res.statusText}` : err.message;
                garden.log.info(chalk_1.default.red(error + "\n"));
                return {};
            }
            const resStr = util_1.isObject(res.data) ? JSON.stringify(res.data, null, 2) : res.data;
            res.data && garden.log.info(chalk_1.default.white(resStr) + "\n");
            return {
                result: {
                    serviceName,
                    path,
                    url,
                    response: lodash_1.pick(res, ["status", "statusText", "headers", "data"]),
                },
            };
        });
    }
}
exports.CallCommand = CallCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxHQUFHLElBQUksQ0FBQyxDQUFBO1lBRXZELE9BQU87Z0JBQ0wsTUFBTSxFQUFFO29CQUNOLFdBQVc7b0JBQ1gsSUFBSTtvQkFDSixHQUFHO29CQUNILFFBQVEsRUFBRSxhQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7aUJBQ2pFO2FBQ0YsQ0FBQTtRQUNILENBQUM7S0FBQTtDQUNGO0FBcElELGtDQW9JQyIsImZpbGUiOiJjb21tYW5kcy9jYWxsLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwidXJsXCJcbmltcG9ydCBBeGlvcyBmcm9tIFwiYXhpb3NcIlxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gXCJ1dGlsXCJcbmltcG9ydCB7XG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIFN0cmluZ1BhcmFtZXRlcixcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgeyBzcGxpdEZpcnN0IH0gZnJvbSBcIi4uL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBQYXJhbWV0ZXJFcnJvciwgUnVudGltZUVycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgcGljaywgZmluZCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgU2VydmljZUluZ3Jlc3MsIGdldEluZ3Jlc3NVcmwgfSBmcm9tIFwiLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5jb25zdCBjYWxsQXJncyA9IHtcbiAgc2VydmljZUFuZFBhdGg6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHNlcnZpY2UocykgdG8gY2FsbCBmb2xsb3dlZCBieSB0aGUgaW5ncmVzcyBwYXRoIChlLmcuIG15LWNvbnRhaW5lci9zb21lcGF0aCkuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgY2FsbEFyZ3NcblxuZXhwb3J0IGNsYXNzIENhbGxDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzPiB7XG4gIG5hbWUgPSBcImNhbGxcIlxuICBoZWxwID0gXCJDYWxsIGEgc2VydmljZSBpbmdyZXNzIGVuZHBvaW50LlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgVGhpcyBjb21tYW5kIHJlc29sdmVzIHRoZSBkZXBsb3llZCBpbmdyZXNzIGVuZHBvaW50IGZvciB0aGUgZ2l2ZW4gc2VydmljZSBhbmQgcGF0aCwgY2FsbHMgdGhlIGdpdmVuIGVuZHBvaW50IGFuZFxuICAgIG91dHB1dHMgdGhlIHJlc3VsdC5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBjYWxsIG15LWNvbnRhaW5lclxuICAgICAgICBnYXJkZW4gY2FsbCBteS1jb250YWluZXIvc29tZS1wYXRoXG5cbiAgICBOb3RlOiBDdXJyZW50bHkgb25seSBzdXBwb3J0cyBzaW1wbGUgR0VUIHJlcXVlc3RzIGZvciBIVFRQL0hUVFBTIGluZ3Jlc3Nlcy5cbiAgYFxuXG4gIGFyZ3VtZW50cyA9IGNhbGxBcmdzXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuLCBhcmdzIH06IENvbW1hbmRQYXJhbXM8QXJncz4pOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ+IHtcbiAgICBsZXQgW3NlcnZpY2VOYW1lLCBwYXRoXSA9IHNwbGl0Rmlyc3QoYXJncy5zZXJ2aWNlQW5kUGF0aCwgXCIvXCIpXG5cbiAgICAvLyBUT0RPOiBiZXR0ZXIgZXJyb3Igd2hlbiBzZXJ2aWNlIGRvZXNuJ3QgZXhpc3RcbiAgICBjb25zdCBzZXJ2aWNlID0gYXdhaXQgZ2FyZGVuLmdldFNlcnZpY2Uoc2VydmljZU5hbWUpXG4gICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgZ2FyZGVuLmFjdGlvbnMuZ2V0U2VydmljZVN0YXR1cyh7IHNlcnZpY2UgfSlcblxuICAgIGlmIChzdGF0dXMuc3RhdGUgIT09IFwicmVhZHlcIikge1xuICAgICAgdGhyb3cgbmV3IFJ1bnRpbWVFcnJvcihgU2VydmljZSAke3NlcnZpY2UubmFtZX0gaXMgbm90IHJ1bm5pbmdgLCB7XG4gICAgICAgIHNlcnZpY2VOYW1lOiBzZXJ2aWNlLm5hbWUsXG4gICAgICAgIHN0YXR1cyxcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgaWYgKCFzdGF0dXMuaW5ncmVzc2VzKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IoYFNlcnZpY2UgJHtzZXJ2aWNlLm5hbWV9IGhhcyBubyBhY3RpdmUgaW5ncmVzc2VzYCwge1xuICAgICAgICBzZXJ2aWNlTmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgICBzZXJ2aWNlU3RhdHVzOiBzdGF0dXMsXG4gICAgICB9KVxuICAgIH1cblxuICAgIC8vIGZpbmQgdGhlIGNvcnJlY3QgZW5kcG9pbnQgdG8gY2FsbFxuICAgIGxldCBtYXRjaGVkSW5ncmVzczogU2VydmljZUluZ3Jlc3MgfCBudWxsID0gbnVsbFxuICAgIGxldCBtYXRjaGVkUGF0aFxuXG4gICAgLy8gd2UgY2FuJ3QgZWFzaWx5IHN1cHBvcnQgcmF3IFRDUCBvciBVRFAgaW4gYSBjb21tYW5kIGxpa2UgdGhpc1xuICAgIGNvbnN0IGluZ3Jlc3NlcyA9IHN0YXR1cy5pbmdyZXNzZXMuZmlsdGVyKGUgPT4gZS5wcm90b2NvbCA9PT0gXCJodHRwXCIgfHwgZS5wcm90b2NvbCA9PT0gXCJodHRwc1wiKVxuXG4gICAgaWYgKCFwYXRoKSB7XG4gICAgICAvLyBpZiBubyBwYXRoIGlzIHNwZWNpZmllZCBhbmQgdGhlcmUncyBhIHJvb3QgZW5kcG9pbnQgKHBhdGggPT09IFwiL1wiKSB3ZSB1c2UgdGhhdFxuICAgICAgY29uc3Qgcm9vdEluZ3Jlc3MgPSA8U2VydmljZUluZ3Jlc3M+ZmluZChpbmdyZXNzZXMsIGUgPT4gZS5wYXRoID09PSBcIi9cIilcblxuICAgICAgaWYgKHJvb3RJbmdyZXNzKSB7XG4gICAgICAgIG1hdGNoZWRJbmdyZXNzID0gcm9vdEluZ3Jlc3NcbiAgICAgICAgbWF0Y2hlZFBhdGggPSBcIi9cIlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gaWYgdGhlcmUncyBubyByb290IGVuZHBvaW50LCBwaWNrIHRoZSBmaXJzdCBlbmRwb2ludFxuICAgICAgICBtYXRjaGVkSW5ncmVzcyA9IGluZ3Jlc3Nlc1swXVxuICAgICAgICBtYXRjaGVkUGF0aCA9IGluZ3Jlc3Nlc1swXS5wYXRoXG4gICAgICB9XG5cbiAgICAgIHBhdGggPSBtYXRjaGVkUGF0aFxuXG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGggPSBcIi9cIiArIHBhdGhcblxuICAgICAgZm9yIChjb25zdCBpbmdyZXNzIG9mIHN0YXR1cy5pbmdyZXNzZXMpIHtcbiAgICAgICAgaWYgKGluZ3Jlc3MucGF0aCkge1xuICAgICAgICAgIGlmIChwYXRoLnN0YXJ0c1dpdGgoaW5ncmVzcy5wYXRoKSAmJiAoIW1hdGNoZWRQYXRoIHx8IGluZ3Jlc3MucGF0aC5sZW5ndGggPiBtYXRjaGVkUGF0aC5sZW5ndGgpKSB7XG4gICAgICAgICAgICBtYXRjaGVkSW5ncmVzcyA9IGluZ3Jlc3NcbiAgICAgICAgICAgIG1hdGNoZWRQYXRoID0gaW5ncmVzcy5wYXRoXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCFtYXRjaGVkUGF0aCkge1xuICAgICAgICAgIG1hdGNoZWRJbmdyZXNzID0gaW5ncmVzc1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFtYXRjaGVkSW5ncmVzcykge1xuICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBTZXJ2aWNlICR7c2VydmljZS5uYW1lfSBkb2VzIG5vdCBoYXZlIGFuIEhUVFAvSFRUUFMgaW5ncmVzcyBhdCAke3BhdGh9YCwge1xuICAgICAgICBzZXJ2aWNlTmFtZTogc2VydmljZS5uYW1lLFxuICAgICAgICBwYXRoLFxuICAgICAgICBhdmFpbGFibGVJbmdyZXNzZXM6IHN0YXR1cy5pbmdyZXNzZXMsXG4gICAgICB9KVxuICAgIH1cblxuICAgIGNvbnN0IHVybCA9IHJlc29sdmUoZ2V0SW5ncmVzc1VybChtYXRjaGVkSW5ncmVzcyksIHBhdGggfHwgbWF0Y2hlZFBhdGgpXG4gICAgLy8gVE9ETzogc3VwcG9ydCBQT1NUIHJlcXVlc3RzIHdpdGggcmVxdWVzdCBib2R5XG4gICAgY29uc3QgbWV0aG9kID0gXCJnZXRcIlxuXG4gICAgY29uc3QgZW50cnkgPSBnYXJkZW4ubG9nLmluZm8oe1xuICAgICAgbXNnOiBjaGFsay5jeWFuKGBTZW5kaW5nICR7bWF0Y2hlZEluZ3Jlc3MucHJvdG9jb2wudG9VcHBlckNhc2UoKX0gR0VUIHJlcXVlc3QgdG8gYCkgKyB1cmwgKyBcIlxcblwiLFxuICAgICAgc3RhdHVzOiBcImFjdGl2ZVwiLFxuICAgIH0pXG5cbiAgICAvLyB0aGlzIGlzIHRvIGFjY2VwdCBzZWxmLXNpZ25lZCBjZXJ0c1xuICAgIHByb2Nlc3MuZW52Lk5PREVfVExTX1JFSkVDVF9VTkFVVEhPUklaRUQgPSBcIjBcIlxuXG4gICAgY29uc3QgcmVxID0gQXhpb3Moe1xuICAgICAgbWV0aG9kLFxuICAgICAgdXJsLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBob3N0OiBtYXRjaGVkSW5ncmVzcy5ob3N0bmFtZSxcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIC8vIFRPRE86IGFkZCB2ZXJib3NlIGFuZCBkZWJ1ZyBsb2dnaW5nIChyZXF1ZXN0L3Jlc3BvbnNlIGhlYWRlcnMgZXRjLilcbiAgICBsZXQgcmVzXG5cbiAgICB0cnkge1xuICAgICAgcmVzID0gYXdhaXQgcmVxXG4gICAgICBlbnRyeS5zZXRTdWNjZXNzKClcbiAgICAgIGdhcmRlbi5sb2cuaW5mbyhjaGFsay5ncmVlbihgJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0fVxcbmApKVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmVzID0gZXJyLnJlc3BvbnNlXG4gICAgICBlbnRyeS5zZXRFcnJvcigpXG4gICAgICBjb25zdCBlcnJvciA9IHJlcyA/IGAke3Jlcy5zdGF0dXN9ICR7cmVzLnN0YXR1c1RleHR9YCA6IGVyci5tZXNzYWdlXG4gICAgICBnYXJkZW4ubG9nLmluZm8oY2hhbGsucmVkKGVycm9yICsgXCJcXG5cIikpXG4gICAgICByZXR1cm4ge31cbiAgICB9XG5cbiAgICBjb25zdCByZXNTdHIgPSBpc09iamVjdChyZXMuZGF0YSkgPyBKU09OLnN0cmluZ2lmeShyZXMuZGF0YSwgbnVsbCwgMikgOiByZXMuZGF0YVxuXG4gICAgcmVzLmRhdGEgJiYgZ2FyZGVuLmxvZy5pbmZvKGNoYWxrLndoaXRlKHJlc1N0cikgKyBcIlxcblwiKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3VsdDoge1xuICAgICAgICBzZXJ2aWNlTmFtZSxcbiAgICAgICAgcGF0aCxcbiAgICAgICAgdXJsLFxuICAgICAgICByZXNwb25zZTogcGljayhyZXMsIFtcInN0YXR1c1wiLCBcInN0YXR1c1RleHRcIiwgXCJoZWFkZXJzXCIsIFwiZGF0YVwiXSksXG4gICAgICB9LFxuICAgIH1cbiAgfVxufVxuIl19
