/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { PluginContext } from "../../plugin-context.js"
import type { Resolved } from "../../actions/types.js"
import type { ContainerBuildAction } from "./config.js"
import { ChildProcessError, ConfigurationError, InternalError } from "../../exceptions.js"
import type { ContainerProvider } from "./container.js"
import dedent from "dedent"
import { styles } from "../../logger/styles.js"
import type { KubernetesPluginContext } from "../kubernetes/config.js"
import { uuidv4 } from "../../util/random.js"
import fsExtra from "fs-extra"
const { mkdirp, rm } = fsExtra
import { join } from "path"
import { tmpdir } from "node:os"
import type { CloudBuilderAvailability } from "../../cloud/api.js"
import { emitNonRepeatableWarning } from "../../warnings.js"
import { LRUCache } from "lru-cache"
import { getPlatform } from "../../util/arch-platform.js"
import { gardenEnv } from "../../constants.js"

type CloudBuilderConfiguration = {
  isInClusterBuildingConfigured: boolean
  isCloudBuilderEnabled: boolean
}

// TODO: consider if it's useful to make this tunable e.g. via an environment variable.
const cloudBuilderAvailability = new LRUCache<string, CloudBuilderAvailability>({
  max: 1000,
  // 5 minutes
  ttl: 1000 * 60 * 5,
})

// public API
export const cloudbuilder = {
  isConfigured(ctx: PluginContext): boolean {
    const { isCloudBuilderEnabled } = getConfiguration(ctx)
    if (!isCloudBuilderEnabled) {
      return false
    }

    if (getPlatform() === "windows") {
      emitNonRepeatableWarning(
        ctx.log,
        dedent`
        ${styles.bold("Garden Cloud Builder is not available for Windows at the moment.")}

        Please contact our customer support and tell us more if you're interested in Windows support.`
      )
      return false
    }

    return true
  },

  async isConfiguredAndAvailable(ctx: PluginContext, action: Resolved<ContainerBuildAction>) {
    if (!cloudbuilder.isConfigured(ctx)) {
      return false
    }

    const availability = await getAvailability(ctx, action)
    return availability.available
  },

  async withBuilder<T>(
    ctx: PluginContext,
    action: Resolved<ContainerBuildAction>,
    performBuild: (builder: string) => Promise<T>
  ) {
    const cb = await getAvailability(ctx, action)
    if (!cb.available) {
      throw new InternalError({
        message: `Must call isConfiguredAndAvailable before calling withBuilder.`,
      })
    }

    // Docker only accepts builder names that start with a letter
    const buildxBuilderName = `cb${uuidv4()}-${cb.builder}`

    // Temp dir needs to be as short as possible, otherwise docker fails to connect
    // (ERROR: no valid drivers found: unix socket path "..." is too long)
    const stateDir = join(tmpdir(), buildxBuilderName.substring(0, 8))
    await mkdirp(stateDir)

    try {
      ctx.log.debug(`Spawning buildx proxy ${buildxBuilderName}`)
      const result = await nscCli({
        // See https://namespace.so/docs/cli/docker-buildx-setup
        args: ["docker", "buildx", "setup", "--name", buildxBuilderName, "--state", stateDir, "--background"],
        ctx,
        nscAuthToken: cb.token,
        nscRegion: cb.region,
      })
      ctx.log.debug(
        `buildx proxy setup process for ${buildxBuilderName} exited with code ${result.exitCode}${result.all?.length ? ` (output: ${result.all})` : ""}`
      )

      return await performBuild(buildxBuilderName)
    } finally {
      ctx.log.debug(`Cleaning up ${buildxBuilderName}`)
      await nscCli({
        args: ["docker", "buildx", "cleanup", "--state", stateDir],
        ctx,
        nscAuthToken: cb.token,
        nscRegion: cb.region,
      })
      ctx.log.debug(`Removing ${stateDir}...`)
      await rm(stateDir, { recursive: true, force: true })
    }
  },
}

// private helpers

async function nscCli({
  args,
  ctx,
  nscAuthToken,
  nscRegion,
}: {
  args: string[]
  ctx: PluginContext
  nscAuthToken: string
  nscRegion: string
}) {
  // env variables for the nsc commands
  const env = {
    // skip update check
    NS_DO_NOT_UPDATE: "true",
    // this helps avoiding to interfere with user's own nsc authentication, if they happen to use it
    NSC_TOKEN_SPEC: Buffer.from(
      JSON.stringify({
        version: "v1",
        inline_token: nscAuthToken,
      })
    )
      // nsc uses https://pkg.go.dev/encoding/base64#RawStdEncoding (standard base64 encoding without padding characters)
      .toString("base64")
      .replaceAll("=", ""),
  }

  const nsc = ctx.tools["container.namespace-cli"]

  try {
    return await nsc.exec({ args: ["--region", nscRegion, ...args], log: ctx.log, env })
  } catch (e: unknown) {
    if (e instanceof ChildProcessError) {
      // if an error happens here, it's likely a bug
      throw InternalError.wrapError(e, "Failed to set up Garden Cloud Builder")
    } else {
      throw e
    }
  }
}

function getConfiguration(ctx: PluginContext): CloudBuilderConfiguration {
  let containerProvider: ContainerProvider
  let isInClusterBuildingConfigured: boolean
  if (ctx.provider.name === "container") {
    containerProvider = ctx.provider as ContainerProvider
    isInClusterBuildingConfigured = false
  } else if (ctx.provider.name.includes("kubernetes")) {
    containerProvider = ctx.provider.dependencies.container as ContainerProvider
    const config = (ctx as KubernetesPluginContext).provider.config
    isInClusterBuildingConfigured = config.buildMode && config.buildMode !== "local-docker"
  } else {
    throw new InternalError({
      message: `called cloudbuilder.isAvailable in unsupported plugin named ${ctx.provider.name}`,
    })
  }

  let isCloudBuilderEnabled = containerProvider.config.gardenCloudBuilder?.enabled || false

  // The env variable GARDEN_CLOUD_BUILDER can be used to override the cloudbuilder.enabled config setting.
  // It will be undefined, if the variable is not set and true/false if GARDEN_CLOUD_BUILDER=1 or GARDEN_CLOUD_BUILDER=0.
  const overrideFromEnv = gardenEnv.GARDEN_CLOUD_BUILDER
  if (overrideFromEnv !== undefined) {
    isCloudBuilderEnabled = overrideFromEnv
  }

  return {
    isInClusterBuildingConfigured,
    isCloudBuilderEnabled,
  }
}

async function getAvailability(
  ctx: PluginContext,
  action: Resolved<ContainerBuildAction>
): Promise<CloudBuilderAvailability> {
  const { isInClusterBuildingConfigured } = getConfiguration(ctx)

  // Cache the Cloud Builder availability response from Backend for 5 minutes in LRU cache
  const fromCache = cloudBuilderAvailability.get(action.uid)
  if (fromCache) {
    return fromCache
  }

  if (!ctx.cloudApi) {
    const fallbackDescription = isInClusterBuildingConfigured
      ? `This forces Garden to use the fall-back option to build images within your Kubernetes cluster, as in-cluster building is configured in the Kubernetes provider settings.`
      : `This forces Garden to use the fall-back option to build images locally.`

    throw new ConfigurationError({
      message: dedent`
      You are not logged in. Run ${styles.command("garden login")} so Garden Cloud Builder can speed up your container builds.

      If you can't log in right now, disable Garden Cloud Builder using the environment variable ${styles.bold("GARDEN_CLOUD_BUILDER=0")}. ${fallbackDescription}`,
    })
  }

  const res = await ctx.cloudApi.registerCloudBuilderBuild({
    // TODO: send requested platforms and action version
    actionUid: action.uid,
    actionName: action.name,
    coreSessionId: ctx.sessionId,
  })

  if (res.data.version !== "v1") {
    emitNonRepeatableWarning(
      ctx.log,
      dedent`
        ${styles.bold("Update Garden to continue to benefit from Garden Cloud Builder.")}

        Your current Garden version is not supported anymore by Garden Cloud Builder. Please update Garden to the latest version.

        Falling back to ${isInClusterBuildingConfigured ? "in-cluster building" : "building the image locally"}, which may be slower.

        Run ${styles.command("garden self-update")} to update Garden to the latest version.`
    )
    const unsupported: CloudBuilderAvailability = { available: false, reason: "Unsupported client version" }
    cloudBuilderAvailability.set(action.uid, unsupported)
    return unsupported
  }

  // availability is supported
  const availability = res.data.availability
  cloudBuilderAvailability.set(action.uid, availability)

  if (!availability.available) {
    emitNonRepeatableWarning(
      ctx.log,
      dedent`
        ${styles.bold("Garden Cloud Builder is not available.")}

        Falling back to ${isInClusterBuildingConfigured ? "in-cluster building" : "building the image locally"}, which may be slower.

        ${styles.italic(`Reason: ${availability.reason}`)}`
    )
  }

  return availability
}
