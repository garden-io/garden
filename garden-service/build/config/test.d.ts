import * as Joi from "joi";
export interface TestSpec {
}
export interface BaseTestSpec extends TestSpec {
    name: string;
    dependencies: string[];
    timeout: number | null;
}
export declare const baseTestSpecSchema: Joi.ObjectSchema;
export interface TestConfig<T extends TestSpec = TestSpec> extends BaseTestSpec {
    spec: T;
}
export declare const testConfigSchema: Joi.ObjectSchema;
//# sourceMappingURL=test.d.ts.map