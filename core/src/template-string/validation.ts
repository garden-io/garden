/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z, infer as inferZodType } from "zod"
import { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js"
import { CollectionOrValue, isArray, isPlainObject } from "../util/objects.js"
import { TemplateLeaf, TemplatePrimitive, TemplateValue, templatePrimitiveDeepMap } from "./inputs.js"
import { getLazyConfigProxy } from "./proxy.js"
import { PartialDeep } from "type-fest"
import { OverrideKeyPathLazily } from "./lazy.js"

type Change = { path: (string | number)[]; value: CollectionOrValue<TemplatePrimitive> }

// This function gets us all changes and additions from one object to another
// It is not a general purpose method for diffing any two objects.
// We make use of the knowledge that a validated object will only make changes
// by either adding or changing a property on an object, never deleting properties.
// We also know that the object now has been validated so we know that the object will
// afterwards be conforming to the type given during validation, deriving from the base object.
// Thus we only need to track additions or changes, never deletions.
function getChangeset<T extends CollectionOrValue<TemplatePrimitive>>(
  base: PartialDeep<T>,
  compare: T,
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

export class GardenConfig<TConfig = unknown> {
  private parsedConfig: CollectionOrValue<TemplateValue>
  private context: ConfigContext
  private opts: ContextResolveOpts

  constructor({ parsedConfig, context, opts }) {
    this.parsedConfig = parsedConfig
    this.context = context
    this.opts = opts
  }

  public withContext(context: ConfigContext): GardenConfig<TConfig> {
    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context,
      opts: this.opts,
    })
  }

  public refine<Validator extends z.ZodTypeAny>(validator: Validator): GardenConfig<inferZodType<Validator>> {
    const rawConfig = this.getProxy()

    // validate config and extract changes
    const validated = validator.parse(rawConfig)
    const changes = getChangeset(rawConfig, validated)

    // Add changes on top of parsed config
    let overlay = this.parsedConfig
    for (const change of changes) {
      // wrap override value in TemplateLeaf instances
      const wrapped = templatePrimitiveDeepMap(change.value, (value) => {
        return new TemplateLeaf({ expr: undefined, value, inputs: {} })
      })

      overlay = new OverrideKeyPathLazily(overlay, change.path, wrapped)
    }

    return new GardenConfig({
      parsedConfig: overlay,
      context: this.context,
      opts: this.opts,
    })
  }

  public getProxy(): TConfig {
    return getLazyConfigProxy({
      parsedConfig: this.parsedConfig,
      context: this.context,
      opts: this.opts,
    }) as TConfig
  }
}
