/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z, infer as inferZodType } from "zod"
import { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import { Collection, CollectionOrValue, isArray, isPlainObject } from "../util/objects.js"
import { TemplatePrimitive, TemplateValue } from "./inputs.js"
import { getCollectionSymbol, getLazyConfigProxy } from "./proxy.js"
import Joi from "@hapi/joi"
import { TemplateProvenance, parseTemplateCollection } from "./template-string.js"
import { ConfigSource } from "../config/validation.js"
import { omit } from "lodash-es"
import { CreateSchemaOutput } from "../config/common.js"
import { AnySchema } from "ajv"
import { InternalError } from "../exceptions.js"
import { dirname } from "path"

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
function getOverlayProxy(targetObject: Collection<TemplatePrimitive>, changes: Change[], currentPath: (string | number)[] = []): Collection<TemplatePrimitive> {
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
      return Reflect.getOwnPropertyDescriptor(target, key) || {
        configurable: true,
        enumerable: true,
        writable: false
      }
    }
  })

  return proxy
}

export type GardenConfigParams = {
  unparsedConfig?: CollectionOrValue<TemplatePrimitive>
  parsedConfig?: CollectionOrValue<TemplateValue>
  context: ConfigContext
  opts: ContextResolveOpts
  overlays?: Change[]
  source: ConfigSource

  configFilePath?: string
}

type TypeAssertion<T> = (object: any) => object is T
export class GardenConfig<ConfigType extends Collection<TemplatePrimitive> = Collection<TemplatePrimitive>> {
  private parsedConfig: CollectionOrValue<TemplateValue>
  private context: ConfigContext
  private opts: ContextResolveOpts
  private overlays: Change[]

  public source: ConfigSource

  /**
   * The path to the resource's config file, if any.
   *
   * Configs that are read from a file should always have this set, but generated configs (e.g. from templates
   * or `augmentGraph` handlers) don't necessarily have a path on disk.
   */
  public configFilePath?: string

  /**
   * The path/working directory where commands and operations relating to the config should be executed. This is
   * most commonly the directory containing the config file.
   *
   * Note: WHen possible, use `action.getSourcePath()` instead, since it factors in remote source paths and source
   * overrides (i.e. `BaseActionConfig.source.path`). This is a lower-level field that doesn't contain template strings,
   * and can thus be used early in the resolution flow.
   */
  public get configFileDirname(): string | undefined {
    if (this.configFilePath !== undefined) {
      return dirname(this.configFilePath)
    }

    return undefined
  }

  constructor({ unparsedConfig, parsedConfig, context, opts, source, configFilePath, overlays = [] }: GardenConfigParams) {
    this.parsedConfig = parsedConfig || parseTemplateCollection({ value: unparsedConfig, source: { source } })
    this.context = context
    this.opts = opts
    this.overlays = overlays
    this.source = source
    this.configFilePath = configFilePath
  }

  public withContext(context: ConfigContext, opts: ContextResolveOpts = {}): GardenConfig {
    // we wipe the types, because a new context can result in different results when evaluating template strings
    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context,
      opts,
      overlays: [],
      source: this.source,
      configFilePath: this.configFilePath,
    })
  }

  public assertType<Type extends CollectionOrValue<TemplatePrimitive>>(assertion: TypeAssertion<Type>): GardenConfig<ConfigType & Type> {
    const rawConfig = this.getConfig()
    const configIsOfType = assertion(rawConfig)

    if (configIsOfType) {
      return new GardenConfig<ConfigType & Type>({
        parsedConfig: this.parsedConfig,
        context: this.context,
        opts: this.opts,
        overlays: this.overlays,
        source: this.source,
        configFilePath: this.configFilePath,
      })
    } else {
      // TODO: Write a better error message
      throw new Error("Config is not of the expected type")
    }
  }

  public refineWithZod<Validator extends z.AnyZodObject>(validator: Validator): GardenConfig<ConfigType & inferZodType<Validator>> {
    // merge the schemas

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
      source: this.source,
      configFilePath: this.configFilePath,
    })
  }

  // With joi we can't infer the type from the schema
  public refineWithJoi<JoiType extends Collection<TemplatePrimitive> >(validator: Joi.SchemaLike ): GardenConfig<ConfigType & JoiType> {
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
      source: this.source,
      configFilePath: this.configFilePath,
    })
  }

  public get config(): Readonly<ConfigType> {
    return this.getConfig()
  }

  private getConfig(overlays?: Change[]): Readonly<ConfigType> {
    const configProxy = getLazyConfigProxy({
      parsedConfig: this.parsedConfig,
      context: this.context,
      opts: this.opts,
    }) as ConfigType

    const changes = overlays || this.overlays
    if (changes.length > 0) {
      return getOverlayProxy(configProxy, changes) as ConfigType
    }

    return configProxy
  }

  static getTemplateValueTree(proxy: CollectionOrValue<TemplatePrimitive>): CollectionOrValue<TemplateValue> {
    const underlyingTemplateValueTree = proxy?.[getCollectionSymbol]

    if (underlyingTemplateValueTree) {
      return underlyingTemplateValueTree as CollectionOrValue<TemplateValue>
    }

    throw new InternalError({
      message: "Expected a config proxy",
    })
  }
}
