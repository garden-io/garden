/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi, apiVersionSchema, joiUserIdentifier, CustomObjectSchema } from "./common"
import { baseModuleSpecSchema, BaseModuleSpec, ModuleConfig } from "./module"
import { dedent, deline } from "../util/string"
import { GardenResource, prepareModuleResource } from "./base"
import { DOCS_BASE_URL } from "../constants"
import { resolveTemplateStrings } from "../template-string"
import { validateWithPath } from "./validation"
import { Garden } from "../garden"
import { ConfigurationError } from "../exceptions"
import { resolve, posix, dirname } from "path"
import { readFile, ensureDir } from "fs-extra"
import Bluebird from "bluebird"
import { TemplatedModuleConfig, templatedModuleSpecSchema } from "../plugins/templated"
import { omit } from "lodash"
import { ProjectConfigContext, EnvironmentConfigContext } from "./template-contexts/project"
import { ModuleTemplateConfigContext } from "./template-contexts/module"

const inputTemplatePattern = "${inputs.*}"
const parentNameTemplate = "${parent.name}"
const moduleTemplateNameTemplate = "${template.name}"
const moduleTemplateReferenceUrl = DOCS_BASE_URL + "/reference/template-strings#module-configuration-context"

export const templateKind = "ModuleTemplate"

export type TemplateKind = typeof templateKind

interface TemplatedModuleSpec extends Partial<BaseModuleSpec> {
  type: string
}

export interface ModuleTemplateResource extends GardenResource {
  inputsSchemaPath?: string
  modules?: TemplatedModuleSpec[]
}

export interface ModuleTemplateConfig extends ModuleTemplateResource {
  inputsSchema: CustomObjectSchema
}

export async function resolveModuleTemplate(
  garden: Garden,
  resource: ModuleTemplateResource
): Promise<ModuleTemplateConfig> {
  // Resolve template strings, minus module templates and files
  const partial = {
    ...resource,
    modules: [],
  }
  const context = new ProjectConfigContext({ ...garden, branch: garden.vcsBranch })
  const resolved = resolveTemplateStrings(partial, context)

  // Validate the partial config
  const validated = validateWithPath({
    config: resolved,
    path: resource.configPath || resource.path,
    schema: moduleTemplateSchema(),
    projectRoot: garden.projectRoot,
    configType: templateKind,
  })

  // Read and validate the JSON schema, if specified
  // -> default to object with no properties
  let inputsJsonSchema = {
    type: "object",
    additionalProperties: false,
  }

  const configDir = resource.configPath ? dirname(resource.configPath) : resource.path

  if (validated.inputsSchemaPath) {
    const path = resolve(configDir, ...validated.inputsSchemaPath.split(posix.sep))
    try {
      inputsJsonSchema = JSON.parse((await readFile(path)).toString())
    } catch (error) {
      throw new ConfigurationError(`Unable to read inputs schema for ${templateKind} ${validated.name}: ${error}`, {
        path,
        error,
      })
    }

    const type = inputsJsonSchema?.type

    if (type !== "object") {
      throw new ConfigurationError(
        `Inputs schema for ${templateKind} ${validated.name} has type ${type}, but should be "object".`,
        { path, type }
      )
    }
  }

  // Add the module templates back and return
  return {
    ...validated,
    inputsSchema: joi.object().jsonSchema(inputsJsonSchema),
    modules: resource.modules,
  }
}

export async function resolveTemplatedModule(
  garden: Garden,
  config: TemplatedModuleConfig,
  templates: { [name: string]: ModuleTemplateConfig }
) {
  // Resolve template strings for fields. Note that inputs are partially resolved, and will be fully resolved later
  // when resolving the resolving the resulting modules. Inputs that are used in module names must however be resolvable
  // immediately.
  const templateContext = new EnvironmentConfigContext({ ...garden, branch: garden.vcsBranch })
  const resolvedWithoutInputs = resolveTemplateStrings(
    { ...config, spec: omit(config.spec, "inputs") },
    templateContext
  )
  const partiallyResolvedInputs = resolveTemplateStrings(config.spec.inputs || {}, templateContext, {
    allowPartial: true,
  })
  const resolved = {
    ...resolvedWithoutInputs,
    spec: { ...resolvedWithoutInputs.spec, inputs: partiallyResolvedInputs },
  }

  const configType = "templated module " + resolved.name

  let resolvedSpec = omit(resolved.spec, "build")

  // Return immediately if module is disabled
  if (resolved.disabled) {
    return { resolvedSpec, modules: [] }
  }

  // Validate the module spec
  resolvedSpec = validateWithPath({
    config: resolvedSpec,
    configType,
    path: resolved.configPath || resolved.path,
    schema: templatedModuleSpecSchema(),
    projectRoot: garden.projectRoot,
  })

  const template = templates[resolvedSpec.template]

  if (!template) {
    const availableTemplates = Object.keys(templates)
    throw new ConfigurationError(
      deline`
      Templated module ${resolved.name} references template ${resolvedSpec.template},
      which cannot be found. Available templates: ${availableTemplates.join(", ")}
      `,
      { availableTemplates }
    )
  }

  // Prepare modules and resolve templated names
  const context = new ModuleTemplateConfigContext({
    ...garden,
    branch: garden.vcsBranch,
    parentName: resolved.name,
    templateName: template.name,
    inputs: partiallyResolvedInputs,
  })

  const modules = await Bluebird.map(template.modules || [], async (m) => {
    // Run a partial template resolution with the parent+template info
    const spec = resolveTemplateStrings(m, context, { allowPartial: true })

    let moduleConfig: ModuleConfig

    try {
      moduleConfig = prepareModuleResource(spec, resolved.configPath || resolved.path, garden.projectRoot)
    } catch (error) {
      let msg = error.message

      if (spec.name && spec.name.includes && spec.name.includes("${")) {
        msg +=
          ". Note that if a template string is used in the name of a module in a template, then the template string must be fully resolvable at the time of module scanning. This means that e.g. references to other modules or runtime outputs cannot be used."
      }

      throw new ConfigurationError(
        `${templateKind} ${template.name} returned an invalid module (named ${spec.name}) for templated module ${resolved.name}: ${msg}`,
        {
          moduleSpec: spec,
          parent: resolvedSpec,
          error,
        }
      )
    }

    // Resolve the file source path to an absolute path, so that it can be used during module resolution
    moduleConfig.generateFiles = (moduleConfig.generateFiles || []).map((f) => ({
      ...f,
      sourcePath: f.sourcePath && resolve(template.path, ...f.sourcePath.split(posix.sep)),
    }))

    // If a path is set, resolve the path and ensure that directory exists
    if (spec.path) {
      moduleConfig.path = resolve(resolved.path, ...spec.path.split(posix.sep))
      await ensureDir(moduleConfig.path)
    }

    // Attach metadata
    moduleConfig.parentName = resolved.name
    moduleConfig.templateName = template.name
    moduleConfig.inputs = partiallyResolvedInputs

    return moduleConfig
  })

  return { resolvedSpec, modules }
}

export const moduleTemplateSchema = () =>
  joi.object().keys({
    apiVersion: apiVersionSchema(),
    kind: joi.string().allow(templateKind).only().default(templateKind),
    name: joiUserIdentifier().description("The name of the template."),
    path: joi.string().description(`The directory path of the ${templateKind}.`).meta({ internal: true }),
    configPath: joi.string().description(`The path of the ${templateKind} config file.`).meta({ internal: true }),
    inputsSchemaPath: joi
      .posixPath()
      .relativeOnly()
      .description(
        "Path to a JSON schema file describing the expected inputs for the template. Must be an object schema. If none is provided, no inputs will be accepted and an error thrown if attempting to do so."
      ),
    modules: joi
      .array()
      .items(moduleSchema())
      .description(
        dedent`
        A list of modules this template will output. The schema for each is the same as when you create modules normally in configuration files, with the addition of a \`path\` field, which allows you to specify a sub-directory to set as the module root.

        In addition to any template strings you can normally use for modules (see [the reference](${moduleTemplateReferenceUrl})), you can reference the inputs described by the inputs schema for the template, using ${inputTemplatePattern} template strings, as well as ${parentNameTemplate} and ${moduleTemplateNameTemplate}, to reference the name of the module using the template, and the name of the template itself, respectively. This also applies to file contents specified under the \`files\` key.

        **Important: Make sure you use templates for any identifiers that must be unique, such as module names, service names and task names. Otherwise you'll inevitably run into configuration errors. The module names can reference the ${inputTemplatePattern}, ${parentNameTemplate} and ${moduleTemplateNameTemplate} keys. Other identifiers can also reference those, plus any other keys available for module templates (see [the module context reference](${moduleTemplateReferenceUrl})).**
        `
      ),
  })

const moduleSchema = () =>
  baseModuleSpecSchema().keys({
    path: joi
      .posixPath()
      .relativeOnly()
      .subPathOnly()
      .description(
        "POSIX-style path of a sub-directory to set as the module root. If the directory does not exist, it is automatically created."
      ),
  })
