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
const base_1 = require("../base");
const project_1 = require("./project");
const module_1 = require("./module");
class CreateCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "create";
        this.alias = "r";
        this.help = "Create a new project or add a new module";
        this.subCommands = [
            project_1.CreateProjectCommand,
            module_1.CreateModuleCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.CreateCommand = CreateCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9jcmVhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGtDQUFpQztBQUNqQyx1Q0FBZ0Q7QUFDaEQscUNBQThDO0FBRTlDLE1BQWEsYUFBYyxTQUFRLGNBQU87SUFBMUM7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFVBQUssR0FBRyxHQUFHLENBQUE7UUFDWCxTQUFJLEdBQUcsMENBQTBDLENBQUE7UUFFakQsZ0JBQVcsR0FBRztZQUNaLDhCQUFvQjtZQUNwQiw0QkFBbUI7U0FDcEIsQ0FBQTtJQUdILENBQUM7SUFETyxNQUFNOzhEQUFLLE9BQU8sRUFBRSxDQUFBLENBQUMsQ0FBQztLQUFBO0NBQzdCO0FBWEQsc0NBV0MiLCJmaWxlIjoiY29tbWFuZHMvY3JlYXRlL2NyZWF0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgQ3JlYXRlUHJvamVjdENvbW1hbmQgfSBmcm9tIFwiLi9wcm9qZWN0XCJcbmltcG9ydCB7IENyZWF0ZU1vZHVsZUNvbW1hbmQgfSBmcm9tIFwiLi9tb2R1bGVcIlxuXG5leHBvcnQgY2xhc3MgQ3JlYXRlQ29tbWFuZCBleHRlbmRzIENvbW1hbmQge1xuICBuYW1lID0gXCJjcmVhdGVcIlxuICBhbGlhcyA9IFwiclwiXG4gIGhlbHAgPSBcIkNyZWF0ZSBhIG5ldyBwcm9qZWN0IG9yIGFkZCBhIG5ldyBtb2R1bGVcIlxuXG4gIHN1YkNvbW1hbmRzID0gW1xuICAgIENyZWF0ZVByb2plY3RDb21tYW5kLFxuICAgIENyZWF0ZU1vZHVsZUNvbW1hbmQsXG4gIF1cblxuICBhc3luYyBhY3Rpb24oKSB7IHJldHVybiB7fSB9XG59XG4iXX0=
