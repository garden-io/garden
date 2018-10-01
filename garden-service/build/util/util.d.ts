/// <reference path="../../node_modules/@types/lodash/common/common.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/array.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/collection.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/date.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/function.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/lang.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/math.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/number.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/object.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/seq.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/string.d.ts" />
/// <reference path="../../node_modules/@types/lodash/common/util.d.ts" />
/// <reference types="node" />
import Bluebird = require("bluebird");
import { ResolvableProps } from "bluebird";
import * as klaw from "klaw";
export declare type HookCallback = (callback?: () => void) => void;
export declare type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export declare type Diff<T, U> = T extends U ? never : T;
export declare type Nullable<T> = {
    [P in keyof T]: T[P] | null;
};
export declare type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Array<infer U> ? Array<DeepPartial<U>> : T[P] extends ReadonlyArray<infer V> ? ReadonlyArray<DeepPartial<V>> : DeepPartial<T[P]>;
};
export declare type Unpacked<T> = T extends (infer U)[] ? U : T extends (...args: any[]) => infer V ? V : T extends Promise<infer W> ? W : T;
export declare function shutdown(code: any): void;
export declare function registerCleanupFunction(name: string, func: HookCallback): void;
export declare function scanDirectory(path: string, opts?: klaw.Options): AsyncIterableIterator<klaw.Item>;
export declare function getChildDirNames(parentDir: string): Promise<string[]>;
export declare function getIgnorer(rootPath: string): Promise<any>;
export declare function sleep(msec: any): Promise<{}>;
export interface SpawnParams {
    timeout?: number;
    cwd?: string;
    data?: Buffer;
    ignoreError?: boolean;
    env?: {
        [key: string]: string | undefined;
    };
}
export interface SpawnPtyParams extends SpawnParams {
    silent?: boolean;
    tty?: boolean;
    bufferOutput?: boolean;
}
export interface SpawnOutput {
    code: number;
    output: string;
    stdout?: string;
    stderr?: string;
    proc: any;
}
export declare function spawn(cmd: string, args: string[], { timeout, cwd, data, ignoreError, env }?: SpawnParams): Promise<SpawnOutput>;
export declare function spawnPty(cmd: string, args: string[], { silent, tty, timeout, cwd, bufferOutput, data, ignoreError, }?: SpawnPtyParams): Bluebird<any>;
export declare function dumpYaml(yamlPath: any, data: any): Promise<void>;
/**
 * Encode multiple objects as one multi-doc YAML file
 */
export declare function encodeYamlMulti(objects: object[]): string;
/**
 * Encode and write multiple objects as a multi-doc YAML file
 */
export declare function dumpYamlMulti(yamlPath: string, objects: object[]): Promise<void>;
/**
 * Splits the input string on the first occurrence of `delimiter`.
 */
export declare function splitFirst(s: string, delimiter: string): string[];
/**
 * Recursively resolves all promises in the given input,
 * walking through all object keys and array items.
 */
export declare function deepResolve<T>(value: T | Iterable<T> | Iterable<PromiseLike<T>> | ResolvableProps<T>): Promise<T | Iterable<T> | {
    [K in keyof T]: T[K];
}>;
/**
 * Recursively maps over all keys in the input and resolves the resulting promises,
 * walking through all object keys and array items.
 */
export declare function asyncDeepMap<T>(obj: T, mapper: (value: any) => Promise<any>, options?: Bluebird.ConcurrencyOption): Promise<T>;
export declare function omitUndefined(o: object): import("_").Dictionary<any>;
export declare function serializeObject(o: any): string;
export declare function deserializeObject(s: string): any;
export declare function serializeValues(o: {
    [key: string]: any;
}): {
    [key: string]: string;
};
export declare function deserializeValues(o: object): object;
export declare function getEnumKeys(Enum: any): string[];
export declare function highlightYaml(s: string): string;
export declare function loadYamlFile(path: string): Promise<any>;
export interface ObjectWithName {
    name: string;
}
export declare function getNames<T extends ObjectWithName>(array: T[]): string[];
export declare function findByName<T>(array: T[], name: string): T | undefined;
/**
 * Converts a Windows-style path to a cygwin style path (e.g. C:\some\folder -> /cygdrive/c/some/folder).
 */
export declare function toCygwinPath(path: string): string;
/**
 * Converts a string identifier to the appropriate casing and style for use in environment variable names.
 * (e.g. "my-service" -> "MY_SERVICE")
 */
export declare function getEnvVarName(identifier: string): string;
/**
 * Picks the specified keys from the given object, and throws an error if one or more keys are not found.
 */
export declare function pickKeys<T extends object, U extends keyof T>(obj: T, keys: U[], description?: string): Pick<T, U>;
//# sourceMappingURL=util.d.ts.map