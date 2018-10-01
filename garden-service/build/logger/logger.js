"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const nodeEmoji = require("node-emoji");
const chalk_1 = require("chalk");
const log_node_1 = require("./log-node");
const log_entry_1 = require("./log-entry");
const util_1 = require("./util");
const exceptions_1 = require("../exceptions");
const log_node_2 = require("./log-node");
const fancy_terminal_writer_1 = require("./writers/fancy-terminal-writer");
const basic_terminal_writer_1 = require("./writers/basic-terminal-writer");
const renderers_1 = require("./renderers");
var LoggerType;
(function (LoggerType) {
    LoggerType["quiet"] = "quiet";
    LoggerType["basic"] = "basic";
    LoggerType["fancy"] = "fancy";
})(LoggerType = exports.LoggerType || (exports.LoggerType = {}));
function getCommonConfig(loggerType) {
    const configs = {
        [LoggerType.fancy]: {
            level: log_node_2.LogLevel.info,
            writers: [new fancy_terminal_writer_1.FancyTerminalWriter()],
        },
        [LoggerType.basic]: {
            level: log_node_2.LogLevel.info,
            writers: [new basic_terminal_writer_1.BasicTerminalWriter()],
        },
        [LoggerType.quiet]: {
            level: log_node_2.LogLevel.info,
        },
    };
    return configs[loggerType];
}
exports.getCommonConfig = getCommonConfig;
class Logger extends log_node_1.RootLogNode {
    static getInstance() {
        if (!Logger.instance) {
            throw new exceptions_1.InternalError("Logger not initialized", {});
        }
        return Logger.instance;
    }
    static initialize(config) {
        if (Logger.instance) {
            throw new exceptions_1.InternalError("Logger already initialized", {});
        }
        let instance;
        // If GARDEN_LOGGER_TYPE env variable is set it takes precedence over the config param
        if (process.env.GARDEN_LOGGER_TYPE) {
            const loggerType = LoggerType[process.env.GARDEN_LOGGER_TYPE];
            if (!loggerType) {
                throw new exceptions_1.ParameterError(`Invalid logger type specified: ${process.env.GARDEN_LOGGER_TYPE}`, {
                    loggerType: process.env.GARDEN_LOGGER_TYPE,
                    availableTypes: Object.keys(LoggerType),
                });
            }
            instance = new Logger(getCommonConfig(loggerType));
            instance.debug(`Setting logger type to ${loggerType} (from GARDEN_LOGGER_TYPE)`);
        }
        else {
            instance = new Logger(config);
        }
        Logger.instance = instance;
        return instance;
    }
    constructor(config) {
        super(config.level);
        this.writers = config.writers || [];
    }
    createNode(level, _parent, opts) {
        return new log_entry_1.LogEntry({ level, parent: this, opts: log_entry_1.resolveParam(opts) });
    }
    onGraphChange(entry) {
        this.writers.forEach(writer => writer.onGraphChange(entry, this));
    }
    getLogEntries() {
        return util_1.getChildEntries(this).filter(entry => !entry.fromStdStream());
    }
    filterBySection(section) {
        return util_1.getChildEntries(this).filter(entry => entry.opts.section === section);
    }
    header({ command, emoji, level = log_node_2.LogLevel.info }) {
        const msg = renderers_1.combine([
            [chalk_1.default.bold.magenta(command)],
            [emoji ? " " + nodeEmoji.get(emoji) : ""],
            ["\n"],
        ]);
        const lvlStr = log_node_2.LogLevel[level];
        return this[lvlStr](msg);
    }
    finish({ showDuration = true, level = log_node_2.LogLevel.info } = {}) {
        const msg = renderers_1.combine([
            [`\n${nodeEmoji.get("sparkles")}  Finished`],
            [showDuration ? ` in ${chalk_1.default.bold(this.getDuration() + "s")}` : "!"],
            ["\n"],
        ]);
        const lvlStr = log_node_2.LogLevel[level];
        return this[lvlStr](msg);
    }
    stop() {
        this.getLogEntries().forEach(e => e.stop());
        this.writers.forEach(writer => writer.stop());
    }
}
exports.Logger = Logger;
function getLogger() {
    return Logger.getInstance();
}
exports.getLogger = getLogger;

//# sourceMappingURL=data:application/json;charset=utf8;base64,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T0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUE7SUFDMUIsQ0FBQztJQUVELE1BQU0sQ0FDSixFQUFFLFlBQVksR0FBRyxJQUFJLEVBQUUsS0FBSyxHQUFHLG1CQUFRLENBQUMsSUFBSSxLQUFtRCxFQUFFO1FBRWpHLE1BQU0sR0FBRyxHQUFHLG1CQUFPLENBQUM7WUFDbEIsQ0FBQyxLQUFLLFNBQVMsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQztZQUM1QyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsT0FBTyxlQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDcEUsQ0FBQyxJQUFJLENBQUM7U0FDUCxDQUFDLENBQUE7UUFDRixNQUFNLE1BQU0sR0FBRyxtQkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQzlCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQzFCLENBQUM7SUFFRCxJQUFJO1FBQ0YsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFBO1FBQzNDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUE7SUFDL0MsQ0FBQztDQUVGO0FBMUZELHdCQTBGQztBQUVELFNBQWdCLFNBQVM7SUFDdkIsT0FBTyxNQUFNLENBQUMsV0FBVyxFQUFFLENBQUE7QUFDN0IsQ0FBQztBQUZELDhCQUVDIiwiZmlsZSI6ImxvZ2dlci9sb2dnZXIuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0ICogYXMgbm9kZUVtb2ppIGZyb20gXCJub2RlLWVtb2ppXCJcbmltcG9ydCBjaGFsayBmcm9tIFwiY2hhbGtcIlxuXG5pbXBvcnQgeyBSb290TG9nTm9kZSwgTG9nTm9kZSB9IGZyb20gXCIuL2xvZy1ub2RlXCJcbmltcG9ydCB7IExvZ0VudHJ5LCBDcmVhdGVPcHRzLCByZXNvbHZlUGFyYW0gfSBmcm9tIFwiLi9sb2ctZW50cnlcIlxuaW1wb3J0IHsgZ2V0Q2hpbGRFbnRyaWVzIH0gZnJvbSBcIi4vdXRpbFwiXG5pbXBvcnQgeyBXcml0ZXIgfSBmcm9tIFwiLi93cml0ZXJzL2Jhc2VcIlxuaW1wb3J0IHsgSW50ZXJuYWxFcnJvciwgUGFyYW1ldGVyRXJyb3IgfSBmcm9tIFwiLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQgeyBMb2dMZXZlbCB9IGZyb20gXCIuL2xvZy1ub2RlXCJcbmltcG9ydCB7IEZhbmN5VGVybWluYWxXcml0ZXIgfSBmcm9tIFwiLi93cml0ZXJzL2ZhbmN5LXRlcm1pbmFsLXdyaXRlclwiXG5pbXBvcnQgeyBCYXNpY1Rlcm1pbmFsV3JpdGVyIH0gZnJvbSBcIi4vd3JpdGVycy9iYXNpYy10ZXJtaW5hbC13cml0ZXJcIlxuaW1wb3J0IHsgY29tYmluZSB9IGZyb20gXCIuL3JlbmRlcmVyc1wiXG5cbmV4cG9ydCBlbnVtIExvZ2dlclR5cGUge1xuICBxdWlldCA9IFwicXVpZXRcIixcbiAgYmFzaWMgPSBcImJhc2ljXCIsXG4gIGZhbmN5ID0gXCJmYW5jeVwiLFxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tbW9uQ29uZmlnKGxvZ2dlclR5cGU6IExvZ2dlclR5cGUpOiBMb2dnZXJDb25maWcge1xuICBjb25zdCBjb25maWdzOiB7IFtrZXkgaW4gTG9nZ2VyVHlwZV06IExvZ2dlckNvbmZpZyB9ID0ge1xuICAgIFtMb2dnZXJUeXBlLmZhbmN5XToge1xuICAgICAgbGV2ZWw6IExvZ0xldmVsLmluZm8sXG4gICAgICB3cml0ZXJzOiBbbmV3IEZhbmN5VGVybWluYWxXcml0ZXIoKV0sXG4gICAgfSxcbiAgICBbTG9nZ2VyVHlwZS5iYXNpY106IHtcbiAgICAgIGxldmVsOiBMb2dMZXZlbC5pbmZvLFxuICAgICAgd3JpdGVyczogW25ldyBCYXNpY1Rlcm1pbmFsV3JpdGVyKCldLFxuICAgIH0sXG4gICAgW0xvZ2dlclR5cGUucXVpZXRdOiB7XG4gICAgICBsZXZlbDogTG9nTGV2ZWwuaW5mbyxcbiAgICB9LFxuICB9XG4gIHJldHVybiBjb25maWdzW2xvZ2dlclR5cGVdXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTG9nZ2VyQ29uZmlnIHtcbiAgbGV2ZWw6IExvZ0xldmVsXG4gIHdyaXRlcnM/OiBXcml0ZXJbXVxufVxuXG5leHBvcnQgY2xhc3MgTG9nZ2VyIGV4dGVuZHMgUm9vdExvZ05vZGU8TG9nRW50cnk+IHtcbiAgcHVibGljIHdyaXRlcnM6IFdyaXRlcltdXG5cbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IExvZ2dlclxuXG4gIHN0YXRpYyBnZXRJbnN0YW5jZSgpIHtcbiAgICBpZiAoIUxvZ2dlci5pbnN0YW5jZSkge1xuICAgICAgdGhyb3cgbmV3IEludGVybmFsRXJyb3IoXCJMb2dnZXIgbm90IGluaXRpYWxpemVkXCIsIHt9KVxuICAgIH1cbiAgICByZXR1cm4gTG9nZ2VyLmluc3RhbmNlXG4gIH1cblxuICBzdGF0aWMgaW5pdGlhbGl6ZShjb25maWc6IExvZ2dlckNvbmZpZykge1xuICAgIGlmIChMb2dnZXIuaW5zdGFuY2UpIHtcbiAgICAgIHRocm93IG5ldyBJbnRlcm5hbEVycm9yKFwiTG9nZ2VyIGFscmVhZHkgaW5pdGlhbGl6ZWRcIiwge30pXG4gICAgfVxuXG4gICAgbGV0IGluc3RhbmNlXG5cbiAgICAvLyBJZiBHQVJERU5fTE9HR0VSX1RZUEUgZW52IHZhcmlhYmxlIGlzIHNldCBpdCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGNvbmZpZyBwYXJhbVxuICAgIGlmIChwcm9jZXNzLmVudi5HQVJERU5fTE9HR0VSX1RZUEUpIHtcbiAgICAgIGNvbnN0IGxvZ2dlclR5cGUgPSBMb2dnZXJUeXBlW3Byb2Nlc3MuZW52LkdBUkRFTl9MT0dHRVJfVFlQRV1cblxuICAgICAgaWYgKCFsb2dnZXJUeXBlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJhbWV0ZXJFcnJvcihgSW52YWxpZCBsb2dnZXIgdHlwZSBzcGVjaWZpZWQ6ICR7cHJvY2Vzcy5lbnYuR0FSREVOX0xPR0dFUl9UWVBFfWAsIHtcbiAgICAgICAgICBsb2dnZXJUeXBlOiBwcm9jZXNzLmVudi5HQVJERU5fTE9HR0VSX1RZUEUsXG4gICAgICAgICAgYXZhaWxhYmxlVHlwZXM6IE9iamVjdC5rZXlzKExvZ2dlclR5cGUpLFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBpbnN0YW5jZSA9IG5ldyBMb2dnZXIoZ2V0Q29tbW9uQ29uZmlnKGxvZ2dlclR5cGUpKVxuICAgICAgaW5zdGFuY2UuZGVidWcoYFNldHRpbmcgbG9nZ2VyIHR5cGUgdG8gJHtsb2dnZXJUeXBlfSAoZnJvbSBHQVJERU5fTE9HR0VSX1RZUEUpYClcbiAgICB9IGVsc2Uge1xuICAgICAgaW5zdGFuY2UgPSBuZXcgTG9nZ2VyKGNvbmZpZylcbiAgICB9XG5cbiAgICBMb2dnZXIuaW5zdGFuY2UgPSBpbnN0YW5jZVxuICAgIHJldHVybiBpbnN0YW5jZVxuICB9XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3Rvcihjb25maWc6IExvZ2dlckNvbmZpZykge1xuICAgIHN1cGVyKGNvbmZpZy5sZXZlbClcbiAgICB0aGlzLndyaXRlcnMgPSBjb25maWcud3JpdGVycyB8fCBbXVxuICB9XG5cbiAgY3JlYXRlTm9kZShsZXZlbDogTG9nTGV2ZWwsIF9wYXJlbnQ6IExvZ05vZGUsIG9wdHM6IENyZWF0ZU9wdHMpIHtcbiAgICByZXR1cm4gbmV3IExvZ0VudHJ5KHsgbGV2ZWwsIHBhcmVudDogdGhpcywgb3B0czogcmVzb2x2ZVBhcmFtKG9wdHMpIH0pXG4gIH1cblxuICBvbkdyYXBoQ2hhbmdlKGVudHJ5OiBMb2dFbnRyeSkge1xuICAgIHRoaXMud3JpdGVycy5mb3JFYWNoKHdyaXRlciA9PiB3cml0ZXIub25HcmFwaENoYW5nZShlbnRyeSwgdGhpcykpXG4gIH1cblxuICBnZXRMb2dFbnRyaWVzKCk6IExvZ0VudHJ5W10ge1xuICAgIHJldHVybiBnZXRDaGlsZEVudHJpZXModGhpcykuZmlsdGVyKGVudHJ5ID0+ICFlbnRyeS5mcm9tU3RkU3RyZWFtKCkpXG4gIH1cblxuICBmaWx0ZXJCeVNlY3Rpb24oc2VjdGlvbjogc3RyaW5nKTogTG9nRW50cnlbXSB7XG4gICAgcmV0dXJuIGdldENoaWxkRW50cmllcyh0aGlzKS5maWx0ZXIoZW50cnkgPT4gZW50cnkub3B0cy5zZWN0aW9uID09PSBzZWN0aW9uKVxuICB9XG5cbiAgaGVhZGVyKFxuICAgIHsgY29tbWFuZCwgZW1vamksIGxldmVsID0gTG9nTGV2ZWwuaW5mbyB9OiB7IGNvbW1hbmQ6IHN0cmluZywgZW1vamk/OiBzdHJpbmcsIGxldmVsPzogTG9nTGV2ZWwgfSxcbiAgKTogTG9nRW50cnkge1xuICAgIGNvbnN0IG1zZyA9IGNvbWJpbmUoW1xuICAgICAgW2NoYWxrLmJvbGQubWFnZW50YShjb21tYW5kKV0sXG4gICAgICBbZW1vamkgPyBcIiBcIiArIG5vZGVFbW9qaS5nZXQoZW1vamkpIDogXCJcIl0sXG4gICAgICBbXCJcXG5cIl0sXG4gICAgXSlcbiAgICBjb25zdCBsdmxTdHIgPSBMb2dMZXZlbFtsZXZlbF1cbiAgICByZXR1cm4gdGhpc1tsdmxTdHJdKG1zZylcbiAgfVxuXG4gIGZpbmlzaChcbiAgICB7IHNob3dEdXJhdGlvbiA9IHRydWUsIGxldmVsID0gTG9nTGV2ZWwuaW5mbyB9OiB7IHNob3dEdXJhdGlvbj86IGJvb2xlYW4sIGxldmVsPzogTG9nTGV2ZWwgfSA9IHt9LFxuICApOiBMb2dFbnRyeSB7XG4gICAgY29uc3QgbXNnID0gY29tYmluZShbXG4gICAgICBbYFxcbiR7bm9kZUVtb2ppLmdldChcInNwYXJrbGVzXCIpfSAgRmluaXNoZWRgXSxcbiAgICAgIFtzaG93RHVyYXRpb24gPyBgIGluICR7Y2hhbGsuYm9sZCh0aGlzLmdldER1cmF0aW9uKCkgKyBcInNcIil9YCA6IFwiIVwiXSxcbiAgICAgIFtcIlxcblwiXSxcbiAgICBdKVxuICAgIGNvbnN0IGx2bFN0ciA9IExvZ0xldmVsW2xldmVsXVxuICAgIHJldHVybiB0aGlzW2x2bFN0cl0obXNnKVxuICB9XG5cbiAgc3RvcCgpOiB2b2lkIHtcbiAgICB0aGlzLmdldExvZ0VudHJpZXMoKS5mb3JFYWNoKGUgPT4gZS5zdG9wKCkpXG4gICAgdGhpcy53cml0ZXJzLmZvckVhY2god3JpdGVyID0+IHdyaXRlci5zdG9wKCkpXG4gIH1cblxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TG9nZ2VyKCkge1xuICByZXR1cm4gTG9nZ2VyLmdldEluc3RhbmNlKClcbn1cbiJdfQ==
