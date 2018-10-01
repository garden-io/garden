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
const js_yaml_1 = require("js-yaml");
const util_1 = require("../util/util");
const base_1 = require("./base");
const lodash_1 = require("lodash");
class ScanCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "scan";
        this.help = "Scans your project and outputs an overview of all modules.";
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            const modules = (yield garden.getModules())
                .map(m => {
                m.services.forEach(s => delete s.module);
                return lodash_1.omit(m, ["_ConfigType", "cacheContext", "serviceConfigs", "serviceNames"]);
            });
            const output = { modules };
            const shortOutput = {
                modules: modules.map(m => {
                    m.services.map(s => delete s.spec);
                    return lodash_1.omit(m, ["spec"]);
                }),
            };
            garden.log.info(util_1.highlightYaml(js_yaml_1.safeDump(shortOutput, { noRefs: true, skipInvalid: true, sortKeys: true })));
            return { result: output };
        });
    }
}
exports.ScanCommand = ScanCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3NjYW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILHFDQUFrQztBQUVsQyx1Q0FBNEM7QUFDNUMsaUNBSWU7QUFDZixtQ0FBNkI7QUFFN0IsTUFBYSxXQUFZLFNBQVEsY0FBTztJQUF4Qzs7UUFDRSxTQUFJLEdBQUcsTUFBTSxDQUFBO1FBQ2IsU0FBSSxHQUFHLDREQUE0RCxDQUFBO0lBc0JyRSxDQUFDO0lBcEJPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBaUI7O1lBQ3BDLE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7aUJBQ3hDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDUCxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFBO2dCQUN4QyxPQUFPLGFBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUE7WUFDbkYsQ0FBQyxDQUFDLENBQUE7WUFFSixNQUFNLE1BQU0sR0FBRyxFQUFFLE9BQU8sRUFBRSxDQUFBO1lBRTFCLE1BQU0sV0FBVyxHQUFHO2dCQUNsQixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDdkIsQ0FBQyxDQUFDLFFBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQTtvQkFDbkMsT0FBTyxhQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQTtnQkFDMUIsQ0FBQyxDQUFDO2FBQ0gsQ0FBQTtZQUVELE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFhLENBQUMsa0JBQVEsQ0FBQyxXQUFXLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBRTFHLE9BQU8sRUFBRSxNQUFNLEVBQXlCLE1BQU0sRUFBRSxDQUFBO1FBQ2xELENBQUM7S0FBQTtDQUNGO0FBeEJELGtDQXdCQyIsImZpbGUiOiJjb21tYW5kcy9zY2FuLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IHNhZmVEdW1wIH0gZnJvbSBcImpzLXlhbWxcIlxuaW1wb3J0IHsgRGVlcFByaW1pdGl2ZU1hcCB9IGZyb20gXCIuLi9jb25maWcvY29tbW9uXCJcbmltcG9ydCB7IGhpZ2hsaWdodFlhbWwgfSBmcm9tIFwiLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7XG4gIENvbW1hbmQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIENvbW1hbmRSZXN1bHQsXG59IGZyb20gXCIuL2Jhc2VcIlxuaW1wb3J0IHsgb21pdCB9IGZyb20gXCJsb2Rhc2hcIlxuXG5leHBvcnQgY2xhc3MgU2NhbkNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwic2NhblwiXG4gIGhlbHAgPSBcIlNjYW5zIHlvdXIgcHJvamVjdCBhbmQgb3V0cHV0cyBhbiBvdmVydmlldyBvZiBhbGwgbW9kdWxlcy5cIlxuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiB9OiBDb21tYW5kUGFyYW1zKTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PERlZXBQcmltaXRpdmVNYXA+PiB7XG4gICAgY29uc3QgbW9kdWxlcyA9IChhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlcygpKVxuICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgbS5zZXJ2aWNlcy5mb3JFYWNoKHMgPT4gZGVsZXRlIHMubW9kdWxlKVxuICAgICAgICByZXR1cm4gb21pdChtLCBbXCJfQ29uZmlnVHlwZVwiLCBcImNhY2hlQ29udGV4dFwiLCBcInNlcnZpY2VDb25maWdzXCIsIFwic2VydmljZU5hbWVzXCJdKVxuICAgICAgfSlcblxuICAgIGNvbnN0IG91dHB1dCA9IHsgbW9kdWxlcyB9XG5cbiAgICBjb25zdCBzaG9ydE91dHB1dCA9IHtcbiAgICAgIG1vZHVsZXM6IG1vZHVsZXMubWFwKG0gPT4ge1xuICAgICAgICBtLnNlcnZpY2VzIS5tYXAocyA9PiBkZWxldGUgcy5zcGVjKVxuICAgICAgICByZXR1cm4gb21pdChtLCBbXCJzcGVjXCJdKVxuICAgICAgfSksXG4gICAgfVxuXG4gICAgZ2FyZGVuLmxvZy5pbmZvKGhpZ2hsaWdodFlhbWwoc2FmZUR1bXAoc2hvcnRPdXRwdXQsIHsgbm9SZWZzOiB0cnVlLCBza2lwSW52YWxpZDogdHJ1ZSwgc29ydEtleXM6IHRydWUgfSkpKVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0OiA8RGVlcFByaW1pdGl2ZU1hcD48YW55Pm91dHB1dCB9XG4gIH1cbn1cbiJdfQ==
