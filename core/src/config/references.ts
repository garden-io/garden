/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import isString from "lodash-es/isString.js"
import {
  defaultVisitorOpts,
  getContextLookupReferences,
  isUnresolvableValue,
  visitAll,
  type ContextLookupReferenceFinding,
  type UnresolvableValue,
} from "../template/analysis.js"
import { TemplateError } from "../template/errors.js"
import type { ActionReference } from "./common.js"
import type { ConfigContext, ContextKeySegment } from "./template-contexts/base.js"
import type { ActionConfig, ActionKind } from "../actions/types.js"
import { actionKindsLower } from "../actions/types.js"
import { titleize } from "../util/string.js"
import type { ObjectWithName } from "../util/util.js"
import type { ModuleConfig } from "./module.js"
import type { ModuleConfigContext } from "./template-contexts/module.js"

interface ActionTemplateReference extends ActionReference {
  keyPath: (ContextKeySegment | UnresolvableValue)[]
}

export function extractActionReference(finding: ContextLookupReferenceFinding): ActionTemplateReference {
  const kind = finding.keyPath[1]
  if (!kind) {
    throw new TemplateError({
      message: `Found invalid action reference (missing kind).`,
      source: finding.yamlSource,
    })
  }

  if (isUnresolvableValue(kind)) {
    const err = kind.getError()
    throw new TemplateError({
      message: `Found invalid action reference: ${err.message}`,
      source: finding.yamlSource,
    })
  }

  if (!isString(kind)) {
    throw new TemplateError({
      message: `Found invalid action reference (kind is not a string).`,
      source: finding.yamlSource,
    })
  }

  if (!actionKindsLower.includes(kind)) {
    throw new TemplateError({
      message: `Found invalid action reference (invalid kind '${kind}')`,
      source: finding.yamlSource,
    })
  }

  const name = finding.keyPath[2]
  if (!name) {
    throw new TemplateError({
      message: "Found invalid action reference (missing name)",
      source: finding.yamlSource,
    })
  }

  if (isUnresolvableValue(name)) {
    const err = name.getError()
    throw new TemplateError({
      message: `Found invalid action reference: ${err.message}`,
      source: finding.yamlSource,
    })
  }

  if (!isString(name)) {
    throw new TemplateError({
      message: "Found invalid action reference (name is not a string)",
      source: finding.yamlSource,
    })
  }

  return {
    kind: <ActionKind>titleize(kind),
    name,
    keyPath: finding.keyPath.slice(3),
  }
}

export function extractRuntimeReference(finding: ContextLookupReferenceFinding): ActionTemplateReference {
  const runtimeKind = finding.keyPath[1]
  if (!runtimeKind) {
    throw new TemplateError({
      message: "Found invalid runtime reference (missing kind)",
      source: finding.yamlSource,
    })
  }

  if (isUnresolvableValue(runtimeKind)) {
    const err = runtimeKind.getError()
    throw new TemplateError({
      message: `Found invalid runtime reference: ${err.message}`,
      source: finding.yamlSource,
    })
  }

  if (!isString(runtimeKind)) {
    throw new TemplateError({
      message: "Found invalid runtime reference (kind is not a string)",
      source: finding.yamlSource,
    })
  }

  let kind: ActionKind
  if (runtimeKind === "services") {
    kind = "Deploy"
  } else if (runtimeKind === "tasks") {
    kind = "Run"
  } else {
    throw new TemplateError({
      message: `Found invalid runtime reference (invalid kind '${runtimeKind}')`,
      source: finding.yamlSource,
    })
  }

  const name = finding.keyPath[2]

  if (!name) {
    throw new TemplateError({
      message: `Found invalid runtime reference (missing name)`,
      source: finding.yamlSource,
    })
  }

  if (isUnresolvableValue(name)) {
    const err = name.getError()
    throw new TemplateError({
      message: `Found invalid action reference: ${err.message}`,
      source: finding.yamlSource,
    })
  }

  if (!isString(name)) {
    throw new TemplateError({
      message: "Found invalid runtime reference (name is not a string)",
      source: finding.yamlSource,
    })
  }

  return {
    kind,
    name,
    keyPath: finding.keyPath.slice(3),
  }
}

/**
 * Collects every reference to another action in the given config object, including translated runtime.* references.
 * An error is thrown if a reference is not resolvable, i.e. if a nested template is used as a reference.
 */
export function* getActionTemplateReferences(
  config: ActionConfig,
  context: ConfigContext
): Generator<ActionTemplateReference, void, undefined> {
  const generator = getContextLookupReferences(
    visitAll({
      value: config as ObjectWithName,
      opts: defaultVisitorOpts,
    }),
    context,
    {}
  )

  for (const finding of generator) {
    const refType = finding.keyPath[0]
    // ${action.*}
    if (refType === "actions") {
      yield extractActionReference(finding)
    }
    // ${runtime.*}
    if (refType === "runtime") {
      yield extractRuntimeReference(finding)
    }
  }
}

export function getModuleTemplateReferences(config: ModuleConfig, context: ModuleConfigContext) {
  const moduleNames: string[] = []
  const generator = getContextLookupReferences(
    visitAll({
      value: config as ObjectWithName,
      opts: defaultVisitorOpts,
    }),
    context,
    {}
  )

  for (const finding of generator) {
    const keyPath = finding.keyPath
    if (keyPath[0] !== "modules") {
      continue
    }

    const moduleName = keyPath[1]
    if (isUnresolvableValue(moduleName)) {
      const err = moduleName.getError()
      throw new TemplateError({
        message: `Found invalid module reference: ${err.message}`,
        source: finding.yamlSource,
      })
    }

    if (config.name === moduleName) {
      continue
    }

    moduleNames.push(moduleName.toString())
  }

  return moduleNames
}
