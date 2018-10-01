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
class PublishTask extends base_1.Task {
    constructor({ garden, module, forceBuild }) {
        super({ garden, version: module.version });
        this.type = "publish";
        this.module = module;
        this.forceBuild = forceBuild;
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.module.allowPublish) {
                return [];
            }
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
        return `publishing module ${this.module.name}`;
    }
    process() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.module.allowPublish) {
                this.garden.log.info({
                    section: this.module.name,
                    msg: "Publishing disabled",
                    status: "active",
                });
                return { published: false };
            }
            const logEntry = this.garden.log.info({
                section: this.module.name,
                msg: "Publishing",
                status: "active",
            });
            let result;
            try {
                result = yield this.garden.actions.publishModule({ module: this.module, logEntry });
            }
            catch (err) {
                logEntry.setError();
                throw err;
            }
            if (result.published) {
                logEntry.setSuccess({ msg: chalk_1.default.green(result.message || `Ready`), append: true });
            }
            else {
                logEntry.setWarn({ msg: result.message, append: true });
            }
            return result;
        });
    }
}
exports.PublishTask = PublishTask;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRhc2tzL3B1Ymxpc2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILGlDQUF5QjtBQUN6QixtQ0FBbUM7QUFHbkMsd0NBQW9DO0FBU3BDLE1BQWEsV0FBWSxTQUFRLFdBQUk7SUFNbkMsWUFBWSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFxQjtRQUMzRCxLQUFLLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFBO1FBTjVDLFNBQUksR0FBRyxTQUFTLENBQUE7UUFPZCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtRQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQTtJQUM5QixDQUFDO0lBRUssZUFBZTs7WUFDbkIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFO2dCQUM3QixPQUFPLEVBQUUsQ0FBQTthQUNWO1lBQ0QsT0FBTyxDQUFDLElBQUksaUJBQVMsQ0FBQztvQkFDcEIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO29CQUNuQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07b0JBQ25CLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVTtpQkFDdkIsQ0FBQyxDQUFDLENBQUE7UUFDTCxDQUFDO0tBQUE7SUFFRCxPQUFPO1FBQ0wsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQTtJQUN6QixDQUFDO0lBRUQsY0FBYztRQUNaLE9BQU8scUJBQXFCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUE7SUFDaEQsQ0FBQztJQUVLLE9BQU87O1lBQ1gsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFO2dCQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7b0JBQ25CLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUk7b0JBQ3pCLEdBQUcsRUFBRSxxQkFBcUI7b0JBQzFCLE1BQU0sRUFBRSxRQUFRO2lCQUNqQixDQUFDLENBQUE7Z0JBQ0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQTthQUM1QjtZQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztnQkFDcEMsT0FBTyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSTtnQkFDekIsR0FBRyxFQUFFLFlBQVk7Z0JBQ2pCLE1BQU0sRUFBRSxRQUFRO2FBQ2pCLENBQUMsQ0FBQTtZQUVGLElBQUksTUFBcUIsQ0FBQTtZQUN6QixJQUFJO2dCQUNGLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUE7YUFDcEY7WUFBQyxPQUFPLEdBQUcsRUFBRTtnQkFDWixRQUFRLENBQUMsUUFBUSxFQUFFLENBQUE7Z0JBQ25CLE1BQU0sR0FBRyxDQUFBO2FBQ1Y7WUFFRCxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUU7Z0JBQ3BCLFFBQVEsQ0FBQyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsZUFBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO2FBQ25GO2lCQUFNO2dCQUNMLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxHQUFHLEVBQUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTthQUN4RDtZQUVELE9BQU8sTUFBTSxDQUFBO1FBQ2YsQ0FBQztLQUFBO0NBQ0Y7QUEvREQsa0NBK0RDIiwiZmlsZSI6InRhc2tzL3B1Ymxpc2guanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5pbXBvcnQgeyBCdWlsZFRhc2sgfSBmcm9tIFwiLi9idWlsZFwiXG5pbXBvcnQgeyBNb2R1bGUgfSBmcm9tIFwiLi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7IFB1Ymxpc2hSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IHsgVGFzayB9IGZyb20gXCIuLi90YXNrcy9iYXNlXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuXG5leHBvcnQgaW50ZXJmYWNlIFB1Ymxpc2hUYXNrUGFyYW1zIHtcbiAgZ2FyZGVuOiBHYXJkZW5cbiAgbW9kdWxlOiBNb2R1bGVcbiAgZm9yY2VCdWlsZDogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgUHVibGlzaFRhc2sgZXh0ZW5kcyBUYXNrIHtcbiAgdHlwZSA9IFwicHVibGlzaFwiXG5cbiAgcHJpdmF0ZSBtb2R1bGU6IE1vZHVsZVxuICBwcml2YXRlIGZvcmNlQnVpbGQ6IGJvb2xlYW5cblxuICBjb25zdHJ1Y3Rvcih7IGdhcmRlbiwgbW9kdWxlLCBmb3JjZUJ1aWxkIH06IFB1Ymxpc2hUYXNrUGFyYW1zKSB7XG4gICAgc3VwZXIoeyBnYXJkZW4sIHZlcnNpb246IG1vZHVsZS52ZXJzaW9uIH0pXG4gICAgdGhpcy5tb2R1bGUgPSBtb2R1bGVcbiAgICB0aGlzLmZvcmNlQnVpbGQgPSBmb3JjZUJ1aWxkXG4gIH1cblxuICBhc3luYyBnZXREZXBlbmRlbmNpZXMoKSB7XG4gICAgaWYgKCF0aGlzLm1vZHVsZS5hbGxvd1B1Ymxpc2gpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgICByZXR1cm4gW25ldyBCdWlsZFRhc2soe1xuICAgICAgZ2FyZGVuOiB0aGlzLmdhcmRlbixcbiAgICAgIG1vZHVsZTogdGhpcy5tb2R1bGUsXG4gICAgICBmb3JjZTogdGhpcy5mb3JjZUJ1aWxkLFxuICAgIH0pXVxuICB9XG5cbiAgZ2V0TmFtZSgpIHtcbiAgICByZXR1cm4gdGhpcy5tb2R1bGUubmFtZVxuICB9XG5cbiAgZ2V0RGVzY3JpcHRpb24oKSB7XG4gICAgcmV0dXJuIGBwdWJsaXNoaW5nIG1vZHVsZSAke3RoaXMubW9kdWxlLm5hbWV9YFxuICB9XG5cbiAgYXN5bmMgcHJvY2VzcygpOiBQcm9taXNlPFB1Ymxpc2hSZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMubW9kdWxlLmFsbG93UHVibGlzaCkge1xuICAgICAgdGhpcy5nYXJkZW4ubG9nLmluZm8oe1xuICAgICAgICBzZWN0aW9uOiB0aGlzLm1vZHVsZS5uYW1lLFxuICAgICAgICBtc2c6IFwiUHVibGlzaGluZyBkaXNhYmxlZFwiLFxuICAgICAgICBzdGF0dXM6IFwiYWN0aXZlXCIsXG4gICAgICB9KVxuICAgICAgcmV0dXJuIHsgcHVibGlzaGVkOiBmYWxzZSB9XG4gICAgfVxuXG4gICAgY29uc3QgbG9nRW50cnkgPSB0aGlzLmdhcmRlbi5sb2cuaW5mbyh7XG4gICAgICBzZWN0aW9uOiB0aGlzLm1vZHVsZS5uYW1lLFxuICAgICAgbXNnOiBcIlB1Ymxpc2hpbmdcIixcbiAgICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgICB9KVxuXG4gICAgbGV0IHJlc3VsdDogUHVibGlzaFJlc3VsdFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmdhcmRlbi5hY3Rpb25zLnB1Ymxpc2hNb2R1bGUoeyBtb2R1bGU6IHRoaXMubW9kdWxlLCBsb2dFbnRyeSB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbG9nRW50cnkuc2V0RXJyb3IoKVxuICAgICAgdGhyb3cgZXJyXG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5wdWJsaXNoZWQpIHtcbiAgICAgIGxvZ0VudHJ5LnNldFN1Y2Nlc3MoeyBtc2c6IGNoYWxrLmdyZWVuKHJlc3VsdC5tZXNzYWdlIHx8IGBSZWFkeWApLCBhcHBlbmQ6IHRydWUgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nRW50cnkuc2V0V2Fybih7IG1zZzogcmVzdWx0Lm1lc3NhZ2UsIGFwcGVuZDogdHJ1ZSB9KVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxufVxuIl19
