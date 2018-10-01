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
const Joi = require("joi");
const yaml = require("js-yaml");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const lodash_1 = require("lodash");
const common_1 = require("./config/common");
const exceptions_1 = require("./exceptions");
const util_1 = require("./util/util");
const constants_1 = require("./constants");
class ConfigStore {
    constructor(projectPath) {
        this.configPath = this.getConfigPath(projectPath);
        this.config = null;
    }
    set(...args) {
        return __awaiter(this, void 0, void 0, function* () {
            let config = yield this.getConfig();
            let entries;
            if (args.length === 1) {
                entries = args[0];
            }
            else {
                entries = [{ keyPath: args[0], value: args[1] }];
            }
            for (const { keyPath, value } of entries) {
                config = this.updateConfig(config, keyPath, value);
            }
            yield this.saveConfig(config);
        });
    }
    get(keyPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.getConfig();
            if (keyPath) {
                const value = lodash_1.get(config, keyPath);
                if (value === undefined) {
                    this.throwKeyNotFound(config, keyPath);
                }
                return value;
            }
            return config;
        });
    }
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveConfig({});
        });
    }
    delete(keyPath) {
        return __awaiter(this, void 0, void 0, function* () {
            let config = yield this.getConfig();
            if (lodash_1.get(config, keyPath) === undefined) {
                this.throwKeyNotFound(config, keyPath);
            }
            const success = lodash_1.unset(config, keyPath);
            if (!success) {
                throw new exceptions_1.LocalConfigError(`Unable to delete key ${keyPath.join(".")} in user config`, {
                    keyPath,
                    config,
                });
            }
            yield this.saveConfig(config);
        });
    }
    getConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.config) {
                yield this.loadConfig();
            }
            // Spreading does not work on generic types, see: https://github.com/Microsoft/TypeScript/issues/13557
            return Object.assign(this.config, {});
        });
    }
    updateConfig(config, keyPath, value) {
        let currentValue = config;
        for (let i = 0; i < keyPath.length; i++) {
            const k = keyPath[i];
            if (i === keyPath.length - 1) {
                currentValue[k] = value;
            }
            else if (currentValue[k] === undefined) {
                currentValue[k] = {};
            }
            else if (!lodash_1.isPlainObject(currentValue[k])) {
                const path = keyPath.slice(i + 1).join(".");
                throw new exceptions_1.LocalConfigError(`Attempting to assign a nested key on non-object (current value at ${path}: ${currentValue[k]})`, {
                    currentValue: currentValue[k],
                    path,
                });
            }
            currentValue = currentValue[k];
        }
        return config;
    }
    ensureConfigFile() {
        return __awaiter(this, void 0, void 0, function* () {
            yield fs_extra_1.ensureFile(this.configPath);
        });
    }
    loadConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureConfigFile();
            const config = (yield yaml.safeLoad((yield fs_extra_1.readFile(this.configPath)).toString())) || {};
            this.config = this.validate(config);
        });
    }
    saveConfig(config) {
        return __awaiter(this, void 0, void 0, function* () {
            this.config = null;
            const validated = this.validate(config);
            yield util_1.dumpYaml(this.configPath, validated);
            this.config = validated;
        });
    }
    throwKeyNotFound(config, keyPath) {
        throw new exceptions_1.LocalConfigError(`Could not find key ${keyPath.join(".")} in user config`, {
            keyPath,
            config,
        });
    }
}
exports.ConfigStore = ConfigStore;
const kubernetesLocalConfigSchema = Joi.object()
    .keys({
    username: common_1.joiIdentifier().allow("").optional(),
    "previous-usernames": Joi.array().items(common_1.joiIdentifier()).optional(),
})
    .meta({ internal: true });
const linkedSourceSchema = Joi.object()
    .keys({
    name: common_1.joiIdentifier(),
    path: Joi.string(),
})
    .meta({ internal: true });
const localConfigSchemaKeys = {
    kubernetes: kubernetesLocalConfigSchema,
    linkedModuleSources: common_1.joiArray(linkedSourceSchema),
    linkedProjectSources: common_1.joiArray(linkedSourceSchema),
};
exports.localConfigKeys = Object.keys(localConfigSchemaKeys).reduce((acc, key) => {
    acc[key] = key;
    return acc;
}, {});
const localConfigSchema = Joi.object()
    .keys(localConfigSchemaKeys)
    .meta({ internal: true });
class LocalConfigStore extends ConfigStore {
    getConfigPath(projectPath) {
        return path_1.resolve(projectPath, constants_1.GARDEN_DIR_NAME, constants_1.LOCAL_CONFIG_FILENAME);
    }
    validate(config) {
        return common_1.validate(config, localConfigSchema, { context: this.configPath, ErrorClass: exceptions_1.LocalConfigError });
    }
}
exports.LocalConfigStore = LocalConfigStore;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbmZpZy1zdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsMkJBQTBCO0FBQzFCLGdDQUErQjtBQUMvQiwrQkFBOEI7QUFDOUIsdUNBQStDO0FBQy9DLG1DQUFrRDtBQUVsRCw0Q0FBOEU7QUFDOUUsNkNBQStDO0FBQy9DLHNDQUFzQztBQUN0QywyQ0FBb0U7QUFNcEUsTUFBc0IsV0FBVztJQUkvQixZQUFZLFdBQW1CO1FBQzdCLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUNqRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQTtJQUNwQixDQUFDO0lBV1ksR0FBRyxDQUFDLEdBQUcsSUFBSTs7WUFDdEIsSUFBSSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUE7WUFDbkMsSUFBSSxPQUFxQixDQUFBO1lBRXpCLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7Z0JBQ3JCLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUE7YUFDbEI7aUJBQU07Z0JBQ0wsT0FBTyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBO2FBQ2pEO1lBRUQsS0FBSyxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLE9BQU8sRUFBRTtnQkFDeEMsTUFBTSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQTthQUNuRDtZQUVELE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUMvQixDQUFDO0tBQUE7SUFJWSxHQUFHLENBQUMsT0FBa0I7O1lBQ2pDLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFBO1lBRXJDLElBQUksT0FBTyxFQUFFO2dCQUNYLE1BQU0sS0FBSyxHQUFHLFlBQUcsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7Z0JBRWxDLElBQUksS0FBSyxLQUFLLFNBQVMsRUFBRTtvQkFDdkIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTtpQkFDdkM7Z0JBRUQsT0FBTyxLQUFLLENBQUE7YUFDYjtZQUVELE9BQU8sTUFBTSxDQUFBO1FBQ2YsQ0FBQztLQUFBO0lBRVksS0FBSzs7WUFDaEIsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzlCLENBQUM7S0FBQTtJQUVZLE1BQU0sQ0FBQyxPQUFpQjs7WUFDbkMsSUFBSSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUE7WUFDbkMsSUFBSSxZQUFHLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxLQUFLLFNBQVMsRUFBRTtnQkFDdEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQTthQUN2QztZQUNELE1BQU0sT0FBTyxHQUFHLGNBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUE7WUFDdEMsSUFBSSxDQUFDLE9BQU8sRUFBRTtnQkFDWixNQUFNLElBQUksNkJBQWdCLENBQUMsd0JBQXdCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFO29CQUNyRixPQUFPO29CQUNQLE1BQU07aUJBQ1AsQ0FBQyxDQUFBO2FBQ0g7WUFDRCxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDL0IsQ0FBQztLQUFBO0lBRWEsU0FBUzs7WUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7Z0JBQ2hCLE1BQU0sSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFBO2FBQ3hCO1lBQ0Qsc0dBQXNHO1lBQ3RHLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFBO1FBRXZDLENBQUM7S0FBQTtJQUVPLFlBQVksQ0FBQyxNQUFTLEVBQUUsT0FBaUIsRUFBRSxLQUFrQjtRQUNuRSxJQUFJLFlBQVksR0FBRyxNQUFNLENBQUE7UUFFekIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDdkMsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBRXBCLElBQUksQ0FBQyxLQUFLLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUM1QixZQUFZLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFBO2FBQ3hCO2lCQUFNLElBQUksWUFBWSxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsRUFBRTtnQkFDeEMsWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQTthQUNyQjtpQkFBTSxJQUFJLENBQUMsc0JBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDMUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO2dCQUUzQyxNQUFNLElBQUksNkJBQWdCLENBQ3hCLHFFQUFxRSxJQUFJLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQ2hHO29CQUNFLFlBQVksRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUM3QixJQUFJO2lCQUNMLENBQ0YsQ0FBQTthQUNGO1lBRUQsWUFBWSxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQTtTQUMvQjtRQUNELE9BQU8sTUFBTSxDQUFBO0lBQ2YsQ0FBQztJQUVhLGdCQUFnQjs7WUFDNUIsTUFBTSxxQkFBVSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQTtRQUNuQyxDQUFDO0tBQUE7SUFFYSxVQUFVOztZQUN0QixNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFBO1lBQzdCLE1BQU0sTUFBTSxHQUFHLENBQUEsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxtQkFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUksRUFBRSxDQUFBO1lBRXRGLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUNyQyxDQUFDO0tBQUE7SUFFYSxVQUFVLENBQUMsTUFBUzs7WUFDaEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUE7WUFDbEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN2QyxNQUFNLGVBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFBO1lBQzFDLElBQUksQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFBO1FBQ3pCLENBQUM7S0FBQTtJQUVPLGdCQUFnQixDQUFDLE1BQVMsRUFBRSxPQUFpQjtRQUNuRCxNQUFNLElBQUksNkJBQWdCLENBQUMsc0JBQXNCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFO1lBQ25GLE9BQU87WUFDUCxNQUFNO1NBQ1AsQ0FBQyxDQUFBO0lBQ0osQ0FBQztDQUVGO0FBcklELGtDQXFJQztBQW1CRCxNQUFNLDJCQUEyQixHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUU7S0FDN0MsSUFBSSxDQUFDO0lBQ0osUUFBUSxFQUFFLHNCQUFhLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFO0lBQzlDLG9CQUFvQixFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsc0JBQWEsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFO0NBQ3BFLENBQUM7S0FDRCxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQTtBQUUzQixNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUU7S0FDcEMsSUFBSSxDQUFDO0lBQ0osSUFBSSxFQUFFLHNCQUFhLEVBQUU7SUFDckIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxNQUFNLEVBQUU7Q0FDbkIsQ0FBQztLQUNELElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0FBRTNCLE1BQU0scUJBQXFCLEdBQUc7SUFDNUIsVUFBVSxFQUFFLDJCQUEyQjtJQUN2QyxtQkFBbUIsRUFBRSxpQkFBUSxDQUFDLGtCQUFrQixDQUFDO0lBQ2pELG9CQUFvQixFQUFFLGlCQUFRLENBQUMsa0JBQWtCLENBQUM7Q0FDbkQsQ0FBQTtBQUVZLFFBQUEsZUFBZSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7SUFDcEYsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQTtJQUNkLE9BQU8sR0FBRyxDQUFBO0FBQ1osQ0FBQyxFQUFFLEVBQUUsQ0FBcUQsQ0FBQTtBQUUxRCxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxNQUFNLEVBQUU7S0FDbkMsSUFBSSxDQUFDLHFCQUFxQixDQUFDO0tBQzNCLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFBO0FBRTNCLE1BQWEsZ0JBQWlCLFNBQVEsV0FBd0I7SUFFNUQsYUFBYSxDQUFDLFdBQVc7UUFDdkIsT0FBTyxjQUFPLENBQUMsV0FBVyxFQUFFLDJCQUFlLEVBQUUsaUNBQXFCLENBQUMsQ0FBQTtJQUNyRSxDQUFDO0lBRUQsUUFBUSxDQUFDLE1BQU07UUFDYixPQUFPLGlCQUFRLENBQ2IsTUFBTSxFQUNOLGlCQUFpQixFQUNqQixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSw2QkFBZ0IsRUFBRSxDQUMzRCxDQUFBO0lBQ0gsQ0FBQztDQUVGO0FBZEQsNENBY0MiLCJmaWxlIjoiY29uZmlnLXN0b3JlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCAqIGFzIHlhbWwgZnJvbSBcImpzLXlhbWxcIlxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IGVuc3VyZUZpbGUsIHJlYWRGaWxlIH0gZnJvbSBcImZzLWV4dHJhXCJcbmltcG9ydCB7IGdldCwgaXNQbGFpbk9iamVjdCwgdW5zZXQgfSBmcm9tIFwibG9kYXNoXCJcblxuaW1wb3J0IHsgam9pSWRlbnRpZmllciwgUHJpbWl0aXZlLCB2YWxpZGF0ZSwgam9pQXJyYXkgfSBmcm9tIFwiLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7IExvY2FsQ29uZmlnRXJyb3IgfSBmcm9tIFwiLi9leGNlcHRpb25zXCJcbmltcG9ydCB7IGR1bXBZYW1sIH0gZnJvbSBcIi4vdXRpbC91dGlsXCJcbmltcG9ydCB7IEdBUkRFTl9ESVJfTkFNRSwgTE9DQUxfQ09ORklHX0ZJTEVOQU1FIH0gZnJvbSBcIi4vY29uc3RhbnRzXCJcblxuZXhwb3J0IHR5cGUgQ29uZmlnVmFsdWUgPSBQcmltaXRpdmUgfCBQcmltaXRpdmVbXSB8IE9iamVjdFtdXG5cbmV4cG9ydCB0eXBlIFNldE1hbnlQYXJhbSA9IHsga2V5UGF0aDogQXJyYXk8c3RyaW5nPiwgdmFsdWU6IENvbmZpZ1ZhbHVlIH1bXVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ29uZmlnU3RvcmU8VCBleHRlbmRzIG9iamVjdCA9IGFueT4ge1xuICBwcml2YXRlIGNvbmZpZzogbnVsbCB8IFRcbiAgcHJvdGVjdGVkIGNvbmZpZ1BhdGg6IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKHByb2plY3RQYXRoOiBzdHJpbmcpIHtcbiAgICB0aGlzLmNvbmZpZ1BhdGggPSB0aGlzLmdldENvbmZpZ1BhdGgocHJvamVjdFBhdGgpXG4gICAgdGhpcy5jb25maWcgPSBudWxsXG4gIH1cblxuICBhYnN0cmFjdCBnZXRDb25maWdQYXRoKHByb2plY3RQYXRoOiBzdHJpbmcpOiBzdHJpbmdcbiAgYWJzdHJhY3QgdmFsaWRhdGUoY29uZmlnKTogVFxuXG4gIC8qKlxuICAgKiBXb3VsZCd2ZSBiZWVuIG5pY2UgdG8gYWxsb3cgc29tZXRoaW5nIGxpa2U6IHNldChbXCJwYXRoXCIsIFwidG9cIiwgXCJ2YWxBXCIsIHZhbEFdLCBbXCJwYXRoXCIsIFwidG9cIiwgXCJ2YWxCXCIsIHZhbEJdLi4uKVxuICAgKiBidXQgVHlwZXNjcmlwdCBzdXBwb3J0IGlzIG1pc3NpbmcgYXQgdGhlIG1vbWVudFxuICAgKi9cbiAgcHVibGljIGFzeW5jIHNldChwYXJhbTogU2V0TWFueVBhcmFtKVxuICBwdWJsaWMgYXN5bmMgc2V0KGtleVBhdGg6IHN0cmluZ1tdLCB2YWx1ZTogQ29uZmlnVmFsdWUpXG4gIHB1YmxpYyBhc3luYyBzZXQoLi4uYXJncykge1xuICAgIGxldCBjb25maWcgPSBhd2FpdCB0aGlzLmdldENvbmZpZygpXG4gICAgbGV0IGVudHJpZXM6IFNldE1hbnlQYXJhbVxuXG4gICAgaWYgKGFyZ3MubGVuZ3RoID09PSAxKSB7XG4gICAgICBlbnRyaWVzID0gYXJnc1swXVxuICAgIH0gZWxzZSB7XG4gICAgICBlbnRyaWVzID0gW3sga2V5UGF0aDogYXJnc1swXSwgdmFsdWU6IGFyZ3NbMV0gfV1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHsga2V5UGF0aCwgdmFsdWUgfSBvZiBlbnRyaWVzKSB7XG4gICAgICBjb25maWcgPSB0aGlzLnVwZGF0ZUNvbmZpZyhjb25maWcsIGtleVBhdGgsIHZhbHVlKVxuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuc2F2ZUNvbmZpZyhjb25maWcpXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZ2V0KCk6IFByb21pc2U8VD5cbiAgcHVibGljIGFzeW5jIGdldChrZXlQYXRoOiBzdHJpbmdbXSk6IFByb21pc2U8T2JqZWN0IHwgQ29uZmlnVmFsdWU+XG4gIHB1YmxpYyBhc3luYyBnZXQoa2V5UGF0aD86IHN0cmluZ1tdKTogUHJvbWlzZTxPYmplY3QgfCBDb25maWdWYWx1ZT4ge1xuICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHRoaXMuZ2V0Q29uZmlnKClcblxuICAgIGlmIChrZXlQYXRoKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdldChjb25maWcsIGtleVBhdGgpXG5cbiAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRoaXMudGhyb3dLZXlOb3RGb3VuZChjb25maWcsIGtleVBhdGgpXG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cblxuICAgIHJldHVybiBjb25maWdcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBjbGVhcigpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVDb25maWcoPFQ+e30pXG4gIH1cblxuICBwdWJsaWMgYXN5bmMgZGVsZXRlKGtleVBhdGg6IHN0cmluZ1tdKSB7XG4gICAgbGV0IGNvbmZpZyA9IGF3YWl0IHRoaXMuZ2V0Q29uZmlnKClcbiAgICBpZiAoZ2V0KGNvbmZpZywga2V5UGF0aCkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy50aHJvd0tleU5vdEZvdW5kKGNvbmZpZywga2V5UGF0aClcbiAgICB9XG4gICAgY29uc3Qgc3VjY2VzcyA9IHVuc2V0KGNvbmZpZywga2V5UGF0aClcbiAgICBpZiAoIXN1Y2Nlc3MpIHtcbiAgICAgIHRocm93IG5ldyBMb2NhbENvbmZpZ0Vycm9yKGBVbmFibGUgdG8gZGVsZXRlIGtleSAke2tleVBhdGguam9pbihcIi5cIil9IGluIHVzZXIgY29uZmlnYCwge1xuICAgICAgICBrZXlQYXRoLFxuICAgICAgICBjb25maWcsXG4gICAgICB9KVxuICAgIH1cbiAgICBhd2FpdCB0aGlzLnNhdmVDb25maWcoY29uZmlnKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRDb25maWcoKTogUHJvbWlzZTxUPiB7XG4gICAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKClcbiAgICB9XG4gICAgLy8gU3ByZWFkaW5nIGRvZXMgbm90IHdvcmsgb24gZ2VuZXJpYyB0eXBlcywgc2VlOiBodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L1R5cGVTY3JpcHQvaXNzdWVzLzEzNTU3XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24odGhpcy5jb25maWcsIHt9KVxuXG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUNvbmZpZyhjb25maWc6IFQsIGtleVBhdGg6IHN0cmluZ1tdLCB2YWx1ZTogQ29uZmlnVmFsdWUpOiBUIHtcbiAgICBsZXQgY3VycmVudFZhbHVlID0gY29uZmlnXG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleVBhdGgubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IGsgPSBrZXlQYXRoW2ldXG5cbiAgICAgIGlmIChpID09PSBrZXlQYXRoLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgY3VycmVudFZhbHVlW2tdID0gdmFsdWVcbiAgICAgIH0gZWxzZSBpZiAoY3VycmVudFZhbHVlW2tdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY3VycmVudFZhbHVlW2tdID0ge31cbiAgICAgIH0gZWxzZSBpZiAoIWlzUGxhaW5PYmplY3QoY3VycmVudFZhbHVlW2tdKSkge1xuICAgICAgICBjb25zdCBwYXRoID0ga2V5UGF0aC5zbGljZShpICsgMSkuam9pbihcIi5cIilcblxuICAgICAgICB0aHJvdyBuZXcgTG9jYWxDb25maWdFcnJvcihcbiAgICAgICAgICBgQXR0ZW1wdGluZyB0byBhc3NpZ24gYSBuZXN0ZWQga2V5IG9uIG5vbi1vYmplY3QgKGN1cnJlbnQgdmFsdWUgYXQgJHtwYXRofTogJHtjdXJyZW50VmFsdWVba119KWAsXG4gICAgICAgICAge1xuICAgICAgICAgICAgY3VycmVudFZhbHVlOiBjdXJyZW50VmFsdWVba10sXG4gICAgICAgICAgICBwYXRoLFxuICAgICAgICAgIH0sXG4gICAgICAgIClcbiAgICAgIH1cblxuICAgICAgY3VycmVudFZhbHVlID0gY3VycmVudFZhbHVlW2tdXG4gICAgfVxuICAgIHJldHVybiBjb25maWdcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZW5zdXJlQ29uZmlnRmlsZSgpIHtcbiAgICBhd2FpdCBlbnN1cmVGaWxlKHRoaXMuY29uZmlnUGF0aClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpIHtcbiAgICBhd2FpdCB0aGlzLmVuc3VyZUNvbmZpZ0ZpbGUoKVxuICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHlhbWwuc2FmZUxvYWQoKGF3YWl0IHJlYWRGaWxlKHRoaXMuY29uZmlnUGF0aCkpLnRvU3RyaW5nKCkpIHx8IHt9XG5cbiAgICB0aGlzLmNvbmZpZyA9IHRoaXMudmFsaWRhdGUoY29uZmlnKVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzYXZlQ29uZmlnKGNvbmZpZzogVCkge1xuICAgIHRoaXMuY29uZmlnID0gbnVsbFxuICAgIGNvbnN0IHZhbGlkYXRlZCA9IHRoaXMudmFsaWRhdGUoY29uZmlnKVxuICAgIGF3YWl0IGR1bXBZYW1sKHRoaXMuY29uZmlnUGF0aCwgdmFsaWRhdGVkKVxuICAgIHRoaXMuY29uZmlnID0gdmFsaWRhdGVkXG4gIH1cblxuICBwcml2YXRlIHRocm93S2V5Tm90Rm91bmQoY29uZmlnOiBULCBrZXlQYXRoOiBzdHJpbmdbXSkge1xuICAgIHRocm93IG5ldyBMb2NhbENvbmZpZ0Vycm9yKGBDb3VsZCBub3QgZmluZCBrZXkgJHtrZXlQYXRoLmpvaW4oXCIuXCIpfSBpbiB1c2VyIGNvbmZpZ2AsIHtcbiAgICAgIGtleVBhdGgsXG4gICAgICBjb25maWcsXG4gICAgfSlcbiAgfVxuXG59XG5cbi8vIFRPRE86IENhbWVsIGNhc2UgcHJldmlvdXMgdXNlcm5hbWVzXG5leHBvcnQgaW50ZXJmYWNlIEt1YmVybmV0ZXNMb2NhbENvbmZpZyB7XG4gIHVzZXJuYW1lPzogc3RyaW5nXG4gIFwicHJldmlvdXMtdXNlcm5hbWVzXCI/OiBBcnJheTxzdHJpbmc+XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlua2VkU291cmNlIHtcbiAgbmFtZTogc3RyaW5nXG4gIHBhdGg6IHN0cmluZ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvY2FsQ29uZmlnIHtcbiAga3ViZXJuZXRlcz86IEt1YmVybmV0ZXNMb2NhbENvbmZpZ1xuICBsaW5rZWRNb2R1bGVTb3VyY2VzPzogTGlua2VkU291cmNlW10gLy8gVE9ETyBVc2UgS2V5ZWRTZXQgaW5zdGVhZCBvZiBhcnJheVxuICBsaW5rZWRQcm9qZWN0U291cmNlcz86IExpbmtlZFNvdXJjZVtdXG59XG5cbmNvbnN0IGt1YmVybmV0ZXNMb2NhbENvbmZpZ1NjaGVtYSA9IEpvaS5vYmplY3QoKVxuICAua2V5cyh7XG4gICAgdXNlcm5hbWU6IGpvaUlkZW50aWZpZXIoKS5hbGxvdyhcIlwiKS5vcHRpb25hbCgpLFxuICAgIFwicHJldmlvdXMtdXNlcm5hbWVzXCI6IEpvaS5hcnJheSgpLml0ZW1zKGpvaUlkZW50aWZpZXIoKSkub3B0aW9uYWwoKSxcbiAgfSlcbiAgLm1ldGEoeyBpbnRlcm5hbDogdHJ1ZSB9KVxuXG5jb25zdCBsaW5rZWRTb3VyY2VTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMoe1xuICAgIG5hbWU6IGpvaUlkZW50aWZpZXIoKSxcbiAgICBwYXRoOiBKb2kuc3RyaW5nKCksXG4gIH0pXG4gIC5tZXRhKHsgaW50ZXJuYWw6IHRydWUgfSlcblxuY29uc3QgbG9jYWxDb25maWdTY2hlbWFLZXlzID0ge1xuICBrdWJlcm5ldGVzOiBrdWJlcm5ldGVzTG9jYWxDb25maWdTY2hlbWEsXG4gIGxpbmtlZE1vZHVsZVNvdXJjZXM6IGpvaUFycmF5KGxpbmtlZFNvdXJjZVNjaGVtYSksXG4gIGxpbmtlZFByb2plY3RTb3VyY2VzOiBqb2lBcnJheShsaW5rZWRTb3VyY2VTY2hlbWEpLFxufVxuXG5leHBvcnQgY29uc3QgbG9jYWxDb25maWdLZXlzID0gT2JqZWN0LmtleXMobG9jYWxDb25maWdTY2hlbWFLZXlzKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gIGFjY1trZXldID0ga2V5XG4gIHJldHVybiBhY2Ncbn0sIHt9KSBhcyB7IFtLIGluIGtleW9mIHR5cGVvZiBsb2NhbENvbmZpZ1NjaGVtYUtleXNdOiBLIH1cblxuY29uc3QgbG9jYWxDb25maWdTY2hlbWEgPSBKb2kub2JqZWN0KClcbiAgLmtleXMobG9jYWxDb25maWdTY2hlbWFLZXlzKVxuICAubWV0YSh7IGludGVybmFsOiB0cnVlIH0pXG5cbmV4cG9ydCBjbGFzcyBMb2NhbENvbmZpZ1N0b3JlIGV4dGVuZHMgQ29uZmlnU3RvcmU8TG9jYWxDb25maWc+IHtcblxuICBnZXRDb25maWdQYXRoKHByb2plY3RQYXRoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gcmVzb2x2ZShwcm9qZWN0UGF0aCwgR0FSREVOX0RJUl9OQU1FLCBMT0NBTF9DT05GSUdfRklMRU5BTUUpXG4gIH1cblxuICB2YWxpZGF0ZShjb25maWcpOiBMb2NhbENvbmZpZyB7XG4gICAgcmV0dXJuIHZhbGlkYXRlKFxuICAgICAgY29uZmlnLFxuICAgICAgbG9jYWxDb25maWdTY2hlbWEsXG4gICAgICB7IGNvbnRleHQ6IHRoaXMuY29uZmlnUGF0aCwgRXJyb3JDbGFzczogTG9jYWxDb25maWdFcnJvciB9LFxuICAgIClcbiAgfVxuXG59XG4iXX0=
