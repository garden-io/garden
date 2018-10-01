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
const lodash_1 = require("lodash");
const dedent = require("dedent");
const chalk_1 = require("chalk");
const base_1 = require("../base");
const exceptions_1 = require("../../exceptions");
const helpers_1 = require("./helpers");
const updateRemoteSourcesArguments = {
    source: new base_1.StringsParameter({
        help: "Name of the remote source(s) to update. Use comma separator to specify multiple sources.",
    }),
};
class UpdateRemoteSourcesCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "sources";
        this.help = "Update remote sources.";
        this.arguments = updateRemoteSourcesArguments;
        this.description = dedent `
    Update the remote sources declared in the project config.

    Examples:

        garden update-remote sources            # update all remote sources in the project config
        garden update-remote sources my-source  # update remote source my-source
  `;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "hammer_and_wrench", command: "update-remote sources" });
            const { source } = args;
            const projectSources = garden.projectSources
                .filter(src => source ? source.includes(src.name) : true);
            const names = projectSources.map(src => src.name);
            // TODO: Make external modules a cli type to avoid validation repetition
            const diff = lodash_1.difference(source, names);
            if (diff.length > 0) {
                throw new exceptions_1.ParameterError(`Expected source(s) ${chalk_1.default.underline(diff.join(","))} to be specified in the project garden.yml config.`, {
                    remoteSources: garden.projectSources.map(s => s.name).sort(),
                    input: source ? source.sort() : undefined,
                });
            }
            // TODO Update remotes in parallel. Currently not possible since updating might
            // trigger a username and password prompt from git.
            for (const { name, repositoryUrl } of projectSources) {
                yield garden.vcs.updateRemoteSource({ name, url: repositoryUrl, sourceType: "project", logEntry: garden.log });
            }
            yield helpers_1.pruneRemoteSources({ projectRoot: garden.projectRoot, type: "project", sources: projectSources });
            return { result: projectSources };
        });
    }
}
exports.UpdateRemoteSourcesCommand = UpdateRemoteSourcesCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VwZGF0ZS1yZW1vdGUvc291cmNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsbUNBQW1DO0FBQ25DLGlDQUFpQztBQUNqQyxpQ0FBeUI7QUFFekIsa0NBS2dCO0FBQ2hCLGlEQUFpRDtBQUNqRCx1Q0FBOEM7QUFHOUMsTUFBTSw0QkFBNEIsR0FBRztJQUNuQyxNQUFNLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUMzQixJQUFJLEVBQUUsMEZBQTBGO0tBQ2pHLENBQUM7Q0FDSCxDQUFBO0FBSUQsTUFBYSwwQkFBMkIsU0FBUSxjQUFhO0lBQTdEOztRQUNFLFNBQUksR0FBRyxTQUFTLENBQUE7UUFDaEIsU0FBSSxHQUFHLHdCQUF3QixDQUFBO1FBQy9CLGNBQVMsR0FBRyw0QkFBNEIsQ0FBQTtRQUV4QyxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7OztHQU9uQixDQUFBO0lBb0NILENBQUM7SUFsQ08sTUFBTSxDQUNWLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBdUI7O1lBRXJDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUE7WUFFbkYsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQTtZQUV2QixNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsY0FBYztpQkFDekMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUE7WUFFM0QsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtZQUVqRCx3RUFBd0U7WUFDeEUsTUFBTSxJQUFJLEdBQUcsbUJBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUE7WUFDdEMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDbkIsTUFBTSxJQUFJLDJCQUFjLENBQ3RCLHNCQUFzQixlQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsb0RBQW9ELEVBQ3pHO29CQUNFLGFBQWEsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUU7b0JBQzVELEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUztpQkFDMUMsQ0FDRixDQUFBO2FBQ0Y7WUFFRCwrRUFBK0U7WUFDL0UsbURBQW1EO1lBQ25ELEtBQUssTUFBTSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsSUFBSSxjQUFjLEVBQUU7Z0JBQ3BELE1BQU0sTUFBTSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFBO2FBQy9HO1lBRUQsTUFBTSw0QkFBa0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxDQUFDLENBQUE7WUFFdkcsT0FBTyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsQ0FBQTtRQUNuQyxDQUFDO0tBQUE7Q0FDRjtBQWhERCxnRUFnREMiLCJmaWxlIjoiY29tbWFuZHMvdXBkYXRlLXJlbW90ZS9zb3VyY2VzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGRpZmZlcmVuY2UgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgY2hhbGsgZnJvbSBcImNoYWxrXCJcblxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgU3RyaW5nc1BhcmFtZXRlcixcbiAgQ29tbWFuZFJlc3VsdCxcbiAgQ29tbWFuZFBhcmFtcyxcbn0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgUGFyYW1ldGVyRXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBwcnVuZVJlbW90ZVNvdXJjZXMgfSBmcm9tIFwiLi9oZWxwZXJzXCJcbmltcG9ydCB7IFNvdXJjZUNvbmZpZyB9IGZyb20gXCIuLi8uLi9jb25maWcvcHJvamVjdFwiXG5cbmNvbnN0IHVwZGF0ZVJlbW90ZVNvdXJjZXNBcmd1bWVudHMgPSB7XG4gIHNvdXJjZTogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiTmFtZSBvZiB0aGUgcmVtb3RlIHNvdXJjZShzKSB0byB1cGRhdGUuIFVzZSBjb21tYSBzZXBhcmF0b3IgdG8gc3BlY2lmeSBtdWx0aXBsZSBzb3VyY2VzLlwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIHVwZGF0ZVJlbW90ZVNvdXJjZXNBcmd1bWVudHNcblxuZXhwb3J0IGNsYXNzIFVwZGF0ZVJlbW90ZVNvdXJjZXNDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzPiB7XG4gIG5hbWUgPSBcInNvdXJjZXNcIlxuICBoZWxwID0gXCJVcGRhdGUgcmVtb3RlIHNvdXJjZXMuXCJcbiAgYXJndW1lbnRzID0gdXBkYXRlUmVtb3RlU291cmNlc0FyZ3VtZW50c1xuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIFVwZGF0ZSB0aGUgcmVtb3RlIHNvdXJjZXMgZGVjbGFyZWQgaW4gdGhlIHByb2plY3QgY29uZmlnLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIHVwZGF0ZS1yZW1vdGUgc291cmNlcyAgICAgICAgICAgICMgdXBkYXRlIGFsbCByZW1vdGUgc291cmNlcyBpbiB0aGUgcHJvamVjdCBjb25maWdcbiAgICAgICAgZ2FyZGVuIHVwZGF0ZS1yZW1vdGUgc291cmNlcyBteS1zb3VyY2UgICMgdXBkYXRlIHJlbW90ZSBzb3VyY2UgbXktc291cmNlXG4gIGBcblxuICBhc3luYyBhY3Rpb24oXG4gICAgeyBnYXJkZW4sIGFyZ3MgfTogQ29tbWFuZFBhcmFtczxBcmdzPixcbiAgKTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFNvdXJjZUNvbmZpZ1tdPj4ge1xuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwiaGFtbWVyX2FuZF93cmVuY2hcIiwgY29tbWFuZDogXCJ1cGRhdGUtcmVtb3RlIHNvdXJjZXNcIiB9KVxuXG4gICAgY29uc3QgeyBzb3VyY2UgfSA9IGFyZ3NcblxuICAgIGNvbnN0IHByb2plY3RTb3VyY2VzID0gZ2FyZGVuLnByb2plY3RTb3VyY2VzXG4gICAgICAuZmlsdGVyKHNyYyA9PiBzb3VyY2UgPyBzb3VyY2UuaW5jbHVkZXMoc3JjLm5hbWUpIDogdHJ1ZSlcblxuICAgIGNvbnN0IG5hbWVzID0gcHJvamVjdFNvdXJjZXMubWFwKHNyYyA9PiBzcmMubmFtZSlcblxuICAgIC8vIFRPRE86IE1ha2UgZXh0ZXJuYWwgbW9kdWxlcyBhIGNsaSB0eXBlIHRvIGF2b2lkIHZhbGlkYXRpb24gcmVwZXRpdGlvblxuICAgIGNvbnN0IGRpZmYgPSBkaWZmZXJlbmNlKHNvdXJjZSwgbmFtZXMpXG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKFxuICAgICAgICBgRXhwZWN0ZWQgc291cmNlKHMpICR7Y2hhbGsudW5kZXJsaW5lKGRpZmYuam9pbihcIixcIikpfSB0byBiZSBzcGVjaWZpZWQgaW4gdGhlIHByb2plY3QgZ2FyZGVuLnltbCBjb25maWcuYCxcbiAgICAgICAge1xuICAgICAgICAgIHJlbW90ZVNvdXJjZXM6IGdhcmRlbi5wcm9qZWN0U291cmNlcy5tYXAocyA9PiBzLm5hbWUpLnNvcnQoKSxcbiAgICAgICAgICBpbnB1dDogc291cmNlID8gc291cmNlLnNvcnQoKSA6IHVuZGVmaW5lZCxcbiAgICAgICAgfSxcbiAgICAgIClcbiAgICB9XG5cbiAgICAvLyBUT0RPIFVwZGF0ZSByZW1vdGVzIGluIHBhcmFsbGVsLiBDdXJyZW50bHkgbm90IHBvc3NpYmxlIHNpbmNlIHVwZGF0aW5nIG1pZ2h0XG4gICAgLy8gdHJpZ2dlciBhIHVzZXJuYW1lIGFuZCBwYXNzd29yZCBwcm9tcHQgZnJvbSBnaXQuXG4gICAgZm9yIChjb25zdCB7IG5hbWUsIHJlcG9zaXRvcnlVcmwgfSBvZiBwcm9qZWN0U291cmNlcykge1xuICAgICAgYXdhaXQgZ2FyZGVuLnZjcy51cGRhdGVSZW1vdGVTb3VyY2UoeyBuYW1lLCB1cmw6IHJlcG9zaXRvcnlVcmwsIHNvdXJjZVR5cGU6IFwicHJvamVjdFwiLCBsb2dFbnRyeTogZ2FyZGVuLmxvZyB9KVxuICAgIH1cblxuICAgIGF3YWl0IHBydW5lUmVtb3RlU291cmNlcyh7IHByb2plY3RSb290OiBnYXJkZW4ucHJvamVjdFJvb3QsIHR5cGU6IFwicHJvamVjdFwiLCBzb3VyY2VzOiBwcm9qZWN0U291cmNlcyB9KVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0OiBwcm9qZWN0U291cmNlcyB9XG4gIH1cbn1cbiJdfQ==
