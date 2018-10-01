import { Command, CommandParams, CommandResult, StringParameter, PathsParameter } from "../base";
import { ModuleConfigOpts, ProjectConfigOpts } from "./config-templates";
declare const createProjectOptions: {
    "module-dirs": PathsParameter;
    name: StringParameter;
};
declare const createProjectArguments: {
    "project-dir": StringParameter;
};
declare type Args = typeof createProjectArguments;
declare type Opts = typeof createProjectOptions;
interface CreateProjectResult extends CommandResult {
    result: {
        projectConfig: ProjectConfigOpts;
        moduleConfigs: ModuleConfigOpts[];
    };
}
export declare class CreateProjectCommand extends Command<Args, Opts> {
    name: string;
    alias: string;
    help: string;
    description: string;
    noProject: boolean;
    arguments: {
        "project-dir": StringParameter;
    };
    options: {
        "module-dirs": PathsParameter;
        name: StringParameter;
    };
    action({ garden, args, opts }: CommandParams<Args, Opts>): Promise<CreateProjectResult>;
}
export {};
//# sourceMappingURL=project.d.ts.map