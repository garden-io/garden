import { RootLogNode, LogNode } from "./log-node";
import { LogEntry, CreateOpts } from "./log-entry";
import { Writer } from "./writers/base";
import { LogLevel } from "./log-node";
export declare enum LoggerType {
    quiet = "quiet",
    basic = "basic",
    fancy = "fancy"
}
export declare function getCommonConfig(loggerType: LoggerType): LoggerConfig;
export interface LoggerConfig {
    level: LogLevel;
    writers?: Writer[];
}
export declare class Logger extends RootLogNode<LogEntry> {
    writers: Writer[];
    private static instance;
    static getInstance(): Logger;
    static initialize(config: LoggerConfig): any;
    private constructor();
    createNode(level: LogLevel, _parent: LogNode, opts: CreateOpts): any;
    onGraphChange(entry: LogEntry): void;
    getLogEntries(): LogEntry[];
    filterBySection(section: string): LogEntry[];
    header({ command, emoji, level }: {
        command: string;
        emoji?: string;
        level?: LogLevel;
    }): LogEntry;
    finish({ showDuration, level }?: {
        showDuration?: boolean;
        level?: LogLevel;
    }): LogEntry;
    stop(): void;
}
export declare function getLogger(): Logger;
//# sourceMappingURL=logger.d.ts.map