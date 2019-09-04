/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import { readFileSync, writeFileSync } from "fs"
import { safeDump } from "js-yaml"
import * as linewrap from "linewrap"
import { resolve } from "path"
import { get, flatten, startCase, uniq } from "lodash"
import { projectSchema } from "../config/project"
import { baseModuleSpecSchema } from "../config/module"
import handlebars = require("handlebars")
import { joiArray, joi } from "../config/common"
import { Garden } from "../garden"
import { GARDEN_SERVICE_ROOT } from "../constants"
import { indent, renderMarkdownTable } from "./util"
import { ModuleContext, ServiceRuntimeContext, TaskRuntimeContext } from "../config/config-context"
import { defaultDotIgnoreFiles } from "../util/fs"
import { providerConfigBaseSchema } from "../config/provider"
import { GardenPlugin } from "../types/plugin/plugin"
import { ModuleTypeDescription } from "../types/plugin/module/describeType"

export const TEMPLATES_DIR = resolve(GARDEN_SERVICE_ROOT, "src", "docs", "templates")
const partialTemplatePath = resolve(TEMPLATES_DIR, "config-partial.hbs")

const populateModuleSchema = (schema: Joi.ObjectSchema) => baseModuleSpecSchema
  .concat(schema)

const populateProviderSchema = (schema: Joi.ObjectSchema) => joi.object()
  .keys({
    providers: joiArray(schema),
  })

const maxWidth = 100
const moduleTypes = [
  { name: "exec" },
  { name: "container" },
  { name: "helm", pluginName: "local-kubernetes" },
  { name: "kubernetes", pluginName: "local-kubernetes" },
  { name: "maven-container" },
  { name: "openfaas", pluginName: "local-kubernetes" },
  { name: "terraform" },
]

interface RenderOpts {
  level?: number
  showRequired?: boolean
  showComment?: boolean
  showEllipsisBetweenKeys?: boolean
  useExampleForValue?: boolean
}

interface Description extends Joi.Description {
  name: string
  level: number
  parent?: NormalizedDescription
}

export interface NormalizedDescription extends Description {
  required: boolean
  defaultValue?: string
  hasChildren: boolean
  allowedValues?: string
  formattedExample?: string
  formattedName: string
  formattedType: string
}

// Maps a Joi schema description into an array of descriptions and normalizes each entry.
// Filters out internal descriptions.
export function normalizeDescriptions(joiDescription: Joi.Description): NormalizedDescription[] {
  const normalize = (
    joiDesc: Joi.Description,
    {
      level = 0,
      name,
      parent,
    }: { level?: number, name?: string, parent?: NormalizedDescription } = {},
  ): NormalizedDescription[] => {
    let description: NormalizedDescription | undefined
    let childDescriptions: NormalizedDescription[] = []

    // Skip descriptions without names since they merely point to the keys we're interested in.
    // This means that we implicitly skip the first key of the schema.
    if (name) {
      description = normalizeKeyDescription({ ...joiDesc, name, level, parent })
    }

    if (joiDesc.type === "object") {
      const children = Object.entries(joiDesc.children || {}) || []
      const nextLevel = name ? level + 1 : level
      const nextParent = name ? description : parent
      childDescriptions = flatten(children.map(([childName, childDescription]) => (
        normalize(childDescription as Description, { level: nextLevel, parent: nextParent, name: childName })
      )))
    } else if (joiDesc.type === "array") {
      // We only use the first array item
      const item = joiDesc.items[0]
      childDescriptions = item ? normalize(item, { level: level + 2, parent: description }) : []
    }

    if (!description) {
      return childDescriptions
    }
    return [description, ...childDescriptions]
  }

  return normalize(joiDescription).filter(key => !get(key, "meta[0].internal"))
}

// Normalizes the key description
function normalizeKeyDescription(description: Description): NormalizedDescription {
  const defaultValue = getDefaultValue(description)

  let allowedValues: string | undefined = undefined
  const allowOnly = get(description, "flags.allowOnly") === true
  if (allowOnly) {
    allowedValues = description.valids!.map(v => JSON.stringify(v)).join(", ")
  }

  const presenceRequired = get(description, "flags.presence") === "required"
  const required = presenceRequired || allowOnly

  let hasChildren: boolean = false
  let arrayType: string | undefined
  const { type } = description
  const formattedType = formatType(description)

  const children = type === "object" && Object.entries(description.children || {})
  const items = type === "array" && description.items

  if (children && children.length > 0) {
    hasChildren = true
  } else if (items && items.length > 0) {
    // We don't consider an array of primitives as children
    arrayType = items[0].type
    hasChildren = arrayType === "array" || arrayType === "object"
  }

  let formattedExample: string | undefined
  if (description.examples && description.examples.length) {
    const example = description.examples[0].value
    if (description.type === "object" || description.type === "array") {
      formattedExample = safeDump(example).trim()
    } else {
      formattedExample = JSON.stringify(example)
    }
  }

  const formattedName = type === "array" ? `${description.name}[]` : description.name

  return {
    ...description,
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
    return uniq(description.alternatives.map(formatType)).join(" | ")
  } else {
    return type || ""
  }
}

export function getDefaultValue(description: Joi.Description) {
  const defaultSpec = get(description, "flags.default")

  if (defaultSpec === undefined) {
    return
  } else if (defaultSpec && defaultSpec.function) {
    const value = defaultSpec.function({})
    if (!value) {
      return defaultSpec.description
    } else {
      return value
    }
  } else if (defaultSpec && defaultSpec.description) {
    return defaultSpec.description
  } else {
    return defaultSpec
  }
}

function getParentDescriptions(
  description: NormalizedDescription,
  descriptions: NormalizedDescription[] = [],
): NormalizedDescription[] {
  if (description.parent) {
    return getParentDescriptions(description.parent, [description.parent, ...descriptions])
  }
  return descriptions
}

function renderMarkdownTitle(description: NormalizedDescription, prefix = "") {
  const parentDescriptions = getParentDescriptions(description)
  const title = parentDescriptions.length > 0
    ? `${parentDescriptions.map(d => d.formattedName).join(".")}.${description.formattedName}`
    : description.name
  return prefix + title
}

function renderMarkdownLink(description: NormalizedDescription) {
  const path = renderMarkdownTitle(description).replace(/\s+/g, "-").toLowerCase()
  return `[${description.name}](#${path})`
}

function makeMarkdownDescription(description: NormalizedDescription, titlePrefix = "") {
  const { formattedType, required, allowedValues, defaultValue } = description

  const parentDescriptions = getParentDescriptions(description)
  const title = renderMarkdownTitle(description, titlePrefix)
  const breadCrumbs = parentDescriptions.length > 0
    ? parentDescriptions
      .map(renderMarkdownLink)
      .concat(description.name)
      .join(" > ")
    : null

  let formattedExample: string | undefined
  if (description.formattedExample) {
    formattedExample = renderSchemaDescriptionYaml(
      [...parentDescriptions, description],
      { showComment: false, useExampleForValue: true, showEllipsisBetweenKeys: true },
    ).replace(/\n$/, "") // strip trailing new line
  }

  const table = renderMarkdownTable({
    Type: "`" + formattedType + "`",
    Required: required ? "Yes" : "No",
    ...allowedValues ? { "Allowed Values": allowedValues } : {},
    ...defaultValue !== undefined ? { Default: "`" + JSON.stringify(defaultValue) + "`" } : {},
  })

  return {
    ...description,
    breadCrumbs,
    formattedExample,
    title,
    table,
  }
}

export function renderSchemaDescriptionYaml(
  descriptions: NormalizedDescription[],
  {
    showComment = true,
    showRequired = true,
    showEllipsisBetweenKeys = false,
    useExampleForValue = false,
  }: RenderOpts,
) {
  let prevDesc: NormalizedDescription

  const output = descriptions.map(desc => {
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
    const isFirstChild = parent && parent.name === prevDesc.name
    const isArrayItem = parent && parent.type === "array"
    const isFirstArrayItem = isArrayItem && isFirstChild
    const isPrimitive = type !== "array" && type !== "object"

    const stringifiedDefaultVal = useExampleForValue ? example : JSON.stringify(defaultValue)
    const exceptionallyTreatAsPrimitive = !hasChildren
      && (stringifiedDefaultVal === "[]" || stringifiedDefaultVal === "{}")

    // Prepend new line if applicable (easier then appending). We skip the new line if comments not shown.
    if (prevDesc && showComment) {
      // Print new line between keys unless the next key is the first child of the parent key or an array item
      if (!isFirstChild && (!isArrayItem || isFirstArrayItem)) {
        out.push("")
      }
    }

    // Print "..." between keys. Only used when rendering markdown for examples.
    if (showEllipsisBetweenKeys && parent && parent.hasChildren && !isArrayItem) {
      out.push("...")
    }

    // Render comment
    if (showComment) {
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
      showRequired && comment.push(required ? "Required." : "Optional.")
      allowedValues && comment.push(`Allowed values: ${allowedValues}`, "")

      const wrap = linewrap(width - 2, { whitespace: "line" })
      const formattedComment = wrap(comment.join("\n")).split("\n").map(line => "# " + line)
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
      value = isPrimitive || exceptionallyTreatAsPrimitive
        ? defaultValue === undefined ? "" : safeDump(defaultValue)
        : defaultValue === undefined ? "" : indent(safeDump(defaultValue).trim().split("\n"), 1)
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
      .map(line => line.trimRight())
      .join("\n")
  })

  return output.join("\n")
}

/**
 * Generates the config reference from the config-partial.hbs template.
 * The config reference contains a list of keys and their description in Markdown
 * and a YAML schema.
 */
export function renderConfigReference(configSchema: Joi.ObjectSchema, titlePrefix = "") {
  const normalizedDescriptions = normalizeDescriptions(configSchema.describe())

  const yaml = renderSchemaDescriptionYaml(normalizedDescriptions, { showComment: false })
  const keys = normalizedDescriptions.map(d => makeMarkdownDescription(d, titlePrefix))

  const template = handlebars.compile(readFileSync(partialTemplatePath).toString())
  return { markdownReference: template({ keys }), yaml }
}

/**
 * Generates a markdown reference for template string output schemas.
 */
function renderTemplateStringReference(
  { schema, prefix, placeholder, exampleName }:
    { schema: Joi.ObjectSchema, prefix: string, placeholder: string, exampleName: string },
): string {
  const normalizedDescriptions = normalizeDescriptions(schema.describe())

  const keys = normalizedDescriptions
    .map(d => makeMarkdownDescription(d))
    .map(d => {
      const title = d.title
      d.title = `\${${prefix}.${placeholder}.${title}}`
      if (d.formattedExample) {
        d.formattedExample = `my-variable: \${${prefix}.${exampleName}.${title}}`
      }
      return d
    })
    // Omit empty objects without descriptions
    .filter(d => !(d.name === "outputs" && d.hasChildren === false && !d.description))

  const template = handlebars.compile(readFileSync(partialTemplatePath).toString())
  return template({ keys })
}

/**
 * Generates the provider reference from the provider.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
function renderProviderReference(name: string, plugin: GardenPlugin) {
  const schema = populateProviderSchema(plugin.configSchema || providerConfigBaseSchema)
  const moduleOutputsSchema = plugin.outputsSchema

  const providerTemplatePath = resolve(TEMPLATES_DIR, "provider.hbs")
  const { markdownReference, yaml } = renderConfigReference(schema)

  const moduleOutputsReference = moduleOutputsSchema && renderTemplateStringReference(
    {
      schema: joi.object()
        .keys({
          outputs: moduleOutputsSchema.required(),
        }),
      prefix: "providers",
      placeholder: "<provider-name>",
      exampleName: "my-provider",
    },
  )

  const template = handlebars.compile(readFileSync(providerTemplatePath).toString())
  return template({ name, markdownReference, yaml, moduleOutputsReference })
}

/**
 * Generates the module types reference from the module-type.hbs template.
 * The reference includes the rendered output from the config-partial.hbs template.
 */
function renderModuleTypeReference(name: string, desc: ModuleTypeDescription) {
  let { schema, docs } = desc

  const moduleTemplatePath = resolve(TEMPLATES_DIR, "module-type.hbs")
  const { markdownReference, yaml } = renderConfigReference(populateModuleSchema(schema))

  const moduleOutputsReference = renderTemplateStringReference(
    {
      schema: ModuleContext.getSchema().keys({
        outputs: desc.moduleOutputsSchema!.required(),
      }),
      prefix: "modules",
      placeholder: "<module-name>",
      exampleName: "my-module",
    },
  )

  const serviceOutputsReference = renderTemplateStringReference(
    {
      schema: ServiceRuntimeContext.getSchema().keys({
        outputs: desc.serviceOutputsSchema!.required(),
      }),
      prefix: "runtime.services",
      placeholder: "<service-name>",
      exampleName: "my-service",
    },
  )

  const taskOutputsReference = renderTemplateStringReference(
    {
      schema: TaskRuntimeContext.getSchema().keys({
        outputs: desc.taskOutputsSchema!.required(),
      }),
      prefix: "runtime.tasks",
      placeholder: "<task-name>",
      exampleName: "my-tasks",
    },
  )

  const template = handlebars.compile(readFileSync(moduleTemplatePath).toString())
  return template({
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
  const { markdownReference: projectMarkdownReference, yaml: projectYaml } = renderConfigReference(projectSchema)
  const { markdownReference: moduleMarkdownReference, yaml: moduleYaml } = renderConfigReference(baseModuleSpecSchema)

  const template = handlebars.compile(readFileSync(baseTemplatePath).toString())
  return template({ projectMarkdownReference, projectYaml, moduleMarkdownReference, moduleYaml })
}

export async function writeConfigReferenceDocs(docsRoot: string) {
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
        { name: "local-kubernetes" },
        { name: "kubernetes" },
        { name: "local-openfaas" },
        { name: "maven-container" },
        { name: "openfaas" },
        { name: "terraform" },
      ],
    },
  })

  const providerDir = resolve(referenceDir, "providers")
  for (const [name, plugin] of Object.entries(await garden.getPlugins())) {
    // Currently nothing to document for these
    if (name === "container" || name === "exec") {
      continue
    }

    const path = resolve(providerDir, `${name}.md`)
    console.log("->", path)
    writeFileSync(path, renderProviderReference(name, plugin))
  }

  // Render module type docs
  const moduleTypeDir = resolve(referenceDir, "module-types")
  const readme = ["# Module Types", ""]
  for (const { name } of moduleTypes) {
    const path = resolve(moduleTypeDir, `${name}.md`)
    const actions = await garden.getActionHelper()
    const desc = await actions.describeType(name)

    console.log("->", path)
    writeFileSync(path, renderModuleTypeReference(name, desc))

    readme.push(`* [${desc.title || startCase(name.replace("-", " "))}](./${name}.md)`)
  }

  writeFileSync(resolve(moduleTypeDir, `README.md`), readme.join("\n"))

  // Render base config docs
  console.log("->", configPath)
  writeFileSync(configPath, renderBaseConfigReference())
}
