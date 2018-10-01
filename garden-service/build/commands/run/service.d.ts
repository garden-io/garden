import { RunResult } from "../../types/plugin/outputs";
import { BooleanParameter, Command, CommandParams, CommandResult, StringParameter } from "../base";
declare const runArgs: {
    service: StringParameter;
};
declare const runOpts: {
    "force-build": BooleanParameter;
};
declare type Args = typeof runArgs;
declare type Opts = typeof runOpts;
export declare class RunServiceCommand extends Command<Args, Opts> {
    name: string;
    alias: string;
    help: string;
    description: string;
    arguments: {
        service: StringParameter;
    };
    options: {
        "force-build": BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>>;
}
export {};
//# sourceMappingURL=service.d.ts.map