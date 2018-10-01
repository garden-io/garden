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
const chalk_1 = require("chalk");
const child_process_1 = require("child_process");
const lodash_1 = require("lodash");
const util_1 = require("../../util/util");
const exceptions_1 = require("../../exceptions");
const logger_1 = require("../../logger/logger");
const os_1 = require("os");
const hasAnsi = require("has-ansi");
exports.KUBECTL_DEFAULT_TIMEOUT = 300;
class Kubectl {
    // TODO: namespace should always be required
    constructor({ context, namespace, configPath }) {
        this.context = context;
        this.namespace = namespace;
        this.configPath = configPath;
    }
    call(args, { data, ignoreError = false, silent = true, timeout = exports.KUBECTL_DEFAULT_TIMEOUT } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            // TODO: use the spawn helper from index.ts
            const logger = logger_1.getLogger();
            const out = {
                code: 0,
                output: "",
                stdout: "",
                stderr: "",
            };
            const preparedArgs = this.prepareArgs(args);
            const proc = child_process_1.spawn(this.getExececutable(), preparedArgs);
            proc.stdout.on("data", (s) => {
                if (!silent) {
                    const str = s.toString();
                    logger.info(hasAnsi(str) ? str : chalk_1.default.white(str));
                }
                out.output += s;
                out.stdout += s;
            });
            proc.stderr.on("data", (s) => {
                if (!silent) {
                    const str = s.toString();
                    logger.info(hasAnsi(str) ? str : chalk_1.default.white(str));
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
                    const dataStr = data ? data.toString() : null;
                    const details = lodash_1.extend({ args, preparedArgs, msg, data: dataStr }, out);
                    const err = new exceptions_1.RuntimeError(`Failed running 'kubectl ${preparedArgs.join(" ")}': ${out.output}`, details);
                    reject(err);
                };
                if (timeout > 0) {
                    _timeout = setTimeout(() => {
                        proc.kill("SIGKILL");
                        _reject(`kubectl timed out after ${timeout} seconds.`);
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
            if (!args.includes("--output=json")) {
                args.push("--output=json");
            }
            const result = yield this.call(args, opts);
            return JSON.parse(result.output);
        });
    }
    tty(args, opts = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            return util_1.spawnPty(this.getExececutable(), this.prepareArgs(args), opts);
        });
    }
    spawn(args) {
        return child_process_1.spawn(this.getExececutable(), this.prepareArgs(args));
    }
    getExececutable() {
        // workaround for https://github.com/Microsoft/node-pty/issues/109
        return os_1.platform() === "win32" ? "kubectl.exe" : "kubectl";
    }
    prepareArgs(args) {
        const ops = [];
        if (this.namespace) {
            ops.push(`--namespace=${this.namespace}`);
        }
        if (this.context) {
            ops.push(`--context=${this.context}`);
        }
        if (this.configPath) {
            ops.push(`--kubeconfig=${this.configPath}`);
        }
        return ops.concat(args);
    }
}
exports.Kubectl = Kubectl;
function kubectl(context, namespace) {
    return new Kubectl({ context, namespace });
}
exports.kubectl = kubectl;
function apply(context, obj, params) {
    return __awaiter(this, void 0, void 0, function* () {
        return applyMany(context, [obj], params);
    });
}
exports.apply = apply;
function applyMany(context, objects, { dryRun = false, force = false, namespace, pruneSelector } = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = Buffer.from(util_1.encodeYamlMulti(objects));
        let args = ["apply"];
        dryRun && args.push("--dry-run");
        force && args.push("--force");
        pruneSelector && args.push("--prune", "--selector", pruneSelector);
        args.push("--output=json", "-f", "-");
        const result = yield kubectl(context, namespace).call(args, { data });
        try {
            return JSON.parse(result.output);
        }
        catch (_) {
            return result.output;
        }
    });
}
exports.applyMany = applyMany;
function deleteObjectsByLabel({ context, namespace, labelKey, labelValue, objectTypes, includeUninitialized = false, }) {
    return __awaiter(this, void 0, void 0, function* () {
        let args = [
            "delete",
            objectTypes.join(","),
            "-l",
            `${labelKey}=${labelValue}`,
        ];
        includeUninitialized && args.push("--include-uninitialized");
        const result = yield kubectl(context, namespace).call(args);
        try {
            return JSON.parse(result.output);
        }
        catch (_) {
            return result.output;
        }
    });
}
exports.deleteObjectsByLabel = deleteObjectsByLabel;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9rdWJlY3RsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FBeUI7QUFDekIsaURBQW1EO0FBQ25ELG1DQUErQjtBQUMvQiwwQ0FBMkQ7QUFDM0QsaURBQStDO0FBQy9DLGdEQUErQztBQUMvQywyQkFBNkI7QUFDN0Isb0NBQW9DO0FBd0J2QixRQUFBLHVCQUF1QixHQUFHLEdBQUcsQ0FBQTtBQUUxQyxNQUFhLE9BQU87SUFLbEIsNENBQTRDO0lBQzVDLFlBQVksRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBZ0U7UUFDMUcsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7UUFDdEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUE7UUFDMUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUE7SUFDOUIsQ0FBQztJQUVLLElBQUksQ0FDUixJQUFjLEVBQ2QsRUFBRSxJQUFJLEVBQUUsV0FBVyxHQUFHLEtBQUssRUFBRSxNQUFNLEdBQUcsSUFBSSxFQUFFLE9BQU8sR0FBRywrQkFBdUIsS0FBb0IsRUFBRTs7WUFFbkcsMkNBQTJDO1lBQzNDLE1BQU0sTUFBTSxHQUFHLGtCQUFTLEVBQUUsQ0FBQTtZQUMxQixNQUFNLEdBQUcsR0FBa0I7Z0JBQ3pCLElBQUksRUFBRSxDQUFDO2dCQUNQLE1BQU0sRUFBRSxFQUFFO2dCQUNWLE1BQU0sRUFBRSxFQUFFO2dCQUNWLE1BQU0sRUFBRSxFQUFFO2FBQ1gsQ0FBQTtZQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDM0MsTUFBTSxJQUFJLEdBQUcscUJBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFeEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFF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QyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBRXJFLElBQUk7WUFDRixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1NBQ2pDO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUE7U0FDckI7SUFDSCxDQUFDO0NBQUE7QUFuQkQsOEJBbUJDO0FBV0QsU0FBc0Isb0JBQW9CLENBQ3hDLEVBQ0UsT0FBTyxFQUNQLFNBQVMsRUFDVCxRQUFRLEVBQ1IsVUFBVSxFQUNWLFdBQVcsRUFDWCxvQkFBb0IsR0FBRyxLQUFLLEdBQ1I7O1FBRXRCLElBQUksSUFBSSxHQUFHO1lBQ1QsUUFBUTtZQUNSLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ3JCLElBQUk7WUFDSixHQUFHLFFBQVEsSUFBSSxVQUFVLEVBQUU7U0FDNUIsQ0FBQTtRQUVELG9CQUFvQixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQTtRQUU1RCxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRTNELElBQUk7WUFDRixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1NBQ2pDO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUE7U0FDckI7SUFDSCxDQUFDO0NBQUE7QUExQkQsb0RBMEJDIiwiZmlsZSI6InBsdWdpbnMva3ViZXJuZXRlcy9rdWJlY3RsLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBzcGF3biB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCJcbmltcG9ydCB7IGV4dGVuZCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgZW5jb2RlWWFtbE11bHRpLCBzcGF3blB0eSB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgUnVudGltZUVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgZ2V0TG9nZ2VyIH0gZnJvbSBcIi4uLy4uL2xvZ2dlci9sb2dnZXJcIlxuaW1wb3J0IHsgcGxhdGZvcm0gfSBmcm9tIFwib3NcIlxuaW1wb3J0IGhhc0Fuc2kgPSByZXF1aXJlKFwiaGFzLWFuc2lcIilcblxuZXhwb3J0IGludGVyZmFjZSBLdWJlY3RsUGFyYW1zIHtcbiAgZGF0YT86IEJ1ZmZlcixcbiAgaWdub3JlRXJyb3I/OiBib29sZWFuLFxuICBzaWxlbnQ/OiBib29sZWFuLFxuICB0aW1lb3V0PzogbnVtYmVyLFxuICB0dHk/OiBib29sZWFuLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEt1YmVjdGxPdXRwdXQge1xuICBjb2RlOiBudW1iZXIsXG4gIG91dHB1dDogc3RyaW5nLFxuICBzdGRvdXQ/OiBzdHJpbmcsXG4gIHN0ZGVycj86IHN0cmluZyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBseU9wdGlvbnMge1xuICBkcnlSdW4/OiBib29sZWFuLFxuICBmb3JjZT86IGJvb2xlYW4sXG4gIHBydW5lU2VsZWN0b3I/OiBzdHJpbmcsXG4gIG5hbWVzcGFjZT86IHN0cmluZyxcbn1cblxuZXhwb3J0IGNvbnN0IEtVQkVDVExfREVGQVVMVF9USU1FT1VUID0gMzAwXG5cbmV4cG9ydCBjbGFzcyBLdWJlY3RsIHtcbiAgcHVibGljIGNvbnRleHQ/OiBzdHJpbmdcbiAgcHVibGljIG5hbWVzcGFjZT86IHN0cmluZ1xuICBwdWJsaWMgY29uZmlnUGF0aD86IHN0cmluZ1xuXG4gIC8vIFRPRE86IG5hbWVzcGFjZSBzaG91bGQgYWx3YXlzIGJlIHJlcXVpcmVkXG4gIGNvbnN0cnVjdG9yKHsgY29udGV4dCwgbmFtZXNwYWNlLCBjb25maWdQYXRoIH06IHsgY29udGV4dDogc3RyaW5nLCBuYW1lc3BhY2U/OiBzdHJpbmcsIGNvbmZpZ1BhdGg/OiBzdHJpbmcgfSkge1xuICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHRcbiAgICB0aGlzLm5hbWVzcGFjZSA9IG5hbWVzcGFjZVxuICAgIHRoaXMuY29uZmlnUGF0aCA9IGNvbmZpZ1BhdGhcbiAgfVxuXG4gIGFzeW5jIGNhbGwoXG4gICAgYXJnczogc3RyaW5nW10sXG4gICAgeyBkYXRhLCBpZ25vcmVFcnJvciA9IGZhbHNlLCBzaWxlbnQgPSB0cnVlLCB0aW1lb3V0ID0gS1VCRUNUTF9ERUZBVUxUX1RJTUVPVVQgfTogS3ViZWN0bFBhcmFtcyA9IHt9LFxuICApOiBQcm9taXNlPEt1YmVjdGxPdXRwdXQ+IHtcbiAgICAvLyBUT0RPOiB1c2UgdGhlIHNwYXduIGhlbHBlciBmcm9tIGluZGV4LnRzXG4gICAgY29uc3QgbG9nZ2VyID0gZ2V0TG9nZ2VyKClcbiAgICBjb25zdCBvdXQ6IEt1YmVjdGxPdXRwdXQgPSB7XG4gICAgICBjb2RlOiAwLFxuICAgICAgb3V0cHV0OiBcIlwiLFxuICAgICAgc3Rkb3V0OiBcIlwiLFxuICAgICAgc3RkZXJyOiBcIlwiLFxuICAgIH1cblxuICAgIGNvbnN0IHByZXBhcmVkQXJncyA9IHRoaXMucHJlcGFyZUFyZ3MoYXJncylcbiAgICBjb25zdCBwcm9jID0gc3Bhd24odGhpcy5nZXRFeGVjZWN1dGFibGUoKSwgcHJlcGFyZWRBcmdzKVxuXG4gICAgcHJvYy5zdGRvdXQub24oXCJkYXRhXCIsIChzKSA9PiB7XG4gICAgICBpZiAoIXNpbGVudCkge1xuICAgICAgICBjb25zdCBzdHIgPSBzLnRvU3RyaW5nKClcbiAgICAgICAgbG9nZ2VyLmluZm8oaGFzQW5zaShzdHIpID8gc3RyIDogY2hhbGsud2hpdGUoc3RyKSlcbiAgICAgIH1cbiAgICAgIG91dC5vdXRwdXQgKz0gc1xuICAgICAgb3V0LnN0ZG91dCEgKz0gc1xuICAgIH0pXG5cbiAgICBwcm9jLnN0ZGVyci5vbihcImRhdGFcIiwgKHMpID0+IHtcbiAgICAgIGlmICghc2lsZW50KSB7XG4gICAgICAgIGNvbnN0IHN0ciA9IHMudG9TdHJpbmcoKVxuICAgICAgICBsb2dnZXIuaW5mbyhoYXNBbnNpKHN0cikgPyBzdHIgOiBjaGFsay53aGl0ZShzdHIpKVxuICAgICAgfVxuICAgICAgb3V0Lm91dHB1dCArPSBzXG4gICAgICBvdXQuc3RkZXJyISArPSBzXG4gICAgfSlcblxuICAgIGlmIChkYXRhKSB7XG4gICAgICBwcm9jLnN0ZGluLmVuZChkYXRhKVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgUHJvbWlzZTxLdWJlY3RsT3V0cHV0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBsZXQgX3RpbWVvdXRcblxuICAgICAgY29uc3QgX3JlamVjdCA9IChtc2c6IHN0cmluZykgPT4ge1xuICAgICAgICBjb25zdCBkYXRhU3RyID0gZGF0YSA/IGRhdGEudG9TdHJpbmcoKSA6IG51bGxcbiAgICAgICAgY29uc3QgZGV0YWlscyA9IGV4dGVuZCh7IGFyZ3MsIHByZXBhcmVkQXJncywgbXNnLCBkYXRhOiBkYXRhU3RyIH0sIDxhbnk+b3V0KVxuXG4gICAgICAgIGNvbnN0IGVyciA9IG5ldyBSdW50aW1lRXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCBydW5uaW5nICdrdWJlY3RsICR7cHJlcGFyZWRBcmdzLmpvaW4oXCIgXCIpfSc6ICR7b3V0Lm91dHB1dH1gLFxuICAgICAgICAgIGRldGFpbHMsXG4gICAgICAgIClcbiAgICAgICAgcmVqZWN0KGVycilcbiAgICAgIH1cblxuICAgICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICAgIF90aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgcHJvYy5raWxsKFwiU0lHS0lMTFwiKVxuICAgICAgICAgIF9yZWplY3QoYGt1YmVjdGwgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dH0gc2Vjb25kcy5gKVxuICAgICAgICB9LCB0aW1lb3V0ICogMTAwMClcbiAgICAgIH1cblxuICAgICAgcHJvYy5vbihcImNsb3NlXCIsIChjb2RlKSA9PiB7XG4gICAgICAgIF90aW1lb3V0ICYmIGNsZWFyVGltZW91dChfdGltZW91dClcbiAgICAgICAgb3V0LmNvZGUgPSBjb2RlXG5cbiAgICAgICAgaWYgKGNvZGUgPT09IDAgfHwgaWdub3JlRXJyb3IpIHtcbiAgICAgICAgICByZXNvbHZlKG91dClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBfcmVqZWN0KFwiUHJvY2VzcyBleGl0ZWQgd2l0aCBjb2RlIFwiICsgY29kZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgYXN5bmMganNvbihhcmdzOiBzdHJpbmdbXSwgb3B0czogS3ViZWN0bFBhcmFtcyA9IHt9KTogUHJvbWlzZTxLdWJlY3RsT3V0cHV0PiB7XG4gICAgaWYgKCFhcmdzLmluY2x1ZGVzKFwiLS1vdXRwdXQ9anNvblwiKSkge1xuICAgICAgYXJncy5wdXNoKFwiLS1vdXRwdXQ9anNvblwiKVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2FsbChhcmdzLCBvcHRzKVxuXG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0Lm91dHB1dClcbiAgfVxuXG4gIGFzeW5jIHR0eShhcmdzOiBzdHJpbmdbXSwgb3B0czogS3ViZWN0bFBhcmFtcyA9IHt9KTogUHJvbWlzZTxLdWJlY3RsT3V0cHV0PiB7XG4gICAgcmV0dXJuIHNwYXduUHR5KHRoaXMuZ2V0RXhlY2VjdXRhYmxlKCksIHRoaXMucHJlcGFyZUFyZ3MoYXJncyksIG9wdHMpXG4gIH1cblxuICBzcGF3bihhcmdzOiBzdHJpbmdbXSk6IENoaWxkUHJvY2VzcyB7XG4gICAgcmV0dXJuIHNwYXduKHRoaXMuZ2V0RXhlY2VjdXRhYmxlKCksIHRoaXMucHJlcGFyZUFyZ3MoYXJncykpXG4gIH1cblxuICBwcml2YXRlIGdldEV4ZWNlY3V0YWJsZSgpIHtcbiAgICAvLyB3b3JrYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L25vZGUtcHR5L2lzc3Vlcy8xMDlcbiAgICByZXR1cm4gcGxhdGZvcm0oKSA9PT0gXCJ3aW4zMlwiID8gXCJrdWJlY3RsLmV4ZVwiIDogXCJrdWJlY3RsXCJcbiAgfVxuXG4gIHByaXZhdGUgcHJlcGFyZUFyZ3MoYXJnczogc3RyaW5nW10pIHtcbiAgICBjb25zdCBvcHM6IHN0cmluZ1tdID0gW11cblxuICAgIGlmICh0aGlzLm5hbWVzcGFjZSkge1xuICAgICAgb3BzLnB1c2goYC0tbmFtZXNwYWNlPSR7dGhpcy5uYW1lc3BhY2V9YClcbiAgICB9XG5cbiAgICBpZiAodGhpcy5jb250ZXh0KSB7XG4gICAgICBvcHMucHVzaChgLS1jb250ZXh0PSR7dGhpcy5jb250ZXh0fWApXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY29uZmlnUGF0aCkge1xuICAgICAgb3BzLnB1c2goYC0ta3ViZWNvbmZpZz0ke3RoaXMuY29uZmlnUGF0aH1gKVxuICAgIH1cblxuICAgIHJldHVybiBvcHMuY29uY2F0KGFyZ3MpXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGt1YmVjdGwoY29udGV4dDogc3RyaW5nLCBuYW1lc3BhY2U/OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBLdWJlY3RsKHsgY29udGV4dCwgbmFtZXNwYWNlIH0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseShjb250ZXh0OiBzdHJpbmcsIG9iajogb2JqZWN0LCBwYXJhbXM6IEFwcGx5T3B0aW9ucykge1xuICByZXR1cm4gYXBwbHlNYW55KGNvbnRleHQsIFtvYmpdLCBwYXJhbXMpXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseU1hbnkoXG4gIGNvbnRleHQ6IHN0cmluZywgb2JqZWN0czogb2JqZWN0W10sXG4gIHsgZHJ5UnVuID0gZmFsc2UsIGZvcmNlID0gZmFsc2UsIG5hbWVzcGFjZSwgcHJ1bmVTZWxlY3RvciB9OiBBcHBseU9wdGlvbnMgPSB7fSxcbikge1xuICBjb25zdCBkYXRhID0gQnVmZmVyLmZyb20oZW5jb2RlWWFtbE11bHRpKG9iamVjdHMpKVxuXG4gIGxldCBhcmdzID0gW1wiYXBwbHlcIl1cbiAgZHJ5UnVuICYmIGFyZ3MucHVzaChcIi0tZHJ5LXJ1blwiKVxuICBmb3JjZSAmJiBhcmdzLnB1c2goXCItLWZvcmNlXCIpXG4gIHBydW5lU2VsZWN0b3IgJiYgYXJncy5wdXNoKFwiLS1wcnVuZVwiLCBcIi0tc2VsZWN0b3JcIiwgcHJ1bmVTZWxlY3RvcilcbiAgYXJncy5wdXNoKFwiLS1vdXRwdXQ9anNvblwiLCBcIi1mXCIsIFwiLVwiKVxuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGt1YmVjdGwoY29udGV4dCwgbmFtZXNwYWNlKS5jYWxsKGFyZ3MsIHsgZGF0YSB9KVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0Lm91dHB1dClcbiAgfSBjYXRjaCAoXykge1xuICAgIHJldHVybiByZXN1bHQub3V0cHV0XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEZWxldGVPYmplY3RzUGFyYW1zIHtcbiAgY29udGV4dDogc3RyaW5nLFxuICBuYW1lc3BhY2U6IHN0cmluZyxcbiAgbGFiZWxLZXk6IHN0cmluZyxcbiAgbGFiZWxWYWx1ZTogc3RyaW5nLFxuICBvYmplY3RUeXBlczogc3RyaW5nW10sXG4gIGluY2x1ZGVVbmluaXRpYWxpemVkPzogYm9vbGVhbixcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZU9iamVjdHNCeUxhYmVsKFxuICB7XG4gICAgY29udGV4dCxcbiAgICBuYW1lc3BhY2UsXG4gICAgbGFiZWxLZXksXG4gICAgbGFiZWxWYWx1ZSxcbiAgICBvYmplY3RUeXBlcyxcbiAgICBpbmNsdWRlVW5pbml0aWFsaXplZCA9IGZhbHNlLFxuICB9OiBEZWxldGVPYmplY3RzUGFyYW1zKSB7XG5cbiAgbGV0IGFyZ3MgPSBbXG4gICAgXCJkZWxldGVcIixcbiAgICBvYmplY3RUeXBlcy5qb2luKFwiLFwiKSxcbiAgICBcIi1sXCIsXG4gICAgYCR7bGFiZWxLZXl9PSR7bGFiZWxWYWx1ZX1gLFxuICBdXG5cbiAgaW5jbHVkZVVuaW5pdGlhbGl6ZWQgJiYgYXJncy5wdXNoKFwiLS1pbmNsdWRlLXVuaW5pdGlhbGl6ZWRcIilcblxuICBjb25zdCByZXN1bHQgPSBhd2FpdCBrdWJlY3RsKGNvbnRleHQsIG5hbWVzcGFjZSkuY2FsbChhcmdzKVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0Lm91dHB1dClcbiAgfSBjYXRjaCAoXykge1xuICAgIHJldHVybiByZXN1bHQub3V0cHV0XG4gIH1cbn1cbiJdfQ==
