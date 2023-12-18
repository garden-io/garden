/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z, infer as inferZodType } from "zod"
import { ConfigContext, ContextResolveOpts, ObjectPath } from "../config/template-contexts/base.js"
import { Collection, CollectionOrValue, deepMap, isArray, isPlainObject } from "../util/objects.js"
import {
  TemplateLeaf,
  TemplatePrimitive,
  TemplateValue,
  isTemplateLeafValue,
  templatePrimitiveDeepMap,
} from "./inputs.js"
import { getLazyConfigProxy } from "./proxy.js"
import Joi from "@hapi/joi"
import { InternalError, NotImplementedError } from "../exceptions.js"
import { MergeDeep, PartialDeep } from "type-fest"
import { ForEachLazyValue, ReferenceLazyValue } from "./lazy.js"
import { parseTemplateCollection, parseTemplateString } from "./template-string.js"

type Change = { path: (string | number)[]; value: CollectionOrValue<TemplatePrimitive> }

// This function gets us all changes and additions from one object to another
// It is not a general purpose method for diffing any two objects.
// We make use of the knowledge that a validated object will only make changes
// by either adding or changing a property on an object, never deleting properties.
// We also know that the object now has been validated so we know that the object will
// afterwards be conforming to the type given during validation, deriving from the base object.
// Thus we only need to track additions or changes, never deletions.
function getChangeset(
  base: CollectionOrValue<TemplatePrimitive>,
  compare: CollectionOrValue<TemplatePrimitive>,
  path: (string | number)[] = [],
  changeset: Change[] = []
): Change[] {
  if (isArray(base) && isArray(compare)) {
    for (let i = 0; i < compare.length; i++) {
      getChangeset(base[i], compare[i], [...path, i], changeset)
    }
  } else if (isPlainObject(base) && isPlainObject(compare)) {
    for (const key of Object.keys(compare)) {
      getChangeset(base[key], compare[key], [...path, key], changeset)
    }
  } else if (base !== compare) {
    changeset.push({ path, value: compare })
  }

  return changeset
}

// For overlaying the changesets
function getOverlayProxy(
  targetObject: Collection<TemplatePrimitive>,
  changes: Change[],
  currentPath: (string | number)[] = []
): Collection<TemplatePrimitive> {
  // TODO: This needs performance optimization and a proper abstraction to maintain the overlays
  const currentPathChanges = changes.filter((change) => change.path.slice(0, -1).join(".") === currentPath.join("."))
  const nextKeys = currentPathChanges
    .map((change) => change.path[currentPath.length])
    .filter((key) => typeof key === "string") as string[]

  const proxy = new Proxy(targetObject, {
    get(target, prop) {
      if (typeof prop === "symbol") {
        return target[prop]
      }

      const override = changes.find((change) => change.path.join(".") === [...currentPath, prop].join("."))

      if (override) {
        return override.value
      }

      if (isArray(target[prop]) || isPlainObject(target[prop])) {
        return getOverlayProxy(target[prop], changes, [...currentPath, prop])
      }

      return target[prop]
    },
    ownKeys() {
      return [...Reflect.ownKeys(targetObject), ...nextKeys]
    },
    has(target, key) {
      return Reflect.has(target, key) || nextKeys.includes(key as string)
    },
    getOwnPropertyDescriptor(target, key) {
      return (
        Reflect.getOwnPropertyDescriptor(target, key) || {
          configurable: true,
          enumerable: true,
          writable: false,
        }
      )
    },
  })

  return proxy
}

export type GardenConfigParams = {
  parsedConfig: CollectionOrValue<TemplateValue>
  context: ConfigContext
  opts: ContextResolveOpts
  overlays?: Change[]
}

type TypeAssertion<T> = (object: any) => object is T

type MergeZodValidatorCollectionOrPrimitiveTypes<
  Target,
  ToMerge extends z.ZodTypeAny,
> = MergeCollectionOrPrimitiveTypes<Target, inferZodType<ToMerge>>
type MergeCollectionOrPrimitiveTypes<Target, ToMerge> = [Target] extends [never]
  ? ToMerge
  : ToMerge extends TemplatePrimitive
  ? ToMerge
  : MergeDeep<Target, ToMerge>
type CompatibleWithTargetType<TargetType, MergeResult> = MergeResult extends PartialDeep<TargetType>
  ? MergeResult
  : never

export class GardenConfig<
  TargetType extends CollectionOrValue<TemplatePrimitive>,
  RefinedType extends PartialDeep<TargetType> = never,
> {
  private parsedConfig: CollectionOrValue<TemplateValue>
  private context: ConfigContext
  private opts: ContextResolveOpts
  private overlays: Change[]

  constructor({ parsedConfig, context, opts, overlays = [] }: GardenConfigParams) {
    this.parsedConfig = parsedConfig
    this.context = context
    this.opts = opts
    this.overlays = overlays
  }

  public withContext(context: ConfigContext): GardenConfig<TargetType> {
    // we wipe the types, because a new context can result in different results when evaluating template strings
    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context,
      opts: this.opts,
      overlays: [],
    })
  }

  public assertType<Type extends PartialDeep<TargetType>>(
    assertion: TypeAssertion<Type>
  ): GardenConfig<
    TargetType,
    CompatibleWithTargetType<TargetType, MergeCollectionOrPrimitiveTypes<RefinedType, Type>>
  > {
    const rawConfig = this.getConfig()
    const configIsOfType = assertion(rawConfig)

    if (configIsOfType) {
      return new GardenConfig({
        parsedConfig: this.parsedConfig,
        context: this.context,
        opts: this.opts,
        overlays: this.overlays,
      })
    } else {
      // TODO: Write a better error message
      throw new Error("Config is not of the expected type")
    }
  }

  public refineWithZod<Validator extends z.ZodTypeAny>(
    validator: Validator
    // merge the schemas
  ): GardenConfig<
    TargetType,
    CompatibleWithTargetType<TargetType, MergeZodValidatorCollectionOrPrimitiveTypes<RefinedType, Validator>>
  > {
    // instantiate proxy without overlays
    const rawConfig = this.getConfig([])

    // validate config and extract changes
    const validated = validator.parse(rawConfig)
    const changes = getChangeset(rawConfig as any, validated)

    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context: this.context,
      opts: this.opts,
      overlays: [...changes],
    })
  }

  // With joi we can't infer the type from the schema
  public refineWithJoi<JoiType extends PartialDeep<TargetType>>(
    validator: Joi.SchemaLike
  ): GardenConfig<
    TargetType,
    CompatibleWithTargetType<TargetType, MergeCollectionOrPrimitiveTypes<RefinedType, JoiType>>
  > {
    // instantiate proxy without overlays
    const rawConfig = this.getConfig([])

    // validate config and extract changes
    const validated = Joi.attempt(rawConfig, validator)
    const changes = getChangeset(rawConfig as any, validated)

    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context: this.context,
      opts: this.opts,
      overlays: [...changes],
    })
  }

  public get value(): RefinedType {
    return this.getConfig()
  }

  private getConfig(overlays?: Change[]): RefinedType {
    const configProxy = getLazyConfigProxy({
      parsedConfig: this.parsedConfig,
      context: this.context,
      opts: this.opts,
    }) as RefinedType

    const changes = overlays || this.overlays
    if (changes.length > 0) {
      return getOverlayProxy(configProxy as any, changes) as RefinedType
    }

    return configProxy
  }

  //////////////////////////////////////////////////////
  // Lazy transformations
  //////////////////////////////////////////////////////

  public atPath<KeyPath extends ObjectPath>(...keyPath: KeyPath): GardenConfig<Traverse<TargetType, KeyPath>> {
    return new GardenConfig({
      parsedConfig: new ReferenceLazyValue(keyPath, this.parsedConfig),
      context: this.context,
      opts: this.opts,
      // TODO: if we can transform the overlays somehow, we can add Traverse<RefinedType, KeyPath> to the refined type.
      overlays: [],
    })
  }

  private processTransform(
    transformer: () => TransformResult
  ): CollectionOrValue<TemplateValue> {
    const transformedValueWithConfigsAndPrimitives = transformer()

    const transformedValueWithPrimitives = deepMap(transformedValueWithConfigsAndPrimitives, (v) => {
      if (v instanceof GardenConfig) {
        if (v === this) {
          throw new InternalError({
            message: "Detected circular transformation",
          })
        }
        return v.parsedConfig
      } else {
        return v
      }
    })

    const transformedConfig = templatePrimitiveDeepMap(transformedValueWithPrimitives, (v) =>
      isTemplateLeafValue(v)
        ? new TemplateLeaf({
            expr: undefined,
            value: v,
            inputs: {},
          })
        : v
    )

    return transformedConfig
  }

  public transform<ReturnType extends TransformResult>(
    transformer: (t: GardenConfig<TargetType, RefinedType>) => ReturnType
  ): GardenConfig<Unwrap<ReturnType>> {

    return new GardenConfig({
      parsedConfig: this.processTransform(() => transformer(this)),
      context: this.context,
      opts: this.opts,
      overlays: [],
    })
  }

  public map<ReturnType extends TransformResult, Element extends TargetType extends Array<infer T> ? T : never>(
    transformer: (t: GardenConfig<Element>) => ReturnType
  ): GardenConfig<Unwrap<ReturnType>> {
    const item = new GardenConfig<Element>({
      parsedConfig: parseTemplateString({ string: "${item.value}" }),
      context: this.context,
      opts: this.opts,
      overlays: [],
    })

    const transformed = this.processTransform(() => transformer(item))

    return new GardenConfig({
      parsedConfig: new ForEachLazyValue(
        { source: undefined, yamlPath: [] },
        {
          $forEach: this.parsedConfig,
          $return: transformed,
          $filter: undefined,
        }
      ),
      context: this.context,
      opts: this.opts,
      overlays: [],
    })
  }
}

type AnyGardenConfig = GardenConfig<CollectionOrValue<TemplatePrimitive>, CollectionOrValue<TemplatePrimitive>>
type TransformResult = CollectionOrValue<TemplatePrimitive | AnyGardenConfig>

type Unwrap<Type> = Type extends TemplatePrimitive
  ? Type
  : Type extends GardenConfig<infer T>
  ? T
  : Type extends Array<infer U>
  ? Unwrap<U>[]
  : Type extends { [key: string]: any }
  ? { [Key in keyof Type]: Unwrap<Type[Key]> }
  : never

type Traverse<Type, KeyPath extends any[]> = KeyPath extends [infer Key, ...infer RemainingKeyPath]
  ? Key extends keyof Type
    ? RemainingKeyPath extends []
      ? Type[Key]
      : Traverse<Type[Key], RemainingKeyPath>
    : never
  : never

type UnwrapBoolean = Unwrap<boolean>
type UnwrapConfigBoolean = Unwrap<GardenConfig<boolean>>
type UnwrapBooleanArray = Unwrap<boolean[]>
type UnwrapStaticBooleanArray = Unwrap<readonly [true, false, true]>
type UnwrapMixedArray = Unwrap<readonly [true, 2, "foo"]>
type UnwrapObject = Unwrap<{
  foo: boolean
  bar: {
    baz: [1, 2, 3]
  }
}>

type MergeResult = MergeDeep<never, { foo: boolean }>

type nevernever = never & { foo: boolean }

type Mergey = MergeCollectionOrPrimitiveTypes<never, { foo: boolean }>
type Mergey2 = MergeCollectionOrPrimitiveTypes<{ bar: never }, { foo: boolean }>
