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
class UnlinkCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "unlink";
        this.help = "Unlink a remote source or module from its local path";
        this.subCommands = [
            source_1.UnlinkSourceCommand,
            module_1.UnlinkModuleCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.UnlinkCommand = UnlinkCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VubGluay91bmxpbmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGtDQUFpQztBQUNqQyxxQ0FBOEM7QUFDOUMscUNBQThDO0FBRTlDLE1BQWEsYUFBYyxTQUFRLGNBQU87SUFBMUM7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFNBQUksR0FBRyxzREFBc0QsQ0FBQTtRQUU3RCxnQkFBVyxHQUFHO1lBQ1osNEJBQW1CO1lBQ25CLDRCQUFtQjtTQUNwQixDQUFBO0lBR0gsQ0FBQztJQURPLE1BQU07OERBQUssT0FBTyxFQUFFLENBQUEsQ0FBQyxDQUFDO0tBQUE7Q0FDN0I7QUFWRCxzQ0FVQyIsImZpbGUiOiJjb21tYW5kcy91bmxpbmsvdW5saW5rLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IENvbW1hbmQgfSBmcm9tIFwiLi4vYmFzZVwiXG5pbXBvcnQgeyBVbmxpbmtTb3VyY2VDb21tYW5kIH0gZnJvbSBcIi4vc291cmNlXCJcbmltcG9ydCB7IFVubGlua01vZHVsZUNvbW1hbmQgfSBmcm9tIFwiLi9tb2R1bGVcIlxuXG5leHBvcnQgY2xhc3MgVW5saW5rQ29tbWFuZCBleHRlbmRzIENvbW1hbmQge1xuICBuYW1lID0gXCJ1bmxpbmtcIlxuICBoZWxwID0gXCJVbmxpbmsgYSByZW1vdGUgc291cmNlIG9yIG1vZHVsZSBmcm9tIGl0cyBsb2NhbCBwYXRoXCJcblxuICBzdWJDb21tYW5kcyA9IFtcbiAgICBVbmxpbmtTb3VyY2VDb21tYW5kLFxuICAgIFVubGlua01vZHVsZUNvbW1hbmQsXG4gIF1cblxuICBhc3luYyBhY3Rpb24oKSB7IHJldHVybiB7fSB9XG59XG4iXX0=
