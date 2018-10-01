import { LogLevel } from "../log-node";
import { LogEntry } from "../log-entry";
import { Logger } from "../logger";
import { Writer } from "./base";
export declare class BasicTerminalWriter extends Writer {
    level: LogLevel;
    render(entry: LogEntry, logger: Logger): string | null;
    onGraphChange(entry: LogEntry, logger: Logger): void;
    stop(): void;
}
//# sourceMappingURL=basic-terminal-writer.d.ts.map