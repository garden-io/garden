import { BooleanParameter, Command, CommandParams, CommandResult, StringsParameter } from "./base";
import { TaskResults } from "../task-graph";
declare const deployArgs: {
    service: StringsParameter;
};
declare const deployOpts: {
    force: BooleanParameter;
    "force-build": BooleanParameter;
    watch: BooleanParameter;
};
declare type Args = typeof deployArgs;
declare type Opts = typeof deployOpts;
export declare class DeployCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    description: string;
    arguments: {
        service: StringsParameter;
    };
    options: {
        force: BooleanParameter;
        "force-build": BooleanParameter;
        watch: BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>>;
}
export {};
//# sourceMappingURL=deploy.d.ts.map