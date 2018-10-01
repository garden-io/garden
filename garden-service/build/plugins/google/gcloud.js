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
const child_process_1 = require("child_process");
const lodash_1 = require("lodash");
const util_1 = require("../../util/util");
const DEFAULT_TIMEOUT = 600;
// TODO: re-use code across this and Kubectl
class GCloud {
    constructor({ account, project }) {
        this.account = account;
        this.project = project;
    }
    call(args, { data, ignoreError = false, silent = true, timeout = DEFAULT_TIMEOUT, cwd } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const out = {
                code: 0,
                output: "",
                stdout: "",
                stderr: "",
            };
            const proc = child_process_1.spawn("gcloud", this.prepareArgs(args), { cwd });
            proc.stdout.on("data", (s) => {
                if (!silent) {
                    process.stdout.write(s);
                }
                out.output += s;
                out.stdout += s;
            });
            proc.stderr.on("data", (s) => {
                if (!silent) {
                    process.stderr.write(s);
                }
                out.output += s;
                out.stderr += s;
            });
            if (data) {
                proc.stdin.end(data);
            }
            return new Promise((resolve, reject) => {
                let _timeout;
                const _reject = (msg) => {
                    const err = new Error(msg);
                    lodash_1.extend(err, out);
                    reject(err);
                };
                if (timeout > 0) {
                    _timeout = setTimeout(() => {
                        proc.kill("SIGKILL");
                        _reject(`gcloud timed out after ${timeout} seconds.`);
                    }, timeout * 1000);
                }
                proc.on("close", (code) => {
                    _timeout && clearTimeout(_timeout);
                    out.code = code;
                    if (code === 0 || ignoreError) {
                        resolve(out);
                    }
                    else {
                        _reject("Process exited with code " + code);
                    }
                });
            });
        });
    }
    json(args, opts = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!args.includes("--format=json")) {
                args.push("--format=json");
            }
            const result = yield this.call(args, opts);
            return JSON.parse(result.output);
        });
    }
    tty(args, { silent = true, cwd } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            return util_1.spawnPty("gcloud", this.prepareArgs(args), { silent, cwd, tty: true });
        });
    }
    prepareArgs(args) {
        const ops = [];
        if (this.account) {
            ops.push(`--account=${this.account}`);
        }
        if (this.project) {
            ops.push(`--project=${this.project}`);
        }
        return ops.concat(args);
    }
}
exports.GCloud = GCloud;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvZ29vZ2xlL2djbG91ZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsaURBQXFDO0FBQ3JDLG1DQUErQjtBQUMvQiwwQ0FBMEM7QUFpQjFDLE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQTtBQUUzQiw0Q0FBNEM7QUFDNUMsTUFBYSxNQUFNO0lBSWpCLFlBQVksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUEwQztRQUN0RSxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQTtRQUN0QixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQTtJQUN4QixDQUFDO0lBRUssSUFBSSxDQUNSLElBQWMsRUFDZCxFQUFFLElBQUksRUFBRSxXQUFXLEdBQUcsS0FBSyxFQUFFLE1BQU0sR0FBRyxJQUFJLEVBQUUsT0FBTyxHQUFHLGVBQWUsRUFBRSxHQUFHLEtBQW1CLEVBQUU7O1lBRy9GLE1BQU0sR0FBRyxHQUFpQjtnQkFDeEIsSUFBSSxFQUFFLENBQUM7Z0JBQ1AsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsTUFBTSxFQUFFLEVBQUU7YUFDWCxDQUFBO1lBRUQsTUFBTSxJQUFJLEdBQUcscUJBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUE7WUFFN0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUU7Z0JBQzNCLElBQUksQ0FBQyxNQUFNLEVBQUU7b0JBQ1gsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUE7aUJBQ3hCO2dCQUNELEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFBO2dCQUNmLEdBQUcsQ0FBQyxNQUFPLElBQUksQ0FBQyxDQUFBO1lBQ2xCLENBQUMsQ0FBQyxDQUFBO1lB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QUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFBO1NBQ3RDO1FBRUQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQ3pCLENBQUM7Q0FDRjtBQW5HRCx3QkFtR0MiLCJmaWxlIjoicGx1Z2lucy9nb29nbGUvZ2Nsb3VkLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IHNwYXduIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIlxuaW1wb3J0IHsgZXh0ZW5kIH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyBzcGF3blB0eSB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuXG5leHBvcnQgaW50ZXJmYWNlIEdDbG91ZFBhcmFtcyB7XG4gIGRhdGE/OiBCdWZmZXIsXG4gIGlnbm9yZUVycm9yPzogYm9vbGVhbixcbiAgc2lsZW50PzogYm9vbGVhbixcbiAgdGltZW91dD86IG51bWJlcixcbiAgY3dkPzogc3RyaW5nLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdDbG91ZE91dHB1dCB7XG4gIGNvZGU6IG51bWJlcixcbiAgb3V0cHV0OiBzdHJpbmcsXG4gIHN0ZG91dD86IHN0cmluZyxcbiAgc3RkZXJyPzogc3RyaW5nLFxufVxuXG5jb25zdCBERUZBVUxUX1RJTUVPVVQgPSA2MDBcblxuLy8gVE9ETzogcmUtdXNlIGNvZGUgYWNyb3NzIHRoaXMgYW5kIEt1YmVjdGxcbmV4cG9ydCBjbGFzcyBHQ2xvdWQge1xuICBwdWJsaWMgYWNjb3VudD86IHN0cmluZ1xuICBwdWJsaWMgcHJvamVjdD86IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKHsgYWNjb3VudCwgcHJvamVjdCB9OiB7IGFjY291bnQ/OiBzdHJpbmcsIHByb2plY3Q/OiBzdHJpbmcgfSkge1xuICAgIHRoaXMuYWNjb3VudCA9IGFjY291bnRcbiAgICB0aGlzLnByb2plY3QgPSBwcm9qZWN0XG4gIH1cblxuICBhc3luYyBjYWxsKFxuICAgIGFyZ3M6IHN0cmluZ1tdLFxuICAgIHsgZGF0YSwgaWdub3JlRXJyb3IgPSBmYWxzZSwgc2lsZW50ID0gdHJ1ZSwgdGltZW91dCA9IERFRkFVTFRfVElNRU9VVCwgY3dkIH06IEdDbG91ZFBhcmFtcyA9IHt9LFxuICApOiBQcm9taXNlPEdDbG91ZE91dHB1dD4ge1xuXG4gICAgY29uc3Qgb3V0OiBHQ2xvdWRPdXRwdXQgPSB7XG4gICAgICBjb2RlOiAwLFxuICAgICAgb3V0cHV0OiBcIlwiLFxuICAgICAgc3Rkb3V0OiBcIlwiLFxuICAgICAgc3RkZXJyOiBcIlwiLFxuICAgIH1cblxuICAgIGNvbnN0IHByb2MgPSBzcGF3bihcImdjbG91ZFwiLCB0aGlzLnByZXBhcmVBcmdzKGFyZ3MpLCB7IGN3ZCB9KVxuXG4gICAgcHJvYy5zdGRvdXQub24oXCJkYXRhXCIsIChzKSA9PiB7XG4gICAgICBpZiAoIXNpbGVudCkge1xuICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShzKVxuICAgICAgfVxuICAgICAgb3V0Lm91dHB1dCArPSBzXG4gICAgICBvdXQuc3Rkb3V0ISArPSBzXG4gICAgfSlcblxuICAgIHByb2Muc3RkZXJyLm9uKFwiZGF0YVwiLCAocykgPT4ge1xuICAgICAgaWYgKCFzaWxlbnQpIHtcbiAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUocylcbiAgICAgIH1cbiAgICAgIG91dC5vdXRwdXQgKz0gc1xuICAgICAgb3V0LnN0ZGVyciEgKz0gc1xuICAgIH0pXG5cbiAgICBpZiAoZGF0YSkge1xuICAgICAgcHJvYy5zdGRpbi5lbmQoZGF0YSlcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2U8R0Nsb3VkT3V0cHV0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsZXQgX3RpbWVvdXRcblxuICAgICAgY29uc3QgX3JlamVjdCA9IChtc2c6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBlcnIgPSBuZXcgRXJyb3IobXNnKVxuICAgICAgICBleHRlbmQoZXJyLCA8YW55Pm91dClcbiAgICAgICAgcmVqZWN0KGVycilcbiAgICAgIH1cblxuICAgICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICAgIF90aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgcHJvYy5raWxsKFwiU0lHS0lMTFwiKVxuICAgICAgICAgIF9yZWplY3QoYGdjbG91ZCB0aW1lZCBvdXQgYWZ0ZXIgJHt0aW1lb3V0fSBzZWNvbmRzLmApXG4gICAgICAgIH0sIHRpbWVvdXQgKiAxMDAwKVxuICAgICAgfVxuXG4gICAgICBwcm9jLm9uKFwiY2xvc2VcIiwgKGNvZGUpID0+IHtcbiAgICAgICAgX3RpbWVvdXQgJiYgY2xlYXJUaW1lb3V0KF90aW1lb3V0KVxuICAgICAgICBvdXQuY29kZSA9IGNvZGVcblxuICAgICAgICBpZiAoY29kZSA9PT0gMCB8fCBpZ25vcmVFcnJvcikge1xuICAgICAgICAgIHJlc29sdmUob3V0KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIF9yZWplY3QoXCJQcm9jZXNzIGV4aXRlZCB3aXRoIGNvZGUgXCIgKyBjb2RlKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBhc3luYyBqc29uKGFyZ3M6IHN0cmluZ1tdLCBvcHRzOiBHQ2xvdWRQYXJhbXMgPSB7fSk6IFByb21pc2U8YW55PiB7XG4gICAgaWYgKCFhcmdzLmluY2x1ZGVzKFwiLS1mb3JtYXQ9anNvblwiKSkge1xuICAgICAgYXJncy5wdXNoKFwiLS1mb3JtYXQ9anNvblwiKVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2FsbChhcmdzLCBvcHRzKVxuXG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0Lm91dHB1dClcbiAgfVxuXG4gIGFzeW5jIHR0eShhcmdzOiBzdHJpbmdbXSwgeyBzaWxlbnQgPSB0cnVlLCBjd2QgfTogeyBzaWxlbnQ/OiBib29sZWFuLCBjd2Q/OiBzdHJpbmcgfSA9IHt9KTogUHJvbWlzZTxHQ2xvdWRPdXRwdXQ+IHtcbiAgICByZXR1cm4gc3Bhd25QdHkoXCJnY2xvdWRcIiwgdGhpcy5wcmVwYXJlQXJncyhhcmdzKSwgeyBzaWxlbnQsIGN3ZCwgdHR5OiB0cnVlIH0pXG4gIH1cblxuICBwcml2YXRlIHByZXBhcmVBcmdzKGFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgY29uc3Qgb3BzOiBzdHJpbmdbXSA9IFtdXG5cbiAgICBpZiAodGhpcy5hY2NvdW50KSB7XG4gICAgICBvcHMucHVzaChgLS1hY2NvdW50PSR7dGhpcy5hY2NvdW50fWApXG4gICAgfVxuXG4gICAgaWYgKHRoaXMucHJvamVjdCkge1xuICAgICAgb3BzLnB1c2goYC0tcHJvamVjdD0ke3RoaXMucHJvamVjdH1gKVxuICAgIH1cblxuICAgIHJldHVybiBvcHMuY29uY2F0KGFyZ3MpXG4gIH1cbn1cbiJdfQ==
