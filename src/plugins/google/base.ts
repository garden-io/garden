import { Environment } from "../../types/common"
import { Module, ModuleConfig } from "../../types/module"
import { Service, ServiceConfig } from "../../types/service"
import { ConfigurationError } from "../../exceptions"
import { Memoize } from "typescript-memoize"
import { GCloud } from "./gcloud"
import { values } from "lodash"
import { ConfigureEnvironmentParams, Plugin } from "../../types/plugin"

export const GOOGLE_CLOUD_DEFAULT_REGION = "us-central1"

export interface GoogleCloudServiceConfig extends ServiceConfig {
  project?: string
}

interface GoogleCloudModuleConfig extends ModuleConfig<GoogleCloudServiceConfig> { }

export abstract class GoogleCloudModule extends Module<GoogleCloudModuleConfig> { }

export abstract class GoogleCloudProviderBase<T extends GoogleCloudModule> implements Plugin<T> {
  abstract name: string
  abstract supportedModuleTypes: string[]

  async getEnvironmentStatus() {
    let sdkInfo

    const output = {
      configured: true,
      detail: {
        sdkInstalled: true,
        sdkInitialized: true,
        betaComponentsInstalled: true,
        sdkInfo: {},
      },
    }

    try {
      sdkInfo = output.detail.sdkInfo = await this.gcloud().json(["info"])
    } catch (err) {
      output.configured = false
      output.detail.sdkInstalled = false
    }

    if (!sdkInfo.config.account) {
      output.configured = false
      output.detail.sdkInitialized = false
    }

    if (!sdkInfo.installation.components.beta) {
      output.configured = false
      output.detail.betaComponentsInstalled = false
    }

    return output
  }

  async configureEnvironment({ ctx }: ConfigureEnvironmentParams) {
    const status = await this.getEnvironmentStatus()

    if (!status.detail.sdkInstalled) {
      throw new ConfigurationError(
        "Google Cloud SDK is not installed. " +
        "Please visit https://cloud.google.com/sdk/downloads for installation instructions.",
        {},
      )
    }

    if (!status.detail.betaComponentsInstalled) {
      ctx.log.info({
        section: "google-cloud-functions",
        msg: `Installing gcloud SDK beta components...`,
      })
      await this.gcloud().call(["components update"])
      await this.gcloud().call(["components install beta"])
    }

    if (!status.detail.sdkInitialized) {
      ctx.log.info({
        section: "google-cloud-functions",
        msg: `Initializing SDK...`,
      })
      await this.gcloud().tty(["init"], { silent: false })
    }
  }

  @Memoize()
  protected gcloud(project?: string, account?: string) {
    return new GCloud({ project, account })
  }

  protected getProject(service: Service<T>, env: Environment) {
    // TODO: this is very contrived - we should rethink this a bit and pass
    // provider configuration when calling the plugin
    const providerConfig = values(env.config.providers).filter(p => p.type === this.name)[0]
    return service.config.project || providerConfig["default-project"] || null
  }
}
