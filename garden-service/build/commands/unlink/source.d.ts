import { Command, CommandResult, StringsParameter, BooleanParameter, CommandParams } from "../base";
import { LinkedSource } from "../../config-store";
declare const unlinkSourceArguments: {
    source: StringsParameter;
};
declare const unlinkSourceOptions: {
    all: BooleanParameter;
};
declare type Args = typeof unlinkSourceArguments;
declare type Opts = typeof unlinkSourceOptions;
export declare class UnlinkSourceCommand extends Command<Args, Opts> {
    name: string;
    help: string;
    arguments: {
        source: StringsParameter;
    };
    options: {
        all: BooleanParameter;
    };
    description: string;
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<LinkedSource[]>>;
}
export {};
//# sourceMappingURL=source.d.ts.map