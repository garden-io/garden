import { Module } from "../types/module";
import { TestConfig } from "../config/test";
import { TestResult } from "../types/plugin/outputs";
import { Task, TaskParams } from "../tasks/base";
import { Garden } from "../garden";
export interface TestTaskParams {
    garden: Garden;
    module: Module;
    testConfig: TestConfig;
    force: boolean;
    forceBuild: boolean;
}
export declare class TestTask extends Task {
    type: string;
    private module;
    private testConfig;
    private forceBuild;
    constructor({ garden, module, testConfig, force, forceBuild, version }: TestTaskParams & TaskParams);
    static factory(initArgs: TestTaskParams): Promise<TestTask>;
    getDependencies(): Promise<Task[]>;
    getName(): string;
    getDescription(): string;
    process(): Promise<TestResult>;
    private getTestResult;
}
//# sourceMappingURL=test.d.ts.map