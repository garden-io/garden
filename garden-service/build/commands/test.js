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
const base_1 = require("./base");
const process_1 = require("../process");
const test_1 = require("../tasks/test");
const watch_1 = require("../watch");
const testArgs = {
    module: new base_1.StringsParameter({
        help: "The name of the module(s) to deploy (skip to test all modules). " +
            "Use comma as separator to specify multiple modules.",
    }),
};
const testOpts = {
    name: new base_1.StringOption({
        help: "Only run tests with the specfied name (e.g. unit or integ).",
        alias: "n",
    }),
    force: new base_1.BooleanParameter({ help: "Force re-test of module(s).", alias: "f" }),
    "force-build": new base_1.BooleanParameter({ help: "Force rebuild of module(s)." }),
    watch: new base_1.BooleanParameter({ help: "Watch for changes in module(s) and auto-test.", alias: "w" }),
};
class TestCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "test";
        this.help = "Test all or specified modules.";
        this.description = `
    Runs all or specified tests defined in the project. Also builds modules and dependencies,
    and deploy service dependencies if needed.

    Optionally stays running and automatically re-runs tests if their module source
    (or their dependencies' sources) change.

    Examples:

        garden test              # run all tests in the project
        garden test my-module    # run all tests in the my-module module
        garden test -n integ     # run all tests with the name 'integ' in the project
        garden test --force      # force tests to be re-run, even if they're already run successfully
        garden test --watch      # watch for changes to code
  `;
        this.arguments = testArgs;
        this.options = testOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const autoReloadDependants = yield watch_1.computeAutoReloadDependants(garden);
            let modules;
            if (args.module) {
                modules = yield watch_1.withDependants(garden, yield garden.getModules(args.module), autoReloadDependants);
            }
            else {
                // All modules are included in this case, so there's no need to compute dependants.
                modules = yield garden.getModules();
            }
            garden.log.header({
                emoji: "thermometer",
                command: `Running tests`,
            });
            yield garden.actions.prepareEnvironment({});
            const name = opts.name;
            const force = opts.force;
            const forceBuild = opts["force-build"];
            const results = yield process_1.processModules({
                garden,
                modules,
                watch: opts.watch,
                handler: (module) => __awaiter(this, void 0, void 0, function* () { return getTestTasks({ garden, module, name, force, forceBuild }); }),
                changeHandler: (module) => __awaiter(this, void 0, void 0, function* () {
                    const modulesToProcess = yield watch_1.withDependants(garden, [module], autoReloadDependants);
                    return lodash_1.flatten(yield Bluebird.map(modulesToProcess, m => getTestTasks({ garden, module: m, name, force, forceBuild })));
                }),
            });
            return base_1.handleTaskResults(garden, "test", results);
        });
    }
}
exports.TestCommand = TestCommand;
function getTestTasks({ garden, module, name, force = false, forceBuild = false }) {
    return __awaiter(this, void 0, void 0, function* () {
        const tasks = [];
        for (const test of module.testConfigs) {
            if (name && test.name !== name) {
                continue;
            }
            tasks.push(test_1.TestTask.factory({
                garden,
                force,
                forceBuild,
                testConfig: test,
                module,
            }));
        }
        return Bluebird.all(tasks);
    });
}
exports.getTestTasks = getTestTasks;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QUFPLENBQUMsTUFBTSxRQUFRLENBQUMsR0FBRyxDQUMvQixnQkFBZ0IsRUFDaEIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO2dCQUN2RSxDQUFDLENBQUE7YUFDRixDQUFDLENBQUE7WUFFRixPQUFPLHdCQUFpQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7UUFDbkQsQ0FBQztLQUFBO0NBQ0Y7QUEzREQsa0NBMkRDO0FBRUQsU0FBc0IsWUFBWSxDQUNoQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssR0FBRyxLQUFLLEVBQUUsVUFBVSxHQUFHLEtBQUssRUFDaUM7O1FBRTFGLE1BQU0sS0FBSyxHQUF3QixFQUFFLENBQUE7UUFFckMsS0FBSyxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsV0FBVyxFQUFFO1lBQ3JDLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxFQUFFO2dCQUM5QixTQUFRO2FBQ1Q7WUFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLGVBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQzFCLE1BQU07Z0JBQ04sS0FBSztnQkFDTCxVQUFVO2dCQUNWLFVBQVUsRUFBRSxJQUFJO2dCQUNoQixNQUFNO2FBQ1AsQ0FBQyxDQUFDLENBQUE7U0FDSjtRQUVELE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQTtJQUM1QixDQUFDO0NBQUE7QUFwQkQsb0NBb0JDIiwiZmlsZSI6ImNvbW1hbmRzL3Rlc3QuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCB7IGZsYXR0ZW4gfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7XG4gIEJvb2xlYW5QYXJhbWV0ZXIsXG4gIENvbW1hbmQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIENvbW1hbmRSZXN1bHQsXG4gIGhhbmRsZVRhc2tSZXN1bHRzLFxuICBTdHJpbmdPcHRpb24sXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHsgVGFza1Jlc3VsdHMgfSBmcm9tIFwiLi4vdGFzay1ncmFwaFwiXG5pbXBvcnQgeyBwcm9jZXNzTW9kdWxlcyB9IGZyb20gXCIuLi9wcm9jZXNzXCJcbmltcG9ydCB7IE1vZHVsZSB9IGZyb20gXCIuLi90eXBlcy9tb2R1bGVcIlxuaW1wb3J0IHsgVGVzdFRhc2sgfSBmcm9tIFwiLi4vdGFza3MvdGVzdFwiXG5pbXBvcnQgeyBjb21wdXRlQXV0b1JlbG9hZERlcGVuZGFudHMsIHdpdGhEZXBlbmRhbnRzIH0gZnJvbSBcIi4uL3dhdGNoXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuXG5jb25zdCB0ZXN0QXJncyA9IHtcbiAgbW9kdWxlOiBuZXcgU3RyaW5nc1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJUaGUgbmFtZSBvZiB0aGUgbW9kdWxlKHMpIHRvIGRlcGxveSAoc2tpcCB0byB0ZXN0IGFsbCBtb2R1bGVzKS4gXCIgK1xuICAgICAgXCJVc2UgY29tbWEgYXMgc2VwYXJhdG9yIHRvIHNwZWNpZnkgbXVsdGlwbGUgbW9kdWxlcy5cIixcbiAgfSksXG59XG5cbmNvbnN0IHRlc3RPcHRzID0ge1xuICBuYW1lOiBuZXcgU3RyaW5nT3B0aW9uKHtcbiAgICBoZWxwOiBcIk9ubHkgcnVuIHRlc3RzIHdpdGggdGhlIHNwZWNmaWVkIG5hbWUgKGUuZy4gdW5pdCBvciBpbnRlZykuXCIsXG4gICAgYWxpYXM6IFwiblwiLFxuICB9KSxcbiAgZm9yY2U6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJGb3JjZSByZS10ZXN0IG9mIG1vZHVsZShzKS5cIiwgYWxpYXM6IFwiZlwiIH0pLFxuICBcImZvcmNlLWJ1aWxkXCI6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJGb3JjZSByZWJ1aWxkIG9mIG1vZHVsZShzKS5cIiB9KSxcbiAgd2F0Y2g6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJXYXRjaCBmb3IgY2hhbmdlcyBpbiBtb2R1bGUocykgYW5kIGF1dG8tdGVzdC5cIiwgYWxpYXM6IFwid1wiIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgdGVzdEFyZ3NcbnR5cGUgT3B0cyA9IHR5cGVvZiB0ZXN0T3B0c1xuXG5leHBvcnQgY2xhc3MgVGVzdENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPEFyZ3MsIE9wdHM+IHtcbiAgbmFtZSA9IFwidGVzdFwiXG4gIGhlbHAgPSBcIlRlc3QgYWxsIG9yIHNwZWNpZmllZCBtb2R1bGVzLlwiXG5cbiAgZGVzY3JpcHRpb24gPSBgXG4gICAgUnVucyBhbGwgb3Igc3BlY2lmaWVkIHRlc3RzIGRlZmluZWQgaW4gdGhlIHByb2plY3QuIEFsc28gYnVpbGRzIG1vZHVsZXMgYW5kIGRlcGVuZGVuY2llcyxcbiAgICBhbmQgZGVwbG95IHNlcnZpY2UgZGVwZW5kZW5jaWVzIGlmIG5lZWRlZC5cblxuICAgIE9wdGlvbmFsbHkgc3RheXMgcnVubmluZyBhbmQgYXV0b21hdGljYWxseSByZS1ydW5zIHRlc3RzIGlmIHRoZWlyIG1vZHVsZSBzb3VyY2VcbiAgICAob3IgdGhlaXIgZGVwZW5kZW5jaWVzJyBzb3VyY2VzKSBjaGFuZ2UuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gdGVzdCAgICAgICAgICAgICAgIyBydW4gYWxsIHRlc3RzIGluIHRoZSBwcm9qZWN0XG4gICAgICAgIGdhcmRlbiB0ZXN0IG15LW1vZHVsZSAgICAjIHJ1biBhbGwgdGVzdHMgaW4gdGhlIG15LW1vZHVsZSBtb2R1bGVcbiAgICAgICAgZ2FyZGVuIHRlc3QgLW4gaW50ZWcgICAgICMgcnVuIGFsbCB0ZXN0cyB3aXRoIHRoZSBuYW1lICdpbnRlZycgaW4gdGhlIHByb2plY3RcbiAgICAgICAgZ2FyZGVuIHRlc3QgLS1mb3JjZSAgICAgICMgZm9yY2UgdGVzdHMgdG8gYmUgcmUtcnVuLCBldmVuIGlmIHRoZXkncmUgYWxyZWFkeSBydW4gc3VjY2Vzc2Z1bGx5XG4gICAgICAgIGdhcmRlbiB0ZXN0IC0td2F0Y2ggICAgICAjIHdhdGNoIGZvciBjaGFuZ2VzIHRvIGNvZGVcbiAgYFxuXG4gIGFyZ3VtZW50cyA9IHRlc3RBcmdzXG4gIG9wdGlvbnMgPSB0ZXN0T3B0c1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFRhc2tSZXN1bHRzPj4ge1xuICAgIGNvbnN0IGF1dG9SZWxvYWREZXBlbmRhbnRzID0gYXdhaXQgY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzKGdhcmRlbilcbiAgICBsZXQgbW9kdWxlczogTW9kdWxlW11cbiAgICBpZiAoYXJncy5tb2R1bGUpIHtcbiAgICAgIG1vZHVsZXMgPSBhd2FpdCB3aXRoRGVwZW5kYW50cyhnYXJkZW4sIGF3YWl0IGdhcmRlbi5nZXRNb2R1bGVzKGFyZ3MubW9kdWxlKSwgYXV0b1JlbG9hZERlcGVuZGFudHMpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEFsbCBtb2R1bGVzIGFyZSBpbmNsdWRlZCBpbiB0aGlzIGNhc2UsIHNvIHRoZXJlJ3Mgbm8gbmVlZCB0byBjb21wdXRlIGRlcGVuZGFudHMuXG4gICAgICBtb2R1bGVzID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZXMoKVxuICAgIH1cblxuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHtcbiAgICAgIGVtb2ppOiBcInRoZXJtb21ldGVyXCIsXG4gICAgICBjb21tYW5kOiBgUnVubmluZyB0ZXN0c2AsXG4gICAgfSlcblxuICAgIGF3YWl0IGdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7fSlcblxuICAgIGNvbnN0IG5hbWUgPSBvcHRzLm5hbWVcbiAgICBjb25zdCBmb3JjZSA9IG9wdHMuZm9yY2VcbiAgICBjb25zdCBmb3JjZUJ1aWxkID0gb3B0c1tcImZvcmNlLWJ1aWxkXCJdXG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcHJvY2Vzc01vZHVsZXMoe1xuICAgICAgZ2FyZGVuLFxuICAgICAgbW9kdWxlcyxcbiAgICAgIHdhdGNoOiBvcHRzLndhdGNoLFxuICAgICAgaGFuZGxlcjogYXN5bmMgKG1vZHVsZSkgPT4gZ2V0VGVzdFRhc2tzKHsgZ2FyZGVuLCBtb2R1bGUsIG5hbWUsIGZvcmNlLCBmb3JjZUJ1aWxkIH0pLFxuICAgICAgY2hhbmdlSGFuZGxlcjogYXN5bmMgKG1vZHVsZSkgPT4ge1xuICAgICAgICBjb25zdCBtb2R1bGVzVG9Qcm9jZXNzID0gYXdhaXQgd2l0aERlcGVuZGFudHMoZ2FyZGVuLCBbbW9kdWxlXSwgYXV0b1JlbG9hZERlcGVuZGFudHMpXG4gICAgICAgIHJldHVybiBmbGF0dGVuKGF3YWl0IEJsdWViaXJkLm1hcChcbiAgICAgICAgICBtb2R1bGVzVG9Qcm9jZXNzLFxuICAgICAgICAgIG0gPT4gZ2V0VGVzdFRhc2tzKHsgZ2FyZGVuLCBtb2R1bGU6IG0sIG5hbWUsIGZvcmNlLCBmb3JjZUJ1aWxkIH0pKSlcbiAgICAgIH0sXG4gICAgfSlcblxuICAgIHJldHVybiBoYW5kbGVUYXNrUmVzdWx0cyhnYXJkZW4sIFwidGVzdFwiLCByZXN1bHRzKVxuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRUZXN0VGFza3MoXG4gIHsgZ2FyZGVuLCBtb2R1bGUsIG5hbWUsIGZvcmNlID0gZmFsc2UsIGZvcmNlQnVpbGQgPSBmYWxzZSB9OlxuICAgIHsgZ2FyZGVuOiBHYXJkZW4sIG1vZHVsZTogTW9kdWxlLCBuYW1lPzogc3RyaW5nLCBmb3JjZT86IGJvb2xlYW4sIGZvcmNlQnVpbGQ/OiBib29sZWFuIH0sXG4pIHtcbiAgY29uc3QgdGFza3M6IFByb21pc2U8VGVzdFRhc2s+W10gPSBbXVxuXG4gIGZvciAoY29uc3QgdGVzdCBvZiBtb2R1bGUudGVzdENvbmZpZ3MpIHtcbiAgICBpZiAobmFtZSAmJiB0ZXN0Lm5hbWUgIT09IG5hbWUpIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIHRhc2tzLnB1c2goVGVzdFRhc2suZmFjdG9yeSh7XG4gICAgICBnYXJkZW4sXG4gICAgICBmb3JjZSxcbiAgICAgIGZvcmNlQnVpbGQsXG4gICAgICB0ZXN0Q29uZmlnOiB0ZXN0LFxuICAgICAgbW9kdWxlLFxuICAgIH0pKVxuICB9XG5cbiAgcmV0dXJuIEJsdWViaXJkLmFsbCh0YXNrcylcbn1cbiJdfQ==
