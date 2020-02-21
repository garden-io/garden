/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { padEnd, max } from "lodash"
import { DOCS_BASE_URL } from "../constants"

export interface NormalizedSchemaDescription {
  type: string
  name: string
  allowedValuesOnly: boolean
  allowedValues?: string
  defaultValue?: string
  deprecated: boolean
  description?: string
  experimental: boolean
  formattedExample?: string
  formattedName: string
  formattedType: string
  fullKey: string
  hasChildren: boolean
  internal: boolean
  level: number
  parent?: NormalizedSchemaDescription
  required: boolean
}

export interface NormalizeOptions {
  level?: number
  name?: string
  parent?: NormalizedSchemaDescription
  renderPatternKeys?: boolean
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
