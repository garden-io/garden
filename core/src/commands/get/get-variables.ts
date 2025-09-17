/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import path from "node:path"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { printEmoji, printHeader } from "../../logger/util.js"
import { dedent, renderTable } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import { flatten, omit, uniqBy } from "lodash-es"
import type { GardenCloudApi } from "../../cloud/api/api.js"
import { defaultProjectVarfilePath, getVarlistIdsFromRemoteVarsConfig } from "../../config/project.js"
import type { DeepPrimitiveMap, PrimitiveMap } from "../../config/common.js"
import type { ResolvedTemplate } from "../../template/types.js"
import type { RouterOutput } from "../../cloud/api/trpc.js"
import { ConfigurationError, ParameterError } from "../../exceptions.js"
import { getActionKindsNaturalList, type ActionKind, type BaseActionConfig } from "../../actions/types.js"
import { loadVarfile } from "../../config/base.js"
import { getVarfileData } from "../../config/template-contexts/variables.js"
import { joi, joiArray, parseActionReference } from "../../config/common.js"
import type { Log } from "../../logger/log-entry.js"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params.js"
import { filterDisableFromConfigDump } from "./helpers.js"

const variablesListOpts = {
  "resolve": new ChoicesParameter({
    help: dedent`
      Choose level of resolution of variables. Defaults to \`partial\` which means that template strings in
      action-level variables are not resolved and the raw template string is returned. Use \`--resolve=full\`
      to resolve the full value but note that this may trigger actions being executed in case a given action
      references the runtime output of another in its \`variables\` field.
    `,
    choices: ["full", "partial"],
    defaultValue: "partial",
  }),
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled actions and from output.",
  }),
  "filter-actions": new StringsParameter({
    help: dedent`
      Filter by action using <actionKind>.<actionName>. You may specify multiple names, separated by spaces. For
      example \`--filter-actions build.api --filter-actions deploy.api"\` (or \`--filter-actions build.api,deploy.api\`).
    `,
    spread: true,
  }),
}

type Opts = typeof variablesListOpts

const varSourceType = ["local", "Garden Cloud", "varfile"] as const
// TODO: Currently remote variables are referenced via the ${secrets.<my-var>} template context but we should
// support referencing them with something like ${remoteVar.<my-var>}.
const isRemoteVarRegex = /\${secrets\.([A-Z0-9_]+)}/

type VarsMetadata = {
  name: string
  value: string
  source: (typeof varSourceType)[number]
  path: string
  isSecret: boolean
  details: string
  action?: `${ActionKind}.${string}`
}

type RemoteVariable = RouterOutput["variableList"]["listVariables"]["items"][0] & {
  variableListId: string
}

export class GetVariablesCommand extends Command<{}, Opts> {
  name = "variables"
  help = "Get variables"
  emoji = "✔️"

  override description = dedent`
    List variables in this project, both those those defined in the project configuration and in individual actions, and including remote variables
    and variables from varfiles. This is useful for seeing where variables are set and what value they resolve to when using template strings.

    Note that by default, template strings are not resolved for action-level variables. To resolve all template
    strings, use the \`--resolve=full\` option. Note that this may trigger actions being executed in case a given
    action references the runtime output of another in its \`variables\` field.

    Examples:
        garden variables list                                                         # list all variables and pretty print results
        garden variables list --resolve full                                          # list all variables and resolve template strings, including runtime outputs
        garden variables list --filter-actions build.api --filtera-actions deploy.api # list variables for the Build api and Deploy api actions
        garden variables list --output json                                           # return variables as a JSON object, useful for scripting

  `

  override options = variablesListOpts

  override printHeader({ log }) {
    printHeader(log, "Get variables", "✔️")
  }

  override outputsSchema = () =>
    joi.object().keys({
      variables: joiArray(
        joi.object().keys({
          name: joi.string(),
          value: joi.string(),
          source: joi.string().valid(...varSourceType),
          isSecret: joi.boolean(),
          details: joi.string().allow(""),
          action: joi.string().optional(),
          path: joi.string().allow(""),
        })
      ).description("A list of variables"),
    })

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult> {
    const partial = opts["resolve"] === "partial"
    const config = await garden.dumpConfigWithInteralFields({
      log,
      includeDisabled: false,
      resolveGraph: !partial,
      resolveProviders: !partial,
      resolveWorkflows: false,
    })

    if (opts["exclude-disabled"]) {
      const filtered = filterDisableFromConfigDump(config)
      config.actionConfigs = filtered.actionConfigs
    }

    const filterOnActions = (opts["filter-actions"] || []).map((actionRef: string) => {
      try {
        const parsed = parseActionReference(actionRef)
        return parsed
      } catch (_err) {
        throw new ParameterError({
          message: dedent`
            Invalid --filter-action parameter. Expected format <kind>.<name> where <kind> is one of ${getActionKindsNaturalList()} and <name> is
            a valid name of an action but got ${actionRef}.
          `,
        })
      }
    })

    const variableListIds = getVarlistIdsFromRemoteVarsConfig(config.importVariables)
    const importVariables =
      garden.cloudApi && variableListIds.length > 0
        ? await getRemoteVariables({ api: garden.cloudApi, variableListIds, log })
        : []

    const projectVarfilesData: VarfileData[] = []
    if (config.projectConfig.varfile) {
      const rawProjectVarfileVars = await loadVarfile({
        configRoot: config.projectConfig.path,
        path: config.projectConfig.varfile,
        defaultPath: defaultProjectVarfilePath,
      })
      projectVarfilesData.push({
        data: rawProjectVarfileVars.data,
        path: config.projectConfig.varfile,
      })
    }

    const projectVarsWithMetadata = getVariablesMetadata({
      variables: config.variables,
      importVariables,
      varfilesData: projectVarfilesData,
      rawVariables: config.projectConfig.internal.yamlDoc?.contents?.toJSON()["variables"] || {},
      projectRoot: config.projectRoot,
      filename: config.projectConfig.internal.yamlDoc?.filename,
    })

    const projectVarNames = projectVarsWithMetadata.map((p) => p.name)

    const flatActionConfigs = (<BaseActionConfig[]>(
      Object.values(config.actionConfigs).flatMap((kind) => Object.values(kind))
    )).filter((c) => {
      if (filterOnActions.length === 0) {
        return c
      }
      return filterOnActions.findIndex((f) => f.kind.toLowerCase() === c.kind.toLowerCase() && f.name === c.name) !== -1
    })
    const actionVarsWithMetadata = (
      await Promise.all(
        flatActionConfigs.map(async (action) => {
          const actionVarfilesData: VarfileData[] = []
          for (const varfile of action.varfiles || []) {
            const varfilePath = getVarfileData(varfile).path
            if (varfilePath) {
              const rawActionVarfileVars = await loadVarfile({
                configRoot: action.internal.basePath,
                path: varfilePath,
                defaultPath: undefined,
              })
              actionVarfilesData.push({
                data: rawActionVarfileVars.data,
                path: varfilePath,
              })
            }
          }

          // Project vars are included with action.variables so we omit them here to avoid repitition
          const actionVars = omit(action.variables, projectVarNames)

          return getVariablesMetadata({
            variables: actionVars,
            importVariables,
            rawVariables: action.internal.yamlDoc?.contents?.toJSON()["variables"] || {},
            varfilesData: actionVarfilesData,
            projectRoot: config.projectRoot,
            filename: action.internal.yamlDoc?.filename,
          }).map((v) => ({
            ...v,
            action: `${action.kind}.${action.name}` as const,
          }))
        })
      )
    ).flat()

    const allVars: VarsMetadata[] = []
    allVars.push(...projectVarsWithMetadata, ...actionVarsWithMetadata)

    const heading = ["Name", "Value", "Source", "Action", "Config file path", "Details"].map((s) => styles.bold(s))
    const rows: string[][] = allVars.map((s) => {
      return [styles.highlight.bold(s.name), s.value, s.source, s.action || "N/A", s.path, s.details]
    })

    log.info("")
    log.info(renderTable([heading].concat(rows)))
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return { result: { variables: allVars } }
  }
}

async function getRemoteVariables({
  api,
  variableListIds,
  log,
}: {
  api: GardenCloudApi
  variableListIds: string[]
  log: Log
}): Promise<RemoteVariable[]> {
  const remoteVars = flatten(
    await Promise.all(
      variableListIds.map(async (variableListId) => {
        const allVariables: RouterOutput["variableList"]["listVariables"]["items"][0][] = []
        let cursor: number | undefined = undefined

        // Fetch all pages of variables for this list
        do {
          log.debug(`Fetching variables for variable list ${variableListId}`)
          const response = await api.trpc.variableList.listVariables.query({
            organizationId: api.organizationId,
            variableListId,
            ...(cursor && { cursor }),
          })

          allVariables.push(...response.items)
          cursor = response.nextCursor
        } while (cursor)

        return allVariables.map((v) => ({
          ...v,
          variableListId,
        }))
      })
    )
  )
    .sort((a, b) => a.variableListId.localeCompare(b.variableListId))
    .sort((a, b) => a.name.localeCompare(b.name))

  return remoteVars
}

interface VarfileData {
  path: string
  data: PrimitiveMap
}

/**
 * Returns a list of variables with added metadata, such as its source.
 * We're sort of doing it "manually" here by comparing resolved config and raw config, a more
 * correct way would be to do proper input tracking.
 */
function getVariablesMetadata({
  variables,
  importVariables,
  varfilesData = [],
  rawVariables,
  projectRoot,
  filename,
}: {
  variables: ResolvedTemplate
  importVariables: RemoteVariable[]
  varfilesData?: VarfileData[]
  rawVariables: DeepPrimitiveMap
  projectRoot: string
  filename?: string
}) {
  const relPath = filename ? path.relative(path.resolve(projectRoot), path.resolve(filename)) : ""
  const configVars = Object.entries(variables || {}).map(([varName, val]) => {
    const rawValue = rawVariables[varName]
    let isSecret = false
    let local = true
    let details = ""
    const remoteVarMatch = rawValue && typeof rawValue === "string" && rawValue.match(isRemoteVarRegex)

    if (remoteVarMatch) {
      local = false
      const secretName = remoteVarMatch[1]
      const remoteVar = importVariables.find((v) => v.name === secretName)

      if (!remoteVar) {
        // This should already have thrown
        throw new ConfigurationError({
          message: `Remote variable ${secretName} is referenced in configuration but missing from remote variables.`,
        })
      }

      isSecret = remoteVar.isSecret
      details = `From ${remoteVar.variableListId} (${remoteVar.variableListName})`
    }

    return {
      name: varName,
      value: isSecret ? "<secret>" : JSON.stringify(val),
      source: local ? ("local" as const) : ("Garden Cloud" as const),
      isSecret,
      details,
      path: relPath,
    }
  })

  const varfileVars = varfilesData.flatMap((v) => {
    return Object.entries(v.data).map(([varName, val]) => {
      return {
        name: varName,
        value: JSON.stringify(val),
        source: "varfile" as const,
        isSecret: false,
        details: `From varfile ${v.path}`,
        path: relPath,
      }
    })
  })

  const allVars = [...configVars, ...varfileVars]
  // Filter out duplicates and only show the varfile value since that takes precedence
  return uniqBy(allVars.reverse(), "name").reverse()
}
