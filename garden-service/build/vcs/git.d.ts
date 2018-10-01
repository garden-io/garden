import { VcsHandler, RemoteSourceParams } from "./base";
export declare const helpers: {
    gitCli: (cwd: string) => (cmd: string, args: string[]) => Promise<string>;
};
export declare class GitHandler extends VcsHandler {
    name: string;
    getTreeVersion(path: string): Promise<{
        latestCommit: any;
        dirtyTimestamp: number | null;
    }>;
    ensureRemoteSource({ url, name, logEntry, sourceType }: RemoteSourceParams): Promise<string>;
    updateRemoteSource({ url, name, sourceType, logEntry }: RemoteSourceParams): Promise<void>;
}
//# sourceMappingURL=git.d.ts.map