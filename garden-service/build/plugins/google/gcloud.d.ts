/// <reference types="node" />
export interface GCloudParams {
    data?: Buffer;
    ignoreError?: boolean;
    silent?: boolean;
    timeout?: number;
    cwd?: string;
}
export interface GCloudOutput {
    code: number;
    output: string;
    stdout?: string;
    stderr?: string;
}
export declare class GCloud {
    account?: string;
    project?: string;
    constructor({ account, project }: {
        account?: string;
        project?: string;
    });
    call(args: string[], { data, ignoreError, silent, timeout, cwd }?: GCloudParams): Promise<GCloudOutput>;
    json(args: string[], opts?: GCloudParams): Promise<any>;
    tty(args: string[], { silent, cwd }?: {
        silent?: boolean;
        cwd?: string;
    }): Promise<GCloudOutput>;
    private prepareArgs;
}
//# sourceMappingURL=gcloud.d.ts.map