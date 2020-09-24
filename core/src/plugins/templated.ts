/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../types/plugin/plugin"
import { ModuleConfig, ModuleSpec, baseModuleSpecKeys, baseBuildSpecSchema } from "../config/module"
import { templateKind } from "../config/module-template"
import { joiIdentifier, joi, DeepPrimitiveMap } from "../config/common"
import { dedent, naturalList } from "../util/string"
import { omit } from "lodash"

export interface TemplatedModuleSpec extends ModuleSpec {
  template: string
  inputs?: DeepPrimitiveMap
}

export interface TemplatedModuleConfig extends ModuleConfig<TemplatedModuleSpec> {
  modules: ModuleConfig[]
}

export const templatedModuleSpecSchema = () =>
  joi.object().keys({
    disabled: baseModuleSpecKeys().disabled,
    template: joiIdentifier()
      .required()
      .description(`The ${templateKind} to use to generate the sub-modules of this module.`),
    inputs: joi.object().description(
      dedent`
      A map of inputs to pass to the ${templateKind}. These must match the inputs schema of the ${templateKind}.
      `
    ),
  })

// Note: This module type is currently special-cased when resolving modules in Garden.resolveModules()
export const gardenPlugin = () => {
  const baseKeys = baseModuleSpecKeys()
  const disallowedKeys = Object.keys(omit(baseKeys, "disabled"))

  return createGardenPlugin({
    name: "templated",
    createModuleTypes: [
      {
        name: "templated",
        docs: dedent`
          A special module type, for rendering [module templates](../../using-garden/module-templates.md). See the [Module Templates guide](../../using-garden/module-templates.md) for more information.

          Specify the name of a ModuleTemplate with the \`template\` field, and provide any expected inputs using the \`inputs\` field. The generated modules becomes sub-modules of this module.

          Note that the following common Module configuration fields are disallowed for this module type:
          ${naturalList(disallowedKeys.map((k) => "`" + k + "`"))}
        `,
        schema: templatedModuleSpecSchema().keys({
          build: baseBuildSpecSchema(),
        }),
        handlers: {
          async configure({ moduleConfig }) {
            moduleConfig.allowPublish = false
            moduleConfig.include = []
            return { moduleConfig }
          },
        },
      },
    ],
  })
}
