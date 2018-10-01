import { Command, CommandResult, CommandParams } from "./base";
export declare class DevCommand extends Command {
    name: string;
    help: string;
    description: string;
    action({ garden }: CommandParams): Promise<CommandResult>;
}
//# sourceMappingURL=dev.d.ts.map