/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiVariables } from "../common.js"
import { type ConfigContext, ParentContext, schema, TemplateContext } from "./base.js"
import type { ProjectConfigContextParams } from "./project.js"
import { ProjectConfigContext } from "./project.js"

export class RenderTemplateConfigContext extends ProjectConfigContext {
  @schema(ParentContext.getSchema().description(`Information about the templated config being resolved.`))
  public parent: ParentContext

  @schema(TemplateContext.getSchema().description(`Information about the template used when generating the config.`))
  public template: TemplateContext

  @schema(
    joiVariables().description(`The inputs provided when resolving the template.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public inputs: ConfigContext

  constructor(
    params: { parentName: string; templateName: string; inputs: ConfigContext } & ProjectConfigContextParams
  ) {
    super(params)
    this.parent = new ParentContext(this, params.parentName)
    this.template = new TemplateContext(this, params.templateName)
    this.inputs = params.inputs
  }
}
