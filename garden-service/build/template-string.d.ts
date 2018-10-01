import { ConfigContext } from "./config/config-context";
export declare type StringOrStringPromise = Promise<string> | string;
/**
 * Parse and resolve a templated string, with the given context. The template format is similar to native JS templated
 * strings but only supports simple lookups from the given context, e.g. "prefix-${nested.key}-suffix", and not
 * arbitrary JS code.
 *
 * The context should be a ConfigContext instance. The optional `stack` parameter is used to detect circular
 * dependencies when resolving context variables.
 */
export declare function resolveTemplateString(string: string, context: ConfigContext, stack?: string[]): Promise<string>;
/**
 * Recursively parses and resolves all templated strings in the given object.
 */
export declare function resolveTemplateStrings<T extends object>(obj: T, context: ConfigContext): Promise<T>;
//# sourceMappingURL=template-string.d.ts.map