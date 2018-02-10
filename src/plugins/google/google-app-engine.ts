import { ServiceStatus } from "../../types/service"
import { join } from "path"
import { GOOGLE_CLOUD_DEFAULT_REGION, GoogleCloudProviderBase } from "./base"
import { ContainerModule } from "../container"
import { dumpYaml } from "../../util"
import { PluginActionParams } from "../../types/plugin"

// TODO: support built-in GAE types (not just custom/flex containers)
export class GoogleAppEngineProvider extends GoogleCloudProviderBase<ContainerModule> {
  name = "google-app-engine"
  supportedModuleTypes = ["container"]

  async getServiceStatus(): Promise<ServiceStatus> {
    // TODO
    // const project = this.getProject(service, env)
    //
    // const appStatus = await this.gcloud(project).json(["app", "describe"])
    // const services = await this.gcloud(project).json(["app", "services", "list"])
    // const instances: any[] = await this.gcloud(project).json(["app", "instances", "list"])

    return {}
  }

  async deployService({ service, serviceContext, env }: PluginActionParams<ContainerModule>["deployService"]) {
    this.context.log.info({
      section: service.name,
      msg: `Deploying app...`,
    })

    const config = service.config

    // prepare app.yaml
    const appYaml: any = {
      runtime: "custom",
      env: "flex",
      env_variables: serviceContext.envVars,
    }

    if (config.healthCheck) {
      if (config.healthCheck.tcpPort || config.healthCheck.command) {
        this.context.log.warn({
          section: service.name,
          msg: "GAE only supports httpGet health checks",
        })
      }
      if (config.healthCheck.httpGet) {
        appYaml.liveness_check = { path: config.healthCheck.httpGet.path }
        appYaml.readiness_check = { path: config.healthCheck.httpGet.path }
      }
    }

    // write app.yaml to build context
    const appYamlPath = join(service.module.path, "app.yaml")
    dumpYaml(appYamlPath, appYaml)

    // deploy to GAE
    const project = this.getProject(service, env)

    await this.gcloud(project).call([
      "app", "deploy", "--quiet",
    ], { cwd: service.module.path })

    this.context.log.info({ section: service.name, msg: `App deployed` })
  }

  async getServiceOutputs({ service, env }: PluginActionParams<ContainerModule>["getServiceOutputs"]) {
    // TODO: we may want to pull this from the service status instead, along with other outputs
    const project = this.getProject(service, env)

    return {
      endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
    }
  }
}
