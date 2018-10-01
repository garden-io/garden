import { Primitive } from "./config/common";
export declare type ConfigValue = Primitive | Primitive[] | Object[];
export declare type SetManyParam = {
    keyPath: Array<string>;
    value: ConfigValue;
}[];
export declare abstract class ConfigStore<T extends object = any> {
    private config;
    protected configPath: string;
    constructor(projectPath: string);
    abstract getConfigPath(projectPath: string): string;
    abstract validate(config: any): T;
    /**
     * Would've been nice to allow something like: set(["path", "to", "valA", valA], ["path", "to", "valB", valB]...)
     * but Typescript support is missing at the moment
     */
    set(param: SetManyParam): any;
    set(keyPath: string[], value: ConfigValue): any;
    get(): Promise<T>;
    get(keyPath: string[]): Promise<Object | ConfigValue>;
    clear(): Promise<void>;
    delete(keyPath: string[]): Promise<void>;
    private getConfig;
    private updateConfig;
    private ensureConfigFile;
    private loadConfig;
    private saveConfig;
    private throwKeyNotFound;
}
export interface KubernetesLocalConfig {
    username?: string;
    "previous-usernames"?: Array<string>;
}
export interface LinkedSource {
    name: string;
    path: string;
}
export interface LocalConfig {
    kubernetes?: KubernetesLocalConfig;
    linkedModuleSources?: LinkedSource[];
    linkedProjectSources?: LinkedSource[];
}
export declare const localConfigKeys: {
    kubernetes: "kubernetes";
    linkedModuleSources: "linkedModuleSources";
    linkedProjectSources: "linkedProjectSources";
};
export declare class LocalConfigStore extends ConfigStore<LocalConfig> {
    getConfigPath(projectPath: any): string;
    validate(config: any): LocalConfig;
}
//# sourceMappingURL=config-store.d.ts.map