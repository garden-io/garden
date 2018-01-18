import * as Docker from "dockerode"
import { Memoize } from "typescript-memoize"
import { DeploymentError } from "../../exceptions"
import { Plugin } from "../../types/plugin"
import { ContainerModule } from "../../moduleHandlers/container"
import { sortBy } from "lodash"
import { Environment } from "../../types/common"
import { sleep } from "../../util"
import { Module } from "../../types/module"
import { Service, ServiceStatus } from "../../types/service"

// should this be configurable and/or global across providers?
const DEPLOY_TIMEOUT = 30000

// TODO: Support namespacing
export class LocalDockerSwarmBase<T extends Module> extends Plugin<T> {
  name = "local-docker-swarm"
  supportedModuleTypes = ["container"]

  @Memoize()
  protected getDocker() {
    return new Docker()
  }

  async getEnvironmentStatus() {
    const docker = this.getDocker()

    try {
      await docker.swarmInspect()

      return {
        configured: true,
      }
    } catch (err) {
      if (err.statusCode === 503) {
        // swarm has not been initialized
        return {
          configured: false,
          services: [],
        }
      } else {
        throw err
      }
    }
  }

  async getServiceStatus(service: Service<ContainerModule>): Promise<ServiceStatus> {
    const docker = this.getDocker()
    const swarmService = docker.getService(service.name)
    const swarmServiceStatus = await swarmService.inspect()

    const image = swarmServiceStatus.Spec.TaskTemplate.ContainerSpec.Image
    const version = image.split(":")[1]

    const { lastState, lastError } = await this.getServiceState(service.name)

    return {
      providerId: swarmServiceStatus.ID,
      version,
      runningReplicas: swarmServiceStatus.Spec.Mode.Replicated.Replicas,
      state: lastState,
      lastError,
      createdAt: swarmServiceStatus.CreatedAt,
      updatedAt: swarmServiceStatus.UpdatedAt,
    }
  }

  async configureEnvironment() {
    const status = await this.getEnvironmentStatus()

    if (!status.configured) {
      await this.getDocker().swarmInit({})
    }

    return await this.getEnvironmentStatus()
  }

  async deployService(service: Service<ContainerModule>, env: Environment) {
    await this.configureEnvironment()
    const version = await service.module.getVersion()

    this.context.log.info(service.name, `Deploying version ${version}`)

    const identifier = await service.module.getImageId()
    const ports = service.config.ports.map(p => ({
      Protocol: p.protocol ? p.protocol.toLowerCase() : "tcp",
      TargetPort: p.container,
    }))

    const opts: any = {
      Name: service.name,
      Labels: {
        environment: env.name,
        namespace: env.namespace,
        provider: this.name,
      },
      TaskTemplate: {
        ContainerSpec: {
          Image: identifier,
        },
        Resources: {
          Limits: {},
          Reservations: {},
        },
        RestartPolicy: {},
        Placement: {},
      },
      Mode: {
        Replicated: {
          Replicas: 1,
        },
      },
      UpdateConfig: {
        Parallelism: 1,
      },
      EndpointSpec: {
        ExposedPorts: ports,
      },
    }

    const docker = this.getDocker()
    const serviceStatus = await this.getServiceStatus(service)
    const swarmService = await docker.getService(serviceStatus.providerId || service.name)

    if (swarmService) {
      const swarmServiceStatus = await swarmService.inspect()
      opts.version = parseInt(swarmServiceStatus.Version.Index, 10)
      this.context.log.verbose(
        service.name,
        `Updating existing Swarm service (version ${opts.version})`,
      )
      await swarmService.update(opts)
    } else {
      this.context.log.verbose(service.name, `Creating new Swarm service`)
      await docker.createService(opts)
    }

    // Wait for service to be ready
    const start = new Date().getTime()

    while (true) {
      await sleep(1000)

      const { lastState, lastError } = await this.getServiceState(service.name)

      if (lastError) {
        throw new DeploymentError(`Service ${service.name} ${lastState}: ${lastError}`, {
          service,
          state: lastState,
          error: lastError,
        })
      }

      if (lastState === "ready") {
        break
      }

      if (new Date().getTime() - start > DEPLOY_TIMEOUT * 1000) {
        throw new DeploymentError(`Timed out deploying ${service.name} (status: ${lastState}`, {
          service,
          state: lastState,
        })
      }
    }

    this.context.log.info(service.name, `Ready`)

    return this.getServiceStatus(service)
  }

  private async getServiceState(serviceName: string) {
    let tasks = await this.getDocker().listTasks({ Service: serviceName })
    tasks = sortBy(tasks, ["CreatedAt"]).reverse()

    let lastState = null
    let lastError = null

    if (tasks[0]) {
      lastState = tasks[0].Status.State
      lastError = tasks[0].Status.Err || null
    }

    return { lastState, lastError }
  }
}

export class LocalDockerSwarmProvider extends LocalDockerSwarmBase<ContainerModule> { }
