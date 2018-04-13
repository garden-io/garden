/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployServiceParams } from "../../types/plugin"
import {
  ContainerModule,
  ContainerService,
  ContainerServiceConfig,
} from "../container"
import { toPairs, extend } from "lodash"
import {
  ServiceContext,
  ServiceStatus,
} from "../../types/service"
import {
  createIngress,
  getServiceHostname,
} from "./ingress"
import { apply } from "./kubectl"
import { getAppNamespace } from "./namespace"
import { createServices } from "./service"
import {
  checkDeploymentStatus,
  waitForDeployment,
} from "./status"

const DEFAULT_CPU_REQUEST = 0.01
const DEFAULT_CPU_LIMIT = 0.5
const DEFAULT_MEMORY_REQUEST = 128
const DEFAULT_MEMORY_LIMIT = 512

interface KubeEnvVar {
  name: string
  value?: string
  valueFrom?: { fieldRef: { fieldPath: string } }
}

export async function deployService(
  { ctx, service, env, serviceContext, exposePorts = false, logEntry }: DeployServiceParams<ContainerModule>,
): Promise<ServiceStatus> {
  const namespace = getAppNamespace(ctx, env)

  const deployment = await createDeployment(service, serviceContext, exposePorts)
  await apply(deployment, { namespace })

  // TODO: automatically clean up Services and Ingresses if they should no longer exist

  const kubeservices = await createServices(service, exposePorts)

  for (let kubeservice of kubeservices) {
    await apply(kubeservice, { namespace })
  }

  const ingress = await createIngress(service, getServiceHostname(ctx, service))

  if (ingress !== null) {
    await apply(ingress, { namespace })
  }

  await waitForDeployment({ ctx, service, logEntry, env })

  return checkDeploymentStatus({ ctx, service, env })
}

export async function createDeployment(
  service: ContainerService, serviceContext: ServiceContext, exposePorts: boolean,
) {
  const config: ContainerServiceConfig = service.config
  // TODO: support specifying replica count
  const configuredReplicas = 1 // service.config.count[env.name] || 1

  // TODO: moar type-safety
  const deployment: any = {
    kind: "Deployment",
    apiVersion: "extensions/v1beta1",
    metadata: {
      name: "",
      annotations: {
        "garden.io/generated": "true",
        "garden.io/version": await service.module.getVersion(),
        // we can use this to avoid overriding the replica count if it has been manually scaled
        "garden.io/configured.replicas": configuredReplicas,
      },
    },
    spec: {
      selector: {
        matchLabels: {
          service: "",
        },
      },
      template: {
        metadata: {
          labels: [],
        },
        spec: {
          containers: [],
          // TODO: make restartPolicy configurable
          restartPolicy: "Always",
          terminationGracePeriodSeconds: 10,
          dnsPolicy: "ClusterFirst",
          // TODO: support private registries
          // imagePullSecrets: [
          //   { name: DOCKER_AUTH_SECRET_NAME },
          // ],
        },
      },
    },
  }

  const envVars = extend({}, serviceContext.envVars)

  const labels = {
    // tier: service.tier,
    module: service.module.name,
    service: service.name,
  }

  const env: KubeEnvVar[] = toPairs(envVars).map(([name, value]) => ({ name, value: value + "" }))

  // expose some metadata to the container
  env.push({
    name: "GARDEN_VERSION",
    value: await service.module.getVersion(),
  })

  env.push({
    name: "POD_NAME",
    valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
  })

  env.push({
    name: "POD_NAMESPACE",
    valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } },
  })

  env.push({
    name: "POD_IP",
    valueFrom: { fieldRef: { fieldPath: "status.podIP" } },
  })

  const container: any = {
    args: service.config.command || [],
    name: service.name,
    image: await service.module.getImageId(),
    env,
    ports: [],
    // TODO: make these configurable
    resources: {
      requests: {
        cpu: DEFAULT_CPU_REQUEST.toString(),
        memory: DEFAULT_MEMORY_REQUEST + "Mi",
      },
      limits: {
        cpu: DEFAULT_CPU_LIMIT.toString(),
        memory: DEFAULT_MEMORY_LIMIT + "Mi",
      },
    },
    imagePullPolicy: "IfNotPresent",
  }

  // if (config.entrypoint) {
  //   container.command = [config.entrypoint]
  // }

  if (config.healthCheck) {
    container.readinessProbe = {
      initialDelaySeconds: 10,
      periodSeconds: 5,
      timeoutSeconds: 3,
      successThreshold: 2,
      failureThreshold: 5,
    }

    container.livenessProbe = {
      initialDelaySeconds: 15,
      periodSeconds: 5,
      timeoutSeconds: 3,
      successThreshold: 1,
      failureThreshold: 3,
    }

    if (config.healthCheck.httpGet) {
      const httpGet: any = extend({}, config.healthCheck.httpGet)
      httpGet.port = config.ports[httpGet.port].containerPort

      container.readinessProbe.httpGet = httpGet
      container.livenessProbe.httpGet = httpGet
    } else if (config.healthCheck.command) {
      container.readinessProbe.exec = { command: config.healthCheck.command.map(s => s.toString()) }
      container.livenessProbe.exec = container.readinessProbe.exec
    } else if (config.healthCheck.tcpPort) {
      container.readinessProbe.tcpSocket = {
        port: config.ports[config.healthCheck.tcpPort].containerPort,
      }
      container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket
    } else {
      throw new Error("Must specify type of health check when configuring health check.")
    }
  }

  // if (service.privileged) {
  //   container.securityContext = {
  //     privileged: true,
  //   }
  // }

  deployment.metadata = {
    name: service.name,
    labels,
  }

  deployment.spec.selector.matchLabels = { service: service.name }
  deployment.spec.template.metadata.labels = labels

  if (config.volumes && config.volumes.length) {
    const volumes: any[] = []
    const volumeMounts: any[] = []

    for (const volume of config.volumes) {
      const volumeName = volume.name
      const volumeType = !!volume.hostPath ? "hostPath" : "emptyDir"

      if (!volumeName) {
        throw new Error("Must specify volume name")
      }

      if (volumeType === "emptyDir") {
        volumes.push({
          name: volumeName,
          emptyDir: {},
        })
        volumeMounts.push({
          name: volumeName,
          mountPath: volume.containerPath,
        })
      } else if (volumeType === "hostPath") {
        volumes.push({
          name: volumeName,
          hostPath: {
            path: volume.hostPath,
          },
        })
        volumeMounts.push({
          name: volumeName,
          mountPath: volume.containerPath || volume.hostPath,
        })
      } else {
        throw new Error("Unsupported volume type: " + volumeType)
      }
    }

    deployment.spec.template.spec.volumes = volumes
    container.volumeMounts = volumeMounts
  }

  const ports = Object.values(config.ports)

  for (const port of ports) {
    container.ports.push({
      protocol: port.protocol,
      containerPort: port.containerPort,
    })
  }

  if (config.daemon) {
    // this runs a pod on every node
    deployment.kind = "DaemonSet"
    deployment.spec.updateStrategy = {
      type: "RollingUpdate",
    }

    if (exposePorts) {
      for (const port of ports.filter(p => p.hostPort)) {
        // For daemons we can expose host ports directly on the Pod, as opposed to only via the Service resource.
        // This allows us to choose any port.
        // TODO: validate that conflicting ports are not defined.
        container.ports.push({
          protocol: port.protocol,
          containerPort: port.containerPort,
          hostPort: port.hostPort,
        })
      }
    }

  } else {
    deployment.spec.replicas = configuredReplicas
    deployment.spec.strategy = {
      type: "RollingUpdate",
      rollingUpdate: {
        maxUnavailable: "34%",
        maxSurge: "34%",
      },
    }
    deployment.spec.revisionHistoryLimit = 3
  }

  deployment.spec.template.spec.containers = [container]

  return deployment
}
