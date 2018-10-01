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
const execa = require("execa");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const Bluebird = require("bluebird");
const base_1 = require("./base");
exports.helpers = {
    gitCli: (cwd) => {
        return (cmd, args) => __awaiter(this, void 0, void 0, function* () {
            return execa.stdout("git", [cmd, ...args], { cwd });
        });
    },
};
function getGitUrlParts(url) {
    const parts = url.split("#");
    return { repositoryUrl: parts[0], hash: parts[1] };
}
function parseRefList(res) {
    const refList = res.split("\n").map(str => {
        const parts = str.split("\n");
        return { commitId: parts[0], ref: parts[1] };
    });
    return refList[0].commitId;
}
// TODO Consider moving git commands to separate (and testable) functions
class GitHandler extends base_1.VcsHandler {
    constructor() {
        super(...arguments);
        this.name = "git";
    }
    getTreeVersion(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const git = exports.helpers.gitCli(path);
            let commitHash;
            try {
                commitHash = (yield git("rev-list", [
                    "--max-count=1",
                    "--abbrev-commit",
                    "--abbrev=10",
                    "HEAD",
                ])) || base_1.NEW_MODULE_VERSION;
            }
            catch (err) {
                if (err.code === 128) {
                    // not in a repo root, return default version
                    commitHash = base_1.NEW_MODULE_VERSION;
                }
            }
            let latestDirty = 0;
            const res = (yield git("diff-index", ["--name-only", "HEAD", path])) + "\n"
                + (yield git("ls-files", ["--other", "--exclude-standard", path]));
            const dirtyFiles = res.split("\n").filter((f) => f.length > 0);
            // for dirty trees, we append the last modified time of last modified or added file
            if (dirtyFiles.length) {
                const repoRoot = yield git("rev-parse", ["--show-toplevel"]);
                const stats = yield Bluebird.map(dirtyFiles, file => path_1.join(repoRoot, file))
                    .filter((file) => fs_extra_1.pathExists(file))
                    .map((file) => fs_extra_1.stat(file));
                let mtimes = stats.map((s) => Math.round(s.mtime.getTime() / 1000));
                let latest = mtimes.sort().slice(-1)[0];
                if (latest > latestDirty) {
                    latestDirty = latest;
                }
            }
            return {
                latestCommit: commitHash,
                dirtyTimestamp: latestDirty || null,
            };
        });
    }
    // TODO Better auth handling
    ensureRemoteSource({ url, name, logEntry, sourceType }) {
        return __awaiter(this, void 0, void 0, function* () {
            const remoteSourcesPath = path_1.join(this.projectRoot, this.getRemoteSourcesDirname(sourceType));
            yield fs_extra_1.ensureDir(remoteSourcesPath);
            const git = exports.helpers.gitCli(remoteSourcesPath);
            const absPath = path_1.join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType));
            const isCloned = yield fs_extra_1.pathExists(absPath);
            if (!isCloned) {
                const entry = logEntry.info({ section: name, msg: `Fetching from ${url}`, status: "active" });
                const { repositoryUrl, hash } = getGitUrlParts(url);
                const cmdOpts = ["--depth=1"];
                if (hash) {
                    cmdOpts.push("--branch=hash");
                }
                yield git("clone", [...cmdOpts, repositoryUrl, absPath]);
                entry.setSuccess();
            }
            return absPath;
        });
    }
    updateRemoteSource({ url, name, sourceType, logEntry }) {
        return __awaiter(this, void 0, void 0, function* () {
            const absPath = path_1.join(this.projectRoot, this.getRemoteSourcePath(name, url, sourceType));
            const git = exports.helpers.gitCli(absPath);
            const { repositoryUrl, hash } = getGitUrlParts(url);
            yield this.ensureRemoteSource({ url, name, sourceType, logEntry });
            const entry = logEntry.info({ section: name, msg: "Getting remote state", status: "active" });
            yield git("remote", ["update"]);
            const listRemoteArgs = hash ? [repositoryUrl, hash] : [repositoryUrl];
            const showRefArgs = hash ? [hash] : [];
            const remoteCommitId = parseRefList(yield git("ls-remote", listRemoteArgs));
            const localCommitId = parseRefList(yield git("show-ref", ["--hash", ...showRefArgs]));
            if (localCommitId !== remoteCommitId) {
                entry.setState(`Fetching from ${url}`);
                const fetchArgs = hash ? ["origin", hash] : ["origin"];
                const resetArgs = hash ? [`origin/${hash}`] : ["origin"];
                yield git("fetch", ["--depth=1", ...fetchArgs]);
                yield git("reset", ["--hard", ...resetArgs]);
                entry.setSuccess("Source updated");
            }
            else {
                entry.setSuccess("Source already up to date");
            }
        });
    }
}
exports.GitHandler = GitHandler;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUE7Z0JBQ3hELE1BQU0sR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLFdBQVcsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUE7Z0JBQy9DLE1BQU0sR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLFFBQVEsRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUE7Z0JBRTVDLEtBQUssQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTthQUNuQztpQkFBTTtnQkFDTCxLQUFLLENBQUMsVUFBVSxDQUFDLDJCQUEyQixDQUFDLENBQUE7YUFDOUM7UUFDSCxDQUFDO0tBQUE7Q0FFRjtBQXZHRCxnQ0F1R0MiLCJmaWxlIjoidmNzL2dpdC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgZXhlY2EgPSByZXF1aXJlKFwiZXhlY2FcIilcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBlbnN1cmVEaXIsIHBhdGhFeGlzdHMsIHN0YXQgfSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IEJsdWViaXJkID0gcmVxdWlyZShcImJsdWViaXJkXCIpXG5cbmltcG9ydCB7IE5FV19NT0RVTEVfVkVSU0lPTiwgVmNzSGFuZGxlciwgUmVtb3RlU291cmNlUGFyYW1zIH0gZnJvbSBcIi4vYmFzZVwiXG5cbmV4cG9ydCBjb25zdCBoZWxwZXJzID0ge1xuICBnaXRDbGk6IChjd2Q6IHN0cmluZyk6IChjbWQ6IHN0cmluZywgYXJnczogc3RyaW5nW10pID0+IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gICAgcmV0dXJuIGFzeW5jIChjbWQsIGFyZ3MpID0+IHtcbiAgICAgIHJldHVybiBleGVjYS5zdGRvdXQoXCJnaXRcIiwgW2NtZCwgLi4uYXJnc10sIHsgY3dkIH0pXG4gICAgfVxuICB9LFxufVxuXG5mdW5jdGlvbiBnZXRHaXRVcmxQYXJ0cyh1cmw6IHN0cmluZykge1xuICBjb25zdCBwYXJ0cyA9IHVybC5zcGxpdChcIiNcIilcbiAgcmV0dXJuIHsgcmVwb3NpdG9yeVVybDogcGFydHNbMF0sIGhhc2g6IHBhcnRzWzFdIH1cbn1cblxuZnVuY3Rpb24gcGFyc2VSZWZMaXN0KHJlczogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgcmVmTGlzdCA9IHJlcy5zcGxpdChcIlxcblwiKS5tYXAoc3RyID0+IHtcbiAgICBjb25zdCBwYXJ0cyA9IHN0ci5zcGxpdChcIlxcblwiKVxuICAgIHJldHVybiB7IGNvbW1pdElkOiBwYXJ0c1swXSwgcmVmOiBwYXJ0c1sxXSB9XG4gIH0pXG4gIHJldHVybiByZWZMaXN0WzBdLmNvbW1pdElkXG59XG5cbi8vIFRPRE8gQ29uc2lkZXIgbW92aW5nIGdpdCBjb21tYW5kcyB0byBzZXBhcmF0ZSAoYW5kIHRlc3RhYmxlKSBmdW5jdGlvbnNcbmV4cG9ydCBjbGFzcyBHaXRIYW5kbGVyIGV4dGVuZHMgVmNzSGFuZGxlciB7XG4gIG5hbWUgPSBcImdpdFwiXG5cbiAgYXN5bmMgZ2V0VHJlZVZlcnNpb24ocGF0aDogc3RyaW5nKSB7XG4gICAgY29uc3QgZ2l0ID0gaGVscGVycy5naXRDbGkocGF0aClcblxuICAgIGxldCBjb21taXRIYXNoXG4gICAgdHJ5IHtcbiAgICAgIGNvbW1pdEhhc2ggPSBhd2FpdCBnaXQoXCJyZXYtbGlzdFwiLCBbXG4gICAgICAgIFwiLS1tYXgtY291bnQ9MVwiLFxuICAgICAgICBcIi0tYWJicmV2LWNvbW1pdFwiLFxuICAgICAgICBcIi0tYWJicmV2PTEwXCIsXG4gICAgICAgIFwiSEVBRFwiLFxuICAgICAgXSkgfHwgTkVXX01PRFVMRV9WRVJTSU9OXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyLmNvZGUgPT09IDEyOCkge1xuICAgICAgICAvLyBub3QgaW4gYSByZXBvIHJvb3QsIHJldHVybiBkZWZhdWx0IHZlcnNpb25cbiAgICAgICAgY29tbWl0SGFzaCA9IE5FV19NT0RVTEVfVkVSU0lPTlxuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBsYXRlc3REaXJ0eSA9IDBcblxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGdpdChcImRpZmYtaW5kZXhcIiwgW1wiLS1uYW1lLW9ubHlcIiwgXCJIRUFEXCIsIHBhdGhdKSArIFwiXFxuXCJcbiAgICAgICsgYXdhaXQgZ2l0KFwibHMtZmlsZXNcIiwgW1wiLS1vdGhlclwiLCBcIi0tZXhjbHVkZS1zdGFuZGFyZFwiLCBwYXRoXSlcblxuICAgIGNvbnN0IGRpcnR5RmlsZXM6IHN0cmluZ1tdID0gcmVzLnNwbGl0KFwiXFxuXCIpLmZpbHRlcigoZikgPT4gZi5sZW5ndGggPiAwKVxuICAgIC8vIGZvciBkaXJ0eSB0cmVlcywgd2UgYXBwZW5kIHRoZSBsYXN0IG1vZGlmaWVkIHRpbWUgb2YgbGFzdCBtb2RpZmllZCBvciBhZGRlZCBmaWxlXG4gICAgaWYgKGRpcnR5RmlsZXMubGVuZ3RoKSB7XG4gICAgICBjb25zdCByZXBvUm9vdCA9IGF3YWl0IGdpdChcInJldi1wYXJzZVwiLCBbXCItLXNob3ctdG9wbGV2ZWxcIl0pXG4gICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IEJsdWViaXJkLm1hcChkaXJ0eUZpbGVzLCBmaWxlID0+IGpvaW4ocmVwb1Jvb3QsIGZpbGUpKVxuICAgICAgICAuZmlsdGVyKChmaWxlOiBzdHJpbmcpID0+IHBhdGhFeGlzdHMoZmlsZSkpXG4gICAgICAgIC5tYXAoKGZpbGU6IHN0cmluZykgPT4gc3RhdChmaWxlKSlcblxuICAgICAgbGV0IG10aW1lcyA9IHN0YXRzLm1hcCgocykgPT4gTWF0aC5yb3VuZChzLm10aW1lLmdldFRpbWUoKSAvIDEwMDApKVxuICAgICAgbGV0IGxhdGVzdCA9IG10aW1lcy5zb3J0KCkuc2xpY2UoLTEpWzBdXG5cbiAgICAgIGlmIChsYXRlc3QgPiBsYXRlc3REaXJ0eSkge1xuICAgICAgICBsYXRlc3REaXJ0eSA9IGxhdGVzdFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBsYXRlc3RDb21taXQ6IGNvbW1pdEhhc2gsXG4gICAgICBkaXJ0eVRpbWVzdGFtcDogbGF0ZXN0RGlydHkgfHwgbnVsbCxcbiAgICB9XG4gIH1cblxuICAvLyBUT0RPIEJldHRlciBhdXRoIGhhbmRsaW5nXG4gIGFzeW5jIGVuc3VyZVJlbW90ZVNvdXJjZSh7IHVybCwgbmFtZSwgbG9nRW50cnksIHNvdXJjZVR5cGUgfTogUmVtb3RlU291cmNlUGFyYW1zKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCByZW1vdGVTb3VyY2VzUGF0aCA9IGpvaW4odGhpcy5wcm9qZWN0Um9vdCwgdGhpcy5nZXRSZW1vdGVTb3VyY2VzRGlybmFtZShzb3VyY2VUeXBlKSlcbiAgICBhd2FpdCBlbnN1cmVEaXIocmVtb3RlU291cmNlc1BhdGgpXG4gICAgY29uc3QgZ2l0ID0gaGVscGVycy5naXRDbGkocmVtb3RlU291cmNlc1BhdGgpXG5cbiAgICBjb25zdCBhYnNQYXRoID0gam9pbih0aGlzLnByb2plY3RSb290LCB0aGlzLmdldFJlbW90ZVNvdXJjZVBhdGgobmFtZSwgdXJsLCBzb3VyY2VUeXBlKSlcbiAgICBjb25zdCBpc0Nsb25lZCA9IGF3YWl0IHBhdGhFeGlzdHMoYWJzUGF0aClcblxuICAgIGlmICghaXNDbG9uZWQpIHtcbiAgICAgIGNvbnN0IGVudHJ5ID0gbG9nRW50cnkuaW5mbyh7IHNlY3Rpb246IG5hbWUsIG1zZzogYEZldGNoaW5nIGZyb20gJHt1cmx9YCwgc3RhdHVzOiBcImFjdGl2ZVwiIH0pXG4gICAgICBjb25zdCB7IHJlcG9zaXRvcnlVcmwsIGhhc2ggfSA9IGdldEdpdFVybFBhcnRzKHVybClcblxuICAgICAgY29uc3QgY21kT3B0cyA9IFtcIi0tZGVwdGg9MVwiXVxuICAgICAgaWYgKGhhc2gpIHtcbiAgICAgICAgY21kT3B0cy5wdXNoKFwiLS1icmFuY2g9aGFzaFwiKVxuICAgICAgfVxuXG4gICAgICBhd2FpdCBnaXQoXCJjbG9uZVwiLCBbLi4uY21kT3B0cywgcmVwb3NpdG9yeVVybCwgYWJzUGF0aF0pXG5cbiAgICAgIGVudHJ5LnNldFN1Y2Nlc3MoKVxuICAgIH1cblxuICAgIHJldHVybiBhYnNQYXRoXG4gIH1cblxuICBhc3luYyB1cGRhdGVSZW1vdGVTb3VyY2UoeyB1cmwsIG5hbWUsIHNvdXJjZVR5cGUsIGxvZ0VudHJ5IH06IFJlbW90ZVNvdXJjZVBhcmFtcykge1xuICAgIGNvbnN0IGFic1BhdGggPSBqb2luKHRoaXMucHJvamVjdFJvb3QsIHRoaXMuZ2V0UmVtb3RlU291cmNlUGF0aChuYW1lLCB1cmwsIHNvdXJjZVR5cGUpKVxuICAgIGNvbnN0IGdpdCA9IGhlbHBlcnMuZ2l0Q2xpKGFic1BhdGgpXG4gICAgY29uc3QgeyByZXBvc2l0b3J5VXJsLCBoYXNoIH0gPSBnZXRHaXRVcmxQYXJ0cyh1cmwpXG5cbiAgICBhd2FpdCB0aGlzLmVuc3VyZVJlbW90ZVNvdXJjZSh7IHVybCwgbmFtZSwgc291cmNlVHlwZSwgbG9nRW50cnkgfSlcblxuICAgIGNvbnN0IGVudHJ5ID0gbG9nRW50cnkuaW5mbyh7IHNlY3Rpb246IG5hbWUsIG1zZzogXCJHZXR0aW5nIHJlbW90ZSBzdGF0ZVwiLCBzdGF0dXM6IFwiYWN0aXZlXCIgfSlcbiAgICBhd2FpdCBnaXQoXCJyZW1vdGVcIiwgW1widXBkYXRlXCJdKVxuXG4gICAgY29uc3QgbGlzdFJlbW90ZUFyZ3MgPSBoYXNoID8gW3JlcG9zaXRvcnlVcmwsIGhhc2hdIDogW3JlcG9zaXRvcnlVcmxdXG4gICAgY29uc3Qgc2hvd1JlZkFyZ3MgPSBoYXNoID8gW2hhc2hdIDogW11cbiAgICBjb25zdCByZW1vdGVDb21taXRJZCA9IHBhcnNlUmVmTGlzdChhd2FpdCBnaXQoXCJscy1yZW1vdGVcIiwgbGlzdFJlbW90ZUFyZ3MpKVxuICAgIGNvbnN0IGxvY2FsQ29tbWl0SWQgPSBwYXJzZVJlZkxpc3QoYXdhaXQgZ2l0KFwic2hvdy1yZWZcIiwgW1wiLS1oYXNoXCIsIC4uLnNob3dSZWZBcmdzXSkpXG5cbiAgICBpZiAobG9jYWxDb21taXRJZCAhPT0gcmVtb3RlQ29tbWl0SWQpIHtcbiAgICAgIGVudHJ5LnNldFN0YXRlKGBGZXRjaGluZyBmcm9tICR7dXJsfWApXG5cbiAgICAgIGNvbnN0IGZldGNoQXJncyA9IGhhc2ggPyBbXCJvcmlnaW5cIiwgaGFzaF0gOiBbXCJvcmlnaW5cIl1cbiAgICAgIGNvbnN0IHJlc2V0QXJncyA9IGhhc2ggPyBbYG9yaWdpbi8ke2hhc2h9YF0gOiBbXCJvcmlnaW5cIl1cbiAgICAgIGF3YWl0IGdpdChcImZldGNoXCIsIFtcIi0tZGVwdGg9MVwiLCAuLi5mZXRjaEFyZ3NdKVxuICAgICAgYXdhaXQgZ2l0KFwicmVzZXRcIiwgW1wiLS1oYXJkXCIsIC4uLnJlc2V0QXJnc10pXG5cbiAgICAgIGVudHJ5LnNldFN1Y2Nlc3MoXCJTb3VyY2UgdXBkYXRlZFwiKVxuICAgIH0gZWxzZSB7XG4gICAgICBlbnRyeS5zZXRTdWNjZXNzKFwiU291cmNlIGFscmVhZHkgdXAgdG8gZGF0ZVwiKVxuICAgIH1cbiAgfVxuXG59XG4iXX0=
