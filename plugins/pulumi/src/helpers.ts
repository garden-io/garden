/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { countBy, flatten, isEmpty, uniq } from "lodash-es"
import { load } from "js-yaml"
import stripAnsi from "strip-ansi"
import { styles } from "@garden-io/core/build/src/logger/styles.js"
import { merge } from "json-merge-patch"
import { basename, dirname, extname, join, resolve } from "path"
import fsExtra from "fs-extra"
const { ensureDir, pathExists, readFile } = fsExtra
import {
  ChildProcessError,
  ConfigurationError,
  FilesystemError,
  GardenError,
  PluginError,
} from "@garden-io/sdk/build/src/exceptions.js"
import { dumpYaml } from "@garden-io/core/build/src/util/serialization.js"
import type { DeepPrimitiveMap, Primitive } from "@garden-io/core/build/src/config/common.js"
import { loadAndValidateYaml } from "@garden-io/core/build/src/config/base.js"
import { getPluginOutputsPath } from "@garden-io/sdk"
import type { Log, PluginContext } from "@garden-io/sdk/build/src/types.js"
import { defaultPulumiEnv, pulumi } from "./cli.js"
import type { PulumiDeploy } from "./action.js"
import type { PulumiProvider } from "./provider.js"
import { dedent, deline, naturalList } from "@garden-io/sdk/build/src/util/string.js"
import type { Resolved } from "@garden-io/core/build/src/actions/types.js"
import type { ActionLog } from "@garden-io/core/build/src/logger/log-entry.js"
import type { PulumiCommandResult } from "./commands.js"

export interface PulumiParams {
  ctx: PluginContext
  log: ActionLog
  provider: PulumiProvider
  action: Resolved<PulumiDeploy>
}

export interface PulumiConfig {
  config: DeepPrimitiveMap
  backend?: { url: string }
  [key: string]: DeepPrimitiveMap | Primitive | undefined
}

interface PulumiManifest {
  time: string
  magic: string
  version: string
}

export interface PulumiPlan {
  manifest: PulumiManifest

  // The stack config used by pulumi when generating the plan
  config: DeepPrimitiveMap

  // Represents the desired state and planned operations to perform (along with other fields).
  // See: https://github.com/pulumi/pulumi/blob/c721e8905b0639b3d4aa1d51d0753f6c99b13984/sdk/go/common/apitype/plan.go#L61-L68
  resourcePlans: {
    [resourceUrn: string]: {
      // The goal state for the resource
      goal: DeepPrimitiveMap
      // The steps to be performed on the resource.
      steps: string[]
      // The proposed outputs for the resource, if any. Purely advisory.
      outputs: DeepPrimitiveMap
    }
  }
}

// This is the output shape of `pulumi stack export`
export interface PulumiDeployment {
  version: number
  deployment: {
    manifest: PulumiManifest
    // We use loose types here since we don't need the details. This avoids problems in case they change in future
    // versions of pulumi.
    secrets_providers: any
    // If the stack hasn't been deployed, or if it's been destroyed, this field will be missing. We utilize this fact
    // in our status checking logic.
    resources?: any[]
  }
}

type StackStatus = "up-to-date" | "outdated" | "error"

export const stackVersionKey = "garden.io-service-version"

export interface PreviewResult {
  planPath: string
  affectedResourcesCount: number
  operationCounts: OperationCounts
  // Only null if we didn't find a preview URL in the output (should never happen, but just in case).
  previewUrl: string | null
}

/**
 * Used by the `garden plugins pulumi preview` command.
 *
 * Merges any values in the module's `pulumiVars` and `pulumiVariables`, then uses `pulumi preview` to generate
 * a plan (using the merged config).
 *
 * If `logPreview = true`, logs the output of `pulumi preview`.
 *
 * Returns the path to the generated plan, and the number of resources affected by the plan (zero resources means the
 * plan is a no-op).
 */
export async function previewStack(
  params: PulumiParams & { logPreview: boolean; previewDirPath?: string }
): Promise<PreviewResult> {
  const { log, ctx, provider, action, logPreview, previewDirPath } = params

  const configPath = await applyConfig({ ...params, previewDirPath })
  const planPath = previewDirPath
    ? // Then we're running `garden plugins pulumi preview`, so we write the plan to the preview dir regardless of
      // whether the action is configured to deploy from a preview or not.
      join(previewDirPath, getPlanFileName(action, ctx.environmentName))
    : // Then we use the cache dir or preview dir, depending on the provider and action configuration.
      getPlanPath(ctx, action)
  const res = await pulumi(ctx, provider).exec({
    log,
    // We write the plan to the `.garden` directory for subsequent use by the deploy handler.
    args: ["preview", "--color", "always", "--config-file", configPath, "--save-plan", planPath],
    cwd: getActionStackRoot(action),
    env: ensureEnv(params),
  })
  const plan = await readPulumiPlan(action, planPath)
  const affectedResourcesCount = countAffectedResources(plan)
  const operationCounts = countPlannedResourceOperations(plan)
  let previewUrl: string | null = null
  if (logPreview) {
    if (affectedResourcesCount > 0) {
      const cleanedOutput = stripAnsi(res.stdout)
      // We try to find the preview URL using a regex (which should keep working as long as the output format
      // doesn't change). If we can't find a preview URL, we simply default to `null`. As far as I can tell,
      // Pulumi's automation API doesn't provide this URL in any sort of structured output. -THS
      const urlMatch = cleanedOutput.match(/View Live: ([^\s]*)/)
      previewUrl = urlMatch ? urlMatch[1] : null
      log.info(res.stdout)
    } else {
      log.info(`No resources were changed in the generated plan for ${styles.highlight(action.key())}.`)
    }
  } else {
    log.verbose(res.stdout)
  }
  return { planPath, affectedResourcesCount, operationCounts, previewUrl }
}

export async function getStackOutputs({ log, ctx, provider, action }: PulumiParams): Promise<any> {
  const args = ["stack", "output", "--json"]
  if (action.getSpec("showSecretsInOutput")) {
    args.push("--show-secrets")
  }
  const res = await pulumi(ctx, provider).json({
    log,
    args,
    env: ensureEnv({ log, ctx, provider, action }),
    cwd: getActionStackRoot(action),
  })
  log.debug(`stack outputs for ${action.name}: ${JSON.stringify(res, null, 2)}`)

  return res
}

export async function getDeployment({ log, ctx, provider, action }: PulumiParams): Promise<PulumiDeployment> {
  const res = await pulumi(ctx, provider).json({
    log,
    args: ["stack", "export"],
    env: ensureEnv({ log, ctx, provider, action }),
    cwd: getActionStackRoot(action),
  })
  log.silly(() => `stack export for ${action.name}: ${JSON.stringify(res, null, 2)}`)

  return res
}

// TODO: Use REST API instead of calling the CLI here.
export async function setStackVersionTag({ log, ctx, provider, action }: PulumiParams) {
  try {
    await pulumi(ctx, provider).stdout({
      log,
      args: ["stack", "tag", "set", stackVersionKey, action.versionString(log)],
      env: ensureEnv({ log, ctx, provider, action }),
      cwd: getActionStackRoot(action),
    })
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    throw new PluginError({
      message: dedent`
      An error occurred while setting the stack version tag for action ${action.name}: ${err.message}

      Hint: consider setting 'cacheStatus: false'
      `,
    })
  }
}

// TODO: Use REST API instead of calling the CLI here.
export async function getStackVersionTag({ log, ctx, provider, action }: PulumiParams): Promise<string | null> {
  let res: string
  try {
    res = await pulumi(ctx, provider).stdout({
      log,
      args: ["stack", "tag", "get", stackVersionKey],
      env: ensureEnv({ log, ctx, provider, action }),
      cwd: getActionStackRoot(action),
    })
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    log.debug(err.message)
    return null
  }
  const tag = res.trim()
  return tag
}

// TODO: Use REST API instead of calling the CLI here.
export async function clearStackVersionTag({ log, ctx, provider, action }: PulumiParams): Promise<void> {
  try {
    await pulumi(ctx, provider).stdout({
      log,
      args: ["stack", "tag", "rm", stackVersionKey],
      env: ensureEnv({ log, ctx, provider, action }),
      cwd: getActionStackRoot(action),
    })
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    log.debug(err.message)
  }
}

export function getStackName(action: Resolved<PulumiDeploy>): string {
  return action.getSpec("stack") || action.name
}

export function getActionStackRoot(action: Resolved<PulumiDeploy>): string {
  return join(action.sourcePath(), action.getSpec("root"))
}

/**
 * Merges the action's `pulumiVariables` with any `pulumiVarfiles` and overwrites the action's stack config with the
 * merged result.
 *
 * For convenience, returns the path to the action's stack config file.
 */
export async function applyConfig(params: PulumiParams & { previewDirPath?: string }): Promise<string> {
  const { ctx, action, log, provider } = params
  await ensureOutputDirs(ctx)

  const stackConfigPath = getStackConfigPath(action, ctx.environmentName)
  let stackConfig: PulumiConfig
  let stackConfigFileExists: boolean
  try {
    const fileData = await readFile(stackConfigPath)
    const stackConfigDocs = await loadAndValidateYaml({
      content: fileData.toString(),
      sourceDescription: `${basename(stackConfigPath)} in directory ${dirname(stackConfigPath)}`,
      filename: stackConfigPath,
    })
    stackConfig = stackConfigDocs[0].toJS()
    stackConfigFileExists = true
  } catch (err) {
    log.debug(`No pulumi stack configuration file for action ${action.name} found at ${stackConfigPath}`)
    stackConfig = { config: {}, backend: { url: "" } }
    stackConfigFileExists = false
  }
  const spec = action.getSpec()
  const pulumiVars = spec.pulumiVariables
  let varfileContents: DeepPrimitiveMap[]
  try {
    varfileContents = await Promise.all(
      spec.pulumiVarfiles.map(async (varfilePath: string) => {
        return loadPulumiVarfile({ action, ctx, log, varfilePath })
      })
    )
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    throw new FilesystemError({
      message: `An error occurred while reading specified pulumi varfiles (${naturalList(
        spec.pulumiVarfiles
      )}) for action ${action.name}: ${err.message}`,
    })
  }

  log.debug(`merging config for action ${action.name}`)
  log.debug(`pulumiVariables from action: ${JSON.stringify(pulumiVars, null, 2)}`)
  log.debug(`varfileContents: ${JSON.stringify(varfileContents, null, 2)}`)

  // Pulumi variables (from action.spec.pulumiVariables) take precedence over any variables declared in pulumi varfiles.
  let vars: DeepPrimitiveMap = {}

  if (action.getSpec().useNewPulumiVarfileSchema || provider.config.useNewPulumiVarfileSchema) {
    for (const varfileVars of varfileContents) {
      vars = <DeepPrimitiveMap>merge(vars, varfileVars)
    }
    stackConfig.config = <DeepPrimitiveMap>merge(vars.config, pulumiVars || {})
    log.debug(`merged vars: ${JSON.stringify(stackConfig, null, 2)}`)
    Object.entries(vars).forEach(([key, value]) => {
      if (key !== "config") {
        stackConfig[key] = value as Primitive | DeepPrimitiveMap
      }
    })
  } else {
    log.warn(dedent`
      The old Pulumi varfile schema is deprecated and will be removed in a future version of Garden.
      For more information see: https://docs.garden.io/pulumi-plugin/about#pulumi-varfile-schema
    `)
    for (const varfileVars of varfileContents) {
      vars = <DeepPrimitiveMap>merge(vars, varfileVars)
    }
    vars = <DeepPrimitiveMap>merge(vars, pulumiVars || {})
    log.debug(`merged vars: ${JSON.stringify(vars, null, 2)}`)
    stackConfig.config = vars
  }
  stackConfig.backend = { url: params.provider.config.backendURL }
  if (stackConfigFileExists && isEmpty(vars)) {
    log.debug(dedent`
      stack config file exists but no variables are defined in pulumiVars or pulumiVarfiles - skip writing stack config
    `)
  } else {
    log.debug(`merged config (written to ${stackConfigPath}): ${JSON.stringify(stackConfig, null, 2)}`)
    await dumpYaml(stackConfigPath, stackConfig)
  }

  return stackConfigPath
}

/**
 * The service counts as up to date if the stack's Garden version tag hasn't changed and if the exported stack (i.e.
 * the deployment) contains at least once resource (which essentially checks that the stack hasn't been destroyed
 * since the last deployment).
 */
export async function getStackStatusFromTag(params: PulumiParams): Promise<StackStatus> {
  const currentDeployment = await getDeployment(params)
  const resources = currentDeployment.deployment.resources
  const tagVersion = await getStackVersionTag(params)
  return tagVersion === params.action.versionString(params.log) && resources && resources.length > 0
    ? "up-to-date"
    : "outdated"
}

async function readPulumiPlan(module: PulumiDeploy, planPath: string): Promise<PulumiPlan> {
  let plan: PulumiPlan
  try {
    plan = JSON.parse((await readFile(planPath)).toString()) as PulumiPlan
    return plan
  } catch (err) {
    const errMsg = `An error occurred while reading a pulumi plan file at ${planPath} in module ${module.name}: ${err}`
    throw new FilesystemError({
      message: errMsg,
    })
  }
}

export interface OperationCounts {
  [operationType: string]: number
}

/**
 * Counts the number of steps in plan by operation type.
 */
export function countPlannedResourceOperations(plan: PulumiPlan): OperationCounts {
  const allSteps = flatten(Object.values(plan.resourcePlans).map((p) => p.steps))
  const counts: OperationCounts = countBy(allSteps)
  delete counts.same
  return counts
}

/**
 * Counts the number of resources in `plan` that have one or more steps that aren't of the `same` type
 * (i.e. that aren't no-ops).
 */
export function countAffectedResources(plan: PulumiPlan): number {
  const affectedResourcesCount = Object.values(plan.resourcePlans)
    .map((p) => p.steps)
    .filter((steps: string[]) => {
      const stepTypes = uniq(steps)
      return stepTypes.length > 1 || stepTypes[0] !== "same"
    }).length

  return affectedResourcesCount
}

// Helpers for plugin commands

/**
 * Wrapper for `pulumi cancel --yes`. Does not throw on error, since we may also want to cancel other updates upstream.
 */
export async function cancelUpdate({ action, ctx, provider, log }: PulumiParams): Promise<PulumiCommandResult> {
  const res = await pulumi(ctx, provider).exec({
    log,
    ignoreError: true,
    args: ["cancel", "--yes", "--color", "always"],
    env: ensureEnv({ log, ctx, provider, action }),
    cwd: getActionStackRoot(action),
  })
  log.info(res.stdout)

  if (res.exitCode !== 0) {
    log.warn(`pulumi cancel failed:\n${res.stderr}`)
    return {
      state: "failed",
      outputs: {},
    }
  }

  return {
    state: "ready",
    outputs: {},
  }
}

/**
 * Wrapper for `pulumi refresh --yes`.
 */
export async function refreshResources(params: PulumiParams): Promise<PulumiCommandResult> {
  const { action, ctx, provider, log } = params
  const configPath = await applyConfig(params)

  const res = await pulumi(ctx, provider).exec({
    log,
    ignoreError: false,
    args: ["refresh", "--yes", "--color", "always", "--config-file", configPath],
    env: ensureEnv({ log, ctx, provider, action }),
    cwd: getActionStackRoot(action),
  })
  log.info(res.stdout)
  return {
    state: "ready",
    outputs: {},
  }
}

/**
 * Wrapper for `pulumi stack export|pulumi stack import`.
 */
export async function reimportStack(params: PulumiParams): Promise<PulumiCommandResult> {
  const { action, ctx, provider, log } = params
  const cwd = getActionStackRoot(action)

  const cli = pulumi(ctx, provider)
  const exportRes = await cli.exec({
    log,
    ignoreError: false,
    args: ["stack", "export"],
    env: ensureEnv({ log, ctx, provider, action }),
    cwd,
  })
  await cli.exec({
    log,
    ignoreError: false,
    args: ["stack", "import"],
    input: exportRes.stdout,
    env: ensureEnv({ log, ctx, provider, action }),
    cwd,
  })
  return {
    state: "ready",
    outputs: {},
  }
}

// Lower-level helpers

export function ensureEnv(pulumiParams: PulumiParams): { [key: string]: string } {
  const backendUrl = pulumiParams.provider.config.backendURL
  return { PULUMI_BACKEND_URL: backendUrl, ...defaultPulumiEnv }
}

export async function selectStack({ action, ctx, provider, log }: PulumiParams) {
  const root = getActionStackRoot(action)
  const spec = action.getSpec()
  const stackName = spec.stack || ctx.environmentName
  const orgName = getOrgName(<PulumiProvider>ctx.provider, action)
  const qualifiedStackName = orgName ? `${orgName}/${stackName}` : stackName
  const args = ["stack", "select", qualifiedStackName]
  spec.createStack && args.push("--create")
  const env = ensureEnv({ action, ctx, provider, log })
  await pulumi(ctx, provider).spawnAndWait({ args, cwd: root, log, env })
  return stackName
}

function getOrgName(provider: PulumiProvider, action: Resolved<PulumiDeploy>): string | undefined {
  const orgName = action.getSpec("orgName")
  if (orgName) {
    return orgName
  } else {
    return provider.config.orgName
  }
}

export function getPlanPath(ctx: PluginContext, action: Resolved<PulumiDeploy>): string {
  return join(getPlanDirPath(ctx, action), getPlanFileName(action, ctx.environmentName))
}

export function getStackConfigPath(action: Resolved<PulumiDeploy>, environmentName: string): string {
  const stackName = action.getSpec("stack") || environmentName
  return join(getActionStackRoot(action), `Pulumi.${stackName}.yaml`)
}

/**
 * TODO: Write unit tests for this
 */
export function getPlanDirPath(ctx: PluginContext, action: Resolved<PulumiDeploy>): string {
  return action.getSpec("deployFromPreview") ? getPreviewDirPath(ctx) : getCachePath(ctx)
}

function getCachePath(ctx: PluginContext): string {
  return join(getPluginOutputsPath(ctx, "pulumi"), "cache")
}

export function getPreviewDirPath(ctx: PluginContext) {
  const provider: PulumiProvider = <PulumiProvider>ctx.provider
  return provider.config.previewDir ? join(ctx.projectRoot, provider.config.previewDir) : getDefaultPreviewDirPath(ctx)
}

function getDefaultPreviewDirPath(ctx: PluginContext): string {
  return join(getPluginOutputsPath(ctx, "pulumi"), "last-preview")
}

export function getModifiedPlansDirPath(ctx: PluginContext): string {
  return join(getPreviewDirPath(ctx), "modified")
}

export function getPlanFileName(module: PulumiDeploy, environmentName: string): string {
  return `${module.name}.${environmentName}.plan.json`
}

async function ensureOutputDirs(ctx: PluginContext) {
  await ensureDir(getCachePath(ctx))
  await ensureDir(getDefaultPreviewDirPath(ctx))
}

/**
 * Reads the YAML-formatted pulumi varfile at `varfilePath`, resolves template strings and returns the parsed contents.
 *
 * If no file is found at the requested path, no error is thrown (but a warning message is logged at the
 * verbose log level).
 */
async function loadPulumiVarfile({
  action,
  ctx,
  log,
  varfilePath,
}: {
  action: PulumiDeploy
  ctx: PluginContext
  log: Log
  varfilePath: string
}): Promise<DeepPrimitiveMap> {
  const resolvedPath = resolve(action.sourcePath(), varfilePath)
  if (!(await pathExists(resolvedPath))) {
    log.verbose(`Could not find varfile at path '${resolvedPath}' for pulumi action ${action.name}`)
    return {}
  }

  const ext = extname(resolvedPath.toLowerCase())
  const isYamlFile = ext === ".yml" || ext === ".yaml"
  if (!isYamlFile) {
    const errMsg = deline`
      Unable to load Pulumi varfile at path ${resolvedPath} (action ${action.name}): Expected file extension to be .yml or .yaml, got ${ext}. Pulumi varfiles must be YAML files.`
    throw new ConfigurationError({
      message: errMsg,
    })
  }

  try {
    const str = (await readFile(resolvedPath)).toString()
    const resolved = ctx.legacyResolveTemplateString(str)
    if (typeof resolved !== "string") {
      throw new ConfigurationError({
        message: `Expected template expression to resolve to string; Actually got: ${typeof resolved}`,
      })
    }
    const parsed = load(resolved)
    return parsed as DeepPrimitiveMap
  } catch (error) {
    const errMsg = `Unable to load varfile at '${resolvedPath}' (action ${action.name}): ${error}`
    throw new ConfigurationError({
      message: errMsg,
    })
  }
}
