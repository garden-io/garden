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
const base_1 = require("./base");
const exceptions_1 = require("../exceptions");
const dedent = require("dedent");
class DeleteCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "delete";
        this.alias = "del";
        this.help = "Delete configuration or objects.";
        this.subCommands = [
            DeleteSecretCommand,
            DeleteEnvironmentCommand,
            DeleteServiceCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.DeleteCommand = DeleteCommand;
const deleteSecretArgs = {
    provider: new base_1.StringParameter({
        help: "The name of the provider to remove the secret from.",
        required: true,
    }),
    key: new base_1.StringParameter({
        help: "The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).",
        required: true,
    }),
};
class DeleteSecretCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "secret";
        this.help = "Delete a secret from the environment.";
        this.description = dedent `
    Returns with an error if the provided key could not be found by the provider.

    Examples:

        garden delete secret kubernetes somekey
        garden del secret local-kubernetes some-other-key
  `;
        this.arguments = deleteSecretArgs;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = args.key;
            const result = yield garden.actions.deleteSecret({ pluginName: args.provider, key });
            if (result.found) {
                garden.log.info(`Deleted config key ${args.key}`);
            }
            else {
                throw new exceptions_1.NotFoundError(`Could not find config key ${args.key}`, { key });
            }
            return { result };
        });
    }
}
exports.DeleteSecretCommand = DeleteSecretCommand;
class DeleteEnvironmentCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "environment";
        this.alias = "env";
        this.help = "Deletes a running environment.";
        this.description = dedent `
    This will trigger providers to clear up any deployments in a Garden environment and reset it.
    When you then run \`garden init\`, the environment will be reconfigured.

    This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
    resources.
  `;
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            const { name } = garden.environment;
            garden.log.header({ emoji: "skull_and_crossbones", command: `Deleting ${name} environment` });
            const result = yield garden.actions.cleanupEnvironment({});
            garden.log.finish();
            return { result };
        });
    }
}
exports.DeleteEnvironmentCommand = DeleteEnvironmentCommand;
const deleteServiceArgs = {
    service: new base_1.StringsParameter({
        help: "The name of the service(s) to delete. Use comma as separator to specify multiple services.",
        required: true,
    }),
};
class DeleteServiceCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "service";
        this.help = "Deletes a running service.";
        this.arguments = deleteServiceArgs;
        this.description = dedent `
    Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
    services depending on the deleted service, and might therefore leave the project in an unstable state.
    Running \`garden deploy\` will re-deploy any missing services.

    Examples:

        garden delete service my-service # deletes my-service
  `;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const services = yield garden.getServices(args.service);
            if (services.length === 0) {
                garden.log.warn({ msg: "No services found. Aborting." });
                return { result: {} };
            }
            garden.log.header({ emoji: "skull_and_crossbones", command: `Delete service` });
            const result = {};
            yield Bluebird.map(services, (service) => __awaiter(this, void 0, void 0, function* () {
                result[service.name] = yield garden.actions.deleteService({ service });
            }));
            garden.log.finish();
            return { result };
        });
    }
}
exports.DeleteServiceCommand = DeleteServiceCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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TSxFQUFFLENBQUE7UUFDbkIsQ0FBQztLQUFBO0NBQ0Y7QUFsQ0Qsb0RBa0NDIiwiZmlsZSI6ImNvbW1hbmRzL2RlbGV0ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBCbHVlYmlyZCBmcm9tIFwiYmx1ZWJpcmRcIlxuaW1wb3J0IHtcbiAgRGVsZXRlU2VjcmV0UmVzdWx0LFxuICBFbnZpcm9ubWVudFN0YXR1c01hcCxcbn0gZnJvbSBcIi4uL3R5cGVzL3BsdWdpbi9vdXRwdXRzXCJcbmltcG9ydCB7XG4gIENvbW1hbmQsXG4gIENvbW1hbmRSZXN1bHQsXG4gIENvbW1hbmRQYXJhbXMsXG4gIFN0cmluZ1BhcmFtZXRlcixcbiAgU3RyaW5nc1BhcmFtZXRlcixcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgeyBOb3RGb3VuZEVycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcbmltcG9ydCB7IFNlcnZpY2VTdGF0dXMgfSBmcm9tIFwiLi4vdHlwZXMvc2VydmljZVwiXG5cbmV4cG9ydCBjbGFzcyBEZWxldGVDb21tYW5kIGV4dGVuZHMgQ29tbWFuZCB7XG4gIG5hbWUgPSBcImRlbGV0ZVwiXG4gIGFsaWFzID0gXCJkZWxcIlxuICBoZWxwID0gXCJEZWxldGUgY29uZmlndXJhdGlvbiBvciBvYmplY3RzLlwiXG5cbiAgc3ViQ29tbWFuZHMgPSBbXG4gICAgRGVsZXRlU2VjcmV0Q29tbWFuZCxcbiAgICBEZWxldGVFbnZpcm9ubWVudENvbW1hbmQsXG4gICAgRGVsZXRlU2VydmljZUNvbW1hbmQsXG4gIF1cblxuICBhc3luYyBhY3Rpb24oKSB7IHJldHVybiB7fSB9XG59XG5cbmNvbnN0IGRlbGV0ZVNlY3JldEFyZ3MgPSB7XG4gIHByb3ZpZGVyOiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIlRoZSBuYW1lIG9mIHRoZSBwcm92aWRlciB0byByZW1vdmUgdGhlIHNlY3JldCBmcm9tLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbiAga2V5OiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIlRoZSBrZXkgb2YgdGhlIGNvbmZpZ3VyYXRpb24gdmFyaWFibGUuIFNlcGFyYXRlIHdpdGggZG90cyB0byBnZXQgYSBuZXN0ZWQga2V5IChlLmcuIGtleS5uZXN0ZWQpLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbn1cblxudHlwZSBEZWxldGVTZWNyZXRBcmdzID0gdHlwZW9mIGRlbGV0ZVNlY3JldEFyZ3NcblxuZXhwb3J0IGNsYXNzIERlbGV0ZVNlY3JldENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPHR5cGVvZiBkZWxldGVTZWNyZXRBcmdzPiB7XG4gIG5hbWUgPSBcInNlY3JldFwiXG4gIGhlbHAgPSBcIkRlbGV0ZSBhIHNlY3JldCBmcm9tIHRoZSBlbnZpcm9ubWVudC5cIlxuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIFJldHVybnMgd2l0aCBhbiBlcnJvciBpZiB0aGUgcHJvdmlkZWQga2V5IGNvdWxkIG5vdCBiZSBmb3VuZCBieSB0aGUgcHJvdmlkZXIuXG5cbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gZGVsZXRlIHNlY3JldCBrdWJlcm5ldGVzIHNvbWVrZXlcbiAgICAgICAgZ2FyZGVuIGRlbCBzZWNyZXQgbG9jYWwta3ViZXJuZXRlcyBzb21lLW90aGVyLWtleVxuICBgXG5cbiAgYXJndW1lbnRzID0gZGVsZXRlU2VjcmV0QXJnc1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncyB9OiBDb21tYW5kUGFyYW1zPERlbGV0ZVNlY3JldEFyZ3M+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PERlbGV0ZVNlY3JldFJlc3VsdD4+IHtcbiAgICBjb25zdCBrZXkgPSBhcmdzLmtleSFcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnYXJkZW4uYWN0aW9ucy5kZWxldGVTZWNyZXQoeyBwbHVnaW5OYW1lOiBhcmdzLnByb3ZpZGVyISwga2V5IH0pXG5cbiAgICBpZiAocmVzdWx0LmZvdW5kKSB7XG4gICAgICBnYXJkZW4ubG9nLmluZm8oYERlbGV0ZWQgY29uZmlnIGtleSAke2FyZ3Mua2V5fWApXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBOb3RGb3VuZEVycm9yKGBDb3VsZCBub3QgZmluZCBjb25maWcga2V5ICR7YXJncy5rZXl9YCwgeyBrZXkgfSlcbiAgICB9XG5cbiAgICByZXR1cm4geyByZXN1bHQgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVFbnZpcm9ubWVudENvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwiZW52aXJvbm1lbnRcIlxuICBhbGlhcyA9IFwiZW52XCJcbiAgaGVscCA9IFwiRGVsZXRlcyBhIHJ1bm5pbmcgZW52aXJvbm1lbnQuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBUaGlzIHdpbGwgdHJpZ2dlciBwcm92aWRlcnMgdG8gY2xlYXIgdXAgYW55IGRlcGxveW1lbnRzIGluIGEgR2FyZGVuIGVudmlyb25tZW50IGFuZCByZXNldCBpdC5cbiAgICBXaGVuIHlvdSB0aGVuIHJ1biBcXGBnYXJkZW4gaW5pdFxcYCwgdGhlIGVudmlyb25tZW50IHdpbGwgYmUgcmVjb25maWd1cmVkLlxuXG4gICAgVGhpcyBjYW4gYmUgdXNlZnVsIGlmIHlvdSBmaW5kIHRoZSBlbnZpcm9ubWVudCB0byBiZSBpbiBhbiBpbmNvbnNpc3RlbnQgc3RhdGUsIG9yIG5lZWQvd2FudCB0byBmcmVlIHVwXG4gICAgcmVzb3VyY2VzLlxuICBgXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuIH06IENvbW1hbmRQYXJhbXMpOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ8RW52aXJvbm1lbnRTdGF0dXNNYXA+PiB7XG4gICAgY29uc3QgeyBuYW1lIH0gPSBnYXJkZW4uZW52aXJvbm1lbnRcbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7IGVtb2ppOiBcInNrdWxsX2FuZF9jcm9zc2JvbmVzXCIsIGNvbW1hbmQ6IGBEZWxldGluZyAke25hbWV9IGVudmlyb25tZW50YCB9KVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2FyZGVuLmFjdGlvbnMuY2xlYW51cEVudmlyb25tZW50KHt9KVxuXG4gICAgZ2FyZGVuLmxvZy5maW5pc2goKVxuXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuXG5jb25zdCBkZWxldGVTZXJ2aWNlQXJncyA9IHtcbiAgc2VydmljZTogbmV3IFN0cmluZ3NQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHNlcnZpY2UocykgdG8gZGVsZXRlLiBVc2UgY29tbWEgYXMgc2VwYXJhdG9yIHRvIHNwZWNpZnkgbXVsdGlwbGUgc2VydmljZXMuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxudHlwZSBEZWxldGVTZXJ2aWNlQXJncyA9IHR5cGVvZiBkZWxldGVTZXJ2aWNlQXJnc1xuXG5leHBvcnQgY2xhc3MgRGVsZXRlU2VydmljZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcbiAgbmFtZSA9IFwic2VydmljZVwiXG4gIGhlbHAgPSBcIkRlbGV0ZXMgYSBydW5uaW5nIHNlcnZpY2UuXCJcbiAgYXJndW1lbnRzID0gZGVsZXRlU2VydmljZUFyZ3NcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBEZWxldGVzIChpLmUuIHVuLWRlcGxveXMpIHRoZSBzcGVjaWZpZWQgc2VydmljZXMuIE5vdGUgdGhhdCB0aGlzIGNvbW1hbmQgZG9lcyBub3QgdGFrZSBpbnRvIGFjY291bnQgYW55XG4gICAgc2VydmljZXMgZGVwZW5kaW5nIG9uIHRoZSBkZWxldGVkIHNlcnZpY2UsIGFuZCBtaWdodCB0aGVyZWZvcmUgbGVhdmUgdGhlIHByb2plY3QgaW4gYW4gdW5zdGFibGUgc3RhdGUuXG4gICAgUnVubmluZyBcXGBnYXJkZW4gZGVwbG95XFxgIHdpbGwgcmUtZGVwbG95IGFueSBtaXNzaW5nIHNlcnZpY2VzLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIGRlbGV0ZSBzZXJ2aWNlIG15LXNlcnZpY2UgIyBkZWxldGVzIG15LXNlcnZpY2VcbiAgYFxuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncyB9OiBDb21tYW5kUGFyYW1zPERlbGV0ZVNlcnZpY2VBcmdzPik6IFByb21pc2U8Q29tbWFuZFJlc3VsdD4ge1xuICAgIGNvbnN0IHNlcnZpY2VzID0gYXdhaXQgZ2FyZGVuLmdldFNlcnZpY2VzKGFyZ3Muc2VydmljZSlcblxuICAgIGlmIChzZXJ2aWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGdhcmRlbi5sb2cud2Fybih7IG1zZzogXCJObyBzZXJ2aWNlcyBmb3VuZC4gQWJvcnRpbmcuXCIgfSlcbiAgICAgIHJldHVybiB7IHJlc3VsdDoge30gfVxuICAgIH1cblxuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwic2t1bGxfYW5kX2Nyb3NzYm9uZXNcIiwgY29tbWFuZDogYERlbGV0ZSBzZXJ2aWNlYCB9KVxuXG4gICAgY29uc3QgcmVzdWx0OiB7IFtrZXk6IHN0cmluZ106IFNlcnZpY2VTdGF0dXMgfSA9IHt9XG5cbiAgICBhd2FpdCBCbHVlYmlyZC5tYXAoc2VydmljZXMsIGFzeW5jIHNlcnZpY2UgPT4ge1xuICAgICAgcmVzdWx0W3NlcnZpY2UubmFtZV0gPSBhd2FpdCBnYXJkZW4uYWN0aW9ucy5kZWxldGVTZXJ2aWNlKHsgc2VydmljZSB9KVxuICAgIH0pXG5cbiAgICBnYXJkZW4ubG9nLmZpbmlzaCgpXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
