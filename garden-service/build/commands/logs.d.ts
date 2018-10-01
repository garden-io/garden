import { BooleanParameter, Command, CommandResult, CommandParams, StringsParameter } from "./base";
import { ServiceLogEntry } from "../types/plugin/outputs";
import { LoggerType } from "../logger/logger";
declare const logsArgs: {
    service: StringsParameter;
};
declare const logsOpts: {
    tail: BooleanParameter;
};
declare type Args = typeof logsArgs;
declare type Opts = typeof logsOpts;
export declare class LogsCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    description: string;
    arguments: {
        service: StringsParameter;
    };
    options: {
        tail: BooleanParameter;
    };
    loggerType: LoggerType;
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ServiceLogEntry[]>>;
}
export {};
//# sourceMappingURL=logs.d.ts.map