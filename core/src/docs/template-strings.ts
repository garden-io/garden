/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { TEMPLATES_DIR, renderTemplateStringReference } from "./config"
import { readFileSync, writeFileSync } from "fs"
import handlebars from "handlebars"
import { GARDEN_CORE_ROOT } from "../constants"
import {
  ProjectConfigContext,
  EnvironmentConfigContext,
  RemoteSourceConfigContext,
} from "../config/template-contexts/project"
import { ProviderConfigContext } from "../config/template-contexts/provider"
import { ModuleConfigContext, OutputConfigContext } from "../config/template-contexts/module"
import { WorkflowStepConfigContext } from "../config/template-contexts/workflow"
import { helperFunctions } from "../template-string/functions"
import { sortBy } from "lodash"

export function writeTemplateStringReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "template-strings.md")

  const projectContext = renderTemplateStringReference({
    schema: ProjectConfigContext.getSchema().required(),
  })

  const remoteSourceContext = renderTemplateStringReference({
    schema: RemoteSourceConfigContext.getSchema().required(),
  })

  const environmentContext = renderTemplateStringReference({
    schema: EnvironmentConfigContext.getSchema().required(),
  })

  const providerContext = renderTemplateStringReference({
    schema: ProviderConfigContext.getSchema().required(),
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
    helperFunctions: sortBy(Object.values(helperFunctions), "name"),
    projectContext,
    remoteSourceContext,
    environmentContext,
    providerContext,
    moduleContext,
    outputContext,
    workflowContext,
  })

  writeFileSync(outputPath, markdown)
}

if (require.main === module) {
  writeTemplateStringReferenceDocs(resolve(GARDEN_CORE_ROOT, "..", "docs"))
}
