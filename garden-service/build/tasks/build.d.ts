import { Module } from "../types/module";
import { BuildResult } from "../types/plugin/outputs";
import { Task } from "../tasks/base";
import { Garden } from "../garden";
export interface BuildTaskParams {
    garden: Garden;
    module: Module;
    force: boolean;
}
export declare class BuildTask extends Task {
    type: string;
    private module;
    constructor({ garden, force, module }: BuildTaskParams);
    getDependencies(): Promise<BuildTask[]>;
    protected getName(): string;
    getDescription(): string;
    process(): Promise<BuildResult>;
}
//# sourceMappingURL=build.d.ts.map