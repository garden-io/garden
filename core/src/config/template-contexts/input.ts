/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { GenericContext, LayeredContext } from "./base.js"
import type { Garden } from "../../garden.js"
import { describeConfig } from "../../vcs/vcs.js"
import type { ActionConfig } from "../../actions/types.js"
import type { WorkflowConfig } from "../workflow.js"
import { InternalError } from "../../exceptions.js"
import type { ConfigTemplateConfig } from "../config-template.js"
import type { ParsedTemplate } from "../../template/types.js"
import type { RenderTemplateConfig } from "../render-template.js"
import type { ModuleConfig } from "../module.js"
import { describeActionConfig } from "../../actions/base.js"

export class InputContext extends LayeredContext {
  public static forAction(garden: Garden, config: ActionConfig | WorkflowConfig): InputContext {
    const templateName = config.internal.templateName
    if (templateName) {
      const template = garden.configTemplates[templateName]
      if (!template) {
        throw new InternalError({
          message: `Could not find template name ${templateName} for ${describeActionConfig(config)}`,
        })
      }
      return new this(config.internal.inputs, template)
    }

    return new this(config.internal.inputs)
  }

  public static forRenderTemplate(config: RenderTemplateConfig, template: ConfigTemplateConfig) {
    return new this(config.inputs, template)
  }

  public static forModule(garden: Garden, module: ModuleConfig) {
    if (module.templateName) {
      const template = garden.configTemplates[module.templateName]
      if (!template) {
        throw new InternalError({
          message: `Could not find template name ${module.templateName} for ${describeConfig(module)}`,
        })
      }
      return new this(module.inputs, template)
    }

    return new this(module.inputs)
  }

  constructor(inputs: ParsedTemplate, template?: ConfigTemplateConfig) {
    if (template) {
      super(
        "unresolved inputs (with best-effort schema defaults)",
        new GenericContext("best-effort schema defaults", template.inputsSchemaDefaults),
        new GenericContext("unresolved inputs", inputs || {})
      )
    } else {
      super("fully resolved inputs", new GenericContext("fully resolved inputs", inputs || {}))
    }
  }
}
