/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import { readFileSync } from "fs"
import linewrap from "linewrap"
import handlebars from "handlebars"
import { resolve } from "path"
import { projectSchema } from "../config/project.js"
import { get, isFunction, isString } from "lodash-es"
import type { JoiDescription } from "../config/common.js"
import { STATIC_DIR } from "../constants.js"
import type { BaseKeyDescription, NormalizeOptions } from "./common.js"
import { indent, renderMarkdownTable, convertMarkdownLinks, flattenSchema, isArrayType } from "./common.js"
import { JoiKeyDescription } from "./joi-schema.js"
import { safeDumpYaml } from "../util/serialization.js"
import stripAnsi from "strip-ansi"

export const TEMPLATES_DIR = resolve(STATIC_DIR, "docs", "templates")
const partialTemplatePath = resolve(TEMPLATES_DIR, "config-partial.hbs")

const maxWidth = 120

/**
 * Removes line starting with: # ```
 */
export function sanitizeYamlStringForGitBook(yamlStr: string) {
  return yamlStr.replace(/.*# \`\`\`.*$\n/gm, "")
}

function getParentDescriptions(
  schemaDescription: BaseKeyDescription,
  schemaDescriptions: BaseKeyDescription[] = []
): BaseKeyDescription[] {
  if (schemaDescription.parent) {
    return getParentDescriptions(schemaDescription.parent, [schemaDescription.parent, ...schemaDescriptions])
  }
  return schemaDescriptions
}

export function renderMarkdownLink(description: BaseKeyDescription) {
  const path = description
    .fullKey()
    .replace(/\s+/g, "-") // Replace " " with "-""
    .replace(/[\.\[\]\<\>]/g, "") // Replace ".", "[]" and "<>" with ""
    .toLowerCase()
  return `[${description.name}](#${path})`
}

function makeMarkdownDescription(description: BaseKeyDescription, { showRequiredColumn = true } = {}) {
  const { required } = description

  const parentDescriptions = getParentDescriptions(description)
  const breadCrumbs =
    parentDescriptions.length > 0
      ? parentDescriptions.map(renderMarkdownLink).concat(description.name!).join(" > ")
      : null

  let formattedExample: string | undefined
  if (description.formatExample()) {
    formattedExample = renderSchemaDescriptionYaml([...parentDescriptions, description], {
      renderFullDescription: false,
      renderValue: "example",
      renderEllipsisBetweenKeys: true,
    }).replace(/\n$/, "") // strip trailing new line
  }

  const defaultValue = description.getDefaultValue()
  const allowedValues = description.formatAllowedValues()

  const tableData: any = {
    Type: "`" + description.formatType() + "`",
    ...(allowedValues ? { "Allowed Values": allowedValues } : {}),
    ...(defaultValue !== undefined ? { Default: `\`${description.formatDefaultValue()}\`` } : {}),
  }

  if (showRequiredColumn) {
    tableData.Required = required ? "Yes" : "No"
  }

  const table = renderMarkdownTable(tableData)

  let deprecatedDescription: string | handlebars.SafeString = "This field will be removed in a future release."

  if (description.deprecated && isString(description.deprecationMessage)) {
    // we use SafeString so backticks are preserved in the final doc
    deprecatedDescription = new handlebars.SafeString(stripAnsi(description.deprecationMessage))
  }

  return {
    ...description,
    breadCrumbs,
    experimentalFeature: description.experimental,
    deprecated: !!description.deprecated,
    deprecatedDescription,
    formattedExample,
    title: description.fullKey(),
    table,
  }
}

interface RenderYamlOpts {
  // Comment out or remove any keys that don't have a value set in `values`
  onEmptyValue?: "comment out" | "remove" | "keep"
  // Convert markdown links encountered in descriptions to just normal links
  filterMarkdown?: boolean
  level?: number
  // Values to pre-populate keys with
  presetValues?: { [key: string]: any }
  renderRequired?: boolean
  renderBasicDescription?: boolean
  renderFullDescription?: boolean
  renderEllipsisBetweenKeys?: boolean
  renderValue?: "none" | "default" | "example" | "preferDefault" | "preferExample"
}

const normalizeTemplateStrings = (s: string | undefined) => (!!s ? s.replace(/\\\$\{/g, "${") : undefined)

export function renderSchemaDescriptionYaml(
  schemaDescriptions: BaseKeyDescription[],
  {
    onEmptyValue = "keep",
    filterMarkdown = false,
    presetValues = {},
    renderBasicDescription = false,
    renderFullDescription = true,
    renderRequired = true,
    renderEllipsisBetweenKeys = false,
    renderValue = "default",
  }: RenderYamlOpts
) {
  let prevDesc: BaseKeyDescription

  // This is a little hacky, but works for our purposes
  const getPresetValue = (desc: BaseKeyDescription) => get(presetValues, desc.fullKey().replace(/\[\]/g, "[0]"))

  const output = schemaDescriptions.map((desc) => {
    const { required, name, level, type, parent } = desc
    let { description } = desc
    const indentSpaces = level * 2
    const width = maxWidth - indentSpaces - 2
    const comment: string[] = []
    const out: string[] = []
    const isFirstChild = parent && parent === prevDesc
    const isArrayItem = parent && isArrayType(parent.type)
    const isFirstArrayItem = isArrayItem && isFirstChild
    const isPrimitive = !isArrayType(type) && type !== "object"

    const presetValue = getPresetValue(desc)

    let value: string | string[] | undefined
    let usingExampleForValue = false
    const defaultValue = desc.getDefaultValue()
    const renderedDefault = isFunction(defaultValue) ? defaultValue() : defaultValue

    const example = desc.formatExample()

    if (presetValue) {
      // Prefer preset value if given
      value = presetValue
    } else if (renderValue === "none") {
      value = undefined
    } else if (renderValue === "default") {
      value = renderedDefault
    } else if (renderValue === "example") {
      usingExampleForValue = true
      value = example || ""
    } else if (renderValue === "preferDefault") {
      if (defaultValue) {
        value = renderedDefault
      } else if (example) {
        usingExampleForValue = true
        value = example
      }
    } else if (renderValue === "preferExample") {
      if (example) {
        usingExampleForValue = true
        value = example
      } else if (defaultValue) {
        value = renderedDefault
      }
    }

    // Prepend new line if applicable (easier then appending). We skip the new line if comments not shown.
    if (prevDesc && (renderBasicDescription || renderFullDescription)) {
      // Print new line between keys unless the next key is the first child of the parent key
      if (!isFirstChild && !isFirstArrayItem) {
        out.push("")
      }
    }

    // Print "..." between keys. Only used when rendering markdown for examples.
    if (renderEllipsisBetweenKeys && parent && parent.hasChildren() && !isArrayItem) {
      out.push("...")
    }

    if (description && filterMarkdown) {
      // Parse and extract links from the markdown
      description = convertMarkdownLinks(description)
    }

    // Only print the description
    if (renderBasicDescription) {
      description && comment.push(description)
      // Print the description, type, examples, etc
    } else if (renderFullDescription) {
      description && comment.push(description, "")
      comment.push(`Type: ${desc.formatType()}`, "")
      if (example && !usingExampleForValue) {
        if (isPrimitive) {
          // Render example inline
          comment.push(`Example: ${example}`, "")
        } else {
          // Render example in a separate line
          comment.push("Example:", ...indent(example.split("\n"), 1), "")
        }
      }
      renderRequired && comment.push(required ? "Required." : "Optional.")

      const allowedValues = desc.formatAllowedValues()
      allowedValues && comment.push(`Allowed values: ${allowedValues}`, "")
    }

    if (comment.length > 0) {
      const prefix = "# "
      const wrap = linewrap(width - prefix.length, { whitespace: "line" })
      const formattedComment = wrap(comment.join("\n"))
        .split("\n")
        .map((line: string) => prefix + line)
      out.push(...formattedComment)
    }

    // Render key name and value
    const children = desc.getChildren()

    const formattedName = name
    const stringifiedValue = JSON.stringify(value)
    const exceptionallyTreatAsPrimitive =
      (!children.length || children[0].type !== "object") && (stringifiedValue === "[]" || stringifiedValue === "{}")

    let formattedValue: string | string[]

    if (example && usingExampleForValue) {
      const levels = desc.type === "object" ? 2 : 1
      formattedValue = isPrimitive || exceptionallyTreatAsPrimitive ? example : indent(example.split("\n"), levels)
    } else {
      // Non-primitive values get rendered in the line below, indented by one
      if (value === undefined) {
        formattedValue = ""
      } else if (isPrimitive || exceptionallyTreatAsPrimitive) {
        formattedValue = safeDumpYaml(value)
      } else {
        formattedValue = indent(safeDumpYaml(value).trim().split("\n"), 1)
      }
    }

    let keyAndValue: string[] = []

    if (isPrimitive || exceptionallyTreatAsPrimitive) {
      // For primitives we render the value or example inline
      keyAndValue.push(`${formattedName}: ${formattedValue}`)
    } else if (!children.length || (example && usingExampleForValue)) {
      // For arrays or objects without children, or non-primitive examples, we render the value in the line below
      keyAndValue.push(`${formattedName}:`, ...formattedValue)
    } else {
      // For arrays or objects with children we only print the key, the value is the next key in the descriptions array.
      keyAndValue.push(`${formattedName}:`)
    }

    if (onEmptyValue === "comment out" && !presetValue) {
      if (renderBasicDescription || renderFullDescription) {
        out.push("#")
      }
      keyAndValue = keyAndValue.map((line) => "# " + line)
    }

    if (onEmptyValue === "remove" && !presetValue) {
      return
    }

    out.push(...keyAndValue)

    prevDesc = desc

    let indented: string[]

    if (isFirstArrayItem) {
      // Add "- " prefix for the first array item
      let prefix = "- "

      // Comment out the prefix if everything in the array will be commented out. Otherwise the output file
      // will include unwanted null values.
      if (onEmptyValue === "comment out" && parent && !getPresetValue(parent)) {
        prefix = "#-"
      }

      indented = indent([prefix + out[0], ...indent(out.slice(1), 1)], level - 1).map((line) => line.trimRight())
    } else {
      indented = indent(out, level).map((line) => line.trimRight())
    }

    return indented.join("\n")
  })

  const schemaDescriptionYaml = output.filter((l) => l !== undefined).join("\n")

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

interface RenderConfigOpts {
  titlePrefix?: string
  normalizeOpts?: NormalizeOptions
  yamlOpts?: RenderYamlOpts
}

/**
 * Generates the config reference from the config-partial.hbs template.
 * The config reference contains a list of keys and their description in Markdown
 * and a YAML schema.
 */
export function renderConfigReference(
  configSchema: Joi.ObjectSchema,
  { normalizeOpts = {}, yamlOpts = {} }: RenderConfigOpts = {}
) {
  const joiDescription = configSchema.describe() as JoiDescription
  const desc = new JoiKeyDescription({
    joiDescription,
    name: undefined,
    level: 0,
  })

  const normalizedDescriptions = flattenSchema(desc, normalizeOpts)
  normalizedDescriptions.forEach((d) => (d.description = normalizeTemplateStrings(d.description)))

  const yaml = renderSchemaDescriptionYaml(normalizedDescriptions, { renderBasicDescription: true, ...yamlOpts })
  const keys = normalizedDescriptions.map((d) => makeMarkdownDescription(d))

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
  const joiDescription = schema.describe() as JoiDescription
  const desc = new JoiKeyDescription({
    joiDescription,
    name: undefined,
    level: 0,
  })

  const normalizedSchemaDescriptions = flattenSchema(desc, {
    renderPatternKeys: true,
  })

  const keys = normalizedSchemaDescriptions
    .map((d) => makeMarkdownDescription(d, { showRequiredColumn: false }))
    // Omit objects without descriptions
    .filter((d) => !(d.type === "object" && !d.description))
    .map((d) => {
      const orgTitle = d.title

      if (placeholder) {
        d.title = `${placeholder}.${d.title}`
      }
      if (prefix) {
        d.title = `${prefix}.${d.title}`
      }

      if (d.type === "object" || d.type === "customObject") {
        d.title += ".*"
        d.formattedExample = ""
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

export function renderProjectConfigReference(opts: RenderConfigOpts = {}) {
  return renderConfigReference(projectSchema(), opts)
}
