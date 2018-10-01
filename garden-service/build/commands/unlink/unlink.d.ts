import { Command } from "../base";
import { UnlinkSourceCommand } from "./source";
import { UnlinkModuleCommand } from "./module";
export declare class UnlinkCommand extends Command {
    name: string;
    help: string;
    subCommands: (typeof UnlinkSourceCommand | typeof UnlinkModuleCommand)[];
    action(): Promise<{}>;
}
//# sourceMappingURL=unlink.d.ts.map