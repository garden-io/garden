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
const bluebird_1 = require("bluebird");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const constants_1 = require("./constants");
const exceptions_1 = require("./exceptions");
const module_1 = require("./types/module");
const lodash_1 = require("lodash");
const execa = require("execa");
const os_1 = require("os");
const util_1 = require("./util/util");
// Lazily construct a directory of modules inside which all build steps are performed.
const buildDirRelPath = path_1.join(constants_1.GARDEN_DIR_NAME, "build");
class BuildDir {
    constructor(projectRoot, buildDirPath) {
        this.projectRoot = projectRoot;
        this.buildDirPath = buildDirPath;
    }
    static factory(projectRoot) {
        return __awaiter(this, void 0, void 0, function* () {
            const buildDirPath = path_1.join(projectRoot, buildDirRelPath);
            yield fs_extra_1.ensureDir(buildDirPath);
            return new BuildDir(projectRoot, buildDirPath);
        });
    }
    syncFromSrc(module) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sync(path_1.resolve(this.projectRoot, module.path) + path_1.sep, yield this.buildPath(module.name));
        });
    }
    syncDependencyProducts(module) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.syncFromSrc(module);
            const buildPath = yield this.buildPath(module.name);
            const buildDependencies = yield module.build.dependencies;
            const dependencyConfigs = module.build.dependencies || [];
            yield bluebird_1.map(lodash_1.zip(buildDependencies, dependencyConfigs), ([sourceModule, depConfig]) => __awaiter(this, void 0, void 0, function* () {
                if (!sourceModule || !depConfig || !depConfig.copy) {
                    return;
                }
                const sourceBuildPath = yield this.buildPath(module_1.getModuleKey(sourceModule.name, sourceModule.plugin));
                // Sync to the module's top-level dir by default.
                yield bluebird_1.map(depConfig.copy, (copy) => {
                    if (path_1.isAbsolute(copy.source)) {
                        throw new exceptions_1.ConfigurationError(`Source path in build dependency copy spec must be a relative path`, {
                            copySpec: copy,
                        });
                    }
                    if (path_1.isAbsolute(copy.target)) {
                        throw new exceptions_1.ConfigurationError(`Target path in build dependency copy spec must be a relative path`, {
                            copySpec: copy,
                        });
                    }
                    const sourcePath = path_1.join(sourceBuildPath, copy.source);
                    const destinationPath = path_1.join(buildPath, copy.target);
                    return this.sync(sourcePath, destinationPath);
                });
            }));
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield fs_extra_1.emptyDir(this.buildDirPath);
        });
    }
    buildPath(moduleName) {
        return __awaiter(this, void 0, void 0, function* () {
            const path = path_1.resolve(this.buildDirPath, moduleName);
            yield fs_extra_1.ensureDir(path);
            return path;
        });
    }
    sync(sourcePath, destinationPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const destinationDir = path_1.parse(destinationPath).dir;
            yield fs_extra_1.ensureDir(destinationDir);
            if (os_1.platform() === "win32") {
                // this is so that the cygwin-based rsync client can deal with the paths
                sourcePath = util_1.toCygwinPath(sourcePath);
                destinationPath = util_1.toCygwinPath(destinationPath);
            }
            // the correct way to copy all contents of a folder is using a trailing slash and not a wildcard
            sourcePath = stripWildcard(sourcePath);
            destinationPath = stripWildcard(destinationPath);
            yield execa("rsync", ["-rptgo", sourcePath, destinationPath]);
        });
    }
}
exports.BuildDir = BuildDir;
function stripWildcard(path) {
    return path.endsWith("/*") ? path.slice(0, -1) : path;
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFBO0FBQ3ZELENBQUMiLCJmaWxlIjoiYnVpbGQtZGlyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IG1hcCBhcyBibHVlYmlyZE1hcCB9IGZyb20gXCJibHVlYmlyZFwiXG5pbXBvcnQge1xuICBpc0Fic29sdXRlLFxuICBqb2luLFxuICBwYXJzZSxcbiAgcmVzb2x2ZSxcbiAgc2VwLFxufSBmcm9tIFwicGF0aFwiXG5pbXBvcnQge1xuICBlbXB0eURpcixcbiAgZW5zdXJlRGlyLFxufSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IHsgR0FSREVOX0RJUl9OQU1FIH0gZnJvbSBcIi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25FcnJvciB9IGZyb20gXCIuL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHtcbiAgQnVpbGRDb3B5U3BlYyxcbiAgTW9kdWxlLFxuICBnZXRNb2R1bGVLZXksXG59IGZyb20gXCIuL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyB6aXAgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCAqIGFzIGV4ZWNhIGZyb20gXCJleGVjYVwiXG5pbXBvcnQgeyBwbGF0Zm9ybSB9IGZyb20gXCJvc1wiXG5pbXBvcnQgeyB0b0N5Z3dpblBhdGggfSBmcm9tIFwiLi91dGlsL3V0aWxcIlxuXG4vLyBMYXppbHkgY29uc3RydWN0IGEgZGlyZWN0b3J5IG9mIG1vZHVsZXMgaW5zaWRlIHdoaWNoIGFsbCBidWlsZCBzdGVwcyBhcmUgcGVyZm9ybWVkLlxuXG5jb25zdCBidWlsZERpclJlbFBhdGggPSBqb2luKEdBUkRFTl9ESVJfTkFNRSwgXCJidWlsZFwiKVxuXG5leHBvcnQgY2xhc3MgQnVpbGREaXIge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHByb2plY3RSb290OiBzdHJpbmcsIHB1YmxpYyBidWlsZERpclBhdGg6IHN0cmluZykgeyB9XG5cbiAgc3RhdGljIGFzeW5jIGZhY3RvcnkocHJvamVjdFJvb3Q6IHN0cmluZykge1xuICAgIGNvbnN0IGJ1aWxkRGlyUGF0aCA9IGpvaW4ocHJvamVjdFJvb3QsIGJ1aWxkRGlyUmVsUGF0aClcbiAgICBhd2FpdCBlbnN1cmVEaXIoYnVpbGREaXJQYXRoKVxuICAgIHJldHVybiBuZXcgQnVpbGREaXIocHJvamVjdFJvb3QsIGJ1aWxkRGlyUGF0aClcbiAgfVxuXG4gIGFzeW5jIHN5bmNGcm9tU3JjKG1vZHVsZTogTW9kdWxlKSB7XG4gICAgYXdhaXQgdGhpcy5zeW5jKFxuICAgICAgcmVzb2x2ZSh0aGlzLnByb2plY3RSb290LCBtb2R1bGUucGF0aCkgKyBzZXAsXG4gICAgICBhd2FpdCB0aGlzLmJ1aWxkUGF0aChtb2R1bGUubmFtZSksXG4gICAgKVxuICB9XG5cbiAgYXN5bmMgc3luY0RlcGVuZGVuY3lQcm9kdWN0cyhtb2R1bGU6IE1vZHVsZSkge1xuICAgIGF3YWl0IHRoaXMuc3luY0Zyb21TcmMobW9kdWxlKVxuICAgIGNvbnN0IGJ1aWxkUGF0aCA9IGF3YWl0IHRoaXMuYnVpbGRQYXRoKG1vZHVsZS5uYW1lKVxuICAgIGNvbnN0IGJ1aWxkRGVwZW5kZW5jaWVzID0gYXdhaXQgbW9kdWxlLmJ1aWxkLmRlcGVuZGVuY2llc1xuICAgIGNvbnN0IGRlcGVuZGVuY3lDb25maWdzID0gbW9kdWxlLmJ1aWxkLmRlcGVuZGVuY2llcyB8fCBbXVxuXG4gICAgYXdhaXQgYmx1ZWJpcmRNYXAoemlwKGJ1aWxkRGVwZW5kZW5jaWVzLCBkZXBlbmRlbmN5Q29uZmlncyksIGFzeW5jIChbc291cmNlTW9kdWxlLCBkZXBDb25maWddKSA9PiB7XG4gICAgICBpZiAoIXNvdXJjZU1vZHVsZSB8fCAhZGVwQ29uZmlnIHx8ICFkZXBDb25maWcuY29weSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3Qgc291cmNlQnVpbGRQYXRoID0gYXdhaXQgdGhpcy5idWlsZFBhdGgoZ2V0TW9kdWxlS2V5KHNvdXJjZU1vZHVsZS5uYW1lLCBzb3VyY2VNb2R1bGUucGx1Z2luKSlcblxuICAgICAgLy8gU3luYyB0byB0aGUgbW9kdWxlJ3MgdG9wLWxldmVsIGRpciBieSBkZWZhdWx0LlxuICAgICAgYXdhaXQgYmx1ZWJpcmRNYXAoZGVwQ29uZmlnLmNvcHksIChjb3B5OiBCdWlsZENvcHlTcGVjKSA9PiB7XG4gICAgICAgIGlmIChpc0Fic29sdXRlKGNvcHkuc291cmNlKSkge1xuICAgICAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoYFNvdXJjZSBwYXRoIGluIGJ1aWxkIGRlcGVuZGVuY3kgY29weSBzcGVjIG11c3QgYmUgYSByZWxhdGl2ZSBwYXRoYCwge1xuICAgICAgICAgICAgY29weVNwZWM6IGNvcHksXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0Fic29sdXRlKGNvcHkudGFyZ2V0KSkge1xuICAgICAgICAgIHRocm93IG5ldyBDb25maWd1cmF0aW9uRXJyb3IoYFRhcmdldCBwYXRoIGluIGJ1aWxkIGRlcGVuZGVuY3kgY29weSBzcGVjIG11c3QgYmUgYSByZWxhdGl2ZSBwYXRoYCwge1xuICAgICAgICAgICAgY29weVNwZWM6IGNvcHksXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNvdXJjZVBhdGggPSBqb2luKHNvdXJjZUJ1aWxkUGF0aCwgY29weS5zb3VyY2UpXG4gICAgICAgIGNvbnN0IGRlc3RpbmF0aW9uUGF0aCA9IGpvaW4oYnVpbGRQYXRoLCBjb3B5LnRhcmdldClcbiAgICAgICAgcmV0dXJuIHRoaXMuc3luYyhzb3VyY2VQYXRoLCBkZXN0aW5hdGlvblBhdGgpXG4gICAgICB9KVxuICAgIH0pXG4gIH1cblxuICBhc3luYyBjbGVhcigpIHtcbiAgICBhd2FpdCBlbXB0eURpcih0aGlzLmJ1aWxkRGlyUGF0aClcbiAgfVxuXG4gIGFzeW5jIGJ1aWxkUGF0aChtb2R1bGVOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHBhdGggPSByZXNvbHZlKHRoaXMuYnVpbGREaXJQYXRoLCBtb2R1bGVOYW1lKVxuICAgIGF3YWl0IGVuc3VyZURpcihwYXRoKVxuICAgIHJldHVybiBwYXRoXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN5bmMoc291cmNlUGF0aDogc3RyaW5nLCBkZXN0aW5hdGlvblBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uRGlyID0gcGFyc2UoZGVzdGluYXRpb25QYXRoKS5kaXJcbiAgICBhd2FpdCBlbnN1cmVEaXIoZGVzdGluYXRpb25EaXIpXG5cbiAgICBpZiAocGxhdGZvcm0oKSA9PT0gXCJ3aW4zMlwiKSB7XG4gICAgICAvLyB0aGlzIGlzIHNvIHRoYXQgdGhlIGN5Z3dpbi1iYXNlZCByc3luYyBjbGllbnQgY2FuIGRlYWwgd2l0aCB0aGUgcGF0aHNcbiAgICAgIHNvdXJjZVBhdGggPSB0b0N5Z3dpblBhdGgoc291cmNlUGF0aClcbiAgICAgIGRlc3RpbmF0aW9uUGF0aCA9IHRvQ3lnd2luUGF0aChkZXN0aW5hdGlvblBhdGgpXG4gICAgfVxuXG4gICAgLy8gdGhlIGNvcnJlY3Qgd2F5IHRvIGNvcHkgYWxsIGNvbnRlbnRzIG9mIGEgZm9sZGVyIGlzIHVzaW5nIGEgdHJhaWxpbmcgc2xhc2ggYW5kIG5vdCBhIHdpbGRjYXJkXG4gICAgc291cmNlUGF0aCA9IHN0cmlwV2lsZGNhcmQoc291cmNlUGF0aClcbiAgICBkZXN0aW5hdGlvblBhdGggPSBzdHJpcFdpbGRjYXJkKGRlc3RpbmF0aW9uUGF0aClcblxuICAgIGF3YWl0IGV4ZWNhKFwicnN5bmNcIiwgW1wiLXJwdGdvXCIsIHNvdXJjZVBhdGgsIGRlc3RpbmF0aW9uUGF0aF0pXG4gIH1cbn1cblxuZnVuY3Rpb24gc3RyaXBXaWxkY2FyZChwYXRoOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhdGguZW5kc1dpdGgoXCIvKlwiKSA/IHBhdGguc2xpY2UoMCwgLTEpIDogcGF0aFxufVxuIl19
