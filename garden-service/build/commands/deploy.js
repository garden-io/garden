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
const base_1 = require("./base");
const deploy_1 = require("../tasks/deploy");
const process_1 = require("../process");
const util_1 = require("../util/util");
const deployArgs = {
    service: new base_1.StringsParameter({
        help: "The name of the service(s) to deploy (skip to deploy all services). " +
            "Use comma as separator to specify multiple services.",
    }),
};
const deployOpts = {
    force: new base_1.BooleanParameter({ help: "Force redeploy of service(s)." }),
    "force-build": new base_1.BooleanParameter({ help: "Force rebuild of module(s)." }),
    watch: new base_1.BooleanParameter({ help: "Watch for changes in module(s) and auto-deploy.", alias: "w" }),
};
class DeployCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "deploy";
        this.help = "Deploy service(s) to your environment.";
        this.description = `
    Deploys all or specified services, taking into account service dependency order.
    Also builds modules and dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys services if their module source
    (or their dependencies' sources) change.

    Examples:

        garden deploy              # deploy all modules in the project
        garden deploy my-service   # only deploy my-service
        garden deploy --force      # force re-deploy of modules, even if they're already deployed
        garden deploy --watch      # watch for changes to code
        garden deploy --env stage  # deploy your services to an environment called stage
  `;
        this.arguments = deployArgs;
        this.options = deployOpts;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            const services = yield garden.getServices(args.service);
            const serviceNames = util_1.getNames(services);
            if (services.length === 0) {
                garden.log.warn({ msg: "No services found. Aborting." });
                return { result: {} };
            }
            garden.log.header({ emoji: "rocket", command: "Deploy" });
            // TODO: make this a task
            yield garden.actions.prepareEnvironment({});
            const results = yield process_1.processServices({
                garden,
                services,
                watch: opts.watch,
                handler: (module) => __awaiter(this, void 0, void 0, function* () {
                    return deploy_1.getDeployTasks({
                        garden,
                        module,
                        serviceNames,
                        force: opts.force,
                        forceBuild: opts["force-build"],
                        includeDependants: false,
                    });
                }),
                changeHandler: (module) => __awaiter(this, void 0, void 0, function* () {
                    return deploy_1.getDeployTasks({
                        garden,
                        module,
                        serviceNames,
                        force: true,
                        forceBuild: true,
                        includeDependants: true,
                    });
                }),
            });
            return base_1.handleTaskResults(garden, "deploy", results);
        });
    }
}
exports.DeployCommand = DeployCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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dXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQge1xuICBCb29sZWFuUGFyYW1ldGVyLFxuICBDb21tYW5kLFxuICBDb21tYW5kUGFyYW1zLFxuICBDb21tYW5kUmVzdWx0LFxuICBoYW5kbGVUYXNrUmVzdWx0cyxcbiAgU3RyaW5nc1BhcmFtZXRlcixcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgeyBnZXREZXBsb3lUYXNrcyB9IGZyb20gXCIuLi90YXNrcy9kZXBsb3lcIlxuaW1wb3J0IHsgVGFza1Jlc3VsdHMgfSBmcm9tIFwiLi4vdGFzay1ncmFwaFwiXG5pbXBvcnQgeyBwcm9jZXNzU2VydmljZXMgfSBmcm9tIFwiLi4vcHJvY2Vzc1wiXG5pbXBvcnQgeyBnZXROYW1lcyB9IGZyb20gXCIuLi91dGlsL3V0aWxcIlxuXG5jb25zdCBkZXBsb3lBcmdzID0ge1xuICBzZXJ2aWNlOiBuZXcgU3RyaW5nc1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJUaGUgbmFtZSBvZiB0aGUgc2VydmljZShzKSB0byBkZXBsb3kgKHNraXAgdG8gZGVwbG95IGFsbCBzZXJ2aWNlcykuIFwiICtcbiAgICAgIFwiVXNlIGNvbW1hIGFzIHNlcGFyYXRvciB0byBzcGVjaWZ5IG11bHRpcGxlIHNlcnZpY2VzLlwiLFxuICB9KSxcbn1cblxuY29uc3QgZGVwbG95T3B0cyA9IHtcbiAgZm9yY2U6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJGb3JjZSByZWRlcGxveSBvZiBzZXJ2aWNlKHMpLlwiIH0pLFxuICBcImZvcmNlLWJ1aWxkXCI6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJGb3JjZSByZWJ1aWxkIG9mIG1vZHVsZShzKS5cIiB9KSxcbiAgd2F0Y2g6IG5ldyBCb29sZWFuUGFyYW1ldGVyKHsgaGVscDogXCJXYXRjaCBmb3IgY2hhbmdlcyBpbiBtb2R1bGUocykgYW5kIGF1dG8tZGVwbG95LlwiLCBhbGlhczogXCJ3XCIgfSksXG59XG5cbnR5cGUgQXJncyA9IHR5cGVvZiBkZXBsb3lBcmdzXG50eXBlIE9wdHMgPSB0eXBlb2YgZGVwbG95T3B0c1xuXG5leHBvcnQgY2xhc3MgRGVwbG95Q29tbWFuZCBleHRlbmRzIENvbW1hbmQ8QXJncywgT3B0cz4ge1xuICBuYW1lID0gXCJkZXBsb3lcIlxuICBoZWxwID0gXCJEZXBsb3kgc2VydmljZShzKSB0byB5b3VyIGVudmlyb25tZW50LlwiXG5cbiAgZGVzY3JpcHRpb24gPSBgXG4gICAgRGVwbG95cyBhbGwgb3Igc3BlY2lmaWVkIHNlcnZpY2VzLCB0YWtpbmcgaW50byBhY2NvdW50IHNlcnZpY2UgZGVwZW5kZW5jeSBvcmRlci5cbiAgICBBbHNvIGJ1aWxkcyBtb2R1bGVzIGFuZCBkZXBlbmRlbmNpZXMgaWYgbmVlZGVkLlxuXG4gICAgT3B0aW9uYWxseSBzdGF5cyBydW5uaW5nIGFuZCBhdXRvbWF0aWNhbGx5IHJlLWJ1aWxkcyBhbmQgcmUtZGVwbG95cyBzZXJ2aWNlcyBpZiB0aGVpciBtb2R1bGUgc291cmNlXG4gICAgKG9yIHRoZWlyIGRlcGVuZGVuY2llcycgc291cmNlcykgY2hhbmdlLlxuXG4gICAgRXhhbXBsZXM6XG5cbiAgICAgICAgZ2FyZGVuIGRlcGxveSAgICAgICAgICAgICAgIyBkZXBsb3kgYWxsIG1vZHVsZXMgaW4gdGhlIHByb2plY3RcbiAgICAgICAgZ2FyZGVuIGRlcGxveSBteS1zZXJ2aWNlICAgIyBvbmx5IGRlcGxveSBteS1zZXJ2aWNlXG4gICAgICAgIGdhcmRlbiBkZXBsb3kgLS1mb3JjZSAgICAgICMgZm9yY2UgcmUtZGVwbG95IG9mIG1vZHVsZXMsIGV2ZW4gaWYgdGhleSdyZSBhbHJlYWR5IGRlcGxveWVkXG4gICAgICAgIGdhcmRlbiBkZXBsb3kgLS13YXRjaCAgICAgICMgd2F0Y2ggZm9yIGNoYW5nZXMgdG8gY29kZVxuICAgICAgICBnYXJkZW4gZGVwbG95IC0tZW52IHN0YWdlICAjIGRlcGxveSB5b3VyIHNlcnZpY2VzIHRvIGFuIGVudmlyb25tZW50IGNhbGxlZCBzdGFnZVxuICBgXG5cbiAgYXJndW1lbnRzID0gZGVwbG95QXJnc1xuICBvcHRpb25zID0gZGVwbG95T3B0c1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PFRhc2tSZXN1bHRzPj4ge1xuICAgIGNvbnN0IHNlcnZpY2VzID0gYXdhaXQgZ2FyZGVuLmdldFNlcnZpY2VzKGFyZ3Muc2VydmljZSlcbiAgICBjb25zdCBzZXJ2aWNlTmFtZXMgPSBnZXROYW1lcyhzZXJ2aWNlcylcblxuICAgIGlmIChzZXJ2aWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGdhcmRlbi5sb2cud2Fybih7IG1zZzogXCJObyBzZXJ2aWNlcyBmb3VuZC4gQWJvcnRpbmcuXCIgfSlcbiAgICAgIHJldHVybiB7IHJlc3VsdDoge30gfVxuICAgIH1cblxuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwicm9ja2V0XCIsIGNvbW1hbmQ6IFwiRGVwbG95XCIgfSlcblxuICAgIC8vIFRPRE86IG1ha2UgdGhpcyBhIHRhc2tcbiAgICBhd2FpdCBnYXJkZW4uYWN0aW9ucy5wcmVwYXJlRW52aXJvbm1lbnQoe30pXG5cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgcHJvY2Vzc1NlcnZpY2VzKHtcbiAgICAgIGdhcmRlbixcbiAgICAgIHNlcnZpY2VzLFxuICAgICAgd2F0Y2g6IG9wdHMud2F0Y2gsXG4gICAgICBoYW5kbGVyOiBhc3luYyAobW9kdWxlKSA9PiBnZXREZXBsb3lUYXNrcyh7XG4gICAgICAgIGdhcmRlbixcbiAgICAgICAgbW9kdWxlLFxuICAgICAgICBzZXJ2aWNlTmFtZXMsXG4gICAgICAgIGZvcmNlOiBvcHRzLmZvcmNlLFxuICAgICAgICBmb3JjZUJ1aWxkOiBvcHRzW1wiZm9yY2UtYnVpbGRcIl0sXG4gICAgICAgIGluY2x1ZGVEZXBlbmRhbnRzOiBmYWxzZSxcbiAgICAgIH0pLFxuICAgICAgY2hhbmdlSGFuZGxlcjogYXN5bmMgKG1vZHVsZSkgPT4gZ2V0RGVwbG95VGFza3Moe1xuICAgICAgICBnYXJkZW4sXG4gICAgICAgIG1vZHVsZSxcbiAgICAgICAgc2VydmljZU5hbWVzLFxuICAgICAgICBmb3JjZTogdHJ1ZSxcbiAgICAgICAgZm9yY2VCdWlsZDogdHJ1ZSxcbiAgICAgICAgaW5jbHVkZURlcGVuZGFudHM6IHRydWUsXG4gICAgICB9KSxcbiAgICB9KVxuXG4gICAgcmV0dXJuIGhhbmRsZVRhc2tSZXN1bHRzKGdhcmRlbiwgXCJkZXBsb3lcIiwgcmVzdWx0cylcbiAgfVxufVxuIl19
