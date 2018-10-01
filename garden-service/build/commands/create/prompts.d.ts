import * as inquirer from "inquirer";
import { ModuleType } from "./config-templates";
export interface ModuleTypeChoice extends inquirer.objects.ChoiceOption {
    value: ModuleType;
}
export interface ModuleTypeMap {
    type: ModuleType;
}
export interface ModuleTypeAndName extends ModuleTypeMap {
    name: string;
}
export interface Prompts {
    addConfigForModule: (...args: any[]) => Promise<ModuleTypeMap>;
    addModule: (...args: any[]) => Promise<ModuleTypeAndName>;
    repeatAddModule: (...args: any[]) => Promise<ModuleTypeAndName[]>;
}
export declare function repeatAddModule(): Promise<ModuleTypeAndName[]>;
export declare const prompts: Prompts;
//# sourceMappingURL=prompts.d.ts.map