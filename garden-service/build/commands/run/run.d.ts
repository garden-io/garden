import { RuntimeContext } from "../../types/service";
import { Command } from "../base";
import { RunModuleCommand } from "./module";
import { RunServiceCommand } from "./service";
import { RunTestCommand } from "./test";
import { Garden } from "../../garden";
export declare class RunCommand extends Command {
    name: string;
    alias: string;
    help: string;
    subCommands: (typeof RunModuleCommand | typeof RunServiceCommand | typeof RunTestCommand)[];
    action(): Promise<{}>;
}
export declare function printRuntimeContext(garden: Garden, runtimeContext: RuntimeContext): void;
//# sourceMappingURL=run.d.ts.map