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
const exceptions_1 = require("../../exceptions");
const build_1 = require("../../tasks/build");
const util_1 = require("../../util/util");
const base_1 = require("../base");
const run_1 = require("./run");
const dedent = require("dedent");
const service_1 = require("../../types/service");
const runArgs = {
    module: new base_1.StringParameter({
        help: "The name of the module to run.",
        required: true,
    }),
    test: new base_1.StringParameter({
        help: "The name of the test to run in the module.",
        required: true,
    }),
};
const runOpts = {
    interactive: new base_1.BooleanParameter({
        help: "Set to false to skip interactive mode and just output the command result.",
        defaultValue: true,
    }),
    "force-build": new base_1.BooleanParameter({ help: "Force rebuild of module before running." }),
};
class RunTestCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "test";
        this.alias = "t";
        this.help = "Run the specified module test.";
        this.description = dedent `
    This can be useful for debugging tests, particularly integration/end-to-end tests.

    Examples:

        garden run test my-module integ            # run the test named 'integ' in my-module
        garden run test my-module integ --i=false  # do not attach to the test run, just output results when completed
  `;
        this.arguments = runArgs;
        this.options = runOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const moduleName = args.module;
            const testName = args.test;
            const module = yield garden.getModule(moduleName);
            const testConfig = util_1.findByName(module.testConfigs, testName);
            if (!testConfig) {
                throw new exceptions_1.ParameterError(`Could not find test "${testName}" in module ${moduleName}`, {
                    moduleName,
                    testName,
                    availableTests: util_1.getNames(module.testConfigs),
                });
            }
            garden.log.header({
                emoji: "runner",
                command: `Running test ${chalk_1.default.cyan(testName)} in module ${chalk_1.default.cyan(moduleName)}`,
            });
            yield garden.actions.prepareEnvironment({});
            const buildTask = new build_1.BuildTask({ garden, module, force: opts["force-build"] });
            yield garden.addTask(buildTask);
            yield garden.processTasks();
            const interactive = opts.interactive;
            const deps = yield garden.getServices(testConfig.dependencies);
            const runtimeContext = yield service_1.prepareRuntimeContext(garden, module, deps);
            run_1.printRuntimeContext(garden, runtimeContext);
            const result = yield garden.actions.testModule({
                module,
                interactive,
                runtimeContext,
                silent: false,
                testConfig,
            });
            return { result };
        });
    }
}
exports.RunTestCommand = RunTestCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3J1bi90ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FBeUI7QUFDekIsaURBQWlEO0FBQ2pELDZDQUE2QztBQUU3QywwQ0FHd0I7QUFDeEIsa0NBTWdCO0FBQ2hCLCtCQUEyQztBQUMzQyxpQ0FBaUM7QUFDakMsaURBQTJEO0FBRTNELE1BQU0sT0FBTyxHQUFHO0lBQ2QsTUFBTSxFQUFFLElBQUksc0JBQWUsQ0FBQztRQUMxQixJQUFJLEVBQUUsZ0NBQWdDO1FBQ3RDLFFBQVEsRUFBRSxJQUFJO0tBQ2YsQ0FBQztJQUNGLElBQUksRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDeEIsSUFBSSxFQUFFLDRDQUE0QztRQUNsRCxRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxPQUFPLEdBQUc7SUFDZCxXQUFXLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUNoQyxJQUFJLEVBQUUsMkVBQTJFO1FBQ2pGLFlBQVksRUFBRSxJQUFJO0tBQ25CLENBQUM7SUFDRixhQUFhLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQyxFQUFFLElBQUksRUFBRSx5Q0FBeUMsRUFBRSxDQUFDO0NBQ3pGLENBQUE7QUFLRCxNQUFhLGNBQWUsU0FBUSxjQUFtQjtJQUF2RDs7UUFDRSxTQUFJLEdBQUcsTUFBTSxDQUFBO1FBQ2IsVUFBSyxHQUFHLEdBQUcsQ0FBQTtRQUNYLFNBQUksR0FBRyxnQ0FBZ0MsQ0FBQTtRQUV2QyxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7OztHQU9uQixDQUFBO1FBRUQsY0FBUyxHQUFHLE9BQU8sQ0FBQTtRQUNuQixZQUFPLEdBQUcsT0FBTyxDQUFBO0lBNENuQixDQUFDO0lBMUNPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUE2Qjs7WUFDNUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQTtZQUM5QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFBO1lBQzFCLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQTtZQUVqRCxNQUFNLFVBQVUsR0FBRyxpQkFBVSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUE7WUFFM0QsSUFBSSxDQUFDLFVBQVUsRUFBRTtnQkFDZixNQUFNLElBQUksMkJBQWMsQ0FBQyx3QkFBd0IsUUFBUSxlQUFlLFVBQVUsRUFBRSxFQUFFO29CQUNwRixVQUFVO29CQUNWLFFBQVE7b0JBQ1IsY0FBYyxFQUFFLGVBQVEsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDO2lCQUM3QyxDQUFDLENBQUE7YUFDSDtZQUVELE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2dCQUNoQixLQUFLLEVBQUUsUUFBUTtnQkFDZixPQUFPLEVBQUUsZ0JBQWdCLGVBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsZUFBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTthQUNwRixDQUFDLENBQUE7WUFFRixNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUE7WUFFM0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxpQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQTtZQUMvRSxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDL0IsTUFBTSxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUE7WUFFM0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQTtZQUNwQyxNQUFNLElBQUksR0FBRyxNQUFNLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFBO1lBQzlELE1BQU0sY0FBYyxHQUFHLE1BQU0sK0JBQXFCLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUV4RSx5QkFBbUIsQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUE7WUFFM0MsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQztnQkFDN0MsTUFBTTtnQkFDTixXQUFXO2dCQUNYLGNBQWM7Z0JBQ2QsTUFBTSxFQUFFLEtBQUs7Z0JBQ2IsVUFBVTthQUNYLENBQUMsQ0FBQTtZQUVGLE9BQU8sRUFBRSxNQUFNLEVBQUUsQ0FBQTtRQUNuQixDQUFDO0tBQUE7Q0FDRjtBQTNERCx3Q0EyREMiLCJmaWxlIjoiY29tbWFuZHMvcnVuL3Rlc3QuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5pbXBvcnQgeyBQYXJhbWV0ZXJFcnJvciB9IGZyb20gXCIuLi8uLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IEJ1aWxkVGFzayB9IGZyb20gXCIuLi8uLi90YXNrcy9idWlsZFwiXG5pbXBvcnQgeyBSdW5SZXN1bHQgfSBmcm9tIFwiLi4vLi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IHtcbiAgZmluZEJ5TmFtZSxcbiAgZ2V0TmFtZXMsXG59IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHtcbiAgQm9vbGVhblBhcmFtZXRlcixcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgU3RyaW5nUGFyYW1ldGVyLFxufSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyBwcmludFJ1bnRpbWVDb250ZXh0IH0gZnJvbSBcIi4vcnVuXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgeyBwcmVwYXJlUnVudGltZUNvbnRleHQgfSBmcm9tIFwiLi4vLi4vdHlwZXMvc2VydmljZVwiXG5cbmNvbnN0IHJ1bkFyZ3MgPSB7XG4gIG1vZHVsZTogbmV3IFN0cmluZ1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJUaGUgbmFtZSBvZiB0aGUgbW9kdWxlIHRvIHJ1bi5cIixcbiAgICByZXF1aXJlZDogdHJ1ZSxcbiAgfSksXG4gIHRlc3Q6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHRlc3QgdG8gcnVuIGluIHRoZSBtb2R1bGUuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG5jb25zdCBydW5PcHRzID0ge1xuICBpbnRlcmFjdGl2ZTogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiU2V0IHRvIGZhbHNlIHRvIHNraXAgaW50ZXJhY3RpdmUgbW9kZSBhbmQganVzdCBvdXRwdXQgdGhlIGNvbW1hbmQgcmVzdWx0LlwiLFxuICAgIGRlZmF1bHRWYWx1ZTogdHJ1ZSxcbiAgfSksXG4gIFwiZm9yY2UtYnVpbGRcIjogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoeyBoZWxwOiBcIkZvcmNlIHJlYnVpbGQgb2YgbW9kdWxlIGJlZm9yZSBydW5uaW5nLlwiIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgcnVuQXJnc1xudHlwZSBPcHRzID0gdHlwZW9mIHJ1bk9wdHNcblxuZXhwb3J0IGNsYXNzIFJ1blRlc3RDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzLCBPcHRzPiB7XG4gIG5hbWUgPSBcInRlc3RcIlxuICBhbGlhcyA9IFwidFwiXG4gIGhlbHAgPSBcIlJ1biB0aGUgc3BlY2lmaWVkIG1vZHVsZSB0ZXN0LlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgVGhpcyBjYW4gYmUgdXNlZnVsIGZvciBkZWJ1Z2dpbmcgdGVzdHMsIHBhcnRpY3VsYXJseSBpbnRlZ3JhdGlvbi9lbmQtdG8tZW5kIHRlc3RzLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIHJ1biB0ZXN0IG15LW1vZHVsZSBpbnRlZyAgICAgICAgICAgICMgcnVuIHRoZSB0ZXN0IG5hbWVkICdpbnRlZycgaW4gbXktbW9kdWxlXG4gICAgICAgIGdhcmRlbiBydW4gdGVzdCBteS1tb2R1bGUgaW50ZWcgLS1pPWZhbHNlICAjIGRvIG5vdCBhdHRhY2ggdG8gdGhlIHRlc3QgcnVuLCBqdXN0IG91dHB1dCByZXN1bHRzIHdoZW4gY29tcGxldGVkXG4gIGBcblxuICBhcmd1bWVudHMgPSBydW5BcmdzXG4gIG9wdGlvbnMgPSBydW5PcHRzXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuLCBhcmdzLCBvcHRzIH06IENvbW1hbmRQYXJhbXM8QXJncywgT3B0cz4pOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8UnVuUmVzdWx0Pj4ge1xuICAgIGNvbnN0IG1vZHVsZU5hbWUgPSBhcmdzLm1vZHVsZVxuICAgIGNvbnN0IHRlc3ROYW1lID0gYXJncy50ZXN0XG4gICAgY29uc3QgbW9kdWxlID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZShtb2R1bGVOYW1lKVxuXG4gICAgY29uc3QgdGVzdENvbmZpZyA9IGZpbmRCeU5hbWUobW9kdWxlLnRlc3RDb25maWdzLCB0ZXN0TmFtZSlcblxuICAgIGlmICghdGVzdENvbmZpZykge1xuICAgICAgdGhyb3cgbmV3IFBhcmFtZXRlckVycm9yKGBDb3VsZCBub3QgZmluZCB0ZXN0IFwiJHt0ZXN0TmFtZX1cIiBpbiBtb2R1bGUgJHttb2R1bGVOYW1lfWAsIHtcbiAgICAgICAgbW9kdWxlTmFtZSxcbiAgICAgICAgdGVzdE5hbWUsXG4gICAgICAgIGF2YWlsYWJsZVRlc3RzOiBnZXROYW1lcyhtb2R1bGUudGVzdENvbmZpZ3MpLFxuICAgICAgfSlcbiAgICB9XG5cbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7XG4gICAgICBlbW9qaTogXCJydW5uZXJcIixcbiAgICAgIGNvbW1hbmQ6IGBSdW5uaW5nIHRlc3QgJHtjaGFsay5jeWFuKHRlc3ROYW1lKX0gaW4gbW9kdWxlICR7Y2hhbGsuY3lhbihtb2R1bGVOYW1lKX1gLFxuICAgIH0pXG5cbiAgICBhd2FpdCBnYXJkZW4uYWN0aW9ucy5wcmVwYXJlRW52aXJvbm1lbnQoe30pXG5cbiAgICBjb25zdCBidWlsZFRhc2sgPSBuZXcgQnVpbGRUYXNrKHsgZ2FyZGVuLCBtb2R1bGUsIGZvcmNlOiBvcHRzW1wiZm9yY2UtYnVpbGRcIl0gfSlcbiAgICBhd2FpdCBnYXJkZW4uYWRkVGFzayhidWlsZFRhc2spXG4gICAgYXdhaXQgZ2FyZGVuLnByb2Nlc3NUYXNrcygpXG5cbiAgICBjb25zdCBpbnRlcmFjdGl2ZSA9IG9wdHMuaW50ZXJhY3RpdmVcbiAgICBjb25zdCBkZXBzID0gYXdhaXQgZ2FyZGVuLmdldFNlcnZpY2VzKHRlc3RDb25maWcuZGVwZW5kZW5jaWVzKVxuICAgIGNvbnN0IHJ1bnRpbWVDb250ZXh0ID0gYXdhaXQgcHJlcGFyZVJ1bnRpbWVDb250ZXh0KGdhcmRlbiwgbW9kdWxlLCBkZXBzKVxuXG4gICAgcHJpbnRSdW50aW1lQ29udGV4dChnYXJkZW4sIHJ1bnRpbWVDb250ZXh0KVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2FyZGVuLmFjdGlvbnMudGVzdE1vZHVsZSh7XG4gICAgICBtb2R1bGUsXG4gICAgICBpbnRlcmFjdGl2ZSxcbiAgICAgIHJ1bnRpbWVDb250ZXh0LFxuICAgICAgc2lsZW50OiBmYWxzZSxcbiAgICAgIHRlc3RDb25maWcsXG4gICAgfSlcblxuICAgIHJldHVybiB7IHJlc3VsdCB9XG4gIH1cbn1cbiJdfQ==
