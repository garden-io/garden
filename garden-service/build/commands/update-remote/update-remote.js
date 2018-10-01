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
const sources_1 = require("./sources");
const modules_1 = require("./modules");
const all_1 = require("./all");
class UpdateRemoteCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "update-remote";
        this.help = "Pulls the latest version of remote sources or modules from their repository";
        this.subCommands = [
            sources_1.UpdateRemoteSourcesCommand,
            modules_1.UpdateRemoteModulesCommand,
            all_1.UpdateRemoteAllCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.UpdateRemoteCommand = UpdateRemoteCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VwZGF0ZS1yZW1vdGUvdXBkYXRlLXJlbW90ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsa0NBQWlDO0FBQ2pDLHVDQUFzRDtBQUN0RCx1Q0FBc0Q7QUFDdEQsK0JBQThDO0FBRTlDLE1BQWEsbUJBQW9CLFNBQVEsY0FBTztJQUFoRDs7UUFDRSxTQUFJLEdBQUcsZUFBZSxDQUFBO1FBQ3RCLFNBQUksR0FBRyw2RUFBNkUsQ0FBQTtRQUVwRixnQkFBVyxHQUFHO1lBQ1osb0NBQTBCO1lBQzFCLG9DQUEwQjtZQUMxQiw0QkFBc0I7U0FDdkIsQ0FBQTtJQUdILENBQUM7SUFETyxNQUFNOzhEQUFLLE9BQU8sRUFBRSxDQUFBLENBQUMsQ0FBQztLQUFBO0NBQzdCO0FBWEQsa0RBV0MiLCJmaWxlIjoiY29tbWFuZHMvdXBkYXRlLXJlbW90ZS91cGRhdGUtcmVtb3RlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyBVcGRhdGVSZW1vdGVTb3VyY2VzQ29tbWFuZCB9IGZyb20gXCIuL3NvdXJjZXNcIlxuaW1wb3J0IHsgVXBkYXRlUmVtb3RlTW9kdWxlc0NvbW1hbmQgfSBmcm9tIFwiLi9tb2R1bGVzXCJcbmltcG9ydCB7IFVwZGF0ZVJlbW90ZUFsbENvbW1hbmQgfSBmcm9tIFwiLi9hbGxcIlxuXG5leHBvcnQgY2xhc3MgVXBkYXRlUmVtb3RlQ29tbWFuZCBleHRlbmRzIENvbW1hbmQge1xuICBuYW1lID0gXCJ1cGRhdGUtcmVtb3RlXCJcbiAgaGVscCA9IFwiUHVsbHMgdGhlIGxhdGVzdCB2ZXJzaW9uIG9mIHJlbW90ZSBzb3VyY2VzIG9yIG1vZHVsZXMgZnJvbSB0aGVpciByZXBvc2l0b3J5XCJcblxuICBzdWJDb21tYW5kcyA9IFtcbiAgICBVcGRhdGVSZW1vdGVTb3VyY2VzQ29tbWFuZCxcbiAgICBVcGRhdGVSZW1vdGVNb2R1bGVzQ29tbWFuZCxcbiAgICBVcGRhdGVSZW1vdGVBbGxDb21tYW5kLFxuICBdXG5cbiAgYXN5bmMgYWN0aW9uKCkgeyByZXR1cm4ge30gfVxufVxuIl19
