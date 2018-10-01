import { Command, CommandResult, CommandParams, StringParameter } from "./base";
import { ContextStatus } from "../actions";
export declare class GetCommand extends Command {
    name: string;
    help: string;
    subCommands: (typeof GetSecretCommand | typeof GetStatusCommand)[];
    action(): Promise<{}>;
}
declare const getSecretArgs: {
    provider: StringParameter;
    key: StringParameter;
};
declare type GetArgs = typeof getSecretArgs;
export declare class GetSecretCommand extends Command<typeof getSecretArgs> {
    name: string;
    help: string;
    description: string;
    arguments: {
        provider: StringParameter;
        key: StringParameter;
    };
    action({ garden, args }: CommandParams<GetArgs>): Promise<CommandResult>;
}
export declare class GetStatusCommand extends Command {
    name: string;
    help: string;
    action({ garden }: CommandParams): Promise<CommandResult<ContextStatus>>;
}
export {};
//# sourceMappingURL=get.d.ts.map