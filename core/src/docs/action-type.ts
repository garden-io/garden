/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import handlebars = require("handlebars")
import { joi } from "../config/common"
import { ModuleReferenceContext } from "../config/template-contexts/module"
import { renderConfigReference, renderTemplateStringReference, TEMPLATES_DIR } from "./config"
import { ActionKind, ActionTypeDefinition } from "../plugin/action-types"
import { buildActionConfigSchema } from "../actions/build"
import { deployActionConfigSchema } from "../actions/deploy"
import { runActionConfigSchema } from "../actions/run"
import { testActionConfigSchema } from "../actions/test"

/**
 * Generates the action type reference from the action-type.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
export function renderActionTypeReference(kind: ActionKind, name: string, desc: ActionTypeDefinition<any>) {
  let { schema, docs } = desc

  const kindLower = kind.toLowerCase()

  const baseSchemas = {
    Build: buildActionConfigSchema(),
    Deploy: deployActionConfigSchema(),
    Run: runActionConfigSchema(),
    Test: testActionConfigSchema(),
  }

  const fullSchema = baseSchemas[kind].keys({ spec: schema })

  const templatePath = resolve(TEMPLATES_DIR, "action-type.hbs")
  const { markdownReference, yaml } = renderConfigReference(fullSchema)

  const staticOutputsSchema = desc.staticOutputsSchema || joi.object()
  const runtimeOutputsSchema = desc.runtimeOutputsSchema || joi.object()
  const outputsSchema = staticOutputsSchema.concat(runtimeOutputsSchema)

  const outputsReference = renderTemplateStringReference({
    schema: ModuleReferenceContext.getSchema().keys({
      outputs: outputsSchema.required(),
    }),
    prefix: `actions.${kind.toLowerCase()}`,
    placeholder: "<name>",
    exampleName: "my-" + kind.toLowerCase(),
  })

  const frontmatterTitle = `\`${name}\` ${kind}`
  const template = handlebars.compile(readFileSync(templatePath).toString())
  return template({
    kind,
    kindLower,
    frontmatterTitle,
    name,
    docs,
    markdownReference,
    yaml,
    hasOutputs: outputsReference,
    outputsReference,
  })
}
