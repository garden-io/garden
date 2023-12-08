/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z, infer as inferZodType } from "zod"
import { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js";
import { CollectionOrValue } from "../util/objects.js";
import { TemplateValue } from "./inputs.js";
import { getCollectionSymbol, getLazyConfigProxy } from "./proxy.js";

export class GardenConfig<TConfig = unknown> {
  private parsedConfig: CollectionOrValue<TemplateValue>
  private context: ConfigContext
  private opts: ContextResolveOpts

  constructor({ parsedConfig, context, opts }) {
    this.parsedConfig = parsedConfig;
    this.context = context;
    this.opts = opts;
  }

  public withContext(context: ConfigContext): GardenConfig<TConfig> {
    return new GardenConfig({
      parsedConfig: this.parsedConfig,
      context,
      opts: this.opts,
    })
  }

  public refine<Validator extends z.ZodTypeAny>(validator: Validator): GardenConfig<inferZodType<Validator>> {
    const proxy = this.getProxy()

    // throws on validation error, and mutates the proxy
    const updated = validator.parse(proxy)

    const updatedConfig = updated[getCollectionSymbol]

    return new GardenConfig({
      parsedConfig: updatedConfig,
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
