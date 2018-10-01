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
const build_1 = require("./build");
const deploy_1 = require("./deploy");
const base_1 = require("../tasks/base");
const service_1 = require("../types/service");
class TestError extends Error {
    toString() {
        return this.message;
    }
}
class TestTask extends base_1.Task {
    constructor({ garden, module, testConfig, force, forceBuild, version }) {
        super({ garden, force, version });
        this.type = "test";
        this.module = module;
        this.testConfig = testConfig;
        this.force = force;
        this.forceBuild = forceBuild;
    }
    static factory(initArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            const { garden, module, testConfig } = initArgs;
            const version = yield getTestVersion(garden, module, testConfig);
            return new TestTask(Object.assign({}, initArgs, { version }));
        });
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            const testResult = yield this.getTestResult();
            if (testResult && testResult.success) {
                return [];
            }
            const services = yield this.garden.getServices(this.testConfig.dependencies);
            const deps = [new build_1.BuildTask({
                    garden: this.garden,
                    module: this.module,
                    force: this.forceBuild,
                })];
            for (const service of services) {
                deps.push(new deploy_1.DeployTask({
                    garden: this.garden,
                    service,
                    force: false,
                    forceBuild: this.forceBuild,
                }));
            }
            return Bluebird.all(deps);
        });
    }
    getName() {
        return `${this.module.name}.${this.testConfig.name}`;
    }
    getDescription() {
        return `running ${this.testConfig.name} tests in module ${this.module.name}`;
    }
    process() {
        return __awaiter(this, void 0, void 0, function* () {
            // find out if module has already been tested
            const testResult = yield this.getTestResult();
            if (testResult && testResult.success) {
                const passedEntry = this.garden.log.info({
                    section: this.module.name,
                    msg: `${this.testConfig.name} tests`,
                });
                passedEntry.setSuccess({ msg: chalk_1.default.green("Already passed"), append: true });
                return testResult;
            }
            const entry = this.garden.log.info({
                section: this.module.name,
                msg: `Running ${this.testConfig.name} tests`,
                status: "active",
            });
            const dependencies = yield getTestDependencies(this.garden, this.testConfig);
            const runtimeContext = yield service_1.prepareRuntimeContext(this.garden, this.module, dependencies);
            let result;
            try {
                result = yield this.garden.actions.testModule({
                    interactive: false,
                    module: this.module,
                    runtimeContext,
                    silent: true,
                    testConfig: this.testConfig,
                });
            }
            catch (err) {
                entry.setError();
                throw err;
            }
            if (result.success) {
                entry.setSuccess({ msg: chalk_1.default.green(`Success`), append: true });
            }
            else {
                entry.setError({ msg: chalk_1.default.red(`Failed!`), append: true });
                throw new TestError(result.output);
            }
            return result;
        });
    }
    getTestResult() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.force) {
                return null;
            }
            return this.garden.actions.getTestResult({
                module: this.module,
                testName: this.testConfig.name,
                version: this.version,
            });
        });
    }
}
exports.TestTask = TestTask;
function getTestDependencies(garden, testConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        return garden.getServices(testConfig.dependencies);
    });
}
/**
 * Determine the version of the test run, based on the version of the module and each of its dependencies.
 */
function getTestVersion(garden, module, testConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        const moduleDeps = yield garden.resolveModuleDependencies(module.build.dependencies, testConfig.dependencies);
        return garden.resolveVersion(module.name, moduleDeps);
    });
}

//# sourceMappingURL=data:application/json;charset=utf8;base64,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QkFBeUIsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUE7UUFDN0csT0FBTyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUE7SUFDdkQsQ0FBQztDQUFBIiwiZmlsZSI6InRhc2tzL3Rlc3QuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgQmx1ZWJpcmQgZnJvbSBcImJsdWViaXJkXCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuaW1wb3J0IHsgTW9kdWxlIH0gZnJvbSBcIi4uL3R5cGVzL21vZHVsZVwiXG5pbXBvcnQgeyBUZXN0Q29uZmlnIH0gZnJvbSBcIi4uL2NvbmZpZy90ZXN0XCJcbmltcG9ydCB7IE1vZHVsZVZlcnNpb24gfSBmcm9tIFwiLi4vdmNzL2Jhc2VcIlxuaW1wb3J0IHsgQnVpbGRUYXNrIH0gZnJvbSBcIi4vYnVpbGRcIlxuaW1wb3J0IHsgRGVwbG95VGFzayB9IGZyb20gXCIuL2RlcGxveVwiXG5pbXBvcnQgeyBUZXN0UmVzdWx0IH0gZnJvbSBcIi4uL3R5cGVzL3BsdWdpbi9vdXRwdXRzXCJcbmltcG9ydCB7IFRhc2ssIFRhc2tQYXJhbXMgfSBmcm9tIFwiLi4vdGFza3MvYmFzZVwiXG5pbXBvcnQgeyBwcmVwYXJlUnVudGltZUNvbnRleHQgfSBmcm9tIFwiLi4vdHlwZXMvc2VydmljZVwiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vZ2FyZGVuXCJcblxuY2xhc3MgVGVzdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gdGhpcy5tZXNzYWdlXG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXN0VGFza1BhcmFtcyB7XG4gIGdhcmRlbjogR2FyZGVuXG4gIG1vZHVsZTogTW9kdWxlXG4gIHRlc3RDb25maWc6IFRlc3RDb25maWdcbiAgZm9yY2U6IGJvb2xlYW5cbiAgZm9yY2VCdWlsZDogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgVGVzdFRhc2sgZXh0ZW5kcyBUYXNrIHtcbiAgdHlwZSA9IFwidGVzdFwiXG5cbiAgcHJpdmF0ZSBtb2R1bGU6IE1vZHVsZVxuICBwcml2YXRlIHRlc3RDb25maWc6IFRlc3RDb25maWdcbiAgcHJpdmF0ZSBmb3JjZUJ1aWxkOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IoeyBnYXJkZW4sIG1vZHVsZSwgdGVzdENvbmZpZywgZm9yY2UsIGZvcmNlQnVpbGQsIHZlcnNpb24gfTogVGVzdFRhc2tQYXJhbXMgJiBUYXNrUGFyYW1zKSB7XG4gICAgc3VwZXIoeyBnYXJkZW4sIGZvcmNlLCB2ZXJzaW9uIH0pXG4gICAgdGhpcy5tb2R1bGUgPSBtb2R1bGVcbiAgICB0aGlzLnRlc3RDb25maWcgPSB0ZXN0Q29uZmlnXG4gICAgdGhpcy5mb3JjZSA9IGZvcmNlXG4gICAgdGhpcy5mb3JjZUJ1aWxkID0gZm9yY2VCdWlsZFxuICB9XG5cbiAgc3RhdGljIGFzeW5jIGZhY3RvcnkoaW5pdEFyZ3M6IFRlc3RUYXNrUGFyYW1zKTogUHJvbWlzZTxUZXN0VGFzaz4ge1xuICAgIGNvbnN0IHsgZ2FyZGVuLCBtb2R1bGUsIHRlc3RDb25maWcgfSA9IGluaXRBcmdzXG4gICAgY29uc3QgdmVyc2lvbiA9IGF3YWl0IGdldFRlc3RWZXJzaW9uKGdhcmRlbiwgbW9kdWxlLCB0ZXN0Q29uZmlnKVxuICAgIHJldHVybiBuZXcgVGVzdFRhc2soeyAuLi5pbml0QXJncywgdmVyc2lvbiB9KVxuICB9XG5cbiAgYXN5bmMgZ2V0RGVwZW5kZW5jaWVzKCkge1xuICAgIGNvbnN0IHRlc3RSZXN1bHQgPSBhd2FpdCB0aGlzLmdldFRlc3RSZXN1bHQoKVxuXG4gICAgaWYgKHRlc3RSZXN1bHQgJiYgdGVzdFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG5cbiAgICBjb25zdCBzZXJ2aWNlcyA9IGF3YWl0IHRoaXMuZ2FyZGVuLmdldFNlcnZpY2VzKHRoaXMudGVzdENvbmZpZy5kZXBlbmRlbmNpZXMpXG5cbiAgICBjb25zdCBkZXBzOiBUYXNrW10gPSBbbmV3IEJ1aWxkVGFzayh7XG4gICAgICBnYXJkZW46IHRoaXMuZ2FyZGVuLFxuICAgICAgbW9kdWxlOiB0aGlzLm1vZHVsZSxcbiAgICAgIGZvcmNlOiB0aGlzLmZvcmNlQnVpbGQsXG4gICAgfSldXG5cbiAgICBmb3IgKGNvbnN0IHNlcnZpY2Ugb2Ygc2VydmljZXMpIHtcbiAgICAgIGRlcHMucHVzaChuZXcgRGVwbG95VGFzayh7XG4gICAgICAgIGdhcmRlbjogdGhpcy5nYXJkZW4sXG4gICAgICAgIHNlcnZpY2UsXG4gICAgICAgIGZvcmNlOiBmYWxzZSxcbiAgICAgICAgZm9yY2VCdWlsZDogdGhpcy5mb3JjZUJ1aWxkLFxuICAgICAgfSkpXG4gICAgfVxuXG4gICAgcmV0dXJuIEJsdWViaXJkLmFsbChkZXBzKVxuICB9XG5cbiAgZ2V0TmFtZSgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5tb2R1bGUubmFtZX0uJHt0aGlzLnRlc3RDb25maWcubmFtZX1gXG4gIH1cblxuICBnZXREZXNjcmlwdGlvbigpIHtcbiAgICByZXR1cm4gYHJ1bm5pbmcgJHt0aGlzLnRlc3RDb25maWcubmFtZX0gdGVzdHMgaW4gbW9kdWxlICR7dGhpcy5tb2R1bGUubmFtZX1gXG4gIH1cblxuICBhc3luYyBwcm9jZXNzKCk6IFByb21pc2U8VGVzdFJlc3VsdD4ge1xuICAgIC8vIGZpbmQgb3V0IGlmIG1vZHVsZSBoYXMgYWxyZWFkeSBiZWVuIHRlc3RlZFxuICAgIGNvbnN0IHRlc3RSZXN1bHQgPSBhd2FpdCB0aGlzLmdldFRlc3RSZXN1bHQoKVxuXG4gICAgaWYgKHRlc3RSZXN1bHQgJiYgdGVzdFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBjb25zdCBwYXNzZWRFbnRyeSA9IHRoaXMuZ2FyZGVuLmxvZy5pbmZvKHtcbiAgICAgICAgc2VjdGlvbjogdGhpcy5tb2R1bGUubmFtZSxcbiAgICAgICAgbXNnOiBgJHt0aGlzLnRlc3RDb25maWcubmFtZX0gdGVzdHNgLFxuICAgICAgfSlcbiAgICAgIHBhc3NlZEVudHJ5LnNldFN1Y2Nlc3MoeyBtc2c6IGNoYWxrLmdyZWVuKFwiQWxyZWFkeSBwYXNzZWRcIiksIGFwcGVuZDogdHJ1ZSB9KVxuICAgICAgcmV0dXJuIHRlc3RSZXN1bHRcbiAgICB9XG5cbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuZ2FyZGVuLmxvZy5pbmZvKHtcbiAgICAgIHNlY3Rpb246IHRoaXMubW9kdWxlLm5hbWUsXG4gICAgICBtc2c6IGBSdW5uaW5nICR7dGhpcy50ZXN0Q29uZmlnLm5hbWV9IHRlc3RzYCxcbiAgICAgIHN0YXR1czogXCJhY3RpdmVcIixcbiAgICB9KVxuXG4gICAgY29uc3QgZGVwZW5kZW5jaWVzID0gYXdhaXQgZ2V0VGVzdERlcGVuZGVuY2llcyh0aGlzLmdhcmRlbiwgdGhpcy50ZXN0Q29uZmlnKVxuICAgIGNvbnN0IHJ1bnRpbWVDb250ZXh0ID0gYXdhaXQgcHJlcGFyZVJ1bnRpbWVDb250ZXh0KHRoaXMuZ2FyZGVuLCB0aGlzLm1vZHVsZSwgZGVwZW5kZW5jaWVzKVxuXG4gICAgbGV0IHJlc3VsdDogVGVzdFJlc3VsdFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBhd2FpdCB0aGlzLmdhcmRlbi5hY3Rpb25zLnRlc3RNb2R1bGUoe1xuICAgICAgICBpbnRlcmFjdGl2ZTogZmFsc2UsXG4gICAgICAgIG1vZHVsZTogdGhpcy5tb2R1bGUsXG4gICAgICAgIHJ1bnRpbWVDb250ZXh0LFxuICAgICAgICBzaWxlbnQ6IHRydWUsXG4gICAgICAgIHRlc3RDb25maWc6IHRoaXMudGVzdENvbmZpZyxcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBlbnRyeS5zZXRFcnJvcigpXG4gICAgICB0aHJvdyBlcnJcbiAgICB9XG4gICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICBlbnRyeS5zZXRTdWNjZXNzKHsgbXNnOiBjaGFsay5ncmVlbihgU3VjY2Vzc2ApLCBhcHBlbmQ6IHRydWUgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgZW50cnkuc2V0RXJyb3IoeyBtc2c6IGNoYWxrLnJlZChgRmFpbGVkIWApLCBhcHBlbmQ6IHRydWUgfSlcbiAgICAgIHRocm93IG5ldyBUZXN0RXJyb3IocmVzdWx0Lm91dHB1dClcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldFRlc3RSZXN1bHQoKSB7XG4gICAgaWYgKHRoaXMuZm9yY2UpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ2FyZGVuLmFjdGlvbnMuZ2V0VGVzdFJlc3VsdCh7XG4gICAgICBtb2R1bGU6IHRoaXMubW9kdWxlLFxuICAgICAgdGVzdE5hbWU6IHRoaXMudGVzdENvbmZpZy5uYW1lLFxuICAgICAgdmVyc2lvbjogdGhpcy52ZXJzaW9uLFxuICAgIH0pXG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0VGVzdERlcGVuZGVuY2llcyhnYXJkZW46IEdhcmRlbiwgdGVzdENvbmZpZzogVGVzdENvbmZpZykge1xuICByZXR1cm4gZ2FyZGVuLmdldFNlcnZpY2VzKHRlc3RDb25maWcuZGVwZW5kZW5jaWVzKVxufVxuXG4vKipcbiAqIERldGVybWluZSB0aGUgdmVyc2lvbiBvZiB0aGUgdGVzdCBydW4sIGJhc2VkIG9uIHRoZSB2ZXJzaW9uIG9mIHRoZSBtb2R1bGUgYW5kIGVhY2ggb2YgaXRzIGRlcGVuZGVuY2llcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0VGVzdFZlcnNpb24oZ2FyZGVuOiBHYXJkZW4sIG1vZHVsZTogTW9kdWxlLCB0ZXN0Q29uZmlnOiBUZXN0Q29uZmlnKTogUHJvbWlzZTxNb2R1bGVWZXJzaW9uPiB7XG4gIGNvbnN0IG1vZHVsZURlcHMgPSBhd2FpdCBnYXJkZW4ucmVzb2x2ZU1vZHVsZURlcGVuZGVuY2llcyhtb2R1bGUuYnVpbGQuZGVwZW5kZW5jaWVzLCB0ZXN0Q29uZmlnLmRlcGVuZGVuY2llcylcbiAgcmV0dXJuIGdhcmRlbi5yZXNvbHZlVmVyc2lvbihtb2R1bGUubmFtZSwgbW9kdWxlRGVwcylcbn1cbiJdfQ==
