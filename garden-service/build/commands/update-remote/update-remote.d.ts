import { Command } from "../base";
import { UpdateRemoteSourcesCommand } from "./sources";
import { UpdateRemoteModulesCommand } from "./modules";
import { UpdateRemoteAllCommand } from "./all";
export declare class UpdateRemoteCommand extends Command {
    name: string;
    help: string;
    subCommands: (typeof UpdateRemoteSourcesCommand | typeof UpdateRemoteModulesCommand | typeof UpdateRemoteAllCommand)[];
    action(): Promise<{}>;
}
//# sourceMappingURL=update-remote.d.ts.map