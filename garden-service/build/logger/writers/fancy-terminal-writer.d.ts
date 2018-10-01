/// <reference types="node" />
import { LogEntry } from "../log-entry";
import { Logger } from "../logger";
import { LogLevel } from "../log-node";
import { Writer, WriterConfig } from "./base";
export declare type Coords = [number, number];
export interface TerminalEntry {
    key: string;
    text: string;
    lineNumber: number;
    spinnerCoords?: Coords;
}
export interface TerminalEntryWithSpinner extends TerminalEntry {
    spinnerCoords: Coords;
}
export interface CustomStream extends NodeJS.WriteStream {
    cleanUp: Function;
}
export declare class FancyTerminalWriter extends Writer {
    private spinners;
    private intervalID;
    private stream;
    private prevOutput;
    private lastInterceptAt;
    private updatePending;
    level: LogLevel;
    constructor(config?: WriterConfig);
    private initStream;
    private spin;
    private startLoop;
    private stopLoop;
    private tickSpinner;
    private write;
    private handleGraphChange;
    toTerminalEntries(logger: Logger): TerminalEntry[];
    render(terminalEntries: TerminalEntry[]): string[];
    onGraphChange(logEntry: LogEntry, logger: Logger): void;
    stop(): void;
}
//# sourceMappingURL=fancy-terminal-writer.d.ts.map