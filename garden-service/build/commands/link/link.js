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
const source_1 = require("./source");
const module_1 = require("./module");
class LinkCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "link";
        this.help = "Link a remote source or module to a local path";
        this.subCommands = [
            source_1.LinkSourceCommand,
            module_1.LinkModuleCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.LinkCommand = LinkCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2xpbmsvbGluay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsa0NBQWlDO0FBQ2pDLHFDQUE0QztBQUM1QyxxQ0FBNEM7QUFFNUMsTUFBYSxXQUFZLFNBQVEsY0FBTztJQUF4Qzs7UUFDRSxTQUFJLEdBQUcsTUFBTSxDQUFBO1FBQ2IsU0FBSSxHQUFHLGdEQUFnRCxDQUFBO1FBRXZELGdCQUFXLEdBQUc7WUFDWiwwQkFBaUI7WUFDakIsMEJBQWlCO1NBQ2xCLENBQUE7SUFHSCxDQUFDO0lBRE8sTUFBTTs4REFBSyxPQUFPLEVBQUUsQ0FBQSxDQUFDLENBQUM7S0FBQTtDQUM3QjtBQVZELGtDQVVDIiwiZmlsZSI6ImNvbW1hbmRzL2xpbmsvbGluay5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgTGlua1NvdXJjZUNvbW1hbmQgfSBmcm9tIFwiLi9zb3VyY2VcIlxuaW1wb3J0IHsgTGlua01vZHVsZUNvbW1hbmQgfSBmcm9tIFwiLi9tb2R1bGVcIlxuXG5leHBvcnQgY2xhc3MgTGlua0NvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwibGlua1wiXG4gIGhlbHAgPSBcIkxpbmsgYSByZW1vdGUgc291cmNlIG9yIG1vZHVsZSB0byBhIGxvY2FsIHBhdGhcIlxuXG4gIHN1YkNvbW1hbmRzID0gW1xuICAgIExpbmtTb3VyY2VDb21tYW5kLFxuICAgIExpbmtNb2R1bGVDb21tYW5kLFxuICBdXG5cbiAgYXN5bmMgYWN0aW9uKCkgeyByZXR1cm4ge30gfVxufVxuIl19
