/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { TEMPLATES_DIR, renderTemplateStringReference } from "./config"
import {
  ProjectConfigContext,
  ModuleConfigContext,
  ProviderConfigContext,
  OutputConfigContext,
  WorkflowStepConfigContext,
  EnvironmentConfigContext,
} from "../config/config-context"
import { readFileSync, writeFileSync } from "fs"
import handlebars from "handlebars"
import { GARDEN_SERVICE_ROOT } from "../constants"

export function writeTemplateStringReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "template-strings.md")

  const projectContext = renderTemplateStringReference({
    schema: ProjectConfigContext.getSchema().required(),
  })

  const providerContext = renderTemplateStringReference({
    schema: ProviderConfigContext.getSchema().required(),
  })

  const environmentContext = renderTemplateStringReference({
    schema: EnvironmentConfigContext.getSchema().required(),
  })

  const moduleContext = renderTemplateStringReference({
    schema: ModuleConfigContext.getSchema().required(),
  })

  const outputContext = renderTemplateStringReference({
    schema: OutputConfigContext.getSchema().required(),
  })

  const workflowContext = renderTemplateStringReference({
    schema: WorkflowStepConfigContext.getSchema().required(),
  })

  const templatePath = resolve(TEMPLATES_DIR, "template-strings.hbs")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({
    projectContext,
    environmentContext,
    providerContext,
    moduleContext,
    outputContext,
    workflowContext,
  })

  writeFileSync(outputPath, markdown)
}

if (require.main === module) {
  writeTemplateStringReferenceDocs(resolve(GARDEN_SERVICE_ROOT, "..", "docs"))
}
