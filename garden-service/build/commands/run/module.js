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
const chalk_1 = require("chalk");
const build_1 = require("../../tasks/build");
const base_1 = require("../base");
const lodash_1 = require("lodash");
const run_1 = require("./run");
const dedent = require("dedent");
const service_1 = require("../../types/service");
const runArgs = {
    module: new base_1.StringParameter({
        help: "The name of the module to run.",
        required: true,
    }),
    // TODO: make this a variadic arg
    command: new base_1.StringsParameter({
        help: "The command to run in the module.",
    }),
};
const runOpts = {
    // TODO: we could provide specific parameters like this by adding commands for specific modules, via plugins
    //entrypoint: new StringParameter({ help: "Override default entrypoint in module" }),
    interactive: new base_1.BooleanParameter({
        help: "Set to false to skip interactive mode and just output the command result.",
        defaultValue: true,
    }),
    "force-build": new base_1.BooleanParameter({ help: "Force rebuild of module before running." }),
};
class RunModuleCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "module";
        this.alias = "m";
        this.help = "Run an ad-hoc instance of a module.";
        this.description = dedent `
    This is useful for debugging or ad-hoc experimentation with modules.

    Examples:

        garden run module my-container           # run an ad-hoc instance of a my-container container and attach to it
        garden run module my-container /bin/sh   # run an interactive shell in a new my-container container
        garden run module my-container --i=false /some/script  # execute a script in my-container and return the output
  `;
        this.arguments = runArgs;
        this.options = runOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const moduleName = args.module;
            const module = yield garden.getModule(moduleName);
            const msg = args.command
                ? `Running command ${chalk_1.default.white(args.command.join(" "))} in module ${chalk_1.default.white(moduleName)}`
                : `Running module ${chalk_1.default.white(moduleName)}`;
            garden.log.header({
                emoji: "runner",
                command: msg,
            });
            yield garden.actions.prepareEnvironment({});
            const buildTask = new build_1.BuildTask({ garden, module, force: opts["force-build"] });
            yield garden.addTask(buildTask);
            yield garden.processTasks();
            const command = args.command || [];
            // combine all dependencies for all services in the module, to be sure we have all the context we need
            const depNames = lodash_1.uniq(lodash_1.flatten(module.serviceConfigs.map(s => s.dependencies)));
            const deps = yield garden.getServices(depNames);
            const runtimeContext = yield service_1.prepareRuntimeContext(garden, module, deps);
            run_1.printRuntimeContext(garden, runtimeContext);
            garden.log.info("");
            const result = yield garden.actions.runModule({
                module,
                command,
                runtimeContext,
                silent: false,
                interactive: opts.interactive,
            });
            return { result };
        });
    }
}
exports.RunModuleCommand = RunModuleCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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LEdBQUcsTUFBTSwrQkFBcUIsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFBO1lBRXhFLHlCQUFtQixDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQTtZQUUzQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUVuQixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDO2dCQUM1QyxNQUFNO2dCQUNOLE9BQU87Z0JBQ1AsY0FBYztnQkFDZCxNQUFNLEVBQUUsS0FBSztnQkFDYixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7YUFDOUIsQ0FBQyxDQUFBO1lBRUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFBO1FBQ25CLENBQUM7S0FBQTtDQUNGO0FBM0RELDRDQTJEQyIsImZpbGUiOiJjb21tYW5kcy9ydW4vbW9kdWxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgQnVpbGRUYXNrIH0gZnJvbSBcIi4uLy4uL3Rhc2tzL2J1aWxkXCJcbmltcG9ydCB7IFJ1blJlc3VsdCB9IGZyb20gXCIuLi8uLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQge1xuICBCb29sZWFuUGFyYW1ldGVyLFxuICBDb21tYW5kLFxuICBDb21tYW5kUGFyYW1zLFxuICBTdHJpbmdQYXJhbWV0ZXIsXG4gIENvbW1hbmRSZXN1bHQsXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuLi9iYXNlXCJcbmltcG9ydCB7XG4gIHVuaXEsXG4gIGZsYXR0ZW4sXG59IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgcHJpbnRSdW50aW1lQ29udGV4dCB9IGZyb20gXCIuL3J1blwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuaW1wb3J0IHsgcHJlcGFyZVJ1bnRpbWVDb250ZXh0IH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuXG5jb25zdCBydW5BcmdzID0ge1xuICBtb2R1bGU6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIG1vZHVsZSB0byBydW4uXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxuICAvLyBUT0RPOiBtYWtlIHRoaXMgYSB2YXJpYWRpYyBhcmdcbiAgY29tbWFuZDogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIGNvbW1hbmQgdG8gcnVuIGluIHRoZSBtb2R1bGUuXCIsXG4gIH0pLFxufVxuXG5jb25zdCBydW5PcHRzID0ge1xuICAvLyBUT0RPOiB3ZSBjb3VsZCBwcm92aWRlIHNwZWNpZmljIHBhcmFtZXRlcnMgbGlrZSB0aGlzIGJ5IGFkZGluZyBjb21tYW5kcyBmb3Igc3BlY2lmaWMgbW9kdWxlcywgdmlhIHBsdWdpbnNcbiAgLy9lbnRyeXBvaW50OiBuZXcgU3RyaW5nUGFyYW1ldGVyKHsgaGVscDogXCJPdmVycmlkZSBkZWZhdWx0IGVudHJ5cG9pbnQgaW4gbW9kdWxlXCIgfSksXG4gIGludGVyYWN0aXZlOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7XG4gICAgaGVscDogXCJTZXQgdG8gZmFsc2UgdG8gc2tpcCBpbnRlcmFjdGl2ZSBtb2RlIGFuZCBqdXN0IG91dHB1dCB0aGUgY29tbWFuZCByZXN1bHQuXCIsXG4gICAgZGVmYXVsdFZhbHVlOiB0cnVlLFxuICB9KSxcbiAgXCJmb3JjZS1idWlsZFwiOiBuZXcgQm9vbGVhblBhcmFtZXRlcih7IGhlbHA6IFwiRm9yY2UgcmVidWlsZCBvZiBtb2R1bGUgYmVmb3JlIHJ1bm5pbmcuXCIgfSksXG59XG5cbnR5cGUgQXJncyA9IHR5cGVvZiBydW5BcmdzXG50eXBlIE9wdHMgPSB0eXBlb2YgcnVuT3B0c1xuXG5leHBvcnQgY2xhc3MgUnVuTW9kdWxlQ29tbWFuZCBleHRlbmRzIENvbW1hbmQ8QXJncywgT3B0cz4ge1xuICBuYW1lID0gXCJtb2R1bGVcIlxuICBhbGlhcyA9IFwibVwiXG4gIGhlbHAgPSBcIlJ1biBhbiBhZC1ob2MgaW5zdGFuY2Ugb2YgYSBtb2R1bGUuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBUaGlzIGlzIHVzZWZ1bCBmb3IgZGVidWdnaW5nIG9yIGFkLWhvYyBleHBlcmltZW50YXRpb24gd2l0aCBtb2R1bGVzLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIHJ1biBtb2R1bGUgbXktY29udGFpbmVyICAgICAgICAgICAjIHJ1biBhbiBhZC1ob2MgaW5zdGFuY2Ugb2YgYSBteS1jb250YWluZXIgY29udGFpbmVyIGFuZCBhdHRhY2ggdG8gaXRcbiAgICAgICAgZ2FyZGVuIHJ1biBtb2R1bGUgbXktY29udGFpbmVyIC9iaW4vc2ggICAjIHJ1biBhbiBpbnRlcmFjdGl2ZSBzaGVsbCBpbiBhIG5ldyBteS1jb250YWluZXIgY29udGFpbmVyXG4gICAgICAgIGdhcmRlbiBydW4gbW9kdWxlIG15LWNvbnRhaW5lciAtLWk9ZmFsc2UgL3NvbWUvc2NyaXB0ICAjIGV4ZWN1dGUgYSBzY3JpcHQgaW4gbXktY29udGFpbmVyIGFuZCByZXR1cm4gdGhlIG91dHB1dFxuICBgXG5cbiAgYXJndW1lbnRzID0gcnVuQXJnc1xuICBvcHRpb25zID0gcnVuT3B0c1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFJ1blJlc3VsdD4+IHtcbiAgICBjb25zdCBtb2R1bGVOYW1lID0gYXJncy5tb2R1bGVcbiAgICBjb25zdCBtb2R1bGUgPSBhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlKG1vZHVsZU5hbWUpXG5cbiAgICBjb25zdCBtc2cgPSBhcmdzLmNvbW1hbmRcbiAgICAgID8gYFJ1bm5pbmcgY29tbWFuZCAke2NoYWxrLndoaXRlKGFyZ3MuY29tbWFuZC5qb2luKFwiIFwiKSl9IGluIG1vZHVsZSAke2NoYWxrLndoaXRlKG1vZHVsZU5hbWUpfWBcbiAgICAgIDogYFJ1bm5pbmcgbW9kdWxlICR7Y2hhbGsud2hpdGUobW9kdWxlTmFtZSl9YFxuXG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoe1xuICAgICAgZW1vamk6IFwicnVubmVyXCIsXG4gICAgICBjb21tYW5kOiBtc2csXG4gICAgfSlcblxuICAgIGF3YWl0IGdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7fSlcblxuICAgIGNvbnN0IGJ1aWxkVGFzayA9IG5ldyBCdWlsZFRhc2soeyBnYXJkZW4sIG1vZHVsZSwgZm9yY2U6IG9wdHNbXCJmb3JjZS1idWlsZFwiXSB9KVxuICAgIGF3YWl0IGdhcmRlbi5hZGRUYXNrKGJ1aWxkVGFzaylcbiAgICBhd2FpdCBnYXJkZW4ucHJvY2Vzc1Rhc2tzKClcblxuICAgIGNvbnN0IGNvbW1hbmQgPSBhcmdzLmNvbW1hbmQgfHwgW11cblxuICAgIC8vIGNvbWJpbmUgYWxsIGRlcGVuZGVuY2llcyBmb3IgYWxsIHNlcnZpY2VzIGluIHRoZSBtb2R1bGUsIHRvIGJlIHN1cmUgd2UgaGF2ZSBhbGwgdGhlIGNvbnRleHQgd2UgbmVlZFxuICAgIGNvbnN0IGRlcE5hbWVzID0gdW5pcShmbGF0dGVuKG1vZHVsZS5zZXJ2aWNlQ29uZmlncy5tYXAocyA9PiBzLmRlcGVuZGVuY2llcykpKVxuICAgIGNvbnN0IGRlcHMgPSBhd2FpdCBnYXJkZW4uZ2V0U2VydmljZXMoZGVwTmFtZXMpXG5cbiAgICBjb25zdCBydW50aW1lQ29udGV4dCA9IGF3YWl0IHByZXBhcmVSdW50aW1lQ29udGV4dChnYXJkZW4sIG1vZHVsZSwgZGVwcylcblxuICAgIHByaW50UnVudGltZUNvbnRleHQoZ2FyZGVuLCBydW50aW1lQ29udGV4dClcblxuICAgIGdhcmRlbi5sb2cuaW5mbyhcIlwiKVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2FyZGVuLmFjdGlvbnMucnVuTW9kdWxlKHtcbiAgICAgIG1vZHVsZSxcbiAgICAgIGNvbW1hbmQsXG4gICAgICBydW50aW1lQ29udGV4dCxcbiAgICAgIHNpbGVudDogZmFsc2UsXG4gICAgICBpbnRlcmFjdGl2ZTogb3B0cy5pbnRlcmFjdGl2ZSxcbiAgICB9KVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
