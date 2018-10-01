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
const run_1 = require("./run");
const dedent = require("dedent");
const service_1 = require("../../types/service");
const runArgs = {
    service: new base_1.StringParameter({
        help: "The service to run",
        required: true,
    }),
};
const runOpts = {
    "force-build": new base_1.BooleanParameter({ help: "Force rebuild of module" }),
};
class RunServiceCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "service";
        this.alias = "s";
        this.help = "Run an ad-hoc instance of the specified service";
        this.description = dedent `
    This can be useful for debugging or ad-hoc experimentation with services.

    Examples:

        garden run service my-service   # run an ad-hoc instance of a my-service and attach to it
  `;
        this.arguments = runArgs;
        this.options = runOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const serviceName = args.service;
            const service = yield garden.getService(serviceName);
            const module = service.module;
            garden.log.header({
                emoji: "runner",
                command: `Running service ${chalk_1.default.cyan(serviceName)} in module ${chalk_1.default.cyan(module.name)}`,
            });
            yield garden.actions.prepareEnvironment({});
            const buildTask = new build_1.BuildTask({ garden, module, force: opts["force-build"] });
            yield garden.addTask(buildTask);
            yield garden.processTasks();
            const dependencies = yield garden.getServices(module.serviceDependencyNames);
            const runtimeContext = yield service_1.prepareRuntimeContext(garden, module, dependencies);
            run_1.printRuntimeContext(garden, runtimeContext);
            const result = yield garden.actions.runService({ service, runtimeContext, silent: false, interactive: true });
            return { result };
        });
    }
}
exports.RunServiceCommand = RunServiceCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3J1bi9zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FBeUI7QUFDekIsNkNBQTZDO0FBRTdDLGtDQU1nQjtBQUNoQiwrQkFBMkM7QUFDM0MsaUNBQWlDO0FBQ2pDLGlEQUEyRDtBQUUzRCxNQUFNLE9BQU8sR0FBRztJQUNkLE9BQU8sRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDM0IsSUFBSSxFQUFFLG9CQUFvQjtRQUMxQixRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxPQUFPLEdBQUc7SUFDZCxhQUFhLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxDQUFDO0NBQ3pFLENBQUE7QUFLRCxNQUFhLGlCQUFrQixTQUFRLGNBQW1CO0lBQTFEOztRQUNFLFNBQUksR0FBRyxTQUFTLENBQUE7UUFDaEIsVUFBSyxHQUFHLEdBQUcsQ0FBQTtRQUNYLFNBQUksR0FBRyxpREFBaUQsQ0FBQTtRQUV4RCxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7O0dBTW5CLENBQUE7UUFFRCxjQUFTLEdBQUcsT0FBTyxDQUFBO1FBQ25CLFlBQU8sR0FBRyxPQUFPLENBQUE7SUEyQm5CLENBQUM7SUF6Qk8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQTZCOztZQUM1RCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFBO1lBQ2hDLE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQTtZQUNwRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFBO1lBRTdCLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2dCQUNoQixLQUFLLEVBQUUsUUFBUTtnQkFDZixPQUFPLEVBQUUsbUJBQW1CLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsZUFBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7YUFDM0YsQ0FBQyxDQUFBO1lBRUYsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFBO1lBRTNDLE1BQU0sU0FBUyxHQUFHLElBQUksaUJBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUE7WUFDL0UsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1lBQy9CLE1BQU0sTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFBO1lBRTNCLE1BQU0sWUFBWSxHQUFHLE1BQU0sTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsc0JBQXNCLENBQUMsQ0FBQTtZQUM1RSxNQUFNLGNBQWMsR0FBRyxNQUFNLCtCQUFxQixDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFaEYseUJBQW1CLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFBO1lBRTNDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUE7WUFFN0csT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFBO1FBQ25CLENBQUM7S0FBQTtDQUNGO0FBekNELDhDQXlDQyIsImZpbGUiOiJjb21tYW5kcy9ydW4vc2VydmljZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgY2hhbGsgZnJvbSBcImNoYWxrXCJcbmltcG9ydCB7IEJ1aWxkVGFzayB9IGZyb20gXCIuLi8uLi90YXNrcy9idWlsZFwiXG5pbXBvcnQgeyBSdW5SZXN1bHQgfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IHtcbiAgQm9vbGVhblBhcmFtZXRlcixcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgU3RyaW5nUGFyYW1ldGVyLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyBwcmludFJ1bnRpbWVDb250ZXh0IH0gZnJvbSBcIi4vcnVuXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgeyBwcmVwYXJlUnVudGltZUNvbnRleHQgfSBmcm9tIFwiLi4vLi4vdHlwZXMvc2VydmljZVwiXG5cbmNvbnN0IHJ1bkFyZ3MgPSB7XG4gIHNlcnZpY2U6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIHNlcnZpY2UgdG8gcnVuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG5jb25zdCBydW5PcHRzID0ge1xuICBcImZvcmNlLWJ1aWxkXCI6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJGb3JjZSByZWJ1aWxkIG9mIG1vZHVsZVwiIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgcnVuQXJnc1xudHlwZSBPcHRzID0gdHlwZW9mIHJ1bk9wdHNcblxuZXhwb3J0IGNsYXNzIFJ1blNlcnZpY2VDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzLCBPcHRzPiB7XG4gIG5hbWUgPSBcInNlcnZpY2VcIlxuICBhbGlhcyA9IFwic1wiXG4gIGhlbHAgPSBcIlJ1biBhbiBhZC1ob2MgaW5zdGFuY2Ugb2YgdGhlIHNwZWNpZmllZCBzZXJ2aWNlXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBUaGlzIGNhbiBiZSB1c2VmdWwgZm9yIGRlYnVnZ2luZyBvciBhZC1ob2MgZXhwZXJpbWVudGF0aW9uIHdpdGggc2VydmljZXMuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gcnVuIHNlcnZpY2UgbXktc2VydmljZSAgICMgcnVuIGFuIGFkLWhvYyBpbnN0YW5jZSBvZiBhIG15LXNlcnZpY2UgYW5kIGF0dGFjaCB0byBpdFxuICBgXG5cbiAgYXJndW1lbnRzID0gcnVuQXJnc1xuICBvcHRpb25zID0gcnVuT3B0c1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFJ1blJlc3VsdD4+IHtcbiAgICBjb25zdCBzZXJ2aWNlTmFtZSA9IGFyZ3Muc2VydmljZVxuICAgIGNvbnN0IHNlcnZpY2UgPSBhd2FpdCBnYXJkZW4uZ2V0U2VydmljZShzZXJ2aWNlTmFtZSlcbiAgICBjb25zdCBtb2R1bGUgPSBzZXJ2aWNlLm1vZHVsZVxuXG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoe1xuICAgICAgZW1vamk6IFwicnVubmVyXCIsXG4gICAgICBjb21tYW5kOiBgUnVubmluZyBzZXJ2aWNlICR7Y2hhbGsuY3lhbihzZXJ2aWNlTmFtZSl9IGluIG1vZHVsZSAke2NoYWxrLmN5YW4obW9kdWxlLm5hbWUpfWAsXG4gICAgfSlcblxuICAgIGF3YWl0IGdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7fSlcblxuICAgIGNvbnN0IGJ1aWxkVGFzayA9IG5ldyBCdWlsZFRhc2soeyBnYXJkZW4sIG1vZHVsZSwgZm9yY2U6IG9wdHNbXCJmb3JjZS1idWlsZFwiXSB9KVxuICAgIGF3YWl0IGdhcmRlbi5hZGRUYXNrKGJ1aWxkVGFzaylcbiAgICBhd2FpdCBnYXJkZW4ucHJvY2Vzc1Rhc2tzKClcblxuICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IGF3YWl0IGdhcmRlbi5nZXRTZXJ2aWNlcyhtb2R1bGUuc2VydmljZURlcGVuZGVuY3lOYW1lcylcbiAgICBjb25zdCBydW50aW1lQ29udGV4dCA9IGF3YWl0IHByZXBhcmVSdW50aW1lQ29udGV4dChnYXJkZW4sIG1vZHVsZSwgZGVwZW5kZW5jaWVzKVxuXG4gICAgcHJpbnRSdW50aW1lQ29udGV4dChnYXJkZW4sIHJ1bnRpbWVDb250ZXh0KVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2FyZGVuLmFjdGlvbnMucnVuU2VydmljZSh7IHNlcnZpY2UsIHJ1bnRpbWVDb250ZXh0LCBzaWxlbnQ6IGZhbHNlLCBpbnRlcmFjdGl2ZTogdHJ1ZSB9KVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
