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
const js_yaml_1 = require("js-yaml");
const util_1 = require("../../util/util");
const base_1 = require("../base");
const module_1 = require("./module");
const service_1 = require("./service");
const test_1 = require("./test");
class RunCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "run";
        this.alias = "r";
        this.help = "Run ad-hoc instances of your modules, services and tests";
        this.subCommands = [
            module_1.RunModuleCommand,
            service_1.RunServiceCommand,
            test_1.RunTestCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.RunCommand = RunCommand;
function printRuntimeContext(garden, runtimeContext) {
    garden.log.verbose("-----------------------------------\n");
    garden.log.verbose("Environment variables:");
    garden.log.verbose(util_1.highlightYaml(js_yaml_1.safeDump(runtimeContext.envVars)));
    garden.log.verbose("Dependencies:");
    garden.log.verbose(util_1.highlightYaml(js_yaml_1.safeDump(runtimeContext.dependencies)));
    garden.log.verbose("-----------------------------------\n");
}
exports.printRuntimeContext = printRuntimeContext;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3J1bi9ydW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILHFDQUFrQztBQUVsQywwQ0FBK0M7QUFDL0Msa0NBQWlDO0FBQ2pDLHFDQUEyQztBQUMzQyx1Q0FBNkM7QUFDN0MsaUNBQXVDO0FBR3ZDLE1BQWEsVUFBVyxTQUFRLGNBQU87SUFBdkM7O1FBQ0UsU0FBSSxHQUFHLEtBQUssQ0FBQTtRQUNaLFVBQUssR0FBRyxHQUFHLENBQUE7UUFDWCxTQUFJLEdBQUcsMERBQTBELENBQUE7UUFFakUsZ0JBQVcsR0FBRztZQUNaLHlCQUFnQjtZQUNoQiwyQkFBaUI7WUFDakIscUJBQWM7U0FDZixDQUFBO0lBR0gsQ0FBQztJQURPLE1BQU07OERBQUssT0FBTyxFQUFFLENBQUEsQ0FBQyxDQUFDO0tBQUE7Q0FDN0I7QUFaRCxnQ0FZQztBQUVELFNBQWdCLG1CQUFtQixDQUFDLE1BQWMsRUFBRSxjQUE4QjtJQUNoRixNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFBO0lBQzNELE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUE7SUFDNUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsb0JBQWEsQ0FBQyxrQkFBUSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDbkUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUE7SUFDbkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsb0JBQWEsQ0FBQyxrQkFBUSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDeEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsdUNBQXVDLENBQUMsQ0FBQTtBQUM3RCxDQUFDO0FBUEQsa0RBT0MiLCJmaWxlIjoiY29tbWFuZHMvcnVuL3J1bi5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBzYWZlRHVtcCB9IGZyb20gXCJqcy15YW1sXCJcbmltcG9ydCB7IFJ1bnRpbWVDb250ZXh0IH0gZnJvbSBcIi4uLy4uL3R5cGVzL3NlcnZpY2VcIlxuaW1wb3J0IHsgaGlnaGxpZ2h0WWFtbCB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gXCIuLi9iYXNlXCJcbmltcG9ydCB7IFJ1bk1vZHVsZUNvbW1hbmQgfSBmcm9tIFwiLi9tb2R1bGVcIlxuaW1wb3J0IHsgUnVuU2VydmljZUNvbW1hbmQgfSBmcm9tIFwiLi9zZXJ2aWNlXCJcbmltcG9ydCB7IFJ1blRlc3RDb21tYW5kIH0gZnJvbSBcIi4vdGVzdFwiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vLi4vZ2FyZGVuXCJcblxuZXhwb3J0IGNsYXNzIFJ1bkNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwicnVuXCJcbiAgYWxpYXMgPSBcInJcIlxuICBoZWxwID0gXCJSdW4gYWQtaG9jIGluc3RhbmNlcyBvZiB5b3VyIG1vZHVsZXMsIHNlcnZpY2VzIGFuZCB0ZXN0c1wiXG5cbiAgc3ViQ29tbWFuZHMgPSBbXG4gICAgUnVuTW9kdWxlQ29tbWFuZCxcbiAgICBSdW5TZXJ2aWNlQ29tbWFuZCxcbiAgICBSdW5UZXN0Q29tbWFuZCxcbiAgXVxuXG4gIGFzeW5jIGFjdGlvbigpIHsgcmV0dXJuIHt9IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByaW50UnVudGltZUNvbnRleHQoZ2FyZGVuOiBHYXJkZW4sIHJ1bnRpbWVDb250ZXh0OiBSdW50aW1lQ29udGV4dCkge1xuICBnYXJkZW4ubG9nLnZlcmJvc2UoXCItLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcblwiKVxuICBnYXJkZW4ubG9nLnZlcmJvc2UoXCJFbnZpcm9ubWVudCB2YXJpYWJsZXM6XCIpXG4gIGdhcmRlbi5sb2cudmVyYm9zZShoaWdobGlnaHRZYW1sKHNhZmVEdW1wKHJ1bnRpbWVDb250ZXh0LmVudlZhcnMpKSlcbiAgZ2FyZGVuLmxvZy52ZXJib3NlKFwiRGVwZW5kZW5jaWVzOlwiKVxuICBnYXJkZW4ubG9nLnZlcmJvc2UoaGlnaGxpZ2h0WWFtbChzYWZlRHVtcChydW50aW1lQ29udGV4dC5kZXBlbmRlbmNpZXMpKSlcbiAgZ2FyZGVuLmxvZy52ZXJib3NlKFwiLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG5cIilcbn1cbiJdfQ==
