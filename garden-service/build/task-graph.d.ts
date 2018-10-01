import { Task } from "./tasks/base";
import { Garden } from "./garden";
export interface TaskResult {
    type: string;
    description: string;
    output?: any;
    dependencyResults?: TaskResults;
    error?: Error;
}
export interface TaskResults {
    [baseKey: string]: TaskResult;
}
export declare const DEFAULT_CONCURRENCY = 4;
export declare class TaskGraph {
    private garden;
    private concurrency;
    private roots;
    private index;
    private inProgress;
    private logEntryMap;
    private resultCache;
    private opQueue;
    constructor(garden: Garden, concurrency?: number);
    addTask(task: Task): Promise<void>;
    processTasks(): Promise<TaskResults>;
    private addTaskInternal;
    private getNode;
    private processTasksInternal;
    private completeTask;
    private getPredecessor;
    private addDependencies;
    private addDependants;
    private inherit;
    private remove;
    private cancelDependants;
    private logTask;
    private logTaskComplete;
    private initLogging;
    private logTaskError;
}
//# sourceMappingURL=task-graph.d.ts.map