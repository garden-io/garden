/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { readFileSync } from "fs"
import { resolve } from "path"
import handlebars = require("handlebars")
import { joiArray, joi } from "../config/common"
import { providerConfigBaseSchema } from "../config/provider"
import { GardenPlugin, PluginMap } from "../types/plugin/plugin"
import { getPluginBases } from "../plugins"
import { renderTemplateStringReference, renderConfigReference, TEMPLATES_DIR } from "./config"

const populateProviderSchema = (schema: Joi.ObjectSchema) =>
  joi.object().keys({
    providers: joiArray(schema),
  })

/**
 * Generates the provider reference from the provider.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
export function renderProviderReference(name: string, plugin: GardenPlugin, allPlugins: PluginMap) {
  let configSchema = plugin.configSchema

  // If the plugin doesn't specify its own config schema, we need to walk through its bases to get a schema to document
  if (!configSchema) {
    for (const base of getPluginBases(plugin, allPlugins)) {
      if (base.configSchema) {
        configSchema = base.configSchema
        break
      }
    }
  }

  const schema = populateProviderSchema(configSchema || providerConfigBaseSchema)
  const docs = plugin.docs || ""

  const moduleOutputsSchema = plugin.outputsSchema

  const providerTemplatePath = resolve(TEMPLATES_DIR, "provider.hbs")
  const { markdownReference, yaml } = renderConfigReference(schema)

  const moduleOutputsReference =
    moduleOutputsSchema &&
    renderTemplateStringReference({
      schema: joi.object().keys({
        outputs: moduleOutputsSchema.required(),
      }),
      prefix: "providers",
      placeholder: "<provider-name>",
      exampleName: "my-provider",
    })

  const template = handlebars.compile(readFileSync(providerTemplatePath).toString())
  const frontmatterTitle = `\`${name}\` Provider`
  return template({ name, docs, frontmatterTitle, markdownReference, yaml, moduleOutputsReference })
}
