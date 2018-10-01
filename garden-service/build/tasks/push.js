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
const chalk_1 = require("chalk");
const build_1 = require("./build");
const base_1 = require("../tasks/base");
class PushTask extends base_1.Task {
    constructor({ garden, module, forceBuild }) {
        super({ garden, version: module.version });
        this.type = "push";
        this.module = module;
        this.forceBuild = forceBuild;
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            return [new build_1.BuildTask({
                    garden: this.garden,
                    module: this.module,
                    force: this.forceBuild,
                })];
        });
    }
    getName() {
        return this.module.name;
    }
    getDescription() {
        return `pushing module ${this.module.name}`;
    }
    process() {
        return __awaiter(this, void 0, void 0, function* () {
            // avoid logging stuff if there is no push handler
            const defaultHandler = () => __awaiter(this, void 0, void 0, function* () { return ({ pushed: false }); });
            const handler = yield this.garden.getModuleActionHandler({
                moduleType: this.module.type,
                actionType: "pushModule",
                defaultHandler,
            });
            if (handler === defaultHandler) {
                return { pushed: false };
            }
            const logEntry = this.garden.log.info({
                section: this.module.name,
                msg: "Pushing",
                status: "active",
            });
            let result;
            try {
                result = yield this.garden.actions.pushModule({ module: this.module, logEntry });
            }
            catch (err) {
                logEntry.setError();
                throw err;
            }
            if (result.pushed) {
                logEntry.setSuccess({ msg: chalk_1.default.green(result.message || `Ready`), append: true });
            }
            else if (result.message) {
                logEntry.setWarn({ msg: result.message, append: true });
            }
            return result;
        });
    }
}
exports.PushTask = PushTask;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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c0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgQnVpbGRUYXNrIH0gZnJvbSBcIi4vYnVpbGRcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBQdXNoUmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzL3BsdWdpbi9vdXRwdXRzXCJcbmltcG9ydCB7IFRhc2sgfSBmcm9tIFwiLi4vdGFza3MvYmFzZVwiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vZ2FyZGVuXCJcblxuZXhwb3J0IGludGVyZmFjZSBQdXNoVGFza1BhcmFtcyB7XG4gIGdhcmRlbjogR2FyZGVuXG4gIG1vZHVsZTogTW9kdWxlXG4gIGZvcmNlQnVpbGQ6IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIFB1c2hUYXNrIGV4dGVuZHMgVGFzayB7XG4gIHR5cGUgPSBcInB1c2hcIlxuXG4gIHByaXZhdGUgbW9kdWxlOiBNb2R1bGVcbiAgcHJpdmF0ZSBmb3JjZUJ1aWxkOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IoeyBnYXJkZW4sIG1vZHVsZSwgZm9yY2VCdWlsZCB9OiBQdXNoVGFza1BhcmFtcykge1xuICAgIHN1cGVyKHsgZ2FyZGVuLCB2ZXJzaW9uOiBtb2R1bGUudmVyc2lvbiB9KVxuICAgIHRoaXMubW9kdWxlID0gbW9kdWxlXG4gICAgdGhpcy5mb3JjZUJ1aWxkID0gZm9yY2VCdWlsZFxuICB9XG5cbiAgYXN5bmMgZ2V0RGVwZW5kZW5jaWVzKCkge1xuICAgIHJldHVybiBbbmV3IEJ1aWxkVGFzayh7XG4gICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgbW9kdWxlOiB0aGlzLm1vZHVsZSxcbiAgICAgIGZvcmNlOiB0aGlzLmZvcmNlQnVpbGQsXG4gICAgfSldXG4gIH1cblxuICBnZXROYW1lKCkge1xuICAgIHJldHVybiB0aGlzLm1vZHVsZS5uYW1lXG4gIH1cblxuICBnZXREZXNjcmlwdGlvbigpIHtcbiAgICByZXR1cm4gYHB1c2hpbmcgbW9kdWxlICR7dGhpcy5tb2R1bGUubmFtZX1gXG4gIH1cblxuICBhc3luYyBwcm9jZXNzKCk6IFByb21pc2U8UHVzaFJlc3VsdD4ge1xuICAgIC8vIGF2b2lkIGxvZ2dpbmcgc3R1ZmYgaWYgdGhlcmUgaXMgbm8gcHVzaCBoYW5kbGVyXG4gICAgY29uc3QgZGVmYXVsdEhhbmRsZXIgPSBhc3luYyAoKSA9PiAoeyBwdXNoZWQ6IGZhbHNlIH0pXG4gICAgY29uc3QgaGFuZGxlciA9IGF3YWl0IHRoaXMuZ2FyZGVuLmdldE1vZHVsZUFjdGlvbkhhbmRsZXIoe1xuICAgICAgbW9kdWxlVHlwZTogdGhpcy5tb2R1bGUudHlwZSxcbiAgICAgIGFjdGlvblR5cGU6IFwicHVzaE1vZHVsZVwiLFxuICAgICAgZGVmYXVsdEhhbmRsZXIsXG4gICAgfSlcblxuICAgIGlmIChoYW5kbGVyID09PSBkZWZhdWx0SGFuZGxlcikge1xuICAgICAgcmV0dXJuIHsgcHVzaGVkOiBmYWxzZSB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9nRW50cnkgPSB0aGlzLmdhcmRlbi5sb2cuaW5mbyh7XG4gICAgICBzZWN0aW9uOiB0aGlzLm1vZHVsZS5uYW1lLFxuICAgICAgbXNnOiBcIlB1c2hpbmdcIixcbiAgICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgICB9KVxuXG4gICAgbGV0IHJlc3VsdDogUHVzaFJlc3VsdFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmdhcmRlbi5hY3Rpb25zLnB1c2hNb2R1bGUoeyBtb2R1bGU6IHRoaXMubW9kdWxlLCBsb2dFbnRyeSB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nRW50cnkuc2V0RXJyb3IoKVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5wdXNoZWQpIHtcbiAgICAgIGxvZ0VudHJ5LnNldFN1Y2Nlc3MoeyBtc2c6IGNoYWxrLmdyZWVuKHJlc3VsdC5tZXNzYWdlIHx8IGBSZWFkeWApLCBhcHBlbmQ6IHRydWUgfSlcbiAgICB9IGVsc2UgaWYgKHJlc3VsdC5tZXNzYWdlKSB7XG4gICAgICBsb2dFbnRyeS5zZXRXYXJuKHsgbXNnOiByZXN1bHQubWVzc2FnZSwgYXBwZW5kOiB0cnVlIH0pXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG59XG4iXX0=
