import { GardenError } from "../exceptions";
import { TaskResults } from "../task-graph";
import { LoggerType } from "../logger/logger";
import { ProcessResults } from "../process";
import { Garden } from "../garden";
export declare class ValidationError extends Error {
}
export interface ParameterConstructor<T> {
    help: string;
    required?: boolean;
    alias?: string;
    defaultValue?: T;
    valueName?: string;
    hints?: string;
    overrides?: string[];
}
export declare abstract class Parameter<T> {
    abstract type: string;
    _valueType: T;
    defaultValue: T | undefined;
    help: string;
    required: boolean;
    alias?: string;
    hints?: string;
    valueName: string;
    overrides: string[];
    constructor({ help, required, alias, defaultValue, valueName, overrides, hints }: ParameterConstructor<T>);
    coerce(input: T): T | undefined;
    abstract validate(input: string): T;
    autoComplete(): Promise<string[]>;
}
export declare class StringParameter extends Parameter<string> {
    type: string;
    validate(input: string): string;
}
export declare class StringOption extends Parameter<string | undefined> {
    type: string;
    validate(input?: string): string | undefined;
}
export declare class StringsParameter extends Parameter<string[] | undefined> {
    type: string;
    coerce(input: string[]): string[] | undefined;
    validate(input: string): string[];
}
export declare class PathParameter extends Parameter<string> {
    type: string;
    validate(input: string): string;
}
export declare class PathsParameter extends Parameter<string[]> {
    type: string;
    validate(input: string): string[];
}
export declare class NumberParameter extends Parameter<number> {
    type: string;
    validate(input: string): number;
}
export interface ChoicesConstructor extends ParameterConstructor<string> {
    choices: string[];
}
export declare class ChoicesParameter extends Parameter<string> {
    type: string;
    choices: string[];
    constructor(args: ChoicesConstructor);
    validate(input: string): string;
    autoComplete(): Promise<string[]>;
}
export declare class BooleanParameter extends Parameter<boolean> {
    type: string;
    validate(input: any): boolean;
}
export declare class EnvironmentOption extends StringParameter {
    constructor({ help }?: {
        help?: string | undefined;
    });
}
export declare type Parameters = {
    [key: string]: Parameter<any>;
};
export declare type ParameterValues<T extends Parameters> = {
    [P in keyof T]: T[P]["_valueType"];
};
export interface CommandConstructor {
    new (parent?: Command): Command;
}
export interface CommandResult<T = any> {
    result?: T;
    restartRequired?: boolean;
    errors?: GardenError[];
}
export interface CommandParams<T extends Parameters = {}, U extends Parameters = {}> {
    args: ParameterValues<T>;
    opts: ParameterValues<U>;
    garden: Garden;
}
export declare abstract class Command<T extends Parameters = {}, U extends Parameters = {}> {
    private parent?;
    abstract name: string;
    abstract help: string;
    description?: string;
    alias?: string;
    loggerType?: LoggerType;
    arguments?: T;
    options?: U;
    noProject: boolean;
    subCommands: CommandConstructor[];
    constructor(parent?: Command<{}, {}> | undefined);
    getFullName(): any;
    describe(): {
        name: string;
        fullName: any;
        help: string;
        description: string | undefined;
        arguments: {
            type: string;
            _valueType: any;
            defaultValue: any;
            help: string;
            required: boolean;
            alias?: string | undefined;
            hints?: string | undefined;
            valueName: string;
            overrides: string[];
            name: string;
            usageName: string;
        }[] | undefined;
        options: {
            type: string;
            _valueType: any;
            defaultValue: any;
            help: string;
            required: boolean;
            alias?: string | undefined;
            hints?: string | undefined;
            valueName: string;
            overrides: string[];
            name: string;
            usageName: string;
        }[] | undefined;
    };
    abstract action(params: CommandParams<T, U>): Promise<CommandResult>;
}
export declare function handleTaskResults(garden: Garden, taskType: string, results: ProcessResults): Promise<CommandResult<TaskResults>>;
export declare function describeParameters(args?: Parameters): {
    type: string;
    _valueType: any;
    defaultValue: any;
    help: string;
    required: boolean;
    alias?: string | undefined;
    hints?: string | undefined;
    valueName: string;
    overrides: string[];
    name: string;
    usageName: string;
}[] | undefined;
//# sourceMappingURL=base.d.ts.map