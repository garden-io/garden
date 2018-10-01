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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const chokidar_1 = require("chokidar");
const lodash_1 = require("lodash");
const path_1 = require("path");
const cache_1 = require("./cache");
const module_1 = require("./types/module");
const util_1 = require("./util/util");
const constants_1 = require("./constants");
/*
  Resolves to modules and their build & service dependant modules (recursively).
  Each module is represented at most once in the output.
*/
function withDependants(garden, modules, autoReloadDependants) {
    return __awaiter(this, void 0, void 0, function* () {
        const moduleSet = new Set();
        const scanner = (module) => {
            moduleSet.add(module.name);
            for (const dependant of (autoReloadDependants[module.name] || [])) {
                if (!moduleSet.has(dependant.name)) {
                    scanner(dependant);
                }
            }
        };
        for (const m of modules) {
            scanner(m);
        }
        // we retrieve the modules again to be sure we have the latest versions
        return garden.getModules(Array.from(moduleSet));
    });
}
exports.withDependants = withDependants;
function computeAutoReloadDependants(garden) {
    return __awaiter(this, void 0, void 0, function* () {
        const dependants = {};
        for (const module of yield garden.getModules()) {
            const depModules = yield uniqueDependencyModules(garden, module);
            for (const dep of depModules) {
                lodash_1.set(dependants, [dep.name, module.name], module);
            }
        }
        return lodash_1.mapValues(dependants, lodash_1.values);
    });
}
exports.computeAutoReloadDependants = computeAutoReloadDependants;
function uniqueDependencyModules(garden, module) {
    return __awaiter(this, void 0, void 0, function* () {
        const buildDeps = module.build.dependencies.map(d => module_1.getModuleKey(d.name, d.plugin));
        const serviceDeps = (yield garden.getServices(module.serviceDependencyNames)).map(s => s.module.name);
        return garden.getModules(lodash_1.uniq(buildDeps.concat(serviceDeps)));
    });
}
class FSWatcher {
    constructor(garden) {
        this.garden = garden;
    }
    watchModules(modules, changeHandler) {
        return __awaiter(this, void 0, void 0, function* () {
            const projectRoot = this.garden.projectRoot;
            const ignorer = yield util_1.getIgnorer(projectRoot);
            const onFileChanged = this.makeFileChangedHandler(modules, changeHandler);
            this.watcher = chokidar_1.watch(projectRoot, {
                ignored: (path, _) => {
                    const relpath = path_1.relative(projectRoot, path);
                    return relpath && ignorer.ignores(relpath);
                },
                ignoreInitial: true,
                persistent: true,
            });
            this.watcher
                .on("add", onFileChanged)
                .on("change", onFileChanged)
                .on("unlink", onFileChanged);
            this.watcher
                .on("addDir", yield this.makeDirAddedHandler(modules, changeHandler, ignorer))
                .on("unlinkDir", this.makeDirRemovedHandler(modules, changeHandler));
        });
    }
    makeFileChangedHandler(modules, changeHandler) {
        return (filePath) => __awaiter(this, void 0, void 0, function* () {
            const filename = path_1.basename(filePath);
            if (filename === "garden.yml" || filename === ".gitignore" || filename === ".gardenignore") {
                yield this.invalidateCachedForAll();
                return changeHandler(null, true);
            }
            const changedModule = modules.find(m => filePath.startsWith(m.path)) || null;
            if (changedModule) {
                this.invalidateCached(changedModule);
            }
            return changeHandler(changedModule, false);
        });
    }
    makeDirAddedHandler(modules, changeHandler, ignorer) {
        return __awaiter(this, void 0, void 0, function* () {
            const scanOpts = {
                filter: (path) => {
                    const relPath = path_1.relative(this.garden.projectRoot, path);
                    return !ignorer.ignores(relPath);
                },
            };
            return (dirPath) => __awaiter(this, void 0, void 0, function* () {
                var e_1, _a;
                let configChanged = false;
                try {
                    for (var _b = __asyncValues(util_1.scanDirectory(dirPath, scanOpts)), _c; _c = yield _b.next(), !_c.done;) {
                        const node = _c.value;
                        if (!node) {
                            continue;
                        }
                        if (path_1.parse(node.path).base === constants_1.MODULE_CONFIG_FILENAME) {
                            configChanged = true;
                        }
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                if (configChanged) {
                    // The added/removed dir contains one or more garden.yml files
                    yield this.invalidateCachedForAll();
                    return changeHandler(null, true);
                }
                const changedModule = modules.find(m => dirPath.startsWith(m.path)) || null;
                if (changedModule) {
                    this.invalidateCached(changedModule);
                    return changeHandler(changedModule, false);
                }
            });
        });
    }
    makeDirRemovedHandler(modules, changeHandler) {
        return (dirPath) => __awaiter(this, void 0, void 0, function* () {
            let changedModule = null;
            for (const module of modules) {
                if (module.path.startsWith(dirPath)) {
                    // at least one module's root dir was removed
                    yield this.invalidateCachedForAll();
                    return changeHandler(null, true);
                }
                if (dirPath.startsWith(module.path)) {
                    // removed dir is a subdir of changedModule's root dir
                    if (!changedModule || module.path.startsWith(changedModule.path)) {
                        changedModule = module;
                    }
                }
            }
            if (changedModule) {
                this.invalidateCached(changedModule);
                return changeHandler(changedModule, false);
            }
        });
    }
    invalidateCached(module) {
        // invalidate the cache for anything attached to the module path or upwards in the directory tree
        const cacheContext = cache_1.pathToCacheContext(module.path);
        this.garden.cache.invalidateUp(cacheContext);
    }
    invalidateCachedForAll() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const module of yield this.garden.getModules()) {
                this.invalidateCached(module);
            }
        });
    }
    close() {
        this.watcher.close();
    }
}
exports.FSWatcher = FSWatcher;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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YSxFQUFFO2dCQUNqQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLENBQUE7Z0JBQ3BDLE9BQU8sYUFBYSxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQTthQUMzQztRQUNILENBQUMsQ0FBQSxDQUFBO0lBRUgsQ0FBQztJQUVPLGdCQUFnQixDQUFDLE1BQWM7UUFDckMsaUdBQWlHO1FBQ2pHLE1BQU0sWUFBWSxHQUFHLDBCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUNwRCxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLENBQUE7SUFDOUMsQ0FBQztJQUVhLHNCQUFzQjs7WUFDbEMsS0FBSyxNQUFNLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEVBQUU7Z0JBQ25ELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQTthQUM5QjtRQUNILENBQUM7S0FBQTtJQUVELEtBQUs7UUFDSCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFBO0lBQ3RCLENBQUM7Q0FFRjtBQTlJRCw4QkE4SUMiLCJmaWxlIjoid2F0Y2guanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgd2F0Y2ggfSBmcm9tIFwiY2hva2lkYXJcIlxuaW1wb3J0IHtcbiAgbWFwVmFsdWVzLFxuICBzZXQsXG4gIHVuaXEsXG4gIHZhbHVlcyxcbn0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyBiYXNlbmFtZSwgcGFyc2UsIHJlbGF0aXZlIH0gZnJvbSBcInBhdGhcIlxuaW1wb3J0IHsgcGF0aFRvQ2FjaGVDb250ZXh0IH0gZnJvbSBcIi4vY2FjaGVcIlxuaW1wb3J0IHsgTW9kdWxlLCBnZXRNb2R1bGVLZXkgfSBmcm9tIFwiLi90eXBlcy9tb2R1bGVcIlxuaW1wb3J0IHsgZ2V0SWdub3Jlciwgc2NhbkRpcmVjdG9yeSB9IGZyb20gXCIuL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBNT0RVTEVfQ09ORklHX0ZJTEVOQU1FIH0gZnJvbSBcIi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuL2dhcmRlblwiXG5cbmV4cG9ydCB0eXBlIEF1dG9SZWxvYWREZXBlbmRhbnRzID0geyBba2V5OiBzdHJpbmddOiBNb2R1bGVbXSB9XG5leHBvcnQgdHlwZSBDaGFuZ2VIYW5kbGVyID0gKG1vZHVsZTogTW9kdWxlIHwgbnVsbCwgY29uZmlnQ2hhbmdlZDogYm9vbGVhbikgPT4gUHJvbWlzZTx2b2lkPlxuXG4vKlxuICBSZXNvbHZlcyB0byBtb2R1bGVzIGFuZCB0aGVpciBidWlsZCAmIHNlcnZpY2UgZGVwZW5kYW50IG1vZHVsZXMgKHJlY3Vyc2l2ZWx5KS5cbiAgRWFjaCBtb2R1bGUgaXMgcmVwcmVzZW50ZWQgYXQgbW9zdCBvbmNlIGluIHRoZSBvdXRwdXQuXG4qL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdpdGhEZXBlbmRhbnRzKFxuICBnYXJkZW46IEdhcmRlbixcbiAgbW9kdWxlczogTW9kdWxlW10sXG4gIGF1dG9SZWxvYWREZXBlbmRhbnRzOiBBdXRvUmVsb2FkRGVwZW5kYW50cyxcbik6IFByb21pc2U8TW9kdWxlW10+IHtcbiAgY29uc3QgbW9kdWxlU2V0ID0gbmV3IFNldDxzdHJpbmc+KClcblxuICBjb25zdCBzY2FubmVyID0gKG1vZHVsZTogTW9kdWxlKSA9PiB7XG4gICAgbW9kdWxlU2V0LmFkZChtb2R1bGUubmFtZSlcbiAgICBmb3IgKGNvbnN0IGRlcGVuZGFudCBvZiAoYXV0b1JlbG9hZERlcGVuZGFudHNbbW9kdWxlLm5hbWVdIHx8IFtdKSkge1xuICAgICAgaWYgKCFtb2R1bGVTZXQuaGFzKGRlcGVuZGFudC5uYW1lKSkge1xuICAgICAgICBzY2FubmVyKGRlcGVuZGFudClcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBtIG9mIG1vZHVsZXMpIHtcbiAgICBzY2FubmVyKG0pXG4gIH1cblxuICAvLyB3ZSByZXRyaWV2ZSB0aGUgbW9kdWxlcyBhZ2FpbiB0byBiZSBzdXJlIHdlIGhhdmUgdGhlIGxhdGVzdCB2ZXJzaW9uc1xuICByZXR1cm4gZ2FyZGVuLmdldE1vZHVsZXMoQXJyYXkuZnJvbShtb2R1bGVTZXQpKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzKGdhcmRlbjogR2FyZGVuKTogUHJvbWlzZTxBdXRvUmVsb2FkRGVwZW5kYW50cz4ge1xuICBjb25zdCBkZXBlbmRhbnRzID0ge31cblxuICBmb3IgKGNvbnN0IG1vZHVsZSBvZiBhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlcygpKSB7XG4gICAgY29uc3QgZGVwTW9kdWxlczogTW9kdWxlW10gPSBhd2FpdCB1bmlxdWVEZXBlbmRlbmN5TW9kdWxlcyhnYXJkZW4sIG1vZHVsZSlcbiAgICBmb3IgKGNvbnN0IGRlcCBvZiBkZXBNb2R1bGVzKSB7XG4gICAgICBzZXQoZGVwZW5kYW50cywgW2RlcC5uYW1lLCBtb2R1bGUubmFtZV0sIG1vZHVsZSlcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbWFwVmFsdWVzKGRlcGVuZGFudHMsIHZhbHVlcylcbn1cblxuYXN5bmMgZnVuY3Rpb24gdW5pcXVlRGVwZW5kZW5jeU1vZHVsZXMoZ2FyZGVuOiBHYXJkZW4sIG1vZHVsZTogTW9kdWxlKTogUHJvbWlzZTxNb2R1bGVbXT4ge1xuICBjb25zdCBidWlsZERlcHMgPSBtb2R1bGUuYnVpbGQuZGVwZW5kZW5jaWVzLm1hcChkID0+IGdldE1vZHVsZUtleShkLm5hbWUsIGQucGx1Z2luKSlcbiAgY29uc3Qgc2VydmljZURlcHMgPSAoYXdhaXQgZ2FyZGVuLmdldFNlcnZpY2VzKG1vZHVsZS5zZXJ2aWNlRGVwZW5kZW5jeU5hbWVzKSkubWFwKHMgPT4gcy5tb2R1bGUubmFtZSlcbiAgcmV0dXJuIGdhcmRlbi5nZXRNb2R1bGVzKHVuaXEoYnVpbGREZXBzLmNvbmNhdChzZXJ2aWNlRGVwcykpKVxufVxuXG5leHBvcnQgY2xhc3MgRlNXYXRjaGVyIHtcbiAgcHJpdmF0ZSB3YXRjaGVyXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBnYXJkZW46IEdhcmRlbikge1xuICB9XG5cbiAgYXN5bmMgd2F0Y2hNb2R1bGVzKG1vZHVsZXM6IE1vZHVsZVtdLCBjaGFuZ2VIYW5kbGVyOiBDaGFuZ2VIYW5kbGVyKSB7XG5cbiAgICBjb25zdCBwcm9qZWN0Um9vdCA9IHRoaXMuZ2FyZGVuLnByb2plY3RSb290XG4gICAgY29uc3QgaWdub3JlciA9IGF3YWl0IGdldElnbm9yZXIocHJvamVjdFJvb3QpXG5cbiAgICBjb25zdCBvbkZpbGVDaGFuZ2VkID0gdGhpcy5tYWtlRmlsZUNoYW5nZWRIYW5kbGVyKG1vZHVsZXMsIGNoYW5nZUhhbmRsZXIpXG5cbiAgICB0aGlzLndhdGNoZXIgPSB3YXRjaChwcm9qZWN0Um9vdCwge1xuICAgICAgaWdub3JlZDogKHBhdGgsIF8pID0+IHtcbiAgICAgICAgY29uc3QgcmVscGF0aCA9IHJlbGF0aXZlKHByb2plY3RSb290LCBwYXRoKVxuICAgICAgICByZXR1cm4gcmVscGF0aCAmJiBpZ25vcmVyLmlnbm9yZXMocmVscGF0aClcbiAgICAgIH0sXG4gICAgICBpZ25vcmVJbml0aWFsOiB0cnVlLFxuICAgICAgcGVyc2lzdGVudDogdHJ1ZSxcbiAgICB9KVxuXG4gICAgdGhpcy53YXRjaGVyXG4gICAgICAub24oXCJhZGRcIiwgb25GaWxlQ2hhbmdlZClcbiAgICAgIC5vbihcImNoYW5nZVwiLCBvbkZpbGVDaGFuZ2VkKVxuICAgICAgLm9uKFwidW5saW5rXCIsIG9uRmlsZUNoYW5nZWQpXG5cbiAgICB0aGlzLndhdGNoZXJcbiAgICAgIC5vbihcImFkZERpclwiLCBhd2FpdCB0aGlzLm1ha2VEaXJBZGRlZEhhbmRsZXIobW9kdWxlcywgY2hhbmdlSGFuZGxlciwgaWdub3JlcikpXG4gICAgICAub24oXCJ1bmxpbmtEaXJcIiwgdGhpcy5tYWtlRGlyUmVtb3ZlZEhhbmRsZXIobW9kdWxlcywgY2hhbmdlSGFuZGxlcikpXG5cbiAgfVxuXG4gIHByaXZhdGUgbWFrZUZpbGVDaGFuZ2VkSGFuZGxlcihtb2R1bGVzOiBNb2R1bGVbXSwgY2hhbmdlSGFuZGxlcjogQ2hhbmdlSGFuZGxlcikge1xuXG4gICAgcmV0dXJuIGFzeW5jIChmaWxlUGF0aDogc3RyaW5nKSA9PiB7XG5cbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYmFzZW5hbWUoZmlsZVBhdGgpXG4gICAgICBpZiAoZmlsZW5hbWUgPT09IFwiZ2FyZGVuLnltbFwiIHx8IGZpbGVuYW1lID09PSBcIi5naXRpZ25vcmVcIiB8fCBmaWxlbmFtZSA9PT0gXCIuZ2FyZGVuaWdub3JlXCIpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5pbnZhbGlkYXRlQ2FjaGVkRm9yQWxsKClcbiAgICAgICAgcmV0dXJuIGNoYW5nZUhhbmRsZXIobnVsbCwgdHJ1ZSlcbiAgICAgIH1cblxuICAgICAgY29uc3QgY2hhbmdlZE1vZHVsZSA9IG1vZHVsZXMuZmluZChtID0+IGZpbGVQYXRoLnN0YXJ0c1dpdGgobS5wYXRoKSkgfHwgbnVsbFxuXG4gICAgICBpZiAoY2hhbmdlZE1vZHVsZSkge1xuICAgICAgICB0aGlzLmludmFsaWRhdGVDYWNoZWQoY2hhbmdlZE1vZHVsZSlcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGNoYW5nZUhhbmRsZXIoY2hhbmdlZE1vZHVsZSwgZmFsc2UpXG5cbiAgICB9XG5cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbWFrZURpckFkZGVkSGFuZGxlcihtb2R1bGVzOiBNb2R1bGVbXSwgY2hhbmdlSGFuZGxlcjogQ2hhbmdlSGFuZGxlciwgaWdub3Jlcikge1xuXG4gICAgY29uc3Qgc2Nhbk9wdHMgPSB7XG4gICAgICBmaWx0ZXI6IChwYXRoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlbFBhdGggPSByZWxhdGl2ZSh0aGlzLmdhcmRlbi5wcm9qZWN0Um9vdCwgcGF0aClcbiAgICAgICAgcmV0dXJuICFpZ25vcmVyLmlnbm9yZXMocmVsUGF0aClcbiAgICAgIH0sXG4gICAgfVxuXG4gICAgcmV0dXJuIGFzeW5jIChkaXJQYXRoOiBzdHJpbmcpID0+IHtcblxuICAgICAgbGV0IGNvbmZpZ0NoYW5nZWQgPSBmYWxzZVxuXG4gICAgICBmb3IgYXdhaXQgKGNvbnN0IG5vZGUgb2Ygc2NhbkRpcmVjdG9yeShkaXJQYXRoLCBzY2FuT3B0cykpIHtcbiAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwYXJzZShub2RlLnBhdGgpLmJhc2UgPT09IE1PRFVMRV9DT05GSUdfRklMRU5BTUUpIHtcbiAgICAgICAgICBjb25maWdDaGFuZ2VkID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChjb25maWdDaGFuZ2VkKSB7XG4gICAgICAgIC8vIFRoZSBhZGRlZC9yZW1vdmVkIGRpciBjb250YWlucyBvbmUgb3IgbW9yZSBnYXJkZW4ueW1sIGZpbGVzXG4gICAgICAgIGF3YWl0IHRoaXMuaW52YWxpZGF0ZUNhY2hlZEZvckFsbCgpXG4gICAgICAgIHJldHVybiBjaGFuZ2VIYW5kbGVyKG51bGwsIHRydWUpXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGNoYW5nZWRNb2R1bGUgPSBtb2R1bGVzLmZpbmQobSA9PiBkaXJQYXRoLnN0YXJ0c1dpdGgobS5wYXRoKSkgfHwgbnVsbFxuXG4gICAgICBpZiAoY2hhbmdlZE1vZHVsZSkge1xuICAgICAgICB0aGlzLmludmFsaWRhdGVDYWNoZWQoY2hhbmdlZE1vZHVsZSlcbiAgICAgICAgcmV0dXJuIGNoYW5nZUhhbmRsZXIoY2hhbmdlZE1vZHVsZSwgZmFsc2UpXG4gICAgICB9XG5cbiAgICB9XG5cbiAgfVxuXG4gIHByaXZhdGUgbWFrZURpclJlbW92ZWRIYW5kbGVyKG1vZHVsZXM6IE1vZHVsZVtdLCBjaGFuZ2VIYW5kbGVyOiBDaGFuZ2VIYW5kbGVyKSB7XG5cbiAgICByZXR1cm4gYXN5bmMgKGRpclBhdGg6IHN0cmluZykgPT4ge1xuXG4gICAgICBsZXQgY2hhbmdlZE1vZHVsZTogTW9kdWxlIHwgbnVsbCA9IG51bGxcblxuICAgICAgZm9yIChjb25zdCBtb2R1bGUgb2YgbW9kdWxlcykge1xuXG4gICAgICAgIGlmIChtb2R1bGUucGF0aC5zdGFydHNXaXRoKGRpclBhdGgpKSB7XG4gICAgICAgICAgLy8gYXQgbGVhc3Qgb25lIG1vZHVsZSdzIHJvb3QgZGlyIHdhcyByZW1vdmVkXG4gICAgICAgICAgYXdhaXQgdGhpcy5pbnZhbGlkYXRlQ2FjaGVkRm9yQWxsKClcbiAgICAgICAgICByZXR1cm4gY2hhbmdlSGFuZGxlcihudWxsLCB0cnVlKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGRpclBhdGguc3RhcnRzV2l0aChtb2R1bGUucGF0aCkpIHtcbiAgICAgICAgICAvLyByZW1vdmVkIGRpciBpcyBhIHN1YmRpciBvZiBjaGFuZ2VkTW9kdWxlJ3Mgcm9vdCBkaXJcbiAgICAgICAgICBpZiAoIWNoYW5nZWRNb2R1bGUgfHwgbW9kdWxlLnBhdGguc3RhcnRzV2l0aChjaGFuZ2VkTW9kdWxlLnBhdGgpKSB7XG4gICAgICAgICAgICBjaGFuZ2VkTW9kdWxlID0gbW9kdWxlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgIH1cblxuICAgICAgaWYgKGNoYW5nZWRNb2R1bGUpIHtcbiAgICAgICAgdGhpcy5pbnZhbGlkYXRlQ2FjaGVkKGNoYW5nZWRNb2R1bGUpXG4gICAgICAgIHJldHVybiBjaGFuZ2VIYW5kbGVyKGNoYW5nZWRNb2R1bGUsIGZhbHNlKVxuICAgICAgfVxuICAgIH1cblxuICB9XG5cbiAgcHJpdmF0ZSBpbnZhbGlkYXRlQ2FjaGVkKG1vZHVsZTogTW9kdWxlKSB7XG4gICAgLy8gaW52YWxpZGF0ZSB0aGUgY2FjaGUgZm9yIGFueXRoaW5nIGF0dGFjaGVkIHRvIHRoZSBtb2R1bGUgcGF0aCBvciB1cHdhcmRzIGluIHRoZSBkaXJlY3RvcnkgdHJlZVxuICAgIGNvbnN0IGNhY2hlQ29udGV4dCA9IHBhdGhUb0NhY2hlQ29udGV4dChtb2R1bGUucGF0aClcbiAgICB0aGlzLmdhcmRlbi5jYWNoZS5pbnZhbGlkYXRlVXAoY2FjaGVDb250ZXh0KVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBpbnZhbGlkYXRlQ2FjaGVkRm9yQWxsKCkge1xuICAgIGZvciAoY29uc3QgbW9kdWxlIG9mIGF3YWl0IHRoaXMuZ2FyZGVuLmdldE1vZHVsZXMoKSkge1xuICAgICAgdGhpcy5pbnZhbGlkYXRlQ2FjaGVkKG1vZHVsZSlcbiAgICB9XG4gIH1cblxuICBjbG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLndhdGNoZXIuY2xvc2UoKVxuICB9XG5cbn1cbiJdfQ==
