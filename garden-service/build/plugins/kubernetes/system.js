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
const path_1 = require("path");
const constants_1 = require("../../constants");
const garden_1 = require("../../garden");
exports.GARDEN_SYSTEM_NAMESPACE = "garden-system";
const systemProjectPath = path_1.join(constants_1.STATIC_DIR, "kubernetes", "system");
exports.systemSymbol = Symbol();
function isSystemGarden(provider) {
    return provider.config._system === exports.systemSymbol;
}
exports.isSystemGarden = isSystemGarden;
function getSystemGarden(provider) {
    return __awaiter(this, void 0, void 0, function* () {
        return garden_1.Garden.factory(systemProjectPath, {
            env: "default",
            config: {
                version: "0",
                dirname: "system",
                path: systemProjectPath,
                project: {
                    name: "garden-system",
                    environmentDefaults: {
                        providers: [],
                        variables: {},
                    },
                    defaultEnvironment: "default",
                    environments: [
                        {
                            name: "default",
                            providers: [
                                {
                                    name: "local-kubernetes",
                                    context: provider.config.context,
                                    namespace: exports.GARDEN_SYSTEM_NAMESPACE,
                                    _system: exports.systemSymbol,
                                },
                            ],
                            variables: {},
                        },
                    ],
                },
            },
        });
    });
}
exports.getSystemGarden = getSystemGarden;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInBsdWdpbnMva3ViZXJuZXRlcy9zeXN0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUVILCtCQUEyQjtBQUMzQiwrQ0FBNEM7QUFDNUMseUNBQXFDO0FBR3hCLFFBQUEsdUJBQXVCLEdBQUcsZUFBZSxDQUFBO0FBRXRELE1BQU0saUJBQWlCLEdBQUcsV0FBSSxDQUFDLHNCQUFVLEVBQUUsWUFBWSxFQUFFLFFBQVEsQ0FBQyxDQUFBO0FBQ3JELFFBQUEsWUFBWSxHQUFHLE1BQU0sRUFBRSxDQUFBO0FBRXBDLFNBQWdCLGNBQWMsQ0FBQyxRQUE0QjtJQUN6RCxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxLQUFLLG9CQUFZLENBQUE7QUFDakQsQ0FBQztBQUZELHdDQUVDO0FBRUQsU0FBc0IsZUFBZSxDQUFDLFFBQTRCOztRQUNoRSxPQUFPLGVBQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUU7WUFDdkMsR0FBRyxFQUFFLFNBQVM7WUFDZCxNQUFNLEVBQUU7Z0JBQ04sT0FBTyxFQUFFLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLFFBQVE7Z0JBQ2pCLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLE9BQU8sRUFBRTtvQkFDUCxJQUFJLEVBQUUsZUFBZTtvQkFDckIsbUJBQW1CLEVBQUU7d0JBQ25CLFNBQVMsRUFBRSxFQUFFO3dCQUNiLFNBQVMsRUFBRSxFQUFFO3FCQUNkO29CQUNELGtCQUFrQixFQUFFLFNBQVM7b0JBQzdCLFlBQVksRUFBRTt3QkFDWjs0QkFDRSxJQUFJLEVBQUUsU0FBUzs0QkFDZixTQUFTLEVBQUU7Z0NBQ1Q7b0NBQ0UsSUFBSSxFQUFFLGtCQUFrQjtvQ0FDeEIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTztvQ0FDaEMsU0FBUyxFQUFFLCtCQUF1QjtvQ0FDbEMsT0FBTyxFQUFFLG9CQUFZO2lDQUN0Qjs2QkFDRjs0QkFDRCxTQUFTLEVBQUUsRUFBRTt5QkFDZDtxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFBO0lBQ0osQ0FBQztDQUFBO0FBL0JELDBDQStCQyIsImZpbGUiOiJwbHVnaW5zL2t1YmVybmV0ZXMvc3lzdGVtLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IGpvaW4gfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyBTVEFUSUNfRElSIH0gZnJvbSBcIi4uLy4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vLi4vZ2FyZGVuXCJcbmltcG9ydCB7IEt1YmVybmV0ZXNQcm92aWRlciB9IGZyb20gXCIuL2t1YmVybmV0ZXNcIlxuXG5leHBvcnQgY29uc3QgR0FSREVOX1NZU1RFTV9OQU1FU1BBQ0UgPSBcImdhcmRlbi1zeXN0ZW1cIlxuXG5jb25zdCBzeXN0ZW1Qcm9qZWN0UGF0aCA9IGpvaW4oU1RBVElDX0RJUiwgXCJrdWJlcm5ldGVzXCIsIFwic3lzdGVtXCIpXG5leHBvcnQgY29uc3Qgc3lzdGVtU3ltYm9sID0gU3ltYm9sKClcblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3lzdGVtR2FyZGVuKHByb3ZpZGVyOiBLdWJlcm5ldGVzUHJvdmlkZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIHByb3ZpZGVyLmNvbmZpZy5fc3lzdGVtID09PSBzeXN0ZW1TeW1ib2xcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFN5c3RlbUdhcmRlbihwcm92aWRlcjogS3ViZXJuZXRlc1Byb3ZpZGVyKTogUHJvbWlzZTxHYXJkZW4+IHtcbiAgcmV0dXJuIEdhcmRlbi5mYWN0b3J5KHN5c3RlbVByb2plY3RQYXRoLCB7XG4gICAgZW52OiBcImRlZmF1bHRcIixcbiAgICBjb25maWc6IHtcbiAgICAgIHZlcnNpb246IFwiMFwiLFxuICAgICAgZGlybmFtZTogXCJzeXN0ZW1cIixcbiAgICAgIHBhdGg6IHN5c3RlbVByb2plY3RQYXRoLFxuICAgICAgcHJvamVjdDoge1xuICAgICAgICBuYW1lOiBcImdhcmRlbi1zeXN0ZW1cIixcbiAgICAgICAgZW52aXJvbm1lbnREZWZhdWx0czoge1xuICAgICAgICAgIHByb3ZpZGVyczogW10sXG4gICAgICAgICAgdmFyaWFibGVzOiB7fSxcbiAgICAgICAgfSxcbiAgICAgICAgZGVmYXVsdEVudmlyb25tZW50OiBcImRlZmF1bHRcIixcbiAgICAgICAgZW52aXJvbm1lbnRzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogXCJkZWZhdWx0XCIsXG4gICAgICAgICAgICBwcm92aWRlcnM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6IFwibG9jYWwta3ViZXJuZXRlc1wiLFxuICAgICAgICAgICAgICAgIGNvbnRleHQ6IHByb3ZpZGVyLmNvbmZpZy5jb250ZXh0LFxuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogR0FSREVOX1NZU1RFTV9OQU1FU1BBQ0UsXG4gICAgICAgICAgICAgICAgX3N5c3RlbTogc3lzdGVtU3ltYm9sLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHZhcmlhYmxlczoge30sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSlcbn1cbiJdfQ==
