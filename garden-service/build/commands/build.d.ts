import { BooleanParameter, Command, CommandResult, CommandParams, StringsParameter } from "./base";
import { TaskResults } from "../task-graph";
declare const buildArguments: {
    module: StringsParameter;
};
declare const buildOptions: {
    force: BooleanParameter;
    watch: BooleanParameter;
};
declare type BuildArguments = typeof buildArguments;
declare type BuildOptions = typeof buildOptions;
export declare class BuildCommand extends Command<BuildArguments, BuildOptions> {
    name: string;
    help: string;
    description: string;
    arguments: {
        module: StringsParameter;
    };
    options: {
        force: BooleanParameter;
        watch: BooleanParameter;
    };
    action({ args, opts, garden }: CommandParams<BuildArguments, BuildOptions>): Promise<CommandResult<TaskResults>>;
}
export {};
//# sourceMappingURL=build.d.ts.map