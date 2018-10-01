import { LoggerType } from "../logger/logger";
import { ExecInServiceResult } from "../types/plugin/outputs";
import { Command, CommandResult, CommandParams, StringParameter, StringsParameter } from "./base";
declare const runArgs: {
    service: StringParameter;
    command: StringsParameter;
};
declare type Args = typeof runArgs;
export declare class ExecCommand extends Command<Args> {
    name: string;
    alias: string;
    help: string;
    description: string;
    arguments: {
        service: StringParameter;
        command: StringsParameter;
    };
    options: {};
    loggerType: LoggerType;
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult<ExecInServiceResult>>;
}
export {};
//# sourceMappingURL=exec.d.ts.map