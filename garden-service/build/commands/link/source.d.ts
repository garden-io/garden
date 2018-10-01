import { Command, CommandResult, StringParameter, PathParameter } from "../base";
import { LinkedSource } from "../../config-store";
import { CommandParams } from "../base";
declare const linkSourceArguments: {
    source: StringParameter;
    path: PathParameter;
};
declare type Args = typeof linkSourceArguments;
export declare class LinkSourceCommand extends Command<Args> {
    name: string;
    help: string;
    arguments: {
        source: StringParameter;
        path: PathParameter;
    };
    description: string;
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult<LinkedSource[]>>;
}
export {};
//# sourceMappingURL=source.d.ts.map