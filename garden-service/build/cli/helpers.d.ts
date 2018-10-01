import { ParameterValues, Parameter } from "../commands/base";
export declare const styleConfig: {
    usagePrefix: (str: any) => string;
    usageCommandPlaceholder: (str: any) => string;
    usagePositionals: (str: any) => string;
    usageArgsPlaceholder: (str: any) => string;
    usageOptionsPlaceholder: (str: any) => string;
    group: (str: string) => string;
    flags: (str: any, _type: any) => string;
    hints: (str: any) => string;
    groupError: (str: any) => string;
    flagsError: (str: any) => string;
    descError: (str: any) => string;
    hintsError: (str: any) => string;
    messages: (str: any) => string;
};
export declare const getKeys: (obj: any) => string[];
export declare const filterByKeys: (obj: any, keys: string[]) => any;
export declare type FalsifiedParams = {
    [key: string]: false;
};
/**
 * Returns the params that need to be overridden set to false
 */
export declare function falsifyConflictingParams(argv: any, params: ParameterValues<any>): FalsifiedParams;
export declare function getOptionSynopsis(key: string, { alias }: Parameter<any>): string;
export declare function getArgSynopsis(key: string, param: Parameter<any>): string;
export declare function prepareArgConfig(param: Parameter<any>): {
    desc: string;
    params: SywacOptionConfig[];
};
export interface SywacOptionConfig {
    desc: string | string[];
    type: string;
    defaultValue?: any;
    coerce?: Function;
    choices?: any[];
    required?: boolean;
    hints?: string;
    strict: true;
    mustExist: true;
}
export declare function prepareOptionConfig(param: Parameter<any>): SywacOptionConfig;
export declare function failOnInvalidOptions(argv: any, ctx: any): void;
//# sourceMappingURL=helpers.d.ts.map