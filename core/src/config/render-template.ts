/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Document } from "yaml"
import { type UnrefinedModuleConfig, coreModuleSpecSchema, BaseModuleSpec } from "./module.js"
import { dedent, deline, naturalList } from "../util/string.js"
import type { BaseGardenResource, BaseGardenResourceMetadata, RenderTemplateKind, YamlDocumentWithSource } from "./base.js"
import {
  baseInternalFieldsSchema,
  configTemplateKind,
  prepareModuleResource,
  prepareResource,
  renderTemplateKind,
} from "./base.js"
import {
  maybeTemplateString,
  resolveTemplateString,
} from "../template-string/template-string.js"
import type { Garden } from "../garden.js"
import { ConfigurationError, GardenError, InternalError } from "../exceptions.js"
import { resolve, posix } from "path"
import fsExtra, { ensureDirSync } from "fs-extra"
const { ensureDir } = fsExtra
import { EnvironmentConfigContext } from "./template-contexts/project.js"
import type { ResolveConfigTemplateResult, TemplatableConfig } from "./config-template.js"
import { templatableKinds, templateNoTemplateFields } from "./config-template.js"
import { createSchema, joi, joiIdentifier, joiUserIdentifier, omitFromSchema, unusedApiVersionSchema } from "./common.js"
import type { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import { RenderTemplateConfigContext } from "./template-contexts/render.js"
import type { Log } from "../logger/log-entry.js"
import { GardenConfig } from "../template-string/validation.js"
import { evaluate } from "../template-string/lazy.js"
import { isPlainObject } from "../util/objects.js"
import { TemplateLeaf } from "../template-string/inputs.js"
import { GenericContext } from "./template-contexts/base.js"
import { BaseActionConfigMetadata } from "../actions/types.js"
import { s } from "./zod.js"

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

export type RenderTemplateConfig = BaseGardenResource & {
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

export function convertTemplatedModuleToRender(config: UnrefinedModuleConfig): GardenConfig<RenderTemplateConfig> {
  return config.transformParsedConfig((config, context, opts) => {
    const evaluated = evaluate({ value: config, context, opts })

    if (!isPlainObject(evaluated)) {
      throw new InternalError({
        message: `Expected a plain object`,
      })
    }

    const spec = evaluate({ value: evaluated.spec, context, opts })

    if (!isPlainObject(spec)) {
      throw new InternalError({
        message: `Expected a plain object`,
      })
    }

    return {
      apiVersion: evaluated.apiVersion || TemplateLeaf.from(undefined),
      kind: TemplateLeaf.from(renderTemplateKind),
      name: evaluated.name || TemplateLeaf.from(undefined),
      disabled: evaluated.disabled || TemplateLeaf.from(undefined),

      template: spec.template || TemplateLeaf.from(undefined),
      inputs: spec.inputs || TemplateLeaf.from(undefined),
    }
  }).refineWithJoi<RenderTemplateConfig>(renderTemplateConfigSchema())
}

export type RefinedRenderTemplateConfig = GardenConfig<Omit<RenderTemplateConfig, "inputs">, BaseActionConfigMetadata>

export type RenderConfigTemplateResult = {
  refined: RefinedRenderTemplateConfig
  modules: GardenConfig<BaseModuleSpec, BaseActionConfigMetadata>[]
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
  config: GardenConfig<BaseGardenResource & Pick<RenderTemplateConfig, "kind">, BaseActionConfigMetadata>
  templates: { [name: string]: ResolveConfigTemplateResult }
}): Promise<RenderConfigTemplateResult> {
  // Resolve template strings for fields. Note that inputs are partially resolved, and will be fully resolved later
  // when resolving the resulting modules. Inputs that are used in module names must however be resolvable
  // immediately.
  const loggedIn = garden.isLoggedIn()
  const enterpriseDomain = garden.cloudApi?.domain
  const templateContext = new EnvironmentConfigContext({ ...garden, loggedIn, enterpriseDomain })

  const withInputs = config.withContext(templateContext).refineWithZod(s.object({
    inputs: s.map(s.string(), s.any()),
  }))

  // inputs are needed to continue to resolve the actions that result from this template config
  // in later stages, the inputs need to be added to the respective resolve contexts.
  const inputs = new GenericContext(withInputs.config.inputs)
  config.metadata.inputs = inputs

  const refined = config.withContext(templateContext).refineWithJoi<Omit<RenderTemplateConfig, "inputs">>(
    omitFromSchema(renderTemplateConfigSchema(), "inputs")
  )

  // Return immediately if config is disabled
  if (refined.config.disabled) {
    return { refined, modules: [], configs: [] }
  }

  const template = templates[refined.config.template]

  if (!template) {
    const availableTemplates = Object.keys(templates)
    throw new ConfigurationError({
      message: deline`
        Render ${refined.config.name} references template ${refined.config.template} which cannot be found.
        Available templates: ${naturalList(availableTemplates)}
      `,
    })
  }

  // Prepare modules and resolve templated names
  const context = new RenderTemplateConfigContext({
    ...garden,
    loggedIn: garden.isLoggedIn(),
    enterpriseDomain,
    parentName: refined.config.name,
    templateName: template.refined.config.name,
    inputs,
  })

  // TODO: remove in 0.14
  const modules = await renderModules({ garden, template, context, renderConfig: refined  })

  const configs = await renderConfigs({ garden, log, template, context, renderConfig: refined })

  return { refined, modules, configs }
}

async function renderModules({
  garden,
  template,
  context,
  renderConfig,
}: {
  garden: Garden
  template: ResolveConfigTemplateResult
  context: RenderTemplateConfigContext
  renderConfig: RefinedRenderTemplateConfig
}): Promise<GardenConfig<BaseModuleSpec, BaseGardenResourceMetadata>[]> {
  return Promise.all(
    (template.refined.config.modules || []).map(async (m, i) => {
      // TODO: capture the context instead of partial resolution, if needed.
      // Run a partial template resolution with the parent+template info
      // const spec = resolveTemplateStrings({
      //   value: m,
      //   context,
      //   contextOpts: { allowPartial: true },
      //   source: { yamlDoc, basePath: ["modules", i] },
      // })

      // TODO: what about basePath?
      const renderConfigPath = renderConfig.configFileDirname! //|| renderConfig.metadata.basePath

      // TODO: Perform transformation on a different level of abstraction for improved safety.
      const moduleResource = template.refined.transformUnparsedConfig((config, _context, _opts) => {
        if (!isPlainObject(config)) {
          throw new InternalError({
            message: `Expected a plain object`,
          })
        }

        const spec = config["modules"]?.[i]

        if (!isPlainObject(spec)) {
          throw new InternalError({
            message: `Expected a plain object`,
          })
        }

        let moduleConfig: BaseModuleSpec

        try {
          moduleConfig = prepareModuleResource(spec, renderConfigPath, garden.projectRoot)
        } catch (error) {
          if (!(error instanceof GardenError)) {
            throw error
          }
          let msg = error.message

          if (spec.name && spec.name.includes && spec.name.includes("${")) {
            msg +=
              ". Note that if a template string is used in the name of a module in a template, then the template string must be fully resolvable at the time of module scanning. This means that e.g. references to other modules or runtime outputs cannot be used."
          }

          throw new ConfigurationError({
            message: `${configTemplateKind} ${template.refined.config.name} returned an invalid module (named ${spec.name}) for templated module ${renderConfig.config.name}: ${msg}`,
          })
        }

        // Resolve the file source path to an absolute path, so that it can be used during module resolution
        moduleConfig.generateFiles = (moduleConfig.generateFiles || []).map((f) => ({
          ...f,
          sourcePath: f.sourcePath && resolve(template.refined.metadata.basePath, ...f.sourcePath.split(posix.sep)),
        }))

        // If a path is set, resolve the path and ensure that directory exists
        if (spec.path) {
          moduleConfig.path = resolve(template.refined.metadata.basePath, ...spec.path.split(posix.sep))
          ensureDirSync(moduleConfig.path)
        }

        return moduleConfig
      })

      moduleResource.metadata.parentName = renderConfig.config.name
      moduleResource.metadata.templateName = template.refined.config.name
      moduleResource.metadata.inputs = renderConfig.metadata.inputs

      return moduleResource.refineWithJoi<BaseModuleSpec>(coreModuleSpecSchema())
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
  template: ResolveConfigTemplateResult
  context: RenderTemplateConfigContext
  renderConfig: RefinedRenderTemplateConfig
}): Promise<TemplatableConfig[]> {
  const templateDescription = `${configTemplateKind} '${template.name}'`

  return Promise.all(
    (template.configs || []).map(async (m) => {
      // Resolve just the name, which must be immediately resolvable
      let resolvedName = m.name

      try {
        resolvedName = resolveTemplateString({ string: m.name, context, contextOpts: { allowPartial: false } })
      } catch (error) {
        throw new ConfigurationError({
          message: `Could not resolve the \`name\` field (${m.name}) for a config in ${templateDescription}: ${error}\n\nNote that template strings in config names in must be fully resolvable at the time of scanning. This means that e.g. references to other actions, modules or runtime outputs cannot be used.`,
        })
      }

      // TODO: validate this before?
      for (const field of templateNoTemplateFields) {
        if (maybeTemplateString(m[field])) {
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

      let resource: GardenConfig<BaseGardenResource>

      try {
        resource = prepareResource({
          log,
          doc: new Document(spec) as YamlDocumentWithSource,
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
