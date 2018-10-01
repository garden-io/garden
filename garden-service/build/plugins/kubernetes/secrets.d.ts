import { KubeApi } from "./api";
import { SecretRef } from "./kubernetes";
import { GetSecretParams, SetSecretParams, DeleteSecretParams } from "../../types/plugin/params";
export declare function getSecret({ ctx, key }: GetSecretParams): Promise<{
    value: string;
} | {
    value: null;
}>;
export declare function setSecret({ ctx, key, value }: SetSecretParams): Promise<{}>;
export declare function deleteSecret({ ctx, key }: DeleteSecretParams): Promise<{
    found: boolean;
}>;
/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 */
export declare function ensureSecret(api: KubeApi, secretRef: SecretRef, targetNamespace: string): Promise<void>;
//# sourceMappingURL=secrets.d.ts.map