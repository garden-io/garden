import { Command, CommandResult, StringsParameter, BooleanParameter, CommandParams } from "../base";
import { LinkedSource } from "../../config-store";
declare const unlinkModuleArguments: {
    module: StringsParameter;
};
declare const unlinkModuleOptions: {
    all: BooleanParameter;
};
declare type Args = typeof unlinkModuleArguments;
declare type Opts = typeof unlinkModuleOptions;
export declare class UnlinkModuleCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    arguments: {
        module: StringsParameter;
    };
    options: {
        all: BooleanParameter;
    };
    description: string;
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<LinkedSource[]>>;
}
export {};
//# sourceMappingURL=module.d.ts.map