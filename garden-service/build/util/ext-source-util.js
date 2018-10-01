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
const crypto_1 = require("crypto");
const lodash_1 = require("lodash");
const chalk_1 = require("chalk");
const pathIsInside = require("path-is-inside");
const constants_1 = require("../constants");
const config_store_1 = require("../config-store");
const exceptions_1 = require("../exceptions");
const path_1 = require("path");
function getRemoteSourcesDirname(type) {
    return type === "project" ? constants_1.PROJECT_SOURCES_DIR_NAME : constants_1.MODULE_SOURCES_DIR_NAME;
}
exports.getRemoteSourcesDirname = getRemoteSourcesDirname;
/**
 * A remote source dir name has the format 'source-name--HASH_OF_REPO_URL'
 * so that we can detect if the repo url has changed
 */
function getRemoteSourcePath({ name, url, sourceType }) {
    const dirname = name + "--" + hashRepoUrl(url);
    return path_1.join(getRemoteSourcesDirname(sourceType), dirname);
}
exports.getRemoteSourcePath = getRemoteSourcePath;
function hashRepoUrl(url) {
    const urlHash = crypto_1.createHash("sha256");
    urlHash.update(url);
    return urlHash.digest("hex").slice(0, 10);
}
exports.hashRepoUrl = hashRepoUrl;
function hasRemoteSource(module) {
    return !!module.repositoryUrl;
}
exports.hasRemoteSource = hasRemoteSource;
function getConfigKey(type) {
    return type === "project" ? config_store_1.localConfigKeys.linkedProjectSources : config_store_1.localConfigKeys.linkedModuleSources;
}
exports.getConfigKey = getConfigKey;
/**
 * Check if any module is linked, including those within an external project source.
 * Returns true if module path is not under the project root or alternatively if the module is a Garden module.
 */
function isModuleLinked(module, garden) {
    const isPluginModule = !!module.plugin;
    return !pathIsInside(module.path, garden.projectRoot) && !isPluginModule;
}
exports.isModuleLinked = isModuleLinked;
function getLinkedSources(garden, type) {
    return __awaiter(this, void 0, void 0, function* () {
        const localConfig = yield garden.localConfigStore.get();
        return (type === "project"
            ? localConfig.linkedProjectSources
            : localConfig.linkedModuleSources) || [];
    });
}
exports.getLinkedSources = getLinkedSources;
function addLinkedSources({ garden, sourceType, sources }) {
    return __awaiter(this, void 0, void 0, function* () {
        const linked = lodash_1.uniqBy([...yield getLinkedSources(garden, sourceType), ...sources], "name");
        yield garden.localConfigStore.set([getConfigKey(sourceType)], linked);
        return linked;
    });
}
exports.addLinkedSources = addLinkedSources;
function removeLinkedSources({ garden, sourceType, names }) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentlyLinked = yield getLinkedSources(garden, sourceType);
        const currentNames = currentlyLinked.map(s => s.name);
        for (const name of names) {
            if (!currentNames.includes(name)) {
                const msg = sourceType === "project"
                    ? `Source ${chalk_1.default.underline(name)} is not linked. Did you mean to unlink a module?`
                    : `Module ${chalk_1.default.underline(name)} is not linked. Did you mean to unlink a source?`;
                const errorKey = sourceType === "project" ? "currentlyLinkedSources" : "currentlyLinkedModules";
                throw new exceptions_1.ParameterError(msg, { [errorKey]: currentNames, input: names });
            }
        }
        const linked = currentlyLinked.filter(({ name }) => !names.includes(name));
        yield garden.localConfigStore.set([getConfigKey(sourceType)], linked);
        return linked;
    });
}
exports.removeLinkedSources = removeLinkedSources;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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dXRpbC9leHQtc291cmNlLXV0aWwuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gXCJjcnlwdG9cIlxuaW1wb3J0IHsgdW5pcUJ5IH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgY2hhbGsgZnJvbSBcImNoYWxrXCJcbmltcG9ydCBwYXRoSXNJbnNpZGUgPSByZXF1aXJlKFwicGF0aC1pcy1pbnNpZGVcIilcblxuaW1wb3J0IHtcbiAgUFJPSkVDVF9TT1VSQ0VTX0RJUl9OQU1FLFxuICBNT0RVTEVfU09VUkNFU19ESVJfTkFNRSxcbn0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQge1xuICBMaW5rZWRTb3VyY2UsXG4gIGxvY2FsQ29uZmlnS2V5cyxcbn0gZnJvbSBcIi4uL2NvbmZpZy1zdG9yZVwiXG5pbXBvcnQgeyBQYXJhbWV0ZXJFcnJvciB9IGZyb20gXCIuLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IE1vZHVsZSB9IGZyb20gXCIuLi90eXBlcy9tb2R1bGVcIlxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuXG5leHBvcnQgdHlwZSBFeHRlcm5hbFNvdXJjZVR5cGUgPSBcInByb2plY3RcIiB8IFwibW9kdWxlXCJcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbW90ZVNvdXJjZXNEaXJuYW1lKHR5cGU6IEV4dGVybmFsU291cmNlVHlwZSk6IHN0cmluZyB7XG4gIHJldHVybiB0eXBlID09PSBcInByb2plY3RcIiA/IFBST0pFQ1RfU09VUkNFU19ESVJfTkFNRSA6IE1PRFVMRV9TT1VSQ0VTX0RJUl9OQU1FXG59XG5cbi8qKlxuICogQSByZW1vdGUgc291cmNlIGRpciBuYW1lIGhhcyB0aGUgZm9ybWF0ICdzb3VyY2UtbmFtZS0tSEFTSF9PRl9SRVBPX1VSTCdcbiAqIHNvIHRoYXQgd2UgY2FuIGRldGVjdCBpZiB0aGUgcmVwbyB1cmwgaGFzIGNoYW5nZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbW90ZVNvdXJjZVBhdGgoeyBuYW1lLCB1cmwsIHNvdXJjZVR5cGUgfTpcbiAgeyBuYW1lOiBzdHJpbmcsIHVybDogc3RyaW5nLCBzb3VyY2VUeXBlOiBFeHRlcm5hbFNvdXJjZVR5cGUgfSkge1xuICBjb25zdCBkaXJuYW1lID0gbmFtZSArIFwiLS1cIiArIGhhc2hSZXBvVXJsKHVybClcbiAgcmV0dXJuIGpvaW4oZ2V0UmVtb3RlU291cmNlc0Rpcm5hbWUoc291cmNlVHlwZSksIGRpcm5hbWUpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoUmVwb1VybCh1cmw6IHN0cmluZykge1xuICBjb25zdCB1cmxIYXNoID0gY3JlYXRlSGFzaChcInNoYTI1NlwiKVxuICB1cmxIYXNoLnVwZGF0ZSh1cmwpXG4gIHJldHVybiB1cmxIYXNoLmRpZ2VzdChcImhleFwiKS5zbGljZSgwLCAxMClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1JlbW90ZVNvdXJjZShtb2R1bGU6IE1vZHVsZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gISFtb2R1bGUucmVwb3NpdG9yeVVybFxufVxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZ0tleSh0eXBlOiBFeHRlcm5hbFNvdXJjZVR5cGUpOiBzdHJpbmcge1xuICByZXR1cm4gdHlwZSA9PT0gXCJwcm9qZWN0XCIgPyBsb2NhbENvbmZpZ0tleXMubGlua2VkUHJvamVjdFNvdXJjZXMgOiBsb2NhbENvbmZpZ0tleXMubGlua2VkTW9kdWxlU291cmNlc1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGFueSBtb2R1bGUgaXMgbGlua2VkLCBpbmNsdWRpbmcgdGhvc2Ugd2l0aGluIGFuIGV4dGVybmFsIHByb2plY3Qgc291cmNlLlxuICogUmV0dXJucyB0cnVlIGlmIG1vZHVsZSBwYXRoIGlzIG5vdCB1bmRlciB0aGUgcHJvamVjdCByb290IG9yIGFsdGVybmF0aXZlbHkgaWYgdGhlIG1vZHVsZSBpcyBhIEdhcmRlbiBtb2R1bGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc01vZHVsZUxpbmtlZChtb2R1bGU6IE1vZHVsZSwgZ2FyZGVuOiBHYXJkZW4pIHtcbiAgY29uc3QgaXNQbHVnaW5Nb2R1bGUgPSAhIW1vZHVsZS5wbHVnaW5cbiAgcmV0dXJuICFwYXRoSXNJbnNpZGUobW9kdWxlLnBhdGgsIGdhcmRlbi5wcm9qZWN0Um9vdCkgJiYgIWlzUGx1Z2luTW9kdWxlXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRMaW5rZWRTb3VyY2VzKFxuICBnYXJkZW46IEdhcmRlbixcbiAgdHlwZTogRXh0ZXJuYWxTb3VyY2VUeXBlLFxuKTogUHJvbWlzZTxMaW5rZWRTb3VyY2VbXT4ge1xuICBjb25zdCBsb2NhbENvbmZpZyA9IGF3YWl0IGdhcmRlbi5sb2NhbENvbmZpZ1N0b3JlLmdldCgpXG4gIHJldHVybiAodHlwZSA9PT0gXCJwcm9qZWN0XCJcbiAgICA/IGxvY2FsQ29uZmlnLmxpbmtlZFByb2plY3RTb3VyY2VzXG4gICAgOiBsb2NhbENvbmZpZy5saW5rZWRNb2R1bGVTb3VyY2VzKSB8fCBbXVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWRkTGlua2VkU291cmNlcyh7IGdhcmRlbiwgc291cmNlVHlwZSwgc291cmNlcyB9OiB7XG4gIGdhcmRlbjogR2FyZGVuLFxuICBzb3VyY2VUeXBlOiBFeHRlcm5hbFNvdXJjZVR5cGUsXG4gIHNvdXJjZXM6IExpbmtlZFNvdXJjZVtdLFxufSk6IFByb21pc2U8TGlua2VkU291cmNlW10+IHtcbiAgY29uc3QgbGlua2VkID0gdW5pcUJ5KFsuLi5hd2FpdCBnZXRMaW5rZWRTb3VyY2VzKGdhcmRlbiwgc291cmNlVHlwZSksIC4uLnNvdXJjZXNdLCBcIm5hbWVcIilcbiAgYXdhaXQgZ2FyZGVuLmxvY2FsQ29uZmlnU3RvcmUuc2V0KFtnZXRDb25maWdLZXkoc291cmNlVHlwZSldLCBsaW5rZWQpXG4gIHJldHVybiBsaW5rZWRcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZUxpbmtlZFNvdXJjZXMoeyBnYXJkZW4sIHNvdXJjZVR5cGUsIG5hbWVzIH06IHtcbiAgZ2FyZGVuOiBHYXJkZW4sXG4gIHNvdXJjZVR5cGU6IEV4dGVybmFsU291cmNlVHlwZSxcbiAgbmFtZXM6IHN0cmluZ1tdLFxufSk6IFByb21pc2U8TGlua2VkU291cmNlW10+IHtcbiAgY29uc3QgY3VycmVudGx5TGlua2VkID0gYXdhaXQgZ2V0TGlua2VkU291cmNlcyhnYXJkZW4sIHNvdXJjZVR5cGUpXG4gIGNvbnN0IGN1cnJlbnROYW1lcyA9IGN1cnJlbnRseUxpbmtlZC5tYXAocyA9PiBzLm5hbWUpXG5cbiAgZm9yIChjb25zdCBuYW1lIG9mIG5hbWVzKSB7XG4gICAgaWYgKCFjdXJyZW50TmFtZXMuaW5jbHVkZXMobmFtZSkpIHtcbiAgICAgIGNvbnN0IG1zZyA9IHNvdXJjZVR5cGUgPT09IFwicHJvamVjdFwiXG4gICAgICAgID8gYFNvdXJjZSAke2NoYWxrLnVuZGVybGluZShuYW1lKX0gaXMgbm90IGxpbmtlZC4gRGlkIHlvdSBtZWFuIHRvIHVubGluayBhIG1vZHVsZT9gXG4gICAgICAgIDogYE1vZHVsZSAke2NoYWxrLnVuZGVybGluZShuYW1lKX0gaXMgbm90IGxpbmtlZC4gRGlkIHlvdSBtZWFuIHRvIHVubGluayBhIHNvdXJjZT9gXG4gICAgICBjb25zdCBlcnJvcktleSA9IHNvdXJjZVR5cGUgPT09IFwicHJvamVjdFwiID8gXCJjdXJyZW50bHlMaW5rZWRTb3VyY2VzXCIgOiBcImN1cnJlbnRseUxpbmtlZE1vZHVsZXNcIlxuXG4gICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IobXNnLCB7IFtlcnJvcktleV06IGN1cnJlbnROYW1lcywgaW5wdXQ6IG5hbWVzIH0pXG4gICAgfVxuICB9XG5cbiAgY29uc3QgbGlua2VkID0gY3VycmVudGx5TGlua2VkLmZpbHRlcigoeyBuYW1lIH0pID0+ICFuYW1lcy5pbmNsdWRlcyhuYW1lKSlcbiAgYXdhaXQgZ2FyZGVuLmxvY2FsQ29uZmlnU3RvcmUuc2V0KFtnZXRDb25maWdLZXkoc291cmNlVHlwZSldLCBsaW5rZWQpXG4gIHJldHVybiBsaW5rZWRcbn1cbiJdfQ==
