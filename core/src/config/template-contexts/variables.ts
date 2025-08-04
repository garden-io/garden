/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import type { Garden } from "../../garden.js"
import { describeConfig } from "../../vcs/vcs.js"
import type { ModuleConfig } from "../module.js"
import type { ConfigContext, ContextWithSchema } from "./base.js"
import { GenericContext, LayeredContext } from "./base.js"
import { deepEvaluate } from "../../template/evaluate.js"
import type { ModuleConfigContext } from "./module.js"
import { ConfigurationError } from "../../exceptions.js"
import { getEffectiveConfigFileLocation, loadVarfile } from "../base.js"
import { capture } from "../../template/capture.js"
import { UnresolvedTemplateValue, type ParsedTemplate } from "../../template/types.js"
import type { EnvironmentConfig } from "../project.js"
import { defaultEnvVarfilePath, defaultProjectVarfilePath, type ProjectConfig } from "../project.js"
import type { EnvironmentConfigContext, ProjectConfigContext } from "./project.js"
import { isPlainObject, set as setKeyPathNested } from "lodash-es"
import type { ActionConfig } from "../../actions/types.js"
import { isUnresolved } from "../../template/templated-strings.js"
import type { Varfile } from "../common.js"
import type { ActionConfigContext } from "./actions.js"
import { ActionSpecContext } from "./actions.js"
import type { CustomCommandContext } from "./custom-command.js"
import type { CommandResource } from "../command.js"
import type { GroupConfig } from "../group.js"
import { parseTemplateCollection } from "../../template/templated-collections.js"

export class VariablesContext extends LayeredContext {
  /**
   * The constructor is private, use the static factory methods (below) instead.
   */
  private constructor(
    description: string,
    {
      context,
      variablePrecedence,
      variableOverrides,
      isFinalContext = true,
    }: {
      context: EnvironmentConfigContext | ProjectConfigContext | CustomCommandContext
      variablePrecedence: (ParsedTemplate | undefined | null)[]
      variableOverrides: DeepPrimitiveMap
      /**
       * @see ContextResolveOpts.isFinalContext
       */
      isFinalContext?: boolean
    }
  ) {
    const layers: ConfigContext[] = []

    let parent: ConfigContext | undefined

    if ("variables" in context) {
      // populate variables from root context
      layers.push(context.variables)

      // ensures that higher-precedence variables can refer to root vars
      parent = makeVariableRootContext(`root variable context in ${description}`, context.variables)
    }

    const scopesOrderedByPrecedence = variablePrecedence.filter((tpl) => !isEmpty(tpl)).entries()

    for (const [i, currentScope] of scopesOrderedByPrecedence) {
      // add general context, to resolve inputs, action references, etc
      const neededContext = new LayeredContext(`context for scope ${i} in ${description}`, context)

      // capture the needed context, so variables can be resolved correctly
      const capturedScope = new GenericContext(
        `captured scope ${i} in ${description}`,
        capture(currentScope, neededContext, { isFinalContext })
      )
      layers.push(capturedScope)

      // NOTE: we now mutate the context we just captured
      // this allows variables cross-referencing each other in the same scope, e.g. to reuse values across multiple variables
      const variableRoot = makeVariableRootContext(`variable root for scope ${i} in ${description}`, capturedScope)
      neededContext.addLayer(variableRoot)

      // this ensures that a variable in any given context can refer to variables in the parent scope
      // variables in the parent scope take precedence over cross-referencing for backwards-compatibility
      if (parent) {
        neededContext.addLayer(parent)
      }

      // make sure the lower precedence scope can access variables from this layer
      parent = variableRoot
    }

    super(description, ...layers)

    if (variableOverrides && !isEmpty(variableOverrides)) {
      this.applyOverrides(variableOverrides, context)
    }
  }

  public static forTest({
    garden,
    variablePrecedence,
    isFinalContext,
  }: {
    garden: Garden
    variablePrecedence: ParsedTemplate[]
    /**
     * @see ContextResolveOpts.isFinalContext
     */
    isFinalContext?: boolean
  }) {
    return new this("test", {
      context: garden.getProjectConfigContext(),
      variablePrecedence,
      variableOverrides: garden.variableOverrides,
      isFinalContext,
    })
  }

  public static async forProject(
    projectConfig: ProjectConfig,
    variableOverrides: DeepPrimitiveMap,
    context: ProjectConfigContext
  ) {
    const rawProjectVarfileVars = await loadVarfile({
      configRoot: projectConfig.path,
      path: projectConfig.varfile,
      defaultPath: defaultProjectVarfilePath,
    })
    const projectVarfileVars = parseTemplateCollection({
      value: rawProjectVarfileVars.data,
      source: rawProjectVarfileVars.source,
    })

    return new this(`project ${projectConfig.name}`, {
      context,
      variablePrecedence: [projectConfig.variables, projectVarfileVars],
      variableOverrides,
    })
  }

  public static async forEnvironment(
    environment: string,
    projectConfig: ProjectConfig,
    environmentConfig: EnvironmentConfig,
    variableOverrides: DeepPrimitiveMap,
    context: ProjectConfigContext
  ) {
    const rawEnvVarfileVars = await loadVarfile({
      configRoot: projectConfig.path,
      path: environmentConfig.varfile,
      defaultPath: defaultEnvVarfilePath(environment),
    })
    const envVarfileVars = parseTemplateCollection({
      value: rawEnvVarfileVars.data,
      source: rawEnvVarfileVars.source,
    })

    return new this(`environment ${environmentConfig.name}`, {
      variablePrecedence: [environmentConfig.variables, envVarfileVars],
      context,
      variableOverrides,
    })
  }

  /**
   * Merges module variables with the following precedence order:
   *
   *   garden.variableOverrides > module varfile > config.variables
   */
  public static async forModule(garden: Garden, config: ModuleConfig, context: ModuleConfigContext) {
    let varfileVars: ParsedTemplate = {}
    if (config.varfile) {
      const varfilePath = deepEvaluate(config.varfile, {
        context,
        opts: {},
      })
      if (typeof varfilePath !== "string") {
        throw new ConfigurationError({
          message: `Expected varfile template expression in module configuration ${config.name} to resolve to string, actually got ${typeof varfilePath}`,
        })
      }
      const rawVarfileVars = await loadVarfile({
        configRoot: config.path,
        path: varfilePath,
        defaultPath: undefined,
        log: garden.log,
      })
      varfileVars = parseTemplateCollection({
        value: rawVarfileVars.data,
        source: rawVarfileVars.source,
      })
    }

    return new this(describeConfig(config), {
      variablePrecedence: [config.variables, varfileVars],
      variableOverrides: garden.variableOverrides,
      context,
    })
  }

  public static async forAction(
    garden: Garden,
    config: ActionConfig,
    context: ActionConfigContext | ActionSpecContext,
    group?: GroupConfig
  ) {
    const effectiveConfigFileLocation = getEffectiveConfigFileLocation(config)
    const actionVarfileVars = await loadVarfiles(garden, effectiveConfigFileLocation, config.varfiles || [])
    const actionVariables = [config.variables, ...actionVarfileVars]

    let groupVarfileVars: ParsedTemplate[] = []
    let groupVariables: ParsedTemplate[] = []
    if (group) {
      groupVarfileVars = await loadVarfiles(garden, group.path, group.varfiles || [])
      groupVariables = [group.variables, ...groupVarfileVars]
    }

    return new this(describeConfig(config) + (!group ? " (without group variables)" : ""), {
      variablePrecedence: [...groupVariables, ...actionVariables],
      context,
      variableOverrides: garden.variableOverrides,
      /**
       * If context is ActionConfigContext, we are still preprocessing and can't access dependency results.
       *
       * @see ContextResolveOpts.isFinalContext
       */
      isFinalContext: context instanceof ActionSpecContext,
    })
  }

  static forCustomCommand(garden: Garden, spec: CommandResource, context: CustomCommandContext): VariablesContext {
    return new this(`custom command ${spec.name}`, {
      variableOverrides: garden.variableOverrides,
      variablePrecedence: [spec.variables],
      context,
    })
  }

  /**
   * Context-aware application of overrides
   *
   * If a context key "foo.bar" exists, and CLI option --var foo.bar=baz has been specified,
   * we override { "foo.bar": "baz" }. Otherwise, we override { foo: { bar: "baz" } }.
   */
  private applyOverrides(newValues: DeepPrimitiveMap, rootContext: ContextWithSchema) {
    const transformedOverrides = {}
    for (const key in newValues) {
      const res = this.resolve({ nodePath: [], key: [key], opts: {}, rootContext })
      if (res.found) {
        // If the original key itself is a string with a dot, then override that
        transformedOverrides[key] = newValues[key]
      } else {
        // Transform override paths like "foo.bar[0].baz"
        // into a nested object like
        // { foo: { bar: [{ baz: "foo" }] } }
        // which we can then use for the layered context as overrides on the nested structure within
        setKeyPathNested(transformedOverrides, key, newValues[key])
      }
    }

    this.layers.push(new GenericContext("variable overrides", transformedOverrides))
    this.clearCache()
  }
}

// helpers

function makeVariableRootContext(description: string, contents: ConfigContext) {
  // This makes the contents available under the keys `var` and `variables`
  return new GenericContext(description, {
    var: contents,
    variables: contents,
  })
}

const getVarfileData = (varfile: Varfile) => {
  const path = typeof varfile === "string" ? varfile : varfile.path
  const optional = typeof varfile === "string" ? false : varfile.optional
  return { path, optional }
}

async function loadVarfiles(garden: Garden, configRoot: string, varfiles: Varfile[]) {
  // in pre-processing, only use varfiles that are not template strings
  const resolvedVarFiles = varfiles.filter(
    (f) => !(f instanceof UnresolvedTemplateValue) && !isUnresolved(getVarfileData(f).path)
  )

  const varsByFile = await Promise.all(
    (resolvedVarFiles || []).map(async (varfile) => {
      const { path, optional } = getVarfileData(varfile)
      const loaded = await loadVarfile({
        configRoot,
        path,
        defaultPath: undefined,
        optional,
        log: garden.log,
      })
      return parseTemplateCollection({
        value: loaded.data,
        source: loaded.source,
      })
    })
  )

  return varsByFile
}

function isEmpty(tpl: ParsedTemplate) {
  // filter empty variable contexts for making the debugging easier
  return !tpl || (isPlainObject(tpl) && Object.keys(tpl).length === 0)
}
