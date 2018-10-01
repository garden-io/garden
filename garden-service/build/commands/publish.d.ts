import { BooleanParameter, Command, CommandParams, CommandResult, StringsParameter } from "./base";
import { Module } from "../types/module";
import { TaskResults } from "../task-graph";
import { Garden } from "../garden";
declare const publishArgs: {
    module: StringsParameter;
};
declare const publishOpts: {
    "force-build": BooleanParameter;
    "allow-dirty": BooleanParameter;
};
declare type Args = typeof publishArgs;
declare type Opts = typeof publishOpts;
export declare class PublishCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    description: string;
    arguments: {
        module: StringsParameter;
    };
    options: {
        "force-build": BooleanParameter;
        "allow-dirty": BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>>;
}
export declare function publishModules(garden: Garden, modules: Module<any>[], forceBuild: boolean, allowDirty: boolean): Promise<TaskResults>;
export {};
//# sourceMappingURL=publish.d.ts.map