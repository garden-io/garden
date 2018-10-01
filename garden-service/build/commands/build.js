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
const build_1 = require("../tasks/build");
const dedent = require("dedent");
const process_1 = require("../process");
const watch_1 = require("../watch");
const buildArguments = {
    module: new base_1.StringsParameter({
        help: "Specify module(s) to build. Use comma separator to specify multiple modules.",
    }),
};
const buildOptions = {
    force: new base_1.BooleanParameter({ help: "Force rebuild of module(s)." }),
    watch: new base_1.BooleanParameter({ help: "Watch for changes in module(s) and auto-build.", alias: "w" }),
};
class BuildCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "build";
        this.help = "Build your modules.";
        this.description = dedent `
    Builds all or specified modules, taking into account build dependency order.
    Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

    Examples:

        garden build            # build all modules in the project
        garden build my-module  # only build my-module
        garden build --force    # force rebuild of modules
        garden build --watch    # watch for changes to code
  `;
        this.arguments = buildArguments;
        this.options = buildOptions;
    }
    action({ args, opts, garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            yield garden.clearBuilds();
            const autoReloadDependants = yield watch_1.computeAutoReloadDependants(garden);
            const modules = yield garden.getModules(args.module);
            const moduleNames = modules.map(m => m.name);
            garden.log.header({ emoji: "hammer", command: "Build" });
            const results = yield process_1.processModules({
                garden,
                modules,
                watch: opts.watch,
                handler: (module) => __awaiter(this, void 0, void 0, function* () { return [new build_1.BuildTask({ garden, module, force: opts.force })]; }),
                changeHandler: (module) => __awaiter(this, void 0, void 0, function* () {
                    return (yield watch_1.withDependants(garden, [module], autoReloadDependants))
                        .filter(m => moduleNames.includes(m.name))
                        .map(m => new build_1.BuildTask({ garden, module: m, force: true }));
                }),
            });
            return base_1.handleTaskResults(garden, "build", results);
        });
    }
}
exports.BuildCommand = BuildCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2J1aWxkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FPZTtBQUNmLDBDQUEwQztBQUUxQyxpQ0FBaUM7QUFDakMsd0NBQTJDO0FBQzNDLG9DQUFzRTtBQUd0RSxNQUFNLGNBQWMsR0FBRztJQUNyQixNQUFNLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUMzQixJQUFJLEVBQUUsOEVBQThFO0tBQ3JGLENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxZQUFZLEdBQUc7SUFDbkIsS0FBSyxFQUFFLElBQUksdUJBQWdCLENBQUMsRUFBRSxJQUFJLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQztJQUNwRSxLQUFLLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSxnREFBZ0QsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUM7Q0FDcEcsQ0FBQTtBQUtELE1BQWEsWUFBYSxTQUFRLGNBQXFDO0lBQXZFOztRQUNFLFNBQUksR0FBRyxPQUFPLENBQUE7UUFDZCxTQUFJLEdBQUcscUJBQXFCLENBQUE7UUFFNUIsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7Ozs7R0FVbkIsQ0FBQTtRQUVELGNBQVMsR0FBRyxjQUFjLENBQUE7UUFDMUIsWUFBTyxHQUFHLFlBQVksQ0FBQTtJQTRCeEIsQ0FBQztJQTFCTyxNQUFNLENBQ1YsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBK0M7O1lBR25FLE1BQU0sTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFBO1lBRTFCLE1BQU0sb0JBQW9CLEdBQUcsTUFBTSxtQ0FBMkIsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN0RSxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3BELE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUE7WUFFNUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFBO1lBRXhELE1BQU0sT0FBTyxHQUFHLE1BQU0sd0JBQWMsQ0FBQztnQkFDbkMsTUFBTTtnQkFDTixPQUFPO2dCQUNQLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsT0FBTyxFQUFFLENBQU8sTUFBTSxFQUFFLEVBQUUsZ0RBQUMsT0FBQSxDQUFDLElBQUksaUJBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUEsR0FBQTtnQkFDakYsYUFBYSxFQUFFLENBQU8sTUFBYyxFQUFFLEVBQUU7b0JBQ3RDLE9BQU8sQ0FBQyxNQUFNLHNCQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsb0JBQW9CLENBQUMsQ0FBQzt5QkFDbEUsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7eUJBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksaUJBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUE7Z0JBQ2hFLENBQUMsQ0FBQTthQUNGLENBQUMsQ0FBQTtZQUVGLE9BQU8sd0JBQWlCLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQTtRQUNwRCxDQUFDO0tBQUE7Q0FDRjtBQTdDRCxvQ0E2Q0MiLCJmaWxlIjoiY29tbWFuZHMvYnVpbGQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHtcbiAgQm9vbGVhblBhcmFtZXRlcixcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgaGFuZGxlVGFza1Jlc3VsdHMsXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHsgQnVpbGRUYXNrIH0gZnJvbSBcIi4uL3Rhc2tzL2J1aWxkXCJcbmltcG9ydCB7IFRhc2tSZXN1bHRzIH0gZnJvbSBcIi4uL3Rhc2stZ3JhcGhcIlxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcbmltcG9ydCB7IHByb2Nlc3NNb2R1bGVzIH0gZnJvbSBcIi4uL3Byb2Nlc3NcIlxuaW1wb3J0IHsgY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzLCB3aXRoRGVwZW5kYW50cyB9IGZyb20gXCIuLi93YXRjaFwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcblxuY29uc3QgYnVpbGRBcmd1bWVudHMgPSB7XG4gIG1vZHVsZTogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiU3BlY2lmeSBtb2R1bGUocykgdG8gYnVpbGQuIFVzZSBjb21tYSBzZXBhcmF0b3IgdG8gc3BlY2lmeSBtdWx0aXBsZSBtb2R1bGVzLlwiLFxuICB9KSxcbn1cblxuY29uc3QgYnVpbGRPcHRpb25zID0ge1xuICBmb3JjZTogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoeyBoZWxwOiBcIkZvcmNlIHJlYnVpbGQgb2YgbW9kdWxlKHMpLlwiIH0pLFxuICB3YXRjaDogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoeyBoZWxwOiBcIldhdGNoIGZvciBjaGFuZ2VzIGluIG1vZHVsZShzKSBhbmQgYXV0by1idWlsZC5cIiwgYWxpYXM6IFwid1wiIH0pLFxufVxuXG50eXBlIEJ1aWxkQXJndW1lbnRzID0gdHlwZW9mIGJ1aWxkQXJndW1lbnRzXG50eXBlIEJ1aWxkT3B0aW9ucyA9IHR5cGVvZiBidWlsZE9wdGlvbnNcblxuZXhwb3J0IGNsYXNzIEJ1aWxkQ29tbWFuZCBleHRlbmRzIENvbW1hbmQ8QnVpbGRBcmd1bWVudHMsIEJ1aWxkT3B0aW9ucz4ge1xuICBuYW1lID0gXCJidWlsZFwiXG4gIGhlbHAgPSBcIkJ1aWxkIHlvdXIgbW9kdWxlcy5cIlxuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIEJ1aWxkcyBhbGwgb3Igc3BlY2lmaWVkIG1vZHVsZXMsIHRha2luZyBpbnRvIGFjY291bnQgYnVpbGQgZGVwZW5kZW5jeSBvcmRlci5cbiAgICBPcHRpb25hbGx5IHN0YXlzIHJ1bm5pbmcgYW5kIGF1dG9tYXRpY2FsbHkgYnVpbGRzIG1vZHVsZXMgaWYgdGhlaXIgc291cmNlIChvciB0aGVpciBkZXBlbmRlbmNpZXMnIHNvdXJjZXMpIGNoYW5nZS5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBidWlsZCAgICAgICAgICAgICMgYnVpbGQgYWxsIG1vZHVsZXMgaW4gdGhlIHByb2plY3RcbiAgICAgICAgZ2FyZGVuIGJ1aWxkIG15LW1vZHVsZSAgIyBvbmx5IGJ1aWxkIG15LW1vZHVsZVxuICAgICAgICBnYXJkZW4gYnVpbGQgLS1mb3JjZSAgICAjIGZvcmNlIHJlYnVpbGQgb2YgbW9kdWxlc1xuICAgICAgICBnYXJkZW4gYnVpbGQgLS13YXRjaCAgICAjIHdhdGNoIGZvciBjaGFuZ2VzIHRvIGNvZGVcbiAgYFxuXG4gIGFyZ3VtZW50cyA9IGJ1aWxkQXJndW1lbnRzXG4gIG9wdGlvbnMgPSBidWlsZE9wdGlvbnNcblxuICBhc3luYyBhY3Rpb24oXG4gICAgeyBhcmdzLCBvcHRzLCBnYXJkZW4gfTogQ29tbWFuZFBhcmFtczxCdWlsZEFyZ3VtZW50cywgQnVpbGRPcHRpb25zPixcbiAgKTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFRhc2tSZXN1bHRzPj4ge1xuXG4gICAgYXdhaXQgZ2FyZGVuLmNsZWFyQnVpbGRzKClcblxuICAgIGNvbnN0IGF1dG9SZWxvYWREZXBlbmRhbnRzID0gYXdhaXQgY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzKGdhcmRlbilcbiAgICBjb25zdCBtb2R1bGVzID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZXMoYXJncy5tb2R1bGUpXG4gICAgY29uc3QgbW9kdWxlTmFtZXMgPSBtb2R1bGVzLm1hcChtID0+IG0ubmFtZSlcblxuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwiaGFtbWVyXCIsIGNvbW1hbmQ6IFwiQnVpbGRcIiB9KVxuXG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHByb2Nlc3NNb2R1bGVzKHtcbiAgICAgIGdhcmRlbixcbiAgICAgIG1vZHVsZXMsXG4gICAgICB3YXRjaDogb3B0cy53YXRjaCxcbiAgICAgIGhhbmRsZXI6IGFzeW5jIChtb2R1bGUpID0+IFtuZXcgQnVpbGRUYXNrKHsgZ2FyZGVuLCBtb2R1bGUsIGZvcmNlOiBvcHRzLmZvcmNlIH0pXSxcbiAgICAgIGNoYW5nZUhhbmRsZXI6IGFzeW5jIChtb2R1bGU6IE1vZHVsZSkgPT4ge1xuICAgICAgICByZXR1cm4gKGF3YWl0IHdpdGhEZXBlbmRhbnRzKGdhcmRlbiwgW21vZHVsZV0sIGF1dG9SZWxvYWREZXBlbmRhbnRzKSlcbiAgICAgICAgICAuZmlsdGVyKG0gPT4gbW9kdWxlTmFtZXMuaW5jbHVkZXMobS5uYW1lKSlcbiAgICAgICAgICAubWFwKG0gPT4gbmV3IEJ1aWxkVGFzayh7IGdhcmRlbiwgbW9kdWxlOiBtLCBmb3JjZTogdHJ1ZSB9KSlcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIHJldHVybiBoYW5kbGVUYXNrUmVzdWx0cyhnYXJkZW4sIFwiYnVpbGRcIiwgcmVzdWx0cylcbiAgfVxufVxuIl19
