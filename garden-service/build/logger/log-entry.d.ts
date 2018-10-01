import * as logSymbols from "log-symbols";
import * as nodeEmoji from "node-emoji";
import { LogNode, LogLevel } from "./log-node";
import { GardenError } from "../exceptions";
import { Omit } from "../util/util";
export declare type EmojiName = keyof typeof nodeEmoji.emoji;
export declare type LogSymbol = keyof typeof logSymbols | "empty";
export declare type EntryStatus = "active" | "done" | "error" | "success" | "warn";
export interface UpdateOpts {
    msg?: string | string[];
    section?: string;
    emoji?: EmojiName;
    symbol?: LogSymbol;
    append?: boolean;
    fromStdStream?: boolean;
    showDuration?: boolean;
    error?: GardenError;
    status?: EntryStatus;
    indentationLevel?: number;
}
export interface CreateOpts extends UpdateOpts {
    id?: string;
}
export declare type CreateParam = string | CreateOpts;
export interface LogEntryConstructor {
    level: LogLevel;
    opts: CreateOpts;
    parent: LogNode;
}
export declare function resolveParam<T extends UpdateOpts>(param?: string | T): T;
export declare class LogEntry extends LogNode {
    opts: UpdateOpts;
    constructor({ level, opts, parent }: LogEntryConstructor);
    private setOwnState;
    private deepSetState;
    createNode(level: LogLevel, parent: LogNode, param?: CreateParam): LogEntry;
    setState(param?: string | UpdateOpts): LogEntry;
    setDone(param?: string | Omit<UpdateOpts, "status">): LogEntry;
    setSuccess(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry;
    setError(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry;
    setWarn(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry;
    fromStdStream(): boolean;
    stop(): this;
    inspect(): void;
    filterBySection(section: string): LogEntry[];
}
//# sourceMappingURL=log-entry.d.ts.map