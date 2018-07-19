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
import {
  get,
  padEnd,
} from "lodash"
import { containerModuleSpecSchema } from "../plugins/container"
import { genericModuleSpecSchema } from "../plugins/generic"
import { configSchema } from "../types/config"
import { baseModuleSpecSchema } from "../types/module"

const maxWidth = 100
const builtInModuleTypes = [
  { name: "generic", schema: genericModuleSpecSchema },
  { name: "container", schema: containerModuleSpecSchema },
]

function renderCommentDescription(description: Joi.Description, width: number) {
  const output: string[] = []

  if (description.description) {
    output.push(description.description, "")
  }

  const presenceRequired = get(description, "flags.presence") === "required"
  const allowOnly = get(description, "flags.allowOnly") === true

  if (description.examples && description.examples.length) {
    const example = description.examples[0]

    if (description.type === "object" || description.type === "array") {
      output.push("Example:", ...indent(safeDump(example).trim().split("\n"), 1), "")
    } else {
      output.push("Example: " + JSON.stringify(example), "")
    }
  }

  if (presenceRequired || allowOnly) {
    output.push("Required.")
  } else if (output.length) {
    output.push("Optional.")
  }

  if (allowOnly) {
    output.push("Allowed values: " + description.valids!.map(v => JSON.stringify(v)).join(", "))
  }

  if (output.length === 0) {
    return output
  }

  const wrap = linewrap(width - 2, { whitespace: "line" })
  return wrap(output.join("\n")).split("\n").map(line => "# " + line)
}

function getDefaultValue(description: Joi.Description) {
  const defaultSpec = get(description, "flags.default")

  if (defaultSpec === undefined) {
    return
  } else if (defaultSpec && defaultSpec.function) {
    return defaultSpec.function()
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

function renderDescription(description: Joi.Description, level = 0) {
  const indentSpaces = level * 2
  const descriptionWidth = maxWidth - indentSpaces - 2

  const output: string[] = []

  switch (description.type) {
    case "object":
      const children = Object.entries(description.children || {})

      if (!children.length) {
        const defaultValue = getDefaultValue(description)
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
          ...renderCommentDescription(keyDescription, descriptionWidth),
          `${key}: ${renderDescription(keyDescription, level + 1)}`,
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
        ...renderCommentDescription(itemDescription, descriptionWidth),
        "- " + renderDescription(itemDescription, level + 1).trim(),
        "",
      )

      break

    default:
      output.push(getDefaultValue(description))
  }

  // we don't indent the first line
  return indentFromSecondLine(output, level).join("\n")
}

export function generateConfigReferenceDocs(docsRoot: string) {
  const referenceDir = resolve(docsRoot, "reference")
  const outputPath = resolve(referenceDir, "config.md")

  const yaml = renderDescription(configSchema.describe())
  const moduleTypes = builtInModuleTypes.map(({ name, schema }) => {
    schema = Joi.object().keys({
      module: baseModuleSpecSchema.concat(schema),
    })
    return {
      name,
      yaml: renderDescription(schema.describe()),
    }
  })

  const templatePath = resolve(__dirname, "templates", "config.hbs")
  const template = handlebars.compile(readFileSync(templatePath).toString())
  const markdown = template({ yaml, moduleTypes })

  writeFileSync(outputPath, markdown)
}
