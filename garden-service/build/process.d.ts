import { Module } from "./types/module";
import { Service } from "./types/service";
import { Task } from "./tasks/base";
import { TaskResults } from "./task-graph";
import { Garden } from "./garden";
export declare type ProcessHandler = (module: Module) => Promise<Task[]>;
interface ProcessParams {
    garden: Garden;
    watch: boolean;
    handler: ProcessHandler;
    changeHandler?: ProcessHandler;
}
export interface ProcessModulesParams extends ProcessParams {
    modules: Module[];
}
export interface ProcessServicesParams extends ProcessParams {
    services: Service[];
}
export interface ProcessResults {
    taskResults: TaskResults;
    restartRequired?: boolean;
}
export declare function processServices({ garden, services, watch, handler, changeHandler }: ProcessServicesParams): Promise<ProcessResults>;
export declare function processModules({ garden, modules, watch, handler, changeHandler }: ProcessModulesParams): Promise<ProcessResults>;
export {};
//# sourceMappingURL=process.d.ts.map