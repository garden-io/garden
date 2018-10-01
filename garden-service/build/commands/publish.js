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
const base_1 = require("./base");
const publish_1 = require("../tasks/publish");
const exceptions_1 = require("../exceptions");
const dedent = require("dedent");
const publishArgs = {
    module: new base_1.StringsParameter({
        help: "The name of the module(s) to publish (skip to publish all modules). " +
            "Use comma as separator to specify multiple modules.",
    }),
};
const publishOpts = {
    "force-build": new base_1.BooleanParameter({
        help: "Force rebuild of module(s) before publishing.",
    }),
    "allow-dirty": new base_1.BooleanParameter({
        help: "Allow publishing dirty builds (with untracked/uncommitted changes).",
    }),
};
class PublishCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "publish";
        this.help = "Build and publish module(s) to a remote registry.";
        this.description = dedent `
    Publishes built module artifacts for all or specified modules.
    Also builds modules and dependencies if needed.

    Examples:

        garden publish                # publish artifacts for all modules in the project
        garden publish my-container   # only publish my-container
        garden publish --force-build  # force re-build of modules before publishing artifacts
        garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)
  `;
        this.arguments = publishArgs;
        this.options = publishOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "rocket", command: "Publish modules" });
            const modules = yield garden.getModules(args.module);
            const results = yield publishModules(garden, modules, !!opts["force-build"], !!opts["allow-dirty"]);
            return base_1.handleTaskResults(garden, "publish", { taskResults: results });
        });
    }
}
exports.PublishCommand = PublishCommand;
function publishModules(garden, modules, forceBuild, allowDirty) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const module of modules) {
            const version = module.version;
            if (version.dirtyTimestamp && !allowDirty) {
                throw new exceptions_1.RuntimeError(`Module ${module.name} has uncommitted changes. ` +
                    `Please commit them, clean the module's source tree or set the --allow-dirty flag to override.`, { moduleName: module.name, version });
            }
            const task = new publish_1.PublishTask({ garden, module, forceBuild });
            yield garden.addTask(task);
        }
        return yield garden.processTasks();
    });
}
exports.publishModules = publishModules;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3B1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQU9lO0FBRWYsOENBQThDO0FBQzlDLDhDQUE0QztBQUc1QyxpQ0FBaUM7QUFFakMsTUFBTSxXQUFXLEdBQUc7SUFDbEIsTUFBTSxFQUFFLElBQUksdUJBQWdCLENBQUM7UUFDM0IsSUFBSSxFQUFFLHNFQUFzRTtZQUMxRSxxREFBcUQ7S0FDeEQsQ0FBQztDQUNILENBQUE7QUFFRCxNQUFNLFdBQVcsR0FBRztJQUNsQixhQUFhLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUNsQyxJQUFJLEVBQUUsK0NBQStDO0tBQ3RELENBQUM7SUFDRixhQUFhLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUNsQyxJQUFJLEVBQUUscUVBQXFFO0tBQzVFLENBQUM7Q0FDSCxDQUFBO0FBS0QsTUFBYSxjQUFlLFNBQVEsY0FBbUI7SUFBdkQ7O1FBQ0UsU0FBSSxHQUFHLFNBQVMsQ0FBQTtRQUNoQixTQUFJLEdBQUcsbURBQW1ELENBQUE7UUFFMUQsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7Ozs7R0FVbkIsQ0FBQTtRQUVELGNBQVMsR0FBRyxXQUFXLENBQUE7UUFDdkIsWUFBTyxHQUFHLFdBQVcsQ0FBQTtJQVd2QixDQUFDO0lBVE8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQTZCOztZQUM1RCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLENBQUMsQ0FBQTtZQUVsRSxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRXBELE1BQU0sT0FBTyxHQUFHLE1BQU0sY0FBYyxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUE7WUFFbkcsT0FBTyx3QkFBaUIsQ0FBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUE7UUFDdkUsQ0FBQztLQUFBO0NBQ0Y7QUE1QkQsd0NBNEJDO0FBRUQsU0FBc0IsY0FBYyxDQUNsQyxNQUFjLEVBQ2QsT0FBc0IsRUFDdEIsVUFBbUIsRUFDbkIsVUFBbUI7O1FBRW5CLEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFO1lBQzVCLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUE7WUFFOUIsSUFBSSxPQUFPLENBQUMsY0FBYyxJQUFJLENBQUMsVUFBVSxFQUFFO2dCQUN6QyxNQUFNLElBQUkseUJBQVksQ0FDcEIsVUFBVSxNQUFNLENBQUMsSUFBSSw0QkFBNEI7b0JBQ2pELCtGQUErRixFQUMvRixFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUNyQyxDQUFBO2FBQ0Y7WUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLHFCQUFXLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUE7WUFDNUQsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFBO1NBQzNCO1FBRUQsT0FBTyxNQUFNLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQTtJQUNwQyxDQUFDO0NBQUE7QUF0QkQsd0NBc0JDIiwiZmlsZSI6ImNvbW1hbmRzL3B1Ymxpc2guanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHtcbiAgQm9vbGVhblBhcmFtZXRlcixcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgaGFuZGxlVGFza1Jlc3VsdHMsXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBQdWJsaXNoVGFzayB9IGZyb20gXCIuLi90YXNrcy9wdWJsaXNoXCJcbmltcG9ydCB7IFJ1bnRpbWVFcnJvciB9IGZyb20gXCIuLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IFRhc2tSZXN1bHRzIH0gZnJvbSBcIi4uL3Rhc2stZ3JhcGhcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4uL2dhcmRlblwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5jb25zdCBwdWJsaXNoQXJncyA9IHtcbiAgbW9kdWxlOiBuZXcgU3RyaW5nc1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJUaGUgbmFtZSBvZiB0aGUgbW9kdWxlKHMpIHRvIHB1Ymxpc2ggKHNraXAgdG8gcHVibGlzaCBhbGwgbW9kdWxlcykuIFwiICtcbiAgICAgIFwiVXNlIGNvbW1hIGFzIHNlcGFyYXRvciB0byBzcGVjaWZ5IG11bHRpcGxlIG1vZHVsZXMuXCIsXG4gIH0pLFxufVxuXG5jb25zdCBwdWJsaXNoT3B0cyA9IHtcbiAgXCJmb3JjZS1idWlsZFwiOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7XG4gICAgaGVscDogXCJGb3JjZSByZWJ1aWxkIG9mIG1vZHVsZShzKSBiZWZvcmUgcHVibGlzaGluZy5cIixcbiAgfSksXG4gIFwiYWxsb3ctZGlydHlcIjogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiQWxsb3cgcHVibGlzaGluZyBkaXJ0eSBidWlsZHMgKHdpdGggdW50cmFja2VkL3VuY29tbWl0dGVkIGNoYW5nZXMpLlwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIHB1Ymxpc2hBcmdzXG50eXBlIE9wdHMgPSB0eXBlb2YgcHVibGlzaE9wdHNcblxuZXhwb3J0IGNsYXNzIFB1Ymxpc2hDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzLCBPcHRzPiB7XG4gIG5hbWUgPSBcInB1Ymxpc2hcIlxuICBoZWxwID0gXCJCdWlsZCBhbmQgcHVibGlzaCBtb2R1bGUocykgdG8gYSByZW1vdGUgcmVnaXN0cnkuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBQdWJsaXNoZXMgYnVpbHQgbW9kdWxlIGFydGlmYWN0cyBmb3IgYWxsIG9yIHNwZWNpZmllZCBtb2R1bGVzLlxuICAgIEFsc28gYnVpbGRzIG1vZHVsZXMgYW5kIGRlcGVuZGVuY2llcyBpZiBuZWVkZWQuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gcHVibGlzaCAgICAgICAgICAgICAgICAjIHB1Ymxpc2ggYXJ0aWZhY3RzIGZvciBhbGwgbW9kdWxlcyBpbiB0aGUgcHJvamVjdFxuICAgICAgICBnYXJkZW4gcHVibGlzaCBteS1jb250YWluZXIgICAjIG9ubHkgcHVibGlzaCBteS1jb250YWluZXJcbiAgICAgICAgZ2FyZGVuIHB1Ymxpc2ggLS1mb3JjZS1idWlsZCAgIyBmb3JjZSByZS1idWlsZCBvZiBtb2R1bGVzIGJlZm9yZSBwdWJsaXNoaW5nIGFydGlmYWN0c1xuICAgICAgICBnYXJkZW4gcHVibGlzaCAtLWFsbG93LWRpcnR5ICAjIGFsbG93IHB1Ymxpc2hpbmcgZGlydHkgYnVpbGRzICh3aGljaCBieSBkZWZhdWx0IHRyaWdnZXJzIGVycm9yKVxuICBgXG5cbiAgYXJndW1lbnRzID0gcHVibGlzaEFyZ3NcbiAgb3B0aW9ucyA9IHB1Ymxpc2hPcHRzXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuLCBhcmdzLCBvcHRzIH06IENvbW1hbmRQYXJhbXM8QXJncywgT3B0cz4pOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8VGFza1Jlc3VsdHM+PiB7XG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJyb2NrZXRcIiwgY29tbWFuZDogXCJQdWJsaXNoIG1vZHVsZXNcIiB9KVxuXG4gICAgY29uc3QgbW9kdWxlcyA9IGF3YWl0IGdhcmRlbi5nZXRNb2R1bGVzKGFyZ3MubW9kdWxlKVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHB1Ymxpc2hNb2R1bGVzKGdhcmRlbiwgbW9kdWxlcywgISFvcHRzW1wiZm9yY2UtYnVpbGRcIl0sICEhb3B0c1tcImFsbG93LWRpcnR5XCJdKVxuXG4gICAgcmV0dXJuIGhhbmRsZVRhc2tSZXN1bHRzKGdhcmRlbiwgXCJwdWJsaXNoXCIsIHsgdGFza1Jlc3VsdHM6IHJlc3VsdHMgfSlcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHVibGlzaE1vZHVsZXMoXG4gIGdhcmRlbjogR2FyZGVuLFxuICBtb2R1bGVzOiBNb2R1bGU8YW55PltdLFxuICBmb3JjZUJ1aWxkOiBib29sZWFuLFxuICBhbGxvd0RpcnR5OiBib29sZWFuLFxuKTogUHJvbWlzZTxUYXNrUmVzdWx0cz4ge1xuICBmb3IgKGNvbnN0IG1vZHVsZSBvZiBtb2R1bGVzKSB7XG4gICAgY29uc3QgdmVyc2lvbiA9IG1vZHVsZS52ZXJzaW9uXG5cbiAgICBpZiAodmVyc2lvbi5kaXJ0eVRpbWVzdGFtcCAmJiAhYWxsb3dEaXJ0eSkge1xuICAgICAgdGhyb3cgbmV3IFJ1bnRpbWVFcnJvcihcbiAgICAgICAgYE1vZHVsZSAke21vZHVsZS5uYW1lfSBoYXMgdW5jb21taXR0ZWQgY2hhbmdlcy4gYCArXG4gICAgICAgIGBQbGVhc2UgY29tbWl0IHRoZW0sIGNsZWFuIHRoZSBtb2R1bGUncyBzb3VyY2UgdHJlZSBvciBzZXQgdGhlIC0tYWxsb3ctZGlydHkgZmxhZyB0byBvdmVycmlkZS5gLFxuICAgICAgICB7IG1vZHVsZU5hbWU6IG1vZHVsZS5uYW1lLCB2ZXJzaW9uIH0sXG4gICAgICApXG4gICAgfVxuXG4gICAgY29uc3QgdGFzayA9IG5ldyBQdWJsaXNoVGFzayh7IGdhcmRlbiwgbW9kdWxlLCBmb3JjZUJ1aWxkIH0pXG4gICAgYXdhaXQgZ2FyZGVuLmFkZFRhc2sodGFzaylcbiAgfVxuXG4gIHJldHVybiBhd2FpdCBnYXJkZW4ucHJvY2Vzc1Rhc2tzKClcbn1cbiJdfQ==
