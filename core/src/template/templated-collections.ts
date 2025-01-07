/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ObjectPath } from "../config/base.js"
import { GenericContext } from "../config/template-contexts/base.js"
import type { ConfigSource } from "../config/validation.js"
import { InternalError } from "../exceptions.js"
import { deepMap, isArray, isPlainObject, type CollectionOrValue } from "../util/objects.js"
import { naturalList } from "../util/string.js"
import { isTruthy } from "./ast.js"
import type { EvaluateTemplateArgs, ParsedTemplate, ResolvedTemplate } from "./types.js"
import { isTemplatePrimitive, UnresolvedTemplateValue, type TemplatePrimitive } from "./types.js"
import isBoolean from "lodash-es/isBoolean.js"
import {
  arrayConcatKey,
  arrayForEachFilterKey,
  arrayForEachKey,
  arrayForEachReturnKey,
  conditionalElseKey,
  conditionalKey,
  conditionalThenKey,
  objectSpreadKey,
} from "../config/constants.js"
import mapValues from "lodash-es/mapValues.js"
import { deepEvaluate } from "./evaluate.js"
import { LayeredContext } from "../config/template-contexts/base.js"
import { parseTemplateString } from "./templated-strings.js"
import { TemplateError } from "./errors.js"
import { visitAll, type TemplateExpressionGenerator } from "./analysis.js"

export function pushYamlPath(part: ObjectPath[0], configSource: ConfigSource): ConfigSource {
  return {
    ...configSource,
    path: [...configSource.path, part],
  }
}
type MaybeTplString = `${string}\${${string}`
type Parse<T extends CollectionOrValue<TemplatePrimitive>> = T extends MaybeTplString
  ? ParsedTemplate
  : T extends Array<infer V>
    ? V extends CollectionOrValue<TemplatePrimitive>
      ? Array<Parse<V>>
      : V
    : T extends { [k: string]: unknown }
      ? { [P in keyof T]: T[P] extends CollectionOrValue<TemplatePrimitive> ? Parse<T[P]> : T[P] }
      : T extends TemplatePrimitive
        ? T
        : T

/**
 * Recursively parses and resolves all templated strings in the given object.
 *
 * @argument value The result of the YAML parser.
 */
export function parseTemplateCollection<Input extends CollectionOrValue<TemplatePrimitive>>({
  value,
  source,
  untemplatableKeys = [],
}: {
  value: Input
  source: ConfigSource
  untemplatableKeys?: string[]
}): Parse<Input> {
  const inner = () => {
    if (!source) {
      throw new InternalError({
        message: "Source parameter is required for parseTemplateCollection.",
      })
    }
    if (typeof value === "string") {
      return parseTemplateString({
        rawTemplateString: value,
        source,
      }) as Parse<Input>
    } else if (isTemplatePrimitive(value)) {
      return value as Parse<Input>
    } else if (isArray(value)) {
      const parsed = value.map((v, i) => parseTemplateCollection({ value: v, source: pushYamlPath(i, source) }))

      if (value.some((v) => isPlainObject(v) && v[arrayConcatKey] !== undefined)) {
        return new ConcatLazyValue(source, parsed) as Parse<Input>
      } else {
        return parsed as Parse<Input>
      }
    } else if (isPlainObject(value)) {
      if (value[arrayForEachKey] !== undefined) {
        const unexpectedKeys = Object.keys(value).filter((k) => !ForEachLazyValue.allowedForEachKeys.includes(k))

        if (unexpectedKeys.length > 0) {
          const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

          throw new TemplateError({
            message: `Found one or more unexpected keys on ${arrayForEachKey} object: ${extraKeys}. Allowed keys: ${naturalList(
              ForEachLazyValue.allowedForEachKeys
            )}`,
            source: pushYamlPath(extraKeys[0], source),
          })
        }

        if (value[arrayForEachReturnKey] === undefined) {
          throw new TemplateError({
            message: `Missing ${arrayForEachReturnKey} field next to ${arrayForEachKey} field. Got ${naturalList(
              Object.keys(value)
            )}`,
            source: pushYamlPath(arrayForEachReturnKey, source),
          })
        }

        const parsedCollectionExpression = parseTemplateCollection({
          value: value[arrayForEachKey],
          source: pushYamlPath(arrayForEachKey, source),
        })

        const parsedReturnExpression = parseTemplateCollection({
          value: value[arrayForEachReturnKey],
          source: pushYamlPath(arrayForEachReturnKey, source),
        })

        const parsedFilterExpression =
          value[arrayForEachFilterKey] === undefined
            ? undefined
            : parseTemplateCollection({
                value: value[arrayForEachFilterKey],
                source: pushYamlPath(arrayForEachFilterKey, source),
              })

        const forEach = new ForEachLazyValue(source, {
          [arrayForEachKey]: parsedCollectionExpression,
          [arrayForEachReturnKey]: parsedReturnExpression,
          [arrayForEachFilterKey]: parsedFilterExpression,
        })

        if (parsedReturnExpression?.[arrayConcatKey] !== undefined) {
          return new ConcatLazyValue(source, forEach) as Parse<Input>
        } else {
          return forEach as Parse<Input>
        }
      } else if (value[conditionalKey] !== undefined) {
        const ifExpression = value[conditionalKey]
        const thenExpression = value[conditionalThenKey]
        const elseExpression = value[conditionalElseKey]

        if (thenExpression === undefined) {
          throw new TemplateError({
            message: `Missing ${conditionalThenKey} field next to ${conditionalKey} field. Got: ${naturalList(
              Object.keys(value)
            )}`,
            source,
          })
        }

        const unexpectedKeys = Object.keys(value).filter(
          (k) => !ConditionalLazyValue.allowedConditionalKeys.includes(k)
        )

        if (unexpectedKeys.length > 0) {
          const extraKeys = naturalList(unexpectedKeys.map((k) => JSON.stringify(k)))

          throw new TemplateError({
            message: `Found one or more unexpected keys on ${conditionalKey} object: ${extraKeys}. Allowed: ${naturalList(
              ConditionalLazyValue.allowedConditionalKeys
            )}`,
            source,
          })
        }

        return new ConditionalLazyValue(source, {
          [conditionalKey]: parseTemplateCollection({
            value: ifExpression,
            source: pushYamlPath(conditionalKey, source),
          }),
          [conditionalThenKey]: parseTemplateCollection({
            value: thenExpression,
            source: pushYamlPath(conditionalThenKey, source),
          }),
          [conditionalElseKey]:
            elseExpression === undefined
              ? undefined
              : parseTemplateCollection({
                  value: elseExpression,
                  source: pushYamlPath(conditionalElseKey, source),
                }),
        }) as Parse<Input>
      } else {
        const resolved = mapValues(value, (v, k) => {
          // if this key is untemplatable, skip parsing this branch of the template tree.
          if (untemplatableKeys.includes(k)) {
            return v
          }

          return parseTemplateCollection({ value: v, source: pushYamlPath(k, source) }) as ParsedTemplate
        })
        if (Object.keys(value).some((k) => k === objectSpreadKey)) {
          return new ObjectSpreadLazyValue(source, resolved as ObjectSpreadOperation) as Parse<Input>
        } else {
          return resolved as Parse<Input>
        }
      }
    } else {
      throw new InternalError({
        message: `Got unexpected value type: ${typeof value}`,
      })
    }
  }

  const res = inner()
  Object.freeze(res)
  return res
}

abstract class StructuralTemplateOperator extends UnresolvedTemplateValue {
  constructor(
    protected readonly source: ConfigSource,
    private readonly template: ParsedTemplate
  ) {
    super()
  }

  override *visitAll(): TemplateExpressionGenerator {
    yield* visitAll({ value: this.template })
  }

  override toJSON(): ResolvedTemplate {
    return deepMap(this.template, (v) => {
      if (!(v instanceof UnresolvedTemplateValue)) {
        return v
      }
      return v.toJSON()
    })
  }
}

type ConcatOperator = { [arrayConcatKey]: CollectionOrValue<UnresolvedTemplateValue> }

export class ConcatLazyValue extends StructuralTemplateOperator {
  constructor(
    source: ConfigSource,
    private readonly yaml: (ConcatOperator | ParsedTemplate)[] | ForEachLazyValue
  ) {
    super(source, yaml)
  }

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate[] {
    const output: ResolvedTemplate[] = []

    let concatYaml: (ConcatOperator | ParsedTemplate)[]

    // NOTE(steffen): We need to support a construct where $concat inside a $forEach expression results in a flat list.
    if (this.yaml instanceof ForEachLazyValue) {
      const res = this.yaml.evaluate(args)

      // if (typeof res === "symbol") {
      //   return res
      // }

      concatYaml = res
    } else {
      concatYaml = this.yaml
    }

    for (const v of concatYaml) {
      if (!this.isConcatOperator(v)) {
        // it's not a concat operator, it's a list element.
        const evaluated = deepEvaluate(v, args)

        // if (typeof evaluated === "symbol") {
        //   return evaluated
        // }

        output.push(evaluated)
        continue
      }

      // handle concat operator
      const toConcatenate = deepEvaluate(v[arrayConcatKey], args)

      // if (typeof toConcatenate === "symbol") {
      //   return toConcatenate
      // }

      if (isArray(toConcatenate)) {
        output.push(...toConcatenate)
      } else {
        throw new TemplateError({
          message: `Value of ${arrayConcatKey} key must be (or resolve to) an array (got ${typeof toConcatenate})`,
          source: pushYamlPath(arrayConcatKey, this.source),
        })
      }
    }

    // input tracking is already being taken care of as we just concatenate arrays
    return output
  }

  isConcatOperator(v: ConcatOperator | ParsedTemplate): v is ConcatOperator {
    if (isPlainObject(v) && v[arrayConcatKey] !== undefined) {
      if (Object.keys(v).length > 1) {
        const extraKeys = naturalList(
          Object.keys(v)
            .filter((k) => k !== arrayConcatKey)
            .map((k) => JSON.stringify(k))
        )
        throw new TemplateError({
          message: `A list item with a ${arrayConcatKey} key cannot have any other keys (found ${extraKeys})`,
          source: pushYamlPath(arrayConcatKey, this.source),
        })
      }
      return true
    }
    return false
  }
}

type ForEachClause = {
  [arrayForEachKey]: ParsedTemplate // must resolve to an array or plain object, but might be a lazy value
  [arrayForEachFilterKey]: ParsedTemplate | undefined // must resolve to boolean, but might be lazy value
  [arrayForEachReturnKey]: ParsedTemplate
}

export class ForEachLazyValue extends StructuralTemplateOperator {
  static allowedForEachKeys = [arrayForEachKey, arrayForEachReturnKey, arrayForEachFilterKey]
  constructor(
    source: ConfigSource,
    private readonly yaml: ForEachClause
  ) {
    super(source, yaml)
  }

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate[] {
    const collectionValue = deepEvaluate(this.yaml[arrayForEachKey], args)

    // if (typeof collectionValue === "symbol") {
    //   return collectionValue
    // }

    if (!isArray(collectionValue) && !isPlainObject(collectionValue)) {
      throw new TemplateError({
        message: `Value of ${arrayForEachKey} key must be (or resolve to) an array or mapping object (got ${typeof collectionValue})`,
        source: pushYamlPath(arrayForEachKey, this.source),
      })
    }

    const filterExpression = this.yaml[arrayForEachFilterKey]

    const resolveOutput: ResolvedTemplate[] = []

    for (const i of Object.keys(collectionValue)) {
      // put the TemplateValue in the context, not the primitive value, so we have input tracking
      const contextForIndex = new GenericContext({
        item: { key: i, value: collectionValue[i] },
      })
      const loopContext = new LayeredContext(args.context, contextForIndex)

      // Check $filter clause output, if applicable
      if (filterExpression !== undefined) {
        const filterResult = deepEvaluate(filterExpression, { ...args, context: loopContext })

        // if (typeof filterResult === "symbol") {
        //   return filterResult
        // }

        if (isBoolean(filterResult)) {
          if (!filterResult) {
            continue
          }
        } else {
          throw new TemplateError({
            message: `${arrayForEachFilterKey} clause in ${arrayForEachKey} loop must resolve to a boolean value (got ${typeof filterResult})`,
            source: pushYamlPath(arrayForEachFilterKey, this.source),
          })
        }
      }

      const returnResult = deepEvaluate(this.yaml[arrayForEachReturnKey], { ...args, context: loopContext })

      // if (typeof returnResult === "symbol") {
      //   return returnResult
      // }

      resolveOutput.push(returnResult)
    }

    return resolveOutput
  }
}

export type ObjectSpreadOperation = {
  [objectSpreadKey]: ParsedTemplate
  [staticKeys: string]: ParsedTemplate
}
export class ObjectSpreadLazyValue extends StructuralTemplateOperator {
  constructor(
    source: ConfigSource,
    private readonly yaml: ObjectSpreadOperation
  ) {
    super(source, yaml)
  }

  override evaluate(args: EvaluateTemplateArgs): Record<string, ResolvedTemplate> {
    let output: Record<string, ResolvedTemplate> = {}

    // Resolve $merge keys, depth-first, leaves-first
    for (const [k, v] of Object.entries(this.yaml)) {
      const resolved = deepEvaluate(v, args)

      // if (typeof resolved === "symbol") {
      //   return resolved
      // }

      if (k !== objectSpreadKey) {
        output[k] = resolved
        continue
      }

      k satisfies typeof objectSpreadKey

      if (!isPlainObject(resolved)) {
        throw new TemplateError({
          message: `Value of ${objectSpreadKey} key must be (or resolve to) a mapping object (got ${typeof resolved})`,
          source: pushYamlPath(k, this.source),
        })
      }

      output = { ...output, ...resolved }
    }

    return output
  }
}

export type ConditionalClause = {
  [conditionalKey]: ParsedTemplate // must resolve to a boolean, but might be a lazy value
  [conditionalThenKey]: ParsedTemplate
  [conditionalElseKey]?: ParsedTemplate
}
export class ConditionalLazyValue extends StructuralTemplateOperator {
  static allowedConditionalKeys = [conditionalKey, conditionalThenKey, conditionalElseKey]

  constructor(
    source: ConfigSource,
    private readonly yaml: ConditionalClause
  ) {
    super(source, yaml)
  }

  override evaluate(args: EvaluateTemplateArgs): ResolvedTemplate {
    const conditionalValue = deepEvaluate(this.yaml[conditionalKey], args)

    // if (typeof conditionalValue === "symbol") {
    //   return conditionalValue
    // }

    if (typeof conditionalValue !== "boolean") {
      throw new TemplateError({
        message: `Value of ${conditionalKey} key must be (or resolve to) a boolean (got ${typeof conditionalValue})`,
        source: pushYamlPath(conditionalKey, this.source),
      })
    }

    const branch = isTruthy(conditionalValue) ? this.yaml[conditionalThenKey] : this.yaml[conditionalElseKey]

    const evaluated = deepEvaluate(branch, args)

    return evaluated
  }
}
