import { Module } from "../types/module";
import { Service } from "../types/service";
export declare type Cycle = string[];
export declare function detectCircularDependencies(modules: Module[], services: Service[]): Promise<void>;
export declare function detectCycles(graph: any, vertices: string[]): Cycle[];
//# sourceMappingURL=detectCycles.d.ts.map