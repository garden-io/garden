import { LogEntry, CreateParam } from "./log-entry";
export declare enum LogLevel {
    error = 0,
    warn = 1,
    info = 2,
    verbose = 3,
    debug = 4,
    silly = 5
}
export declare abstract class LogNode<T = LogEntry, U = CreateParam> {
    readonly level: LogLevel;
    readonly parent?: LogNode<T, CreateParam> | undefined;
    readonly id?: string | undefined;
    readonly timestamp: number;
    readonly key: string;
    readonly children: T[];
    readonly root: RootLogNode<T>;
    constructor(level: LogLevel, parent?: LogNode<T, CreateParam> | undefined, id?: string | undefined);
    abstract createNode(level: LogLevel, parent: LogNode<T, U>, param?: U): T;
    protected appendNode(level: LogLevel, param?: U): T;
    silly(param?: U): T;
    debug(param?: U): T;
    verbose(param?: U): T;
    info(param?: U): T;
    warn(param?: U): T;
    error(param?: U): T;
    /**
     * Returns the duration in seconds, defaults to 2 decimal precision
     */
    getDuration(precision?: number): number;
}
export declare abstract class RootLogNode<T = LogEntry> extends LogNode<T> {
    abstract onGraphChange(node: T): void;
    findById(id: string): T | void;
}
//# sourceMappingURL=log-node.d.ts.map