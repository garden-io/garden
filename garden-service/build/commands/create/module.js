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
const base_1 = require("../base");
const exceptions_1 = require("../../exceptions");
const config_templates_1 = require("./config-templates");
const helpers_1 = require("./helpers");
const prompts_1 = require("./prompts");
const common_1 = require("../../config/common");
const fs_extra_1 = require("fs-extra");
const createModuleOptions = {
    name: new base_1.StringParameter({
        help: "Assigns a custom name to the module. (Defaults to name of the current directory.)",
    }),
    type: new base_1.ChoicesParameter({
        help: "Type of module.",
        choices: config_templates_1.availableModuleTypes,
    }),
};
const createModuleArguments = {
    "module-dir": new base_1.StringParameter({
        help: "Directory of the module. (Defaults to current directory.)",
    }),
};
class CreateModuleCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "module";
        this.alias = "m";
        this.help = "Creates a new Garden module.";
        this.description = dedent `
    Creates a new Garden module of the given type

    Examples:

        garden create module # creates a new module in the current directory (module name defaults to directory name)
        garden create module my-module # creates a new module in my-module directory
        garden create module --type=container # creates a new container module
        garden create module --name=my-module # creates a new module in current directory and names it my-module
  `;
        this.noProject = true;
        this.arguments = createModuleArguments;
        this.options = createModuleOptions;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            let errors = [];
            const moduleRoot = path_1.join(garden.projectRoot, (args["module-dir"] || "").trim());
            const moduleName = common_1.validate(opts.name || path_1.basename(moduleRoot), common_1.joiIdentifier(), { context: "module name" });
            yield fs_extra_1.ensureDir(moduleRoot);
            garden.log.header({ emoji: "house_with_garden", command: "create" });
            garden.log.info(`Initializing new module ${moduleName}`);
            let type;
            if (opts.type) {
                // Type passed as parameter
                type = opts.type;
                if (!config_templates_1.availableModuleTypes.includes(type)) {
                    throw new exceptions_1.ParameterError("Module type not available", {});
                }
            }
            else {
                // Prompt for type
                garden.log.info("---------");
                garden.log.stop();
                type = (yield prompts_1.prompts.addConfigForModule(moduleName)).type;
                garden.log.info("---------");
                if (!type) {
                    return { result: {} };
                }
            }
            const module = helpers_1.prepareNewModuleConfig(moduleName, type, moduleRoot);
            try {
                yield helpers_1.dumpConfig(module, config_templates_1.moduleSchema, garden.log);
            }
            catch (err) {
                errors.push(err);
            }
            return {
                result: { module },
                errors,
            };
        });
    }
}
exports.CreateModuleCommand = CreateModuleCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILCtCQUFxQztBQUNyQyxpQ0FBaUM7QUFFakMsa0NBTWdCO0FBQ2hCLGlEQUFrRTtBQUNsRSx5REFBcUc7QUFDckcsdUNBR2tCO0FBQ2xCLHVDQUFtQztBQUNuQyxnREFBNkQ7QUFDN0QsdUNBQW9DO0FBRXBDLE1BQU0sbUJBQW1CLEdBQUc7SUFDMUIsSUFBSSxFQUFFLElBQUksc0JBQWUsQ0FBQztRQUN4QixJQUFJLEVBQUUsbUZBQW1GO0tBQzFGLENBQUM7SUFDRixJQUFJLEVBQUUsSUFBSSx1QkFBZ0IsQ0FBQztRQUN6QixJQUFJLEVBQUUsaUJBQWlCO1FBQ3ZCLE9BQU8sRUFBRSx1Q0FBb0I7S0FDOUIsQ0FBQztDQUNILENBQUE7QUFFRCxNQUFNLHFCQUFxQixHQUFHO0lBQzVCLFlBQVksRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDaEMsSUFBSSxFQUFFLDJEQUEyRDtLQUNsRSxDQUFDO0NBQ0gsQ0FBQTtBQVdELE1BQWEsbUJBQW9CLFNBQVEsY0FBbUI7SUFBNUQ7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFVBQUssR0FBRyxHQUFHLENBQUE7UUFDWCxTQUFJLEdBQUcsOEJBQThCLENBQUE7UUFFckMsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7OztHQVNuQixDQUFBO1FBRUQsY0FBUyxHQUFHLElBQUksQ0FBQTtRQUNoQixjQUFTLEdBQUcscUJBQXFCLENBQUE7UUFDakMsWUFBTyxHQUFHLG1CQUFtQixDQUFBO0lBK0MvQixDQUFDO0lBN0NPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUE2Qjs7WUFDNUQsSUFBSSxNQUFNLEdBQXNCLEVBQUUsQ0FBQTtZQUVsQyxNQUFNLFVBQVUsR0FBRyxXQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1lBQzlFLE1BQU0sVUFBVSxHQUFHLGlCQUFRLENBQ3pCLElBQUksQ0FBQyxJQUFJLElBQUksZUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUNqQyxzQkFBYSxFQUFFLEVBQ2YsRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQzNCLENBQUE7WUFFRCxNQUFNLG9CQUFTLENBQUMsVUFBVSxDQUFDLENBQUE7WUFFM0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUE7WUFDcEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLFVBQVUsRUFBRSxDQUFDLENBQUE7WUFFeEQsSUFBSSxJQUFnQixDQUFBO1lBRXBCLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDYiwyQkFBMkI7Z0JBQzNCLElBQUksR0FBZSxJQUFJLENBQUMsSUFBSSxDQUFBO2dCQUM1QixJQUFJLENBQUMsdUNBQW9CLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUN4QyxNQUFNLElBQUksMkJBQWMsQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsQ0FBQTtpQkFDMUQ7YUFDRjtpQkFBTTtnQkFDTCxrQkFBa0I7Z0JBQ2xCLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFBO2dCQUM1QixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFBO2dCQUNqQixJQUFJLEdBQUcsQ0FBQyxNQUFNLGlCQUFPLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUE7Z0JBQzFELE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFBO2dCQUM1QixJQUFJLENBQUMsSUFBSSxFQUFFO29CQUNULE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUE7aUJBQ3RCO2FBQ0Y7WUFFRCxNQUFNLE1BQU0sR0FBRyxnQ0FBc0IsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFBO1lBQ25FLElBQUk7Z0JBQ0YsTUFBTSxvQkFBVSxDQUFDLE1BQU0sRUFBRSwrQkFBWSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQTthQUNuRDtZQUFDLE9BQU8sR0FBRyxFQUFFO2dCQUNaLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUE7YUFDakI7WUFDRCxPQUFPO2dCQUNMLE1BQU0sRUFBRSxFQUFFLE1BQU0sRUFBRTtnQkFDbEIsTUFBTTthQUNQLENBQUE7UUFDSCxDQUFDO0tBQUE7Q0FDRjtBQWpFRCxrREFpRUMiLCJmaWxlIjoiY29tbWFuZHMvY3JlYXRlL21vZHVsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pbiB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5cbmltcG9ydCB7XG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIFN0cmluZ1BhcmFtZXRlcixcbiAgQ2hvaWNlc1BhcmFtZXRlcixcbiAgQ29tbWFuZFBhcmFtcyxcbn0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgUGFyYW1ldGVyRXJyb3IsIEdhcmRlbkJhc2VFcnJvciB9IGZyb20gXCIuLi8uLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IGF2YWlsYWJsZU1vZHVsZVR5cGVzLCBNb2R1bGVUeXBlLCBtb2R1bGVTY2hlbWEsIE1vZHVsZUNvbmZpZ09wdHMgfSBmcm9tIFwiLi9jb25maWctdGVtcGxhdGVzXCJcbmltcG9ydCB7XG4gIHByZXBhcmVOZXdNb2R1bGVDb25maWcsXG4gIGR1bXBDb25maWcsXG59IGZyb20gXCIuL2hlbHBlcnNcIlxuaW1wb3J0IHsgcHJvbXB0cyB9IGZyb20gXCIuL3Byb21wdHNcIlxuaW1wb3J0IHsgdmFsaWRhdGUsIGpvaUlkZW50aWZpZXIgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBlbnN1cmVEaXIgfSBmcm9tIFwiZnMtZXh0cmFcIlxuXG5jb25zdCBjcmVhdGVNb2R1bGVPcHRpb25zID0ge1xuICBuYW1lOiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIkFzc2lnbnMgYSBjdXN0b20gbmFtZSB0byB0aGUgbW9kdWxlLiAoRGVmYXVsdHMgdG8gbmFtZSBvZiB0aGUgY3VycmVudCBkaXJlY3RvcnkuKVwiLFxuICB9KSxcbiAgdHlwZTogbmV3IENob2ljZXNQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVHlwZSBvZiBtb2R1bGUuXCIsXG4gICAgY2hvaWNlczogYXZhaWxhYmxlTW9kdWxlVHlwZXMsXG4gIH0pLFxufVxuXG5jb25zdCBjcmVhdGVNb2R1bGVBcmd1bWVudHMgPSB7XG4gIFwibW9kdWxlLWRpclwiOiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIkRpcmVjdG9yeSBvZiB0aGUgbW9kdWxlLiAoRGVmYXVsdHMgdG8gY3VycmVudCBkaXJlY3RvcnkuKVwiLFxuICB9KSxcbn1cblxudHlwZSBBcmdzID0gdHlwZW9mIGNyZWF0ZU1vZHVsZUFyZ3VtZW50c1xudHlwZSBPcHRzID0gdHlwZW9mIGNyZWF0ZU1vZHVsZU9wdGlvbnNcblxuaW50ZXJmYWNlIENyZWF0ZU1vZHVsZVJlc3VsdCBleHRlbmRzIENvbW1hbmRSZXN1bHQge1xuICByZXN1bHQ6IHtcbiAgICBtb2R1bGU/OiBNb2R1bGVDb25maWdPcHRzLFxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDcmVhdGVNb2R1bGVDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzLCBPcHRzPiB7XG4gIG5hbWUgPSBcIm1vZHVsZVwiXG4gIGFsaWFzID0gXCJtXCJcbiAgaGVscCA9IFwiQ3JlYXRlcyBhIG5ldyBHYXJkZW4gbW9kdWxlLlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgQ3JlYXRlcyBhIG5ldyBHYXJkZW4gbW9kdWxlIG9mIHRoZSBnaXZlbiB0eXBlXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gY3JlYXRlIG1vZHVsZSAjIGNyZWF0ZXMgYSBuZXcgbW9kdWxlIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeSAobW9kdWxlIG5hbWUgZGVmYXVsdHMgdG8gZGlyZWN0b3J5IG5hbWUpXG4gICAgICAgIGdhcmRlbiBjcmVhdGUgbW9kdWxlIG15LW1vZHVsZSAjIGNyZWF0ZXMgYSBuZXcgbW9kdWxlIGluIG15LW1vZHVsZSBkaXJlY3RvcnlcbiAgICAgICAgZ2FyZGVuIGNyZWF0ZSBtb2R1bGUgLS10eXBlPWNvbnRhaW5lciAjIGNyZWF0ZXMgYSBuZXcgY29udGFpbmVyIG1vZHVsZVxuICAgICAgICBnYXJkZW4gY3JlYXRlIG1vZHVsZSAtLW5hbWU9bXktbW9kdWxlICMgY3JlYXRlcyBhIG5ldyBtb2R1bGUgaW4gY3VycmVudCBkaXJlY3RvcnkgYW5kIG5hbWVzIGl0IG15LW1vZHVsZVxuICBgXG5cbiAgbm9Qcm9qZWN0ID0gdHJ1ZVxuICBhcmd1bWVudHMgPSBjcmVhdGVNb2R1bGVBcmd1bWVudHNcbiAgb3B0aW9ucyA9IGNyZWF0ZU1vZHVsZU9wdGlvbnNcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4sIGFyZ3MsIG9wdHMgfTogQ29tbWFuZFBhcmFtczxBcmdzLCBPcHRzPik6IFByb21pc2U8Q3JlYXRlTW9kdWxlUmVzdWx0PiB7XG4gICAgbGV0IGVycm9yczogR2FyZGVuQmFzZUVycm9yW10gPSBbXVxuXG4gICAgY29uc3QgbW9kdWxlUm9vdCA9IGpvaW4oZ2FyZGVuLnByb2plY3RSb290LCAoYXJnc1tcIm1vZHVsZS1kaXJcIl0gfHwgXCJcIikudHJpbSgpKVxuICAgIGNvbnN0IG1vZHVsZU5hbWUgPSB2YWxpZGF0ZShcbiAgICAgIG9wdHMubmFtZSB8fCBiYXNlbmFtZShtb2R1bGVSb290KSxcbiAgICAgIGpvaUlkZW50aWZpZXIoKSxcbiAgICAgIHsgY29udGV4dDogXCJtb2R1bGUgbmFtZVwiIH0sXG4gICAgKVxuXG4gICAgYXdhaXQgZW5zdXJlRGlyKG1vZHVsZVJvb3QpXG5cbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7IGVtb2ppOiBcImhvdXNlX3dpdGhfZ2FyZGVuXCIsIGNvbW1hbmQ6IFwiY3JlYXRlXCIgfSlcbiAgICBnYXJkZW4ubG9nLmluZm8oYEluaXRpYWxpemluZyBuZXcgbW9kdWxlICR7bW9kdWxlTmFtZX1gKVxuXG4gICAgbGV0IHR5cGU6IE1vZHVsZVR5cGVcblxuICAgIGlmIChvcHRzLnR5cGUpIHtcbiAgICAgIC8vIFR5cGUgcGFzc2VkIGFzIHBhcmFtZXRlclxuICAgICAgdHlwZSA9IDxNb2R1bGVUeXBlPm9wdHMudHlwZVxuICAgICAgaWYgKCFhdmFpbGFibGVNb2R1bGVUeXBlcy5pbmNsdWRlcyh0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyYW1ldGVyRXJyb3IoXCJNb2R1bGUgdHlwZSBub3QgYXZhaWxhYmxlXCIsIHt9KVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBQcm9tcHQgZm9yIHR5cGVcbiAgICAgIGdhcmRlbi5sb2cuaW5mbyhcIi0tLS0tLS0tLVwiKVxuICAgICAgZ2FyZGVuLmxvZy5zdG9wKClcbiAgICAgIHR5cGUgPSAoYXdhaXQgcHJvbXB0cy5hZGRDb25maWdGb3JNb2R1bGUobW9kdWxlTmFtZSkpLnR5cGVcbiAgICAgIGdhcmRlbi5sb2cuaW5mbyhcIi0tLS0tLS0tLVwiKVxuICAgICAgaWYgKCF0eXBlKSB7XG4gICAgICAgIHJldHVybiB7IHJlc3VsdDoge30gfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1vZHVsZSA9IHByZXBhcmVOZXdNb2R1bGVDb25maWcobW9kdWxlTmFtZSwgdHlwZSwgbW9kdWxlUm9vdClcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZHVtcENvbmZpZyhtb2R1bGUsIG1vZHVsZVNjaGVtYSwgZ2FyZGVuLmxvZylcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGVycm9ycy5wdXNoKGVycilcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3VsdDogeyBtb2R1bGUgfSxcbiAgICAgIGVycm9ycyxcbiAgICB9XG4gIH1cbn1cbiJdfQ==
