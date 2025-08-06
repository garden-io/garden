/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import truncate from "lodash-es/truncate.js"
import type { ConfigSource } from "../config/validation.js"
import { addYamlContext } from "../config/validation.js"
import type { GardenErrorParams } from "../exceptions.js"
import { GardenError } from "../exceptions.js"
import { styles } from "../logger/styles.js"
import type { Location } from "./ast.js"
import type { ContextResolveOutputNotFound } from "../config/template-contexts/base.js"

export class TemplateError extends GardenError {
  type = "template"

  constructor(params: GardenErrorParams & { source: ConfigSource }) {
    const enriched = addYamlContext({ source: params.source, message: params.message })

    super({ ...params, message: enriched })
  }
}

export function truncateRawTemplateString(rawTemplateString: string) {
  return truncate(rawTemplateString, { length: 200 }).replace(/\n/g, "\\n")
}

export class TemplateStringError extends GardenError {
  type = "template-string"

  loc: Location
  yamlSource: ConfigSource
  originalMessage: string
  lookupResult?: ContextResolveOutputNotFound

  causedByCircularReferenceError: boolean

  constructor(
    params: GardenErrorParams & { loc: Location; yamlSource: ConfigSource; causedByCircularReferenceError?: boolean }
  ) {
    // TODO: Use Location information from parser to point to the specific part
    let enriched = addYamlContext({ source: params.yamlSource, message: params.message })

    // This means that no yaml context has been added,
    // so we compose a simpler context manually.
    if (enriched === params.message) {
      const { path } = params.yamlSource

      const pathDescription = path.length > 0 ? ` at path ${styles.accent(path.join("."))}` : ""
      const prefix = `Invalid template string (${styles.accent(
        truncateRawTemplateString(params.loc.source.rawTemplateString)
      )})${pathDescription}: `
      enriched = params.message.startsWith(prefix) ? params.message : prefix + params.message
    }

    super({ ...params, message: enriched })
    this.loc = params.loc
    this.yamlSource = params.yamlSource
    this.originalMessage = params.message
    this.causedByCircularReferenceError = params.causedByCircularReferenceError || false
  }
}
