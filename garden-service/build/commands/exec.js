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
const logger_1 = require("../logger/logger");
const base_1 = require("./base");
const dedent = require("dedent");
const runArgs = {
    service: new base_1.StringParameter({
        help: "The service to exec the command in.",
        required: true,
    }),
    command: new base_1.StringsParameter({
        help: "The command to run.",
        required: true,
    }),
};
const runOpts = {
// interactive: new BooleanParameter({
//   help: "Set to false to skip interactive mode and just output the command result",
//   defaultValue: true,
// }),
};
class ExecCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "exec";
        this.alias = "e";
        this.help = "Executes a command (such as an interactive shell) in a running service.";
        this.description = dedent `
    Finds an active container for a deployed service and executes the given command within the container.
    Supports interactive shells.

    _NOTE: This command may not be supported for all module types._

    Examples:

         garden exec my-service /bin/sh   # runs a shell in the my-service container
  `;
        this.arguments = runArgs;
        this.options = runOpts;
        this.loggerType = logger_1.LoggerType.basic;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const serviceName = args.service;
            const command = args.command || [];
            garden.log.header({
                emoji: "runner",
                command: `Running command ${chalk_1.default.cyan(command.join(" "))} in service ${chalk_1.default.cyan(serviceName)}`,
            });
            const service = yield garden.getService(serviceName);
            const result = yield garden.actions.execInService({ service, command });
            return { result };
        });
    }
}
exports.ExecCommand = ExecCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2V4ZWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQUF5QjtBQUN6Qiw2Q0FBNkM7QUFFN0MsaUNBTWU7QUFDZixpQ0FBaUM7QUFFakMsTUFBTSxPQUFPLEdBQUc7SUFDZCxPQUFPLEVBQUUsSUFBSSxzQkFBZSxDQUFDO1FBQzNCLElBQUksRUFBRSxxQ0FBcUM7UUFDM0MsUUFBUSxFQUFFLElBQUk7S0FDZixDQUFDO0lBQ0YsT0FBTyxFQUFFLElBQUksdUJBQWdCLENBQUM7UUFDNUIsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxPQUFPLEdBQUc7QUFDZCxzQ0FBc0M7QUFDdEMsc0ZBQXNGO0FBQ3RGLHdCQUF3QjtBQUN4QixNQUFNO0NBQ1AsQ0FBQTtBQUlELE1BQWEsV0FBWSxTQUFRLGNBQWE7SUFBOUM7O1FBQ0UsU0FBSSxHQUFHLE1BQU0sQ0FBQTtRQUNiLFVBQUssR0FBRyxHQUFHLENBQUE7UUFDWCxTQUFJLEdBQUcseUVBQXlFLENBQUE7UUFFaEYsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7OztHQVNuQixDQUFBO1FBRUQsY0FBUyxHQUFHLE9BQU8sQ0FBQTtRQUNuQixZQUFPLEdBQUcsT0FBTyxDQUFBO1FBQ2pCLGVBQVUsR0FBRyxtQkFBVSxDQUFDLEtBQUssQ0FBQTtJQWdCL0IsQ0FBQztJQWRPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQXVCOztZQUNoRCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFBO1lBQ2hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFBO1lBRWxDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2dCQUNoQixLQUFLLEVBQUUsUUFBUTtnQkFDZixPQUFPLEVBQUUsbUJBQW1CLGVBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUU7YUFDbEcsQ0FBQyxDQUFBO1lBRUYsTUFBTSxPQUFPLEdBQUcsTUFBTSxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBQ3BELE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQTtZQUV2RSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUE7UUFDbkIsQ0FBQztLQUFBO0NBQ0Y7QUFsQ0Qsa0NBa0NDIiwiZmlsZSI6ImNvbW1hbmRzL2V4ZWMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5pbXBvcnQgeyBMb2dnZXJUeXBlIH0gZnJvbSBcIi4uL2xvZ2dlci9sb2dnZXJcIlxuaW1wb3J0IHsgRXhlY0luU2VydmljZVJlc3VsdCB9IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQge1xuICBDb21tYW5kLFxuICBDb21tYW5kUmVzdWx0LFxuICBDb21tYW5kUGFyYW1zLFxuICBTdHJpbmdQYXJhbWV0ZXIsXG4gIFN0cmluZ3NQYXJhbWV0ZXIsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcblxuY29uc3QgcnVuQXJncyA9IHtcbiAgc2VydmljZTogbmV3IFN0cmluZ1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJUaGUgc2VydmljZSB0byBleGVjIHRoZSBjb21tYW5kIGluLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbiAgY29tbWFuZDogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIGNvbW1hbmQgdG8gcnVuLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbn1cblxuY29uc3QgcnVuT3B0cyA9IHtcbiAgLy8gaW50ZXJhY3RpdmU6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHtcbiAgLy8gICBoZWxwOiBcIlNldCB0byBmYWxzZSB0byBza2lwIGludGVyYWN0aXZlIG1vZGUgYW5kIGp1c3Qgb3V0cHV0IHRoZSBjb21tYW5kIHJlc3VsdFwiLFxuICAvLyAgIGRlZmF1bHRWYWx1ZTogdHJ1ZSxcbiAgLy8gfSksXG59XG5cbnR5cGUgQXJncyA9IHR5cGVvZiBydW5BcmdzXG5cbmV4cG9ydCBjbGFzcyBFeGVjQ29tbWFuZCBleHRlbmRzIENvbW1hbmQ8QXJncz4ge1xuICBuYW1lID0gXCJleGVjXCJcbiAgYWxpYXMgPSBcImVcIlxuICBoZWxwID0gXCJFeGVjdXRlcyBhIGNvbW1hbmQgKHN1Y2ggYXMgYW4gaW50ZXJhY3RpdmUgc2hlbGwpIGluIGEgcnVubmluZyBzZXJ2aWNlLlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgRmluZHMgYW4gYWN0aXZlIGNvbnRhaW5lciBmb3IgYSBkZXBsb3llZCBzZXJ2aWNlIGFuZCBleGVjdXRlcyB0aGUgZ2l2ZW4gY29tbWFuZCB3aXRoaW4gdGhlIGNvbnRhaW5lci5cbiAgICBTdXBwb3J0cyBpbnRlcmFjdGl2ZSBzaGVsbHMuXG5cbiAgICBfTk9URTogVGhpcyBjb21tYW5kIG1heSBub3QgYmUgc3VwcG9ydGVkIGZvciBhbGwgbW9kdWxlIHR5cGVzLl9cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgICBnYXJkZW4gZXhlYyBteS1zZXJ2aWNlIC9iaW4vc2ggICAjIHJ1bnMgYSBzaGVsbCBpbiB0aGUgbXktc2VydmljZSBjb250YWluZXJcbiAgYFxuXG4gIGFyZ3VtZW50cyA9IHJ1bkFyZ3NcbiAgb3B0aW9ucyA9IHJ1bk9wdHNcbiAgbG9nZ2VyVHlwZSA9IExvZ2dlclR5cGUuYmFzaWNcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4sIGFyZ3MgfTogQ29tbWFuZFBhcmFtczxBcmdzPik6IFByb21pc2U8Q29tbWFuZFJlc3VsdDxFeGVjSW5TZXJ2aWNlUmVzdWx0Pj4ge1xuICAgIGNvbnN0IHNlcnZpY2VOYW1lID0gYXJncy5zZXJ2aWNlXG4gICAgY29uc3QgY29tbWFuZCA9IGFyZ3MuY29tbWFuZCB8fCBbXVxuXG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoe1xuICAgICAgZW1vamk6IFwicnVubmVyXCIsXG4gICAgICBjb21tYW5kOiBgUnVubmluZyBjb21tYW5kICR7Y2hhbGsuY3lhbihjb21tYW5kLmpvaW4oXCIgXCIpKX0gaW4gc2VydmljZSAke2NoYWxrLmN5YW4oc2VydmljZU5hbWUpfWAsXG4gICAgfSlcblxuICAgIGNvbnN0IHNlcnZpY2UgPSBhd2FpdCBnYXJkZW4uZ2V0U2VydmljZShzZXJ2aWNlTmFtZSlcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnYXJkZW4uYWN0aW9ucy5leGVjSW5TZXJ2aWNlKHsgc2VydmljZSwgY29tbWFuZCB9KVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
