import { Command, CommandResult, StringParameter, ChoicesParameter, CommandParams } from "../base";
import { ModuleConfigOpts } from "./config-templates";
declare const createModuleOptions: {
    name: StringParameter;
    type: ChoicesParameter;
};
declare const createModuleArguments: {
    "module-dir": StringParameter;
};
declare type Args = typeof createModuleArguments;
declare type Opts = typeof createModuleOptions;
interface CreateModuleResult extends CommandResult {
    result: {
        module?: ModuleConfigOpts;
    };
}
export declare class CreateModuleCommand extends Command<Args, Opts> {
    name: string;
    alias: string;
    help: string;
    description: string;
    noProject: boolean;
    arguments: {
        "module-dir": StringParameter;
    };
    options: {
        name: StringParameter;
        type: ChoicesParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CreateModuleResult>;
}
export {};
//# sourceMappingURL=module.d.ts.map