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
const uuid_1 = require("uuid");
class TaskDefinitionError extends Error {
}
exports.TaskDefinitionError = TaskDefinitionError;
class Task {
    constructor(initArgs) {
        this.garden = initArgs.garden;
        this.dependencies = [];
        this.id = uuid_1.v1(); // uuidv1 is timestamp-based
        this.force = !!initArgs.force;
        this.version = initArgs.version;
    }
    getDependencies() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dependencies;
        });
    }
    getBaseKey() {
        return `${this.type}.${this.getName()}`;
    }
    getKey() {
        return `${this.getBaseKey()}.${this.id}`;
    }
}
exports.Task = Task;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInRhc2tzL2Jhc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7OztBQUlILCtCQUFtQztBQUduQyxNQUFhLG1CQUFvQixTQUFRLEtBQUs7Q0FBSTtBQUFsRCxrREFBa0Q7QUFRbEQsTUFBc0IsSUFBSTtJQVN4QixZQUFZLFFBQW9CO1FBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQTtRQUM3QixJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQTtRQUN0QixJQUFJLENBQUMsRUFBRSxHQUFHLFNBQU0sRUFBRSxDQUFBLENBQUMsNEJBQTRCO1FBQy9DLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUE7UUFDN0IsSUFBSSxDQUFDLE9BQU8sR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFBO0lBQ2pDLENBQUM7SUFFSyxlQUFlOztZQUNuQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUE7UUFDMUIsQ0FBQztLQUFBO0lBSUQsVUFBVTtRQUNSLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFBO0lBQ3pDLENBQUM7SUFFRCxNQUFNO1FBQ0osT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUE7SUFDMUMsQ0FBQztDQUtGO0FBbENELG9CQWtDQyIsImZpbGUiOiJ0YXNrcy9iYXNlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIENvcHlyaWdodCAoQykgMjAxOCBHYXJkZW4gVGVjaG5vbG9naWVzLCBJbmMuIDxpbmZvQGdhcmRlbi5pbz5cbiAqXG4gKiBUaGlzIFNvdXJjZSBDb2RlIEZvcm0gaXMgc3ViamVjdCB0byB0aGUgdGVybXMgb2YgdGhlIE1vemlsbGEgUHVibGljXG4gKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLlxuICovXG5cbmltcG9ydCB7IFRhc2tSZXN1bHRzIH0gZnJvbSBcIi4uL3Rhc2stZ3JhcGhcIlxuaW1wb3J0IHsgTW9kdWxlVmVyc2lvbiB9IGZyb20gXCIuLi92Y3MvYmFzZVwiXG5pbXBvcnQgeyB2MSBhcyB1dWlkdjEgfSBmcm9tIFwidXVpZFwiXG5pbXBvcnQgeyBHYXJkZW4gfSBmcm9tIFwiLi4vZ2FyZGVuXCJcblxuZXhwb3J0IGNsYXNzIFRhc2tEZWZpbml0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7IH1cblxuZXhwb3J0IGludGVyZmFjZSBUYXNrUGFyYW1zIHtcbiAgZ2FyZGVuOiBHYXJkZW5cbiAgZm9yY2U/OiBib29sZWFuXG4gIHZlcnNpb246IE1vZHVsZVZlcnNpb25cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFRhc2sge1xuICBhYnN0cmFjdCB0eXBlOiBzdHJpbmdcbiAgZ2FyZGVuOiBHYXJkZW5cbiAgaWQ6IHN0cmluZ1xuICBmb3JjZTogYm9vbGVhblxuICB2ZXJzaW9uOiBNb2R1bGVWZXJzaW9uXG5cbiAgZGVwZW5kZW5jaWVzOiBUYXNrW11cblxuICBjb25zdHJ1Y3Rvcihpbml0QXJnczogVGFza1BhcmFtcykge1xuICAgIHRoaXMuZ2FyZGVuID0gaW5pdEFyZ3MuZ2FyZGVuXG4gICAgdGhpcy5kZXBlbmRlbmNpZXMgPSBbXVxuICAgIHRoaXMuaWQgPSB1dWlkdjEoKSAvLyB1dWlkdjEgaXMgdGltZXN0YW1wLWJhc2VkXG4gICAgdGhpcy5mb3JjZSA9ICEhaW5pdEFyZ3MuZm9yY2VcbiAgICB0aGlzLnZlcnNpb24gPSBpbml0QXJncy52ZXJzaW9uXG4gIH1cblxuICBhc3luYyBnZXREZXBlbmRlbmNpZXMoKTogUHJvbWlzZTxUYXNrW10+IHtcbiAgICByZXR1cm4gdGhpcy5kZXBlbmRlbmNpZXNcbiAgfVxuXG4gIHByb3RlY3RlZCBhYnN0cmFjdCBnZXROYW1lKCk6IHN0cmluZ1xuXG4gIGdldEJhc2VLZXkoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7dGhpcy50eXBlfS4ke3RoaXMuZ2V0TmFtZSgpfWBcbiAgfVxuXG4gIGdldEtleSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLmdldEJhc2VLZXkoKX0uJHt0aGlzLmlkfWBcbiAgfVxuXG4gIGFic3RyYWN0IGdldERlc2NyaXB0aW9uKCk6IHN0cmluZ1xuXG4gIGFic3RyYWN0IGFzeW5jIHByb2Nlc3MoZGVwZW5kZW5jeVJlc3VsdHM6IFRhc2tSZXN1bHRzKTogUHJvbWlzZTxhbnk+XG59XG4iXX0=
