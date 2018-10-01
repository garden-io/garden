import { Command } from "../base";
import { LinkSourceCommand } from "./source";
import { LinkModuleCommand } from "./module";
export declare class LinkCommand extends Command {
    name: string;
    help: string;
    subCommands: (typeof LinkSourceCommand | typeof LinkModuleCommand)[];
    action(): Promise<{}>;
}
//# sourceMappingURL=link.d.ts.map