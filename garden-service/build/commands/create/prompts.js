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
const inquirer = require("inquirer");
const Joi = require("joi");
const chalk_1 = require("chalk");
const common_1 = require("../../config/common");
const moduleTypeChoices = [
    {
        name: "container",
        value: "container",
    },
    {
        name: `google-cloud-function (${chalk_1.default.red.italic("experimental")})`,
        value: "google-cloud-function",
    },
    {
        name: `npm package (${chalk_1.default.red.italic("experimental")})`,
        value: "npm-package",
    },
];
// Create config for an existing module
function addConfigForModule(dir) {
    return __awaiter(this, void 0, void 0, function* () {
        const qNames = {
            ADD_MODULE: "addModule",
            TYPE: "type",
        };
        const questions = [
            {
                name: qNames.ADD_MODULE,
                message: `Add module config for ${chalk_1.default.italic(dir)}?`,
                type: "confirm",
            },
            {
                name: qNames.TYPE,
                message: "Module type",
                choices: moduleTypeChoices,
                when: ans => ans[qNames.ADD_MODULE],
                type: "list",
            },
        ];
        return yield inquirer.prompt(questions);
    });
}
// Create a new module with config
function addModule(addModuleMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        const qNames = {
            ADD_MODULE: "addModule",
            NAME: "name",
            TYPE: "type",
        };
        const questions = [
            {
                name: qNames.ADD_MODULE,
                message: addModuleMessage,
                type: "confirm",
            },
            {
                name: qNames.NAME,
                message: "Enter module name",
                type: "input",
                validate: input => {
                    try {
                        Joi.attempt(input.trim(), common_1.joiIdentifier());
                    }
                    catch (err) {
                        return `Invalid module name, please try again\nError: ${err.message}`;
                    }
                    return true;
                },
                filter: input => input.trim(),
                when: ans => ans[qNames.ADD_MODULE],
            },
            {
                name: qNames.TYPE,
                message: "Module type",
                choices: moduleTypeChoices,
                when: ans => ans[qNames.NAME],
                type: "list",
            },
        ];
        return yield inquirer.prompt(questions);
    });
}
function repeatAddModule() {
    return __awaiter(this, void 0, void 0, function* () {
        let modules = [];
        let addModuleMessage = "Would you like to add a module to your project?";
        let ans = yield addModule(addModuleMessage);
        while (ans.type) {
            modules.push({ name: ans.name, type: ans.type });
            addModuleMessage = `Add another module? (current modules: ${modules.map(m => m.name).join(", ")})`;
            ans = yield addModule(addModuleMessage);
        }
        return modules;
    });
}
exports.repeatAddModule = repeatAddModule;
exports.prompts = {
    addConfigForModule,
    addModule,
    repeatAddModule,
};

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9wcm9tcHRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxxQ0FBb0M7QUFDcEMsMkJBQTBCO0FBQzFCLGlDQUF5QjtBQUV6QixnREFBbUQ7QUFxQm5ELE1BQU0saUJBQWlCLEdBQXVCO0lBQzVDO1FBQ0UsSUFBSSxFQUFFLFdBQVc7UUFDakIsS0FBSyxFQUFFLFdBQVc7S0FDbkI7SUFDRDtRQUNFLElBQUksRUFBRSwwQkFBMEIsZUFBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUc7UUFDbkUsS0FBSyxFQUFFLHVCQUF1QjtLQUMvQjtJQUNEO1FBQ0UsSUFBSSxFQUFFLGdCQUFnQixlQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsR0FBRztRQUN6RCxLQUFLLEVBQUUsYUFBYTtLQUNyQjtDQUNGLENBQUE7QUFFRCx1Q0FBdUM7QUFDdkMsU0FBZSxrQkFBa0IsQ0FBQyxHQUFXOztRQUMzQyxNQUFNLE1BQU0sR0FBRztZQUNiLFVBQVUsRUFBRSxXQUFXO1lBQ3ZCLElBQUksRUFBRSxNQUFNO1NBQ2IsQ0FBQTtRQUNELE1BQU0sU0FBUyxHQUF1QjtZQUNwQztnQkFDRSxJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVU7Z0JBQ3ZCLE9BQU8sRUFBRSx5QkFBeUIsZUFBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRztnQkFDdEQsSUFBSSxFQUFFLFNBQVM7YUFDaEI7WUFDRDtnQkFDRSxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7Z0JBQ2pCLE9BQU8sRUFBRSxhQUFhO2dCQUN0QixPQUFPLEVBQUUsaUJBQWlCO2dCQUMxQixJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQztnQkFDbkMsSUFBSSxFQUFFLE1BQU07YUFDYjtTQUNGLENBQUE7UUFDRCxPQUFPLE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQWtCLENBQUE7SUFDMUQsQ0FBQztDQUFBO0FBRUQsa0NBQWtDO0FBQ2xDLFNBQWUsU0FBUyxDQUFDLGdCQUF3Qjs7UUFDL0MsTUFBTSxNQUFNLEdBQUc7WUFDYixVQUFVLEVBQUUsV0FBVztZQUN2QixJQUFJLEVBQUUsTUFBTTtZQUNaLElBQUksRUFBRSxNQUFNO1NBQ2IsQ0FBQTtRQUNELE1BQU0sU0FBUyxHQUF1QjtZQUNwQztnQkFDRSxJQUFJLEVBQUUsTUFBTSxDQUFDLFVBQVU7Z0JBQ3ZCLE9BQU8sRUFBRSxnQkFBZ0I7Z0JBQ3pCLElBQUksRUFBRSxTQUFTO2FBQ2hCO1lBQ0Q7Z0JBQ0UsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixPQUFPLEVBQUUsbUJBQW1CO2dCQUM1QixJQUFJLEVBQUUsT0FBTztnQkFDYixRQUFRLEVBQUUsS0FBSyxDQUFDLEVBQUU7b0JBQ2hCLElBQUk7d0JBQ0YsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsc0JBQWEsRUFBRSxDQUFDLENBQUE7cUJBQzNDO29CQUFDLE9BQU8sR0FBRyxFQUFFO3dCQUNaLE9BQU8saURBQWlELEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtxQkFDdEU7b0JBQ0QsT0FBTyxJQUFJLENBQUE7Z0JBQ2IsQ0FBQztnQkFDRCxNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO2dCQUM3QixJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQzthQUNwQztZQUNEO2dCQUNFLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtnQkFDakIsT0FBTyxFQUFFLGFBQWE7Z0JBQ3RCLE9BQU8sRUFBRSxpQkFBaUI7Z0JBQzFCLElBQUksRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUM3QixJQUFJLEVBQUUsTUFBTTthQUNiO1NBQ0YsQ0FBQTtRQUNELE9BQU8sTUFBTSxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBc0IsQ0FBQTtJQUM5RCxDQUFDO0NBQUE7QUFFRCxTQUFzQixlQUFlOztRQUNuQyxJQUFJLE9BQU8sR0FBd0IsRUFBRSxDQUFBO1FBQ3JDLElBQUksZ0JBQWdCLEdBQUcsaURBQWlELENBQUE7UUFDeEUsSUFBSSxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtRQUUzQyxPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQUU7WUFDZixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1lBQ2hELGdCQUFnQixHQUFHLHlDQUF5QyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFBO1lBQ2xHLEdBQUcsR0FBRyxNQUFNLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFBO1NBQ3hDO1FBQ0QsT0FBTyxPQUFPLENBQUE7SUFDaEIsQ0FBQztDQUFBO0FBWEQsMENBV0M7QUFFWSxRQUFBLE9BQU8sR0FBWTtJQUM5QixrQkFBa0I7SUFDbEIsU0FBUztJQUNULGVBQWU7Q0FDaEIsQ0FBQSIsImZpbGUiOiJjb21tYW5kcy9jcmVhdGUvcHJvbXB0cy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBpbnF1aXJlciBmcm9tIFwiaW5xdWlyZXJcIlxuaW1wb3J0ICogYXMgSm9pIGZyb20gXCJqb2lcIlxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5cbmltcG9ydCB7IGpvaUlkZW50aWZpZXIgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBNb2R1bGVUeXBlIH0gZnJvbSBcIi4vY29uZmlnLXRlbXBsYXRlc1wiXG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kdWxlVHlwZUNob2ljZSBleHRlbmRzIGlucXVpcmVyLm9iamVjdHMuQ2hvaWNlT3B0aW9uIHtcbiAgdmFsdWU6IE1vZHVsZVR5cGVcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNb2R1bGVUeXBlTWFwIHtcbiAgdHlwZTogTW9kdWxlVHlwZVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vZHVsZVR5cGVBbmROYW1lIGV4dGVuZHMgTW9kdWxlVHlwZU1hcCB7XG4gIG5hbWU6IHN0cmluZ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdHMge1xuICBhZGRDb25maWdGb3JNb2R1bGU6ICguLi5hcmdzOiBhbnlbXSkgPT4gUHJvbWlzZTxNb2R1bGVUeXBlTWFwPlxuICBhZGRNb2R1bGU6ICguLi5hcmdzOiBhbnlbXSkgPT4gUHJvbWlzZTxNb2R1bGVUeXBlQW5kTmFtZT5cbiAgcmVwZWF0QWRkTW9kdWxlOiAoLi4uYXJnczogYW55W10pID0+IFByb21pc2U8TW9kdWxlVHlwZUFuZE5hbWVbXT5cbn1cblxuY29uc3QgbW9kdWxlVHlwZUNob2ljZXM6IE1vZHVsZVR5cGVDaG9pY2VbXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiY29udGFpbmVyXCIsXG4gICAgdmFsdWU6IFwiY29udGFpbmVyXCIsXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBgZ29vZ2xlLWNsb3VkLWZ1bmN0aW9uICgke2NoYWxrLnJlZC5pdGFsaWMoXCJleHBlcmltZW50YWxcIil9KWAsXG4gICAgdmFsdWU6IFwiZ29vZ2xlLWNsb3VkLWZ1bmN0aW9uXCIsXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBgbnBtIHBhY2thZ2UgKCR7Y2hhbGsucmVkLml0YWxpYyhcImV4cGVyaW1lbnRhbFwiKX0pYCxcbiAgICB2YWx1ZTogXCJucG0tcGFja2FnZVwiLFxuICB9LFxuXVxuXG4vLyBDcmVhdGUgY29uZmlnIGZvciBhbiBleGlzdGluZyBtb2R1bGVcbmFzeW5jIGZ1bmN0aW9uIGFkZENvbmZpZ0Zvck1vZHVsZShkaXI6IHN0cmluZyk6IFByb21pc2U8TW9kdWxlVHlwZU1hcD4ge1xuICBjb25zdCBxTmFtZXMgPSB7XG4gICAgQUREX01PRFVMRTogXCJhZGRNb2R1bGVcIixcbiAgICBUWVBFOiBcInR5cGVcIixcbiAgfVxuICBjb25zdCBxdWVzdGlvbnM6IGlucXVpcmVyLlF1ZXN0aW9ucyA9IFtcbiAgICB7XG4gICAgICBuYW1lOiBxTmFtZXMuQUREX01PRFVMRSxcbiAgICAgIG1lc3NhZ2U6IGBBZGQgbW9kdWxlIGNvbmZpZyBmb3IgJHtjaGFsay5pdGFsaWMoZGlyKX0/YCxcbiAgICAgIHR5cGU6IFwiY29uZmlybVwiLFxuICAgIH0sXG4gICAge1xuICAgICAgbmFtZTogcU5hbWVzLlRZUEUsXG4gICAgICBtZXNzYWdlOiBcIk1vZHVsZSB0eXBlXCIsXG4gICAgICBjaG9pY2VzOiBtb2R1bGVUeXBlQ2hvaWNlcyxcbiAgICAgIHdoZW46IGFucyA9PiBhbnNbcU5hbWVzLkFERF9NT0RVTEVdLFxuICAgICAgdHlwZTogXCJsaXN0XCIsXG4gICAgfSxcbiAgXVxuICByZXR1cm4gYXdhaXQgaW5xdWlyZXIucHJvbXB0KHF1ZXN0aW9ucykgYXMgTW9kdWxlVHlwZU1hcFxufVxuXG4vLyBDcmVhdGUgYSBuZXcgbW9kdWxlIHdpdGggY29uZmlnXG5hc3luYyBmdW5jdGlvbiBhZGRNb2R1bGUoYWRkTW9kdWxlTWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxNb2R1bGVUeXBlQW5kTmFtZT4ge1xuICBjb25zdCBxTmFtZXMgPSB7XG4gICAgQUREX01PRFVMRTogXCJhZGRNb2R1bGVcIixcbiAgICBOQU1FOiBcIm5hbWVcIixcbiAgICBUWVBFOiBcInR5cGVcIixcbiAgfVxuICBjb25zdCBxdWVzdGlvbnM6IGlucXVpcmVyLlF1ZXN0aW9ucyA9IFtcbiAgICB7XG4gICAgICBuYW1lOiBxTmFtZXMuQUREX01PRFVMRSxcbiAgICAgIG1lc3NhZ2U6IGFkZE1vZHVsZU1lc3NhZ2UsXG4gICAgICB0eXBlOiBcImNvbmZpcm1cIixcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6IHFOYW1lcy5OQU1FLFxuICAgICAgbWVzc2FnZTogXCJFbnRlciBtb2R1bGUgbmFtZVwiLFxuICAgICAgdHlwZTogXCJpbnB1dFwiLFxuICAgICAgdmFsaWRhdGU6IGlucHV0ID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBKb2kuYXR0ZW1wdChpbnB1dC50cmltKCksIGpvaUlkZW50aWZpZXIoKSlcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgcmV0dXJuIGBJbnZhbGlkIG1vZHVsZSBuYW1lLCBwbGVhc2UgdHJ5IGFnYWluXFxuRXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9LFxuICAgICAgZmlsdGVyOiBpbnB1dCA9PiBpbnB1dC50cmltKCksXG4gICAgICB3aGVuOiBhbnMgPT4gYW5zW3FOYW1lcy5BRERfTU9EVUxFXSxcbiAgICB9LFxuICAgIHtcbiAgICAgIG5hbWU6IHFOYW1lcy5UWVBFLFxuICAgICAgbWVzc2FnZTogXCJNb2R1bGUgdHlwZVwiLFxuICAgICAgY2hvaWNlczogbW9kdWxlVHlwZUNob2ljZXMsXG4gICAgICB3aGVuOiBhbnMgPT4gYW5zW3FOYW1lcy5OQU1FXSxcbiAgICAgIHR5cGU6IFwibGlzdFwiLFxuICAgIH0sXG4gIF1cbiAgcmV0dXJuIGF3YWl0IGlucXVpcmVyLnByb21wdChxdWVzdGlvbnMpIGFzIE1vZHVsZVR5cGVBbmROYW1lXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXBlYXRBZGRNb2R1bGUoKTogUHJvbWlzZTxNb2R1bGVUeXBlQW5kTmFtZVtdPiB7XG4gIGxldCBtb2R1bGVzOiBNb2R1bGVUeXBlQW5kTmFtZVtdID0gW11cbiAgbGV0IGFkZE1vZHVsZU1lc3NhZ2UgPSBcIldvdWxkIHlvdSBsaWtlIHRvIGFkZCBhIG1vZHVsZSB0byB5b3VyIHByb2plY3Q/XCJcbiAgbGV0IGFucyA9IGF3YWl0IGFkZE1vZHVsZShhZGRNb2R1bGVNZXNzYWdlKVxuXG4gIHdoaWxlIChhbnMudHlwZSkge1xuICAgIG1vZHVsZXMucHVzaCh7IG5hbWU6IGFucy5uYW1lLCB0eXBlOiBhbnMudHlwZSB9KVxuICAgIGFkZE1vZHVsZU1lc3NhZ2UgPSBgQWRkIGFub3RoZXIgbW9kdWxlPyAoY3VycmVudCBtb2R1bGVzOiAke21vZHVsZXMubWFwKG0gPT4gbS5uYW1lKS5qb2luKFwiLCBcIil9KWBcbiAgICBhbnMgPSBhd2FpdCBhZGRNb2R1bGUoYWRkTW9kdWxlTWVzc2FnZSlcbiAgfVxuICByZXR1cm4gbW9kdWxlc1xufVxuXG5leHBvcnQgY29uc3QgcHJvbXB0czogUHJvbXB0cyA9IHtcbiAgYWRkQ29uZmlnRm9yTW9kdWxlLFxuICBhZGRNb2R1bGUsXG4gIHJlcGVhdEFkZE1vZHVsZSxcbn1cbiJdfQ==
