import { RunResult } from "../../types/plugin/outputs";
import { BooleanParameter, Command, CommandParams, StringParameter, CommandResult, StringsParameter } from "../base";
declare const runArgs: {
    module: StringParameter;
    command: StringsParameter;
};
declare const runOpts: {
    interactive: BooleanParameter;
    "force-build": BooleanParameter;
};
declare type Args = typeof runArgs;
declare type Opts = typeof runOpts;
export declare class RunModuleCommand extends Command<Args, Opts> {
    name: string;
    alias: string;
    help: string;
    description: string;
    arguments: {
        module: StringParameter;
        command: StringsParameter;
    };
    options: {
        interactive: BooleanParameter;
        "force-build": BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>>;
}
export {};
//# sourceMappingURL=module.d.ts.map