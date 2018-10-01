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
const Bluebird = require("bluebird");
const lodash_1 = require("lodash");
const crypto_1 = require("crypto");
const Joi = require("joi");
const common_1 = require("../config/common");
const path_1 = require("path");
const constants_1 = require("../constants");
const fs_extra_1 = require("fs-extra");
const exceptions_1 = require("../exceptions");
const ext_source_util_1 = require("../util/ext-source-util");
exports.NEW_MODULE_VERSION = "0000000000";
const versionStringSchema = Joi.string()
    .required()
    .description("String representation of the module version.");
const dirtyTimestampSchema = Joi.number()
    .allow(null)
    .required()
    .description("Set to the last modified time (as UNIX timestamp) if the module contains uncommitted changes, otherwise null.");
exports.treeVersionSchema = Joi.object()
    .keys({
    latestCommit: Joi.string()
        .required()
        .description("The latest commit hash of the module source."),
    dirtyTimestamp: dirtyTimestampSchema,
});
exports.moduleVersionSchema = Joi.object()
    .keys({
    versionString: versionStringSchema,
    dirtyTimestamp: dirtyTimestampSchema,
    dependencyVersions: Joi.object()
        .pattern(/.+/, exports.treeVersionSchema)
        .default(() => ({}), "{}")
        .description("The version of each of the dependencies of the module."),
});
class VcsHandler {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
    }
    resolveTreeVersion(path) {
        return __awaiter(this, void 0, void 0, function* () {
            // the version file is used internally to specify versions outside of source control
            const versionFilePath = path_1.join(path, constants_1.GARDEN_VERSIONFILE_NAME);
            const fileVersion = yield readTreeVersionFile(versionFilePath);
            return fileVersion || this.getTreeVersion(path);
        });
    }
    resolveVersion(moduleConfig, dependencies) {
        return __awaiter(this, void 0, void 0, function* () {
            const treeVersion = yield this.resolveTreeVersion(moduleConfig.path);
            common_1.validate(treeVersion, exports.treeVersionSchema, {
                context: `${this.name} tree version for module at ${moduleConfig.path}`,
            });
            if (dependencies.length === 0) {
                return {
                    versionString: getVersionString(treeVersion),
                    dirtyTimestamp: treeVersion.dirtyTimestamp,
                    dependencyVersions: {},
                };
            }
            const namedDependencyVersions = yield Bluebird.map(dependencies, (m) => __awaiter(this, void 0, void 0, function* () { return (Object.assign({ name: m.name }, yield this.resolveTreeVersion(m.path))); }));
            const dependencyVersions = lodash_1.mapValues(lodash_1.keyBy(namedDependencyVersions, "name"), v => lodash_1.omit(v, "name"));
            // keep the module at the top of the chain, dependencies sorted by name
            const sortedDependencies = lodash_1.sortBy(namedDependencyVersions, "name");
            const allVersions = [Object.assign({ name: moduleConfig.name }, treeVersion)].concat(sortedDependencies);
            const dirtyVersions = allVersions.filter(v => !!v.dirtyTimestamp);
            if (dirtyVersions.length > 0) {
                // if any modules are dirty, we resolve with the one(s) with the most recent timestamp
                const latestDirty = [];
                for (const v of lodash_1.orderBy(dirtyVersions, "dirtyTimestamp", "desc")) {
                    if (latestDirty.length === 0 || v.dirtyTimestamp === latestDirty[0].dirtyTimestamp) {
                        latestDirty.push(v);
                    }
                    else {
                        break;
                    }
                }
                const dirtyTimestamp = latestDirty[0].dirtyTimestamp;
                if (latestDirty.length > 1) {
                    // if the last modified timestamp is common across multiple modules, hash their versions
                    const versionString = `${hashVersions(latestDirty)}-${dirtyTimestamp}`;
                    return {
                        versionString,
                        dirtyTimestamp,
                        dependencyVersions,
                    };
                }
                else {
                    // if there's just one module that was most recently modified, return that version
                    return {
                        versionString: getVersionString(latestDirty[0]),
                        dirtyTimestamp,
                        dependencyVersions,
                    };
                }
            }
            else {
                // otherwise derive the version from all the modules
                const versionString = hashVersions(allVersions);
                return {
                    versionString,
                    dirtyTimestamp: null,
                    dependencyVersions,
                };
            }
        });
    }
    getRemoteSourcesDirname(type) {
        return ext_source_util_1.getRemoteSourcesDirname(type);
    }
    getRemoteSourcePath(name, url, sourceType) {
        return ext_source_util_1.getRemoteSourcePath({ name, url, sourceType });
    }
}
exports.VcsHandler = VcsHandler;
function hashVersions(versions) {
    const versionHash = crypto_1.createHash("sha256");
    versionHash.update(versions.map(v => `${v.name}_${v.latestCommit}`).join("."));
    // this format is kinda arbitrary, but prefixing the "v" is useful to visually spot hashed versions
    return "v" + versionHash.digest("hex").slice(0, 10);
}
function readVersionFile(path, schema) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield fs_extra_1.pathExists(path))) {
            return null;
        }
        // this is used internally to specify version outside of source control
        const versionFileContents = (yield fs_extra_1.readFile(path)).toString().trim();
        if (!versionFileContents) {
            return null;
        }
        try {
            return common_1.validate(JSON.parse(versionFileContents), schema);
        }
        catch (error) {
            throw new exceptions_1.ConfigurationError(`Unable to parse ${path} as valid version file`, {
                path,
                versionFileContents,
                error,
            });
        }
    });
}
function readTreeVersionFile(path) {
    return __awaiter(this, void 0, void 0, function* () {
        return readVersionFile(path, exports.treeVersionSchema);
    });
}
exports.readTreeVersionFile = readTreeVersionFile;
function writeTreeVersionFile(path, version) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs_extra_1.writeFile(path, JSON.stringify(version));
    });
}
exports.writeTreeVersionFile = writeTreeVersionFile;
function readModuleVersionFile(path) {
    return __awaiter(this, void 0, void 0, function* () {
        return readVersionFile(path, exports.moduleVersionSchema);
    });
}
exports.readModuleVersionFile = readModuleVersionFile;
function writeModuleVersionFile(path, version) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs_extra_1.writeFile(path, JSON.stringify(version));
    });
}
exports.writeModuleVersionFile = writeModuleVersionFile;
function getVersionString(treeVersion) {
    return treeVersion.dirtyTimestamp
        ? `${treeVersion.latestCommit}-${treeVersion.dirtyTimestamp}`
        : treeVersion.latestCommit;
}
exports.getVersionString = getVersionString;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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RUFBRSxPQUFzQjs7UUFDL0UsTUFBTSxvQkFBUyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7SUFDaEQsQ0FBQztDQUFBO0FBRkQsd0RBRUM7QUFFRCxTQUFnQixnQkFBZ0IsQ0FBQyxXQUF3QjtJQUN2RCxPQUFPLFdBQVcsQ0FBQyxjQUFjO1FBQy9CLENBQUMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxZQUFZLElBQUksV0FBVyxDQUFDLGNBQWMsRUFBRTtRQUM3RCxDQUFDLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQTtBQUM5QixDQUFDO0FBSkQsNENBSUMiLCJmaWxlIjoidmNzL2Jhc2UuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCB7IG1hcFZhbHVlcywga2V5QnksIHNvcnRCeSwgb3JkZXJCeSwgb21pdCB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gXCJjcnlwdG9cIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IHsgdmFsaWRhdGUgfSBmcm9tIFwiLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcInBhdGhcIlxuaW1wb3J0IHsgR0FSREVOX1ZFUlNJT05GSUxFX05BTUUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcbmltcG9ydCB7IHBhdGhFeGlzdHMsIHJlYWRGaWxlLCB3cml0ZUZpbGUgfSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHtcbiAgRXh0ZXJuYWxTb3VyY2VUeXBlLFxuICBnZXRSZW1vdGVTb3VyY2VzRGlybmFtZSxcbiAgZ2V0UmVtb3RlU291cmNlUGF0aCxcbn0gZnJvbSBcIi4uL3V0aWwvZXh0LXNvdXJjZS11dGlsXCJcbmltcG9ydCB7IE1vZHVsZUNvbmZpZyB9IGZyb20gXCIuLi9jb25maWcvbW9kdWxlXCJcbmltcG9ydCB7IExvZ05vZGUgfSBmcm9tIFwiLi4vbG9nZ2VyL2xvZy1ub2RlXCJcblxuZXhwb3J0IGNvbnN0IE5FV19NT0RVTEVfVkVSU0lPTiA9IFwiMDAwMDAwMDAwMFwiXG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJlZVZlcnNpb24ge1xuICBsYXRlc3RDb21taXQ6IHN0cmluZ1xuICBkaXJ0eVRpbWVzdGFtcDogbnVtYmVyIHwgbnVsbFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRyZWVWZXJzaW9ucyB7IFttb2R1bGVOYW1lOiBzdHJpbmddOiBUcmVlVmVyc2lvbiB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kdWxlVmVyc2lvbiB7XG4gIHZlcnNpb25TdHJpbmc6IHN0cmluZ1xuICBkaXJ0eVRpbWVzdGFtcDogbnVtYmVyIHwgbnVsbFxuICBkZXBlbmRlbmN5VmVyc2lvbnM6IFRyZWVWZXJzaW9uc1xufVxuXG5pbnRlcmZhY2UgTmFtZWRUcmVlVmVyc2lvbiBleHRlbmRzIFRyZWVWZXJzaW9uIHtcbiAgbmFtZTogc3RyaW5nXG59XG5cbmNvbnN0IHZlcnNpb25TdHJpbmdTY2hlbWEgPSBKb2kuc3RyaW5nKClcbiAgLnJlcXVpcmVkKClcbiAgLmRlc2NyaXB0aW9uKFwiU3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBtb2R1bGUgdmVyc2lvbi5cIilcblxuY29uc3QgZGlydHlUaW1lc3RhbXBTY2hlbWEgPSBKb2kubnVtYmVyKClcbiAgLmFsbG93KG51bGwpXG4gIC5yZXF1aXJlZCgpXG4gIC5kZXNjcmlwdGlvbihcbiAgICBcIlNldCB0byB0aGUgbGFzdCBtb2RpZmllZCB0aW1lIChhcyBVTklYIHRpbWVzdGFtcCkgaWYgdGhlIG1vZHVsZSBjb250YWlucyB1bmNvbW1pdHRlZCBjaGFuZ2VzLCBvdGhlcndpc2UgbnVsbC5cIixcbiAgKVxuXG5leHBvcnQgY29uc3QgdHJlZVZlcnNpb25TY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIGxhdGVzdENvbW1pdDogSm9pLnN0cmluZygpXG4gICAgICAucmVxdWlyZWQoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIGxhdGVzdCBjb21taXQgaGFzaCBvZiB0aGUgbW9kdWxlIHNvdXJjZS5cIiksXG4gICAgZGlydHlUaW1lc3RhbXA6IGRpcnR5VGltZXN0YW1wU2NoZW1hLFxuICB9KVxuXG5leHBvcnQgY29uc3QgbW9kdWxlVmVyc2lvblNjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgdmVyc2lvblN0cmluZzogdmVyc2lvblN0cmluZ1NjaGVtYSxcbiAgICBkaXJ0eVRpbWVzdGFtcDogZGlydHlUaW1lc3RhbXBTY2hlbWEsXG4gICAgZGVwZW5kZW5jeVZlcnNpb25zOiBKb2kub2JqZWN0KClcbiAgICAgIC5wYXR0ZXJuKC8uKy8sIHRyZWVWZXJzaW9uU2NoZW1hKVxuICAgICAgLmRlZmF1bHQoKCkgPT4gKHt9KSwgXCJ7fVwiKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIHZlcnNpb24gb2YgZWFjaCBvZiB0aGUgZGVwZW5kZW5jaWVzIG9mIHRoZSBtb2R1bGUuXCIpLFxuICB9KVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlbW90ZVNvdXJjZVBhcmFtcyB7XG4gIHVybDogc3RyaW5nLFxuICBuYW1lOiBzdHJpbmcsXG4gIHNvdXJjZVR5cGU6IEV4dGVybmFsU291cmNlVHlwZSxcbiAgbG9nRW50cnk6IExvZ05vZGUsXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBWY3NIYW5kbGVyIHtcbiAgY29uc3RydWN0b3IocHJvdGVjdGVkIHByb2plY3RSb290OiBzdHJpbmcpIHsgfVxuXG4gIGFic3RyYWN0IG5hbWU6IHN0cmluZ1xuICBhYnN0cmFjdCBhc3luYyBnZXRUcmVlVmVyc2lvbihwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRyZWVWZXJzaW9uPlxuICBhYnN0cmFjdCBhc3luYyBlbnN1cmVSZW1vdGVTb3VyY2UocGFyYW1zOiBSZW1vdGVTb3VyY2VQYXJhbXMpOiBQcm9taXNlPHN0cmluZz5cbiAgYWJzdHJhY3QgYXN5bmMgdXBkYXRlUmVtb3RlU291cmNlKHBhcmFtczogUmVtb3RlU291cmNlUGFyYW1zKVxuXG4gIGFzeW5jIHJlc29sdmVUcmVlVmVyc2lvbihwYXRoOiBzdHJpbmcpOiBQcm9taXNlPFRyZWVWZXJzaW9uPiB7XG4gICAgLy8gdGhlIHZlcnNpb24gZmlsZSBpcyB1c2VkIGludGVybmFsbHkgdG8gc3BlY2lmeSB2ZXJzaW9ucyBvdXRzaWRlIG9mIHNvdXJjZSBjb250cm9sXG4gICAgY29uc3QgdmVyc2lvbkZpbGVQYXRoID0gam9pbihwYXRoLCBHQVJERU5fVkVSU0lPTkZJTEVfTkFNRSlcbiAgICBjb25zdCBmaWxlVmVyc2lvbiA9IGF3YWl0IHJlYWRUcmVlVmVyc2lvbkZpbGUodmVyc2lvbkZpbGVQYXRoKVxuICAgIHJldHVybiBmaWxlVmVyc2lvbiB8fCB0aGlzLmdldFRyZWVWZXJzaW9uKHBhdGgpXG4gIH1cblxuICBhc3luYyByZXNvbHZlVmVyc2lvbihtb2R1bGVDb25maWc6IE1vZHVsZUNvbmZpZywgZGVwZW5kZW5jaWVzOiBNb2R1bGVDb25maWdbXSk6IFByb21pc2U8TW9kdWxlVmVyc2lvbj4ge1xuICAgIGNvbnN0IHRyZWVWZXJzaW9uID0gYXdhaXQgdGhpcy5yZXNvbHZlVHJlZVZlcnNpb24obW9kdWxlQ29uZmlnLnBhdGgpXG5cbiAgICB2YWxpZGF0ZSh0cmVlVmVyc2lvbiwgdHJlZVZlcnNpb25TY2hlbWEsIHtcbiAgICAgIGNvbnRleHQ6IGAke3RoaXMubmFtZX0gdHJlZSB2ZXJzaW9uIGZvciBtb2R1bGUgYXQgJHttb2R1bGVDb25maWcucGF0aH1gLFxuICAgIH0pXG5cbiAgICBpZiAoZGVwZW5kZW5jaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmVyc2lvblN0cmluZzogZ2V0VmVyc2lvblN0cmluZyh0cmVlVmVyc2lvbiksXG4gICAgICAgIGRpcnR5VGltZXN0YW1wOiB0cmVlVmVyc2lvbi5kaXJ0eVRpbWVzdGFtcCxcbiAgICAgICAgZGVwZW5kZW5jeVZlcnNpb25zOiB7fSxcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBuYW1lZERlcGVuZGVuY3lWZXJzaW9ucyA9IGF3YWl0IEJsdWViaXJkLm1hcChcbiAgICAgIGRlcGVuZGVuY2llcyxcbiAgICAgIGFzeW5jIChtOiBNb2R1bGVDb25maWcpID0+ICh7IG5hbWU6IG0ubmFtZSwgLi4uYXdhaXQgdGhpcy5yZXNvbHZlVHJlZVZlcnNpb24obS5wYXRoKSB9KSxcbiAgICApXG4gICAgY29uc3QgZGVwZW5kZW5jeVZlcnNpb25zID0gbWFwVmFsdWVzKGtleUJ5KG5hbWVkRGVwZW5kZW5jeVZlcnNpb25zLCBcIm5hbWVcIiksIHYgPT4gb21pdCh2LCBcIm5hbWVcIikpXG5cbiAgICAvLyBrZWVwIHRoZSBtb2R1bGUgYXQgdGhlIHRvcCBvZiB0aGUgY2hhaW4sIGRlcGVuZGVuY2llcyBzb3J0ZWQgYnkgbmFtZVxuICAgIGNvbnN0IHNvcnRlZERlcGVuZGVuY2llcyA9IHNvcnRCeShuYW1lZERlcGVuZGVuY3lWZXJzaW9ucywgXCJuYW1lXCIpXG4gICAgY29uc3QgYWxsVmVyc2lvbnM6IE5hbWVkVHJlZVZlcnNpb25bXSA9IFt7IG5hbWU6IG1vZHVsZUNvbmZpZy5uYW1lLCAuLi50cmVlVmVyc2lvbiB9XS5jb25jYXQoc29ydGVkRGVwZW5kZW5jaWVzKVxuXG4gICAgY29uc3QgZGlydHlWZXJzaW9ucyA9IGFsbFZlcnNpb25zLmZpbHRlcih2ID0+ICEhdi5kaXJ0eVRpbWVzdGFtcClcblxuICAgIGlmIChkaXJ0eVZlcnNpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGlmIGFueSBtb2R1bGVzIGFyZSBkaXJ0eSwgd2UgcmVzb2x2ZSB3aXRoIHRoZSBvbmUocykgd2l0aCB0aGUgbW9zdCByZWNlbnQgdGltZXN0YW1wXG4gICAgICBjb25zdCBsYXRlc3REaXJ0eTogTmFtZWRUcmVlVmVyc2lvbltdID0gW11cblxuICAgICAgZm9yIChjb25zdCB2IG9mIG9yZGVyQnkoZGlydHlWZXJzaW9ucywgXCJkaXJ0eVRpbWVzdGFtcFwiLCBcImRlc2NcIikpIHtcbiAgICAgICAgaWYgKGxhdGVzdERpcnR5Lmxlbmd0aCA9PT0gMCB8fCB2LmRpcnR5VGltZXN0YW1wID09PSBsYXRlc3REaXJ0eVswXS5kaXJ0eVRpbWVzdGFtcCkge1xuICAgICAgICAgIGxhdGVzdERpcnR5LnB1c2godilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRpcnR5VGltZXN0YW1wID0gbGF0ZXN0RGlydHlbMF0uZGlydHlUaW1lc3RhbXBcblxuICAgICAgaWYgKGxhdGVzdERpcnR5Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgLy8gaWYgdGhlIGxhc3QgbW9kaWZpZWQgdGltZXN0YW1wIGlzIGNvbW1vbiBhY3Jvc3MgbXVsdGlwbGUgbW9kdWxlcywgaGFzaCB0aGVpciB2ZXJzaW9uc1xuICAgICAgICBjb25zdCB2ZXJzaW9uU3RyaW5nID0gYCR7aGFzaFZlcnNpb25zKGxhdGVzdERpcnR5KX0tJHtkaXJ0eVRpbWVzdGFtcH1gXG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2ZXJzaW9uU3RyaW5nLFxuICAgICAgICAgIGRpcnR5VGltZXN0YW1wLFxuICAgICAgICAgIGRlcGVuZGVuY3lWZXJzaW9ucyxcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gaWYgdGhlcmUncyBqdXN0IG9uZSBtb2R1bGUgdGhhdCB3YXMgbW9zdCByZWNlbnRseSBtb2RpZmllZCwgcmV0dXJuIHRoYXQgdmVyc2lvblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZlcnNpb25TdHJpbmc6IGdldFZlcnNpb25TdHJpbmcobGF0ZXN0RGlydHlbMF0pLFxuICAgICAgICAgIGRpcnR5VGltZXN0YW1wLFxuICAgICAgICAgIGRlcGVuZGVuY3lWZXJzaW9ucyxcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBvdGhlcndpc2UgZGVyaXZlIHRoZSB2ZXJzaW9uIGZyb20gYWxsIHRoZSBtb2R1bGVzXG4gICAgICBjb25zdCB2ZXJzaW9uU3RyaW5nID0gaGFzaFZlcnNpb25zKGFsbFZlcnNpb25zKVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICB2ZXJzaW9uU3RyaW5nLFxuICAgICAgICBkaXJ0eVRpbWVzdGFtcDogbnVsbCxcbiAgICAgICAgZGVwZW5kZW5jeVZlcnNpb25zLFxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldFJlbW90ZVNvdXJjZXNEaXJuYW1lKHR5cGU6IEV4dGVybmFsU291cmNlVHlwZSkge1xuICAgIHJldHVybiBnZXRSZW1vdGVTb3VyY2VzRGlybmFtZSh0eXBlKVxuICB9XG5cbiAgZ2V0UmVtb3RlU291cmNlUGF0aChuYW1lLCB1cmwsIHNvdXJjZVR5cGUpIHtcbiAgICByZXR1cm4gZ2V0UmVtb3RlU291cmNlUGF0aCh7IG5hbWUsIHVybCwgc291cmNlVHlwZSB9KVxuICB9XG59XG5cbmZ1bmN0aW9uIGhhc2hWZXJzaW9ucyh2ZXJzaW9uczogTmFtZWRUcmVlVmVyc2lvbltdKSB7XG4gIGNvbnN0IHZlcnNpb25IYXNoID0gY3JlYXRlSGFzaChcInNoYTI1NlwiKVxuICB2ZXJzaW9uSGFzaC51cGRhdGUodmVyc2lvbnMubWFwKHYgPT4gYCR7di5uYW1lfV8ke3YubGF0ZXN0Q29tbWl0fWApLmpvaW4oXCIuXCIpKVxuICAvLyB0aGlzIGZvcm1hdCBpcyBraW5kYSBhcmJpdHJhcnksIGJ1dCBwcmVmaXhpbmcgdGhlIFwidlwiIGlzIHVzZWZ1bCB0byB2aXN1YWxseSBzcG90IGhhc2hlZCB2ZXJzaW9uc1xuICByZXR1cm4gXCJ2XCIgKyB2ZXJzaW9uSGFzaC5kaWdlc3QoXCJoZXhcIikuc2xpY2UoMCwgMTApXG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRWZXJzaW9uRmlsZShwYXRoOiBzdHJpbmcsIHNjaGVtYSk6IFByb21pc2U8YW55PiB7XG4gIGlmICghKGF3YWl0IHBhdGhFeGlzdHMocGF0aCkpKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIC8vIHRoaXMgaXMgdXNlZCBpbnRlcm5hbGx5IHRvIHNwZWNpZnkgdmVyc2lvbiBvdXRzaWRlIG9mIHNvdXJjZSBjb250cm9sXG4gIGNvbnN0IHZlcnNpb25GaWxlQ29udGVudHMgPSAoYXdhaXQgcmVhZEZpbGUocGF0aCkpLnRvU3RyaW5nKCkudHJpbSgpXG5cbiAgaWYgKCF2ZXJzaW9uRmlsZUNvbnRlbnRzKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIHRyeSB7XG4gICAgcmV0dXJuIHZhbGlkYXRlKEpTT04ucGFyc2UodmVyc2lvbkZpbGVDb250ZW50cyksIHNjaGVtYSlcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgQ29uZmlndXJhdGlvbkVycm9yKFxuICAgICAgYFVuYWJsZSB0byBwYXJzZSAke3BhdGh9IGFzIHZhbGlkIHZlcnNpb24gZmlsZWAsXG4gICAgICB7XG4gICAgICAgIHBhdGgsXG4gICAgICAgIHZlcnNpb25GaWxlQ29udGVudHMsXG4gICAgICAgIGVycm9yLFxuICAgICAgfSxcbiAgICApXG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRUcmVlVmVyc2lvbkZpbGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTxUcmVlVmVyc2lvbiB8IG51bGw+IHtcbiAgcmV0dXJuIHJlYWRWZXJzaW9uRmlsZShwYXRoLCB0cmVlVmVyc2lvblNjaGVtYSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHdyaXRlVHJlZVZlcnNpb25GaWxlKHBhdGg6IHN0cmluZywgdmVyc2lvbjogVHJlZVZlcnNpb24pIHtcbiAgYXdhaXQgd3JpdGVGaWxlKHBhdGgsIEpTT04uc3RyaW5naWZ5KHZlcnNpb24pKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZE1vZHVsZVZlcnNpb25GaWxlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8TW9kdWxlVmVyc2lvbiB8IG51bGw+IHtcbiAgcmV0dXJuIHJlYWRWZXJzaW9uRmlsZShwYXRoLCBtb2R1bGVWZXJzaW9uU2NoZW1hKVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd3JpdGVNb2R1bGVWZXJzaW9uRmlsZShwYXRoOiBzdHJpbmcsIHZlcnNpb246IE1vZHVsZVZlcnNpb24pIHtcbiAgYXdhaXQgd3JpdGVGaWxlKHBhdGgsIEpTT04uc3RyaW5naWZ5KHZlcnNpb24pKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmVyc2lvblN0cmluZyh0cmVlVmVyc2lvbjogVHJlZVZlcnNpb24pIHtcbiAgcmV0dXJuIHRyZWVWZXJzaW9uLmRpcnR5VGltZXN0YW1wXG4gICAgPyBgJHt0cmVlVmVyc2lvbi5sYXRlc3RDb21taXR9LSR7dHJlZVZlcnNpb24uZGlydHlUaW1lc3RhbXB9YFxuICAgIDogdHJlZVZlcnNpb24ubGF0ZXN0Q29tbWl0XG59XG4iXX0=
