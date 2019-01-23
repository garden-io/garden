/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  readFileSync,
  writeFileSync,
} from "fs"
import * as handlebars from "handlebars"
import { safeDump } from "js-yaml"
import * as linewrap from "linewrap"
import * as Joi from "joi"
import { resolve } from "path"
import { get, padEnd } from "lodash"
import { containerModuleSpecSchema } from "../plugins/container/config"
import { execModuleSpecSchema } from "../plugins/exec"
import { configSchema } from "../config/base"
import { baseModuleSpecSchema } from "../config/module"
import { helmModuleSpecSchema } from "../plugins/kubernetes/helm/config"

const maxWidth = 100
const builtInModuleTypes = [
  { name: "exec", schema: execModuleSpecSchema },
  { name: "container", schema: containerModuleSpecSchema },
  { name: "helm", schema: helmModuleSpecSchema },
]

interface RenderOpts {
  level?: number
  required?: boolean
}

function renderCommentDescription(description: Joi.Description, width: number, { required }: RenderOpts) {
  const output: string[] = []
  const meta: string[] = []

  if (description.description) {
    output.push(description.description)
  }

  if (description.examples && description.examples.length) {
    const example = description.examples[0].value

    if (description.type === "object" || description.type === "array") {
      meta.push("Example:", ...indent(safeDump(example).trim().split("\n"), 1), "")
    } else {
      meta.push("Example: " + JSON.stringify(example), "")
    }
  }

  const allowOnly = get(description, "flags.allowOnly") === true

  if (required) {
    const presenceRequired = get(description, "flags.presence") === "required"

    if (presenceRequired || allowOnly) {
      meta.push("Required.")
    } else if (output.length) {
      meta.push("Optional.")
    }
  }

  if (allowOnly) {
    meta.push("Allowed values: " + description.valids!.map(v => JSON.stringify(v)).join(", "))
  }

  if (meta.length > 0) {
    output.push("", ...meta)
  }

  if (output.length === 0) {
    return output
  }

  const wrap = linewrap(width - 2, { whitespace: "line" })
  return wrap(output.join("\n")).split("\n").map(line => "# " + line)
}

export function getDefaultValue(description: Joi.Description) {
  const defaultSpec = get(description, "flags.default")

  if (defaultSpec === undefined) {
    return
  } else if (defaultSpec && defaultSpec.function) {
    const value = defaultSpec.function({})
    if (value === undefined) {
      return defaultSpec.description
    } else {
      return value
    }
  } else {
    return defaultSpec
  }
}

function indent(lines: string[], level: number) {
  const prefix = padEnd("", level * 2, " ")
  return lines.map(line => prefix + line)
}

function indentFromSecondLine(lines: string[], level: number) {
  return [...lines.slice(0, 1), ...indent(lines.slice(1), level)]
}

export function renderSchemaDescription(description: Joi.Description, opts: RenderOpts) {
  const { level = 0 } = opts
  const indentSpaces = level * 2
  const descriptionWidth = maxWidth - indentSpaces - 2

  const output: string[] = []
  const defaultValue = getDefaultValue(description)

  switch (description.type) {
    case "object":
      const children = Object.entries(description.children || {})

      if (!children.length) {
        if (defaultValue) {
          output.push("", ...safeDump(defaultValue).trim().split("\n"))
        } else {
          output.push("{}")
        }
        break
      }

      output.push("")

      for (const [key, keyDescription] of children) {
        if (get(keyDescription, "meta[0].internal")) {
          continue
        }

        output.push(
          ...renderCommentDescription(keyDescription, descriptionWidth, opts),
          `${key}: ${renderSchemaDescription(keyDescription, { ...opts, level: level + 1 })}`,
          "",
        )
      }

      output.pop()

      break

    case "array":
      if (!description.items.length) {
        output.push("[]")
      }

      const itemDescription = description.items[0]

      output.push(
        "",
        ...renderCommentDescription(itemDescription, descriptionWidth, opts),
        "- " + renderSchemaDescription(itemDescription, { ...opts, level: level + 1 }).trim(),
        "",
      )

      break

    default:
      output.push(defaultValue === undefined ? "" : defaultValue + "")
  }

  // we don't indent the first line
  return indentFromSecondLine(output, level)
    .map(line => line.trimRight())
    .join("\n")
}

export function generateConfigReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "config.md")

  const yaml = renderSchemaDescription(configSchema.describe(), { required: true })
  const moduleTypes = builtInModuleTypes.map(({ name, schema }) => {
    schema = Joi.object().keys({
      module: baseModuleSpecSchema.concat(schema),
    })
    return {
      name,
      yaml: renderSchemaDescription(schema.describe(), { required: true }),
    }
  })

  const templatePath = resolve(__dirname, "templates", "config.hbs")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ yaml, moduleTypes })

  writeFileSync(outputPath, markdown)
}
