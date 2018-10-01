import { PrepareEnvironmentParams, CleanupEnvironmentParams, GetEnvironmentStatusParams } from "../../types/plugin/params";
export declare function getRemoteEnvironmentStatus({ ctx }: GetEnvironmentStatusParams): Promise<{
    ready: boolean;
    needUserInput: boolean;
}>;
export declare function getLocalEnvironmentStatus({ ctx }: GetEnvironmentStatusParams): Promise<{
    ready: boolean;
    needUserInput: boolean;
}>;
export declare function prepareRemoteEnvironment({ ctx, logEntry }: PrepareEnvironmentParams): Promise<{}>;
export declare function prepareLocalEnvironment({ ctx, force, logEntry }: PrepareEnvironmentParams): Promise<{}>;
export declare function cleanupEnvironment({ ctx, logEntry }: CleanupEnvironmentParams): Promise<{}>;
//# sourceMappingURL=init.d.ts.map