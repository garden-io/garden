/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../plugin/plugin.js"
import type { ModuleConfig, ModuleSpec } from "../config/module.js"
import { baseModuleSpecKeys, baseBuildSpecSchema } from "../config/module.js"
import { configTemplateKind, renderTemplateKind } from "../config/base.js"
import type { DeepPrimitiveMap } from "../config/common.js"
import { dedent, naturalList } from "../util/string.js"
import { omit } from "lodash-es"
import { templatedModuleSpecSchema } from "../config/render-template.js"

// TODO: remove in 0.14, replaced with Render kind

export interface TemplatedModuleSpec extends ModuleSpec {
  template: string
  inputs?: DeepPrimitiveMap
}

export interface TemplatedModuleConfig extends ModuleConfig<TemplatedModuleSpec> {
  modules: ModuleConfig[]
}

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
          **[DEPRECATED] Please use the new \`${renderTemplateKind}\` config kind instead.**

          A special module type, for rendering [module templates](../../features/config-templates.md). See the [Config Templates guide](../../features/config-templates.md) for more information.

          Specify the name of a ${configTemplateKind} with the \`template\` field, and provide any expected inputs using the \`inputs\` field. The generated modules becomes sub-modules of this module.

          Note that the following common Module configuration fields are disallowed for this module type:
          ${naturalList(disallowedKeys.map((k) => "`" + k + "`"))}
        `,
        needsBuild: false,
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
