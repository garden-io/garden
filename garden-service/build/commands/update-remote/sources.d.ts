import { Command, StringsParameter, CommandResult, CommandParams } from "../base";
import { SourceConfig } from "../../config/project";
declare const updateRemoteSourcesArguments: {
    source: StringsParameter;
};
declare type Args = typeof updateRemoteSourcesArguments;
export declare class UpdateRemoteSourcesCommand extends Command<Args> {
    name: string;
    help: string;
    arguments: {
        source: StringsParameter;
    };
    description: string;
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult<SourceConfig[]>>;
}
export {};
//# sourceMappingURL=sources.d.ts.map