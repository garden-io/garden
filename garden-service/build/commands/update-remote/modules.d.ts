import { Command, StringsParameter, CommandResult, CommandParams } from "../base";
import { SourceConfig } from "../../config/project";
declare const updateRemoteModulesArguments: {
    module: StringsParameter;
};
declare type Args = typeof updateRemoteModulesArguments;
export declare class UpdateRemoteModulesCommand extends Command<Args> {
    name: string;
    help: string;
    arguments: {
        module: StringsParameter;
    };
    description: string;
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult<SourceConfig[]>>;
}
export {};
//# sourceMappingURL=modules.d.ts.map