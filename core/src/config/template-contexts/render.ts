/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiVariables } from "../common.js"
import { ParentContext, schema, TemplateContext } from "./base.js"
import type { InputContext } from "./input.js"
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
  public inputs: InputContext

  constructor(params: { parentName: string; templateName: string; inputs: InputContext } & ProjectConfigContextParams) {
    super(params)
    this.parent = new ParentContext(params.parentName)
    this.template = new TemplateContext(params.templateName)
    this.inputs = params.inputs
  }
}
