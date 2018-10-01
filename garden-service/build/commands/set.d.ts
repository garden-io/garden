import { SetSecretResult } from "../types/plugin/outputs";
import { Command, CommandResult, CommandParams, StringParameter } from "./base";
export declare class SetCommand extends Command {
    name: string;
    help: string;
    subCommands: (typeof SetSecretCommand)[];
    action(): Promise<{}>;
}
declare const setSecretArgs: {
    provider: StringParameter;
    key: StringParameter;
    value: StringParameter;
};
declare type SetArgs = typeof setSecretArgs;
export declare class SetSecretCommand extends Command<typeof setSecretArgs> {
    name: string;
    help: string;
    description: string;
    arguments: {
        provider: StringParameter;
        key: StringParameter;
        value: StringParameter;
    };
    action({ garden, args }: CommandParams<SetArgs>): Promise<CommandResult<SetSecretResult>>;
}
export {};
//# sourceMappingURL=set.d.ts.map