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
const exceptions_1 = require("../exceptions");
class ValidationError extends Error {
}
exports.ValidationError = ValidationError;
class Parameter {
    constructor({ help, required, alias, defaultValue, valueName, overrides, hints }) {
        this.help = help;
        this.required = required || false;
        this.alias = alias;
        this.hints = hints;
        this.defaultValue = defaultValue;
        this.valueName = valueName || "_valueType";
        this.overrides = overrides || [];
    }
    coerce(input) {
        return input;
    }
    autoComplete() {
        return __awaiter(this, void 0, void 0, function* () {
            return [];
        });
    }
}
exports.Parameter = Parameter;
class StringParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "string";
    }
    validate(input) {
        return input;
    }
}
exports.StringParameter = StringParameter;
// Separating this from StringParameter for now because we can't set the output type based on the required flag
// FIXME: Maybe use a Required<Parameter> type to enforce presence, rather that an option flag?
class StringOption extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "string";
    }
    validate(input) {
        return input;
    }
}
exports.StringOption = StringOption;
class StringsParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "array:string";
    }
    // Sywac returns [undefined] if input is empty so we coerce that into undefined.
    // This only applies to optional parameters since Sywac would throw if input is empty for a required parameter.
    coerce(input) {
        const filtered = input.filter(i => !!i);
        if (filtered.length < 1) {
            return undefined;
        }
        return filtered;
    }
    validate(input) {
        return input.split(",");
    }
}
exports.StringsParameter = StringsParameter;
class PathParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "path";
    }
    validate(input) {
        return input;
    }
}
exports.PathParameter = PathParameter;
class PathsParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "array:path";
    }
    validate(input) {
        return input.split(",");
    }
}
exports.PathsParameter = PathsParameter;
class NumberParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "number";
    }
    validate(input) {
        try {
            return parseInt(input, 10);
        }
        catch (_a) {
            throw new ValidationError(`Could not parse "${input}" as number`);
        }
    }
}
exports.NumberParameter = NumberParameter;
class ChoicesParameter extends Parameter {
    constructor(args) {
        super(args);
        this.type = "choice";
        this.choices = args.choices;
    }
    validate(input) {
        if (this.choices.includes(input)) {
            return input;
        }
        else {
            throw new ValidationError(`"${input}" is not a valid argument`);
        }
    }
    autoComplete() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.choices;
        });
    }
}
exports.ChoicesParameter = ChoicesParameter;
class BooleanParameter extends Parameter {
    constructor() {
        super(...arguments);
        this.type = "boolean";
    }
    validate(input) {
        return !!input;
    }
}
exports.BooleanParameter = BooleanParameter;
// TODO: maybe this should be a global option?
class EnvironmentOption extends StringParameter {
    constructor({ help = "The environment (and optionally namespace) to work against" } = {}) {
        super({
            help,
            required: false,
            alias: "e",
        });
    }
}
exports.EnvironmentOption = EnvironmentOption;
class Command {
    constructor(parent) {
        this.parent = parent;
        this.noProject = false;
        this.subCommands = [];
    }
    getFullName() {
        return !!this.parent ? `${this.parent.getFullName()} ${this.name}` : this.name;
    }
    describe() {
        const { name, help, description } = this;
        return {
            name,
            fullName: this.getFullName(),
            help,
            description,
            arguments: describeParameters(this.arguments),
            options: describeParameters(this.options),
        };
    }
}
exports.Command = Command;
function handleTaskResults(garden, taskType, results) {
    return __awaiter(this, void 0, void 0, function* () {
        const failed = Object.values(results.taskResults).filter(r => !!r.error).length;
        if (failed) {
            const error = new exceptions_1.RuntimeError(`${failed} ${taskType} task(s) failed!`, {
                results,
            });
            return { errors: [error] };
        }
        garden.log.info("");
        if (!results.restartRequired) {
            garden.log.header({ emoji: "heavy_check_mark", command: `Done!` });
        }
        return {
            result: results.taskResults,
            restartRequired: results.restartRequired,
        };
    });
}
exports.handleTaskResults = handleTaskResults;
function describeParameters(args) {
    if (!args) {
        return;
    }
    return Object.entries(args).map(([argName, arg]) => (Object.assign({ name: argName, usageName: arg.required ? `<${argName}>` : `[${argName}]` }, arg)));
}
exports.describeParameters = describeParameters;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFBO1FBQ25CLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFO1lBQzVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFBO1NBQ25FO1FBQ0QsT0FBTztZQUNMLE1BQU0sRUFBRSxPQUFPLENBQUMsV0FBVztZQUMzQixlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWU7U0FDekMsQ0FBQTtJQUNILENBQUM7Q0FBQTtBQXBCRCw4Q0FvQkM7QUFFRCxTQUFnQixrQkFBa0IsQ0FBQyxJQUFpQjtJQUNsRCxJQUFJLENBQUMsSUFBSSxFQUFFO1FBQUUsT0FBTTtLQUFFO0lBQ3JCLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsaUJBQ2xELElBQUksRUFBRSxPQUFPLEVBQ2IsU0FBUyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksT0FBTyxHQUFHLElBQ3RELEdBQUcsRUFDTixDQUFDLENBQUE7QUFDTCxDQUFDO0FBUEQsZ0RBT0MiLCJmaWxlIjoiY29tbWFuZHMvYmFzZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQge1xuICBHYXJkZW5FcnJvcixcbiAgUnVudGltZUVycm9yLFxufSBmcm9tIFwiLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBUYXNrUmVzdWx0cyB9IGZyb20gXCIuLi90YXNrLWdyYXBoXCJcbmltcG9ydCB7IExvZ2dlclR5cGUgfSBmcm9tIFwiLi4vbG9nZ2VyL2xvZ2dlclwiXG5pbXBvcnQgeyBQcm9jZXNzUmVzdWx0cyB9IGZyb20gXCIuLi9wcm9jZXNzXCJcbmltcG9ydCB7IEdhcmRlbiB9IGZyb20gXCIuLi9nYXJkZW5cIlxuXG5leHBvcnQgY2xhc3MgVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3IgeyB9XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyYW1ldGVyQ29uc3RydWN0b3I8VD4ge1xuICBoZWxwOiBzdHJpbmcsXG4gIHJlcXVpcmVkPzogYm9vbGVhbixcbiAgYWxpYXM/OiBzdHJpbmcsXG4gIGRlZmF1bHRWYWx1ZT86IFQsXG4gIHZhbHVlTmFtZT86IHN0cmluZyxcbiAgaGludHM/OiBzdHJpbmcsXG4gIG92ZXJyaWRlcz86IHN0cmluZ1tdLFxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUGFyYW1ldGVyPFQ+IHtcbiAgYWJzdHJhY3QgdHlwZTogc3RyaW5nXG5cbiAgX3ZhbHVlVHlwZTogVFxuXG4gIGRlZmF1bHRWYWx1ZTogVCB8IHVuZGVmaW5lZFxuICBoZWxwOiBzdHJpbmdcbiAgcmVxdWlyZWQ6IGJvb2xlYW5cbiAgYWxpYXM/OiBzdHJpbmdcbiAgaGludHM/OiBzdHJpbmdcbiAgdmFsdWVOYW1lOiBzdHJpbmdcbiAgb3ZlcnJpZGVzOiBzdHJpbmdbXVxuXG4gIGNvbnN0cnVjdG9yKHsgaGVscCwgcmVxdWlyZWQsIGFsaWFzLCBkZWZhdWx0VmFsdWUsIHZhbHVlTmFtZSwgb3ZlcnJpZGVzLCBoaW50cyB9OiBQYXJhbWV0ZXJDb25zdHJ1Y3RvcjxUPikge1xuICAgIHRoaXMuaGVscCA9IGhlbHBcbiAgICB0aGlzLnJlcXVpcmVkID0gcmVxdWlyZWQgfHwgZmFsc2VcbiAgICB0aGlzLmFsaWFzID0gYWxpYXNcbiAgICB0aGlzLmhpbnRzID0gaGludHNcbiAgICB0aGlzLmRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZVxuICAgIHRoaXMudmFsdWVOYW1lID0gdmFsdWVOYW1lIHx8IFwiX3ZhbHVlVHlwZVwiXG4gICAgdGhpcy5vdmVycmlkZXMgPSBvdmVycmlkZXMgfHwgW11cbiAgfVxuXG4gIGNvZXJjZShpbnB1dDogVCk6IFQgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiBpbnB1dFxuICB9XG5cbiAgYWJzdHJhY3QgdmFsaWRhdGUoaW5wdXQ6IHN0cmluZyk6IFRcblxuICBhc3luYyBhdXRvQ29tcGxldGUoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiBbXVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTdHJpbmdQYXJhbWV0ZXIgZXh0ZW5kcyBQYXJhbWV0ZXI8c3RyaW5nPiB7XG4gIHR5cGUgPSBcInN0cmluZ1wiXG5cbiAgdmFsaWRhdGUoaW5wdXQ6IHN0cmluZykge1xuICAgIHJldHVybiBpbnB1dFxuICB9XG59XG5cbi8vIFNlcGFyYXRpbmcgdGhpcyBmcm9tIFN0cmluZ1BhcmFtZXRlciBmb3Igbm93IGJlY2F1c2Ugd2UgY2FuJ3Qgc2V0IHRoZSBvdXRwdXQgdHlwZSBiYXNlZCBvbiB0aGUgcmVxdWlyZWQgZmxhZ1xuLy8gRklYTUU6IE1heWJlIHVzZSBhIFJlcXVpcmVkPFBhcmFtZXRlcj4gdHlwZSB0byBlbmZvcmNlIHByZXNlbmNlLCByYXRoZXIgdGhhdCBhbiBvcHRpb24gZmxhZz9cbmV4cG9ydCBjbGFzcyBTdHJpbmdPcHRpb24gZXh0ZW5kcyBQYXJhbWV0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG4gIHR5cGUgPSBcInN0cmluZ1wiXG5cbiAgdmFsaWRhdGUoaW5wdXQ/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gaW5wdXRcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU3RyaW5nc1BhcmFtZXRlciBleHRlbmRzIFBhcmFtZXRlcjxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuICB0eXBlID0gXCJhcnJheTpzdHJpbmdcIlxuXG4gIC8vIFN5d2FjIHJldHVybnMgW3VuZGVmaW5lZF0gaWYgaW5wdXQgaXMgZW1wdHkgc28gd2UgY29lcmNlIHRoYXQgaW50byB1bmRlZmluZWQuXG4gIC8vIFRoaXMgb25seSBhcHBsaWVzIHRvIG9wdGlvbmFsIHBhcmFtZXRlcnMgc2luY2UgU3l3YWMgd291bGQgdGhyb3cgaWYgaW5wdXQgaXMgZW1wdHkgZm9yIGEgcmVxdWlyZWQgcGFyYW1ldGVyLlxuICBjb2VyY2UoaW5wdXQ6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgZmlsdGVyZWQgPSBpbnB1dC5maWx0ZXIoaSA9PiAhIWkpXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA8IDEpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICB9XG4gICAgcmV0dXJuIGZpbHRlcmVkXG4gIH1cblxuICB2YWxpZGF0ZShpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGlucHV0LnNwbGl0KFwiLFwiKVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXRoUGFyYW1ldGVyIGV4dGVuZHMgUGFyYW1ldGVyPHN0cmluZz4ge1xuICB0eXBlID0gXCJwYXRoXCJcblxuICB2YWxpZGF0ZShpbnB1dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGlucHV0XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhdGhzUGFyYW1ldGVyIGV4dGVuZHMgUGFyYW1ldGVyPHN0cmluZ1tdPiB7XG4gIHR5cGUgPSBcImFycmF5OnBhdGhcIlxuXG4gIHZhbGlkYXRlKGlucHV0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gaW5wdXQuc3BsaXQoXCIsXCIpXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE51bWJlclBhcmFtZXRlciBleHRlbmRzIFBhcmFtZXRlcjxudW1iZXI+IHtcbiAgdHlwZSA9IFwibnVtYmVyXCJcblxuICB2YWxpZGF0ZShpbnB1dDogc3RyaW5nKSB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBwYXJzZUludChpbnB1dCwgMTApXG4gICAgfSBjYXRjaCB7XG4gICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKGBDb3VsZCBub3QgcGFyc2UgXCIke2lucHV0fVwiIGFzIG51bWJlcmApXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hvaWNlc0NvbnN0cnVjdG9yIGV4dGVuZHMgUGFyYW1ldGVyQ29uc3RydWN0b3I8c3RyaW5nPiB7XG4gIGNob2ljZXM6IHN0cmluZ1tdLFxufVxuXG5leHBvcnQgY2xhc3MgQ2hvaWNlc1BhcmFtZXRlciBleHRlbmRzIFBhcmFtZXRlcjxzdHJpbmc+IHtcbiAgdHlwZSA9IFwiY2hvaWNlXCJcbiAgY2hvaWNlczogc3RyaW5nW11cblxuICBjb25zdHJ1Y3RvcihhcmdzOiBDaG9pY2VzQ29uc3RydWN0b3IpIHtcbiAgICBzdXBlcihhcmdzKVxuXG4gICAgdGhpcy5jaG9pY2VzID0gYXJncy5jaG9pY2VzXG4gIH1cblxuICB2YWxpZGF0ZShpbnB1dDogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuY2hvaWNlcy5pbmNsdWRlcyhpbnB1dCkpIHtcbiAgICAgIHJldHVybiBpbnB1dFxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKGBcIiR7aW5wdXR9XCIgaXMgbm90IGEgdmFsaWQgYXJndW1lbnRgKVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGF1dG9Db21wbGV0ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jaG9pY2VzXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEJvb2xlYW5QYXJhbWV0ZXIgZXh0ZW5kcyBQYXJhbWV0ZXI8Ym9vbGVhbj4ge1xuICB0eXBlID0gXCJib29sZWFuXCJcblxuICB2YWxpZGF0ZShpbnB1dDogYW55KSB7XG4gICAgcmV0dXJuICEhaW5wdXRcbiAgfVxufVxuXG4vLyBUT0RPOiBtYXliZSB0aGlzIHNob3VsZCBiZSBhIGdsb2JhbCBvcHRpb24/XG5leHBvcnQgY2xhc3MgRW52aXJvbm1lbnRPcHRpb24gZXh0ZW5kcyBTdHJpbmdQYXJhbWV0ZXIge1xuICBjb25zdHJ1Y3Rvcih7IGhlbHAgPSBcIlRoZSBlbnZpcm9ubWVudCAoYW5kIG9wdGlvbmFsbHkgbmFtZXNwYWNlKSB0byB3b3JrIGFnYWluc3RcIiB9ID0ge30pIHtcbiAgICBzdXBlcih7XG4gICAgICBoZWxwLFxuICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgYWxpYXM6IFwiZVwiLFxuICAgIH0pXG4gIH1cbn1cblxuZXhwb3J0IHR5cGUgUGFyYW1ldGVycyA9IHsgW2tleTogc3RyaW5nXTogUGFyYW1ldGVyPGFueT4gfVxuZXhwb3J0IHR5cGUgUGFyYW1ldGVyVmFsdWVzPFQgZXh0ZW5kcyBQYXJhbWV0ZXJzPiA9IHsgW1AgaW4ga2V5b2YgVF06IFRbUF1bXCJfdmFsdWVUeXBlXCJdIH1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kQ29uc3RydWN0b3Ige1xuICBuZXcocGFyZW50PzogQ29tbWFuZCk6IENvbW1hbmRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kUmVzdWx0PFQgPSBhbnk+IHtcbiAgcmVzdWx0PzogVFxuICByZXN0YXJ0UmVxdWlyZWQ/OiBib29sZWFuXG4gIGVycm9ycz86IEdhcmRlbkVycm9yW11cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kUGFyYW1zPFQgZXh0ZW5kcyBQYXJhbWV0ZXJzID0ge30sIFUgZXh0ZW5kcyBQYXJhbWV0ZXJzID0ge30+IHtcbiAgYXJnczogUGFyYW1ldGVyVmFsdWVzPFQ+XG4gIG9wdHM6IFBhcmFtZXRlclZhbHVlczxVPlxuICBnYXJkZW46IEdhcmRlblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQ29tbWFuZDxUIGV4dGVuZHMgUGFyYW1ldGVycyA9IHt9LCBVIGV4dGVuZHMgUGFyYW1ldGVycyA9IHt9PiB7XG4gIGFic3RyYWN0IG5hbWU6IHN0cmluZ1xuICBhYnN0cmFjdCBoZWxwOiBzdHJpbmdcblxuICBkZXNjcmlwdGlvbj86IHN0cmluZ1xuXG4gIGFsaWFzPzogc3RyaW5nXG4gIGxvZ2dlclR5cGU/OiBMb2dnZXJUeXBlXG5cbiAgYXJndW1lbnRzPzogVFxuICBvcHRpb25zPzogVVxuXG4gIG5vUHJvamVjdDogYm9vbGVhbiA9IGZhbHNlXG4gIHN1YkNvbW1hbmRzOiBDb21tYW5kQ29uc3RydWN0b3JbXSA9IFtdXG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwYXJlbnQ/OiBDb21tYW5kKSB7IH1cblxuICBnZXRGdWxsTmFtZSgpIHtcbiAgICByZXR1cm4gISF0aGlzLnBhcmVudCA/IGAke3RoaXMucGFyZW50LmdldEZ1bGxOYW1lKCl9ICR7dGhpcy5uYW1lfWAgOiB0aGlzLm5hbWVcbiAgfVxuXG4gIGRlc2NyaWJlKCkge1xuICAgIGNvbnN0IHsgbmFtZSwgaGVscCwgZGVzY3JpcHRpb24gfSA9IHRoaXNcblxuICAgIHJldHVybiB7XG4gICAgICBuYW1lLFxuICAgICAgZnVsbE5hbWU6IHRoaXMuZ2V0RnVsbE5hbWUoKSxcbiAgICAgIGhlbHAsXG4gICAgICBkZXNjcmlwdGlvbixcbiAgICAgIGFyZ3VtZW50czogZGVzY3JpYmVQYXJhbWV0ZXJzKHRoaXMuYXJndW1lbnRzKSxcbiAgICAgIG9wdGlvbnM6IGRlc2NyaWJlUGFyYW1ldGVycyh0aGlzLm9wdGlvbnMpLFxuICAgIH1cbiAgfVxuXG4gIC8vIE5vdGU6IER1ZSB0byBhIGN1cnJlbnQgVFMgbGltaXRhdGlvbiAoYXBwYXJlbnRseSBjb3ZlcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvVHlwZVNjcmlwdC9pc3N1ZXMvNzAxMSksXG4gIC8vIHN1YmNsYXNzIGltcGxlbWVudGF0aW9ucyBuZWVkIHRvIGV4cGxpY2l0bHkgc2V0IHRoZSB0eXBlcyBpbiB0aGUgaW1wbGVtZW50ZWQgZnVuY3Rpb24gc2lnbmF0dXJlLiBTbyBmb3Igbm93IHdlXG4gIC8vIGNhbid0IGVuZm9yY2UgdGhlIHR5cGVzIG9mIGBhcmdzYCBhbmQgYG9wdHNgIGF1dG9tYXRpY2FsbHkgYXQgdGhlIGFic3RyYWN0IGNsYXNzIGxldmVsIGFuZCBoYXZlIHRvIHNwZWNpZnlcbiAgLy8gdGhlIHR5cGVzIGV4cGxpY2l0bHkgb24gdGhlIHN1YmNsYXNzZWQgbWV0aG9kcy5cbiAgYWJzdHJhY3QgYXN5bmMgYWN0aW9uKHBhcmFtczogQ29tbWFuZFBhcmFtczxULCBVPik6IFByb21pc2U8Q29tbWFuZFJlc3VsdD5cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVRhc2tSZXN1bHRzKFxuICBnYXJkZW46IEdhcmRlbiwgdGFza1R5cGU6IHN0cmluZywgcmVzdWx0czogUHJvY2Vzc1Jlc3VsdHMsXG4pOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8VGFza1Jlc3VsdHM+PiB7XG4gIGNvbnN0IGZhaWxlZCA9IE9iamVjdC52YWx1ZXMocmVzdWx0cy50YXNrUmVzdWx0cykuZmlsdGVyKHIgPT4gISFyLmVycm9yKS5sZW5ndGhcblxuICBpZiAoZmFpbGVkKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgUnVudGltZUVycm9yKGAke2ZhaWxlZH0gJHt0YXNrVHlwZX0gdGFzayhzKSBmYWlsZWQhYCwge1xuICAgICAgcmVzdWx0cyxcbiAgICB9KVxuICAgIHJldHVybiB7IGVycm9yczogW2Vycm9yXSB9XG4gIH1cblxuICBnYXJkZW4ubG9nLmluZm8oXCJcIilcbiAgaWYgKCFyZXN1bHRzLnJlc3RhcnRSZXF1aXJlZCkge1xuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwiaGVhdnlfY2hlY2tfbWFya1wiLCBjb21tYW5kOiBgRG9uZSFgIH0pXG4gIH1cbiAgcmV0dXJuIHtcbiAgICByZXN1bHQ6IHJlc3VsdHMudGFza1Jlc3VsdHMsXG4gICAgcmVzdGFydFJlcXVpcmVkOiByZXN1bHRzLnJlc3RhcnRSZXF1aXJlZCxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVQYXJhbWV0ZXJzKGFyZ3M/OiBQYXJhbWV0ZXJzKSB7XG4gIGlmICghYXJncykgeyByZXR1cm4gfVxuICByZXR1cm4gT2JqZWN0LmVudHJpZXMoYXJncykubWFwKChbYXJnTmFtZSwgYXJnXSkgPT4gKHtcbiAgICBuYW1lOiBhcmdOYW1lLFxuICAgIHVzYWdlTmFtZTogYXJnLnJlcXVpcmVkID8gYDwke2FyZ05hbWV9PmAgOiBgWyR7YXJnTmFtZX1dYCxcbiAgICAuLi5hcmcsXG4gIH0pKVxufVxuIl19
