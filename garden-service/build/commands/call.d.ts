import { Command, CommandResult, CommandParams, StringParameter } from "./base";
declare const callArgs: {
    serviceAndPath: StringParameter;
};
declare type Args = typeof callArgs;
export declare class CallCommand extends Command<Args> {
    name: string;
    help: string;
    description: string;
    arguments: {
        serviceAndPath: StringParameter;
    };
    action({ garden, args }: CommandParams<Args>): Promise<CommandResult>;
}
export {};
//# sourceMappingURL=call.d.ts.map