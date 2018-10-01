import { Command, CommandResult, CommandParams } from "../base";
import { SourceConfig } from "../../config/project";
export interface UpdateRemoteAllResult {
    projectSources: SourceConfig[];
    moduleSources: SourceConfig[];
}
export declare class UpdateRemoteAllCommand extends Command {
    name: string;
    help: string;
    description: string;
    action({ garden }: CommandParams): Promise<CommandResult<UpdateRemoteAllResult>>;
}
//# sourceMappingURL=all.d.ts.map