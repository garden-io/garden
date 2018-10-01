"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const Joi = require("joi");
const uuid = require("uuid");
const exceptions_1 = require("../exceptions");
const chalk_1 = require("chalk");
// export type ConfigWithSpec<S extends object> = <T extends S>{
//   spec: Omit<T, keyof S> & Partial<S>
// }
exports.enumToArray = Enum => Object.values(Enum).filter(k => typeof k === "string");
exports.joiPrimitive = () => Joi.alternatives().try(Joi.number(), Joi.string(), Joi.boolean())
    .description("Number, string or boolean");
exports.identifierRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
exports.envVarRegex = /^(?!GARDEN)[A-Z_][A-Z0-9_]*$/;
exports.joiIdentifier = () => Joi.string()
    .regex(exports.identifierRegex)
    .max(63)
    .description("Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, " +
    "and cannot end with a dash) and additionally cannot contain consecutive dashes or be longer than 63 characters.");
exports.joiStringMap = (valueSchema) => Joi
    .object().pattern(/.+/, valueSchema);
exports.joiIdentifierMap = (valueSchema) => Joi
    .object().pattern(exports.identifierRegex, valueSchema)
    .default(() => ({}), "{}")
    .description("Key/value map, keys must be valid identifiers.");
exports.joiVariables = () => Joi
    .object().pattern(/[\w\d]+/i, exports.joiPrimitive())
    .default(() => ({}), "{}")
    .unknown(false)
    .description("Key/value map, keys may contain letters and numbers, and values must be primitives.");
exports.joiEnvVarName = () => Joi
    .string().regex(exports.envVarRegex)
    .description("Valid POSIX environment variable name (may contain letters, numbers and underscores and must start with a " +
    "letter). Must be uppercase, and must not start with `GARDEN`.");
exports.joiEnvVars = () => Joi
    .object().pattern(exports.envVarRegex, exports.joiPrimitive())
    .default(() => ({}), "{}")
    .unknown(false)
    .description("Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
    "(must be uppercase, may not start with `GARDEN`) and values must be primitives.");
exports.joiArray = (schema) => Joi
    .array().items(schema)
    .default(() => [], "[]");
exports.joiRepositoryUrl = () => Joi
    .string()
    .uri({
    // TODO Support other protocols?
    scheme: [
        "git",
        /git\+https?/,
        "https",
        "file",
    ],
})
    .description("A remote respository URL. Currently only supports git servers. Use hash notation (#) to point to" +
    " a specific branch or tag")
    .example("<git remote url>#<branch|tag> or git+https://github.com/organization/some-module.git#v2.0");
function isPrimitive(value) {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
exports.isPrimitive = isPrimitive;
const joiPathPlaceholder = uuid.v4();
const joiPathPlaceholderRegex = new RegExp(joiPathPlaceholder, "g");
const joiOptions = {
    abortEarly: false,
    language: {
        key: `key ${joiPathPlaceholder} `,
        object: {
            allowUnknown: `!!key "{{!child}}" is not allowed at path ${joiPathPlaceholder}`,
            child: "!!\"{{!child}}\": {{reason}}",
            xor: `!!object at ${joiPathPlaceholder} only allows one of {{peersWithLabels}}`,
        },
    },
};
function validate(value, schema, { context = "", ErrorClass = exceptions_1.ConfigurationError } = {}) {
    const result = schema.validate(value, joiOptions);
    const error = result.error;
    if (error) {
        const description = schema.describe();
        const errorDetails = error.details.map((e) => {
            // render the key path in a much nicer way
            let renderedPath = ".";
            if (e.path.length) {
                renderedPath = "";
                let d = description;
                for (const part of e.path) {
                    if (d.children && d.children[part]) {
                        renderedPath += "." + part;
                        d = d.children[part];
                    }
                    else if (d.patterns) {
                        for (const p of d.patterns) {
                            if (part.match(new RegExp(p.regex.slice(1, -1)))) {
                                renderedPath += `[${part}]`;
                                d = p.rule;
                                break;
                            }
                        }
                    }
                    else {
                        renderedPath += `[${part}]`;
                    }
                }
            }
            // a little hack to always use full key paths instead of just the label
            e.message = e.message.replace(joiPathPlaceholderRegex, chalk_1.default.underline(renderedPath || "."));
            return e;
        });
        const msgPrefix = context ? `Error validating ${context}` : "Validation error";
        const errorDescription = errorDetails.map(e => e.message).join(", ");
        throw new ErrorClass(`${msgPrefix}: ${errorDescription}`, {
            value,
            context,
            errorDescription,
            errorDetails,
        });
    }
    return result.value;
}
exports.validate = validate;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbmZpZy9jb21tb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7QUFHSCwyQkFBMEI7QUFDMUIsNkJBQTRCO0FBQzVCLDhDQUFvRTtBQUNwRSxpQ0FBeUI7QUFPekIsZ0VBQWdFO0FBQ2hFLHdDQUF3QztBQUN4QyxJQUFJO0FBRVMsUUFBQSxXQUFXLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FDaEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxRQUFRLENBQ3RELENBQUE7QUFFWSxRQUFBLFlBQVksR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0tBQ2hHLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFBO0FBRTlCLFFBQUEsZUFBZSxHQUFHLCtCQUErQixDQUFBO0FBQ2pELFFBQUEsV0FBVyxHQUFHLDhCQUE4QixDQUFBO0FBRTVDLFFBQUEsYUFBYSxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUU7S0FDNUMsS0FBSyxDQUFDLHVCQUFlLENBQUM7S0FDdEIsR0FBRyxDQUFDLEVBQUUsQ0FBQztLQUNQLFdBQVcsQ0FDVixrSEFBa0g7SUFDbEgsaUhBQWlILENBQ2xILENBQUE7QUFFVSxRQUFBLFlBQVksR0FBRyxDQUFDLFdBQXNCLEVBQUUsRUFBRSxDQUFDLEdBQUc7S0FDeEQsTUFBTSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxXQUFXLENBQUMsQ0FBQTtBQUV6QixRQUFBLGdCQUFnQixHQUFHLENBQUMsV0FBc0IsRUFBRSxFQUFFLENBQUMsR0FBRztLQUM1RCxNQUFNLEVBQUUsQ0FBQyxPQUFPLENBQUMsdUJBQWUsRUFBRSxXQUFXLENBQUM7S0FDOUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDO0tBQ3pCLFdBQVcsQ0FBQyxnREFBZ0QsQ0FBQyxDQUFBO0FBRW5ELFFBQUEsWUFBWSxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUc7S0FDbEMsTUFBTSxFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxvQkFBWSxFQUFFLENBQUM7S0FDNUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDO0tBQ3pCLE9BQU8sQ0FBQyxLQUFLLENBQUM7S0FDZCxXQUFXLENBQUMscUZBQXFGLENBQUMsQ0FBQTtBQUV4RixRQUFBLGFBQWEsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHO0tBQ25DLE1BQU0sRUFBRSxDQUFDLEtBQUssQ0FBQyxtQkFBVyxDQUFDO0tBQzNCLFdBQVcsQ0FDViw0R0FBNEc7SUFDNUcsK0RBQStELENBQ2hFLENBQUE7QUFFVSxRQUFBLFVBQVUsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHO0tBQ2hDLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxtQkFBVyxFQUFFLG9CQUFZLEVBQUUsQ0FBQztLQUM3QyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUM7S0FDekIsT0FBTyxDQUFDLEtBQUssQ0FBQztLQUNkLFdBQVcsQ0FDViw4RkFBOEY7SUFDOUYsaUZBQWlGLENBQ2xGLENBQUE7QUFFVSxRQUFBLFFBQVEsR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRztLQUNwQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO0tBQ3JCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUE7QUFFYixRQUFBLGdCQUFnQixHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUc7S0FDdEMsTUFBTSxFQUFFO0tBQ1IsR0FBRyxDQUFDO0lBQ0gsZ0NBQWdDO0lBQ2hDLE1BQU0sRUFBRTtRQUNOLEtBQUs7UUFDTCxhQUFhO1FBQ2IsT0FBTztRQUNQLE1BQU07S0FDUDtDQUNGLENBQUM7S0FDRCxXQUFXLENBQ1Ysa0dBQWtHO0lBQ2xHLDJCQUEyQixDQUM1QjtLQUNBLE9BQU8sQ0FBQywyRkFBMkYsQ0FBQyxDQUFBO0FBRXZHLFNBQWdCLFdBQVcsQ0FBQyxLQUFVO0lBQ3BDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTLENBQUE7QUFDN0YsQ0FBQztBQUZELGtDQUVDO0FBRUQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUE7QUFDcEMsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLENBQUMsQ0FBQTtBQUNuRSxNQUFNLFVBQVUsR0FBRztJQUNqQixVQUFVLEVBQUUsS0FBSztJQUNqQixRQUFRLEVBQUU7UUFDUixHQUFHLEVBQUUsT0FBTyxrQkFBa0IsR0FBRztRQUNqQyxNQUFNLEVBQUU7WUFDTixZQUFZLEVBQUUsNkNBQTZDLGtCQUFrQixFQUFFO1lBQy9FLEtBQUssRUFBRSw4QkFBOEI7WUFDckMsR0FBRyxFQUFFLGVBQWUsa0JBQWtCLHlDQUF5QztTQUNoRjtLQUNGO0NBQ0YsQ0FBQTtBQU9ELFNBQWdCLFFBQVEsQ0FDdEIsS0FBUSxFQUNSLE1BQWtCLEVBQ2xCLEVBQUUsT0FBTyxHQUFHLEVBQUUsRUFBRSxVQUFVLEdBQUcsK0JBQWtCLEtBQXNCLEVBQUU7SUFFdkUsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUE7SUFDakQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQTtJQUUxQixJQUFJLEtBQUssRUFBRTtRQUNULE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQTtRQUVyQyxNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQzNDLDBDQUEwQztZQUMxQyxJQUFJLFlBQVksR0FBRyxHQUFHLENBQUE7WUFFdEIsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDakIsWUFBWSxHQUFHLEVBQUUsQ0FBQTtnQkFDakIsSUFBSSxDQUFDLEdBQUcsV0FBVyxDQUFBO2dCQUVuQixLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUU7b0JBQ3pCLElBQUksQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFO3dCQUNsQyxZQUFZLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQTt3QkFDMUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUE7cUJBQ3JCO3lCQUFNLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRTt3QkFDckIsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFOzRCQUMxQixJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dDQUNoRCxZQUFZLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQTtnQ0FDM0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUE7Z0NBQ1YsTUFBSzs2QkFDTjt5QkFDRjtxQkFDRjt5QkFBTTt3QkFDTCxZQUFZLElBQUksSUFBSSxJQUFJLEdBQUcsQ0FBQTtxQkFDNUI7aUJBQ0Y7YUFDRjtZQUVELHVFQUF1RTtZQUN2RSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLHVCQUF1QixFQUFFLGVBQUssQ0FBQyxTQUFTLENBQUMsWUFBWSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUE7WUFFNUYsT0FBTyxDQUFDLENBQUE7UUFDVixDQUFDLENBQUMsQ0FBQTtRQUVGLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsb0JBQW9CLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQTtRQUM5RSxNQUFNLGdCQUFnQixHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRXBFLE1BQU0sSUFBSSxVQUFVLENBQUMsR0FBRyxTQUFTLEtBQUssZ0JBQWdCLEVBQUUsRUFBRTtZQUN4RCxLQUFLO1lBQ0wsT0FBTztZQUNQLGdCQUFnQjtZQUNoQixZQUFZO1NBQ2IsQ0FBQyxDQUFBO0tBQ0g7SUFFRCxPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUE7QUFDckIsQ0FBQztBQXZERCw0QkF1REMiLCJmaWxlIjoiY29uZmlnL2NvbW1vbi5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBKb2lPYmplY3QgfSBmcm9tIFwiam9pXCJcbmltcG9ydCAqIGFzIEpvaSBmcm9tIFwiam9pXCJcbmltcG9ydCAqIGFzIHV1aWQgZnJvbSBcInV1aWRcIlxuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVycm9yLCBMb2NhbENvbmZpZ0Vycm9yIH0gZnJvbSBcIi4uL2V4Y2VwdGlvbnNcIlxuaW1wb3J0IGNoYWxrIGZyb20gXCJjaGFsa1wiXG5cbmV4cG9ydCB0eXBlIFByaW1pdGl2ZSA9IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW5cblxuZXhwb3J0IGludGVyZmFjZSBQcmltaXRpdmVNYXAgeyBba2V5OiBzdHJpbmddOiBQcmltaXRpdmUgfVxuZXhwb3J0IGludGVyZmFjZSBEZWVwUHJpbWl0aXZlTWFwIHsgW2tleTogc3RyaW5nXTogUHJpbWl0aXZlIHwgRGVlcFByaW1pdGl2ZU1hcCB9XG5cbi8vIGV4cG9ydCB0eXBlIENvbmZpZ1dpdGhTcGVjPFMgZXh0ZW5kcyBvYmplY3Q+ID0gPFQgZXh0ZW5kcyBTPntcbi8vICAgc3BlYzogT21pdDxULCBrZXlvZiBTPiAmIFBhcnRpYWw8Uz5cbi8vIH1cblxuZXhwb3J0IGNvbnN0IGVudW1Ub0FycmF5ID0gRW51bSA9PiAoXG4gIE9iamVjdC52YWx1ZXMoRW51bSkuZmlsdGVyKGsgPT4gdHlwZW9mIGsgPT09IFwic3RyaW5nXCIpIGFzIHN0cmluZ1tdXG4pXG5cbmV4cG9ydCBjb25zdCBqb2lQcmltaXRpdmUgPSAoKSA9PiBKb2kuYWx0ZXJuYXRpdmVzKCkudHJ5KEpvaS5udW1iZXIoKSwgSm9pLnN0cmluZygpLCBKb2kuYm9vbGVhbigpKVxuICAuZGVzY3JpcHRpb24oXCJOdW1iZXIsIHN0cmluZyBvciBib29sZWFuXCIpXG5cbmV4cG9ydCBjb25zdCBpZGVudGlmaWVyUmVnZXggPSAvXlthLXpdW2EtejAtOV0qKC1bYS16MC05XSspKiQvXG5leHBvcnQgY29uc3QgZW52VmFyUmVnZXggPSAvXig/IUdBUkRFTilbQS1aX11bQS1aMC05X10qJC9cblxuZXhwb3J0IGNvbnN0IGpvaUlkZW50aWZpZXIgPSAoKSA9PiBKb2kuc3RyaW5nKClcbiAgLnJlZ2V4KGlkZW50aWZpZXJSZWdleClcbiAgLm1heCg2MylcbiAgLmRlc2NyaXB0aW9uKFxuICAgIFwiVmFsaWQgUkZDMTAzNS9SRkMxMTIzIChETlMpIGxhYmVsIChtYXkgY29udGFpbiBsb3dlcmNhc2UgbGV0dGVycywgbnVtYmVycyBhbmQgZGFzaGVzLCBtdXN0IHN0YXJ0IHdpdGggYSBsZXR0ZXIsIFwiICtcbiAgICBcImFuZCBjYW5ub3QgZW5kIHdpdGggYSBkYXNoKSBhbmQgYWRkaXRpb25hbGx5IGNhbm5vdCBjb250YWluIGNvbnNlY3V0aXZlIGRhc2hlcyBvciBiZSBsb25nZXIgdGhhbiA2MyBjaGFyYWN0ZXJzLlwiLFxuICApXG5cbmV4cG9ydCBjb25zdCBqb2lTdHJpbmdNYXAgPSAodmFsdWVTY2hlbWE6IEpvaU9iamVjdCkgPT4gSm9pXG4gIC5vYmplY3QoKS5wYXR0ZXJuKC8uKy8sIHZhbHVlU2NoZW1hKVxuXG5leHBvcnQgY29uc3Qgam9pSWRlbnRpZmllck1hcCA9ICh2YWx1ZVNjaGVtYTogSm9pT2JqZWN0KSA9PiBKb2lcbiAgLm9iamVjdCgpLnBhdHRlcm4oaWRlbnRpZmllclJlZ2V4LCB2YWx1ZVNjaGVtYSlcbiAgLmRlZmF1bHQoKCkgPT4gKHt9KSwgXCJ7fVwiKVxuICAuZGVzY3JpcHRpb24oXCJLZXkvdmFsdWUgbWFwLCBrZXlzIG11c3QgYmUgdmFsaWQgaWRlbnRpZmllcnMuXCIpXG5cbmV4cG9ydCBjb25zdCBqb2lWYXJpYWJsZXMgPSAoKSA9PiBKb2lcbiAgLm9iamVjdCgpLnBhdHRlcm4oL1tcXHdcXGRdKy9pLCBqb2lQcmltaXRpdmUoKSlcbiAgLmRlZmF1bHQoKCkgPT4gKHt9KSwgXCJ7fVwiKVxuICAudW5rbm93bihmYWxzZSlcbiAgLmRlc2NyaXB0aW9uKFwiS2V5L3ZhbHVlIG1hcCwga2V5cyBtYXkgY29udGFpbiBsZXR0ZXJzIGFuZCBudW1iZXJzLCBhbmQgdmFsdWVzIG11c3QgYmUgcHJpbWl0aXZlcy5cIilcblxuZXhwb3J0IGNvbnN0IGpvaUVudlZhck5hbWUgPSAoKSA9PiBKb2lcbiAgLnN0cmluZygpLnJlZ2V4KGVudlZhclJlZ2V4KVxuICAuZGVzY3JpcHRpb24oXG4gICAgXCJWYWxpZCBQT1NJWCBlbnZpcm9ubWVudCB2YXJpYWJsZSBuYW1lIChtYXkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzIGFuZCB1bmRlcnNjb3JlcyBhbmQgbXVzdCBzdGFydCB3aXRoIGEgXCIgK1xuICAgIFwibGV0dGVyKS4gTXVzdCBiZSB1cHBlcmNhc2UsIGFuZCBtdXN0IG5vdCBzdGFydCB3aXRoIGBHQVJERU5gLlwiLFxuICApXG5cbmV4cG9ydCBjb25zdCBqb2lFbnZWYXJzID0gKCkgPT4gSm9pXG4gIC5vYmplY3QoKS5wYXR0ZXJuKGVudlZhclJlZ2V4LCBqb2lQcmltaXRpdmUoKSlcbiAgLmRlZmF1bHQoKCkgPT4gKHt9KSwgXCJ7fVwiKVxuICAudW5rbm93bihmYWxzZSlcbiAgLmRlc2NyaXB0aW9uKFxuICAgIFwiS2V5L3ZhbHVlIG1hcCBvZiBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIEtleXMgbXVzdCBiZSB2YWxpZCBQT1NJWCBlbnZpcm9ubWVudCB2YXJpYWJsZSBuYW1lcyBcIiArXG4gICAgXCIobXVzdCBiZSB1cHBlcmNhc2UsIG1heSBub3Qgc3RhcnQgd2l0aCBgR0FSREVOYCkgYW5kIHZhbHVlcyBtdXN0IGJlIHByaW1pdGl2ZXMuXCIsXG4gIClcblxuZXhwb3J0IGNvbnN0IGpvaUFycmF5ID0gKHNjaGVtYSkgPT4gSm9pXG4gIC5hcnJheSgpLml0ZW1zKHNjaGVtYSlcbiAgLmRlZmF1bHQoKCkgPT4gW10sIFwiW11cIilcblxuZXhwb3J0IGNvbnN0IGpvaVJlcG9zaXRvcnlVcmwgPSAoKSA9PiBKb2lcbiAgLnN0cmluZygpXG4gIC51cmkoe1xuICAgIC8vIFRPRE8gU3VwcG9ydCBvdGhlciBwcm90b2NvbHM/XG4gICAgc2NoZW1lOiBbXG4gICAgICBcImdpdFwiLFxuICAgICAgL2dpdFxcK2h0dHBzPy8sXG4gICAgICBcImh0dHBzXCIsXG4gICAgICBcImZpbGVcIixcbiAgICBdLFxuICB9KVxuICAuZGVzY3JpcHRpb24oXG4gICAgXCJBIHJlbW90ZSByZXNwb3NpdG9yeSBVUkwuIEN1cnJlbnRseSBvbmx5IHN1cHBvcnRzIGdpdCBzZXJ2ZXJzLiBVc2UgaGFzaCBub3RhdGlvbiAoIykgdG8gcG9pbnQgdG9cIiArXG4gICAgXCIgYSBzcGVjaWZpYyBicmFuY2ggb3IgdGFnXCIsXG4gIClcbiAgLmV4YW1wbGUoXCI8Z2l0IHJlbW90ZSB1cmw+IzxicmFuY2h8dGFnPiBvciBnaXQraHR0cHM6Ly9naXRodWIuY29tL29yZ2FuaXphdGlvbi9zb21lLW1vZHVsZS5naXQjdjIuMFwiKVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQcmltaXRpdmUodmFsdWU6IGFueSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiIHx8IHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIiB8fCB0eXBlb2YgdmFsdWUgPT09IFwiYm9vbGVhblwiXG59XG5cbmNvbnN0IGpvaVBhdGhQbGFjZWhvbGRlciA9IHV1aWQudjQoKVxuY29uc3Qgam9pUGF0aFBsYWNlaG9sZGVyUmVnZXggPSBuZXcgUmVnRXhwKGpvaVBhdGhQbGFjZWhvbGRlciwgXCJnXCIpXG5jb25zdCBqb2lPcHRpb25zID0ge1xuICBhYm9ydEVhcmx5OiBmYWxzZSxcbiAgbGFuZ3VhZ2U6IHtcbiAgICBrZXk6IGBrZXkgJHtqb2lQYXRoUGxhY2Vob2xkZXJ9IGAsXG4gICAgb2JqZWN0OiB7XG4gICAgICBhbGxvd1Vua25vd246IGAhIWtleSBcInt7IWNoaWxkfX1cIiBpcyBub3QgYWxsb3dlZCBhdCBwYXRoICR7am9pUGF0aFBsYWNlaG9sZGVyfWAsXG4gICAgICBjaGlsZDogXCIhIVxcXCJ7eyFjaGlsZH19XFxcIjoge3tyZWFzb259fVwiLFxuICAgICAgeG9yOiBgISFvYmplY3QgYXQgJHtqb2lQYXRoUGxhY2Vob2xkZXJ9IG9ubHkgYWxsb3dzIG9uZSBvZiB7e3BlZXJzV2l0aExhYmVsc319YCxcbiAgICB9LFxuICB9LFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhbGlkYXRlT3B0aW9ucyB7XG4gIGNvbnRleHQ/OiBzdHJpbmdcbiAgRXJyb3JDbGFzcz86IHR5cGVvZiBDb25maWd1cmF0aW9uRXJyb3IgfCB0eXBlb2YgTG9jYWxDb25maWdFcnJvclxufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGU8VD4oXG4gIHZhbHVlOiBULFxuICBzY2hlbWE6IEpvaS5TY2hlbWEsXG4gIHsgY29udGV4dCA9IFwiXCIsIEVycm9yQ2xhc3MgPSBDb25maWd1cmF0aW9uRXJyb3IgfTogVmFsaWRhdGVPcHRpb25zID0ge30sXG4pOiBUIHtcbiAgY29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlKHZhbHVlLCBqb2lPcHRpb25zKVxuICBjb25zdCBlcnJvciA9IHJlc3VsdC5lcnJvclxuXG4gIGlmIChlcnJvcikge1xuICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gc2NoZW1hLmRlc2NyaWJlKClcblxuICAgIGNvbnN0IGVycm9yRGV0YWlscyA9IGVycm9yLmRldGFpbHMubWFwKChlKSA9PiB7XG4gICAgICAvLyByZW5kZXIgdGhlIGtleSBwYXRoIGluIGEgbXVjaCBuaWNlciB3YXlcbiAgICAgIGxldCByZW5kZXJlZFBhdGggPSBcIi5cIlxuXG4gICAgICBpZiAoZS5wYXRoLmxlbmd0aCkge1xuICAgICAgICByZW5kZXJlZFBhdGggPSBcIlwiXG4gICAgICAgIGxldCBkID0gZGVzY3JpcHRpb25cblxuICAgICAgICBmb3IgKGNvbnN0IHBhcnQgb2YgZS5wYXRoKSB7XG4gICAgICAgICAgaWYgKGQuY2hpbGRyZW4gJiYgZC5jaGlsZHJlbltwYXJ0XSkge1xuICAgICAgICAgICAgcmVuZGVyZWRQYXRoICs9IFwiLlwiICsgcGFydFxuICAgICAgICAgICAgZCA9IGQuY2hpbGRyZW5bcGFydF1cbiAgICAgICAgICB9IGVsc2UgaWYgKGQucGF0dGVybnMpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcCBvZiBkLnBhdHRlcm5zKSB7XG4gICAgICAgICAgICAgIGlmIChwYXJ0Lm1hdGNoKG5ldyBSZWdFeHAocC5yZWdleC5zbGljZSgxLCAtMSkpKSkge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVkUGF0aCArPSBgWyR7cGFydH1dYFxuICAgICAgICAgICAgICAgIGQgPSBwLnJ1bGVcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbmRlcmVkUGF0aCArPSBgWyR7cGFydH1dYFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBhIGxpdHRsZSBoYWNrIHRvIGFsd2F5cyB1c2UgZnVsbCBrZXkgcGF0aHMgaW5zdGVhZCBvZiBqdXN0IHRoZSBsYWJlbFxuICAgICAgZS5tZXNzYWdlID0gZS5tZXNzYWdlLnJlcGxhY2Uoam9pUGF0aFBsYWNlaG9sZGVyUmVnZXgsIGNoYWxrLnVuZGVybGluZShyZW5kZXJlZFBhdGggfHwgXCIuXCIpKVxuXG4gICAgICByZXR1cm4gZVxuICAgIH0pXG5cbiAgICBjb25zdCBtc2dQcmVmaXggPSBjb250ZXh0ID8gYEVycm9yIHZhbGlkYXRpbmcgJHtjb250ZXh0fWAgOiBcIlZhbGlkYXRpb24gZXJyb3JcIlxuICAgIGNvbnN0IGVycm9yRGVzY3JpcHRpb24gPSBlcnJvckRldGFpbHMubWFwKGUgPT4gZS5tZXNzYWdlKS5qb2luKFwiLCBcIilcblxuICAgIHRocm93IG5ldyBFcnJvckNsYXNzKGAke21zZ1ByZWZpeH06ICR7ZXJyb3JEZXNjcmlwdGlvbn1gLCB7XG4gICAgICB2YWx1ZSxcbiAgICAgIGNvbnRleHQsXG4gICAgICBlcnJvckRlc2NyaXB0aW9uLFxuICAgICAgZXJyb3JEZXRhaWxzLFxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gcmVzdWx0LnZhbHVlXG59XG4iXX0=
