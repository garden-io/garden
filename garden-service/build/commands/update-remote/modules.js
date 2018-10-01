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
const ext_source_util_1 = require("../../util/ext-source-util");
const updateRemoteModulesArguments = {
    module: new base_1.StringsParameter({
        help: "Name of the remote module(s) to update. Use comma separator to specify multiple modules.",
    }),
};
class UpdateRemoteModulesCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "modules";
        this.help = "Update remote modules.";
        this.arguments = updateRemoteModulesArguments;
        this.description = dedent `
    Remote modules are modules that have a repositoryUrl field
    in their garden.yml config that points to a remote repository.

    Examples:

        garden update-remote modules            # update all remote modules in the project
        garden update-remote modules my-module  # update remote module my-module
  `;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "hammer_and_wrench", command: "update-remote modules" });
            const { module } = args;
            const modules = yield garden.getModules(module);
            const moduleSources = modules
                .filter(ext_source_util_1.hasRemoteSource)
                .filter(src => module ? module.includes(src.name) : true);
            const names = moduleSources.map(src => src.name);
            const diff = lodash_1.difference(module, names);
            if (diff.length > 0) {
                const modulesWithRemoteSource = (yield garden.getModules()).filter(ext_source_util_1.hasRemoteSource).sort();
                throw new exceptions_1.ParameterError(`Expected module(s) ${chalk_1.default.underline(diff.join(","))} to have a remote source.`, {
                    modulesWithRemoteSource,
                    input: module ? module.sort() : undefined,
                });
            }
            // TODO Update remotes in parallel. Currently not possible since updating might
            // trigger a username and password prompt from git.
            for (const { name, repositoryUrl } of moduleSources) {
                yield garden.vcs.updateRemoteSource({ name, url: repositoryUrl, sourceType: "module", logEntry: garden.log });
            }
            yield helpers_1.pruneRemoteSources({ projectRoot: garden.projectRoot, type: "module", sources: moduleSources });
            return { result: moduleSources };
        });
    }
}
exports.UpdateRemoteModulesCommand = UpdateRemoteModulesCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VwZGF0ZS1yZW1vdGUvbW9kdWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsbUNBQW1DO0FBQ25DLGlDQUFpQztBQUNqQyxpQ0FBeUI7QUFFekIsa0NBS2dCO0FBRWhCLGlEQUFpRDtBQUNqRCx1Q0FBOEM7QUFDOUMsZ0VBQTREO0FBRTVELE1BQU0sNEJBQTRCLEdBQUc7SUFDbkMsTUFBTSxFQUFFLElBQUksdUJBQWdCLENBQUM7UUFDM0IsSUFBSSxFQUFFLDBGQUEwRjtLQUNqRyxDQUFDO0NBQ0gsQ0FBQTtBQUlELE1BQWEsMEJBQTJCLFNBQVEsY0FBYTtJQUE3RDs7UUFDRSxTQUFJLEdBQUcsU0FBUyxDQUFBO1FBQ2hCLFNBQUksR0FBRyx3QkFBd0IsQ0FBQTtRQUMvQixjQUFTLEdBQUcsNEJBQTRCLENBQUE7UUFFeEMsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7O0dBUW5CLENBQUE7SUF1Q0gsQ0FBQztJQXJDTyxNQUFNLENBQ1YsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUF1Qjs7WUFFckMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQTtZQUVuRixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFBO1lBQ3ZCLE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUUvQyxNQUFNLGFBQWEsR0FBbUIsT0FBTztpQkFDMUMsTUFBTSxDQUFDLGlDQUFlLENBQUM7aUJBQ3ZCLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFBO1lBRTNELE1BQU0sS0FBSyxHQUFHLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUE7WUFFaEQsTUFBTSxJQUFJLEdBQUcsbUJBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUE7WUFDdEMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDbkIsTUFBTSx1QkFBdUIsR0FBRyxDQUFDLE1BQU0sTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGlDQUFlLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQTtnQkFFMUYsTUFBTSxJQUFJLDJCQUFjLENBQ3RCLHNCQUFzQixlQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsMkJBQTJCLEVBQ2hGO29CQUNFLHVCQUF1QjtvQkFDdkIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTO2lCQUMxQyxDQUNGLENBQUE7YUFDRjtZQUVELCtFQUErRTtZQUMvRSxtREFBbUQ7WUFDbkQsS0FBSyxNQUFNLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxJQUFJLGFBQWEsRUFBRTtnQkFDbkQsTUFBTSxNQUFNLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUE7YUFDOUc7WUFFRCxNQUFNLDRCQUFrQixDQUFDLEVBQUUsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQTtZQUVyRyxPQUFPLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxDQUFBO1FBQ2xDLENBQUM7S0FBQTtDQUNGO0FBcERELGdFQW9EQyIsImZpbGUiOiJjb21tYW5kcy91cGRhdGUtcmVtb3RlL21vZHVsZXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgZGlmZmVyZW5jZSB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuXG5pbXBvcnQge1xuICBDb21tYW5kLFxuICBTdHJpbmdzUGFyYW1ldGVyLFxuICBDb21tYW5kUmVzdWx0LFxuICBDb21tYW5kUGFyYW1zLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyBTb3VyY2VDb25maWcgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3Byb2plY3RcIlxuaW1wb3J0IHsgUGFyYW1ldGVyRXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBwcnVuZVJlbW90ZVNvdXJjZXMgfSBmcm9tIFwiLi9oZWxwZXJzXCJcbmltcG9ydCB7IGhhc1JlbW90ZVNvdXJjZSB9IGZyb20gXCIuLi8uLi91dGlsL2V4dC1zb3VyY2UtdXRpbFwiXG5cbmNvbnN0IHVwZGF0ZVJlbW90ZU1vZHVsZXNBcmd1bWVudHMgPSB7XG4gIG1vZHVsZTogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiTmFtZSBvZiB0aGUgcmVtb3RlIG1vZHVsZShzKSB0byB1cGRhdGUuIFVzZSBjb21tYSBzZXBhcmF0b3IgdG8gc3BlY2lmeSBtdWx0aXBsZSBtb2R1bGVzLlwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIHVwZGF0ZVJlbW90ZU1vZHVsZXNBcmd1bWVudHNcblxuZXhwb3J0IGNsYXNzIFVwZGF0ZVJlbW90ZU1vZHVsZXNDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzPiB7XG4gIG5hbWUgPSBcIm1vZHVsZXNcIlxuICBoZWxwID0gXCJVcGRhdGUgcmVtb3RlIG1vZHVsZXMuXCJcbiAgYXJndW1lbnRzID0gdXBkYXRlUmVtb3RlTW9kdWxlc0FyZ3VtZW50c1xuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIFJlbW90ZSBtb2R1bGVzIGFyZSBtb2R1bGVzIHRoYXQgaGF2ZSBhIHJlcG9zaXRvcnlVcmwgZmllbGRcbiAgICBpbiB0aGVpciBnYXJkZW4ueW1sIGNvbmZpZyB0aGF0IHBvaW50cyB0byBhIHJlbW90ZSByZXBvc2l0b3J5LlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIHVwZGF0ZS1yZW1vdGUgbW9kdWxlcyAgICAgICAgICAgICMgdXBkYXRlIGFsbCByZW1vdGUgbW9kdWxlcyBpbiB0aGUgcHJvamVjdFxuICAgICAgICBnYXJkZW4gdXBkYXRlLXJlbW90ZSBtb2R1bGVzIG15LW1vZHVsZSAgIyB1cGRhdGUgcmVtb3RlIG1vZHVsZSBteS1tb2R1bGVcbiAgYFxuXG4gIGFzeW5jIGFjdGlvbihcbiAgICB7IGdhcmRlbiwgYXJncyB9OiBDb21tYW5kUGFyYW1zPEFyZ3M+LFxuICApOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8U291cmNlQ29uZmlnW10+PiB7XG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJoYW1tZXJfYW5kX3dyZW5jaFwiLCBjb21tYW5kOiBcInVwZGF0ZS1yZW1vdGUgbW9kdWxlc1wiIH0pXG5cbiAgICBjb25zdCB7IG1vZHVsZSB9ID0gYXJnc1xuICAgIGNvbnN0IG1vZHVsZXMgPSBhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlcyhtb2R1bGUpXG5cbiAgICBjb25zdCBtb2R1bGVTb3VyY2VzID0gPFNvdXJjZUNvbmZpZ1tdPm1vZHVsZXNcbiAgICAgIC5maWx0ZXIoaGFzUmVtb3RlU291cmNlKVxuICAgICAgLmZpbHRlcihzcmMgPT4gbW9kdWxlID8gbW9kdWxlLmluY2x1ZGVzKHNyYy5uYW1lKSA6IHRydWUpXG5cbiAgICBjb25zdCBuYW1lcyA9IG1vZHVsZVNvdXJjZXMubWFwKHNyYyA9PiBzcmMubmFtZSlcblxuICAgIGNvbnN0IGRpZmYgPSBkaWZmZXJlbmNlKG1vZHVsZSwgbmFtZXMpXG4gICAgaWYgKGRpZmYubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbW9kdWxlc1dpdGhSZW1vdGVTb3VyY2UgPSAoYXdhaXQgZ2FyZGVuLmdldE1vZHVsZXMoKSkuZmlsdGVyKGhhc1JlbW90ZVNvdXJjZSkuc29ydCgpXG5cbiAgICAgIHRocm93IG5ldyBQYXJhbWV0ZXJFcnJvcihcbiAgICAgICAgYEV4cGVjdGVkIG1vZHVsZShzKSAke2NoYWxrLnVuZGVybGluZShkaWZmLmpvaW4oXCIsXCIpKX0gdG8gaGF2ZSBhIHJlbW90ZSBzb3VyY2UuYCxcbiAgICAgICAge1xuICAgICAgICAgIG1vZHVsZXNXaXRoUmVtb3RlU291cmNlLFxuICAgICAgICAgIGlucHV0OiBtb2R1bGUgPyBtb2R1bGUuc29ydCgpIDogdW5kZWZpbmVkLFxuICAgICAgICB9LFxuICAgICAgKVxuICAgIH1cblxuICAgIC8vIFRPRE8gVXBkYXRlIHJlbW90ZXMgaW4gcGFyYWxsZWwuIEN1cnJlbnRseSBub3QgcG9zc2libGUgc2luY2UgdXBkYXRpbmcgbWlnaHRcbiAgICAvLyB0cmlnZ2VyIGEgdXNlcm5hbWUgYW5kIHBhc3N3b3JkIHByb21wdCBmcm9tIGdpdC5cbiAgICBmb3IgKGNvbnN0IHsgbmFtZSwgcmVwb3NpdG9yeVVybCB9IG9mIG1vZHVsZVNvdXJjZXMpIHtcbiAgICAgIGF3YWl0IGdhcmRlbi52Y3MudXBkYXRlUmVtb3RlU291cmNlKHsgbmFtZSwgdXJsOiByZXBvc2l0b3J5VXJsLCBzb3VyY2VUeXBlOiBcIm1vZHVsZVwiLCBsb2dFbnRyeTogZ2FyZGVuLmxvZyB9KVxuICAgIH1cblxuICAgIGF3YWl0IHBydW5lUmVtb3RlU291cmNlcyh7IHByb2plY3RSb290OiBnYXJkZW4ucHJvamVjdFJvb3QsIHR5cGU6IFwibW9kdWxlXCIsIHNvdXJjZXM6IG1vZHVsZVNvdXJjZXMgfSlcblxuICAgIHJldHVybiB7IHJlc3VsdDogbW9kdWxlU291cmNlcyB9XG4gIH1cbn1cbiJdfQ==
