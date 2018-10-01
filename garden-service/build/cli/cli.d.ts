import { BooleanParameter, Command, ChoicesParameter, Parameter, StringParameter, EnvironmentOption } from "../commands/base";
import { GardenError } from "../exceptions";
import { GardenConfig } from "../config/base";
export declare const MOCK_CONFIG: GardenConfig;
export declare const GLOBAL_OPTIONS: {
    root: StringParameter;
    silent: BooleanParameter;
    env: EnvironmentOption;
    loglevel: ChoicesParameter;
    output: ChoicesParameter;
};
export interface ParseResults {
    argv: any;
    code: number;
    errors: (GardenError | Error)[];
}
export declare class GardenCli {
    program: any;
    commands: {
        [key: string]: Command;
    };
    constructor();
    addGlobalOption(key: string, option: Parameter<any>): void;
    addCommand(command: Command, program: any): void;
    parse(): Promise<ParseResults>;
}
export declare function run(): Promise<void>;
//# sourceMappingURL=cli.d.ts.map