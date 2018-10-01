import { BuildTask } from "./build";
import { Module } from "../types/module";
import { PushResult } from "../types/plugin/outputs";
import { Task } from "../tasks/base";
import { Garden } from "../garden";
export interface PushTaskParams {
    garden: Garden;
    module: Module;
    forceBuild: boolean;
}
export declare class PushTask extends Task {
    type: string;
    private module;
    private forceBuild;
    constructor({ garden, module, forceBuild }: PushTaskParams);
    getDependencies(): Promise<BuildTask[]>;
    getName(): string;
    getDescription(): string;
    process(): Promise<PushResult>;
}
//# sourceMappingURL=push.d.ts.map