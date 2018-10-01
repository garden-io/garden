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
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const Bluebird = require("bluebird");
const util_1 = require("./util/util");
const exceptions_1 = require("./exceptions");
class TemplateStringError extends exceptions_1.GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "template-string";
    }
}
let _parser;
function getParser() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!_parser) {
            try {
                _parser = require("./template-string-parser");
            }
            catch (_err) {
                // fallback for when running with ts-node or mocha
                const peg = require("pegjs");
                const pegFilePath = path_1.resolve(__dirname, "template-string-parser.pegjs");
                const grammar = yield fs_extra_1.readFile(pegFilePath);
                _parser = peg.generate(grammar.toString(), { trace: false });
            }
        }
        return _parser;
    });
}
/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 */
function resolveTemplateString(string, context, stack) {
    return __awaiter(this, void 0, void 0, function* () {
        const parser = yield getParser();
        const parsed = parser.parse(string, {
            getKey: (key) => __awaiter(this, void 0, void 0, function* () { return context.resolve({ key, nodePath: [], stack }); }),
            // need this to allow nested template strings
            resolve: (parts) => __awaiter(this, void 0, void 0, function* () {
                const s = (yield Bluebird.all(parts)).join("");
                return resolveTemplateString(`\$\{${s}\}`, context, stack);
            }),
            TemplateStringError,
        });
        const resolved = yield Bluebird.all(parsed);
        return resolved.join("");
    });
}
exports.resolveTemplateString = resolveTemplateString;
/**
 * Recursively parses and resolves all templated strings in the given object.
 */
function resolveTemplateStrings(obj, context) {
    return __awaiter(this, void 0, void 0, function* () {
        return util_1.asyncDeepMap(obj, (v) => typeof v === "string" ? resolveTemplateString(v, context) : v, 
        // need to iterate sequentially to catch potential circular dependencies
        { concurrency: 1 });
    });
}
exports.resolveTemplateStrings = resolveTemplateStrings;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRlbXBsYXRlLXN0cmluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsdUNBQW1DO0FBQ25DLCtCQUE4QjtBQUM5QixxQ0FBcUM7QUFDckMsc0NBQTBDO0FBQzFDLDZDQUE4QztBQUs5QyxNQUFNLG1CQUFvQixTQUFRLDRCQUFlO0lBQWpEOztRQUNFLFNBQUksR0FBRyxpQkFBaUIsQ0FBQTtJQUMxQixDQUFDO0NBQUE7QUFFRCxJQUFJLE9BQVksQ0FBQTtBQUVoQixTQUFlLFNBQVM7O1FBQ3RCLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDWixJQUFJO2dCQUNGLE9BQU8sR0FBRyxPQUFPLENBQUMsMEJBQTBCLENBQUMsQ0FBQTthQUM5QztZQUFDLE9BQU8sSUFBSSxFQUFFO2dCQUNiLGtEQUFrRDtnQkFDbEQsTUFBTSxHQUFHLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFBO2dCQUM1QixNQUFNLFdBQVcsR0FBRyxjQUFPLENBQUMsU0FBUyxFQUFFLDhCQUE4QixDQUFDLENBQUE7Z0JBQ3RFLE1BQU0sT0FBTyxHQUFHLE1BQU0sbUJBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQTtnQkFDM0MsT0FBTyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUE7YUFDN0Q7U0FDRjtRQUVELE9BQU8sT0FBTyxDQUFBO0lBQ2hCLENBQUM7Q0FBQTtBQUVEOzs7Ozs7O0dBT0c7QUFDSCxTQUFzQixxQkFBcUIsQ0FBQyxNQUFjLEVBQUUsT0FBc0IsRUFBRSxLQUFnQjs7UUFDbEcsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLEVBQUUsQ0FBQTtRQUNoQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNsQyxNQUFNLEVBQUUsQ0FBTyxHQUFhLEVBQUUsRUFBRSxnREFBQyxPQUFBLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFBLEdBQUE7WUFDOUUsNkNBQTZDO1lBQzdDLE9BQU8sRUFBRSxDQUFPLEtBQThCLEVBQUUsRUFBRTtnQkFDaEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7Z0JBQzlDLE9BQU8scUJBQXFCLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUE7WUFDNUQsQ0FBQyxDQUFBO1lBQ0QsbUJBQW1CO1NBQ3BCLENBQUMsQ0FBQTtRQUVGLE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUMzQyxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUE7SUFDMUIsQ0FBQztDQUFBO0FBZEQsc0RBY0M7QUFFRDs7R0FFRztBQUNILFNBQXNCLHNCQUFzQixDQUFtQixHQUFNLEVBQUUsT0FBc0I7O1FBQzNGLE9BQU8sbUJBQVksQ0FDakIsR0FBRyxFQUNILENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRSx3RUFBd0U7UUFDeEUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQ25CLENBQUE7SUFDSCxDQUFDO0NBQUE7QUFQRCx3REFPQyIsImZpbGUiOiJ0ZW1wbGF0ZS1zdHJpbmcuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgcmVhZEZpbGUgfSBmcm9tIFwiZnMtZXh0cmFcIlxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCBCbHVlYmlyZCA9IHJlcXVpcmUoXCJibHVlYmlyZFwiKVxuaW1wb3J0IHsgYXN5bmNEZWVwTWFwIH0gZnJvbSBcIi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IEdhcmRlbkJhc2VFcnJvciB9IGZyb20gXCIuL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHsgQ29uZmlnQ29udGV4dCB9IGZyb20gXCIuL2NvbmZpZy9jb25maWctY29udGV4dFwiXG5cbmV4cG9ydCB0eXBlIFN0cmluZ09yU3RyaW5nUHJvbWlzZSA9IFByb21pc2U8c3RyaW5nPiB8IHN0cmluZ1xuXG5jbGFzcyBUZW1wbGF0ZVN0cmluZ0Vycm9yIGV4dGVuZHMgR2FyZGVuQmFzZUVycm9yIHtcbiAgdHlwZSA9IFwidGVtcGxhdGUtc3RyaW5nXCJcbn1cblxubGV0IF9wYXJzZXI6IGFueVxuXG5hc3luYyBmdW5jdGlvbiBnZXRQYXJzZXIoKSB7XG4gIGlmICghX3BhcnNlcikge1xuICAgIHRyeSB7XG4gICAgICBfcGFyc2VyID0gcmVxdWlyZShcIi4vdGVtcGxhdGUtc3RyaW5nLXBhcnNlclwiKVxuICAgIH0gY2F0Y2ggKF9lcnIpIHtcbiAgICAgIC8vIGZhbGxiYWNrIGZvciB3aGVuIHJ1bm5pbmcgd2l0aCB0cy1ub2RlIG9yIG1vY2hhXG4gICAgICBjb25zdCBwZWcgPSByZXF1aXJlKFwicGVnanNcIilcbiAgICAgIGNvbnN0IHBlZ0ZpbGVQYXRoID0gcmVzb2x2ZShfX2Rpcm5hbWUsIFwidGVtcGxhdGUtc3RyaW5nLXBhcnNlci5wZWdqc1wiKVxuICAgICAgY29uc3QgZ3JhbW1hciA9IGF3YWl0IHJlYWRGaWxlKHBlZ0ZpbGVQYXRoKVxuICAgICAgX3BhcnNlciA9IHBlZy5nZW5lcmF0ZShncmFtbWFyLnRvU3RyaW5nKCksIHsgdHJhY2U6IGZhbHNlIH0pXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIF9wYXJzZXJcbn1cblxuLyoqXG4gKiBQYXJzZSBhbmQgcmVzb2x2ZSBhIHRlbXBsYXRlZCBzdHJpbmcsIHdpdGggdGhlIGdpdmVuIGNvbnRleHQuIFRoZSB0ZW1wbGF0ZSBmb3JtYXQgaXMgc2ltaWxhciB0byBuYXRpdmUgSlMgdGVtcGxhdGVkXG4gKiBzdHJpbmdzIGJ1dCBvbmx5IHN1cHBvcnRzIHNpbXBsZSBsb29rdXBzIGZyb20gdGhlIGdpdmVuIGNvbnRleHQsIGUuZy4gXCJwcmVmaXgtJHtuZXN0ZWQua2V5fS1zdWZmaXhcIiwgYW5kIG5vdFxuICogYXJiaXRyYXJ5IEpTIGNvZGUuXG4gKlxuICogVGhlIGNvbnRleHQgc2hvdWxkIGJlIGEgQ29uZmlnQ29udGV4dCBpbnN0YW5jZS4gVGhlIG9wdGlvbmFsIGBzdGFja2AgcGFyYW1ldGVyIGlzIHVzZWQgdG8gZGV0ZWN0IGNpcmN1bGFyXG4gKiBkZXBlbmRlbmNpZXMgd2hlbiByZXNvbHZpbmcgY29udGV4dCB2YXJpYWJsZXMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlVGVtcGxhdGVTdHJpbmcoc3RyaW5nOiBzdHJpbmcsIGNvbnRleHQ6IENvbmZpZ0NvbnRleHQsIHN0YWNrPzogc3RyaW5nW10pIHtcbiAgY29uc3QgcGFyc2VyID0gYXdhaXQgZ2V0UGFyc2VyKClcbiAgY29uc3QgcGFyc2VkID0gcGFyc2VyLnBhcnNlKHN0cmluZywge1xuICAgIGdldEtleTogYXN5bmMgKGtleTogc3RyaW5nW10pID0+IGNvbnRleHQucmVzb2x2ZSh7IGtleSwgbm9kZVBhdGg6IFtdLCBzdGFjayB9KSxcbiAgICAvLyBuZWVkIHRoaXMgdG8gYWxsb3cgbmVzdGVkIHRlbXBsYXRlIHN0cmluZ3NcbiAgICByZXNvbHZlOiBhc3luYyAocGFydHM6IFN0cmluZ09yU3RyaW5nUHJvbWlzZVtdKSA9PiB7XG4gICAgICBjb25zdCBzID0gKGF3YWl0IEJsdWViaXJkLmFsbChwYXJ0cykpLmpvaW4oXCJcIilcbiAgICAgIHJldHVybiByZXNvbHZlVGVtcGxhdGVTdHJpbmcoYFxcJFxceyR7c31cXH1gLCBjb250ZXh0LCBzdGFjaylcbiAgICB9LFxuICAgIFRlbXBsYXRlU3RyaW5nRXJyb3IsXG4gIH0pXG5cbiAgY29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBCbHVlYmlyZC5hbGwocGFyc2VkKVxuICByZXR1cm4gcmVzb2x2ZWQuam9pbihcIlwiKVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IHBhcnNlcyBhbmQgcmVzb2x2ZXMgYWxsIHRlbXBsYXRlZCBzdHJpbmdzIGluIHRoZSBnaXZlbiBvYmplY3QuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlVGVtcGxhdGVTdHJpbmdzPFQgZXh0ZW5kcyBvYmplY3Q+KG9iajogVCwgY29udGV4dDogQ29uZmlnQ29udGV4dCk6IFByb21pc2U8VD4ge1xuICByZXR1cm4gYXN5bmNEZWVwTWFwKFxuICAgIG9iaixcbiAgICAodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyByZXNvbHZlVGVtcGxhdGVTdHJpbmcodiwgY29udGV4dCkgOiB2LFxuICAgIC8vIG5lZWQgdG8gaXRlcmF0ZSBzZXF1ZW50aWFsbHkgdG8gY2F0Y2ggcG90ZW50aWFsIGNpcmN1bGFyIGRlcGVuZGVuY2llc1xuICAgIHsgY29uY3VycmVuY3k6IDEgfSxcbiAgKVxufVxuIl19
