/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Docker from "dockerode"
import { exec } from "child-process-promise"
import { DeploymentError } from "../../exceptions"
import { PluginContext } from "../../plugin-context"
import {
  GardenPlugin,
} from "../../types/plugin/plugin"
import {
  DeployServiceParams,
  ExecInServiceParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
} from "../../types/plugin/params"
import {
  helpers,
  ContainerModule,
} from "../container"
import {
  map,
  sortBy,
} from "lodash"
import { sleep } from "../../util/util"
import { ServiceState, ServiceStatus } from "../../types/service"

// should this be configurable and/or global across providers?
const DEPLOY_TIMEOUT = 30

const pluginName = "local-docker-swarm"

export const gardenPlugin = (): GardenPlugin => ({
  actions: {
    getEnvironmentStatus,
    prepareEnvironment,
  },
  moduleActions: {
    container: {
      getServiceStatus,

      async deployService(
        { ctx, module, service, runtimeContext, log, buildDependencies }: DeployServiceParams<ContainerModule>,
      ) {
        // TODO: split this method up and test
        const { versionString } = service.module.version

        log.info({ section: service.name, msg: `Deploying version ${versionString}` })

        const identifier = await helpers.getLocalImageId(module)
        const ports = service.spec.ports.map(p => {
          const port: any = {
            Protocol: p.protocol ? p.protocol.toLowerCase() : "tcp",
            TargetPort: p.containerPort,
          }

          if (p.hostPort) {
            port.PublishedPort = p.servicePort
          }
        })

        const envVars = map({ ...runtimeContext.envVars, ...service.spec.env }, (v, k) => `${k}=${v}`)

        const volumeMounts = service.spec.volumes.map(v => {
          // TODO-LOW: Support named volumes
          if (v.hostPath) {
            return {
              Type: "bind",
              Source: v.hostPath,
              Target: v.containerPath,
            }
          } else {
            return {
              Type: "tmpfs",
              Target: v.containerPath,
            }
          }
        })

        const opts: any = {
          Name: getSwarmServiceName(ctx, service.name),
          Labels: {
            environment: ctx.environment.name,
            provider: pluginName,
          },
          TaskTemplate: {
            ContainerSpec: {
              Image: identifier,
              Command: service.spec.command,
              Env: envVars,
              Mounts: volumeMounts,
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
          IngressSpec: {
            Ports: ports,
          },
        }

        const docker = getDocker()
        const serviceStatus = await getServiceStatus({
          ctx,
          service,
          module,
          runtimeContext,
          log,
          buildDependencies,
        })
        let swarmServiceStatus
        let serviceId

        if (serviceStatus.providerId) {
          const swarmService = await docker.getService(serviceStatus.providerId)
          swarmServiceStatus = await swarmService.inspect()
          opts.version = parseInt(swarmServiceStatus.Version.Index, 10)
          log.verbose({
            section: service.name,
            msg: `Updating existing Swarm service (version ${opts.version})`,
          })
          await swarmService.update(opts)
          serviceId = serviceStatus.providerId
        } else {
          log.verbose({
            section: service.name,
            msg: `Creating new Swarm service`,
          })
          const swarmService = await docker.createService(opts)
          serviceId = swarmService.ID
        }

        // Wait for service to be ready
        const start = new Date().getTime()

        while (true) {
          await sleep(1000)

          const { lastState, lastError } = await getServiceState(serviceId)

          if (lastError) {
            throw new DeploymentError(`Service ${service.name} ${lastState}: ${lastError}`, {
              service,
              state: lastState,
              error: lastError,
            })
          }

          if (mapContainerState(lastState) === "ready") {
            break
          }

          if (new Date().getTime() - start > DEPLOY_TIMEOUT * 1000) {
            throw new DeploymentError(`Timed out deploying ${service.name} (status: ${lastState}`, {
              service,
              state: lastState,
            })
          }
        }

        log.info({
          section: service.name,
          msg: `Ready`,
        })

        return getServiceStatus({ ctx, module, service, runtimeContext, log, buildDependencies })
      },

      async getServiceOutputs({ ctx, service }: GetServiceOutputsParams<ContainerModule>) {
        return {
          host: getSwarmServiceName(ctx, service.name),
        }
      },

      async execInService(
        { ctx, service, command, runtimeContext, log, buildDependencies }: ExecInServiceParams<ContainerModule>,
      ) {
        const status = await getServiceStatus({
          ctx,
          service,
          module: service.module,
          runtimeContext,
          log,
          buildDependencies,
        })

        if (!status.state || status.state !== "ready") {
          throw new DeploymentError(`Service ${service.name} is not running`, {
            name: service.name,
            state: status.state,
          })
        }

        // This is ugly, but dockerode doesn't have this, or at least it's too cumbersome to implement.
        const swarmServiceName = getSwarmServiceName(ctx, service.name)
        const servicePsCommand = [
          "docker", "service", "ps",
          "-f", `'name=${swarmServiceName}.1'`,
          "-f", `'desired-state=running'`,
          swarmServiceName,
          "-q",
        ]
        let res = await exec(servicePsCommand.join(" "))
        const serviceContainerId = `${swarmServiceName}.1.${res.stdout.trim()}`

        const execCommand = ["docker", "exec", serviceContainerId, ...command]
        res = await exec(execCommand.join(" "))

        return { code: 0, output: "", stdout: res.stdout, stderr: res.stderr }
      },
    },
  },
})

async function getEnvironmentStatus() {
  const docker = getDocker()

  try {
    await docker.swarmInspect()

    return {
      ready: true,
    }
  } catch (err) {
    if (err.statusCode === 503) {
      // swarm has not been initialized
      return {
        ready: false,
        services: [],
      }
    } else {
      throw err
    }
  }
}

async function prepareEnvironment() {
  await getDocker().swarmInit({})
  return {}
}

async function getServiceStatus({ ctx, service }: GetServiceStatusParams<ContainerModule>): Promise<ServiceStatus> {
  const docker = getDocker()
  const swarmServiceName = getSwarmServiceName(ctx, service.name)
  const swarmService = docker.getService(swarmServiceName)

  let swarmServiceStatus

  try {
    swarmServiceStatus = await swarmService.inspect()
  } catch (err) {
    if (err.statusCode === 404) {
      // service does not exist
      return {}
    } else {
      throw err
    }
  }

  const image = swarmServiceStatus.Spec.TaskTemplate.ContainerSpec.Image
  const version = image.split(":")[1]

  const { lastState, lastError } = await getServiceState(swarmServiceStatus.ID)

  return {
    providerId: swarmServiceStatus.ID,
    version,
    runningReplicas: swarmServiceStatus.Spec.Mode.Replicated.Replicas,
    state: mapContainerState(lastState),
    lastError: lastError || undefined,
    createdAt: swarmServiceStatus.CreatedAt,
    updatedAt: swarmServiceStatus.UpdatedAt,
  }
}

function getDocker() {
  return new Docker()
}

// see schema in https://docs.docker.com/engine/api/v1.35/#operation/TaskList
const taskStateMap: { [key: string]: ServiceState } = {
  new: "deploying",
  allocated: "deploying",
  pending: "deploying",
  assigned: "deploying",
  accepted: "deploying",
  preparing: "deploying",
  starting: "deploying",
  running: "ready",
  ready: "ready",
  complete: "stopped",
  shutdown: "stopped",
  failed: "unhealthy",
  rejected: "unhealthy",
}

function mapContainerState(lastState: string | undefined): ServiceState | undefined {
  return lastState ? taskStateMap[lastState] : undefined
}

function getSwarmServiceName(ctx: PluginContext, serviceName: string) {
  return `${ctx.projectName}--${serviceName}`
}

async function getServiceTask(serviceId: string) {
  let tasks = await getDocker().listTasks({
    // Service: this.getSwarmServiceName(service.name),
  })
  // For whatever (presumably totally reasonable) reason, the filter option above does not work.
  tasks = tasks.filter(t => t.ServiceID === serviceId)
  tasks = sortBy(tasks, ["CreatedAt"]).reverse()

  return tasks[0]
}

async function getServiceState(serviceId: string) {
  const task = await getServiceTask(serviceId)

  let lastState
  let lastError

  if (task) {
    lastState = task.Status.State
    lastError = task.Status.Err || null
  }

  return { lastState, lastError }
}
