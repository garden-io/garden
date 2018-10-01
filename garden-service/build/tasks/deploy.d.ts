import { LogEntry } from "../logger/log-entry";
import { Task } from "./base";
import { Service, ServiceStatus } from "../types/service";
import { Module } from "../types/module";
import { Garden } from "../garden";
export interface DeployTaskParams {
    garden: Garden;
    service: Service;
    force: boolean;
    forceBuild: boolean;
    logEntry?: LogEntry;
}
export declare class DeployTask extends Task {
    type: string;
    private service;
    private forceBuild;
    private logEntry?;
    constructor({ garden, service, force, forceBuild, logEntry }: DeployTaskParams);
    getDependencies(): Promise<Task[]>;
    protected getName(): string;
    getDescription(): string;
    process(): Promise<ServiceStatus>;
}
export declare function getDeployTasks({ garden, module, serviceNames, force, forceBuild, includeDependants }: {
    garden: Garden;
    module: Module;
    serviceNames?: string[] | null;
    force?: boolean;
    forceBuild?: boolean;
    includeDependants?: boolean;
}): Promise<DeployTask[]>;
//# sourceMappingURL=deploy.d.ts.map