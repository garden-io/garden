import { BooleanParameter, Command, CommandParams, CommandResult, StringOption, StringsParameter } from "./base";
import { TaskResults } from "../task-graph";
import { Module } from "../types/module";
import { TestTask } from "../tasks/test";
import { Garden } from "../garden";
declare const testArgs: {
    module: StringsParameter;
};
declare const testOpts: {
    name: StringOption;
    force: BooleanParameter;
    "force-build": BooleanParameter;
    watch: BooleanParameter;
};
declare type Args = typeof testArgs;
declare type Opts = typeof testOpts;
export declare class TestCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    description: string;
    arguments: {
        module: StringsParameter;
    };
    options: {
        name: StringOption;
        force: BooleanParameter;
        "force-build": BooleanParameter;
        watch: BooleanParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>>;
}
export declare function getTestTasks({ garden, module, name, force, forceBuild }: {
    garden: Garden;
    module: Module;
    name?: string;
    force?: boolean;
    forceBuild?: boolean;
}): Promise<TestTask[]>;
export {};
//# sourceMappingURL=test.d.ts.map