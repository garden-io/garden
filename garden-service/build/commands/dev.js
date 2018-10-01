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
const lodash_1 = require("lodash");
const moment = require("moment");
const path_1 = require("path");
const build_1 = require("../tasks/build");
const base_1 = require("./base");
const constants_1 = require("../constants");
const process_1 = require("../process");
const fs_extra_1 = require("fs-extra");
const test_1 = require("./test");
const watch_1 = require("../watch");
const deploy_1 = require("../tasks/deploy");
const ansiBannerPath = path_1.join(constants_1.STATIC_DIR, "garden-banner-2.txt");
// TODO: allow limiting to certain modules and/or services
class DevCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "dev";
        this.help = "Starts the garden development console.";
        this.description = `
    The Garden dev console is a combination of the \`build\`, \`deploy\` and \`test\` commands.
    It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
  `;
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            // print ANSI banner image
            const data = yield fs_extra_1.readFile(ansiBannerPath);
            console.log(data.toString());
            garden.log.info(chalk_1.default.gray.italic(`\nGood ${getGreetingTime()}! Let's get your environment wired up...\n`));
            yield garden.actions.prepareEnvironment({});
            const autoReloadDependants = yield watch_1.computeAutoReloadDependants(garden);
            const modules = yield garden.getModules();
            if (modules.length === 0) {
                if (modules.length === 0) {
                    garden.log.info({ msg: "No modules found in project." });
                }
                garden.log.info({ msg: "Aborting..." });
                return {};
            }
            const tasksForModule = (watch) => {
                return (module) => __awaiter(this, void 0, void 0, function* () {
                    const testModules = watch
                        ? (yield watch_1.withDependants(garden, [module], autoReloadDependants))
                        : [module];
                    const testTasks = lodash_1.flatten(yield Bluebird.map(testModules, m => test_1.getTestTasks({ garden, module: m })));
                    const deployTasks = yield deploy_1.getDeployTasks({
                        garden, module, force: watch, forceBuild: watch, includeDependants: watch,
                    });
                    const tasks = testTasks.concat(deployTasks);
                    if (tasks.length === 0) {
                        return [new build_1.BuildTask({ garden, module, force: watch })];
                    }
                    else {
                        return tasks;
                    }
                });
            };
            yield process_1.processModules({
                garden,
                modules,
                watch: true,
                handler: tasksForModule(false),
                changeHandler: tasksForModule(true),
            });
            return {};
        });
    }
}
exports.DevCommand = DevCommand;
function getGreetingTime() {
    const m = moment();
    const currentHour = parseFloat(m.format("HH"));
    if (currentHour >= 17) {
        return "evening";
    }
    else if (currentHour >= 12) {
        return "afternoon";
    }
    else {
        return "morning";
    }
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2Rldi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgscUNBQW9DO0FBQ3BDLGlDQUF5QjtBQUN6QixtQ0FBZ0M7QUFDaEMsaUNBQWlDO0FBQ2pDLCtCQUEyQjtBQUUzQiwwQ0FBMEM7QUFFMUMsaUNBSWU7QUFDZiw0Q0FBeUM7QUFDekMsd0NBQTJDO0FBQzNDLHVDQUFtQztBQUVuQyxpQ0FBcUM7QUFDckMsb0NBQXNFO0FBQ3RFLDRDQUFnRDtBQUVoRCxNQUFNLGNBQWMsR0FBRyxXQUFJLENBQUMsc0JBQVUsRUFBRSxxQkFBcUIsQ0FBQyxDQUFBO0FBRTlELDBEQUEwRDtBQUMxRCxNQUFhLFVBQVcsU0FBUSxjQUFPO0lBQXZDOztRQUNFLFNBQUksR0FBRyxLQUFLLENBQUE7UUFDWixTQUFJLEdBQUcsd0NBQXdDLENBQUE7UUFFL0MsZ0JBQVcsR0FBRzs7Ozs7Ozs7R0FRYixDQUFBO0lBd0RILENBQUM7SUF0RE8sTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFpQjs7WUFDcEMsMEJBQTBCO1lBQzFCLE1BQU0sSUFBSSxHQUFHLE1BQU0sbUJBQVEsQ0FBQyxjQUFjLENBQUMsQ0FBQTtZQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBO1lBRTVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsZUFBZSxFQUFFLDRDQUE0QyxDQUFDLENBQUMsQ0FBQTtZQUUzRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUE7WUFFM0MsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLG1DQUEyQixDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3RFLE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFBO1lBRXpDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQ3hCLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7b0JBQ3hCLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLDhCQUE4QixFQUFFLENBQUMsQ0FBQTtpQkFDekQ7Z0JBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQTtnQkFDdkMsT0FBTyxFQUFFLENBQUE7YUFDVjtZQUVELE1BQU0sY0FBYyxHQUFHLENBQUMsS0FBYyxFQUFFLEVBQUU7Z0JBQ3hDLE9BQU8sQ0FBTyxNQUFjLEVBQUUsRUFBRTtvQkFFOUIsTUFBTSxXQUFXLEdBQWEsS0FBSzt3QkFDakMsQ0FBQyxDQUFDLENBQUMsTUFBTSxzQkFBYyxDQUFDLE1BQU0sRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7d0JBQ2hFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFBO29CQUVaLE1BQU0sU0FBUyxHQUFXLGdCQUFPLENBQUMsTUFBTSxRQUFRLENBQUMsR0FBRyxDQUNsRCxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxtQkFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQTtvQkFFekQsTUFBTSxXQUFXLEdBQUcsTUFBTSx1QkFBYyxDQUFDO3dCQUN2QyxNQUFNLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxpQkFBaUIsRUFBRSxLQUFLO3FCQUMxRSxDQUFDLENBQUE7b0JBQ0YsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQTtvQkFFM0MsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTt3QkFDdEIsT0FBTyxDQUFDLElBQUksaUJBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQTtxQkFDekQ7eUJBQU07d0JBQ0wsT0FBTyxLQUFLLENBQUE7cUJBQ2I7Z0JBQ0gsQ0FBQyxDQUFBLENBQUE7WUFFSCxDQUFDLENBQUE7WUFFRCxNQUFNLHdCQUFjLENBQUM7Z0JBQ25CLE1BQU07Z0JBQ04sT0FBTztnQkFDUCxLQUFLLEVBQUUsSUFBSTtnQkFDWCxPQUFPLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQztnQkFDOUIsYUFBYSxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUM7YUFDcEMsQ0FBQyxDQUFBO1lBRUYsT0FBTyxFQUFFLENBQUE7UUFDWCxDQUFDO0tBQUE7Q0FDRjtBQXBFRCxnQ0FvRUM7QUFFRCxTQUFTLGVBQWU7SUFDdEIsTUFBTSxDQUFDLEdBQUcsTUFBTSxFQUFFLENBQUE7SUFFbEIsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtJQUU5QyxJQUFJLFdBQVcsSUFBSSxFQUFFLEVBQUU7UUFDckIsT0FBTyxTQUFTLENBQUE7S0FDakI7U0FBTSxJQUFJLFdBQVcsSUFBSSxFQUFFLEVBQUU7UUFDNUIsT0FBTyxXQUFXLENBQUE7S0FDbkI7U0FBTTtRQUNMLE9BQU8sU0FBUyxDQUFBO0tBQ2pCO0FBQ0gsQ0FBQyIsImZpbGUiOiJjb21tYW5kcy9kZXYuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgZmxhdHRlbiB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IG1vbWVudCA9IHJlcXVpcmUoXCJtb21lbnRcIilcbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5cbmltcG9ydCB7IEJ1aWxkVGFzayB9IGZyb20gXCIuLi90YXNrcy9idWlsZFwiXG5pbXBvcnQgeyBUYXNrIH0gZnJvbSBcIi4uL3Rhc2tzL2Jhc2VcIlxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgQ29tbWFuZFBhcmFtcyxcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgeyBTVEFUSUNfRElSIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBwcm9jZXNzTW9kdWxlcyB9IGZyb20gXCIuLi9wcm9jZXNzXCJcbmltcG9ydCB7IHJlYWRGaWxlIH0gZnJvbSBcImZzLWV4dHJhXCJcbmltcG9ydCB7IE1vZHVsZSB9IGZyb20gXCIuLi90eXBlcy9tb2R1bGVcIlxuaW1wb3J0IHsgZ2V0VGVzdFRhc2tzIH0gZnJvbSBcIi4vdGVzdFwiXG5pbXBvcnQgeyBjb21wdXRlQXV0b1JlbG9hZERlcGVuZGFudHMsIHdpdGhEZXBlbmRhbnRzIH0gZnJvbSBcIi4uL3dhdGNoXCJcbmltcG9ydCB7IGdldERlcGxveVRhc2tzIH0gZnJvbSBcIi4uL3Rhc2tzL2RlcGxveVwiXG5cbmNvbnN0IGFuc2lCYW5uZXJQYXRoID0gam9pbihTVEFUSUNfRElSLCBcImdhcmRlbi1iYW5uZXItMi50eHRcIilcblxuLy8gVE9ETzogYWxsb3cgbGltaXRpbmcgdG8gY2VydGFpbiBtb2R1bGVzIGFuZC9vciBzZXJ2aWNlc1xuZXhwb3J0IGNsYXNzIERldkNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwiZGV2XCJcbiAgaGVscCA9IFwiU3RhcnRzIHRoZSBnYXJkZW4gZGV2ZWxvcG1lbnQgY29uc29sZS5cIlxuXG4gIGRlc2NyaXB0aW9uID0gYFxuICAgIFRoZSBHYXJkZW4gZGV2IGNvbnNvbGUgaXMgYSBjb21iaW5hdGlvbiBvZiB0aGUgXFxgYnVpbGRcXGAsIFxcYGRlcGxveVxcYCBhbmQgXFxgdGVzdFxcYCBjb21tYW5kcy5cbiAgICBJdCBidWlsZHMsIGRlcGxveXMgYW5kIHRlc3RzIGFsbCB5b3VyIG1vZHVsZXMgYW5kIHNlcnZpY2VzLCBhbmQgcmUtYnVpbGRzLCByZS1kZXBsb3lzIGFuZCByZS10ZXN0c1xuICAgIGFzIHlvdSBtb2RpZnkgdGhlIGNvZGUuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gZGV2XG4gIGBcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4gfTogQ29tbWFuZFBhcmFtcyk6IFByb21pc2U8Q29tbWFuZFJlc3VsdD4ge1xuICAgIC8vIHByaW50IEFOU0kgYmFubmVyIGltYWdlXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlYWRGaWxlKGFuc2lCYW5uZXJQYXRoKVxuICAgIGNvbnNvbGUubG9nKGRhdGEudG9TdHJpbmcoKSlcblxuICAgIGdhcmRlbi5sb2cuaW5mbyhjaGFsay5ncmF5Lml0YWxpYyhgXFxuR29vZCAke2dldEdyZWV0aW5nVGltZSgpfSEgTGV0J3MgZ2V0IHlvdXIgZW52aXJvbm1lbnQgd2lyZWQgdXAuLi5cXG5gKSlcblxuICAgIGF3YWl0IGdhcmRlbi5hY3Rpb25zLnByZXBhcmVFbnZpcm9ubWVudCh7fSlcblxuICAgIGNvbnN0IGF1dG9SZWxvYWREZXBlbmRhbnRzID0gYXdhaXQgY29tcHV0ZUF1dG9SZWxvYWREZXBlbmRhbnRzKGdhcmRlbilcbiAgICBjb25zdCBtb2R1bGVzID0gYXdhaXQgZ2FyZGVuLmdldE1vZHVsZXMoKVxuXG4gICAgaWYgKG1vZHVsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBpZiAobW9kdWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgZ2FyZGVuLmxvZy5pbmZvKHsgbXNnOiBcIk5vIG1vZHVsZXMgZm91bmQgaW4gcHJvamVjdC5cIiB9KVxuICAgICAgfVxuICAgICAgZ2FyZGVuLmxvZy5pbmZvKHsgbXNnOiBcIkFib3J0aW5nLi4uXCIgfSlcbiAgICAgIHJldHVybiB7fVxuICAgIH1cblxuICAgIGNvbnN0IHRhc2tzRm9yTW9kdWxlID0gKHdhdGNoOiBib29sZWFuKSA9PiB7XG4gICAgICByZXR1cm4gYXN5bmMgKG1vZHVsZTogTW9kdWxlKSA9PiB7XG5cbiAgICAgICAgY29uc3QgdGVzdE1vZHVsZXM6IE1vZHVsZVtdID0gd2F0Y2hcbiAgICAgICAgICA/IChhd2FpdCB3aXRoRGVwZW5kYW50cyhnYXJkZW4sIFttb2R1bGVdLCBhdXRvUmVsb2FkRGVwZW5kYW50cykpXG4gICAgICAgICAgOiBbbW9kdWxlXVxuXG4gICAgICAgIGNvbnN0IHRlc3RUYXNrczogVGFza1tdID0gZmxhdHRlbihhd2FpdCBCbHVlYmlyZC5tYXAoXG4gICAgICAgICAgdGVzdE1vZHVsZXMsIG0gPT4gZ2V0VGVzdFRhc2tzKHsgZ2FyZGVuLCBtb2R1bGU6IG0gfSkpKVxuXG4gICAgICAgIGNvbnN0IGRlcGxveVRhc2tzID0gYXdhaXQgZ2V0RGVwbG95VGFza3Moe1xuICAgICAgICAgIGdhcmRlbiwgbW9kdWxlLCBmb3JjZTogd2F0Y2gsIGZvcmNlQnVpbGQ6IHdhdGNoLCBpbmNsdWRlRGVwZW5kYW50czogd2F0Y2gsXG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IHRhc2tzID0gdGVzdFRhc2tzLmNvbmNhdChkZXBsb3lUYXNrcylcblxuICAgICAgICBpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIFtuZXcgQnVpbGRUYXNrKHsgZ2FyZGVuLCBtb2R1bGUsIGZvcmNlOiB3YXRjaCB9KV1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gdGFza3NcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgfVxuXG4gICAgYXdhaXQgcHJvY2Vzc01vZHVsZXMoe1xuICAgICAgZ2FyZGVuLFxuICAgICAgbW9kdWxlcyxcbiAgICAgIHdhdGNoOiB0cnVlLFxuICAgICAgaGFuZGxlcjogdGFza3NGb3JNb2R1bGUoZmFsc2UpLFxuICAgICAgY2hhbmdlSGFuZGxlcjogdGFza3NGb3JNb2R1bGUodHJ1ZSksXG4gICAgfSlcblxuICAgIHJldHVybiB7fVxuICB9XG59XG5cbmZ1bmN0aW9uIGdldEdyZWV0aW5nVGltZSgpIHtcbiAgY29uc3QgbSA9IG1vbWVudCgpXG5cbiAgY29uc3QgY3VycmVudEhvdXIgPSBwYXJzZUZsb2F0KG0uZm9ybWF0KFwiSEhcIikpXG5cbiAgaWYgKGN1cnJlbnRIb3VyID49IDE3KSB7XG4gICAgcmV0dXJuIFwiZXZlbmluZ1wiXG4gIH0gZWxzZSBpZiAoY3VycmVudEhvdXIgPj0gMTIpIHtcbiAgICByZXR1cm4gXCJhZnRlcm5vb25cIlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBcIm1vcm5pbmdcIlxuICB9XG59XG4iXX0=
