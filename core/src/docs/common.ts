/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { padEnd, max } from "lodash"
import { DOCS_BASE_URL } from "../constants"
import { getPackageVersion } from "../util/util"

export abstract class BaseKeyDescription<T = any> {
  type: string
  allowedValuesOnly: boolean
  deprecated: boolean
  description?: string
  experimental: boolean
  internal: boolean
  required: boolean
  example?: T

  constructor(public name: string | undefined, public level: number, public parent?: BaseKeyDescription) {
    this.name = name
    this.level = level
    this.parent = parent
  }

  abstract getChildren(renderPatternKeys?: boolean): BaseKeyDescription[]
  abstract getDefaultValue(): T | undefined
  abstract formatExample(): string | undefined
  abstract formatAllowedValues(): string | undefined

  formatName() {
    return this.name
  }

  formatType() {
    return this.type
  }

  hasChildren(renderPatternKeys = false) {
    return this.getChildren(renderPatternKeys).length > 0
  }

  fullKey() {
    const formattedName = this.formatName()
    const parentKey = this.parent?.fullKey()

    if (parentKey && formattedName) {
      return `${parentKey}.${this.formatName()}`
    } else {
      return parentKey || formattedName || ""
    }
  }
}

export interface NormalizeOptions {
  renderPatternKeys?: boolean
}

// Maps a schema description into an array of descriptions and normalizes each entry.
// Filters out internal descriptions.
export function flattenSchema(
  schemaDescription: BaseKeyDescription,
  opts: NormalizeOptions = {}
): BaseKeyDescription[] {
  const { renderPatternKeys = false } = opts

  const childDescriptions = schemaDescription.getChildren(renderPatternKeys).flatMap((c) => flattenSchema(c, opts))

  const items = schemaDescription.name ? [schemaDescription, ...childDescriptions] : childDescriptions
  return items.filter((key) => !key.internal)
}

export function indent(lines: string[], level: number) {
  const prefix = padEnd("", level * 2, " ")
  return lines.map((line) => prefix + line)
}

export function renderMarkdownTable(data: { [heading: string]: string }) {
  const lengths = Object.entries(data).map(([k, v]) => max([k.length, v.length]))
  const paddedKeys = Object.keys(data).map((k, i) => padEnd(k, lengths[i], " "))
  const paddedValues = Object.values(data).map((v, i) => padEnd(v, lengths[i], " "))

  const head = "| " + paddedKeys.join(" | ") + " |"
  const divider = "| " + paddedKeys.map((k) => padEnd("", k.length, "-")).join(" | ") + " |"
  const values = "| " + paddedValues.join(" | ") + " |"

  return [head, divider, values].join("\n")
}

/**
 * Converts all markdown-formatted links in the given text to just normal links in parentheses after the link text.
 */
export function convertMarkdownLinks(text: string) {
  return text.replace(/\[([\w\s]+)\]\((.*)\)/g, "$1 ($2)")
}

export function getModuleTypeUrl(type?: string) {
  const base = DOCS_BASE_URL + "/reference/module-types"
  return type ? base + "/" + type : base
}

export function getProviderUrl(type?: string) {
  const base = DOCS_BASE_URL + "/reference/providers"
  return type ? base + "/" + type : base
}

/**
 * Returns a versioned link to the source code on GitHub using the path provided.
 */
export function getGitHubUrl(path: string) {
  const version = getPackageVersion()
  if (path.startsWith("/")) {
    path = path.substring(1)
  }
  return `https://github.com/garden-io/garden/tree/${version}/${path}`
}

/**
 * Renders the given template key as a literal, suitable for rendering in documentation strings.
 */
export function templateStringLiteral(key: string) {
  return "`${" + key + "}`"
}

export function isArrayType(type: string) {
  return type === "array" || type === "sparseArray"
}
