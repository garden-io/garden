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
const Bluebird = require("bluebird");
const chalk_1 = require("chalk");
const base_1 = require("../tasks/base");
class BuildTask extends base_1.Task {
    constructor({ garden, force, module }) {
        super({ garden, force, version: module.version });
        this.type = "build";
        this.module = module;
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            const deps = yield this.garden.resolveModuleDependencies(this.module.build.dependencies, []);
            return Bluebird.map(deps, (m) => __awaiter(this, void 0, void 0, function* () {
                return new BuildTask({
                    garden: this.garden,
                    module: m,
                    force: this.force,
                });
            }));
        });
    }
    getName() {
        return this.module.name;
    }
    getDescription() {
        return `building ${this.module.name}`;
    }
    process() {
        return __awaiter(this, void 0, void 0, function* () {
            const module = this.module;
            if (!this.force && (yield this.garden.actions.getBuildStatus({ module })).ready) {
                // this is necessary in case other modules depend on files from this one
                yield this.garden.buildDir.syncDependencyProducts(this.module);
                return { fresh: false };
            }
            const logEntry = this.garden.log.info({
                section: this.module.name,
                msg: "Building",
                status: "active",
            });
            let result;
            try {
                result = yield this.garden.actions.build({
                    module,
                    logEntry,
                });
            }
            catch (err) {
                logEntry.setError();
                throw err;
            }
            logEntry.setSuccess({ msg: chalk_1.default.green(`Done (took ${logEntry.getDuration(1)} sec)`), append: true });
            return result;
        });
    }
}
exports.BuildTask = BuildTask;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRhc2tzL2J1aWxkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxxQ0FBb0M7QUFDcEMsaUNBQXlCO0FBR3pCLHdDQUFvQztBQVNwQyxNQUFhLFNBQVUsU0FBUSxXQUFJO0lBS2pDLFlBQVksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBbUI7UUFDcEQsS0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUE7UUFMbkQsU0FBSSxHQUFHLE9BQU8sQ0FBQTtRQU1aLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFBO0lBQ3RCLENBQUM7SUFFSyxlQUFlOztZQUNuQixNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFBO1lBQzVGLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBTyxDQUFTLEVBQUUsRUFBRTtnQkFDNUMsT0FBTyxJQUFJLFNBQVMsQ0FBQztvQkFDbkIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO29CQUNuQixNQUFNLEVBQUUsQ0FBQztvQkFDVCxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7aUJBQ2xCLENBQUMsQ0FBQTtZQUNKLENBQUMsQ0FBQSxDQUFDLENBQUE7UUFDSixDQUFDO0tBQUE7SUFFUyxPQUFPO1FBQ2YsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQTtJQUN6QixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU8sWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFBO0lBQ3ZDLENBQUM7SUFFSyxPQUFPOztZQUNYLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUE7WUFFMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUU7Z0JBQy9FLHdFQUF3RTtnQkFDeEUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUE7Z0JBQzlELE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUE7YUFDeEI7WUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ3BDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUk7Z0JBQ3pCLEdBQUcsRUFBRSxVQUFVO2dCQUNmLE1BQU0sRUFBRSxRQUFRO2FBQ2pCLENBQUMsQ0FBQTtZQUVGLElBQUksTUFBbUIsQ0FBQTtZQUN2QixJQUFJO2dCQUNGLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztvQkFDdkMsTUFBTTtvQkFDTixRQUFRO2lCQUNULENBQUMsQ0FBQTthQUNIO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFBO2dCQUNuQixNQUFNLEdBQUcsQ0FBQTthQUNWO1lBRUQsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxlQUFLLENBQUMsS0FBSyxDQUFDLGNBQWMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUE7WUFDckcsT0FBTyxNQUFNLENBQUE7UUFDZixDQUFDO0tBQUE7Q0FDRjtBQTFERCw4QkEwREMiLCJmaWxlIjoidGFza3MvYnVpbGQuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBCdWlsZFJlc3VsdCB9IGZyb20gXCIuLi90eXBlcy9wbHVnaW4vb3V0cHV0c1wiXG5pbXBvcnQgeyBUYXNrIH0gZnJvbSBcIi4uL3Rhc2tzL2Jhc2VcIlxuaW1wb3J0IHsgR2FyZGVuIH0gZnJvbSBcIi4uL2dhcmRlblwiXG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRUYXNrUGFyYW1zIHtcbiAgZ2FyZGVuOiBHYXJkZW5cbiAgbW9kdWxlOiBNb2R1bGVcbiAgZm9yY2U6IGJvb2xlYW5cbn1cblxuZXhwb3J0IGNsYXNzIEJ1aWxkVGFzayBleHRlbmRzIFRhc2sge1xuICB0eXBlID0gXCJidWlsZFwiXG5cbiAgcHJpdmF0ZSBtb2R1bGU6IE1vZHVsZVxuXG4gIGNvbnN0cnVjdG9yKHsgZ2FyZGVuLCBmb3JjZSwgbW9kdWxlIH06IEJ1aWxkVGFza1BhcmFtcykge1xuICAgIHN1cGVyKHsgZ2FyZGVuLCBmb3JjZSwgdmVyc2lvbjogbW9kdWxlLnZlcnNpb24gfSlcbiAgICB0aGlzLm1vZHVsZSA9IG1vZHVsZVxuICB9XG5cbiAgYXN5bmMgZ2V0RGVwZW5kZW5jaWVzKCk6IFByb21pc2U8QnVpbGRUYXNrW10+IHtcbiAgICBjb25zdCBkZXBzID0gYXdhaXQgdGhpcy5nYXJkZW4ucmVzb2x2ZU1vZHVsZURlcGVuZGVuY2llcyh0aGlzLm1vZHVsZS5idWlsZC5kZXBlbmRlbmNpZXMsIFtdKVxuICAgIHJldHVybiBCbHVlYmlyZC5tYXAoZGVwcywgYXN5bmMgKG06IE1vZHVsZSkgPT4ge1xuICAgICAgcmV0dXJuIG5ldyBCdWlsZFRhc2soe1xuICAgICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgICBtb2R1bGU6IG0sXG4gICAgICAgIGZvcmNlOiB0aGlzLmZvcmNlLFxuICAgICAgfSlcbiAgICB9KVxuICB9XG5cbiAgcHJvdGVjdGVkIGdldE5hbWUoKSB7XG4gICAgcmV0dXJuIHRoaXMubW9kdWxlLm5hbWVcbiAgfVxuXG4gIGdldERlc2NyaXB0aW9uKCkge1xuICAgIHJldHVybiBgYnVpbGRpbmcgJHt0aGlzLm1vZHVsZS5uYW1lfWBcbiAgfVxuXG4gIGFzeW5jIHByb2Nlc3MoKTogUHJvbWlzZTxCdWlsZFJlc3VsdD4ge1xuICAgIGNvbnN0IG1vZHVsZSA9IHRoaXMubW9kdWxlXG5cbiAgICBpZiAoIXRoaXMuZm9yY2UgJiYgKGF3YWl0IHRoaXMuZ2FyZGVuLmFjdGlvbnMuZ2V0QnVpbGRTdGF0dXMoeyBtb2R1bGUgfSkpLnJlYWR5KSB7XG4gICAgICAvLyB0aGlzIGlzIG5lY2Vzc2FyeSBpbiBjYXNlIG90aGVyIG1vZHVsZXMgZGVwZW5kIG9uIGZpbGVzIGZyb20gdGhpcyBvbmVcbiAgICAgIGF3YWl0IHRoaXMuZ2FyZGVuLmJ1aWxkRGlyLnN5bmNEZXBlbmRlbmN5UHJvZHVjdHModGhpcy5tb2R1bGUpXG4gICAgICByZXR1cm4geyBmcmVzaDogZmFsc2UgfVxuICAgIH1cblxuICAgIGNvbnN0IGxvZ0VudHJ5ID0gdGhpcy5nYXJkZW4ubG9nLmluZm8oe1xuICAgICAgc2VjdGlvbjogdGhpcy5tb2R1bGUubmFtZSxcbiAgICAgIG1zZzogXCJCdWlsZGluZ1wiLFxuICAgICAgc3RhdHVzOiBcImFjdGl2ZVwiLFxuICAgIH0pXG5cbiAgICBsZXQgcmVzdWx0OiBCdWlsZFJlc3VsdFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmdhcmRlbi5hY3Rpb25zLmJ1aWxkKHtcbiAgICAgICAgbW9kdWxlLFxuICAgICAgICBsb2dFbnRyeSxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBsb2dFbnRyeS5zZXRFcnJvcigpXG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG5cbiAgICBsb2dFbnRyeS5zZXRTdWNjZXNzKHsgbXNnOiBjaGFsay5ncmVlbihgRG9uZSAodG9vayAke2xvZ0VudHJ5LmdldER1cmF0aW9uKDEpfSBzZWMpYCksIGFwcGVuZDogdHJ1ZSB9KVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxufVxuIl19
