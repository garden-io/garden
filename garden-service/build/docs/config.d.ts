import * as Joi from "joi";
interface RenderOpts {
    level?: number;
    required?: boolean;
}
export declare function renderSchemaDescription(description: Joi.Description, opts: RenderOpts): string;
export declare function generateConfigReferenceDocs(docsRoot: string): void;
export {};
//# sourceMappingURL=config.d.ts.map