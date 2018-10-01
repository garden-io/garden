import { TaskResults } from "../task-graph";
import { ModuleVersion } from "../vcs/base";
import { Garden } from "../garden";
export declare class TaskDefinitionError extends Error {
}
export interface TaskParams {
    garden: Garden;
    force?: boolean;
    version: ModuleVersion;
}
export declare abstract class Task {
    abstract type: string;
    garden: Garden;
    id: string;
    force: boolean;
    version: ModuleVersion;
    dependencies: Task[];
    constructor(initArgs: TaskParams);
    getDependencies(): Promise<Task[]>;
    protected abstract getName(): string;
    getBaseKey(): string;
    getKey(): string;
    abstract getDescription(): string;
    abstract process(dependencyResults: TaskResults): Promise<any>;
}
//# sourceMappingURL=base.d.ts.map