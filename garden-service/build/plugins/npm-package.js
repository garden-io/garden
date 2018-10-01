"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const generic_1 = require("./generic");
exports.gardenPlugin = () => ({
    moduleActions: {
        "npm-package": generic_1.genericPlugin.moduleActions.generic,
    },
});

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMvbnBtLXBhY2thZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7QUFHSCx1Q0FFa0I7QUFFTCxRQUFBLFlBQVksR0FBRyxHQUFpQixFQUFFLENBQUMsQ0FBQztJQUMvQyxhQUFhLEVBQUU7UUFDYixhQUFhLEVBQUUsdUJBQWEsQ0FBQyxhQUFjLENBQUMsT0FBTztLQUNwRDtDQUNGLENBQUMsQ0FBQSIsImZpbGUiOiJwbHVnaW5zL25wbS1wYWNrYWdlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IEdhcmRlblBsdWdpbiB9IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vcGx1Z2luXCJcbmltcG9ydCB7XG4gIGdlbmVyaWNQbHVnaW4sXG59IGZyb20gXCIuL2dlbmVyaWNcIlxuXG5leHBvcnQgY29uc3QgZ2FyZGVuUGx1Z2luID0gKCk6IEdhcmRlblBsdWdpbiA9PiAoe1xuICBtb2R1bGVBY3Rpb25zOiB7XG4gICAgXCJucG0tcGFja2FnZVwiOiBnZW5lcmljUGx1Z2luLm1vZHVsZUFjdGlvbnMhLmdlbmVyaWMsXG4gIH0sXG59KVxuIl19
