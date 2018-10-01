import { BuildTask } from "./build";
import { Module } from "../types/module";
import { PublishResult } from "../types/plugin/outputs";
import { Task } from "../tasks/base";
import { Garden } from "../garden";
export interface PublishTaskParams {
    garden: Garden;
    module: Module;
    forceBuild: boolean;
}
export declare class PublishTask extends Task {
    type: string;
    private module;
    private forceBuild;
    constructor({ garden, module, forceBuild }: PublishTaskParams);
    getDependencies(): Promise<BuildTask[]>;
    getName(): string;
    getDescription(): string;
    process(): Promise<PublishResult>;
}
//# sourceMappingURL=publish.d.ts.map