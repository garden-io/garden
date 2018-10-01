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
const sywac = require("sywac");
const lodash_1 = require("lodash");
const path_1 = require("path");
const js_yaml_1 = require("js-yaml");
const commands_1 = require("../commands/commands");
const stringify = require("json-stringify-safe");
const util_1 = require("../util/util");
const base_1 = require("../commands/base");
const exceptions_1 = require("../exceptions");
const garden_1 = require("../garden");
const logger_1 = require("../logger/logger");
const log_node_1 = require("../logger/log-node");
const basic_terminal_writer_1 = require("../logger/writers/basic-terminal-writer");
const fancy_terminal_writer_1 = require("../logger/writers/fancy-terminal-writer");
const file_writer_1 = require("../logger/writers/file-writer");
const helpers_1 = require("./helpers");
const project_1 = require("../config/project");
const constants_1 = require("../constants");
const OUTPUT_RENDERERS = {
    json: (data) => {
        return stringify(data, null, 2);
    },
    yaml: (data) => {
        return js_yaml_1.safeDump(data, { noRefs: true, skipInvalid: true });
    },
};
const logLevelKeys = util_1.getEnumKeys(log_node_1.LogLevel);
// Allow string or numeric log levels
const logLevelChoices = [...logLevelKeys, ...lodash_1.range(logLevelKeys.length).map(String)];
const getLogLevelFromArg = (level) => {
    const lvl = parseInt(level, 10);
    if (lvl) {
        return lvl;
    }
    return log_node_1.LogLevel[level];
};
// For initializing garden without a project config
exports.MOCK_CONFIG = {
    version: "0",
    dirname: "/",
    path: process.cwd(),
    project: {
        name: "mock-project",
        defaultEnvironment: "local",
        environments: project_1.defaultEnvironments,
        environmentDefaults: {
            providers: [
                {
                    name: "local-kubernetes",
                },
            ],
            variables: {},
        },
    },
};
exports.GLOBAL_OPTIONS = {
    root: new base_1.StringParameter({
        alias: "r",
        help: "Override project root directory (defaults to working directory).",
        defaultValue: process.cwd(),
    }),
    silent: new base_1.BooleanParameter({
        alias: "s",
        help: "Suppress log output.",
        defaultValue: false,
    }),
    env: new base_1.EnvironmentOption(),
    loglevel: new base_1.ChoicesParameter({
        alias: "l",
        choices: logLevelChoices,
        help: "Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 " +
            "(highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5",
        hints: "[enum] [default: info] [error || 0, warn || 1, info || 2, verbose || 3, debug || 4, silly || 5]",
        defaultValue: log_node_1.LogLevel[log_node_1.LogLevel.info],
    }),
    output: new base_1.ChoicesParameter({
        alias: "o",
        choices: Object.keys(OUTPUT_RENDERERS),
        help: "Output command result in specified format (note: disables progress logging).",
    }),
};
const GLOBAL_OPTIONS_GROUP_NAME = "Global options";
const DEFAULT_CLI_LOGGER_TYPE = logger_1.LoggerType.fancy;
class GardenCli {
    constructor() {
        this.commands = {};
        const version = require("../../package.json").version;
        this.program = sywac
            .help("-h, --help", {
            group: GLOBAL_OPTIONS_GROUP_NAME,
            implicitCommand: false,
        })
            .version("-v, --version", {
            version,
            group: GLOBAL_OPTIONS_GROUP_NAME,
            implicitCommand: false,
        })
            .showHelpByDefault()
            .check((argv, _ctx) => {
            // NOTE: Need to mutate argv!
            lodash_1.merge(argv, helpers_1.falsifyConflictingParams(argv, exports.GLOBAL_OPTIONS));
        })
            .style(helpers_1.styleConfig);
        const commands = commands_1.coreCommands;
        const globalOptions = Object.entries(exports.GLOBAL_OPTIONS);
        commands.forEach(command => this.addCommand(command, this.program));
        globalOptions.forEach(([key, opt]) => this.addGlobalOption(key, opt));
    }
    addGlobalOption(key, option) {
        this.program.option(helpers_1.getOptionSynopsis(key, option), Object.assign({}, helpers_1.prepareOptionConfig(option), { group: GLOBAL_OPTIONS_GROUP_NAME }));
    }
    addCommand(command, program) {
        const fullName = command.getFullName();
        if (this.commands[fullName]) {
            // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
            throw new exceptions_1.PluginError(`Multiple definitions of command "${fullName}"`, {});
        }
        this.commands[fullName] = command;
        const { arguments: args = {}, loggerType = DEFAULT_CLI_LOGGER_TYPE, options = {}, subCommands, } = command;
        const argKeys = helpers_1.getKeys(args);
        const optKeys = helpers_1.getKeys(options);
        const globalKeys = helpers_1.getKeys(exports.GLOBAL_OPTIONS);
        const dupKeys = lodash_1.intersection(optKeys, globalKeys);
        if (dupKeys.length > 0) {
            throw new exceptions_1.PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {});
        }
        const action = (argv, cliContext) => __awaiter(this, void 0, void 0, function* () {
            // Sywac returns positional args and options in a single object which we separate into args and opts
            const parsedArgs = helpers_1.filterByKeys(argv, argKeys);
            const parsedOpts = helpers_1.filterByKeys(argv, optKeys.concat(globalKeys));
            const root = path_1.resolve(process.cwd(), parsedOpts.root);
            const { env, loglevel, silent, output } = parsedOpts;
            // Init logger
            const level = getLogLevelFromArg(loglevel);
            let writers = [];
            if (!silent && !output && loggerType !== logger_1.LoggerType.quiet) {
                if (loggerType === logger_1.LoggerType.fancy) {
                    writers.push(new fancy_terminal_writer_1.FancyTerminalWriter());
                }
                else if (loggerType === logger_1.LoggerType.basic) {
                    writers.push(new basic_terminal_writer_1.BasicTerminalWriter());
                }
            }
            const logger = logger_1.Logger.initialize({ level, writers });
            let garden;
            let result;
            do {
                const contextOpts = { env, logger };
                if (command.noProject) {
                    contextOpts.config = exports.MOCK_CONFIG;
                }
                garden = yield garden_1.Garden.factory(root, contextOpts);
                // TODO: enforce that commands always output DeepPrimitiveMap
                result = yield command.action({
                    garden,
                    args: parsedArgs,
                    opts: parsedOpts,
                });
            } while (result.restartRequired);
            // We attach the action result to cli context so that we can process it in the parse method
            cliContext.details.result = result;
        });
        // Command specific positional args and options are set inside the builder function
        const setup = parser => {
            subCommands.forEach(subCommandCls => this.addCommand(new subCommandCls(command), parser));
            argKeys.forEach(key => parser.positional(helpers_1.getArgSynopsis(key, args[key]), helpers_1.prepareArgConfig(args[key])));
            optKeys.forEach(key => parser.option(helpers_1.getOptionSynopsis(key, options[key]), helpers_1.prepareOptionConfig(options[key])));
            // We only check for invalid flags for the last command since it might contain flags that
            // the parent is unaware of, thus causing the check to fail for the parent
            if (subCommands.length < 1) {
                parser.check(helpers_1.failOnInvalidOptions);
            }
            return parser;
        };
        const commandConfig = {
            setup,
            aliases: command.alias,
            desc: command.help,
            run: action,
        };
        program.command(command.name, commandConfig);
    }
    parse() {
        return __awaiter(this, void 0, void 0, function* () {
            const parseResult = yield this.program.parse();
            const { argv, details, errors, output: cliOutput } = parseResult;
            const { result: commandResult } = details;
            const { output } = argv;
            let { code } = parseResult;
            let logger;
            // Note: Circumvents an issue where the process exits before the output is fully flushed.
            // Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
            const waitForOutputFlush = () => util_1.sleep(100);
            // Logger might not have been initialised if process exits early
            try {
                logger = logger_1.getLogger();
            }
            catch (_) {
                logger = logger_1.Logger.initialize({
                    level: log_node_1.LogLevel.info,
                    writers: [new basic_terminal_writer_1.BasicTerminalWriter()],
                });
            }
            // --help or --version options were called so we log the cli output and exit
            if (cliOutput && errors.length < 1) {
                logger.stop();
                console.log(cliOutput);
                // fix issue where sywac returns exit code 0 even when a command doesn't exist
                if (!argv.h && !argv.help) {
                    code = 1;
                }
                process.exit(code);
            }
            const gardenErrors = errors
                .map(exceptions_1.toGardenError)
                .concat((commandResult && commandResult.errors) || []);
            // --output option set
            if (output) {
                const renderer = OUTPUT_RENDERERS[output];
                if (gardenErrors.length > 0) {
                    console.error(renderer({ success: false, errors: gardenErrors }));
                }
                else {
                    console.log(renderer(Object.assign({ success: true }, commandResult)));
                }
                yield waitForOutputFlush();
            }
            if (gardenErrors.length > 0) {
                gardenErrors.forEach(error => logger.error({
                    msg: error.message,
                    error,
                }));
                if (logger.writers.find(w => w instanceof file_writer_1.FileWriter)) {
                    logger.info(`\nSee ${constants_1.ERROR_LOG_FILENAME} for detailed error message`);
                    yield waitForOutputFlush();
                }
                code = 1;
            }
            logger.stop();
            return { argv, code, errors };
        });
    }
}
exports.GardenCli = GardenCli;
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let code;
        try {
            const cli = new GardenCli();
            const result = yield cli.parse();
            code = result.code;
        }
        catch (err) {
            console.log(err);
            code = 1;
        }
        finally {
            util_1.shutdown(code);
        }
    });
}
exports.run = run;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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Q0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUMzQixZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztvQkFDekMsR0FBRyxFQUFFLEtBQUssQ0FBQyxPQUFPO29CQUNsQixLQUFLO2lCQUNOLENBQUMsQ0FBQyxDQUFBO2dCQUVILElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksd0JBQVUsQ0FBQyxFQUFFO29CQUNyRCxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsOEJBQWtCLDZCQUE2QixDQUFDLENBQUE7b0JBQ3JFLE1BQU0sa0JBQWtCLEVBQUUsQ0FBQTtpQkFDM0I7Z0JBRUQsSUFBSSxHQUFHLENBQUMsQ0FBQTthQUNUO1lBRUQsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFBO1lBQ2IsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUE7UUFDL0IsQ0FBQztLQUFBO0NBRUY7QUFwTUQsOEJBb01DO0FBRUQsU0FBc0IsR0FBRzs7UUFDdkIsSUFBSSxJQUFJLENBQUE7UUFDUixJQUFJO1lBQ0YsTUFBTSxHQUFHLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQTtZQUMzQixNQUFNLE1BQU0sR0FBRyxNQUFNLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQTtZQUNoQyxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQTtTQUNuQjtRQUFDLE9BQU8sR0FBRyxFQUFFO1lBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUNoQixJQUFJLEdBQUcsQ0FBQyxDQUFBO1NBQ1Q7Z0JBQVM7WUFDUixlQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7U0FDZjtJQUNILENBQUM7Q0FBQTtBQVpELGtCQVlDIiwiZmlsZSI6ImNsaS9jbGkuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgc3l3YWMgZnJvbSBcInN5d2FjXCJcbmltcG9ydCB7IG1lcmdlLCBpbnRlcnNlY3Rpb24sIHJhbmdlIH0gZnJvbSBcImxvZGFzaFwiXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSBcInBhdGhcIlxuaW1wb3J0IHsgc2FmZUR1bXAgfSBmcm9tIFwianMteWFtbFwiXG5pbXBvcnQgeyBjb3JlQ29tbWFuZHMgfSBmcm9tIFwiLi4vY29tbWFuZHMvY29tbWFuZHNcIlxuaW1wb3J0IHN0cmluZ2lmeSA9IHJlcXVpcmUoXCJqc29uLXN0cmluZ2lmeS1zYWZlXCIpXG5cbmltcG9ydCB7IERlZXBQcmltaXRpdmVNYXAgfSBmcm9tIFwiLi4vY29uZmlnL2NvbW1vblwiXG5pbXBvcnQge1xuICBnZXRFbnVtS2V5cyxcbiAgc2h1dGRvd24sXG4gIHNsZWVwLFxufSBmcm9tIFwiLi4vdXRpbC91dGlsXCJcbmltcG9ydCB7XG4gIEJvb2xlYW5QYXJhbWV0ZXIsXG4gIENvbW1hbmQsXG4gIENob2ljZXNQYXJhbWV0ZXIsXG4gIFBhcmFtZXRlcixcbiAgU3RyaW5nUGFyYW1ldGVyLFxuICBFbnZpcm9ubWVudE9wdGlvbixcbiAgQ29tbWFuZFJlc3VsdCxcbn0gZnJvbSBcIi4uL2NvbW1hbmRzL2Jhc2VcIlxuaW1wb3J0IHtcbiAgR2FyZGVuRXJyb3IsXG4gIFBsdWdpbkVycm9yLFxuICB0b0dhcmRlbkVycm9yLFxufSBmcm9tIFwiLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBHYXJkZW4sIENvbnRleHRPcHRzIH0gZnJvbSBcIi4uL2dhcmRlblwiXG5cbmltcG9ydCB7IExvZ2dlciwgTG9nZ2VyVHlwZSwgZ2V0TG9nZ2VyIH0gZnJvbSBcIi4uL2xvZ2dlci9sb2dnZXJcIlxuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tIFwiLi4vbG9nZ2VyL2xvZy1ub2RlXCJcbmltcG9ydCB7IEJhc2ljVGVybWluYWxXcml0ZXIgfSBmcm9tIFwiLi4vbG9nZ2VyL3dyaXRlcnMvYmFzaWMtdGVybWluYWwtd3JpdGVyXCJcbmltcG9ydCB7IEZhbmN5VGVybWluYWxXcml0ZXIgfSBmcm9tIFwiLi4vbG9nZ2VyL3dyaXRlcnMvZmFuY3ktdGVybWluYWwtd3JpdGVyXCJcbmltcG9ydCB7IEZpbGVXcml0ZXIgfSBmcm9tIFwiLi4vbG9nZ2VyL3dyaXRlcnMvZmlsZS13cml0ZXJcIlxuaW1wb3J0IHsgV3JpdGVyIH0gZnJvbSBcIi4uL2xvZ2dlci93cml0ZXJzL2Jhc2VcIlxuXG5pbXBvcnQge1xuICBmYWxzaWZ5Q29uZmxpY3RpbmdQYXJhbXMsXG4gIGZhaWxPbkludmFsaWRPcHRpb25zLFxuICBnZXRBcmdTeW5vcHNpcyxcbiAgZ2V0S2V5cyxcbiAgZ2V0T3B0aW9uU3lub3BzaXMsXG4gIGZpbHRlckJ5S2V5cyxcbiAgcHJlcGFyZUFyZ0NvbmZpZyxcbiAgcHJlcGFyZU9wdGlvbkNvbmZpZyxcbiAgc3R5bGVDb25maWcsXG59IGZyb20gXCIuL2hlbHBlcnNcIlxuaW1wb3J0IHsgR2FyZGVuQ29uZmlnIH0gZnJvbSBcIi4uL2NvbmZpZy9iYXNlXCJcbmltcG9ydCB7IGRlZmF1bHRFbnZpcm9ubWVudHMgfSBmcm9tIFwiLi4vY29uZmlnL3Byb2plY3RcIlxuaW1wb3J0IHsgRVJST1JfTE9HX0ZJTEVOQU1FIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5cbmNvbnN0IE9VVFBVVF9SRU5ERVJFUlMgPSB7XG4gIGpzb246IChkYXRhOiBEZWVwUHJpbWl0aXZlTWFwKSA9PiB7XG4gICAgcmV0dXJuIHN0cmluZ2lmeShkYXRhLCBudWxsLCAyKVxuICB9LFxuICB5YW1sOiAoZGF0YTogRGVlcFByaW1pdGl2ZU1hcCkgPT4ge1xuICAgIHJldHVybiBzYWZlRHVtcChkYXRhLCB7IG5vUmVmczogdHJ1ZSwgc2tpcEludmFsaWQ6IHRydWUgfSlcbiAgfSxcbn1cblxuY29uc3QgbG9nTGV2ZWxLZXlzID0gZ2V0RW51bUtleXMoTG9nTGV2ZWwpXG4vLyBBbGxvdyBzdHJpbmcgb3IgbnVtZXJpYyBsb2cgbGV2ZWxzXG5jb25zdCBsb2dMZXZlbENob2ljZXMgPSBbLi4ubG9nTGV2ZWxLZXlzLCAuLi5yYW5nZShsb2dMZXZlbEtleXMubGVuZ3RoKS5tYXAoU3RyaW5nKV1cblxuY29uc3QgZ2V0TG9nTGV2ZWxGcm9tQXJnID0gKGxldmVsOiBzdHJpbmcpID0+IHtcbiAgY29uc3QgbHZsID0gcGFyc2VJbnQobGV2ZWwsIDEwKVxuICBpZiAobHZsKSB7XG4gICAgcmV0dXJuIGx2bFxuICB9XG4gIHJldHVybiBMb2dMZXZlbFtsZXZlbF1cbn1cblxuLy8gRm9yIGluaXRpYWxpemluZyBnYXJkZW4gd2l0aG91dCBhIHByb2plY3QgY29uZmlnXG5leHBvcnQgY29uc3QgTU9DS19DT05GSUc6IEdhcmRlbkNvbmZpZyA9IHtcbiAgdmVyc2lvbjogXCIwXCIsXG4gIGRpcm5hbWU6IFwiL1wiLFxuICBwYXRoOiBwcm9jZXNzLmN3ZCgpLFxuICBwcm9qZWN0OiB7XG4gICAgbmFtZTogXCJtb2NrLXByb2plY3RcIixcbiAgICBkZWZhdWx0RW52aXJvbm1lbnQ6IFwibG9jYWxcIixcbiAgICBlbnZpcm9ubWVudHM6IGRlZmF1bHRFbnZpcm9ubWVudHMsXG4gICAgZW52aXJvbm1lbnREZWZhdWx0czoge1xuICAgICAgcHJvdmlkZXJzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBuYW1lOiBcImxvY2FsLWt1YmVybmV0ZXNcIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB2YXJpYWJsZXM6IHt9LFxuICAgIH0sXG4gIH0sXG59XG5cbmV4cG9ydCBjb25zdCBHTE9CQUxfT1BUSU9OUyA9IHtcbiAgcm9vdDogbmV3IFN0cmluZ1BhcmFtZXRlcih7XG4gICAgYWxpYXM6IFwiclwiLFxuICAgIGhlbHA6IFwiT3ZlcnJpZGUgcHJvamVjdCByb290IGRpcmVjdG9yeSAoZGVmYXVsdHMgdG8gd29ya2luZyBkaXJlY3RvcnkpLlwiLFxuICAgIGRlZmF1bHRWYWx1ZTogcHJvY2Vzcy5jd2QoKSxcbiAgfSksXG4gIHNpbGVudDogbmV3IEJvb2xlYW5QYXJhbWV0ZXIoe1xuICAgIGFsaWFzOiBcInNcIixcbiAgICBoZWxwOiBcIlN1cHByZXNzIGxvZyBvdXRwdXQuXCIsXG4gICAgZGVmYXVsdFZhbHVlOiBmYWxzZSxcbiAgfSksXG4gIGVudjogbmV3IEVudmlyb25tZW50T3B0aW9uKCksXG4gIGxvZ2xldmVsOiBuZXcgQ2hvaWNlc1BhcmFtZXRlcih7XG4gICAgYWxpYXM6IFwibFwiLFxuICAgIGNob2ljZXM6IGxvZ0xldmVsQ2hvaWNlcyxcbiAgICBoZWxwOlxuICAgICAgXCJTZXQgbG9nZ2VyIGxldmVsLiBWYWx1ZXMgY2FuIGJlIGVpdGhlciBzdHJpbmcgb3IgbnVtZXJpYyBhbmQgYXJlIHByaW9yaXRpemVkIGZyb20gMCB0byA1IFwiICtcbiAgICAgIFwiKGhpZ2hlc3QgdG8gbG93ZXN0KSBhcyBmb2xsb3dzOiBlcnJvcjogMCwgd2FybjogMSwgaW5mbzogMiwgdmVyYm9zZTogMywgZGVidWc6IDQsIHNpbGx5OiA1XCIsXG4gICAgaGludHM6XG4gICAgICBcIltlbnVtXSBbZGVmYXVsdDogaW5mb10gW2Vycm9yIHx8IDAsIHdhcm4gfHwgMSwgaW5mbyB8fCAyLCB2ZXJib3NlIHx8IDMsIGRlYnVnIHx8IDQsIHNpbGx5IHx8IDVdXCIsXG4gICAgZGVmYXVsdFZhbHVlOiBMb2dMZXZlbFtMb2dMZXZlbC5pbmZvXSxcbiAgfSksXG4gIG91dHB1dDogbmV3IENob2ljZXNQYXJhbWV0ZXIoe1xuICAgIGFsaWFzOiBcIm9cIixcbiAgICBjaG9pY2VzOiBPYmplY3Qua2V5cyhPVVRQVVRfUkVOREVSRVJTKSxcbiAgICBoZWxwOiBcIk91dHB1dCBjb21tYW5kIHJlc3VsdCBpbiBzcGVjaWZpZWQgZm9ybWF0IChub3RlOiBkaXNhYmxlcyBwcm9ncmVzcyBsb2dnaW5nKS5cIixcbiAgfSksXG59XG5jb25zdCBHTE9CQUxfT1BUSU9OU19HUk9VUF9OQU1FID0gXCJHbG9iYWwgb3B0aW9uc1wiXG5jb25zdCBERUZBVUxUX0NMSV9MT0dHRVJfVFlQRSA9IExvZ2dlclR5cGUuZmFuY3lcblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZVJlc3VsdHMge1xuICBhcmd2OiBhbnlcbiAgY29kZTogbnVtYmVyXG4gIGVycm9yczogKEdhcmRlbkVycm9yIHwgRXJyb3IpW11cbn1cblxuaW50ZXJmYWNlIFN5d2FjUGFyc2VSZXN1bHRzIGV4dGVuZHMgUGFyc2VSZXN1bHRzIHtcbiAgb3V0cHV0OiBzdHJpbmdcbiAgZGV0YWlsczogeyBsb2dnZXI6IExvZ2dlciwgcmVzdWx0PzogQ29tbWFuZFJlc3VsdCB9XG59XG5cbmV4cG9ydCBjbGFzcyBHYXJkZW5DbGkge1xuICBwcm9ncmFtOiBhbnlcbiAgY29tbWFuZHM6IHsgW2tleTogc3RyaW5nXTogQ29tbWFuZCB9ID0ge31cblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBjb25zdCB2ZXJzaW9uID0gcmVxdWlyZShcIi4uLy4uL3BhY2thZ2UuanNvblwiKS52ZXJzaW9uXG4gICAgdGhpcy5wcm9ncmFtID0gc3l3YWNcbiAgICAgIC5oZWxwKFwiLWgsIC0taGVscFwiLCB7XG4gICAgICAgIGdyb3VwOiBHTE9CQUxfT1BUSU9OU19HUk9VUF9OQU1FLFxuICAgICAgICBpbXBsaWNpdENvbW1hbmQ6IGZhbHNlLFxuICAgICAgfSlcbiAgICAgIC52ZXJzaW9uKFwiLXYsIC0tdmVyc2lvblwiLCB7XG4gICAgICAgIHZlcnNpb24sXG4gICAgICAgIGdyb3VwOiBHTE9CQUxfT1BUSU9OU19HUk9VUF9OQU1FLFxuICAgICAgICBpbXBsaWNpdENvbW1hbmQ6IGZhbHNlLFxuICAgICAgfSlcbiAgICAgIC5zaG93SGVscEJ5RGVmYXVsdCgpXG4gICAgICAuY2hlY2soKGFyZ3YsIF9jdHgpID0+IHtcbiAgICAgICAgLy8gTk9URTogTmVlZCB0byBtdXRhdGUgYXJndiFcbiAgICAgICAgbWVyZ2UoYXJndiwgZmFsc2lmeUNvbmZsaWN0aW5nUGFyYW1zKGFyZ3YsIEdMT0JBTF9PUFRJT05TKSlcbiAgICAgIH0pXG4gICAgICAuc3R5bGUoc3R5bGVDb25maWcpXG5cbiAgICBjb25zdCBjb21tYW5kcyA9IGNvcmVDb21tYW5kc1xuXG4gICAgY29uc3QgZ2xvYmFsT3B0aW9ucyA9IE9iamVjdC5lbnRyaWVzKEdMT0JBTF9PUFRJT05TKVxuXG4gICAgY29tbWFuZHMuZm9yRWFjaChjb21tYW5kID0+IHRoaXMuYWRkQ29tbWFuZChjb21tYW5kLCB0aGlzLnByb2dyYW0pKVxuICAgIGdsb2JhbE9wdGlvbnMuZm9yRWFjaCgoW2tleSwgb3B0XSkgPT4gdGhpcy5hZGRHbG9iYWxPcHRpb24oa2V5LCBvcHQpKVxuICB9XG5cbiAgYWRkR2xvYmFsT3B0aW9uKGtleTogc3RyaW5nLCBvcHRpb246IFBhcmFtZXRlcjxhbnk+KTogdm9pZCB7XG4gICAgdGhpcy5wcm9ncmFtLm9wdGlvbihnZXRPcHRpb25TeW5vcHNpcyhrZXksIG9wdGlvbiksIHtcbiAgICAgIC4uLnByZXBhcmVPcHRpb25Db25maWcob3B0aW9uKSxcbiAgICAgIGdyb3VwOiBHTE9CQUxfT1BUSU9OU19HUk9VUF9OQU1FLFxuICAgIH0pXG4gIH1cblxuICBhZGRDb21tYW5kKGNvbW1hbmQ6IENvbW1hbmQsIHByb2dyYW0pOiB2b2lkIHtcbiAgICBjb25zdCBmdWxsTmFtZSA9IGNvbW1hbmQuZ2V0RnVsbE5hbWUoKVxuXG4gICAgaWYgKHRoaXMuY29tbWFuZHNbZnVsbE5hbWVdKSB7XG4gICAgICAvLyBGb3Igbm93IHdlIGRvbid0IGFsbG93IG11bHRpcGxlIGRlZmluaXRpb25zIG9mIHRoZSBzYW1lIGNvbW1hbmQuIFdlIG1heSB3YW50IHRvIHJldmlzaXQgdGhpcyBsYXRlci5cbiAgICAgIHRocm93IG5ldyBQbHVnaW5FcnJvcihgTXVsdGlwbGUgZGVmaW5pdGlvbnMgb2YgY29tbWFuZCBcIiR7ZnVsbE5hbWV9XCJgLCB7fSlcbiAgICB9XG5cbiAgICB0aGlzLmNvbW1hbmRzW2Z1bGxOYW1lXSA9IGNvbW1hbmRcblxuICAgIGNvbnN0IHtcbiAgICAgIGFyZ3VtZW50czogYXJncyA9IHt9LFxuICAgICAgbG9nZ2VyVHlwZSA9IERFRkFVTFRfQ0xJX0xPR0dFUl9UWVBFLFxuICAgICAgb3B0aW9ucyA9IHt9LFxuICAgICAgc3ViQ29tbWFuZHMsXG4gICAgfSA9IGNvbW1hbmRcblxuICAgIGNvbnN0IGFyZ0tleXMgPSBnZXRLZXlzKGFyZ3MpXG4gICAgY29uc3Qgb3B0S2V5cyA9IGdldEtleXMob3B0aW9ucylcbiAgICBjb25zdCBnbG9iYWxLZXlzID0gZ2V0S2V5cyhHTE9CQUxfT1BUSU9OUylcbiAgICBjb25zdCBkdXBLZXlzOiBzdHJpbmdbXSA9IGludGVyc2VjdGlvbihvcHRLZXlzLCBnbG9iYWxLZXlzKVxuXG4gICAgaWYgKGR1cEtleXMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBsdWdpbkVycm9yKGBHbG9iYWwgb3B0aW9uKHMpICR7ZHVwS2V5cy5qb2luKFwiIFwiKX0gY2Fubm90IGJlIHJlZGVmaW5lZGAsIHt9KVxuICAgIH1cblxuICAgIGNvbnN0IGFjdGlvbiA9IGFzeW5jIChhcmd2LCBjbGlDb250ZXh0KSA9PiB7XG4gICAgICAvLyBTeXdhYyByZXR1cm5zIHBvc2l0aW9uYWwgYXJncyBhbmQgb3B0aW9ucyBpbiBhIHNpbmdsZSBvYmplY3Qgd2hpY2ggd2Ugc2VwYXJhdGUgaW50byBhcmdzIGFuZCBvcHRzXG4gICAgICBjb25zdCBwYXJzZWRBcmdzID0gZmlsdGVyQnlLZXlzKGFyZ3YsIGFyZ0tleXMpXG4gICAgICBjb25zdCBwYXJzZWRPcHRzID0gZmlsdGVyQnlLZXlzKGFyZ3YsIG9wdEtleXMuY29uY2F0KGdsb2JhbEtleXMpKVxuICAgICAgY29uc3Qgcm9vdCA9IHJlc29sdmUocHJvY2Vzcy5jd2QoKSwgcGFyc2VkT3B0cy5yb290KVxuICAgICAgY29uc3QgeyBlbnYsIGxvZ2xldmVsLCBzaWxlbnQsIG91dHB1dCB9ID0gcGFyc2VkT3B0c1xuXG4gICAgICAvLyBJbml0IGxvZ2dlclxuICAgICAgY29uc3QgbGV2ZWwgPSBnZXRMb2dMZXZlbEZyb21BcmcobG9nbGV2ZWwpXG4gICAgICBsZXQgd3JpdGVyczogV3JpdGVyW10gPSBbXVxuXG4gICAgICBpZiAoIXNpbGVudCAmJiAhb3V0cHV0ICYmIGxvZ2dlclR5cGUgIT09IExvZ2dlclR5cGUucXVpZXQpIHtcbiAgICAgICAgaWYgKGxvZ2dlclR5cGUgPT09IExvZ2dlclR5cGUuZmFuY3kpIHtcbiAgICAgICAgICB3cml0ZXJzLnB1c2gobmV3IEZhbmN5VGVybWluYWxXcml0ZXIoKSlcbiAgICAgICAgfSBlbHNlIGlmIChsb2dnZXJUeXBlID09PSBMb2dnZXJUeXBlLmJhc2ljKSB7XG4gICAgICAgICAgd3JpdGVycy5wdXNoKG5ldyBCYXNpY1Rlcm1pbmFsV3JpdGVyKCkpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgbG9nZ2VyID0gTG9nZ2VyLmluaXRpYWxpemUoeyBsZXZlbCwgd3JpdGVycyB9KVxuICAgICAgbGV0IGdhcmRlbjogR2FyZGVuXG4gICAgICBsZXQgcmVzdWx0XG4gICAgICBkbyB7XG4gICAgICAgIGNvbnN0IGNvbnRleHRPcHRzOiBDb250ZXh0T3B0cyA9IHsgZW52LCBsb2dnZXIgfVxuICAgICAgICBpZiAoY29tbWFuZC5ub1Byb2plY3QpIHtcbiAgICAgICAgICBjb250ZXh0T3B0cy5jb25maWcgPSBNT0NLX0NPTkZJR1xuICAgICAgICB9XG4gICAgICAgIGdhcmRlbiA9IGF3YWl0IEdhcmRlbi5mYWN0b3J5KHJvb3QsIGNvbnRleHRPcHRzKVxuICAgICAgICAvLyBUT0RPOiBlbmZvcmNlIHRoYXQgY29tbWFuZHMgYWx3YXlzIG91dHB1dCBEZWVwUHJpbWl0aXZlTWFwXG4gICAgICAgIHJlc3VsdCA9IGF3YWl0IGNvbW1hbmQuYWN0aW9uKHtcbiAgICAgICAgICBnYXJkZW4sXG4gICAgICAgICAgYXJnczogcGFyc2VkQXJncyxcbiAgICAgICAgICBvcHRzOiBwYXJzZWRPcHRzLFxuICAgICAgICB9KVxuICAgICAgfSB3aGlsZSAocmVzdWx0LnJlc3RhcnRSZXF1aXJlZClcblxuICAgICAgLy8gV2UgYXR0YWNoIHRoZSBhY3Rpb24gcmVzdWx0IHRvIGNsaSBjb250ZXh0IHNvIHRoYXQgd2UgY2FuIHByb2Nlc3MgaXQgaW4gdGhlIHBhcnNlIG1ldGhvZFxuICAgICAgY2xpQ29udGV4dC5kZXRhaWxzLnJlc3VsdCA9IHJlc3VsdFxuICAgIH1cblxuICAgIC8vIENvbW1hbmQgc3BlY2lmaWMgcG9zaXRpb25hbCBhcmdzIGFuZCBvcHRpb25zIGFyZSBzZXQgaW5zaWRlIHRoZSBidWlsZGVyIGZ1bmN0aW9uXG4gICAgY29uc3Qgc2V0dXAgPSBwYXJzZXIgPT4ge1xuICAgICAgc3ViQ29tbWFuZHMuZm9yRWFjaChzdWJDb21tYW5kQ2xzID0+IHRoaXMuYWRkQ29tbWFuZChuZXcgc3ViQ29tbWFuZENscyhjb21tYW5kKSwgcGFyc2VyKSlcbiAgICAgIGFyZ0tleXMuZm9yRWFjaChrZXkgPT4gcGFyc2VyLnBvc2l0aW9uYWwoZ2V0QXJnU3lub3BzaXMoa2V5LCBhcmdzW2tleV0pLCBwcmVwYXJlQXJnQ29uZmlnKGFyZ3Nba2V5XSkpKVxuICAgICAgb3B0S2V5cy5mb3JFYWNoKGtleSA9PiBwYXJzZXIub3B0aW9uKGdldE9wdGlvblN5bm9wc2lzKGtleSwgb3B0aW9uc1trZXldKSwgcHJlcGFyZU9wdGlvbkNvbmZpZyhvcHRpb25zW2tleV0pKSlcblxuICAgICAgLy8gV2Ugb25seSBjaGVjayBmb3IgaW52YWxpZCBmbGFncyBmb3IgdGhlIGxhc3QgY29tbWFuZCBzaW5jZSBpdCBtaWdodCBjb250YWluIGZsYWdzIHRoYXRcbiAgICAgIC8vIHRoZSBwYXJlbnQgaXMgdW5hd2FyZSBvZiwgdGh1cyBjYXVzaW5nIHRoZSBjaGVjayB0byBmYWlsIGZvciB0aGUgcGFyZW50XG4gICAgICBpZiAoc3ViQ29tbWFuZHMubGVuZ3RoIDwgMSkge1xuICAgICAgICBwYXJzZXIuY2hlY2soZmFpbE9uSW52YWxpZE9wdGlvbnMpXG4gICAgICB9XG4gICAgICByZXR1cm4gcGFyc2VyXG4gICAgfVxuXG4gICAgY29uc3QgY29tbWFuZENvbmZpZyA9IHtcbiAgICAgIHNldHVwLFxuICAgICAgYWxpYXNlczogY29tbWFuZC5hbGlhcyxcbiAgICAgIGRlc2M6IGNvbW1hbmQuaGVscCxcbiAgICAgIHJ1bjogYWN0aW9uLFxuICAgIH1cblxuICAgIHByb2dyYW0uY29tbWFuZChjb21tYW5kLm5hbWUsIGNvbW1hbmRDb25maWcpXG4gIH1cblxuICBhc3luYyBwYXJzZSgpOiBQcm9taXNlPFBhcnNlUmVzdWx0cz4ge1xuICAgIGNvbnN0IHBhcnNlUmVzdWx0OiBTeXdhY1BhcnNlUmVzdWx0cyA9IGF3YWl0IHRoaXMucHJvZ3JhbS5wYXJzZSgpXG4gICAgY29uc3QgeyBhcmd2LCBkZXRhaWxzLCBlcnJvcnMsIG91dHB1dDogY2xpT3V0cHV0IH0gPSBwYXJzZVJlc3VsdFxuICAgIGNvbnN0IHsgcmVzdWx0OiBjb21tYW5kUmVzdWx0IH0gPSBkZXRhaWxzXG4gICAgY29uc3QgeyBvdXRwdXQgfSA9IGFyZ3ZcbiAgICBsZXQgeyBjb2RlIH0gPSBwYXJzZVJlc3VsdFxuICAgIGxldCBsb2dnZXI6IExvZ2dlclxuXG4gICAgLy8gTm90ZTogQ2lyY3VtdmVudHMgYW4gaXNzdWUgd2hlcmUgdGhlIHByb2Nlc3MgZXhpdHMgYmVmb3JlIHRoZSBvdXRwdXQgaXMgZnVsbHkgZmx1c2hlZC5cbiAgICAvLyBOZWVkZWQgZm9yIG91dHB1dCByZW5kZXJlcnMgYW5kIFdpbnN0b24gKHNlZTogaHR0cHM6Ly9naXRodWIuY29tL3dpbnN0b25qcy93aW5zdG9uL2lzc3Vlcy8yMjgpXG4gICAgY29uc3Qgd2FpdEZvck91dHB1dEZsdXNoID0gKCkgPT4gc2xlZXAoMTAwKVxuXG4gICAgLy8gTG9nZ2VyIG1pZ2h0IG5vdCBoYXZlIGJlZW4gaW5pdGlhbGlzZWQgaWYgcHJvY2VzcyBleGl0cyBlYXJseVxuICAgIHRyeSB7XG4gICAgICBsb2dnZXIgPSBnZXRMb2dnZXIoKVxuICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIGxvZ2dlciA9IExvZ2dlci5pbml0aWFsaXplKHtcbiAgICAgICAgbGV2ZWw6IExvZ0xldmVsLmluZm8sXG4gICAgICAgIHdyaXRlcnM6IFtuZXcgQmFzaWNUZXJtaW5hbFdyaXRlcigpXSxcbiAgICAgIH0pXG4gICAgfVxuXG4gICAgLy8gLS1oZWxwIG9yIC0tdmVyc2lvbiBvcHRpb25zIHdlcmUgY2FsbGVkIHNvIHdlIGxvZyB0aGUgY2xpIG91dHB1dCBhbmQgZXhpdFxuICAgIGlmIChjbGlPdXRwdXQgJiYgZXJyb3JzLmxlbmd0aCA8IDEpIHtcbiAgICAgIGxvZ2dlci5zdG9wKClcbiAgICAgIGNvbnNvbGUubG9nKGNsaU91dHB1dClcblxuICAgICAgLy8gZml4IGlzc3VlIHdoZXJlIHN5d2FjIHJldHVybnMgZXhpdCBjb2RlIDAgZXZlbiB3aGVuIGEgY29tbWFuZCBkb2Vzbid0IGV4aXN0XG4gICAgICBpZiAoIWFyZ3YuaCAmJiAhYXJndi5oZWxwKSB7XG4gICAgICAgIGNvZGUgPSAxXG4gICAgICB9XG5cbiAgICAgIHByb2Nlc3MuZXhpdChjb2RlKVxuICAgIH1cblxuICAgIGNvbnN0IGdhcmRlbkVycm9yczogR2FyZGVuRXJyb3JbXSA9IGVycm9yc1xuICAgICAgLm1hcCh0b0dhcmRlbkVycm9yKVxuICAgICAgLmNvbmNhdCgoY29tbWFuZFJlc3VsdCAmJiBjb21tYW5kUmVzdWx0LmVycm9ycykgfHwgW10pXG5cbiAgICAvLyAtLW91dHB1dCBvcHRpb24gc2V0XG4gICAgaWYgKG91dHB1dCkge1xuICAgICAgY29uc3QgcmVuZGVyZXIgPSBPVVRQVVRfUkVOREVSRVJTW291dHB1dF1cbiAgICAgIGlmIChnYXJkZW5FcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKHJlbmRlcmVyKHsgc3VjY2VzczogZmFsc2UsIGVycm9yczogZ2FyZGVuRXJyb3JzIH0pKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2cocmVuZGVyZXIoeyBzdWNjZXNzOiB0cnVlLCAuLi5jb21tYW5kUmVzdWx0IH0pKVxuICAgICAgfVxuICAgICAgYXdhaXQgd2FpdEZvck91dHB1dEZsdXNoKClcbiAgICB9XG5cbiAgICBpZiAoZ2FyZGVuRXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgIGdhcmRlbkVycm9ycy5mb3JFYWNoKGVycm9yID0+IGxvZ2dlci5lcnJvcih7XG4gICAgICAgIG1zZzogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgZXJyb3IsXG4gICAgICB9KSlcblxuICAgICAgaWYgKGxvZ2dlci53cml0ZXJzLmZpbmQodyA9PiB3IGluc3RhbmNlb2YgRmlsZVdyaXRlcikpIHtcbiAgICAgICAgbG9nZ2VyLmluZm8oYFxcblNlZSAke0VSUk9SX0xPR19GSUxFTkFNRX0gZm9yIGRldGFpbGVkIGVycm9yIG1lc3NhZ2VgKVxuICAgICAgICBhd2FpdCB3YWl0Rm9yT3V0cHV0Rmx1c2goKVxuICAgICAgfVxuXG4gICAgICBjb2RlID0gMVxuICAgIH1cblxuICAgIGxvZ2dlci5zdG9wKClcbiAgICByZXR1cm4geyBhcmd2LCBjb2RlLCBlcnJvcnMgfVxuICB9XG5cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgbGV0IGNvZGVcbiAgdHJ5IHtcbiAgICBjb25zdCBjbGkgPSBuZXcgR2FyZGVuQ2xpKClcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjbGkucGFyc2UoKVxuICAgIGNvZGUgPSByZXN1bHQuY29kZVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmxvZyhlcnIpXG4gICAgY29kZSA9IDFcbiAgfSBmaW5hbGx5IHtcbiAgICBzaHV0ZG93bihjb2RlKVxuICB9XG59XG4iXX0=
