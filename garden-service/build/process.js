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
const watch_1 = require("./watch");
const util_1 = require("./util/util");
const ext_source_util_1 = require("./util/ext-source-util");
function processServices({ garden, services, watch, handler, changeHandler }) {
    return __awaiter(this, void 0, void 0, function* () {
        const modules = Array.from(new Set(services.map(s => s.module)));
        return processModules({
            modules,
            garden,
            watch,
            handler,
            changeHandler,
        });
    });
}
exports.processServices = processServices;
function processModules({ garden, modules, watch, handler, changeHandler }) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const module of modules) {
            const tasks = yield handler(module);
            if (ext_source_util_1.isModuleLinked(module, garden)) {
                garden.log.info(chalk_1.default.gray(`Reading module ${chalk_1.default.cyan(module.name)} from linked local path ${chalk_1.default.white(module.path)}`));
            }
            yield Bluebird.map(tasks, t => garden.addTask(t));
        }
        const results = yield garden.processTasks();
        if (!watch) {
            return {
                taskResults: results,
                restartRequired: false,
            };
        }
        if (!changeHandler) {
            changeHandler = handler;
        }
        const watcher = new watch_1.FSWatcher(garden);
        const restartPromise = new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            yield watcher.watchModules(modules, (changedModule, configChanged) => __awaiter(this, void 0, void 0, function* () {
                if (configChanged) {
                    garden.log.debug({ msg: `Config changed, reloading.` });
                    resolve();
                    return;
                }
                if (changedModule) {
                    garden.log.debug({ msg: `Files changed for module ${changedModule.name}` });
                    yield Bluebird.map(changeHandler(changedModule), (task) => garden.addTask(task));
                }
                yield garden.processTasks();
            }));
            util_1.registerCleanupFunction("clearAutoReloadWatches", () => {
                watcher.close();
            });
        }));
        yield restartPromise;
        watcher.close();
        return {
            taskResults: {},
            restartRequired: true,
        };
    });
}
exports.processModules = processModules;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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OEJBQXVCLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO2dCQUNyRCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUE7WUFDakIsQ0FBQyxDQUFDLENBQUE7UUFDSixDQUFDLENBQUEsQ0FBQyxDQUFBO1FBRUYsTUFBTSxjQUFjLENBQUE7UUFDcEIsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFBO1FBRWYsT0FBTztZQUNMLFdBQVcsRUFBRSxFQUFFO1lBQ2YsZUFBZSxFQUFFLElBQUk7U0FDdEIsQ0FBQTtJQUVILENBQUM7Q0FBQTtBQTNERCx3Q0EyREMiLCJmaWxlIjoicHJvY2Vzcy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgQmx1ZWJpcmQgPSByZXF1aXJlKFwiYmx1ZWJpcmRcIilcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4vdHlwZXMvbW9kdWxlXCJcbmltcG9ydCB7IFNlcnZpY2UgfSBmcm9tIFwiLi90eXBlcy9zZXJ2aWNlXCJcbmltcG9ydCB7IFRhc2sgfSBmcm9tIFwiLi90YXNrcy9iYXNlXCJcbmltcG9ydCB7IFRhc2tSZXN1bHRzIH0gZnJvbSBcIi4vdGFzay1ncmFwaFwiXG5pbXBvcnQgeyBGU1dhdGNoZXIgfSBmcm9tIFwiLi93YXRjaFwiXG5pbXBvcnQgeyByZWdpc3RlckNsZWFudXBGdW5jdGlvbiB9IGZyb20gXCIuL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBpc01vZHVsZUxpbmtlZCB9IGZyb20gXCIuL3V0aWwvZXh0LXNvdXJjZS11dGlsXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuL2dhcmRlblwiXG5cbmV4cG9ydCB0eXBlIFByb2Nlc3NIYW5kbGVyID0gKG1vZHVsZTogTW9kdWxlKSA9PiBQcm9taXNlPFRhc2tbXT5cblxuaW50ZXJmYWNlIFByb2Nlc3NQYXJhbXMge1xuICBnYXJkZW46IEdhcmRlbixcbiAgd2F0Y2g6IGJvb2xlYW5cbiAgaGFuZGxlcjogUHJvY2Vzc0hhbmRsZXJcbiAgLy8gdXNlIHRoaXMgaWYgdGhlIGJlaGF2aW9yIHNob3VsZCBiZSBkaWZmZXJlbnQgb24gd2F0Y2hlciBjaGFuZ2VzIHRoYW4gb24gaW5pdGlhbCBwcm9jZXNzaW5nXG4gIGNoYW5nZUhhbmRsZXI/OiBQcm9jZXNzSGFuZGxlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2Nlc3NNb2R1bGVzUGFyYW1zIGV4dGVuZHMgUHJvY2Vzc1BhcmFtcyB7XG4gIG1vZHVsZXM6IE1vZHVsZVtdXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvY2Vzc1NlcnZpY2VzUGFyYW1zIGV4dGVuZHMgUHJvY2Vzc1BhcmFtcyB7XG4gIHNlcnZpY2VzOiBTZXJ2aWNlW11cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9jZXNzUmVzdWx0cyB7XG4gIHRhc2tSZXN1bHRzOiBUYXNrUmVzdWx0c1xuICByZXN0YXJ0UmVxdWlyZWQ/OiBib29sZWFuXG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzU2VydmljZXMoXG4gIHsgZ2FyZGVuLCBzZXJ2aWNlcywgd2F0Y2gsIGhhbmRsZXIsIGNoYW5nZUhhbmRsZXIgfTogUHJvY2Vzc1NlcnZpY2VzUGFyYW1zLFxuKTogUHJvbWlzZTxQcm9jZXNzUmVzdWx0cz4ge1xuXG4gIGNvbnN0IG1vZHVsZXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoc2VydmljZXMubWFwKHMgPT4gcy5tb2R1bGUpKSlcblxuICByZXR1cm4gcHJvY2Vzc01vZHVsZXMoe1xuICAgIG1vZHVsZXMsXG4gICAgZ2FyZGVuLFxuICAgIHdhdGNoLFxuICAgIGhhbmRsZXIsXG4gICAgY2hhbmdlSGFuZGxlcixcbiAgfSlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NNb2R1bGVzKFxuICB7IGdhcmRlbiwgbW9kdWxlcywgd2F0Y2gsIGhhbmRsZXIsIGNoYW5nZUhhbmRsZXIgfTogUHJvY2Vzc01vZHVsZXNQYXJhbXMsXG4pOiBQcm9taXNlPFByb2Nlc3NSZXN1bHRzPiB7XG4gIGZvciAoY29uc3QgbW9kdWxlIG9mIG1vZHVsZXMpIHtcbiAgICBjb25zdCB0YXNrcyA9IGF3YWl0IGhhbmRsZXIobW9kdWxlKVxuICAgIGlmIChpc01vZHVsZUxpbmtlZChtb2R1bGUsIGdhcmRlbikpIHtcbiAgICAgIGdhcmRlbi5sb2cuaW5mbyhcbiAgICAgICAgY2hhbGsuZ3JheShgUmVhZGluZyBtb2R1bGUgJHtjaGFsay5jeWFuKG1vZHVsZS5uYW1lKX0gZnJvbSBsaW5rZWQgbG9jYWwgcGF0aCAke2NoYWxrLndoaXRlKG1vZHVsZS5wYXRoKX1gKSxcbiAgICAgIClcbiAgICB9XG4gICAgYXdhaXQgQmx1ZWJpcmQubWFwKHRhc2tzLCB0ID0+IGdhcmRlbi5hZGRUYXNrKHQpKVxuICB9XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IGdhcmRlbi5wcm9jZXNzVGFza3MoKVxuXG4gIGlmICghd2F0Y2gpIHtcbiAgICByZXR1cm4ge1xuICAgICAgdGFza1Jlc3VsdHM6IHJlc3VsdHMsXG4gICAgICByZXN0YXJ0UmVxdWlyZWQ6IGZhbHNlLFxuICAgIH1cbiAgfVxuXG4gIGlmICghY2hhbmdlSGFuZGxlcikge1xuICAgIGNoYW5nZUhhbmRsZXIgPSBoYW5kbGVyXG4gIH1cblxuICBjb25zdCB3YXRjaGVyID0gbmV3IEZTV2F0Y2hlcihnYXJkZW4pXG5cbiAgY29uc3QgcmVzdGFydFByb21pc2UgPSBuZXcgUHJvbWlzZShhc3luYyAocmVzb2x2ZSkgPT4ge1xuICAgIGF3YWl0IHdhdGNoZXIud2F0Y2hNb2R1bGVzKG1vZHVsZXMsXG4gICAgICBhc3luYyAoY2hhbmdlZE1vZHVsZTogTW9kdWxlIHwgbnVsbCwgY29uZmlnQ2hhbmdlZDogYm9vbGVhbikgPT4ge1xuICAgICAgICBpZiAoY29uZmlnQ2hhbmdlZCkge1xuICAgICAgICAgIGdhcmRlbi5sb2cuZGVidWcoeyBtc2c6IGBDb25maWcgY2hhbmdlZCwgcmVsb2FkaW5nLmAgfSlcbiAgICAgICAgICByZXNvbHZlKClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGFuZ2VkTW9kdWxlKSB7XG4gICAgICAgICAgZ2FyZGVuLmxvZy5kZWJ1Zyh7IG1zZzogYEZpbGVzIGNoYW5nZWQgZm9yIG1vZHVsZSAke2NoYW5nZWRNb2R1bGUubmFtZX1gIH0pXG5cbiAgICAgICAgICBhd2FpdCBCbHVlYmlyZC5tYXAoY2hhbmdlSGFuZGxlciEoY2hhbmdlZE1vZHVsZSksICh0YXNrKSA9PiBnYXJkZW4uYWRkVGFzayh0YXNrKSlcbiAgICAgICAgfVxuXG4gICAgICAgIGF3YWl0IGdhcmRlbi5wcm9jZXNzVGFza3MoKVxuICAgICAgfSlcblxuICAgIHJlZ2lzdGVyQ2xlYW51cEZ1bmN0aW9uKFwiY2xlYXJBdXRvUmVsb2FkV2F0Y2hlc1wiLCAoKSA9PiB7XG4gICAgICB3YXRjaGVyLmNsb3NlKClcbiAgICB9KVxuICB9KVxuXG4gIGF3YWl0IHJlc3RhcnRQcm9taXNlXG4gIHdhdGNoZXIuY2xvc2UoKVxuXG4gIHJldHVybiB7XG4gICAgdGFza1Jlc3VsdHM6IHt9LCAvLyBUT0RPOiBSZXR1cm4gbGF0ZXN0IHJlc3VsdHMgZm9yIGVhY2ggdGFzayBiYXNlS2V5IHByb2Nlc3NlZCBiZXR3ZWVuIHJlc3RhcnRzP1xuICAgIHJlc3RhcnRSZXF1aXJlZDogdHJ1ZSxcbiAgfVxuXG59XG4iXX0=
