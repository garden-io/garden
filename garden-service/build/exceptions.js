"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
class GardenBaseError extends Error {
    constructor(message, detail) {
        super(message);
        this.detail = detail;
    }
}
exports.GardenBaseError = GardenBaseError;
function toGardenError(err) {
    if (err instanceof GardenBaseError) {
        return err;
    }
    else {
        const out = new RuntimeError(err.message, {});
        out.stack = err.stack;
        return out;
    }
}
exports.toGardenError = toGardenError;
class AuthenticationError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "authentication";
    }
}
exports.AuthenticationError = AuthenticationError;
class ConfigurationError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "configuration";
    }
}
exports.ConfigurationError = ConfigurationError;
class LocalConfigError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "local-config";
    }
}
exports.LocalConfigError = LocalConfigError;
class ValidationError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "validation";
    }
}
exports.ValidationError = ValidationError;
class PluginError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "plugin";
    }
}
exports.PluginError = PluginError;
class ParameterError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "parameter";
    }
}
exports.ParameterError = ParameterError;
class NotImplementedError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "not-implemented";
    }
}
exports.NotImplementedError = NotImplementedError;
class DeploymentError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "deployment";
    }
}
exports.DeploymentError = DeploymentError;
class RuntimeError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "runtime";
    }
}
exports.RuntimeError = RuntimeError;
class InternalError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "internal";
    }
}
exports.InternalError = InternalError;
class TimeoutError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "timeout";
    }
}
exports.TimeoutError = TimeoutError;
class NotFoundError extends GardenBaseError {
    constructor() {
        super(...arguments);
        this.type = "not-found";
    }
}
exports.NotFoundError = NotFoundError;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImV4Y2VwdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7QUFTSCxNQUFzQixlQUFnQixTQUFRLEtBQUs7SUFJakQsWUFBWSxPQUFlLEVBQUUsTUFBYztRQUN6QyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUE7UUFDZCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQTtJQUN0QixDQUFDO0NBQ0Y7QUFSRCwwQ0FRQztBQUVELFNBQWdCLGFBQWEsQ0FBQyxHQUF3QjtJQUNwRCxJQUFJLEdBQUcsWUFBWSxlQUFlLEVBQUU7UUFDbEMsT0FBTyxHQUFHLENBQUE7S0FDWDtTQUFNO1FBQ0wsTUFBTSxHQUFHLEdBQUcsSUFBSSxZQUFZLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQTtRQUM3QyxHQUFHLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUE7UUFDckIsT0FBTyxHQUFHLENBQUE7S0FDWDtBQUNILENBQUM7QUFSRCxzQ0FRQztBQUVELE1BQWEsbUJBQW9CLFNBQVEsZUFBZTtJQUF4RDs7UUFDRSxTQUFJLEdBQUcsZ0JBQWdCLENBQUE7SUFDekIsQ0FBQztDQUFBO0FBRkQsa0RBRUM7QUFFRCxNQUFhLGtCQUFtQixTQUFRLGVBQWU7SUFBdkQ7O1FBQ0UsU0FBSSxHQUFHLGVBQWUsQ0FBQTtJQUN4QixDQUFDO0NBQUE7QUFGRCxnREFFQztBQUVELE1BQWEsZ0JBQWlCLFNBQVEsZUFBZTtJQUFyRDs7UUFDRSxTQUFJLEdBQUcsY0FBYyxDQUFBO0lBQ3ZCLENBQUM7Q0FBQTtBQUZELDRDQUVDO0FBRUQsTUFBYSxlQUFnQixTQUFRLGVBQWU7SUFBcEQ7O1FBQ0UsU0FBSSxHQUFHLFlBQVksQ0FBQTtJQUNyQixDQUFDO0NBQUE7QUFGRCwwQ0FFQztBQUVELE1BQWEsV0FBWSxTQUFRLGVBQWU7SUFBaEQ7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtJQUNqQixDQUFDO0NBQUE7QUFGRCxrQ0FFQztBQUVELE1BQWEsY0FBZSxTQUFRLGVBQWU7SUFBbkQ7O1FBQ0UsU0FBSSxHQUFHLFdBQVcsQ0FBQTtJQUNwQixDQUFDO0NBQUE7QUFGRCx3Q0FFQztBQUVELE1BQWEsbUJBQW9CLFNBQVEsZUFBZTtJQUF4RDs7UUFDRSxTQUFJLEdBQUcsaUJBQWlCLENBQUE7SUFDMUIsQ0FBQztDQUFBO0FBRkQsa0RBRUM7QUFFRCxNQUFhLGVBQWdCLFNBQVEsZUFBZTtJQUFwRDs7UUFDRSxTQUFJLEdBQUcsWUFBWSxDQUFBO0lBQ3JCLENBQUM7Q0FBQTtBQUZELDBDQUVDO0FBRUQsTUFBYSxZQUFhLFNBQVEsZUFBZTtJQUFqRDs7UUFDRSxTQUFJLEdBQUcsU0FBUyxDQUFBO0lBQ2xCLENBQUM7Q0FBQTtBQUZELG9DQUVDO0FBRUQsTUFBYSxhQUFjLFNBQVEsZUFBZTtJQUFsRDs7UUFDRSxTQUFJLEdBQUcsVUFBVSxDQUFBO0lBQ25CLENBQUM7Q0FBQTtBQUZELHNDQUVDO0FBRUQsTUFBYSxZQUFhLFNBQVEsZUFBZTtJQUFqRDs7UUFDRSxTQUFJLEdBQUcsU0FBUyxDQUFBO0lBQ2xCLENBQUM7Q0FBQTtBQUZELG9DQUVDO0FBRUQsTUFBYSxhQUFjLFNBQVEsZUFBZTtJQUFsRDs7UUFDRSxTQUFJLEdBQUcsV0FBVyxDQUFBO0lBQ3BCLENBQUM7Q0FBQTtBQUZELHNDQUVDIiwiZmlsZSI6ImV4Y2VwdGlvbnMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuZXhwb3J0IGludGVyZmFjZSBHYXJkZW5FcnJvciB7XG4gIHR5cGU6IHN0cmluZ1xuICBtZXNzYWdlOiBzdHJpbmdcbiAgZGV0YWlsPzogYW55XG4gIHN0YWNrPzogc3RyaW5nXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBHYXJkZW5CYXNlRXJyb3IgZXh0ZW5kcyBFcnJvciBpbXBsZW1lbnRzIEdhcmRlbkVycm9yIHtcbiAgYWJzdHJhY3QgdHlwZTogc3RyaW5nXG4gIGRldGFpbDogYW55XG5cbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCBkZXRhaWw6IG9iamVjdCkge1xuICAgIHN1cGVyKG1lc3NhZ2UpXG4gICAgdGhpcy5kZXRhaWwgPSBkZXRhaWxcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9HYXJkZW5FcnJvcihlcnI6IEVycm9yIHwgR2FyZGVuRXJyb3IpOiBHYXJkZW5FcnJvciB7XG4gIGlmIChlcnIgaW5zdGFuY2VvZiBHYXJkZW5CYXNlRXJyb3IpIHtcbiAgICByZXR1cm4gZXJyXG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgb3V0ID0gbmV3IFJ1bnRpbWVFcnJvcihlcnIubWVzc2FnZSwge30pXG4gICAgb3V0LnN0YWNrID0gZXJyLnN0YWNrXG4gICAgcmV0dXJuIG91dFxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRoZW50aWNhdGlvbkVycm9yIGV4dGVuZHMgR2FyZGVuQmFzZUVycm9yIHtcbiAgdHlwZSA9IFwiYXV0aGVudGljYXRpb25cIlxufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbkVycm9yIGV4dGVuZHMgR2FyZGVuQmFzZUVycm9yIHtcbiAgdHlwZSA9IFwiY29uZmlndXJhdGlvblwiXG59XG5cbmV4cG9ydCBjbGFzcyBMb2NhbENvbmZpZ0Vycm9yIGV4dGVuZHMgR2FyZGVuQmFzZUVycm9yIHtcbiAgdHlwZSA9IFwibG9jYWwtY29uZmlnXCJcbn1cblxuZXhwb3J0IGNsYXNzIFZhbGlkYXRpb25FcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcInZhbGlkYXRpb25cIlxufVxuXG5leHBvcnQgY2xhc3MgUGx1Z2luRXJyb3IgZXh0ZW5kcyBHYXJkZW5CYXNlRXJyb3Ige1xuICB0eXBlID0gXCJwbHVnaW5cIlxufVxuXG5leHBvcnQgY2xhc3MgUGFyYW1ldGVyRXJyb3IgZXh0ZW5kcyBHYXJkZW5CYXNlRXJyb3Ige1xuICB0eXBlID0gXCJwYXJhbWV0ZXJcIlxufVxuXG5leHBvcnQgY2xhc3MgTm90SW1wbGVtZW50ZWRFcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcIm5vdC1pbXBsZW1lbnRlZFwiXG59XG5cbmV4cG9ydCBjbGFzcyBEZXBsb3ltZW50RXJyb3IgZXh0ZW5kcyBHYXJkZW5CYXNlRXJyb3Ige1xuICB0eXBlID0gXCJkZXBsb3ltZW50XCJcbn1cblxuZXhwb3J0IGNsYXNzIFJ1bnRpbWVFcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcInJ1bnRpbWVcIlxufVxuXG5leHBvcnQgY2xhc3MgSW50ZXJuYWxFcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcImludGVybmFsXCJcbn1cblxuZXhwb3J0IGNsYXNzIFRpbWVvdXRFcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcInRpbWVvdXRcIlxufVxuXG5leHBvcnQgY2xhc3MgTm90Rm91bmRFcnJvciBleHRlbmRzIEdhcmRlbkJhc2VFcnJvciB7XG4gIHR5cGUgPSBcIm5vdC1mb3VuZFwiXG59XG4iXX0=
