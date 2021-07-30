/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isEmpty } from "lodash"
import { safeLoad } from "js-yaml"
import { merge } from "json-merge-patch"
import { extname, join, resolve } from "path"
import { ensureDir, pathExists, readFile } from "fs-extra"
import { ConfigurationError, FilesystemError } from "@garden-io/sdk/exceptions"
import { dumpYaml } from "@garden-io/core/build/src/util/util"
import { DeepPrimitiveMap } from "@garden-io/core/build/src/config/common"
import { loadAndValidateYaml } from "@garden-io/core/build/src/config/base"
import { getPluginOutputsPath } from "@garden-io/sdk"
import { LogEntry, PluginContext } from "@garden-io/sdk/types"
import { defaultPulumiEnv, pulumi } from "./cli"
import { PulumiModule, PulumiProvider } from "./config"
import chalk from "chalk"
import { deline } from "@garden-io/sdk/util/string"

export interface PulumiParams {
  ctx: PluginContext
  log: LogEntry
  provider: PulumiProvider
  module: PulumiModule
}

export interface PulumiConfig {
  config: DeepPrimitiveMap
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
  //
  // See: https://github.com/pulumi/pulumi/blob/c721e8905b0639b3d4aa1d51d0753f6c99b13984/sdk/go/common/apitype/plan.go#L61-L68
  resourcePlans: {
    [resourceUrn: string]: {
      // The goal state for the resource
      goal: DeepPrimitiveMap
      // The steps to be performed on the resource.
      steps: string[] // When the plan is 
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

/**
 * Merges any values in the module's `pulumiVars` and `pulumiVariables`, then uses `pulumi preview` to generate
 * a plan (using the merged config).
 *
 * If `logPreview = true`, logs the output of `pulumi preview`.
 *
 * Returns the path to the generated plan.
 */
export async function previewStack(params: PulumiParams & { logPreview: boolean, previewDirPath?: string }): Promise<string> {
  const { log, ctx, provider, module, logPreview, previewDirPath } = params

  const configPath = await applyConfig({ ...params, previewDirPath })
  const planPath = previewDirPath
    // Then we're running `garden plugins pulumi preview`, so we write the plan to the preview dir regardless of
    // whether the module is configured to deploy from a preview or not.
    ? join(previewDirPath, getPlanFileName(module, ctx.environmentName))
    // Then we use the cache dir or preview dir, depending on the provider and module configuration.
    : getPlanPath(ctx, module)
  const res = await pulumi(ctx, provider).exec({
    log,
    // We write the plan to the `.garden` directory for subsequent use by the deploy handler.
    args: ["preview", "--color", "always", "--config-file", configPath, "--save-plan", planPath],
    cwd: getModuleStackRoot(module),
    env: defaultPulumiEnv,
  })
  if (logPreview) {
    log.info(res.stdout)
  } else {
    log.verbose(res.stdout)
  }
  return planPath
}

export async function getStackOutputs({ log, ctx, provider, module }: PulumiParams): Promise<any> {
  const res = await pulumi(ctx, provider).json({
    log,
    args: ["stack", "output", "--json"],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
  log.debug(`stack outputs for ${module.name}: ${JSON.stringify(res, null, 2)}`)

  return res
}

export async function getDeployment({ log, ctx, provider, module }: PulumiParams): Promise<PulumiDeployment> {
  const res = await pulumi(ctx, provider).json({
    log,
    args: ["stack", "export"],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
  log.silly(`stack export for ${module.name}: ${JSON.stringify(res, null, 2)}`)

  return res
}

// TODO: Use REST API instead of calling the CLI here.
export async function setStackVersionTag({
  log,
  ctx,
  provider,
  module,
  serviceVersion,
}: PulumiParams & { serviceVersion: string }): Promise<string> {
  await pulumi(ctx, provider).stdout({
    log,
    args: ["stack", "tag", "set", stackVersionKey, serviceVersion],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
  return serviceVersion
}

// TODO: Use REST API instead of calling the CLI here.
export async function getStackVersionTag({ log, ctx, provider, module, }: PulumiParams): Promise<string | null> {
  let res: string
  try {
    res = await pulumi(ctx, provider).stdout({
      log,
      args: ["stack", "tag", "get", stackVersionKey],
      env: defaultPulumiEnv,
      cwd: getModuleStackRoot(module)
    })
  } catch (err) {
    log.debug(err.message)
    return null
  }
  const tag = res.trim()
  return tag
}

// TODO: Use REST API instead of calling the CLI here.
export async function clearStackVersionTag({
  log,
  ctx,
  provider,
  module,
}: PulumiParams): Promise<void> {
  await pulumi(ctx, provider).stdout({
    log,
    args: ["stack", "tag", "rm", stackVersionKey],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
}

export function getStackName(module: PulumiModule): string {
  return module.spec.stack || module.name
}

export function getModuleStackRoot(module: PulumiModule): string {
  return join(module.path, module.spec.root)
}

/**
 * Merges the module's `pulumiVariables` with any `pulumiVarfiles` and overwrites the module's stack config with the
 * merged result.
 * 
 * For convenience, returns the path to the module's stack config file.
 */
export async function applyConfig(params: PulumiParams & { previewDirPath?: string }): Promise<string> {
  const { ctx, module, log } = params
  await ensureOutputDirs(ctx)

  const stackConfigPath = getStackConfigPath(module, ctx.environmentName)
  let stackConfig: PulumiConfig
  let stackConfigFileExists: boolean
  try {
    const fileData = await readFile(stackConfigPath)
    stackConfig = (await loadAndValidateYaml(fileData.toString(), stackConfigPath))[0]
    stackConfigFileExists = true
  } catch (err) {
    log.debug(`No pulumi stack configuration file for module ${module.name} found at ${stackConfigPath}`)
    stackConfig = { config: {} }
    stackConfigFileExists = false
  }
  const pulumiVars = module.spec.pulumiVariables
  let varfileContents: DeepPrimitiveMap[]
  try {
    varfileContents = await Bluebird.map(module.spec.pulumiVarfiles, async (varfilePath: string) => {
      return loadPulumiVarfile({ module, ctx, log, varfilePath })
    })

  } catch (err) {
    throw new FilesystemError(`An error occurred while reading pulumi varfiles for module ${module.name}: ${err.message}`, {
      pulumiVarfiles: module.spec.pulumiVarfiles,
      moduleName: module.name
    })
  }

  log.debug(`merging config for module ${module.name}`)
  log.debug(`pulumiVariables from module: ${JSON.stringify(pulumiVars, null, 2)}`)
  log.debug(`varfileContents: ${JSON.stringify(varfileContents, null, 2)}`)

  // Pulumi varfiles take precedence over module.spec.pulumiVariables, and are merged in declaration order.
  // Pulumi variables (from module.spec.pulumiVariables) take precedence over any variables declared in pulumi varfiles.
  let vars: DeepPrimitiveMap = {}
  for (const varfileVars of varfileContents) {
    vars = <DeepPrimitiveMap>merge(vars, varfileVars)
  }
  vars = <DeepPrimitiveMap>merge(vars, pulumiVars || {})
  log.debug(`merged vars: ${JSON.stringify(vars, null, 2)}`)
  stackConfig.config = vars

  if (stackConfigFileExists && isEmpty(vars)) {
    log.debug(deline`
      stack config file exists but no variables are defined in pulumiVars or pulumiVarfiles - skip writing stack config
    `)
  } else {
    log.debug(`merged config (written to ${stackConfigPath}): ${JSON.stringify(stackConfig, null, 2)}`)
  }

  await dumpYaml(stackConfigPath, stackConfig)

  return stackConfigPath
}

/**
 * The service counts as up to date if the stack's Garden version tag hasn't changed and if the exported stack (i.e.
 * the deployment) contains at least once resource (which essentially checks that the stack hasn't been destroyed
 * since the last deployment).
 */
export async function getStackStatusFromTag(params: PulumiParams & { serviceVersion: string }): Promise<StackStatus> {
  const currentDeployment = await getDeployment(params)
  const resources = currentDeployment.deployment.resources
  const tagVersion = await getStackVersionTag(params)
  return (tagVersion === params.serviceVersion && resources && resources.length > 0) ? "up-to-date" : "outdated"
}

// Keeping this here for now, in case we want to reuse this logic
// export async function getStackStatusFromPlanPath(module: PulumiModule, planPath: string): Promise<StackStatus> {
//   let plan: PulumiPlan
//   try {
//     plan = JSON.parse((await readFile(planPath)).toString()) as PulumiPlan
//   } catch (err) {
//     const errMsg = `An error occurred while reading a pulumi plan file at ${planPath}: ${err.message}`
//     throw new FilesystemError(errMsg, {
//       planPath,
//       moduleName: module.name,
//     })
//   }

//   // If all steps across all resource plans are of the "same" type, then the plan indicates that the
//   // stack doesn't need to be updated (so we don't need to redeploy).
//   const stepTypes = uniq(flatten(Object.values(plan.resourcePlans).map((p) => p.steps)))

//   return stepTypes.length === 1 && stepTypes[0] === "same" ? "up-to-date" : "outdated"
// }

// Helpers for plugin commands

/**
 * Wrapper for `pulumi cancel --yes`. Does not throw on error, since we may also want to cancel other updates upstream.
 */
export async function cancelUpdate({ module, ctx, provider, log }: PulumiParams): Promise<void> {
  const res = await pulumi(ctx, provider).exec({
    log,
    ignoreError: true,
    args: ["cancel", "--yes",  "--color", "always"],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
  log.info(res.stdout)

  if (res.exitCode !== 0) {
    log.warn(chalk.yellow(`pulumi cancel failed:\n${res.stderr}`))
  }
}

/**
 * Wrapper for `pulumi refresh --yes`.
 */
export async function refreshResources(params: PulumiParams): Promise<void> {
  const { module, ctx, provider, log } = params
  const configPath = await applyConfig(params)

  const res = await pulumi(ctx, provider).exec({
    log,
    ignoreError: false,
    args: ["refresh", "--yes",  "--color", "always", "--config-file", configPath],
    env: defaultPulumiEnv,
    cwd: getModuleStackRoot(module)
  })
  log.info(res.stdout)
}

/**
 * Wrapper for `pulumi stack export|pulumi stack import`.
 */
export async function reimportStack(params: PulumiParams): Promise<void> {
  const { module, ctx, provider, log } = params
  const cwd = getModuleStackRoot(module)

  const cli = pulumi(ctx, provider)
  const exportRes = await cli.exec({
    log,
    ignoreError: false,
    args: ["stack", "export"],
    env: defaultPulumiEnv,
    cwd, 
  })
  await cli.exec({
    log,
    ignoreError: false,
    args: ["stack", "import"],
    input: exportRes.stdout,
    env: defaultPulumiEnv,
    cwd, 
  })
}

// Lower-level helpers

export async function selectStack({ module, ctx, provider, log }: PulumiParams) {
  const root = getModuleStackRoot(module)
  const stackName = module.spec.stack || ctx.environmentName

  const orgName = getOrgName(<PulumiProvider>ctx.provider, module)
  const qualifiedStackName = orgName ? `${orgName}/${stackName}` : stackName
  const args = ["stack", "select", qualifiedStackName]
  module.spec.createStack && args.push("--create")
  await pulumi(ctx, provider).spawnAndWait({ args, cwd: root, log, env: defaultPulumiEnv })
  return stackName
}

function getOrgName(provider: PulumiProvider, module: PulumiModule): string | null {
  if (module.spec.orgName || module.spec.orgName === null) {
    return module.spec.orgName
  } else {
    return provider.config.orgName || null
  }
}

export function getPlanPath(ctx: PluginContext, module: PulumiModule): string {
  return join(getPlanDirPath(ctx, module), getPlanFileName(module, ctx.environmentName))
}

export function getStackConfigPath(module: PulumiModule, environmentName: string): string {
  const stackName = module.spec.stack || environmentName
  return join(getModuleStackRoot(module), `Pulumi.${stackName}.yaml`)
}

/**
 * TODO: Write unit tests for this
 */
export function getPlanDirPath(ctx: PluginContext, module: PulumiModule): string {
  return module.spec.deployFromPreview
    ? getPreviewDirPath(ctx)
    : getCachePath(ctx)
}

function getCachePath(ctx: PluginContext): string {
  return join(getPluginOutputsPath(ctx, "pulumi"), "cache")
}

export function getPreviewDirPath(ctx: PluginContext) {
  const provider: PulumiProvider = <PulumiProvider>ctx.provider
  return provider.config.previewDir
    ? join(ctx.projectRoot, provider.config.previewDir)
    : getDefaultPreviewDirPath(ctx)
}

function getDefaultPreviewDirPath(ctx: PluginContext): string {
  return join(getPluginOutputsPath(ctx, "pulumi"), "last-preview")
}

export function getPlanFileName(module: PulumiModule, environmentName: string): string {
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
  module,
  ctx,
  log,
  varfilePath,
}: {
  module: PulumiModule
  ctx: PluginContext
  log: LogEntry
  varfilePath: string
}): Promise<DeepPrimitiveMap> {
  const resolvedPath = resolve(module.path, varfilePath)
  if (!(await pathExists(resolvedPath))) {
    log.verbose(`Could not find varfile at path '${resolvedPath}' for pulumi module ${module.name}`)
    return {}
  }

  const ext = extname(resolvedPath.toLowerCase())
  const isYamlFile = ext === ".yml" || ext === ".yaml"
  if (!isYamlFile) {
    const errMsg = deline`
      Unable to load varfile at path ${resolvedPath}: Expected file extension to be .yml or .yaml, got ${ext}. Pulumi varfiles must be YAML files.`
    throw new ConfigurationError(errMsg, {
      moduleName: module.name,
      resolvedPath,
      varfilePath,
    })
  }

  try {
    const str = (await readFile(resolvedPath)).toString()
    const resolved = ctx.resolveTemplateStrings(str)
    const parsed = safeLoad(resolved)
    return parsed as DeepPrimitiveMap
  } catch (error) {
    const errMsg = `Unable to load varfile at '${resolvedPath}': ${error}`
    throw new ConfigurationError(errMsg, {
      moduleName: module.name,
      error,
      resolvedPath,
    })
  }
}
