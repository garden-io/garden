/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigContext, ContextResolveOpts } from "../config/template-contexts/base.js";
import { TemplateExpression } from "./ast.js";
import { CollectionOrValue, TemplateLeaf } from "./inputs.js";


export abstract class LazyValue<R extends CollectionOrValue<TemplateLeaf> = CollectionOrValue<TemplateLeaf>> {
  abstract get value(): R
}

type TemplateStringLazyValueArgs = {
  astRootNode: TemplateExpression
  rawTemplateString: string
  context: ConfigContext
  opts: ContextResolveOpts
}

export class TemplateStringLazyValue extends LazyValue {
  private readonly astRootNode: TemplateExpression
  private readonly context: ConfigContext
  private readonly opts: ContextResolveOpts
  private readonly rawTemplateString: string

  constructor(
    { rawTemplateString, context, opts, astRootNode }: TemplateStringLazyValueArgs
  ) {
    super()
    this.rawTemplateString = rawTemplateString
    this.context = context
    this.opts = opts
    this.astRootNode = astRootNode
  }

  get value(): CollectionOrValue<TemplateLeaf> {
    return this.astRootNode.evaluate({ rawTemplateString: this.rawTemplateString, context: this.context, opts: this.opts })
  }
}
