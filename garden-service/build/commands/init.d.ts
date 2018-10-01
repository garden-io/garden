import { BooleanParameter, Command, CommandResult, CommandParams } from "./base";
declare const initOpts: {
    force: BooleanParameter;
};
declare type Opts = typeof initOpts;
export declare class InitCommand extends Command {
    name: string;
    help: string;
    description: string;
    options: {
        force: BooleanParameter;
    };
    action({ garden, opts }: CommandParams<{}, Opts>): Promise<CommandResult<{}>>;
}
export {};
//# sourceMappingURL=init.d.ts.map