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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const pty = require("node-pty-prebuilt");
const exitHook = require("async-exit-hook");
const klaw = require("klaw");
const yaml = require("js-yaml");
const Cryo = require("cryo");
const child_process_1 = require("child_process");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const lodash_1 = require("lodash");
const exceptions_1 = require("../exceptions");
const stream_1 = require("stream");
const lodash_2 = require("lodash");
const cli_highlight_1 = require("cli-highlight");
const chalk_1 = require("chalk");
const hasAnsi = require("has-ansi");
const js_yaml_1 = require("js-yaml");
const constants_1 = require("../constants");
// NOTE: Importing from ignore/ignore doesn't work on Windows
const ignore = require("ignore");
// shim to allow async generator functions
if (typeof Symbol.asyncIterator === "undefined") {
    Symbol.asyncIterator = Symbol("asyncIterator");
}
const exitHookNames = []; // For debugging/testing/inspection purposes
function shutdown(code) {
    // This is a good place to log exitHookNames if needed.
    process.exit(code);
}
exports.shutdown = shutdown;
function registerCleanupFunction(name, func) {
    exitHookNames.push(name);
    exitHook(func);
}
exports.registerCleanupFunction = registerCleanupFunction;
/*
  Warning: Don't make any async calls in the loop body when using this function, since this may cause
  funky concurrency behavior.
  */
function scanDirectory(path, opts) {
    return __asyncGenerator(this, arguments, function* scanDirectory_1() {
        let done = false;
        let resolver;
        let rejecter;
        klaw(path, opts)
            .on("data", (item) => {
            if (item.path !== path) {
                resolver(item);
            }
        })
            .on("error", (err) => {
            rejecter(err);
        })
            .on("end", () => {
            done = true;
            resolver();
        });
        // a nice little trick to turn the stream into an async generator
        while (!done) {
            const promise = new Promise((resolve, reject) => {
                resolver = resolve;
                rejecter = reject;
            });
            yield yield __await(yield __await(promise));
        }
    });
}
exports.scanDirectory = scanDirectory;
function getChildDirNames(parentDir) {
    return __awaiter(this, void 0, void 0, function* () {
        var e_1, _a;
        let dirNames = [];
        // Filter on hidden dirs by default. We could make the filter function a param if needed later
        const filter = (item) => !path_1.basename(item).startsWith(".");
        try {
            for (var _b = __asyncValues(scanDirectory(parentDir, { depthLimit: 0, filter })), _c; _c = yield _b.next(), !_c.done;) {
                const item = _c.value;
                if (!item || !item.stats.isDirectory()) {
                    continue;
                }
                dirNames.push(path_1.basename(item.path));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return dirNames;
    });
}
exports.getChildDirNames = getChildDirNames;
function getIgnorer(rootPath) {
    return __awaiter(this, void 0, void 0, function* () {
        // TODO: this doesn't handle nested .gitignore files, we should revisit
        const gitignorePath = path_1.join(rootPath, ".gitignore");
        const gardenignorePath = path_1.join(rootPath, ".gardenignore");
        const ig = ignore();
        if (yield fs_extra_1.pathExists(gitignorePath)) {
            ig.add((yield fs_extra_1.readFile(gitignorePath)).toString());
        }
        if (yield fs_extra_1.pathExists(gardenignorePath)) {
            ig.add((yield fs_extra_1.readFile(gardenignorePath)).toString());
        }
        // should we be adding this (or more) by default?
        ig.add([
            "node_modules",
            ".git",
            constants_1.GARDEN_DIR_NAME,
        ]);
        return ig;
    });
}
exports.getIgnorer = getIgnorer;
function sleep(msec) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => setTimeout(resolve, msec));
    });
}
exports.sleep = sleep;
function spawn(cmd, args, { timeout = 0, cwd, data, ignoreError = false, env } = {}) {
    const proc = child_process_1.spawn(cmd, args, { cwd, env });
    const result = {
        code: 0,
        output: "",
        stdout: "",
        stderr: "",
        proc,
    };
    proc.stdout.on("data", (s) => {
        result.output += s;
        result.stdout += s;
    });
    proc.stderr.on("data", (s) => {
        result.output += s;
        result.stderr += s;
    });
    if (data) {
        proc.stdin.end(data);
    }
    return new Promise((resolve, reject) => {
        let _timeout;
        const _reject = (msg) => {
            const err = new Error(msg);
            lodash_2.extend(err, result);
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
            result.code = code;
            if (code === 0 || ignoreError) {
                resolve(result);
            }
            else {
                _reject("Process exited with code " + code);
            }
        });
    });
}
exports.spawn = spawn;
function spawnPty(cmd, args, { silent = false, tty = false, timeout = 0, cwd, bufferOutput = true, data, ignoreError = false, } = {}) {
    let _process = process;
    let proc = pty.spawn(cmd, args, {
        cwd,
        name: "xterm-color",
        cols: _process.stdout.columns,
        rows: _process.stdout.rows,
    });
    _process.stdin.setEncoding("utf8");
    // raw mode is not available if we're running without a TTY
    tty && _process.stdin.setRawMode && _process.stdin.setRawMode(true);
    const result = {
        code: 0,
        output: "",
        proc,
    };
    proc.on("data", (output) => {
        const str = output.toString();
        if (bufferOutput) {
            result.output += str;
        }
        if (!silent) {
            process.stdout.write(hasAnsi(str) ? str : chalk_1.default.white(str));
        }
    });
    if (data) {
        const bufferStream = new stream_1.PassThrough();
        bufferStream.end(data + "\n\0");
        bufferStream.pipe(proc);
        proc.end();
    }
    if (tty) {
        process.stdin.pipe(proc);
    }
    return new Bluebird((resolve, _reject) => {
        let _timeout;
        const reject = (err) => {
            err.output = result.output;
            err.proc = result.proc;
            console.log(err.output);
            _reject(err);
        };
        if (timeout > 0) {
            _timeout = setTimeout(() => {
                proc.kill("SIGKILL");
                const err = new exceptions_1.TimeoutError(`${cmd} command timed out after ${timeout} seconds.`, { cmd, timeout });
                reject(err);
            }, timeout * 1000);
        }
        proc.on("exit", (code) => {
            _timeout && clearTimeout(_timeout);
            // make sure raw input is decoupled
            tty && _process.stdin.setRawMode && _process.stdin.setRawMode(false);
            result.code = code;
            if (code === 0 || ignoreError) {
                resolve(result);
            }
            else {
                const err = new Error("Process exited with code " + code);
                err.code = code;
                reject(err);
            }
        });
    });
}
exports.spawnPty = spawnPty;
function dumpYaml(yamlPath, data) {
    return __awaiter(this, void 0, void 0, function* () {
        return fs_extra_1.writeFile(yamlPath, yaml.safeDump(data, { noRefs: true }));
    });
}
exports.dumpYaml = dumpYaml;
/**
 * Encode multiple objects as one multi-doc YAML file
 */
function encodeYamlMulti(objects) {
    return objects.map(s => js_yaml_1.safeDump(s) + "---\n").join("");
}
exports.encodeYamlMulti = encodeYamlMulti;
/**
 * Encode and write multiple objects as a multi-doc YAML file
 */
function dumpYamlMulti(yamlPath, objects) {
    return __awaiter(this, void 0, void 0, function* () {
        return fs_extra_1.writeFile(yamlPath, encodeYamlMulti(objects));
    });
}
exports.dumpYamlMulti = dumpYamlMulti;
/**
 * Splits the input string on the first occurrence of `delimiter`.
 */
function splitFirst(s, delimiter) {
    const parts = s.split(delimiter);
    return [parts[0], parts.slice(1).join(delimiter)];
}
exports.splitFirst = splitFirst;
/**
 * Recursively resolves all promises in the given input,
 * walking through all object keys and array items.
 */
function deepResolve(value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lodash_2.isArray(value)) {
            return yield Bluebird.map(value, deepResolve);
        }
        else if (lodash_2.isPlainObject(value)) {
            return yield Bluebird.props(lodash_2.mapValues(value, deepResolve));
        }
        else {
            return Promise.resolve(value);
        }
    });
}
exports.deepResolve = deepResolve;
/**
 * Recursively maps over all keys in the input and resolves the resulting promises,
 * walking through all object keys and array items.
 */
function asyncDeepMap(obj, mapper, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lodash_2.isArray(obj)) {
            return Bluebird.map(obj, v => asyncDeepMap(v, mapper, options), options);
        }
        else if (lodash_2.isPlainObject(obj)) {
            return lodash_1.fromPairs(yield Bluebird.map(Object.entries(obj), ([key, value]) => __awaiter(this, void 0, void 0, function* () { return [key, yield asyncDeepMap(value, mapper, options)]; }), options));
        }
        else {
            return mapper(obj);
        }
    });
}
exports.asyncDeepMap = asyncDeepMap;
function omitUndefined(o) {
    return lodash_2.pickBy(o, (v) => v !== undefined);
}
exports.omitUndefined = omitUndefined;
function serializeObject(o) {
    return Buffer.from(Cryo.stringify(o)).toString("base64");
}
exports.serializeObject = serializeObject;
function deserializeObject(s) {
    return Cryo.parse(Buffer.from(s, "base64"));
}
exports.deserializeObject = deserializeObject;
function serializeValues(o) {
    return lodash_2.mapValues(o, serializeObject);
}
exports.serializeValues = serializeValues;
function deserializeValues(o) {
    return lodash_2.mapValues(o, deserializeObject);
}
exports.deserializeValues = deserializeValues;
function getEnumKeys(Enum) {
    return Object.values(Enum).filter(k => typeof k === "string");
}
exports.getEnumKeys = getEnumKeys;
function highlightYaml(s) {
    return cli_highlight_1.default(s, {
        language: "yaml",
        theme: {
            keyword: chalk_1.default.white.italic,
            literal: chalk_1.default.white.italic,
            string: chalk_1.default.white,
        },
    });
}
exports.highlightYaml = highlightYaml;
function loadYamlFile(path) {
    return __awaiter(this, void 0, void 0, function* () {
        const fileData = yield fs_extra_1.readFile(path);
        return yaml.safeLoad(fileData.toString());
    });
}
exports.loadYamlFile = loadYamlFile;
function getNames(array) {
    return array.map(v => v.name);
}
exports.getNames = getNames;
function findByName(array, name) {
    return lodash_1.find(array, ["name", name]);
}
exports.findByName = findByName;
/**
 * Converts a Windows-style path to a cygwin style path (e.g. C:\some\folder -> /cygdrive/c/some/folder).
 */
function toCygwinPath(path) {
    const parsed = path_1.win32.parse(path);
    const drive = parsed.root.split(":")[0].toLowerCase();
    const dirs = parsed.dir.split(path_1.win32.sep).slice(1);
    const cygpath = path_1.posix.join("/cygdrive", drive, ...dirs, parsed.base);
    // make sure trailing slash is retained
    return path.endsWith(path_1.win32.sep) ? cygpath + path_1.posix.sep : cygpath;
}
exports.toCygwinPath = toCygwinPath;
/**
 * Converts a string identifier to the appropriate casing and style for use in environment variable names.
 * (e.g. "my-service" -> "MY_SERVICE")
 */
function getEnvVarName(identifier) {
    return identifier.replace("-", "_").toUpperCase();
}
exports.getEnvVarName = getEnvVarName;
/**
 * Picks the specified keys from the given object, and throws an error if one or more keys are not found.
 */
function pickKeys(obj, keys, description = "key") {
    const picked = lodash_1.pick(obj, ...keys);
    const missing = lodash_1.difference(keys, Object.keys(picked));
    if (missing.length) {
        throw new exceptions_1.ParameterError(`Could not find ${description}(s): ${missing.map((k, _) => k).join(", ")}`, {
            missing,
            available: Object.keys(obj),
        });
    }
    return picked;
}
exports.pickKeys = pickKeys;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q25HLE9BQU87WUFDUCxTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7U0FDNUIsQ0FBQyxDQUFBO0tBQ0g7SUFFRCxPQUFPLE1BQU0sQ0FBQTtBQUNmLENBQUM7QUFiRCw0QkFhQyIsImZpbGUiOiJ1dGlsL3V0aWwuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IEJsdWViaXJkID0gcmVxdWlyZShcImJsdWViaXJkXCIpXG5pbXBvcnQgeyBSZXNvbHZhYmxlUHJvcHMgfSBmcm9tIFwiYmx1ZWJpcmRcIlxuY29uc3QgcHR5ID0gcmVxdWlyZShcIm5vZGUtcHR5LXByZWJ1aWx0XCIpXG5pbXBvcnQgKiBhcyBleGl0SG9vayBmcm9tIFwiYXN5bmMtZXhpdC1ob29rXCJcbmltcG9ydCAqIGFzIGtsYXcgZnJvbSBcImtsYXdcIlxuaW1wb3J0ICogYXMgeWFtbCBmcm9tIFwianMteWFtbFwiXG5pbXBvcnQgKiBhcyBDcnlvIGZyb20gXCJjcnlvXCJcbmltcG9ydCB7IHNwYXduIGFzIF9zcGF3biB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCJcbmltcG9ydCB7IHBhdGhFeGlzdHMsIHJlYWRGaWxlLCB3cml0ZUZpbGUgfSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IHsgam9pbiwgYmFzZW5hbWUsIHdpbjMyLCBwb3NpeCB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IGZpbmQsIHBpY2ssIGRpZmZlcmVuY2UsIGZyb21QYWlycyB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgVGltZW91dEVycm9yLCBQYXJhbWV0ZXJFcnJvciB9IGZyb20gXCIuLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IFBhc3NUaHJvdWdoIH0gZnJvbSBcInN0cmVhbVwiXG5pbXBvcnQgeyBpc0FycmF5LCBpc1BsYWluT2JqZWN0LCBleHRlbmQsIG1hcFZhbHVlcywgcGlja0J5IH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgaGlnaGxpZ2h0IGZyb20gXCJjbGktaGlnaGxpZ2h0XCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IGhhc0Fuc2kgPSByZXF1aXJlKFwiaGFzLWFuc2lcIilcbmltcG9ydCB7IHNhZmVEdW1wIH0gZnJvbSBcImpzLXlhbWxcIlxuaW1wb3J0IHsgR0FSREVOX0RJUl9OQU1FIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG4vLyBOT1RFOiBJbXBvcnRpbmcgZnJvbSBpZ25vcmUvaWdub3JlIGRvZXNuJ3Qgd29yayBvbiBXaW5kb3dzXG5jb25zdCBpZ25vcmUgPSByZXF1aXJlKFwiaWdub3JlXCIpXG5cbi8vIHNoaW0gdG8gYWxsb3cgYXN5bmMgZ2VuZXJhdG9yIGZ1bmN0aW9uc1xuaWYgKHR5cGVvZiAoU3ltYm9sIGFzIGFueSkuYXN5bmNJdGVyYXRvciA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAoU3ltYm9sIGFzIGFueSkuYXN5bmNJdGVyYXRvciA9IFN5bWJvbChcImFzeW5jSXRlcmF0b3JcIilcbn1cblxuZXhwb3J0IHR5cGUgSG9va0NhbGxiYWNrID0gKGNhbGxiYWNrPzogKCkgPT4gdm9pZCkgPT4gdm9pZFxuXG5jb25zdCBleGl0SG9va05hbWVzOiBzdHJpbmdbXSA9IFtdIC8vIEZvciBkZWJ1Z2dpbmcvdGVzdGluZy9pbnNwZWN0aW9uIHB1cnBvc2VzXG5cbmV4cG9ydCB0eXBlIE9taXQ8VCwgSyBleHRlbmRzIGtleW9mIFQ+ID0gUGljazxULCBFeGNsdWRlPGtleW9mIFQsIEs+PlxuZXhwb3J0IHR5cGUgRGlmZjxULCBVPiA9IFQgZXh0ZW5kcyBVID8gbmV2ZXIgOiBUXG5leHBvcnQgdHlwZSBOdWxsYWJsZTxUPiA9IHsgW1AgaW4ga2V5b2YgVF06IFRbUF0gfCBudWxsIH1cbi8vIEZyb206IGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS80OTkzNjY4Ni81NjI5OTQwXG5leHBvcnQgdHlwZSBEZWVwUGFydGlhbDxUPiA9IHtcbiAgW1AgaW4ga2V5b2YgVF0/OiBUW1BdIGV4dGVuZHMgQXJyYXk8aW5mZXIgVT4gPyBBcnJheTxEZWVwUGFydGlhbDxVPj5cbiAgOiBUW1BdIGV4dGVuZHMgUmVhZG9ubHlBcnJheTxpbmZlciBWPiA/IFJlYWRvbmx5QXJyYXk8RGVlcFBhcnRpYWw8Vj4+XG4gIDogRGVlcFBhcnRpYWw8VFtQXT5cbn1cbmV4cG9ydCB0eXBlIFVucGFja2VkPFQ+ID1cbiAgVCBleHRlbmRzIChpbmZlciBVKVtdID8gVVxuICA6IFQgZXh0ZW5kcyAoLi4uYXJnczogYW55W10pID0+IGluZmVyIFYgPyBWXG4gIDogVCBleHRlbmRzIFByb21pc2U8aW5mZXIgVz4gPyBXXG4gIDogVFxuXG5leHBvcnQgZnVuY3Rpb24gc2h1dGRvd24oY29kZSkge1xuICAvLyBUaGlzIGlzIGEgZ29vZCBwbGFjZSB0byBsb2cgZXhpdEhvb2tOYW1lcyBpZiBuZWVkZWQuXG4gIHByb2Nlc3MuZXhpdChjb2RlKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDbGVhbnVwRnVuY3Rpb24obmFtZTogc3RyaW5nLCBmdW5jOiBIb29rQ2FsbGJhY2spIHtcbiAgZXhpdEhvb2tOYW1lcy5wdXNoKG5hbWUpXG4gIGV4aXRIb29rKGZ1bmMpXG59XG5cbi8qXG4gIFdhcm5pbmc6IERvbid0IG1ha2UgYW55IGFzeW5jIGNhbGxzIGluIHRoZSBsb29wIGJvZHkgd2hlbiB1c2luZyB0aGlzIGZ1bmN0aW9uLCBzaW5jZSB0aGlzIG1heSBjYXVzZVxuICBmdW5reSBjb25jdXJyZW5jeSBiZWhhdmlvci5cbiAgKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiogc2NhbkRpcmVjdG9yeShwYXRoOiBzdHJpbmcsIG9wdHM/OiBrbGF3Lk9wdGlvbnMpOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8a2xhdy5JdGVtPiB7XG4gIGxldCBkb25lID0gZmFsc2VcbiAgbGV0IHJlc29sdmVyXG4gIGxldCByZWplY3RlclxuXG4gIGtsYXcocGF0aCwgb3B0cylcbiAgICAub24oXCJkYXRhXCIsIChpdGVtKSA9PiB7XG4gICAgICBpZiAoaXRlbS5wYXRoICE9PSBwYXRoKSB7XG4gICAgICAgIHJlc29sdmVyKGl0ZW0pXG4gICAgICB9XG4gICAgfSlcbiAgICAub24oXCJlcnJvclwiLCAoZXJyKSA9PiB7XG4gICAgICByZWplY3RlcihlcnIpXG4gICAgfSlcbiAgICAub24oXCJlbmRcIiwgKCkgPT4ge1xuICAgICAgZG9uZSA9IHRydWVcbiAgICAgIHJlc29sdmVyKClcbiAgICB9KVxuXG4gIC8vIGEgbmljZSBsaXR0bGUgdHJpY2sgdG8gdHVybiB0aGUgc3RyZWFtIGludG8gYW4gYXN5bmMgZ2VuZXJhdG9yXG4gIHdoaWxlICghZG9uZSkge1xuICAgIGNvbnN0IHByb21pc2U6IFByb21pc2U8a2xhdy5JdGVtPiA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHJlc29sdmVyID0gcmVzb2x2ZVxuICAgICAgcmVqZWN0ZXIgPSByZWplY3RcbiAgICB9KVxuXG4gICAgeWllbGQgYXdhaXQgcHJvbWlzZVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRDaGlsZERpck5hbWVzKHBhcmVudERpcjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBsZXQgZGlyTmFtZXM6IHN0cmluZ1tdID0gW11cbiAgLy8gRmlsdGVyIG9uIGhpZGRlbiBkaXJzIGJ5IGRlZmF1bHQuIFdlIGNvdWxkIG1ha2UgdGhlIGZpbHRlciBmdW5jdGlvbiBhIHBhcmFtIGlmIG5lZWRlZCBsYXRlclxuICBjb25zdCBmaWx0ZXIgPSAoaXRlbTogc3RyaW5nKSA9PiAhYmFzZW5hbWUoaXRlbSkuc3RhcnRzV2l0aChcIi5cIilcblxuICBmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2Ygc2NhbkRpcmVjdG9yeShwYXJlbnREaXIsIHsgZGVwdGhMaW1pdDogMCwgZmlsdGVyIH0pKSB7XG4gICAgaWYgKCFpdGVtIHx8ICFpdGVtLnN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIGRpck5hbWVzLnB1c2goYmFzZW5hbWUoaXRlbS5wYXRoKSlcbiAgfVxuICByZXR1cm4gZGlyTmFtZXNcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldElnbm9yZXIocm9vdFBhdGg6IHN0cmluZykge1xuICAvLyBUT0RPOiB0aGlzIGRvZXNuJ3QgaGFuZGxlIG5lc3RlZCAuZ2l0aWdub3JlIGZpbGVzLCB3ZSBzaG91bGQgcmV2aXNpdFxuICBjb25zdCBnaXRpZ25vcmVQYXRoID0gam9pbihyb290UGF0aCwgXCIuZ2l0aWdub3JlXCIpXG4gIGNvbnN0IGdhcmRlbmlnbm9yZVBhdGggPSBqb2luKHJvb3RQYXRoLCBcIi5nYXJkZW5pZ25vcmVcIilcbiAgY29uc3QgaWcgPSBpZ25vcmUoKVxuXG4gIGlmIChhd2FpdCBwYXRoRXhpc3RzKGdpdGlnbm9yZVBhdGgpKSB7XG4gICAgaWcuYWRkKChhd2FpdCByZWFkRmlsZShnaXRpZ25vcmVQYXRoKSkudG9TdHJpbmcoKSlcbiAgfVxuXG4gIGlmIChhd2FpdCBwYXRoRXhpc3RzKGdhcmRlbmlnbm9yZVBhdGgpKSB7XG4gICAgaWcuYWRkKChhd2FpdCByZWFkRmlsZShnYXJkZW5pZ25vcmVQYXRoKSkudG9TdHJpbmcoKSlcbiAgfVxuXG4gIC8vIHNob3VsZCB3ZSBiZSBhZGRpbmcgdGhpcyAob3IgbW9yZSkgYnkgZGVmYXVsdD9cbiAgaWcuYWRkKFtcbiAgICBcIm5vZGVfbW9kdWxlc1wiLFxuICAgIFwiLmdpdFwiLFxuICAgIEdBUkRFTl9ESVJfTkFNRSxcbiAgXSlcblxuICByZXR1cm4gaWdcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNsZWVwKG1zZWMpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtc2VjKSlcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcGF3blBhcmFtcyB7XG4gIHRpbWVvdXQ/OiBudW1iZXJcbiAgY3dkPzogc3RyaW5nXG4gIGRhdGE/OiBCdWZmZXJcbiAgaWdub3JlRXJyb3I/OiBib29sZWFuXG4gIGVudj86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcGF3blB0eVBhcmFtcyBleHRlbmRzIFNwYXduUGFyYW1zIHtcbiAgc2lsZW50PzogYm9vbGVhblxuICB0dHk/OiBib29sZWFuXG4gIGJ1ZmZlck91dHB1dD86IGJvb2xlYW5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcGF3bk91dHB1dCB7XG4gIGNvZGU6IG51bWJlclxuICBvdXRwdXQ6IHN0cmluZ1xuICBzdGRvdXQ/OiBzdHJpbmdcbiAgc3RkZXJyPzogc3RyaW5nXG4gIHByb2M6IGFueVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3Bhd24oXG4gIGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSxcbiAgeyB0aW1lb3V0ID0gMCwgY3dkLCBkYXRhLCBpZ25vcmVFcnJvciA9IGZhbHNlLCBlbnYgfTogU3Bhd25QYXJhbXMgPSB7fSxcbikge1xuICBjb25zdCBwcm9jID0gX3NwYXduKGNtZCwgYXJncywgeyBjd2QsIGVudiB9KVxuXG4gIGNvbnN0IHJlc3VsdDogU3Bhd25PdXRwdXQgPSB7XG4gICAgY29kZTogMCxcbiAgICBvdXRwdXQ6IFwiXCIsXG4gICAgc3Rkb3V0OiBcIlwiLFxuICAgIHN0ZGVycjogXCJcIixcbiAgICBwcm9jLFxuICB9XG5cbiAgcHJvYy5zdGRvdXQub24oXCJkYXRhXCIsIChzKSA9PiB7XG4gICAgcmVzdWx0Lm91dHB1dCArPSBzXG4gICAgcmVzdWx0LnN0ZG91dCEgKz0gc1xuICB9KVxuXG4gIHByb2Muc3RkZXJyLm9uKFwiZGF0YVwiLCAocykgPT4ge1xuICAgIHJlc3VsdC5vdXRwdXQgKz0gc1xuICAgIHJlc3VsdC5zdGRlcnIhICs9IHNcbiAgfSlcblxuICBpZiAoZGF0YSkge1xuICAgIHByb2Muc3RkaW4uZW5kKGRhdGEpXG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2U8U3Bhd25PdXRwdXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBsZXQgX3RpbWVvdXRcblxuICAgIGNvbnN0IF9yZWplY3QgPSAobXNnOiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvcihtc2cpXG4gICAgICBleHRlbmQoZXJyLCA8YW55PnJlc3VsdClcbiAgICAgIHJlamVjdChlcnIpXG4gICAgfVxuXG4gICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICBfdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBwcm9jLmtpbGwoXCJTSUdLSUxMXCIpXG4gICAgICAgIF9yZWplY3QoYGt1YmVjdGwgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dH0gc2Vjb25kcy5gKVxuICAgICAgfSwgdGltZW91dCAqIDEwMDApXG4gICAgfVxuXG4gICAgcHJvYy5vbihcImNsb3NlXCIsIChjb2RlKSA9PiB7XG4gICAgICBfdGltZW91dCAmJiBjbGVhclRpbWVvdXQoX3RpbWVvdXQpXG4gICAgICByZXN1bHQuY29kZSA9IGNvZGVcblxuICAgICAgaWYgKGNvZGUgPT09IDAgfHwgaWdub3JlRXJyb3IpIHtcbiAgICAgICAgcmVzb2x2ZShyZXN1bHQpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfcmVqZWN0KFwiUHJvY2VzcyBleGl0ZWQgd2l0aCBjb2RlIFwiICsgY29kZSlcbiAgICAgIH1cbiAgICB9KVxuICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3Bhd25QdHkoXG4gIGNtZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSxcbiAge1xuICAgIHNpbGVudCA9IGZhbHNlLCB0dHkgPSBmYWxzZSwgdGltZW91dCA9IDAsIGN3ZCxcbiAgICBidWZmZXJPdXRwdXQgPSB0cnVlLCBkYXRhLCBpZ25vcmVFcnJvciA9IGZhbHNlLFxuICB9OiBTcGF3blB0eVBhcmFtcyA9IHt9LFxuKTogQmx1ZWJpcmQ8YW55PiB7XG4gIGxldCBfcHJvY2VzcyA9IDxhbnk+cHJvY2Vzc1xuXG4gIGxldCBwcm9jOiBhbnkgPSBwdHkuc3Bhd24oY21kLCBhcmdzLCB7XG4gICAgY3dkLFxuICAgIG5hbWU6IFwieHRlcm0tY29sb3JcIixcbiAgICBjb2xzOiBfcHJvY2Vzcy5zdGRvdXQuY29sdW1ucyxcbiAgICByb3dzOiBfcHJvY2Vzcy5zdGRvdXQucm93cyxcbiAgfSlcblxuICBfcHJvY2Vzcy5zdGRpbi5zZXRFbmNvZGluZyhcInV0ZjhcIilcblxuICAvLyByYXcgbW9kZSBpcyBub3QgYXZhaWxhYmxlIGlmIHdlJ3JlIHJ1bm5pbmcgd2l0aG91dCBhIFRUWVxuICB0dHkgJiYgX3Byb2Nlc3Muc3RkaW4uc2V0UmF3TW9kZSAmJiBfcHJvY2Vzcy5zdGRpbi5zZXRSYXdNb2RlKHRydWUpXG5cbiAgY29uc3QgcmVzdWx0OiBTcGF3bk91dHB1dCA9IHtcbiAgICBjb2RlOiAwLFxuICAgIG91dHB1dDogXCJcIixcbiAgICBwcm9jLFxuICB9XG5cbiAgcHJvYy5vbihcImRhdGFcIiwgKG91dHB1dCkgPT4ge1xuICAgIGNvbnN0IHN0ciA9IG91dHB1dC50b1N0cmluZygpXG5cbiAgICBpZiAoYnVmZmVyT3V0cHV0KSB7XG4gICAgICByZXN1bHQub3V0cHV0ICs9IHN0clxuICAgIH1cblxuICAgIGlmICghc2lsZW50KSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShoYXNBbnNpKHN0cikgPyBzdHIgOiBjaGFsay53aGl0ZShzdHIpKVxuICAgIH1cbiAgfSlcblxuICBpZiAoZGF0YSkge1xuICAgIGNvbnN0IGJ1ZmZlclN0cmVhbSA9IG5ldyBQYXNzVGhyb3VnaCgpXG4gICAgYnVmZmVyU3RyZWFtLmVuZChkYXRhICsgXCJcXG5cXDBcIilcbiAgICBidWZmZXJTdHJlYW0ucGlwZShwcm9jKVxuICAgIHByb2MuZW5kKClcbiAgfVxuXG4gIGlmICh0dHkpIHtcbiAgICBwcm9jZXNzLnN0ZGluLnBpcGUocHJvYylcbiAgfVxuXG4gIHJldHVybiBuZXcgQmx1ZWJpcmQoKHJlc29sdmUsIF9yZWplY3QpID0+IHtcbiAgICBsZXQgX3RpbWVvdXRcblxuICAgIGNvbnN0IHJlamVjdCA9IChlcnI6IGFueSkgPT4ge1xuICAgICAgZXJyLm91dHB1dCA9IHJlc3VsdC5vdXRwdXRcbiAgICAgIGVyci5wcm9jID0gcmVzdWx0LnByb2NcbiAgICAgIGNvbnNvbGUubG9nKGVyci5vdXRwdXQpXG4gICAgICBfcmVqZWN0KGVycilcbiAgICB9XG5cbiAgICBpZiAodGltZW91dCA+IDApIHtcbiAgICAgIF90aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHByb2Mua2lsbChcIlNJR0tJTExcIilcbiAgICAgICAgY29uc3QgZXJyID0gbmV3IFRpbWVvdXRFcnJvcihgJHtjbWR9IGNvbW1hbmQgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dH0gc2Vjb25kcy5gLCB7IGNtZCwgdGltZW91dCB9KVxuICAgICAgICByZWplY3QoZXJyKVxuICAgICAgfSwgdGltZW91dCAqIDEwMDApXG4gICAgfVxuXG4gICAgcHJvYy5vbihcImV4aXRcIiwgKGNvZGUpID0+IHtcbiAgICAgIF90aW1lb3V0ICYmIGNsZWFyVGltZW91dChfdGltZW91dClcblxuICAgICAgLy8gbWFrZSBzdXJlIHJhdyBpbnB1dCBpcyBkZWNvdXBsZWRcbiAgICAgIHR0eSAmJiBfcHJvY2Vzcy5zdGRpbi5zZXRSYXdNb2RlICYmIF9wcm9jZXNzLnN0ZGluLnNldFJhd01vZGUoZmFsc2UpXG4gICAgICByZXN1bHQuY29kZSA9IGNvZGVcblxuICAgICAgaWYgKGNvZGUgPT09IDAgfHwgaWdub3JlRXJyb3IpIHtcbiAgICAgICAgcmVzb2x2ZShyZXN1bHQpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBlcnI6IGFueSA9IG5ldyBFcnJvcihcIlByb2Nlc3MgZXhpdGVkIHdpdGggY29kZSBcIiArIGNvZGUpXG4gICAgICAgIGVyci5jb2RlID0gY29kZVxuICAgICAgICByZWplY3QoZXJyKVxuICAgICAgfVxuICAgIH0pXG4gIH0pXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkdW1wWWFtbCh5YW1sUGF0aCwgZGF0YSkge1xuICByZXR1cm4gd3JpdGVGaWxlKHlhbWxQYXRoLCB5YW1sLnNhZmVEdW1wKGRhdGEsIHsgbm9SZWZzOiB0cnVlIH0pKVxufVxuXG4vKipcbiAqIEVuY29kZSBtdWx0aXBsZSBvYmplY3RzIGFzIG9uZSBtdWx0aS1kb2MgWUFNTCBmaWxlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVZYW1sTXVsdGkob2JqZWN0czogb2JqZWN0W10pIHtcbiAgcmV0dXJuIG9iamVjdHMubWFwKHMgPT4gc2FmZUR1bXAocykgKyBcIi0tLVxcblwiKS5qb2luKFwiXCIpXG59XG5cbi8qKlxuICogRW5jb2RlIGFuZCB3cml0ZSBtdWx0aXBsZSBvYmplY3RzIGFzIGEgbXVsdGktZG9jIFlBTUwgZmlsZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZHVtcFlhbWxNdWx0aSh5YW1sUGF0aDogc3RyaW5nLCBvYmplY3RzOiBvYmplY3RbXSkge1xuICByZXR1cm4gd3JpdGVGaWxlKHlhbWxQYXRoLCBlbmNvZGVZYW1sTXVsdGkob2JqZWN0cykpXG59XG5cbi8qKlxuICogU3BsaXRzIHRoZSBpbnB1dCBzdHJpbmcgb24gdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYGRlbGltaXRlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEZpcnN0KHM6IHN0cmluZywgZGVsaW1pdGVyOiBzdHJpbmcpIHtcbiAgY29uc3QgcGFydHMgPSBzLnNwbGl0KGRlbGltaXRlcilcbiAgcmV0dXJuIFtwYXJ0c1swXSwgcGFydHMuc2xpY2UoMSkuam9pbihkZWxpbWl0ZXIpXVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IHJlc29sdmVzIGFsbCBwcm9taXNlcyBpbiB0aGUgZ2l2ZW4gaW5wdXQsXG4gKiB3YWxraW5nIHRocm91Z2ggYWxsIG9iamVjdCBrZXlzIGFuZCBhcnJheSBpdGVtcy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlZXBSZXNvbHZlPFQ+KFxuICB2YWx1ZTogVCB8IEl0ZXJhYmxlPFQ+IHwgSXRlcmFibGU8UHJvbWlzZUxpa2U8VD4+IHwgUmVzb2x2YWJsZVByb3BzPFQ+LFxuKTogUHJvbWlzZTxUIHwgSXRlcmFibGU8VD4gfCB7IFtLIGluIGtleW9mIFRdOiBUW0tdIH0+IHtcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIGF3YWl0IEJsdWViaXJkLm1hcCh2YWx1ZSwgZGVlcFJlc29sdmUpXG4gIH0gZWxzZSBpZiAoaXNQbGFpbk9iamVjdCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gYXdhaXQgQmx1ZWJpcmQucHJvcHMoPFJlc29sdmFibGVQcm9wczxUPj5tYXBWYWx1ZXMoPFJlc29sdmFibGVQcm9wczxUPj52YWx1ZSwgZGVlcFJlc29sdmUpKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoPFQ+dmFsdWUpXG4gIH1cbn1cblxuLyoqXG4gKiBSZWN1cnNpdmVseSBtYXBzIG92ZXIgYWxsIGtleXMgaW4gdGhlIGlucHV0IGFuZCByZXNvbHZlcyB0aGUgcmVzdWx0aW5nIHByb21pc2VzLFxuICogd2Fsa2luZyB0aHJvdWdoIGFsbCBvYmplY3Qga2V5cyBhbmQgYXJyYXkgaXRlbXMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhc3luY0RlZXBNYXA8VD4oXG4gIG9iajogVCwgbWFwcGVyOiAodmFsdWUpID0+IFByb21pc2U8YW55Piwgb3B0aW9ucz86IEJsdWViaXJkLkNvbmN1cnJlbmN5T3B0aW9uLFxuKTogUHJvbWlzZTxUPiB7XG4gIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICByZXR1cm4gPGFueT5CbHVlYmlyZC5tYXAob2JqLCB2ID0+IGFzeW5jRGVlcE1hcCh2LCBtYXBwZXIsIG9wdGlvbnMpLCBvcHRpb25zKVxuICB9IGVsc2UgaWYgKGlzUGxhaW5PYmplY3Qob2JqKSkge1xuICAgIHJldHVybiA8VD5mcm9tUGFpcnMoXG4gICAgICBhd2FpdCBCbHVlYmlyZC5tYXAoXG4gICAgICAgIE9iamVjdC5lbnRyaWVzKG9iaiksXG4gICAgICAgIGFzeW5jIChba2V5LCB2YWx1ZV0pID0+IFtrZXksIGF3YWl0IGFzeW5jRGVlcE1hcCh2YWx1ZSwgbWFwcGVyLCBvcHRpb25zKV0sXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICApLFxuICAgIClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbWFwcGVyKG9iailcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gb21pdFVuZGVmaW5lZChvOiBvYmplY3QpIHtcbiAgcmV0dXJuIHBpY2tCeShvLCAodjogYW55KSA9PiB2ICE9PSB1bmRlZmluZWQpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVPYmplY3QobzogYW55KTogc3RyaW5nIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKENyeW8uc3RyaW5naWZ5KG8pKS50b1N0cmluZyhcImJhc2U2NFwiKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzZXJpYWxpemVPYmplY3Qoczogc3RyaW5nKSB7XG4gIHJldHVybiBDcnlvLnBhcnNlKEJ1ZmZlci5mcm9tKHMsIFwiYmFzZTY0XCIpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVmFsdWVzKG86IHsgW2tleTogc3RyaW5nXTogYW55IH0pOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9IHtcbiAgcmV0dXJuIG1hcFZhbHVlcyhvLCBzZXJpYWxpemVPYmplY3QpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNlcmlhbGl6ZVZhbHVlcyhvOiBvYmplY3QpIHtcbiAgcmV0dXJuIG1hcFZhbHVlcyhvLCBkZXNlcmlhbGl6ZU9iamVjdClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVudW1LZXlzKEVudW0pIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMoRW51bSkuZmlsdGVyKGsgPT4gdHlwZW9mIGsgPT09IFwic3RyaW5nXCIpIGFzIHN0cmluZ1tdXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoaWdobGlnaHRZYW1sKHM6IHN0cmluZykge1xuICByZXR1cm4gaGlnaGxpZ2h0KHMsIHtcbiAgICBsYW5ndWFnZTogXCJ5YW1sXCIsXG4gICAgdGhlbWU6IHtcbiAgICAgIGtleXdvcmQ6IGNoYWxrLndoaXRlLml0YWxpYyxcbiAgICAgIGxpdGVyYWw6IGNoYWxrLndoaXRlLml0YWxpYyxcbiAgICAgIHN0cmluZzogY2hhbGsud2hpdGUsXG4gICAgfSxcbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRZYW1sRmlsZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCBmaWxlRGF0YSA9IGF3YWl0IHJlYWRGaWxlKHBhdGgpXG4gIHJldHVybiB5YW1sLnNhZmVMb2FkKGZpbGVEYXRhLnRvU3RyaW5nKCkpXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgT2JqZWN0V2l0aE5hbWUge1xuICBuYW1lOiBzdHJpbmdcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5hbWVzPFQgZXh0ZW5kcyBPYmplY3RXaXRoTmFtZT4oYXJyYXk6IFRbXSkge1xuICByZXR1cm4gYXJyYXkubWFwKHYgPT4gdi5uYW1lKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZEJ5TmFtZTxUPihhcnJheTogVFtdLCBuYW1lOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcbiAgcmV0dXJuIGZpbmQoYXJyYXksIFtcIm5hbWVcIiwgbmFtZV0pXG59XG5cbi8qKlxuICogQ29udmVydHMgYSBXaW5kb3dzLXN0eWxlIHBhdGggdG8gYSBjeWd3aW4gc3R5bGUgcGF0aCAoZS5nLiBDOlxcc29tZVxcZm9sZGVyIC0+IC9jeWdkcml2ZS9jL3NvbWUvZm9sZGVyKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvQ3lnd2luUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgY29uc3QgcGFyc2VkID0gd2luMzIucGFyc2UocGF0aClcbiAgY29uc3QgZHJpdmUgPSBwYXJzZWQucm9vdC5zcGxpdChcIjpcIilbMF0udG9Mb3dlckNhc2UoKVxuICBjb25zdCBkaXJzID0gcGFyc2VkLmRpci5zcGxpdCh3aW4zMi5zZXApLnNsaWNlKDEpXG4gIGNvbnN0IGN5Z3BhdGggPSBwb3NpeC5qb2luKFwiL2N5Z2RyaXZlXCIsIGRyaXZlLCAuLi5kaXJzLCBwYXJzZWQuYmFzZSlcblxuICAvLyBtYWtlIHN1cmUgdHJhaWxpbmcgc2xhc2ggaXMgcmV0YWluZWRcbiAgcmV0dXJuIHBhdGguZW5kc1dpdGgod2luMzIuc2VwKSA/IGN5Z3BhdGggKyBwb3NpeC5zZXAgOiBjeWdwYXRoXG59XG5cbi8qKlxuICogQ29udmVydHMgYSBzdHJpbmcgaWRlbnRpZmllciB0byB0aGUgYXBwcm9wcmlhdGUgY2FzaW5nIGFuZCBzdHlsZSBmb3IgdXNlIGluIGVudmlyb25tZW50IHZhcmlhYmxlIG5hbWVzLlxuICogKGUuZy4gXCJteS1zZXJ2aWNlXCIgLT4gXCJNWV9TRVJWSUNFXCIpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbnZWYXJOYW1lKGlkZW50aWZpZXI6IHN0cmluZykge1xuICByZXR1cm4gaWRlbnRpZmllci5yZXBsYWNlKFwiLVwiLCBcIl9cIikudG9VcHBlckNhc2UoKVxufVxuXG4vKipcbiAqIFBpY2tzIHRoZSBzcGVjaWZpZWQga2V5cyBmcm9tIHRoZSBnaXZlbiBvYmplY3QsIGFuZCB0aHJvd3MgYW4gZXJyb3IgaWYgb25lIG9yIG1vcmUga2V5cyBhcmUgbm90IGZvdW5kLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGlja0tleXM8VCBleHRlbmRzIG9iamVjdCwgVSBleHRlbmRzIGtleW9mIFQ+KG9iajogVCwga2V5czogVVtdLCBkZXNjcmlwdGlvbiA9IFwia2V5XCIpOiBQaWNrPFQsIFU+IHtcbiAgY29uc3QgcGlja2VkID0gcGljayhvYmosIC4uLmtleXMpXG5cbiAgY29uc3QgbWlzc2luZyA9IGRpZmZlcmVuY2UoPHN0cmluZ1tdPmtleXMsIE9iamVjdC5rZXlzKHBpY2tlZCkpXG5cbiAgaWYgKG1pc3NpbmcubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBDb3VsZCBub3QgZmluZCAke2Rlc2NyaXB0aW9ufShzKTogJHttaXNzaW5nLm1hcCgoaywgXykgPT4gaykuam9pbihcIiwgXCIpfWAsIHtcbiAgICAgIG1pc3NpbmcsXG4gICAgICBhdmFpbGFibGU6IE9iamVjdC5rZXlzKG9iaiksXG4gICAgfSlcbiAgfVxuXG4gIHJldHVybiBwaWNrZWRcbn1cbiJdfQ==
