import { Command } from "../base";
import { CreateProjectCommand } from "./project";
import { CreateModuleCommand } from "./module";
export declare class CreateCommand extends Command {
    name: string;
    alias: string;
    help: string;
    subCommands: (typeof CreateProjectCommand | typeof CreateModuleCommand)[];
    action(): Promise<{}>;
}
//# sourceMappingURL=create.d.ts.map