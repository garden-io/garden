/// <reference types="node" />
import { ChildProcess } from "child_process";
export interface KubectlParams {
    data?: Buffer;
    ignoreError?: boolean;
    silent?: boolean;
    timeout?: number;
    tty?: boolean;
}
export interface KubectlOutput {
    code: number;
    output: string;
    stdout?: string;
    stderr?: string;
}
export interface ApplyOptions {
    dryRun?: boolean;
    force?: boolean;
    pruneSelector?: string;
    namespace?: string;
}
export declare const KUBECTL_DEFAULT_TIMEOUT = 300;
export declare class Kubectl {
    context?: string;
    namespace?: string;
    configPath?: string;
    constructor({ context, namespace, configPath }: {
        context: string;
        namespace?: string;
        configPath?: string;
    });
    call(args: string[], { data, ignoreError, silent, timeout }?: KubectlParams): Promise<KubectlOutput>;
    json(args: string[], opts?: KubectlParams): Promise<KubectlOutput>;
    tty(args: string[], opts?: KubectlParams): Promise<KubectlOutput>;
    spawn(args: string[]): ChildProcess;
    private getExececutable;
    private prepareArgs;
}
export declare function kubectl(context: string, namespace?: string): Kubectl;
export declare function apply(context: string, obj: object, params: ApplyOptions): Promise<any>;
export declare function applyMany(context: string, objects: object[], { dryRun, force, namespace, pruneSelector }?: ApplyOptions): Promise<any>;
export interface DeleteObjectsParams {
    context: string;
    namespace: string;
    labelKey: string;
    labelValue: string;
    objectTypes: string[];
    includeUninitialized?: boolean;
}
export declare function deleteObjectsByLabel({ context, namespace, labelKey, labelValue, objectTypes, includeUninitialized, }: DeleteObjectsParams): Promise<any>;
//# sourceMappingURL=kubectl.d.ts.map