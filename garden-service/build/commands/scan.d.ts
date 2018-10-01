import { DeepPrimitiveMap } from "../config/common";
import { Command, CommandParams, CommandResult } from "./base";
export declare class ScanCommand extends Command {
    name: string;
    help: string;
    action({ garden }: CommandParams): Promise<CommandResult<DeepPrimitiveMap>>;
}
//# sourceMappingURL=scan.d.ts.map