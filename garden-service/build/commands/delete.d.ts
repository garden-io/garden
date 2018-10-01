import { DeleteSecretResult, EnvironmentStatusMap } from "../types/plugin/outputs";
import { Command, CommandResult, CommandParams, StringParameter, StringsParameter } from "./base";
export declare class DeleteCommand extends Command {
    name: string;
    alias: string;
    help: string;
    subCommands: (typeof DeleteSecretCommand | typeof DeleteEnvironmentCommand | typeof DeleteServiceCommand)[];
    action(): Promise<{}>;
}
declare const deleteSecretArgs: {
    provider: StringParameter;
    key: StringParameter;
};
declare type DeleteSecretArgs = typeof deleteSecretArgs;
export declare class DeleteSecretCommand extends Command<typeof deleteSecretArgs> {
    name: string;
    help: string;
    description: string;
    arguments: {
        provider: StringParameter;
        key: StringParameter;
    };
    action({ garden, args }: CommandParams<DeleteSecretArgs>): Promise<CommandResult<DeleteSecretResult>>;
}
export declare class DeleteEnvironmentCommand extends Command {
    name: string;
    alias: string;
    help: string;
    description: string;
    action({ garden }: CommandParams): Promise<CommandResult<EnvironmentStatusMap>>;
}
declare const deleteServiceArgs: {
    service: StringsParameter;
};
declare type DeleteServiceArgs = typeof deleteServiceArgs;
export declare class DeleteServiceCommand extends Command {
    name: string;
    help: string;
    arguments: {
        service: StringsParameter;
    };
    description: string;
    action({ garden, args }: CommandParams<DeleteServiceArgs>): Promise<CommandResult>;
}
export {};
//# sourceMappingURL=delete.d.ts.map