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
const fs_extra_1 = require("fs-extra");
const Bluebird = require("bluebird");
const dedent = require("dedent");
const terminalLink = require("terminal-link");
const base_1 = require("../base");
const helpers_1 = require("./helpers");
const prompts_1 = require("./prompts");
const config_templates_1 = require("./config-templates");
const util_1 = require("../../util/util");
const common_1 = require("../../config/common");
const project_1 = require("../../config/project");
const createProjectOptions = {
    "module-dirs": new base_1.PathsParameter({
        help: "Relative path to modules directory. Use comma as a separator to specify multiple directories",
    }),
    name: new base_1.StringParameter({
        help: "Assigns a custom name to the project. (Defaults to name of the current directory.)",
    }),
};
const createProjectArguments = {
    "project-dir": new base_1.StringParameter({
        help: "Directory of the project. (Defaults to current directory.)",
    }),
};
const flatten = (acc, val) => acc.concat(val);
class CreateProjectCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "project";
        this.alias = "p";
        this.help = "Creates a new Garden project.";
        this.description = dedent `
    The 'create project' command walks the user through setting up a new Garden project and
    generates scaffolding based on user input.

    Examples:

        garden create project # creates a new Garden project in the current directory (project name defaults to
        directory name)
        garden create project my-project # creates a new Garden project in my-project directory
        garden create project --module-dirs=path/to/modules1,path/to/modules2
        # creates a new Garden project and looks for pre-existing modules in the modules1 and modules2 directories
        garden create project --name my-project
        # creates a new Garden project in the current directory and names it my-project
  `;
        this.noProject = true;
        this.arguments = createProjectArguments;
        this.options = createProjectOptions;
    }
    action({ garden, args, opts }) {
        return __awaiter(this, void 0, void 0, function* () {
            let moduleConfigs = [];
            let errors = [];
            const projectRoot = args["project-dir"] ? path_1.join(garden.projectRoot, args["project-dir"].trim()) : garden.projectRoot;
            const moduleParentDirs = yield Bluebird.map(opts["module-dirs"] || [], (dir) => path_1.resolve(projectRoot, dir));
            const projectName = common_1.validate(opts.name || path_1.basename(projectRoot), common_1.joiIdentifier(), { context: "project name" });
            yield fs_extra_1.ensureDir(projectRoot);
            garden.log.header({ emoji: "house_with_garden", command: "create" });
            garden.log.info(`Initializing new Garden project ${projectName}`);
            garden.log.info("---------");
            // Stop logger while prompting
            garden.log.stop();
            if (moduleParentDirs.length > 0) {
                // If module-dirs option provided we scan for modules in the parent dir(s) and add them one by one
                moduleConfigs = (yield Bluebird.mapSeries(moduleParentDirs, (parentDir) => __awaiter(this, void 0, void 0, function* () {
                    const moduleNames = yield util_1.getChildDirNames(parentDir);
                    return Bluebird.reduce(moduleNames, (acc, moduleName) => __awaiter(this, void 0, void 0, function* () {
                        const { type } = yield prompts_1.prompts.addConfigForModule(moduleName);
                        if (type) {
                            acc.push(helpers_1.prepareNewModuleConfig(moduleName, type, path_1.join(parentDir, moduleName)));
                        }
                        return acc;
                    }), []);
                })))
                    .reduce(flatten, [])
                    .filter(m => m);
            }
            else {
                // Otherwise we prompt the user for modules to add
                moduleConfigs = (yield prompts_1.prompts.repeatAddModule())
                    .map(({ name, type }) => helpers_1.prepareNewModuleConfig(name, type, path_1.join(projectRoot, name)));
            }
            garden.log.info("---------");
            const taskLog = garden.log.info({ msg: "Setting up project", status: "active" });
            for (const module of moduleConfigs) {
                yield fs_extra_1.ensureDir(module.path);
                try {
                    yield helpers_1.dumpConfig(module, config_templates_1.moduleSchema, garden.log);
                }
                catch (err) {
                    errors.push(err);
                }
            }
            const projectConfig = {
                path: projectRoot,
                name: projectName,
                config: config_templates_1.projectTemplate(projectName, moduleConfigs.map(module => module.type)),
            };
            try {
                yield helpers_1.dumpConfig(projectConfig, project_1.projectSchema, garden.log);
            }
            catch (err) {
                errors.push(err);
            }
            if (errors.length === 0) {
                taskLog.setSuccess();
            }
            else {
                taskLog.setWarn({ msg: "Finished with errors", append: true });
            }
            const docs = terminalLink("docs", "https://docs.garden.io");
            garden.log.info(`Project created! Be sure to check out our ${docs} for how to get sarted!`);
            return {
                result: {
                    moduleConfigs,
                    projectConfig,
                },
                errors,
            };
        });
    }
}
exports.CreateProjectCommand = CreateProjectCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2NyZWF0ZS9wcm9qZWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCwrQkFBOEM7QUFDOUMsdUNBQW9DO0FBQ3BDLHFDQUFxQztBQUNyQyxpQ0FBaUM7QUFDakMsOENBQThDO0FBRTlDLGtDQU1nQjtBQUVoQix1Q0FHa0I7QUFDbEIsdUNBQW1DO0FBQ25DLHlEQUsyQjtBQUMzQiwwQ0FBa0Q7QUFDbEQsZ0RBQTZEO0FBQzdELGtEQUFvRDtBQUVwRCxNQUFNLG9CQUFvQixHQUFHO0lBQzNCLGFBQWEsRUFBRSxJQUFJLHFCQUFjLENBQUM7UUFDaEMsSUFBSSxFQUFFLDhGQUE4RjtLQUNyRyxDQUFDO0lBQ0YsSUFBSSxFQUFFLElBQUksc0JBQWUsQ0FBQztRQUN4QixJQUFJLEVBQUUsb0ZBQW9GO0tBQzNGLENBQUM7Q0FDSCxDQUFBO0FBRUQsTUFBTSxzQkFBc0IsR0FBRztJQUM3QixhQUFhLEVBQUUsSUFBSSxzQkFBZSxDQUFDO1FBQ2pDLElBQUksRUFBRSw0REFBNEQ7S0FDbkUsQ0FBQztDQUNILENBQUE7QUFLRCxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUE7QUFTN0MsTUFBYSxvQkFBcUIsU0FBUSxjQUFtQjtJQUE3RDs7UUFDRSxTQUFJLEdBQUcsU0FBUyxDQUFBO1FBQ2hCLFVBQUssR0FBRyxHQUFHLENBQUE7UUFDWCxTQUFJLEdBQUcsK0JBQStCLENBQUE7UUFFdEMsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7Ozs7Ozs7Ozs7R0FhbkIsQ0FBQTtRQUVELGNBQVMsR0FBRyxJQUFJLENBQUE7UUFDaEIsY0FBUyxHQUFHLHNCQUFzQixDQUFBO1FBQ2xDLFlBQU8sR0FBRyxvQkFBb0IsQ0FBQTtJQW9GaEMsQ0FBQztJQWxGTyxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFB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eUIsQ0FBQyxDQUFBO1lBRTNGLE9BQU87Z0JBQ0wsTUFBTSxFQUFFO29CQUNOLGFBQWE7b0JBQ2IsYUFBYTtpQkFDZDtnQkFDRCxNQUFNO2FBQ1AsQ0FBQTtRQUNILENBQUM7S0FBQTtDQUNGO0FBMUdELG9EQTBHQyIsImZpbGUiOiJjb21tYW5kcy9jcmVhdGUvcHJvamVjdC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyByZXNvbHZlLCBqb2luLCBiYXNlbmFtZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCB7IGVuc3VyZURpciB9IGZyb20gXCJmcy1leHRyYVwiXG5pbXBvcnQgQmx1ZWJpcmQgPSByZXF1aXJlKFwiYmx1ZWJpcmRcIilcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgdGVybWluYWxMaW5rID0gcmVxdWlyZShcInRlcm1pbmFsLWxpbmtcIilcblxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgU3RyaW5nUGFyYW1ldGVyLFxuICBQYXRoc1BhcmFtZXRlcixcbn0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgR2FyZGVuQmFzZUVycm9yIH0gZnJvbSBcIi4uLy4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IHtcbiAgcHJlcGFyZU5ld01vZHVsZUNvbmZpZyxcbiAgZHVtcENvbmZpZyxcbn0gZnJvbSBcIi4vaGVscGVyc1wiXG5pbXBvcnQgeyBwcm9tcHRzIH0gZnJvbSBcIi4vcHJvbXB0c1wiXG5pbXBvcnQge1xuICBwcm9qZWN0VGVtcGxhdGUsXG4gIE1vZHVsZUNvbmZpZ09wdHMsXG4gIFByb2plY3RDb25maWdPcHRzLFxuICBtb2R1bGVTY2hlbWEsXG59IGZyb20gXCIuL2NvbmZpZy10ZW1wbGF0ZXNcIlxuaW1wb3J0IHsgZ2V0Q2hpbGREaXJOYW1lcyB9IGZyb20gXCIuLi8uLi91dGlsL3V0aWxcIlxuaW1wb3J0IHsgdmFsaWRhdGUsIGpvaUlkZW50aWZpZXIgfSBmcm9tIFwiLi4vLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQgeyBwcm9qZWN0U2NoZW1hIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy9wcm9qZWN0XCJcblxuY29uc3QgY3JlYXRlUHJvamVjdE9wdGlvbnMgPSB7XG4gIFwibW9kdWxlLWRpcnNcIjogbmV3IFBhdGhzUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIlJlbGF0aXZlIHBhdGggdG8gbW9kdWxlcyBkaXJlY3RvcnkuIFVzZSBjb21tYSBhcyBhIHNlcGFyYXRvciB0byBzcGVjaWZ5IG11bHRpcGxlIGRpcmVjdG9yaWVzXCIsXG4gIH0pLFxuICBuYW1lOiBuZXcgU3RyaW5nUGFyYW1ldGVyKHtcbiAgICBoZWxwOiBcIkFzc2lnbnMgYSBjdXN0b20gbmFtZSB0byB0aGUgcHJvamVjdC4gKERlZmF1bHRzIHRvIG5hbWUgb2YgdGhlIGN1cnJlbnQgZGlyZWN0b3J5LilcIixcbiAgfSksXG59XG5cbmNvbnN0IGNyZWF0ZVByb2plY3RBcmd1bWVudHMgPSB7XG4gIFwicHJvamVjdC1kaXJcIjogbmV3IFN0cmluZ1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJEaXJlY3Rvcnkgb2YgdGhlIHByb2plY3QuIChEZWZhdWx0cyB0byBjdXJyZW50IGRpcmVjdG9yeS4pXCIsXG4gIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgY3JlYXRlUHJvamVjdEFyZ3VtZW50c1xudHlwZSBPcHRzID0gdHlwZW9mIGNyZWF0ZVByb2plY3RPcHRpb25zXG5cbmNvbnN0IGZsYXR0ZW4gPSAoYWNjLCB2YWwpID0+IGFjYy5jb25jYXQodmFsKVxuXG5pbnRlcmZhY2UgQ3JlYXRlUHJvamVjdFJlc3VsdCBleHRlbmRzIENvbW1hbmRSZXN1bHQge1xuICByZXN1bHQ6IHtcbiAgICBwcm9qZWN0Q29uZmlnOiBQcm9qZWN0Q29uZmlnT3B0cyxcbiAgICBtb2R1bGVDb25maWdzOiBNb2R1bGVDb25maWdPcHRzW10sXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIENyZWF0ZVByb2plY3RDb21tYW5kIGV4dGVuZHMgQ29tbWFuZDxBcmdzLCBPcHRzPiB7XG4gIG5hbWUgPSBcInByb2plY3RcIlxuICBhbGlhcyA9IFwicFwiXG4gIGhlbHAgPSBcIkNyZWF0ZXMgYSBuZXcgR2FyZGVuIHByb2plY3QuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBUaGUgJ2NyZWF0ZSBwcm9qZWN0JyBjb21tYW5kIHdhbGtzIHRoZSB1c2VyIHRocm91Z2ggc2V0dGluZyB1cCBhIG5ldyBHYXJkZW4gcHJvamVjdCBhbmRcbiAgICBnZW5lcmF0ZXMgc2NhZmZvbGRpbmcgYmFzZWQgb24gdXNlciBpbnB1dC5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBjcmVhdGUgcHJvamVjdCAjIGNyZWF0ZXMgYSBuZXcgR2FyZGVuIHByb2plY3QgaW4gdGhlIGN1cnJlbnQgZGlyZWN0b3J5IChwcm9qZWN0IG5hbWUgZGVmYXVsdHMgdG9cbiAgICAgICAgZGlyZWN0b3J5IG5hbWUpXG4gICAgICAgIGdhcmRlbiBjcmVhdGUgcHJvamVjdCBteS1wcm9qZWN0ICMgY3JlYXRlcyBhIG5ldyBHYXJkZW4gcHJvamVjdCBpbiBteS1wcm9qZWN0IGRpcmVjdG9yeVxuICAgICAgICBnYXJkZW4gY3JlYXRlIHByb2plY3QgLS1tb2R1bGUtZGlycz1wYXRoL3RvL21vZHVsZXMxLHBhdGgvdG8vbW9kdWxlczJcbiAgICAgICAgIyBjcmVhdGVzIGEgbmV3IEdhcmRlbiBwcm9qZWN0IGFuZCBsb29rcyBmb3IgcHJlLWV4aXN0aW5nIG1vZHVsZXMgaW4gdGhlIG1vZHVsZXMxIGFuZCBtb2R1bGVzMiBkaXJlY3Rvcmllc1xuICAgICAgICBnYXJkZW4gY3JlYXRlIHByb2plY3QgLS1uYW1lIG15LXByb2plY3RcbiAgICAgICAgIyBjcmVhdGVzIGEgbmV3IEdhcmRlbiBwcm9qZWN0IGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeSBhbmQgbmFtZXMgaXQgbXktcHJvamVjdFxuICBgXG5cbiAgbm9Qcm9qZWN0ID0gdHJ1ZVxuICBhcmd1bWVudHMgPSBjcmVhdGVQcm9qZWN0QXJndW1lbnRzXG4gIG9wdGlvbnMgPSBjcmVhdGVQcm9qZWN0T3B0aW9uc1xuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncywgb3B0cyB9OiBDb21tYW5kUGFyYW1zPEFyZ3MsIE9wdHM+KTogUHJvbWlzZTxDcmVhdGVQcm9qZWN0UmVzdWx0PiB7XG4gICAgbGV0IG1vZHVsZUNvbmZpZ3M6IE1vZHVsZUNvbmZpZ09wdHNbXSA9IFtdXG4gICAgbGV0IGVycm9yczogR2FyZGVuQmFzZUVycm9yW10gPSBbXVxuXG4gICAgY29uc3QgcHJvamVjdFJvb3QgPSBhcmdzW1wicHJvamVjdC1kaXJcIl0gPyBqb2luKGdhcmRlbi5wcm9qZWN0Um9vdCwgYXJnc1tcInByb2plY3QtZGlyXCJdLnRyaW0oKSkgOiBnYXJkZW4ucHJvamVjdFJvb3RcbiAgICBjb25zdCBtb2R1bGVQYXJlbnREaXJzID0gYXdhaXQgQmx1ZWJpcmQubWFwKG9wdHNbXCJtb2R1bGUtZGlyc1wiXSB8fCBbXSwgKGRpcjogc3RyaW5nKSA9PiByZXNvbHZlKHByb2plY3RSb290LCBkaXIpKVxuICAgIGNvbnN0IHByb2plY3ROYW1lID0gdmFsaWRhdGUoXG4gICAgICBvcHRzLm5hbWUgfHwgYmFzZW5hbWUocHJvamVjdFJvb3QpLFxuICAgICAgam9pSWRlbnRpZmllcigpLFxuICAgICAgeyBjb250ZXh0OiBcInByb2plY3QgbmFtZVwiIH0sXG4gICAgKVxuXG4gICAgYXdhaXQgZW5zdXJlRGlyKHByb2plY3RSb290KVxuXG4gICAgZ2FyZGVuLmxvZy5oZWFkZXIoeyBlbW9qaTogXCJob3VzZV93aXRoX2dhcmRlblwiLCBjb21tYW5kOiBcImNyZWF0ZVwiIH0pXG4gICAgZ2FyZGVuLmxvZy5pbmZvKGBJbml0aWFsaXppbmcgbmV3IEdhcmRlbiBwcm9qZWN0ICR7cHJvamVjdE5hbWV9YClcbiAgICBnYXJkZW4ubG9nLmluZm8oXCItLS0tLS0tLS1cIilcbiAgICAvLyBTdG9wIGxvZ2dlciB3aGlsZSBwcm9tcHRpbmdcbiAgICBnYXJkZW4ubG9nLnN0b3AoKVxuXG4gICAgaWYgKG1vZHVsZVBhcmVudERpcnMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gSWYgbW9kdWxlLWRpcnMgb3B0aW9uIHByb3ZpZGVkIHdlIHNjYW4gZm9yIG1vZHVsZXMgaW4gdGhlIHBhcmVudCBkaXIocykgYW5kIGFkZCB0aGVtIG9uZSBieSBvbmVcbiAgICAgIG1vZHVsZUNvbmZpZ3MgPSAoYXdhaXQgQmx1ZWJpcmQubWFwU2VyaWVzKG1vZHVsZVBhcmVudERpcnMsIGFzeW5jIHBhcmVudERpciA9PiB7XG4gICAgICAgIGNvbnN0IG1vZHVsZU5hbWVzID0gYXdhaXQgZ2V0Q2hpbGREaXJOYW1lcyhwYXJlbnREaXIpXG5cbiAgICAgICAgcmV0dXJuIEJsdWViaXJkLnJlZHVjZShtb2R1bGVOYW1lcywgYXN5bmMgKGFjYzogTW9kdWxlQ29uZmlnT3B0c1tdLCBtb2R1bGVOYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zdCB7IHR5cGUgfSA9IGF3YWl0IHByb21wdHMuYWRkQ29uZmlnRm9yTW9kdWxlKG1vZHVsZU5hbWUpXG4gICAgICAgICAgaWYgKHR5cGUpIHtcbiAgICAgICAgICAgIGFjYy5wdXNoKHByZXBhcmVOZXdNb2R1bGVDb25maWcobW9kdWxlTmFtZSwgdHlwZSwgam9pbihwYXJlbnREaXIsIG1vZHVsZU5hbWUpKSlcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGFjY1xuICAgICAgICB9LCBbXSlcbiAgICAgIH0pKVxuICAgICAgICAucmVkdWNlKGZsYXR0ZW4sIFtdKVxuICAgICAgICAuZmlsdGVyKG0gPT4gbSlcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gT3RoZXJ3aXNlIHdlIHByb21wdCB0aGUgdXNlciBmb3IgbW9kdWxlcyB0byBhZGRcbiAgICAgIG1vZHVsZUNvbmZpZ3MgPSAoYXdhaXQgcHJvbXB0cy5yZXBlYXRBZGRNb2R1bGUoKSlcbiAgICAgICAgLm1hcCgoeyBuYW1lLCB0eXBlIH0pID0+IHByZXBhcmVOZXdNb2R1bGVDb25maWcobmFtZSwgdHlwZSwgam9pbihwcm9qZWN0Um9vdCwgbmFtZSkpKVxuICAgIH1cblxuICAgIGdhcmRlbi5sb2cuaW5mbyhcIi0tLS0tLS0tLVwiKVxuICAgIGNvbnN0IHRhc2tMb2cgPSBnYXJkZW4ubG9nLmluZm8oeyBtc2c6IFwiU2V0dGluZyB1cCBwcm9qZWN0XCIsIHN0YXR1czogXCJhY3RpdmVcIiB9KVxuXG4gICAgZm9yIChjb25zdCBtb2R1bGUgb2YgbW9kdWxlQ29uZmlncykge1xuICAgICAgYXdhaXQgZW5zdXJlRGlyKG1vZHVsZS5wYXRoKVxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZHVtcENvbmZpZyhtb2R1bGUsIG1vZHVsZVNjaGVtYSwgZ2FyZGVuLmxvZylcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBlcnJvcnMucHVzaChlcnIpXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcHJvamVjdENvbmZpZzogUHJvamVjdENvbmZpZ09wdHMgPSB7XG4gICAgICBwYXRoOiBwcm9qZWN0Um9vdCxcbiAgICAgIG5hbWU6IHByb2plY3ROYW1lLFxuICAgICAgY29uZmlnOiBwcm9qZWN0VGVtcGxhdGUocHJvamVjdE5hbWUsIG1vZHVsZUNvbmZpZ3MubWFwKG1vZHVsZSA9PiBtb2R1bGUudHlwZSkpLFxuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBkdW1wQ29uZmlnKHByb2plY3RDb25maWcsIHByb2plY3RTY2hlbWEsIGdhcmRlbi5sb2cpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBlcnJvcnMucHVzaChlcnIpXG4gICAgfVxuXG4gICAgaWYgKGVycm9ycy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRhc2tMb2cuc2V0U3VjY2VzcygpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRhc2tMb2cuc2V0V2Fybih7IG1zZzogXCJGaW5pc2hlZCB3aXRoIGVycm9yc1wiLCBhcHBlbmQ6IHRydWUgfSlcbiAgICB9XG5cbiAgICBjb25zdCBkb2NzID0gdGVybWluYWxMaW5rKFwiZG9jc1wiLCBcImh0dHBzOi8vZG9jcy5nYXJkZW4uaW9cIilcbiAgICBnYXJkZW4ubG9nLmluZm8oYFByb2plY3QgY3JlYXRlZCEgQmUgc3VyZSB0byBjaGVjayBvdXQgb3VyICR7ZG9jc30gZm9yIGhvdyB0byBnZXQgc2FydGVkIWApXG5cbiAgICByZXR1cm4ge1xuICAgICAgcmVzdWx0OiB7XG4gICAgICAgIG1vZHVsZUNvbmZpZ3MsXG4gICAgICAgIHByb2plY3RDb25maWcsXG4gICAgICB9LFxuICAgICAgZXJyb3JzLFxuICAgIH1cbiAgfVxufVxuIl19
