/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { readFileSync } from "fs"
import { resolve } from "path"
import { baseModuleSpecSchema } from "../config/module.js"
import handlebars from "handlebars"
import { joi } from "../config/common.js"
import {
  ModuleReferenceContext,
  ServiceRuntimeContext,
  TaskRuntimeContext,
} from "../config/template-contexts/module.js"
import type { ModuleTypeDefinition } from "../plugin/plugin.js"
import { renderConfigReference, renderTemplateStringReference, TEMPLATES_DIR } from "./config.js"

const populateModuleSchema = (schema: Joi.ObjectSchema) => baseModuleSpecSchema().concat(schema)

export const moduleTypes = [
  { name: "exec" },
  { name: "container" },
  { name: "helm", pluginName: "local-kubernetes" },
  { name: "jib-container" },
  { name: "kubernetes", pluginName: "local-kubernetes" },
  { name: "templated" },
  { name: "terraform" },
  { name: "pulumi" },
]

/**
 * Generates the module types reference from the module-type.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
export function renderModuleTypeReference(name: string, definitions: { [name: string]: ModuleTypeDefinition }) {
  const desc = definitions[name]
  const { docs } = desc
  let { schema } = desc

  if (!schema) {
    schema = joi.object().keys({}).unknown(false)
  }

  const moduleTemplatePath = resolve(TEMPLATES_DIR, "module-type.hbs")
  const { markdownReference, yaml } = renderConfigReference(populateModuleSchema(schema))

  // Get each schema from the module definitions, or the nearest base schema
  const getOutputsSchema = (
    spec: ModuleTypeDefinition,
    type: "moduleOutputsSchema" | "serviceOutputsSchema" | "taskOutputsSchema"
  ): Joi.ObjectSchema => {
    const outputsSchema = desc[type]

    if (outputsSchema) {
      return outputsSchema
    } else if (spec.base) {
      return getOutputsSchema(definitions[spec.base], type)
    } else {
      return joi.object()
    }
  }

  const moduleOutputsReference = renderTemplateStringReference({
    schema: ModuleReferenceContext.getSchema().keys({
      outputs: getOutputsSchema(desc, "moduleOutputsSchema").required(),
    }),
    prefix: "modules",
    placeholder: "<module-name>",
    exampleName: "my-module",
  })

  const serviceOutputsReference = renderTemplateStringReference({
    schema: ServiceRuntimeContext.getSchema().keys({
      outputs: getOutputsSchema(desc, "serviceOutputsSchema").required(),
    }),
    prefix: "runtime.services",
    placeholder: "<service-name>",
    exampleName: "my-service",
  })

  const taskOutputsReference = renderTemplateStringReference({
    schema: TaskRuntimeContext.getSchema().keys({
      outputs: getOutputsSchema(desc, "taskOutputsSchema").required(),
    }),
    prefix: "runtime.tasks",
    placeholder: "<task-name>",
    exampleName: "my-tasks",
  })

  const frontmatterTitle = `\`${name}\` Module Type`
  const template = handlebars.compile(readFileSync(moduleTemplatePath).toString())
  return template({
    frontmatterTitle,
    name,
    docs,
    markdownReference,
    yaml,
    hasOutputs: moduleOutputsReference || serviceOutputsReference || taskOutputsReference,
    moduleOutputsReference,
    serviceOutputsReference,
    taskOutputsReference,
  })
}
