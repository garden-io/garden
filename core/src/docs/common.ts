/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { padEnd, max } from "lodash-es"
import { DOCS_BASE_URL } from "../constants.js"
import { getPackageVersion } from "../util/util.js"
import { styles } from "../logger/styles.js"

export abstract class BaseKeyDescription<T = any> {
  abstract type: string
  abstract internal: boolean
  abstract description?: string
  abstract example?: T
  abstract deprecated: boolean
  abstract deprecationMessage: string | undefined
  abstract experimental: boolean
  abstract required: boolean

  protected constructor(
    public name: string | undefined,
    public level: number,
    public parent?: BaseKeyDescription
  ) {
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

  formatDefaultValue() {
    return JSON.stringify(this.getDefaultValue())
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

// Override this externally to change the behaviour of makeDocsLink
export const makeDocsLinkOpts = {
  GARDEN_RELATIVE_DOCS_PATH: "",
}

/**
 *
 * @param docsPathInput path to the file as from the /docs directory
 * @param fragment URI fragment
 * @returns a functioning url
 *
 * @example makeDocsLink("k8s-plugins/actions/deploy/container", "#secrets")
 */
export function makeDocsLinkPlain(docsPathInput: string | TemplateStringsArray, fragment = ""): string {
  const docsPath: string = Array.isArray(docsPathInput) ? docsPathInput[0] : docsPathInput

  // If this is set it means we're rendering the reference docs
  // so we return a relative link
  if (makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH) {
    return `${makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH}${docsPath}.md${fragment}`
  }

  return `${DOCS_BASE_URL}/${docsPath}${fragment}`
}

export function makeDocsLinkStyled(docsPathInput: string | TemplateStringsArray, fragment = ""): string {
  return styles.link(makeDocsLinkPlain(docsPathInput, fragment))
}
