import { LogLevel } from "../log-node";
import { LogEntry } from "../log-entry";
import { Logger } from "../logger";
export interface WriterConfig {
    level?: LogLevel;
}
export declare abstract class Writer {
    level: LogLevel | undefined;
    constructor({ level }?: WriterConfig);
    abstract render(...args: any[]): string | string[] | null;
    abstract onGraphChange(entry: LogEntry, logger: Logger): void;
    abstract stop(): void;
}
//# sourceMappingURL=base.d.ts.map