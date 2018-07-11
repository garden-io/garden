/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployServiceParams, GetServiceStatusParams } from "../../types/plugin/params"
import {
  helpers,
  ContainerModule,
  ContainerService,
  ServiceEndpointSpec,
} from "../container"
import {
  toPairs,
  extend,
  keyBy,
  set,
} from "lodash"
import { RuntimeContext, ServiceStatus, ServiceProtocol } from "../../types/service"
import { createIngress, getServiceHostname } from "./ingress"
import { createServices } from "./service"
import { waitForObjects, compareDeployedObjects } from "./status"
import { applyMany } from "./kubectl"
import { getAppNamespace } from "./namespace"
import { KubernetesObject } from "./helm"
import { PluginContext } from "../../plugin-context"
import { KubernetesProvider } from "./kubernetes"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"

const DEFAULT_CPU_REQUEST = "10m"
const DEFAULT_CPU_LIMIT = "500m"
const DEFAULT_MEMORY_REQUEST = 128
const DEFAULT_MEMORY_LIMIT = 512

interface KubeEnvVar {
  name: string
  value?: string
  valueFrom?: { fieldRef: { fieldPath: string } }
}

export async function getContainerServiceStatus(
  { ctx, provider, module, service, runtimeContext }: GetServiceStatusParams<ContainerModule>,
): Promise<ServiceStatus> {
  // TODO: hash and compare all the configuration files (otherwise internal changes don't get deployed)
  const version = await module.getVersion()
  const objects = await createContainerObjects(ctx, provider, service, runtimeContext)
  const matched = await compareDeployedObjects(ctx, provider, objects)
  const hostname = getServiceHostname(ctx, provider, service)

  const endpoints = service.spec.endpoints.map((e: ServiceEndpointSpec) => {
    // TODO: this should be HTTPS, once we've set up TLS termination at the ingress controller level
    const protocol: ServiceProtocol = "http"
    const ingressPort = provider.config.ingressPort

    return {
      protocol,
      hostname,
      port: ingressPort,
      url: `${protocol}://${hostname}:${ingressPort}`,
      paths: e.paths,
    }
  })

  return {
    endpoints,
    state: matched ? "ready" : "outdated",
    version: matched ? version.versionString : undefined,
  }
}

export async function deployContainerService(params: DeployServiceParams<ContainerModule>): Promise<ServiceStatus> {
  const { ctx, provider, service, runtimeContext, force, logEntry } = params

  const namespace = await getAppNamespace(ctx, provider)
  const objects = await createContainerObjects(ctx, provider, service, runtimeContext)

  // TODO: use Helm instead of kubectl apply
  const pruneSelector = "service=" + service.name
  await applyMany(provider.config.context, objects, { force, namespace, pruneSelector })
  await waitForObjects({ ctx, provider, service, objects, logEntry })

  return getContainerServiceStatus(params)
}

export async function createContainerObjects(
  ctx: PluginContext, provider: KubernetesProvider, service: ContainerService, runtimeContext: RuntimeContext,
) {
  const version = await service.module.getVersion()
  const namespace = await getAppNamespace(ctx, provider)
  const deployment = await createDeployment(service, runtimeContext, namespace)
  const kubeservices = await createServices(service, namespace)

  const objects = [deployment, ...kubeservices]

  const ingress = await createIngress(ctx, provider, service)

  if (ingress !== null) {
    objects.push(ingress)
  }

  return objects.map(obj => {
    set(obj, ["metadata", "annotations", "garden.io/generated"], "true")
    set(obj, ["metadata", "annotations", GARDEN_ANNOTATION_KEYS_VERSION], version.versionString)
    set(obj, ["metadata", "labels", "module"], service.module.name)
    set(obj, ["metadata", "labels", "service"], service.name)
    return obj
  })
}

export async function createDeployment(
  service: ContainerService, runtimeContext: RuntimeContext, namespace: string,
): Promise<KubernetesObject> {
  const spec = service.spec
  // TODO: support specifying replica count
  const configuredReplicas = 1 // service.spec.count[env.name] || 1

  const labels = {
    module: service.module.name,
    service: service.name,
  }

  // TODO: moar type-safety
  const deployment: any = {
    kind: "Deployment",
    apiVersion: "extensions/v1beta1",
    metadata: {
      name: service.name,
      annotations: {
        // we can use this to avoid overriding the replica count if it has been manually scaled
        "garden.io/configured.replicas": configuredReplicas.toString(),
      },
      namespace,
      labels,
    },
    spec: {
      selector: {
        matchLabels: {
          service: service.name,
        },
      },
      template: {
        metadata: {
          labels,
        },
        spec: {
          // TODO: set this for non-system pods
          // automountServiceAccountToken: false,  // this prevents the pod from accessing the kubernetes API
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

  const envVars = { ...runtimeContext.envVars, ...service.spec.env }

  const env: KubeEnvVar[] = toPairs(envVars).map(([name, value]) => ({ name, value: value + "" }))

  // expose some metadata to the container
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
    name: service.name,
    image: await helpers.getLocalImageId(service.module),
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

  if (service.spec.command && service.spec.command.length > 0) {
    container.args = service.spec.command
  }

  // if (config.entrypoint) {
  //   container.command = [config.entrypoint]
  // }

  if (spec.healthCheck) {
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

    const portsByName = keyBy(spec.ports, "name")

    if (spec.healthCheck.httpGet) {
      const httpGet: any = extend({}, spec.healthCheck.httpGet)
      httpGet.port = portsByName[httpGet.port].containerPort

      container.readinessProbe.httpGet = httpGet
      container.livenessProbe.httpGet = httpGet
    } else if (spec.healthCheck.command) {
      container.readinessProbe.exec = { command: spec.healthCheck.command.map(s => s.toString()) }
      container.livenessProbe.exec = container.readinessProbe.exec
    } else if (spec.healthCheck.tcpPort) {
      container.readinessProbe.tcpSocket = {
        port: portsByName[spec.healthCheck.tcpPort].containerPort,
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

  if (spec.volumes && spec.volumes.length) {
    const volumes: any[] = []
    const volumeMounts: any[] = []

    for (const volume of spec.volumes) {
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

  const ports = spec.ports

  for (const port of ports) {
    container.ports.push({
      protocol: port.protocol,
      containerPort: port.containerPort,
    })
  }

  if (spec.daemon) {
    // this runs a pod on every node
    deployment.kind = "DaemonSet"
    deployment.spec.updateStrategy = {
      type: "RollingUpdate",
    }

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
