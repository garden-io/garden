#!/usr/bin/env ts-node
"use strict";
/**
 * Scans all package.json files in the repo and throws if one or more packages have a disallowed license
 * (i.e. GPL, other copyleft licenses).
 *
 * Stores a CSV dump
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var npm_license_crawler_1 = require("npm-license-crawler");
var path_1 = require("path");
var bluebird_1 = require("bluebird");
var treeify_1 = require("treeify");
var sync_1 = require("csv-stringify/sync");
var fs_extra_1 = require("fs-extra");
var gardenRoot = path_1.resolve(__dirname, "..");
var disallowedLicenses = [
    /^AGPL/,
    /^copyleft/,
    "CC-BY-NC",
    "CC-BY-SA",
    /^FAL/,
    /^GPL/,
];
var dumpLicensesAsync = bluebird_1.promisify(npm_license_crawler_1.dumpLicenses);
function checkPackageLicenses(root) {
    return __awaiter(this, void 0, void 0, function () {
        var res, disallowedPackages, _i, _a, _b, name_1, entry, licenses, anyAllowed, _c, licenses_1, license, allowed, _d, disallowedLicenses_1, d, csvPath, rows, disallowedCount, msg;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, dumpLicensesAsync({ start: [root] })];
                case 1:
                    res = _e.sent();
                    disallowedPackages = {};
                    for (_i = 0, _a = Object.entries(res); _i < _a.length; _i++) {
                        _b = _a[_i], name_1 = _b[0], entry = _b[1];
                        licenses = entry.licenses.trimEnd().split(" OR ");
                        if (licenses[0].startsWith("(")) {
                            licenses[0] = licenses[0].slice(1);
                        }
                        if (licenses[licenses.length - 1].endsWith(")")) {
                            licenses[licenses.length - 1] = licenses[licenses.length - 1].slice(0, -1);
                        }
                        anyAllowed = false;
                        for (_c = 0, licenses_1 = licenses; _c < licenses_1.length; _c++) {
                            license = licenses_1[_c];
                            allowed = true;
                            for (_d = 0, disallowedLicenses_1 = disallowedLicenses; _d < disallowedLicenses_1.length; _d++) {
                                d = disallowedLicenses_1[_d];
                                if (license.match(d)) {
                                    allowed = false;
                                    break;
                                }
                            }
                            if (allowed) {
                                anyAllowed = true;
                                break;
                            }
                        }
                        if (!anyAllowed) {
                            disallowedPackages[name_1] = __assign(__assign({}, entry), { licenses: entry.licenses });
                        }
                    }
                    csvPath = path_1.join(gardenRoot, "tmp", "package-licenses.csv");
                    console.log("Dumping CSV to " + csvPath);
                    rows = Object.entries(res).map(function (_a) {
                        var name = _a[0], entry = _a[1];
                        return (__assign({ name: name }, entry));
                    });
                    return [4 /*yield*/, fs_extra_1.writeFile(csvPath, sync_1.stringify(rows, { header: true }))
                        // Throw on disallowed licenses
                    ];
                case 2:
                    _e.sent();
                    disallowedCount = Object.keys(disallowedPackages).length;
                    if (disallowedCount > 0) {
                        msg = "\nFound " + disallowedCount + " packages with disallowed licenses:\n";
                        msg += treeify_1.asTree(disallowedPackages, true, true);
                        throw new Error(msg);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
if (require.main === module) {
    checkPackageLicenses(gardenRoot)["catch"](function (error) {
        console.error(error.message);
        process.exit(1);
    });
}
