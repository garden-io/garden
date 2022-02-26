/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { isEqual, kebabCase, sortBy } from "lodash"
import { InternalError } from "../exceptions"
import { CustomCommandContext } from "../config/template-contexts/custom-command"
import Joi from "@hapi/joi"

interface ContextSpec {
  schema: Joi.ObjectSchema
  shortName: string
  shortDescription: string
  longDescription: string
}

const contexts: ContextSpec[] = [
  {
    shortName: "Project",
    schema: ProjectConfigContext.getSchema(),
    shortDescription: "Keys available to every field in Project configurations.",
    longDescription:
      "The following keys are available in any template strings within Project configurations, except the `name` field (which cannot be templated). See the [Environment](./environments.md) and [Provider](./providers.md) sections for additional keys available when configuring `environments` and `providers`, respectively.",
  },
  {
    shortName: "Environment",
    schema: EnvironmentConfigContext.getSchema(),
    shortDescription: "Keys available in the `environments` field in Project configurations.",
    longDescription:
      "The following keys are available in template strings under the `environments` key in project configs. Additional keys are available for the `environments[].providers` field, see the [Provider](./providers.md) section for those.",
  },
  {
    shortName: "Provider",
    schema: ProviderConfigContext.getSchema(),
    shortDescription: "Keys available in the `providers` field in Project configurations.",
    longDescription:
      "The following keys are available in template strings under the `providers` key (or `environments[].providers`) in project configs.\n\nProviders can also reference outputs defined by other providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](../providers/README.md) docs for the provider in question, and look for the _Outputs_ section.",
  },
  {
    shortName: "Module",
    schema: ModuleConfigContext.getSchema(),
    shortDescription: "Keys available for Module configurations.",
    longDescription:
      "The below keys are available in template strings in module configs.\n\nModules can reference outputs defined by providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](../providers/README.md) docs for the provider in question, and look for the _Outputs_ section.\n\nModules can also reference outputs defined by other modules, via the `${modules.<module-name>.outputs}` key, as well as service and task outputs via the `${runtime.services.<service-name>.outputs}` and `${runtime.tasks.<task-name>.outputs}` keys.\n\nFor details on which outputs are available for a given module type, please refer to the [reference](../module-types/README.md) docs for the module type in question, and look for the _Outputs_ section.",
  },
  {
    shortName: "Remote Source",
    schema: RemoteSourceConfigContext.getSchema(),
    shortDescription: "Keys available in the `sources` field in Project configurations.",
    longDescription: "The following keys are available in template strings under the `sources` key in project configs.",
  },
  {
    shortName: "Project Output",
    schema: OutputConfigContext.getSchema(),
    shortDescription: "Keys available in the `sources` field in Project configurations.",
    longDescription:
      "The below keys are available in template strings for _project outputs_, specified in `outputs[].value` keys in project config files. These include all the keys from the sections above.\n\nOutput values can reference outputs defined by providers, via the `${providers.<provider-name>.outputs}` key. For details on which outputs are available for a given provider, please refer to the [reference](../providers/README.md) docs for the provider in question, and look for the _Outputs_ section.\n\nOutput values may also reference outputs defined by modules, via the `${modules.<module-name>.outputs}` key, as well as service and task outputs via the `${runtime.services.<service-name>.outputs}` and `${runtime.tasks.<task-name>.outputs}` keys.\n\nFor details on which outputs are available for a given module type, please refer to the [reference](../module-types/README.md) docs for the module type in question, and look for the _Outputs_ section.",
  },
  {
    shortName: "Custom Command",
    schema: CustomCommandContext.getSchema(),
    shortDescription: "Keys available in `exec` and `gardenCommand` fields in custom Command configs.",
    longDescription:
      "The below keys are available in template strings for the `exec` and `gardenCommand` fields in [Custom Commands](../../advanced/custom-commands.md).",
  },
  {
    shortName: "Workflow",
    schema: WorkflowStepConfigContext.getSchema(),
    shortDescription: "Keys available in Workflow configurations.",
    longDescription:
      "The below keys are available in template strings for [Workflow](../../using-garden/workflows.md) configurations, as well as the commands defined in [Custom Commands](../../advanced/custom-commands.md).\n\nNote that the `{steps.*}` key is only available for the `steps[].command` and `steps[].script` fields in Workflow configs, and may only reference previous steps in the same workflow. See below for more details.",
  },
]

export function writeTemplateStringReferenceDocs(docsRoot: string) {
  // tslint:disable: no-console
  const referenceDir = resolve(docsRoot, "reference")
  const outputDir = resolve(referenceDir, "template-strings")
  const templatesDir = resolve(TEMPLATES_DIR, "template-strings")

  // Helper functions
  // -> Prepare example values
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

  // -> Write the file
  const helpersTemplatePath = resolve(templatesDir, "functions.hbs")
  const helpersTemplate = handlebars.compile(readFileSync(helpersTemplatePath).toString())
  const helpersOutputPath = resolve(outputDir, "functions.md")
  console.log("-> " + helpersOutputPath)
  writeFileSync(helpersOutputPath, helpersTemplate({ helperFunctions }))

  // Context docs
  const contextTemplatePath = resolve(templatesDir, "context.hbs")
  const contextTemplate = handlebars.compile(readFileSync(contextTemplatePath).toString())

  const annotatedContexts = contexts.map((c, i) => ({
    ...c,
    index: i + 1,
    filename: kebabCase(c.shortName.toLowerCase()) + "s.md",
    shortName: c.shortName + "s",
    longName: c.shortName + " configuration context",
  }))

  for (const c of annotatedContexts) {
    const outputPath = resolve(outputDir, c.filename)
    const markdown = contextTemplate({ ...c, context: renderTemplateStringReference({ schema: c.schema.required() }) })
    console.log("-> " + outputPath)
    writeFileSync(outputPath, markdown)
  }

  // README
  const readmeTemplatePath = resolve(templatesDir, "README.hbs")
  const readmeTemplate = handlebars.compile(readFileSync(readmeTemplatePath).toString())
  const readmeOutputPath = resolve(outputDir, "README.md")
  console.log("-> " + readmeOutputPath)
  writeFileSync(readmeOutputPath, readmeTemplate({ contexts: annotatedContexts }))
}

if (require.main === module) {
  writeTemplateStringReferenceDocs(resolve(GARDEN_CORE_ROOT, "..", "docs"))
}
