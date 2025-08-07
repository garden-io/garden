/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { ActionConfig } from "../../actions/types.js"
import type { Garden } from "../../index.js"
import { joiVariables } from "../common.js"
import type { WorkflowConfig } from "../workflow.js"
import { schema, ParentContext, TemplateContext } from "./base.js"
import { InputContext } from "./input.js"
import { RemoteSourceConfigContext } from "./project.js"

export class TemplatableConfigContext extends RemoteSourceConfigContext {
  @schema(
    joiVariables().description(`The inputs provided to the config through a template, if applicable.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public readonly inputs: InputContext

  @schema(
    ParentContext.getSchema().description(
      `Information about the config parent, if any (usually a template, if applicable).`
    )
  )
  public readonly parent?: ParentContext

  @schema(
    TemplateContext.getSchema().description(
      `Information about the template used when generating the config, if applicable.`
    )
  )
  public readonly template?: TemplateContext

  constructor(garden: Garden, config: ActionConfig | WorkflowConfig) {
    super(garden, garden.variables)
    const { parentName, templateName, templatePath } = config.internal
    this.inputs = InputContext.forAction(garden, config)
    this.parent = parentName ? new ParentContext(parentName) : undefined
    this.template =
      templateName && templatePath ? new TemplateContext({ name: templateName, path: templatePath }) : undefined
  }
}
