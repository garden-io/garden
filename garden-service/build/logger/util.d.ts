/// <reference types="node" />
import { LogNode, LogLevel } from "./log-node";
import { LogEntry, CreateOpts } from "./log-entry";
export interface Node {
    children: any[];
}
export declare type LogOptsResolvers = {
    [K in keyof CreateOpts]?: Function;
};
export declare type ProcessNode<T extends Node = Node> = (node: T) => boolean;
export declare function getChildNodes<T extends Node, U extends Node>(node: T | U): U[];
export declare function getChildEntries(node: LogNode): LogEntry[];
export declare function findLogNode<T>(node: LogNode<T>, predicate: ProcessNode<LogNode<T>>): T | void;
/**
 * Intercepts the write method of a WriteableStream and calls the provided callback on the
 * string to write (or optionally applies the string to the write method)
 * Returns a function which sets the write back to default.
 *
 * Used e.g. by FancyLogger so that writes from other sources can be intercepted
 * and pushed to the log stack.
 */
export declare function interceptStream(stream: NodeJS.WriteStream, callback: Function): () => void;
export declare function getTerminalWidth(stream?: NodeJS.WriteStream): number;
export declare function validate(level: LogLevel, entry: LogEntry): boolean;
//# sourceMappingURL=util.d.ts.map