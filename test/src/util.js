"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncIterator) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator];
    return m ? m.call(o) : typeof __values === "function" ? __values(o) : o[Symbol.iterator]();
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../../src/util");
const path_1 = require("path");
const chai_1 = require("chai");
describe("util", () => {
    describe("scanDirectory", () => {
        it("should iterate through all files in a directory", () => __awaiter(this, void 0, void 0, function* () {
            const testPath = path_1.join(__dirname, "..", "data", "scanDirectory");
            let count = 0;
            const expectedPaths = ["1", "2", "3", "subdir", "subdir/4"].map((f) => path_1.join(testPath, f));
            try {
                for (var _a = __asyncValues(util_1.scanDirectory(testPath)), _b; _b = yield _a.next(), !_b.done;) {
                    const item = yield _b.value;
                    chai_1.expect(expectedPaths).to.include(item.path);
                    count++;
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_b && !_b.done && (_c = _a.return)) yield _c.call(_a);
                }
                finally { if (e_1) throw e_1.error; }
            }
            chai_1.expect(count).to.eq(5);
            var e_1, _c;
        }));
        it("should filter files based on filter function", () => __awaiter(this, void 0, void 0, function* () {
            const testPath = path_1.join(__dirname, "..", "data", "scanDirectory");
            const filterFunc = (item) => !item.includes("scanDirectory/subdir");
            const expectedPaths = ["1", "2", "3"].map((f) => path_1.join(testPath, f));
            let count = 0;
            try {
                for (var _a = __asyncValues(util_1.scanDirectory(testPath, { filter: filterFunc })), _b; _b = yield _a.next(), !_b.done;) {
                    const item = yield _b.value;
                    chai_1.expect(expectedPaths).to.include(item.path);
                    count++;
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_b && !_b.done && (_c = _a.return)) yield _c.call(_a);
                }
                finally { if (e_2) throw e_2.error; }
            }
            chai_1.expect(count).to.eq(3);
            var e_2, _c;
        }));
    });
});
//# sourceMappingURL=util.js.map