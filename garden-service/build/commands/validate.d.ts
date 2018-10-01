import { Command, CommandParams, CommandResult } from "./base";
export declare class ValidateCommand extends Command {
    name: string;
    help: string;
    description: string;
    action({ garden }: CommandParams): Promise<CommandResult>;
}
//# sourceMappingURL=validate.d.ts.map