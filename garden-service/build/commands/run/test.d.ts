import { RunResult } from "../../types/plugin/outputs";
import { BooleanParameter, Command, CommandParams, CommandResult, StringParameter } from "../base";
declare const runArgs: {
    module: StringParameter;
    test: StringParameter;
};
declare const runOpts: {
    interactive: BooleanParameter;
    "force-build": BooleanParameter;
};
declare type Args = typeof runArgs;
declare type Opts = typeof runOpts;
export declare class RunTestCommand extends Command<Args, Opts> {
    name: string;
    alias: string;
    help: string;
    description: string;
    arguments: {
        module: StringParameter;
        test: StringParameter;
    };
    options: {
        interactive: BooleanParameter;
        "force-build": BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<RunResult>>;
}
export {};
//# sourceMappingURL=test.d.ts.map