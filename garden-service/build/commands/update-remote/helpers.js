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
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const util_1 = require("../../util/util");
const ext_source_util_1 = require("../../util/ext-source-util");
function pruneRemoteSources({ projectRoot, sources, type }) {
    return __awaiter(this, void 0, void 0, function* () {
        const remoteSourcesPath = path_1.join(projectRoot, ext_source_util_1.getRemoteSourcesDirname(type));
        if (!(yield fs_extra_1.pathExists(remoteSourcesPath))) {
            return;
        }
        const sourceNames = sources
            .map(({ name, repositoryUrl: url }) => ext_source_util_1.getRemoteSourcePath({ name, url, sourceType: type }))
            .map(srcPath => path_1.basename(srcPath));
        const currentRemoteSources = yield util_1.getChildDirNames(remoteSourcesPath);
        const staleRemoteSources = lodash_1.difference(currentRemoteSources, sourceNames);
        for (const dirName of staleRemoteSources) {
            yield fs_extra_1.remove(path_1.join(remoteSourcesPath, dirName));
        }
    });
}
exports.pruneRemoteSources = pruneRemoteSources;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VwZGF0ZS1yZW1vdGUvaGVscGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBRUgsbUNBQW1DO0FBQ25DLCtCQUFxQztBQUNyQyx1Q0FBNkM7QUFFN0MsMENBQWtEO0FBQ2xELGdFQUltQztBQUduQyxTQUFzQixrQkFBa0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUlwRTs7UUFDQyxNQUFNLGlCQUFpQixHQUFHLFdBQUksQ0FBQyxXQUFXLEVBQUUseUNBQXVCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUUxRSxJQUFJLENBQUMsQ0FBQyxNQUFNLHFCQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxFQUFFO1lBQzFDLE9BQU07U0FDUDtRQUVELE1BQU0sV0FBVyxHQUFHLE9BQU87YUFDeEIsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsYUFBYSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxxQ0FBbUIsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7YUFDM0YsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsZUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUE7UUFFcEMsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLHVCQUFnQixDQUFDLGlCQUFpQixDQUFDLENBQUE7UUFDdEUsTUFBTSxrQkFBa0IsR0FBRyxtQkFBVSxDQUFDLG9CQUFvQixFQUFFLFdBQVcsQ0FBQyxDQUFBO1FBRXhFLEtBQUssTUFBTSxPQUFPLElBQUksa0JBQWtCLEVBQUU7WUFDeEMsTUFBTSxpQkFBTSxDQUFDLFdBQUksQ0FBQyxpQkFBaUIsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFBO1NBQy9DO0lBQ0gsQ0FBQztDQUFBO0FBckJELGdEQXFCQyIsImZpbGUiOiJjb21tYW5kcy91cGRhdGUtcmVtb3RlL2hlbHBlcnMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgZGlmZmVyZW5jZSB9IGZyb20gXCJsb2Rhc2hcIlxuaW1wb3J0IHsgam9pbiwgYmFzZW5hbWUgfSBmcm9tIFwicGF0aFwiXG5pbXBvcnQgeyByZW1vdmUsIHBhdGhFeGlzdHMgfSBmcm9tIFwiZnMtZXh0cmFcIlxuXG5pbXBvcnQgeyBnZXRDaGlsZERpck5hbWVzIH0gZnJvbSBcIi4uLy4uL3V0aWwvdXRpbFwiXG5pbXBvcnQge1xuICBFeHRlcm5hbFNvdXJjZVR5cGUsXG4gIGdldFJlbW90ZVNvdXJjZXNEaXJuYW1lLFxuICBnZXRSZW1vdGVTb3VyY2VQYXRoLFxufSBmcm9tIFwiLi4vLi4vdXRpbC9leHQtc291cmNlLXV0aWxcIlxuaW1wb3J0IHsgU291cmNlQ29uZmlnIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9wcm9qZWN0XCJcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBydW5lUmVtb3RlU291cmNlcyh7IHByb2plY3RSb290LCBzb3VyY2VzLCB0eXBlIH06IHtcbiAgcHJvamVjdFJvb3Q6IHN0cmluZyxcbiAgc291cmNlczogU291cmNlQ29uZmlnW10sXG4gIHR5cGU6IEV4dGVybmFsU291cmNlVHlwZSxcbn0pIHtcbiAgY29uc3QgcmVtb3RlU291cmNlc1BhdGggPSBqb2luKHByb2plY3RSb290LCBnZXRSZW1vdGVTb3VyY2VzRGlybmFtZSh0eXBlKSlcblxuICBpZiAoIShhd2FpdCBwYXRoRXhpc3RzKHJlbW90ZVNvdXJjZXNQYXRoKSkpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIGNvbnN0IHNvdXJjZU5hbWVzID0gc291cmNlc1xuICAgIC5tYXAoKHsgbmFtZSwgcmVwb3NpdG9yeVVybDogdXJsIH0pID0+IGdldFJlbW90ZVNvdXJjZVBhdGgoeyBuYW1lLCB1cmwsIHNvdXJjZVR5cGU6IHR5cGUgfSkpXG4gICAgLm1hcChzcmNQYXRoID0+IGJhc2VuYW1lKHNyY1BhdGgpKVxuXG4gIGNvbnN0IGN1cnJlbnRSZW1vdGVTb3VyY2VzID0gYXdhaXQgZ2V0Q2hpbGREaXJOYW1lcyhyZW1vdGVTb3VyY2VzUGF0aClcbiAgY29uc3Qgc3RhbGVSZW1vdGVTb3VyY2VzID0gZGlmZmVyZW5jZShjdXJyZW50UmVtb3RlU291cmNlcywgc291cmNlTmFtZXMpXG5cbiAgZm9yIChjb25zdCBkaXJOYW1lIG9mIHN0YWxlUmVtb3RlU291cmNlcykge1xuICAgIGF3YWl0IHJlbW92ZShqb2luKHJlbW90ZVNvdXJjZXNQYXRoLCBkaXJOYW1lKSlcbiAgfVxufVxuIl19
