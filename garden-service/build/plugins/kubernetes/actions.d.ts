import { GetServiceLogsResult, RunResult, TestResult } from "../../types/plugin/outputs";
import { ExecInServiceParams, GetServiceLogsParams, GetServiceOutputsParams, GetTestResultParams, RunModuleParams, TestModuleParams, DeleteServiceParams, RunServiceParams } from "../../types/plugin/params";
import { ContainerModule } from "../container";
import { ServiceStatus } from "../../types/service";
import { ValidateModuleParams } from "../../types/plugin/params";
export declare function validate(params: ValidateModuleParams<ContainerModule>): Promise<void>;
export declare function deleteService(params: DeleteServiceParams): Promise<ServiceStatus>;
export declare function getServiceOutputs({ service }: GetServiceOutputsParams<ContainerModule>): Promise<{
    host: string;
}>;
export declare function execInService(params: ExecInServiceParams<ContainerModule>): Promise<{
    code: number;
    output: string;
}>;
export declare function runModule({ ctx, module, command, interactive, runtimeContext, silent, timeout }: RunModuleParams<ContainerModule>): Promise<RunResult>;
export declare function runService({ ctx, service, interactive, runtimeContext, silent, timeout, logEntry }: RunServiceParams<ContainerModule>): Promise<RunResult>;
export declare function testModule({ ctx, interactive, module, runtimeContext, silent, testConfig, logEntry }: TestModuleParams<ContainerModule>): Promise<TestResult>;
export declare function getTestResult({ ctx, module, testName, version }: GetTestResultParams<ContainerModule>): Promise<TestResult | null>;
export declare function getServiceLogs({ ctx, service, stream, tail }: GetServiceLogsParams<ContainerModule>): Promise<GetServiceLogsResult>;
//# sourceMappingURL=actions.d.ts.map