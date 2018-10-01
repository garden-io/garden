import * as winston from "winston";
import { LogLevel } from "../log-node";
import { LogEntry } from "../log-entry";
import { Writer } from "./base";
export interface FileWriterConfig {
    level: LogLevel;
    root: string;
    filename: string;
    path?: string;
    fileTransportOptions?: {};
    truncatePrevious?: boolean;
}
export declare class FileWriter extends Writer {
    private fileLogger;
    private filePath;
    private fileTransportOptions;
    level: LogLevel;
    constructor(filePath: string, config: FileWriterConfig);
    static factory(config: FileWriterConfig): Promise<FileWriter>;
    initFileLogger(): winston.Logger;
    render(entry: LogEntry): string | null;
    onGraphChange(entry: LogEntry): void;
    stop(): void;
}
//# sourceMappingURL=file-writer.d.ts.map