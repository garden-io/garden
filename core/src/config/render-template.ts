/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { coreModuleSpecKeys, type ModuleConfig } from "./module.js"
import { dedent, deline, naturalList } from "../util/string.js"
import type { BaseGardenResource, RenderTemplateKind } from "./base.js"
import {
  baseInternalFieldsSchema,
  configTemplateKind,
  prepareModuleResource,
  prepareResource,
  renderTemplateKind,
} from "./base.js"
import { isUnresolved } from "../template/templated-strings.js"
import { validateWithPath } from "./validation.js"
import type { Garden } from "../garden.js"
import { ConfigurationError, GardenError, InternalError } from "../exceptions.js"
import { resolve, posix } from "path"
import fsExtra from "fs-extra"

const { ensureDir } = fsExtra
import type { TemplatedModuleConfig } from "../plugins/templated.js"
import { isString, omit } from "lodash-es"
import { EnvironmentConfigContext } from "./template-contexts/project.js"
import type { ConfigTemplateConfig, TemplatableConfig } from "./config-template.js"
import { templatableKinds, templateNoTemplateFields } from "./config-template.js"
import { createSchema, joi, joiIdentifier, joiUserIdentifier, unusedApiVersionSchema } from "./common.js"
import type { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import { RenderTemplateConfigContext } from "./template-contexts/render.js"
import type { Log } from "../logger/log-entry.js"
import { GardenApiVersion } from "../constants.js"
import { deepEvaluate, evaluate } from "../template/evaluate.js"
import { serialiseUnresolvedTemplates, UnresolvedTemplateValue } from "../template/types.js"
import { isArray, isPlainObject } from "../util/objects.js"
import { InputContext } from "./template-contexts/input.js"

export const renderTemplateConfigSchema = createSchema({
  name: renderTemplateKind,
  keys: () => ({
    apiVersion: unusedApiVersionSchema(),
    kind: joi.string().allow(renderTemplateKind).only().default(renderTemplateKind),
    name: joiUserIdentifier().description("A unique identifier for the Render config."),
    disabled: joi.boolean().default(false).description("Set to true to skip rendering this template."),

    internal: baseInternalFieldsSchema,

    template: joiUserIdentifier().description(`The ${configTemplateKind} to render.`),
    inputs: joi.object().description(
      dedent`
      A map of inputs to pass to the ${configTemplateKind}. These must match the inputs schema of the ${configTemplateKind}.

      Note: You can use template strings for the inputs, but be aware that inputs that are used to generate the resulting config names and other top-level identifiers must be resolvable when scanning for configs, and thus cannot reference other actions, modules or runtime variables. See the [environment configuration context reference](./template-strings/environments.md) to see template strings that are safe to use for inputs used to generate config identifiers.
      `
    ),
  }),
})

export interface RenderTemplateConfig extends BaseGardenResource {
  kind: RenderTemplateKind
  disabled?: boolean
  template: string
  inputs?: DeepPrimitiveMap
}

// TODO: remove in 0.14
export const templatedModuleSpecSchema = createSchema({
  name: "templated-module",
  keys: () => ({
    disabled: joi.boolean().default(false).description("Set to true to skip rendering this template."),
    template: joiIdentifier()
      .required()
      .description(`The ${configTemplateKind} to use to generate the sub-modules of this module.`),
    inputs: joi.object().description(
      dedent`
      A map of inputs to pass to the ${configTemplateKind}. These must match the inputs schema of the ${configTemplateKind}.

      Note: You can use template strings for the inputs, but be aware that inputs that are used to generate the resulting config names and other top-level identifiers must be resolvable when scanning for configs, and thus cannot reference other actions, modules or runtime variables. See the [environment configuration context reference](../template-strings/environments.md) to see template strings that are safe to use for inputs used to generate config identifiers.
      `
    ),
  }),
})

export function convertTemplatedModuleToRender(config: TemplatedModuleConfig): RenderTemplateConfig {
  return {
    apiVersion: config.apiVersion || GardenApiVersion.v0,
    kind: renderTemplateKind,
    name: config.name,
    disabled: config.disabled,

    internal: {
      basePath: config.path,
      configFilePath: config.configPath,
    },

    template: config.spec.template,
    inputs: config.spec.inputs,
  }
}

export interface RenderConfigTemplateResult {
  resolved: RenderTemplateConfig
  modules: ModuleConfig[]
  configs: TemplatableConfig[]
}

export async function renderConfigTemplate({
  garden,
  log,
  config,
  templates,
}: {
  garden: Garden
  log: Log
  config: RenderTemplateConfig
  templates: { [name: string]: ConfigTemplateConfig }
}): Promise<RenderConfigTemplateResult> {
  // Resolve template strings for fields. Note that inputs are partially resolved, and will be fully resolved later
  // when resolving the resulting modules. Inputs that are used in module names must however be resolvable
  // immediately.
  const loggedIn = garden.isLoggedIn()
  const templateContext = new EnvironmentConfigContext({ ...garden, loggedIn, cloudBackendDomain: garden.cloudDomain })

  // @ts-expect-error todo: correct types for unresolved configs
  const resolvedWithoutInputs: RenderTemplateConfig = deepEvaluate(omit(config, "inputs"), {
    context: templateContext,
    opts: {},
  })

  let resolved: RenderTemplateConfig = {
    ...resolvedWithoutInputs,
    inputs: config.inputs,
  }

  const configType = "Render " + resolved.name

  // Return immediately if config is disabled
  if (resolved.disabled) {
    return { resolved, modules: [], configs: [] }
  }

  resolved = validateWithPath({
    config: resolved,
    configType,
    path: resolved.internal.configFilePath || resolved.internal.basePath,
    schema: renderTemplateConfigSchema(),
    projectRoot: garden.projectRoot,
    source: undefined,
  })

  const template = templates[resolved.template]

  if (!template) {
    const availableTemplates = Object.keys(templates)
    throw new ConfigurationError({
      message: deline`
        Render ${resolved.name} references template ${resolved.template} which cannot be found.
        Available templates: ${naturalList(availableTemplates)}
      `,
    })
  }

  // Prepare modules and resolve templated names
  const context = new RenderTemplateConfigContext({
    ...garden,
    loggedIn: garden.isLoggedIn(),
    cloudBackendDomain: garden.cloudDomain,
    parentName: resolved.name,
    templateName: template.name,
    inputs: InputContext.forRenderTemplate(config, template),
  })

  // TODO: remove in 0.14
  const modules = await renderModules({ garden, template, context, renderConfig: resolved })

  const configs = await renderConfigs({ garden, log, template, context, renderConfig: resolved })

  return { resolved, modules, configs }
}

async function renderModules({
  garden,
  template,
  context,
  renderConfig,
}: {
  garden: Garden
  template: ConfigTemplateConfig
  context: RenderTemplateConfigContext
  renderConfig: RenderTemplateConfig
}): Promise<ModuleConfig[]> {
  return Promise.all(
    (template.modules || []).map(async (m, index) => {
      // @ts-expect-error todo: correct types for unresolved configs
      const spec = evaluate(m, {
        context,
        opts: {},
      }).resolved

      if (!isPlainObject(spec)) {
        throw new ConfigurationError({
          message: `${configTemplateKind} ${template.name}: invalid module at index ${index}: Must be or resolve to a plain object`,
        })
      }

      const renderConfigPath = renderConfig.internal.configFilePath || renderConfig.internal.basePath

      let moduleConfig: ModuleConfig

      // Need to account for the path key for module templates
      const coreKeys = [...coreModuleSpecKeys(), "path"]

      const resolvedSpec = { ...spec }
      try {
        for (const key of coreKeys) {
          resolvedSpec[key] = deepEvaluate(resolvedSpec[key], { context, opts: {} })
        }
        moduleConfig = prepareModuleResource(resolvedSpec, renderConfigPath, garden.projectRoot)
      } catch (error) {
        if (!(error instanceof GardenError) || error.type === "crash") {
          throw error
        }
        let msg = error.message

        if (coreKeys.some((k) => spec[k] instanceof UnresolvedTemplateValue)) {
          msg +=
            "\n\nNote that if a template string is used for the name, kind, type or apiVersion of a module in a template, then the template string must be fully resolvable at the time of module scanning. This means that e.g. references to other modules or runtime outputs cannot be used."
        }

        throw new ConfigurationError({
          message: `${configTemplateKind} ${template.name} returned an invalid module (named ${
            // We use serializeUnresolvedTemplates here because the error message is clearer for the user with a plain unresolved template string
            serialiseUnresolvedTemplates(resolvedSpec.name)
          }) for templated module ${renderConfig.name}: ${msg}`,
        })
      }

      // Resolve the file source path to an absolute path, so that it can be used during module resolution
      moduleConfig.generateFiles = (moduleConfig.generateFiles || []).map((f) => ({
        ...f,
        sourcePath: f.sourcePath && resolve(template.internal.basePath, ...f.sourcePath.split(posix.sep)),
      }))

      // If a path is set, resolve the path and ensure that directory exists
      if (resolvedSpec.path && isString(resolvedSpec.path)) {
        moduleConfig.path = resolve(renderConfig.internal.basePath, ...resolvedSpec.path.split(posix.sep))
        await ensureDir(moduleConfig.path)
      }

      // Attach metadata
      moduleConfig.parentName = renderConfig.name
      moduleConfig.templateName = template.name
      moduleConfig.inputs = renderConfig.inputs

      return moduleConfig
    })
  )
}

async function renderConfigs({
  garden,
  log,
  template,
  context,
  renderConfig,
}: {
  garden: Garden
  log: Log
  template: ConfigTemplateConfig
  context: RenderTemplateConfigContext
  renderConfig: RenderTemplateConfig
}): Promise<TemplatableConfig[]> {
  const templateDescription = `${configTemplateKind} '${template.name}'`
  // @ts-expect-error todo: correct types for unresolved configs
  const templateConfigs = evaluate(template.configs || [], {
    context,
    opts: {},
  }).resolved

  if (!isArray(templateConfigs)) {
    throw new InternalError({ message: "Expected templateConfigs to be an array" })
  }

  return Promise.all(
    templateConfigs.map(async (c) => {
      const m = evaluate(c, {
        context,
        opts: {},
      }).resolved as any

      // Resolve just the name, which must be immediately resolvable
      let resolvedName = m.name

      try {
        resolvedName = deepEvaluate(m.name, {
          context,
          opts: {},
        }) as string
      } catch (error) {
        if (!(error instanceof GardenError)) {
          throw error
        }

        throw new ConfigurationError({
          message: `Could not resolve the \`name\` field (${m.name}) for a config in ${templateDescription}: ${error}\n\nNote that template strings in config names in must be fully resolvable at the time of scanning. This means that e.g. references to other actions, modules or runtime outputs cannot be used.`,
        })
      }

      // TODO: validate this before?
      for (const field of templateNoTemplateFields) {
        if (isUnresolved(m[field])) {
          throw new ConfigurationError({
            message: `${templateDescription} contains an invalid resource: Found a template string in '${field}' field (${m[field]}).`,
          })
        }
      }

      if (!templatableKinds.includes(m.kind)) {
        throw new ConfigurationError({
          message: `Unexpected kind '${m.kind}' found in ${templateDescription}. Supported kinds are: ${naturalList(
            templatableKinds
          )}`,
        })
      }

      const spec = { ...m, name: resolvedName }
      const renderConfigPath = renderConfig.internal.configFilePath || renderConfig.internal.basePath

      let resource: TemplatableConfig

      try {
        resource = <TemplatableConfig>prepareResource({
          log,
          spec,
          doc: undefined,
          configFilePath: renderConfigPath,
          projectRoot: garden.projectRoot,
          description: `resource in Render ${renderConfig.name}`,
          allowInvalid: false,
        })!
      } catch (error) {
        if (!(error instanceof ConfigurationError)) {
          throw error
        }
        throw new ConfigurationError({
          message: `${templateDescription} returned an invalid config (named ${spec.name}) for Render ${
            renderConfig.name
          }: ${error.message || error}}`,
          wrappedErrors: [error],
        })
      }

      // If a path is set, resolve the path and ensure that directory exists
      if (spec.path) {
        resource.internal.basePath = resolve(renderConfig.internal.basePath, ...spec.path.split(posix.sep))
        await ensureDir(resource.internal.basePath)
      }

      // Attach metadata
      resource.internal.parentName = renderConfig.name
      resource.internal.templateName = template.name

      resource.internal.inputs = renderConfig.inputs
      return resource
    })
  )
}
