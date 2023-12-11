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
import { MutableOverlayLazyValue } from "./lazy.js"

type Change = { path: (string | number)[]; value: CollectionOrValue<TemplatePrimitive> }
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

    const validated = validator.parse(rawConfig)

    const changes = getChangeset(rawConfig, validated)

    const overlay = new MutableOverlayLazyValue({ yamlPath: [], source: undefined }, this.parsedConfig)

    for (const change of changes) {
      // wrap override value in TemplateLeaf instances
      const wrapped = templatePrimitiveDeepMap(change.value, (value) => {
        return new TemplateLeaf({ expr: undefined, value, inputs: {} })
      })

      overlay.overrideKeyPath(change.path, wrapped)
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
