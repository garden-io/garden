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
const path_1 = require("path");
const dedent = require("dedent");
const chalk_1 = require("chalk");
const exceptions_1 = require("../../exceptions");
const base_1 = require("../base");
const ext_source_util_1 = require("../../util/ext-source-util");
const linkModuleArguments = {
    module: new base_1.StringParameter({
        help: "Name of the module to link.",
        required: true,
    }),
    path: new base_1.PathParameter({
        help: "Path to the local directory that containes the module.",
        required: true,
    }),
};
class LinkModuleCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "module";
        this.help = "Link a module to a local directory.";
        this.arguments = linkModuleArguments;
        this.description = dedent `
    After linking a remote module, Garden will read the source from the module's local directory instead of from
    the remote URL. Garden can only link modules that have a remote source,
    i.e. modules that specifiy a repositoryUrl in their garden.yml config file.

    Examples:

        garden link module my-module path/to/my-module # links my-module to its local version at the given path
  `;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "link", command: "link module" });
            const sourceType = "module";
            const { module: moduleName, path } = args;
            const moduleToLink = yield garden.getModule(moduleName);
            const isRemote = [moduleToLink].filter(ext_source_util_1.hasRemoteSource)[0];
            if (!isRemote) {
                const modulesWithRemoteSource = (yield garden.getModules()).filter(ext_source_util_1.hasRemoteSource).sort();
                throw new exceptions_1.ParameterError(`Expected module(s) ${chalk_1.default.underline(moduleName)} to have a remote source.` +
                    ` Did you mean to use the "link source" command?`, {
                    modulesWithRemoteSource,
                    input: module,
                });
            }
            const absPath = path_1.resolve(garden.projectRoot, path);
            const linkedModuleSources = yield ext_source_util_1.addLinkedSources({
                garden,
                sourceType,
                sources: [{ name: moduleName, path: absPath }],
            });
            garden.log.info(`Linked module ${moduleName}`);
            return { result: linkedModuleSources };
        });
    }
}
exports.LinkModuleCommand = LinkModuleCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2xpbmsvbW9kdWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCwrQkFBOEI7QUFDOUIsaUNBQWlDO0FBQ2pDLGlDQUF5QjtBQUV6QixpREFBaUQ7QUFDakQsa0NBTWdCO0FBSWhCLGdFQUdtQztBQUVuQyxNQUFNLG1CQUFtQixHQUFHO0lBQzFCLE1BQU0sRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDMUIsSUFBSSxFQUFFLDZCQUE2QjtRQUNuQyxRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7SUFDRixJQUFJLEVBQUUsSUFBSSxvQkFBYSxDQUFDO1FBQ3RCLElBQUksRUFBRSx3REFBd0Q7UUFDOUQsUUFBUSxFQUFFLElBQUk7S0FDZixDQUFDO0NBQ0gsQ0FBQTtBQUlELE1BQWEsaUJBQWtCLFNBQVEsY0FBYTtJQUFwRDs7UUFDRSxTQUFJLEdBQUcsUUFBUSxDQUFBO1FBQ2YsU0FBSSxHQUFHLHFDQUFxQyxDQUFBO1FBQzVDLGNBQVMsR0FBRyxtQkFBbUIsQ0FBQTtRQUUvQixnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7Ozs7R0FRbkIsQ0FBQTtJQW9DSCxDQUFDO0lBbENPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQXVCOztZQUNoRCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUE7WUFFNUQsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFBO1lBRTNCLE1BQU0sRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQTtZQUN6QyxNQUFNLFlBQVksR0FBRyxNQUFNLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUE7WUFFdkQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsaUNBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQzFELElBQUksQ0FBQyxRQUFRLEVBQUU7Z0JBQ2IsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLE1BQU0sTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGlDQUFlLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtnQkFFMUYsTUFBTSxJQUFJLDJCQUFjLENBQ3RCLHNCQUFzQixlQUFLLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQywyQkFBMkI7b0JBQzVFLGlEQUFpRCxFQUNqRDtvQkFDRSx1QkFBdUI7b0JBQ3ZCLEtBQUssRUFBRSxNQUFNO2lCQUNkLENBQ0YsQ0FBQTthQUNGO1lBRUQsTUFBTSxPQUFPLEdBQUcsY0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUE7WUFDakQsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLGtDQUFnQixDQUFDO2dCQUNqRCxNQUFNO2dCQUNOLFVBQVU7Z0JBQ1YsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQzthQUMvQyxDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsVUFBVSxFQUFFLENBQUMsQ0FBQTtZQUU5QyxPQUFPLEVBQUUsTUFBTSxFQUFFLG1CQUFtQixFQUFFLENBQUE7UUFFeEMsQ0FBQztLQUFBO0NBQ0Y7QUFqREQsOENBaURDIiwiZmlsZSI6ImNvbW1hbmRzL2xpbmsvbW9kdWxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5cbmltcG9ydCB7IFBhcmFtZXRlckVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgU3RyaW5nUGFyYW1ldGVyLFxuICBQYXRoUGFyYW1ldGVyLFxuICBDb21tYW5kUGFyYW1zLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQge1xuICBMaW5rZWRTb3VyY2UsXG59IGZyb20gXCIuLi8uLi9jb25maWctc3RvcmVcIlxuaW1wb3J0IHtcbiAgYWRkTGlua2VkU291cmNlcyxcbiAgaGFzUmVtb3RlU291cmNlLFxufSBmcm9tIFwiLi4vLi4vdXRpbC9leHQtc291cmNlLXV0aWxcIlxuXG5jb25zdCBsaW5rTW9kdWxlQXJndW1lbnRzID0ge1xuICBtb2R1bGU6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiTmFtZSBvZiB0aGUgbW9kdWxlIHRvIGxpbmsuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxuICBwYXRoOiBuZXcgUGF0aFBhcmFtZXRlcih7XG4gICAgaGVscDogXCJQYXRoIHRvIHRoZSBsb2NhbCBkaXJlY3RvcnkgdGhhdCBjb250YWluZXMgdGhlIG1vZHVsZS5cIixcbiAgICByZXF1aXJlZDogdHJ1ZSxcbiAgfSksXG59XG5cbnR5cGUgQXJncyA9IHR5cGVvZiBsaW5rTW9kdWxlQXJndW1lbnRzXG5cbmV4cG9ydCBjbGFzcyBMaW5rTW9kdWxlQ29tbWFuZCBleHRlbmRzIENvbW1hbmQ8QXJncz4ge1xuICBuYW1lID0gXCJtb2R1bGVcIlxuICBoZWxwID0gXCJMaW5rIGEgbW9kdWxlIHRvIGEgbG9jYWwgZGlyZWN0b3J5LlwiXG4gIGFyZ3VtZW50cyA9IGxpbmtNb2R1bGVBcmd1bWVudHNcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBBZnRlciBsaW5raW5nIGEgcmVtb3RlIG1vZHVsZSwgR2FyZGVuIHdpbGwgcmVhZCB0aGUgc291cmNlIGZyb20gdGhlIG1vZHVsZSdzIGxvY2FsIGRpcmVjdG9yeSBpbnN0ZWFkIG9mIGZyb21cbiAgICB0aGUgcmVtb3RlIFVSTC4gR2FyZGVuIGNhbiBvbmx5IGxpbmsgbW9kdWxlcyB0aGF0IGhhdmUgYSByZW1vdGUgc291cmNlLFxuICAgIGkuZS4gbW9kdWxlcyB0aGF0IHNwZWNpZml5IGEgcmVwb3NpdG9yeVVybCBpbiB0aGVpciBnYXJkZW4ueW1sIGNvbmZpZyBmaWxlLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIGxpbmsgbW9kdWxlIG15LW1vZHVsZSBwYXRoL3RvL215LW1vZHVsZSAjIGxpbmtzIG15LW1vZHVsZSB0byBpdHMgbG9jYWwgdmVyc2lvbiBhdCB0aGUgZ2l2ZW4gcGF0aFxuICBgXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuLCBhcmdzIH06IENvbW1hbmRQYXJhbXM8QXJncz4pOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8TGlua2VkU291cmNlW10+PiB7XG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJsaW5rXCIsIGNvbW1hbmQ6IFwibGluayBtb2R1bGVcIiB9KVxuXG4gICAgY29uc3Qgc291cmNlVHlwZSA9IFwibW9kdWxlXCJcblxuICAgIGNvbnN0IHsgbW9kdWxlOiBtb2R1bGVOYW1lLCBwYXRoIH0gPSBhcmdzXG4gICAgY29uc3QgbW9kdWxlVG9MaW5rID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZShtb2R1bGVOYW1lKVxuXG4gICAgY29uc3QgaXNSZW1vdGUgPSBbbW9kdWxlVG9MaW5rXS5maWx0ZXIoaGFzUmVtb3RlU291cmNlKVswXVxuICAgIGlmICghaXNSZW1vdGUpIHtcbiAgICAgIGNvbnN0IG1vZHVsZXNXaXRoUmVtb3RlU291cmNlID0gKGF3YWl0IGdhcmRlbi5nZXRNb2R1bGVzKCkpLmZpbHRlcihoYXNSZW1vdGVTb3VyY2UpLnNvcnQoKVxuXG4gICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IoXG4gICAgICAgIGBFeHBlY3RlZCBtb2R1bGUocykgJHtjaGFsay51bmRlcmxpbmUobW9kdWxlTmFtZSl9IHRvIGhhdmUgYSByZW1vdGUgc291cmNlLmAgK1xuICAgICAgICBgIERpZCB5b3UgbWVhbiB0byB1c2UgdGhlIFwibGluayBzb3VyY2VcIiBjb21tYW5kP2AsXG4gICAgICAgIHtcbiAgICAgICAgICBtb2R1bGVzV2l0aFJlbW90ZVNvdXJjZSxcbiAgICAgICAgICBpbnB1dDogbW9kdWxlLFxuICAgICAgICB9LFxuICAgICAgKVxuICAgIH1cblxuICAgIGNvbnN0IGFic1BhdGggPSByZXNvbHZlKGdhcmRlbi5wcm9qZWN0Um9vdCwgcGF0aClcbiAgICBjb25zdCBsaW5rZWRNb2R1bGVTb3VyY2VzID0gYXdhaXQgYWRkTGlua2VkU291cmNlcyh7XG4gICAgICBnYXJkZW4sXG4gICAgICBzb3VyY2VUeXBlLFxuICAgICAgc291cmNlczogW3sgbmFtZTogbW9kdWxlTmFtZSwgcGF0aDogYWJzUGF0aCB9XSxcbiAgICB9KVxuXG4gICAgZ2FyZGVuLmxvZy5pbmZvKGBMaW5rZWQgbW9kdWxlICR7bW9kdWxlTmFtZX1gKVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0OiBsaW5rZWRNb2R1bGVTb3VyY2VzIH1cblxuICB9XG59XG4iXX0=
