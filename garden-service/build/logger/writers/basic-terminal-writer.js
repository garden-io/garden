"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const renderers_1 = require("../renderers");
const util_1 = require("../util");
const base_1 = require("./base");
class BasicTerminalWriter extends base_1.Writer {
    render(entry, logger) {
        const level = this.level || logger.level;
        if (util_1.validate(level, entry)) {
            return renderers_1.formatForTerminal(entry);
        }
        return null;
    }
    onGraphChange(entry, logger) {
        const out = this.render(entry, logger);
        if (out) {
            process.stdout.write(out);
        }
    }
    stop() { }
}
exports.BasicTerminalWriter = BasicTerminalWriter;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImxvZ2dlci93cml0ZXJzL2Jhc2ljLXRlcm1pbmFsLXdyaXRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOztBQUdILDRDQUFnRDtBQUdoRCxrQ0FBa0M7QUFDbEMsaUNBQStCO0FBRS9CLE1BQWEsbUJBQW9CLFNBQVEsYUFBTTtJQUc3QyxNQUFNLENBQUMsS0FBZSxFQUFFLE1BQWM7UUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFBO1FBQ3hDLElBQUksZUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsRUFBRTtZQUMxQixPQUFPLDZCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFBO1NBQ2hDO1FBQ0QsT0FBTyxJQUFJLENBQUE7SUFDYixDQUFDO0lBRUQsYUFBYSxDQUFDLEtBQWUsRUFBRSxNQUFjO1FBQzNDLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBQ3RDLElBQUksR0FBRyxFQUFFO1lBQ1AsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUE7U0FDMUI7SUFDSCxDQUFDO0lBRUQsSUFBSSxLQUFLLENBQUM7Q0FDWDtBQW5CRCxrREFtQkMiLCJmaWxlIjoibG9nZ2VyL3dyaXRlcnMvYmFzaWMtdGVybWluYWwtd3JpdGVyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IExvZ0xldmVsIH0gZnJvbSBcIi4uL2xvZy1ub2RlXCJcbmltcG9ydCB7IGZvcm1hdEZvclRlcm1pbmFsIH0gZnJvbSBcIi4uL3JlbmRlcmVyc1wiXG5pbXBvcnQgeyBMb2dFbnRyeSB9IGZyb20gXCIuLi9sb2ctZW50cnlcIlxuaW1wb3J0IHsgTG9nZ2VyIH0gZnJvbSBcIi4uL2xvZ2dlclwiXG5pbXBvcnQgeyB2YWxpZGF0ZSB9IGZyb20gXCIuLi91dGlsXCJcbmltcG9ydCB7IFdyaXRlciB9IGZyb20gXCIuL2Jhc2VcIlxuXG5leHBvcnQgY2xhc3MgQmFzaWNUZXJtaW5hbFdyaXRlciBleHRlbmRzIFdyaXRlciB7XG4gIHB1YmxpYyBsZXZlbDogTG9nTGV2ZWxcblxuICByZW5kZXIoZW50cnk6IExvZ0VudHJ5LCBsb2dnZXI6IExvZ2dlcik6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IGxldmVsID0gdGhpcy5sZXZlbCB8fCBsb2dnZXIubGV2ZWxcbiAgICBpZiAodmFsaWRhdGUobGV2ZWwsIGVudHJ5KSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEZvclRlcm1pbmFsKGVudHJ5KVxuICAgIH1cbiAgICByZXR1cm4gbnVsbFxuICB9XG5cbiAgb25HcmFwaENoYW5nZShlbnRyeTogTG9nRW50cnksIGxvZ2dlcjogTG9nZ2VyKSB7XG4gICAgY29uc3Qgb3V0ID0gdGhpcy5yZW5kZXIoZW50cnksIGxvZ2dlcilcbiAgICBpZiAob3V0KSB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShvdXQpXG4gICAgfVxuICB9XG5cbiAgc3RvcCgpIHsgfVxufVxuIl19
