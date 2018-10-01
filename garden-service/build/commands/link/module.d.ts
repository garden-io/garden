import { Command, CommandResult, StringParameter, PathParameter, CommandParams } from "../base";
import { LinkedSource } from "../../config-store";
declare const linkModuleArguments: {
    module: StringParameter;
    path: PathParameter;
};
declare type Args = typeof linkModuleArguments;
export declare class LinkModuleCommand extends Command<Args> {
    name: string;
    help: string;
    arguments: {
        module: StringParameter;
        path: PathParameter;
    };
    description: string;
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult<LinkedSource[]>>;
}
export {};
//# sourceMappingURL=module.d.ts.map