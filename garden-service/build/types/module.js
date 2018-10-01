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
const lodash_1 = require("lodash");
const util_1 = require("../util/util");
const module_1 = require("../config/module");
const base_1 = require("../vcs/base");
const cache_1 = require("../cache");
const service_1 = require("./service");
const Joi = require("joi");
const common_1 = require("../config/common");
exports.moduleSchema = module_1.moduleConfigSchema
    .keys({
    buildPath: Joi.string()
        .required()
        .uri({ relativeOnly: true })
        .description("The path to the build staging directory for the module."),
    version: base_1.moduleVersionSchema
        .required(),
    services: common_1.joiArray(Joi.lazy(() => service_1.serviceSchema))
        .required()
        .description("A list of all the services that the module provides."),
    serviceNames: common_1.joiArray(common_1.joiIdentifier())
        .required()
        .description("The names of the services that the module provides."),
    serviceDependencyNames: common_1.joiArray(common_1.joiIdentifier())
        .required()
        .description("The names of all the services that the services in this module depend on."),
});
function moduleFromConfig(garden, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const module = Object.assign({}, config, { buildPath: yield garden.buildDir.buildPath(config.name), version: yield garden.resolveVersion(config.name, config.build.dependencies), services: [], serviceNames: util_1.getNames(config.serviceConfigs), serviceDependencyNames: lodash_1.uniq(lodash_1.flatten(config.serviceConfigs
                .map(serviceConfig => serviceConfig.dependencies)
                .filter(deps => !!deps))), _ConfigType: config });
        module.services = config.serviceConfigs.map(serviceConfig => service_1.serviceFromConfig(module, serviceConfig));
        return module;
    });
}
exports.moduleFromConfig = moduleFromConfig;
function getModuleCacheContext(config) {
    return cache_1.pathToCacheContext(config.path);
}
exports.getModuleCacheContext = getModuleCacheContext;
function getModuleKey(name, plugin) {
    return plugin ? `${plugin}--${name}` : name;
}
exports.getModuleKey = getModuleKey;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInR5cGVzL21vZHVsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsbUNBQXNDO0FBQ3RDLHVDQUF1QztBQUV2Qyw2Q0FBK0U7QUFFL0Usc0NBQWdFO0FBQ2hFLG9DQUE2QztBQUU3Qyx1Q0FBcUU7QUFDckUsMkJBQTBCO0FBQzFCLDZDQUEwRDtBQXNCN0MsUUFBQSxZQUFZLEdBQUcsMkJBQWtCO0tBQzNDLElBQUksQ0FBQztJQUNKLFNBQVMsRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFO1NBQ3BCLFFBQVEsRUFBRTtTQUNWLEdBQUcsQ0FBTSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsQ0FBQztTQUNoQyxXQUFXLENBQUMseURBQXlELENBQUM7SUFDekUsT0FBTyxFQUFFLDBCQUFtQjtTQUN6QixRQUFRLEVBQUU7SUFDYixRQUFRLEVBQUUsaUJBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLHVCQUFhLENBQUMsQ0FBQztTQUM5QyxRQUFRLEVBQUU7U0FDVixXQUFXLENBQUMsc0RBQXNELENBQUM7SUFDdEUsWUFBWSxFQUFFLGlCQUFRLENBQUMsc0JBQWEsRUFBRSxDQUFDO1NBQ3BDLFFBQVEsRUFBRTtTQUNWLFdBQVcsQ0FBQyxxREFBcUQsQ0FBQztJQUNyRSxzQkFBc0IsRUFBRSxpQkFBUSxDQUFDLHNCQUFhLEVBQUUsQ0FBQztTQUM5QyxRQUFRLEVBQUU7U0FDVixXQUFXLENBQUMsMkVBQTJFLENBQUM7Q0FDNUYsQ0FBQyxDQUFBO0FBVUosU0FBc0IsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLE1BQW9COztRQUN6RSxNQUFNLE1BQU0scUJBQ1AsTUFBTSxJQUVULFNBQVMsRUFBRSxNQUFNLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFDdkQsT0FBTyxFQUFFLE1BQU0sTUFBTSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBRTVFLFFBQVEsRUFBRSxFQUFFLEVBQ1osWUFBWSxFQUFFLGVBQVEsQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLEVBQzdDLHNCQUFzQixFQUFFLGFBQUksQ0FBQyxnQkFBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjO2lCQUN2RCxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsWUFBWSxDQUFDO2lCQUNoRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUUzQixXQUFXLEVBQUUsTUFBTSxHQUNwQixDQUFBO1FBRUQsTUFBTSxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLDJCQUFpQixDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFBO1FBRXRHLE9BQU8sTUFBTSxDQUFBO0lBQ2YsQ0FBQztDQUFBO0FBbkJELDRDQW1CQztBQUVELFNBQWdCLHFCQUFxQixDQUFDLE1BQW9CO0lBQ3hELE9BQU8sMEJBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBO0FBQ3hDLENBQUM7QUFGRCxzREFFQztBQUVELFNBQWdCLFlBQVksQ0FBQyxJQUFZLEVBQUUsTUFBZTtJQUN4RCxPQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQTtBQUM3QyxDQUFDO0FBRkQsb0NBRUMiLCJmaWxlIjoidHlwZXMvbW9kdWxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGZsYXR0ZW4sIHVuaXEgfSBmcm9tIFwibG9kYXNoXCJcbmltcG9ydCB7IGdldE5hbWVzIH0gZnJvbSBcIi4uL3V0aWwvdXRpbFwiXG5pbXBvcnQgeyBUZXN0U3BlYyB9IGZyb20gXCIuLi9jb25maWcvdGVzdFwiXG5pbXBvcnQgeyBNb2R1bGVTcGVjLCBNb2R1bGVDb25maWcsIG1vZHVsZUNvbmZpZ1NjaGVtYSB9IGZyb20gXCIuLi9jb25maWcvbW9kdWxlXCJcbmltcG9ydCB7IFNlcnZpY2VTcGVjIH0gZnJvbSBcIi4uL2NvbmZpZy9zZXJ2aWNlXCJcbmltcG9ydCB7IE1vZHVsZVZlcnNpb24sIG1vZHVsZVZlcnNpb25TY2hlbWEgfSBmcm9tIFwiLi4vdmNzL2Jhc2VcIlxuaW1wb3J0IHsgcGF0aFRvQ2FjaGVDb250ZXh0IH0gZnJvbSBcIi4uL2NhY2hlXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuaW1wb3J0IHsgc2VydmljZUZyb21Db25maWcsIFNlcnZpY2UsIHNlcnZpY2VTY2hlbWEgfSBmcm9tIFwiLi9zZXJ2aWNlXCJcbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCB7IGpvaUFycmF5LCBqb2lJZGVudGlmaWVyIH0gZnJvbSBcIi4uL2NvbmZpZy9jb21tb25cIlxuXG5leHBvcnQgaW50ZXJmYWNlIEJ1aWxkQ29weVNwZWMge1xuICBzb3VyY2U6IHN0cmluZ1xuICB0YXJnZXQ6IHN0cmluZ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vZHVsZTxcbiAgTSBleHRlbmRzIE1vZHVsZVNwZWMgPSBhbnksXG4gIFMgZXh0ZW5kcyBTZXJ2aWNlU3BlYyA9IGFueSxcbiAgVCBleHRlbmRzIFRlc3RTcGVjID0gYW55LFxuICA+IGV4dGVuZHMgTW9kdWxlQ29uZmlnPE0sIFMsIFQ+IHtcbiAgYnVpbGRQYXRoOiBzdHJpbmdcbiAgdmVyc2lvbjogTW9kdWxlVmVyc2lvblxuXG4gIHNlcnZpY2VzOiBTZXJ2aWNlPE1vZHVsZTxNLCBTLCBUPj5bXVxuICBzZXJ2aWNlTmFtZXM6IHN0cmluZ1tdXG4gIHNlcnZpY2VEZXBlbmRlbmN5TmFtZXM6IHN0cmluZ1tdXG5cbiAgX0NvbmZpZ1R5cGU6IE1vZHVsZUNvbmZpZzxNLCBTLCBUPlxufVxuXG5leHBvcnQgY29uc3QgbW9kdWxlU2NoZW1hID0gbW9kdWxlQ29uZmlnU2NoZW1hXG4gIC5rZXlzKHtcbiAgICBidWlsZFBhdGg6IEpvaS5zdHJpbmcoKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC51cmkoPGFueT57IHJlbGF0aXZlT25seTogdHJ1ZSB9KVxuICAgICAgLmRlc2NyaXB0aW9uKFwiVGhlIHBhdGggdG8gdGhlIGJ1aWxkIHN0YWdpbmcgZGlyZWN0b3J5IGZvciB0aGUgbW9kdWxlLlwiKSxcbiAgICB2ZXJzaW9uOiBtb2R1bGVWZXJzaW9uU2NoZW1hXG4gICAgICAucmVxdWlyZWQoKSxcbiAgICBzZXJ2aWNlczogam9pQXJyYXkoSm9pLmxhenkoKCkgPT4gc2VydmljZVNjaGVtYSkpXG4gICAgICAucmVxdWlyZWQoKVxuICAgICAgLmRlc2NyaXB0aW9uKFwiQSBsaXN0IG9mIGFsbCB0aGUgc2VydmljZXMgdGhhdCB0aGUgbW9kdWxlIHByb3ZpZGVzLlwiKSxcbiAgICBzZXJ2aWNlTmFtZXM6IGpvaUFycmF5KGpvaUlkZW50aWZpZXIoKSlcbiAgICAgIC5yZXF1aXJlZCgpXG4gICAgICAuZGVzY3JpcHRpb24oXCJUaGUgbmFtZXMgb2YgdGhlIHNlcnZpY2VzIHRoYXQgdGhlIG1vZHVsZSBwcm92aWRlcy5cIiksXG4gICAgc2VydmljZURlcGVuZGVuY3lOYW1lczogam9pQXJyYXkoam9pSWRlbnRpZmllcigpKVxuICAgICAgLnJlcXVpcmVkKClcbiAgICAgIC5kZXNjcmlwdGlvbihcIlRoZSBuYW1lcyBvZiBhbGwgdGhlIHNlcnZpY2VzIHRoYXQgdGhlIHNlcnZpY2VzIGluIHRoaXMgbW9kdWxlIGRlcGVuZCBvbi5cIiksXG4gIH0pXG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9kdWxlTWFwPFQgZXh0ZW5kcyBNb2R1bGUgPSBNb2R1bGU+IHtcbiAgW2tleTogc3RyaW5nXTogVFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vZHVsZUNvbmZpZ01hcDxUIGV4dGVuZHMgTW9kdWxlQ29uZmlnID0gTW9kdWxlQ29uZmlnPiB7XG4gIFtrZXk6IHN0cmluZ106IFRcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vZHVsZUZyb21Db25maWcoZ2FyZGVuOiBHYXJkZW4sIGNvbmZpZzogTW9kdWxlQ29uZmlnKTogUHJvbWlzZTxNb2R1bGU+IHtcbiAgY29uc3QgbW9kdWxlOiBNb2R1bGUgPSB7XG4gICAgLi4uY29uZmlnLFxuXG4gICAgYnVpbGRQYXRoOiBhd2FpdCBnYXJkZW4uYnVpbGREaXIuYnVpbGRQYXRoKGNvbmZpZy5uYW1lKSxcbiAgICB2ZXJzaW9uOiBhd2FpdCBnYXJkZW4ucmVzb2x2ZVZlcnNpb24oY29uZmlnLm5hbWUsIGNvbmZpZy5idWlsZC5kZXBlbmRlbmNpZXMpLFxuXG4gICAgc2VydmljZXM6IFtdLFxuICAgIHNlcnZpY2VOYW1lczogZ2V0TmFtZXMoY29uZmlnLnNlcnZpY2VDb25maWdzKSxcbiAgICBzZXJ2aWNlRGVwZW5kZW5jeU5hbWVzOiB1bmlxKGZsYXR0ZW4oY29uZmlnLnNlcnZpY2VDb25maWdzXG4gICAgICAubWFwKHNlcnZpY2VDb25maWcgPT4gc2VydmljZUNvbmZpZy5kZXBlbmRlbmNpZXMpXG4gICAgICAuZmlsdGVyKGRlcHMgPT4gISFkZXBzKSkpLFxuXG4gICAgX0NvbmZpZ1R5cGU6IGNvbmZpZyxcbiAgfVxuXG4gIG1vZHVsZS5zZXJ2aWNlcyA9IGNvbmZpZy5zZXJ2aWNlQ29uZmlncy5tYXAoc2VydmljZUNvbmZpZyA9PiBzZXJ2aWNlRnJvbUNvbmZpZyhtb2R1bGUsIHNlcnZpY2VDb25maWcpKVxuXG4gIHJldHVybiBtb2R1bGVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZHVsZUNhY2hlQ29udGV4dChjb25maWc6IE1vZHVsZUNvbmZpZykge1xuICByZXR1cm4gcGF0aFRvQ2FjaGVDb250ZXh0KGNvbmZpZy5wYXRoKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9kdWxlS2V5KG5hbWU6IHN0cmluZywgcGx1Z2luPzogc3RyaW5nKSB7XG4gIHJldHVybiBwbHVnaW4gPyBgJHtwbHVnaW59LS0ke25hbWV9YCA6IG5hbWVcbn1cbiJdfQ==
