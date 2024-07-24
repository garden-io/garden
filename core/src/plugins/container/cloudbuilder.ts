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
import { ConfigurationError, InternalError, isErrnoException } from "../../exceptions.js"
import type { ContainerProvider, ContainerProviderConfig } from "./container.js"
import dedent from "dedent"
import { styles } from "../../logger/styles.js"
import type { KubernetesPluginContext } from "../kubernetes/config.js"
import fsExtra from "fs-extra"
const { mkdirp, rm, writeFile, stat } = fsExtra
import { basename, dirname, join } from "path"
import { tmpdir } from "node:os"
import type { CloudBuilderAvailabilityV2, CloudBuilderAvailableV2 } from "../../cloud/api.js"
import { emitNonRepeatableWarning } from "../../warnings.js"
import { LRUCache } from "lru-cache"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../constants.js"
import type { ActionRuntime, ActionRuntimeKind } from "../../plugin/base.js"
import { getCloudDistributionName } from "../../util/cloud.js"
import crypto from "crypto"
import { promisify } from "util"
import AsyncLock from "async-lock"
import { containerHelpers } from "./helpers.js"
import { hashString } from "../../util/util.js"
import { stableStringify } from "../../util/string.js"
import { homedir } from "os"

const generateKeyPair = promisify(crypto.generateKeyPair)

type MtlsKeyPair = {
  privateKeyPem: string
  publicKeyPem: string
}

let _mtlsKeyPair: MtlsKeyPair | undefined
const mtlsKeyPairLock = new AsyncLock()

type CloudBuilderConfiguration = {
  isInClusterBuildingConfigured: boolean
  isCloudBuilderEnabled: boolean
}

// This means that Core will ask Cloud for availability every 5 minutes.
// It might well be that we plan to use Cloud Builder for an action, and then we fall back to building locally.
const cloudBuilderAvailability = new LRUCache<string, CloudBuilderAvailabilityV2>({
  max: 1000,
  // 5 minutes
  ttl: 1000 * 60 * 5,
})

// public API
export const cloudBuilder = {
  isConfigured(ctx: PluginContext) {
    const { isCloudBuilderEnabled } = getConfiguration(ctx)
    return isCloudBuilderEnabled
  },
  /**
   * @returns false if Cloud Builder is not configured or not available, otherwise it returns the availability (a required parameter for withBuilder)
   */
  async getAvailability(
    ctx: PluginContext,
    action: Resolved<ContainerBuildAction>
  ): Promise<CloudBuilderAvailabilityV2> {
    const { isInClusterBuildingConfigured, isCloudBuilderEnabled } = getConfiguration(ctx)

    if (!isCloudBuilderEnabled) {
      return {
        available: false,
        reason: "Cloud Builder is not enabled",
      }
    }

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

    if (ctx.cloudApi.domain === DEFAULT_GARDEN_CLOUD_DOMAIN && ctx.projectId === undefined) {
      throw new InternalError({ message: "Authenticated with community tier, but projectId is undefined" })
    } else if (ctx.projectId === undefined) {
      throw new ConfigurationError({
        message: dedent`Please connect your Garden Project with ${getCloudDistributionName(ctx.cloudApi.domain)}. See also ${styles.link("https://cloud.docs.garden.io/getting-started/first-project")}`,
      })
    }

    const { publicKeyPem } = await getMtlsKeyPair()

    const res = await ctx.cloudApi.registerCloudBuilderBuild({
      organizationId: (await ctx.cloudApi.getProjectById(ctx.projectId)).organization.id,
      actionUid: action.uid,
      actionName: action.name,
      actionVersion: action.getFullVersion().toString(),
      coreSessionId: ctx.sessionId,
      // if platforms are not set, we default to linux/amd64
      platforms: action.getSpec()["platforms"] || ["linux/amd64"],
      mtlsClientPublicKeyPEM: publicKeyPem,
    })

    if (res.data.version !== "v2") {
      emitNonRepeatableWarning(
        ctx.log,
        dedent`
          ${styles.bold("Update Garden to continue to benefit from Garden Cloud Builder.")}

          Your current Garden version is not supported anymore by Garden Cloud Builder. Please update Garden to the latest version.

          Falling back to ${isInClusterBuildingConfigured ? "in-cluster building" : "building the image locally"}, which may be slower.

          Run ${styles.command("garden self-update")} to update Garden to the latest version.`
      )
      const unsupported: CloudBuilderAvailabilityV2 = { available: false, reason: "Unsupported client version" }
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
  },

  getActionRuntime(ctx: PluginContext, availability: CloudBuilderAvailabilityV2): ActionRuntime {
    const { isCloudBuilderEnabled, isInClusterBuildingConfigured } = getConfiguration(ctx)

    const fallback: ActionRuntimeKind = isInClusterBuildingConfigured
      ? // if in-cluster-building is configured, we are building remotely in the plugin.
        {
          kind: "remote",
          type: "plugin",
          pluginName: ctx.provider.name,
        }
      : // Otherwise we fall back to building locally.
        { kind: "local" }

    const preferred: ActionRuntimeKind = isCloudBuilderEnabled
      ? // If cloud builder is configured, we prefer using cloud builder
        {
          kind: "remote",
          type: "garden-cloud",
        }
      : // Otherwise we fall back to in-cluster building or building locally, whatever is configured.
        fallback

    // if cloud builder is configured AND available, that's our actual runtime. Otherwise we fall back to whatever is configured in the plugin.
    const actual = availability.available ? preferred : fallback

    if (actual === preferred) {
      return {
        actual,
      }
    } else {
      if (availability.available) {
        throw new InternalError({
          message: `Inconsistent state: Should only fall back if Cloud Builder is not available`,
        })
      }
      return {
        actual,
        preferred,
        fallbackReason: availability.reason,
      }
    }
  },

  async withBuilder<T>(
    ctx: PluginContext,
    availability: CloudBuilderAvailableV2,
    performBuild: (builder: string) => Promise<T>
  ) {
    const { privateKeyPem } = await getMtlsKeyPair()

    const builder = new BuildxBuilder({
      privateKeyPem,
      clientCertificatePem: availability.buildx.clientCertificatePem,
      endpoints: availability.buildx.endpoints.map(({ platform, mtlsEndpoint, serverCaPem }) => ({
        platform,
        builderUrl: toBuilderUrl(mtlsEndpoint),
        serverCaPem,
      })),
      ctx,
    })

    try {
      ctx.log.debug(`Installing Buildkit builder ${builder.name}`)
      await builder.install()

      return await performBuild(builder.name)
    } finally {
      ctx.log.debug(`Cleaning up ${builder.name}`)

      await builder.clean()
    }
  },
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

async function getMtlsKeyPair(): Promise<MtlsKeyPair> {
  return mtlsKeyPairLock.acquire("generateKeyPair", async () => {
    if (_mtlsKeyPair) {
      return _mtlsKeyPair
    }

    // Docs: https://nodejs.org/api/crypto.html#cryptogeneratekeypairtype-options-callback
    const keyPair = await generateKeyPair("ed25519", {})

    const publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString()
    const privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString()

    _mtlsKeyPair = {
      publicKeyPem,
      privateKeyPem,
    }

    return _mtlsKeyPair
  })
}

function toBuilderUrl(mtlsEndpoint: string): string {
  try {
    const _ = new URL(mtlsEndpoint)
    // If it successfully parses as a URL, it's a URL
    return mtlsEndpoint
  } catch (e) {
    if (e instanceof TypeError) {
      // mtlsEndpoint is just the hostname. let's add protocol and port as well.
      return `tcp://${mtlsEndpoint}:443`
    } else {
      throw e
    }
  }
}

type BuildxEndpoint = {
  platform: string
  builderUrl: string
  serverCaPem: string
}

class BuildxBuilder {
  private static referenceCounter: Record<string, number | undefined> = {}
  private static lock = new AsyncLock()
  private static tmpdir = tmpdir()

  public readonly name: string

  private readonly privateKeyPem: string
  private readonly clientCertificatePem: string
  private readonly endpoints: BuildxEndpoint[]

  private readonly ctx: PluginContext<ContainerProviderConfig>

  constructor({
    ctx,
    ...identityParams
  }: {
    ctx: PluginContext<ContainerProviderConfig>
    privateKeyPem: string
    clientCertificatePem: string
    endpoints: BuildxEndpoint[]
  }) {
    this.name = `garden-cloud-builder-${hashString(stableStringify(identityParams)).substring(0, 8)}`
    this.privateKeyPem = identityParams.privateKeyPem
    this.clientCertificatePem = identityParams.clientCertificatePem
    this.endpoints = identityParams.endpoints

    this.ctx = ctx
  }

  public async clean() {
    return BuildxBuilder.lock.acquire(this.name, async () => {
      const refCount = BuildxBuilder.referenceCounter[this.name] || 0

      try {
        if (refCount === 1) {
          await this.removeBuilder()
          await this.removeTmpdir()
        }
      } finally {
        // even decrease refcount if removal failed
        BuildxBuilder.referenceCounter[this.name] = refCount - 1
      }
    })
  }

  public async install() {
    return BuildxBuilder.lock.acquire(this.name, async () => {
      const refCount = BuildxBuilder.referenceCounter[this.name] || 0
      if (refCount > 0) {
        BuildxBuilder.referenceCounter[this.name] = refCount + 1
        return
      }

      await this.writeCertificates()

      const success = await this.installDirectly()
      if (!success) {
        await this.installUsingCLI()
      }

      // Only increase the refCount by 1 if we successfully completed installation
      BuildxBuilder.referenceCounter[this.name] = 1
    })
  }

  // private: clean

  private async removeTmpdir() {
    this.ctx.log.debug(`Removing ${this.certDir}...`)
    await rm(this.certDir, { recursive: true, force: true })
  }

  private async removeBuilder() {
    try {
      await rm(this.buildxInstanceJsonPath)
    } catch (e) {
      // fall back to docker CLI
      const result = await containerHelpers.dockerCli({
        cwd: this.ctx.projectRoot,
        args: ["buildx", "rm", this.name],
        ctx: this.ctx,
        log: this.ctx.log,
        ignoreError: true,
      })
      this.ctx.log.debug(
        `buildx rm for ${this.name} exited with code ${result.code}${result.all?.length ? ` (output: ${result.all})` : ""}`
      )
    }
  }

  // private: installation

  private get dotDockerDirectory(): string {
    return join(homedir(), ".docker")
  }

  private get buildxInstanceJsonPath(): string {
    return join(this.dotDockerDirectory, `buildx/instances/${this.name}`)
  }

  private get certDir(): string {
    return join(BuildxBuilder.tmpdir, this.name)
  }

  private get clientKeyPath(): string {
    return join(this.certDir, "client-key.pem")
  }

  private get clientCertPath(): string {
    return join(this.certDir, "client-cert.pem")
  }

  private serverCaPath(platform: string): string {
    return join(this.certDir, `server-ca-${platform.replaceAll("/", "-")}.pem`)
  }

  private async writeCertificates() {
    await mkdirp(this.certDir)

    const writePem = async (pemData: string | undefined, fullPath: string): Promise<void> => {
      if (pemData === undefined || pemData.length === 0) {
        throw new InternalError({ message: `Empty pemData for ${basename(fullPath)}` })
      }

      await writeFile(fullPath, pemData)
    }

    await writePem(this.privateKeyPem, this.clientKeyPath)
    await writePem(this.clientCertificatePem, this.clientCertPath)
    for (const { serverCaPem, platform } of this.endpoints) {
      await writePem(serverCaPem, this.serverCaPath(platform))
    }
  }

  private async installDirectly() {
    try {
      const statResult = await stat(dirname(this.buildxInstanceJsonPath))
      if (statResult.isDirectory()) {
        await writeFile(this.buildxInstanceJsonPath, JSON.stringify(this.getBuildxInstanceJson()))
        return true
      }
      return false
    } catch (e) {
      // An error is thrown e.g. if the path does not exist.
      // We don't need to handle this error, as we will fall back to the CLI installation.
      if (isErrnoException(e) && e.code === "ENOENT") {
        this.ctx.log.debug(`Error checking buildx instance path ${this.buildxInstanceJsonPath}: ${e.message}`)
        return false
      }
      throw e
    }
  }

  private getBuildxInstanceJson() {
    return {
      Name: this.name,
      Driver: "remote",
      Nodes: this.endpoints.map(({ platform, builderUrl }) => ({
        Name: platform.replaceAll("/", "-"),
        Endpoint: builderUrl,
        Platforms: null,
        DriverOpts: {
          cacert: this.serverCaPath(platform),
          cert: this.clientCertPath,
          key: this.clientKeyPath,
        },
        Flags: null,
        Files: null,
      })),
      Dynamic: false,
    }
  }

  private async installUsingCLI() {
    for (const [i, { builderUrl, platform }] of this.endpoints.entries()) {
      const result = await containerHelpers.dockerCli({
        cwd: this.certDir,
        args: [
          "buildx",
          "create",
          "--name",
          this.name,
          "--node",
          platform.replaceAll("/", "-"),
          "--driver",
          "remote",
          "--driver-opt",
          `cacert=${this.serverCaPath(platform)},cert=${this.clientCertPath},key=${this.clientKeyPath}`,
          ...(i > 0 ? ["--append"] : []),
          builderUrl,
        ],
        ctx: this.ctx,
        log: this.ctx.log,
      })
      this.ctx.log.debug(
        `buildx create for ${this.name}/${platform} exited with code ${result.code}${result.all?.length ? ` (output: ${result.all})` : ""}`
      )
    }
  }
}
