/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import { readFileSync, writeFileSync } from "fs"
import { safeDump } from "js-yaml"
import linewrap from "linewrap"
import { resolve } from "path"
import { projectSchema, environmentSchema } from "../config/project"
import { get, flatten, startCase, uniq, keyBy, find, isFunction, extend } from "lodash"
import { baseModuleSpecSchema } from "../config/module"
import handlebars = require("handlebars")
import { joiArray, joi } from "../config/common"
import { Garden } from "../garden"
import { GARDEN_SERVICE_ROOT } from "../constants"
import { indent, renderMarkdownTable } from "./util"
import { ModuleContext, ServiceRuntimeContext, TaskRuntimeContext } from "../config/config-context"
import { defaultDotIgnoreFiles } from "../util/fs"
import { providerConfigBaseSchema } from "../config/provider"
import { GardenPlugin, ModuleTypeDefinition, PluginMap } from "../types/plugin/plugin"
import { getPluginBases } from "../plugins"

export const TEMPLATES_DIR = resolve(GARDEN_SERVICE_ROOT, "src", "docs", "templates")
const partialTemplatePath = resolve(TEMPLATES_DIR, "config-partial.hbs")

const populateModuleSchema = (schema: Joi.ObjectSchema) => baseModuleSpecSchema.concat(schema)

const populateProviderSchema = (schema: Joi.ObjectSchema) =>
  joi.object().keys({
    providers: joiArray(schema),
  })

const maxWidth = 120
const moduleTypes = [
  { name: "exec" },
  { name: "container" },
  { name: "conftest", pluginName: "conftest" },
  { name: "hadolint" },
  { name: "helm", pluginName: "local-kubernetes" },
  { name: "kubernetes", pluginName: "local-kubernetes" },
  { name: "maven-container" },
  { name: "openfaas", pluginName: "local-kubernetes" },
  { name: "terraform" },
]

interface RenderOpts {
  level?: number
  renderRequired?: boolean
  renderBasicDescription?: boolean
  renderFullDescription?: boolean
  renderEllipsisBetweenKeys?: boolean
  useExampleForValue?: boolean
}

// Need this to fix the Joi typing
export interface Description extends Joi.Description {
  name: string
  level: number
  parent?: NormalizedSchemaDescription
  flags?: {
    default?: any
    description?: string
    presence?: string
    only?: boolean
  }
}

export interface NormalizedSchemaDescription extends Description {
  required: boolean
  defaultValue?: string
  hasChildren: boolean
  allowedValues?: string
  description?: string
  formattedExample?: string
  formattedName: string
  formattedType: string
}

// Maps a Joi schema description into an array of descriptions and normalizes each entry.
// Filters out internal descriptions.
export function normalizeSchemaDescriptions(
  joiDescription: Description,
  { renderPatternKeys = false } = {}
): NormalizedSchemaDescription[] {
  const normalize = (
    joiDesc: Description,
    { level = 0, name, parent }: { level?: number; name?: string; parent?: NormalizedSchemaDescription } = {}
  ): NormalizedSchemaDescription[] => {
    let schemaDescription: NormalizedSchemaDescription | undefined
    let childDescriptions: NormalizedSchemaDescription[] = []

    // Skip descriptions without names since they merely point to the keys we're interested in.
    // This means that we implicitly skip the first key of the schema.
    if (name) {
      schemaDescription = normalizeKeyDescription({ ...joiDesc, name, level, parent })
    }

    if (joiDesc.type === "object") {
      const children = Object.entries(joiDesc.keys || {}) || []
      const nextLevel = name ? level + 1 : level
      const nextParent = name ? schemaDescription : parent
      childDescriptions = flatten(
        children.map(([childName, childDescription]) =>
          normalize(childDescription as Description, { level: nextLevel, parent: nextParent, name: childName })
        )
      )
      if (renderPatternKeys && joiDesc.patterns && joiDesc.patterns.length > 0) {
        const metas: any = extend({}, ...(joiDesc.metas || []))
        childDescriptions.push(
          ...normalize(joiDesc.patterns[0].rule as Description, {
            level: nextLevel,
            parent: nextParent,
            name: metas.keyPlaceholder || "<name>",
          })
        )
      }
    } else if (joiDesc.type === "array") {
      // We only use the first array item
      const item = joiDesc.items[0]
      childDescriptions = item ? normalize(item, { level: level + 2, parent: schemaDescription }) : []
    }

    if (!schemaDescription) {
      return childDescriptions
    }
    return [schemaDescription, ...childDescriptions]
  }

  return normalize(joiDescription).filter((key) => !get(key, "metas[0].internal"))
}

// Normalizes the key description
function normalizeKeyDescription(schemaDescription: Description): NormalizedSchemaDescription {
  const defaultValue = getDefaultValue(schemaDescription)

  let allowedValues: string | undefined = undefined
  const allowOnly = schemaDescription.flags?.only === true
  if (allowOnly) {
    allowedValues = schemaDescription.allow!.map((v: any) => JSON.stringify(v)).join(", ")
  }

  const presenceRequired = schemaDescription.flags?.presence === "required"
  const required = presenceRequired || allowOnly

  let hasChildren: boolean = false
  let arrayType: string | undefined
  const { type } = schemaDescription
  const formattedType = formatType(schemaDescription)

  const children = type === "object" && Object.entries(schemaDescription.keys || {})
  const items = type === "array" && schemaDescription.items

  if (children && children.length > 0) {
    hasChildren = true
  } else if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    arrayType = items[0].type
    hasChildren = arrayType === "array" || arrayType === "object"
  }

  let formattedExample: string | undefined
  if (schemaDescription.examples && schemaDescription.examples.length) {
    const example = schemaDescription.examples[0]
    if (schemaDescription.type === "object" || schemaDescription.type === "array") {
      formattedExample = safeDump(example).trim()
    } else {
      formattedExample = JSON.stringify(example)
    }
  }

  const formattedName = type === "array" ? `${schemaDescription.name}[]` : schemaDescription.name

  return {
    ...schemaDescription,
    description: schemaDescription.flags?.description,
    formattedName,
    formattedType,
    defaultValue,
    required,
    allowedValues,
    formattedExample,
    hasChildren,
  }
}

function formatType(description: Description) {
  const { type } = description
  const items = type === "array" && description.items

  if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    const arrayType = items[0].type
    return `array[${arrayType}]`
  } else if (type === "alternatives") {
    // returns e.g. "string|number"
    return uniq(description.matches.map(({ schema }) => formatType(schema))).join(" | ")
  } else {
    return type || ""
  }
}

/**
 * Removes line starting with: # ```
 */
export function sanitizeYamlStringForGitBook(yamlStr: string) {
  return yamlStr.replace(/.*# \`\`\`.*$\n/gm, "")
}

export function getDefaultValue(schemaDescription: Description) {
  const flags: any = schemaDescription.flags
  const defaultSpec = flags?.default
  return isFunction(defaultSpec) ? defaultSpec(schemaDescription.parent) : defaultSpec
}

function getParentDescriptions(
  schemaDescription: NormalizedSchemaDescription,
  schemaDescriptions: NormalizedSchemaDescription[] = []
): NormalizedSchemaDescription[] {
  if (schemaDescription.parent) {
    return getParentDescriptions(schemaDescription.parent, [schemaDescription.parent, ...schemaDescriptions])
  }
  return schemaDescriptions
}

function renderMarkdownTitle(description: NormalizedSchemaDescription, prefix = "") {
  const parentDescriptions = getParentDescriptions(description)
  const title =
    parentDescriptions.length > 0
      ? `${parentDescriptions.map((d) => d.formattedName).join(".")}.${description.formattedName}`
      : description.name
  return prefix + title
}

export function renderMarkdownLink(description: NormalizedSchemaDescription) {
  const path = renderMarkdownTitle(description)
    .replace(/\s+/g, "-") // Replace " " with "-""
    .replace(/[\.\[\]\<\>]/g, "") // Replace ".", "[]" and "<>" with ""
    .toLowerCase()
  return `[${description.name}](#${path})`
}

function makeMarkdownDescription(
  description: NormalizedSchemaDescription,
  { titlePrefix = "", showRequiredColumn = true } = {}
) {
  const { formattedType, required, allowedValues, defaultValue } = description
  let experimentalFeature = false
  if (description.meta) {
    experimentalFeature = find(description.meta, (attr) => attr.experimental) || false
  }

  const parentDescriptions = getParentDescriptions(description)
  const title = renderMarkdownTitle(description, titlePrefix)
  const breadCrumbs =
    parentDescriptions.length > 0
      ? parentDescriptions
          .map(renderMarkdownLink)
          .concat(description.name)
          .join(" > ")
      : null

  let formattedExample: string | undefined
  if (description.formattedExample) {
    formattedExample = renderSchemaDescriptionYaml([...parentDescriptions, description], {
      renderFullDescription: false,
      useExampleForValue: true,
      renderEllipsisBetweenKeys: true,
    }).replace(/\n$/, "") // strip trailing new line
  }

  const tableData: any = {
    Type: "`" + formattedType + "`",
    ...(allowedValues ? { "Allowed Values": allowedValues } : {}),
    ...(defaultValue !== undefined ? { Default: "`" + JSON.stringify(defaultValue) + "`" } : {}),
  }

  if (showRequiredColumn) {
    tableData.Required = required ? "Yes" : "No"
  }

  const table = renderMarkdownTable(tableData)

  return {
    ...description,
    breadCrumbs,
    experimentalFeature,
    formattedExample,
    title,
    table,
  }
}

export function renderSchemaDescriptionYaml(
  schemaDescriptions: NormalizedSchemaDescription[],
  {
    renderBasicDescription = false,
    renderFullDescription = true,
    renderRequired = true,
    renderEllipsisBetweenKeys = false,
    useExampleForValue = false,
  }: RenderOpts
) {
  let prevDesc: NormalizedSchemaDescription

  const output = schemaDescriptions.map((desc) => {
    const {
      description,
      formattedExample: example,
      formattedType,
      hasChildren,
      allowedValues,
      required,
      name,
      level,
      defaultValue,
      type,
      parent,
    } = desc
    const indentSpaces = level * 2
    const width = maxWidth - indentSpaces - 2
    const comment: string[] = []
    const out: string[] = []
    const isFirstChild = parent && parent === prevDesc
    const isArrayItem = parent && parent.type === "array"
    const isFirstArrayItem = isArrayItem && isFirstChild
    const isPrimitive = type !== "array" && type !== "object"

    const stringifiedDefaultVal = useExampleForValue
      ? example
      : JSON.stringify(isFunction(defaultValue) ? defaultValue() : defaultValue)
    const exceptionallyTreatAsPrimitive =
      !hasChildren && (stringifiedDefaultVal === "[]" || stringifiedDefaultVal === "{}")

    // Prepend new line if applicable (easier then appending). We skip the new line if comments not shown.
    if (prevDesc && (renderBasicDescription || renderFullDescription)) {
      // Print new line between keys unless the next key is the first child of the parent key or an array item
      if (!isFirstChild && (!isArrayItem || isFirstArrayItem)) {
        out.push("")
      }
    }

    // Print "..." between keys. Only used when rendering markdown for examples.
    if (renderEllipsisBetweenKeys && parent && parent.hasChildren && !isArrayItem) {
      out.push("...")
    }

    // Only print the description
    if (renderBasicDescription) {
      description && comment.push(description)
      // Print the description, type, examples, etc
    } else if (renderFullDescription) {
      description && comment.push(description, "")
      comment.push(`Type: ${formattedType}`, "")
      if (example && !useExampleForValue) {
        if (isPrimitive) {
          // Render example inline
          comment.push(`Example: ${example}`, "")
        } else {
          // Render example in a separate line
          comment.push("Example:", ...indent(example.split("\n"), 1), "")
        }
      }
      renderRequired && comment.push(required ? "Required." : "Optional.")
      allowedValues && comment.push(`Allowed values: ${allowedValues}`, "")
    }

    if (comment.length > 0) {
      const wrap = linewrap(width - 2, { whitespace: "line" })
      const formattedComment = wrap(comment.join("\n"))
        .split("\n")
        .map((line) => "# " + line)
      out.push(...formattedComment)
    }

    // Render key name and value
    const formattedName = isFirstArrayItem ? "- " + name : name
    let value: string | string[] | undefined

    if (example && useExampleForValue) {
      const levels = type === "object" ? 2 : 1
      value = isPrimitive || exceptionallyTreatAsPrimitive ? example : indent(example.split("\n"), levels)
    } else {
      // Non-primitive values get rendered in the line below, indented by one
      if (defaultValue === undefined) {
        value = ""
      } else if (isPrimitive || exceptionallyTreatAsPrimitive) {
        value = safeDump(defaultValue)
      } else {
        value = indent(
          safeDump(defaultValue)
            .trim()
            .split("\n"),
          1
        )
      }
    }

    if (isPrimitive || exceptionallyTreatAsPrimitive) {
      // For primitives we render the value or example inline
      out.push(`${formattedName}: ${value}`)
    } else if (!hasChildren || (example && useExampleForValue)) {
      // For arrays or objects without children, or non-primitive examples, we render the value in the line below
      out.push(`${formattedName}:`, ...value)
    } else {
      // For arrays or objects with children we only print the key, the value is the next key in the descriptions array.
      out.push(`${formattedName}:`)
    }

    prevDesc = desc

    // Dedent first array item to account for the "-" sign
    const lvl = isFirstArrayItem ? level - 1 : level
    return indent(out, lvl)
      .map((line) => line.trimRight())
      .join("\n")
  })

  const schemaDescriptionYaml = output.join("\n")

  // NOTE: Because of an issue with GitBook, code examples inside YAML strings break the layout.
  // So something like:
  //
  // # Example:
  // # ```yaml
  // # foo: bar
  // # ```
  //
  // won't work.
  //
  // Note that the above works fine on e.g. GitHub so the issue is with GitBook.
  // I've opened a ticket but haven't received anything back.
  // TODO: Remove once issue is resolved on GitBook's end.
  return sanitizeYamlStringForGitBook(schemaDescriptionYaml)
}

/**
 * Generates the config reference from the config-partial.hbs template.
 * The config reference contains a list of keys and their description in Markdown
 * and a YAML schema.
 */
export function renderConfigReference(configSchema: Joi.ObjectSchema, titlePrefix = "") {
  const normalizedDescriptions = normalizeSchemaDescriptions(configSchema.describe() as Description)

  const yaml = renderSchemaDescriptionYaml(normalizedDescriptions, { renderBasicDescription: true })
  const keys = normalizedDescriptions.map((d) => makeMarkdownDescription(d, { titlePrefix }))

  const template = handlebars.compile(readFileSync(partialTemplatePath).toString())
  return { markdownReference: template({ keys }), yaml }
}

/**
 * Generates a markdown reference for template string output schemas.
 */
export function renderTemplateStringReference({
  schema,
  prefix,
  placeholder,
  exampleName,
}: {
  schema: Joi.ObjectSchema
  prefix?: string
  placeholder?: string
  exampleName?: string
}): string {
  const normalizedSchemaDescriptions = normalizeSchemaDescriptions(schema.describe() as Description, {
    renderPatternKeys: true,
  })

  const keys = normalizedSchemaDescriptions
    .map((d) => makeMarkdownDescription(d, { showRequiredColumn: false }))
    // Omit objects without descriptions
    .filter((d) => !(d.type === "object" && !d.flags?.description))
    .map((d) => {
      let orgTitle = d.title

      if (placeholder) {
        d.title = `${placeholder}.${d.title}`
      }
      if (prefix) {
        d.title = `${prefix}.${d.title}`
      }

      if (d.type === "object") {
        d.title += ".*"
      } else if (d.formattedExample) {
        let exampleTitle = orgTitle

        if (exampleName) {
          exampleTitle = `${exampleName}.${exampleTitle}`
        }
        if (prefix) {
          exampleTitle = `${prefix}.${exampleTitle}`
        }

        d.formattedExample = `my-variable: \${${exampleTitle}}`
      }

      d.title = `\${${d.title}}`

      // The breadcrumbs don't really make sense here
      d.breadCrumbs = ""

      return d
    })

  const template = handlebars.compile(readFileSync(partialTemplatePath).toString())
  return template({ keys })
}

/**
 * Generates the provider reference from the provider.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
function renderProviderReference(name: string, plugin: GardenPlugin, allPlugins: PluginMap) {
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
  const frontmatterTitle = name
  return template({ name, docs, frontmatterTitle, markdownReference, yaml, moduleOutputsReference })
}

/**
 * Generates the module types reference from the module-type.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
function renderModuleTypeReference(name: string, definitions: { [name: string]: ModuleTypeDefinition }) {
  const desc = definitions[name]
  let { schema, docs } = desc

  if (!schema) {
    schema = joi
      .object()
      .keys({})
      .unknown(false)
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
    schema: ModuleContext.getSchema().keys({
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

  const frontmatterTitle = name
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

/**
 * Generates the base project and module level config references from the base-config.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template for
 * the base project and base module schemas.
 */
function renderBaseConfigReference() {
  const baseTemplatePath = resolve(TEMPLATES_DIR, "base-config.hbs")
  const { markdownReference: projectMarkdownReference, yaml: projectYaml } = renderConfigReference(
    projectSchema.keys({
      // Need to override this because we currently don't handle joi.alternatives() right
      environments: joi
        .array()
        .items(environmentSchema)
        .unique("name"),
    })
  )
  const { markdownReference: moduleMarkdownReference, yaml: moduleYaml } = renderConfigReference(baseModuleSpecSchema)

  const template = handlebars.compile(readFileSync(baseTemplatePath).toString())
  return template({ projectMarkdownReference, projectYaml, moduleMarkdownReference, moduleYaml })
}

export async function writeConfigReferenceDocs(docsRoot: string) {
  // tslint:disable: no-console
  const referenceDir = resolve(docsRoot, "reference")
  const configPath = resolve(referenceDir, "config.md")

  const garden = await Garden.factory(__dirname, {
    config: {
      path: __dirname,
      apiVersion: "garden.io/v0",
      kind: "Project",
      name: "generate-docs",
      defaultEnvironment: "default",
      dotIgnoreFiles: defaultDotIgnoreFiles,
      variables: {},
      environments: [
        {
          name: "default",
          variables: {},
        },
      ],
      providers: [
        { name: "conftest" },
        { name: "conftest-container" },
        { name: "conftest-kubernetes" },
        { name: "hadolint" },
        { name: "kubernetes" },
        { name: "local-kubernetes" },
        { name: "maven-container" },
        { name: "openfaas" },
        { name: "terraform" },
      ],
    },
  })

  const providerDir = resolve(docsRoot, "providers")
  const plugins = await garden.getPlugins()
  const pluginsByName = keyBy(plugins, "name")
  const providersReadme = ["---", "order: 6", "title: Providers", "---", "", "# Providers", ""]

  for (const plugin of plugins) {
    const name = plugin.name

    // Currently nothing to document for these
    if (name === "container" || name === "exec") {
      continue
    }

    const path = resolve(providerDir, `${name}.md`)
    console.log("->", path)
    writeFileSync(path, renderProviderReference(name, plugin, pluginsByName))

    providersReadme.push(`* [${name}](./${name}.md)`)
  }
  writeFileSync(resolve(providerDir, `README.md`), providersReadme.join("\n"))

  // Render module types
  const moduleTypeDir = resolve(docsRoot, "module-types")
  const readme = ["---", "order: 7", "title: Module Types", "---", "", "# Module Types", ""]
  const moduleTypeDefinitions = await garden.getModuleTypes()

  for (const { name } of moduleTypes) {
    const path = resolve(moduleTypeDir, `${name}.md`)
    const desc = moduleTypeDefinitions[name]

    console.log("->", path)
    writeFileSync(path, renderModuleTypeReference(name, moduleTypeDefinitions))

    readme.push(`* [${desc.title || startCase(name.replace("-", " "))}](./${name}.md)`)
  }

  writeFileSync(resolve(moduleTypeDir, `README.md`), readme.join("\n"))

  // Render base config docs
  console.log("->", configPath)
  writeFileSync(configPath, renderBaseConfigReference())
}
