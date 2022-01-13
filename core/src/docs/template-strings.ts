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
import { getHelperFunctions } from "../template-string/functions"
import { isEqual, sortBy } from "lodash"
import { InternalError } from "../exceptions"

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

  // Prepare example values
  const helperFunctions = sortBy(
    Object.values(getHelperFunctions()).map((spec) => {
      const examples = spec.exampleArguments.map((example) => {
        const argsEncoded = example.input.map((arg) => JSON.stringify(arg))
        const computedOutput = spec.fn(...example.input)
        const renderedResult = JSON.stringify(example.output || computedOutput)

        // This implicitly tests the helpers at documentation render time
        if (!example.skipTest && !isEqual(computedOutput, example.output)) {
          const renderedComputed = JSON.stringify(computedOutput)
          throw new InternalError(
            `Test failed for ${spec.name} helper. Expected input args ${example.input} to resolve to ${renderedResult}, got ${renderedComputed}`,
            { spec }
          )
        }

        return {
          template: "${" + `${spec.name}(${argsEncoded.join(", ")})}`,
          result: renderedResult,
        }
      })

      return { ...spec, examples }
    }),
    "name"
  )

  const markdown = template({
    helperFunctions,
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
