import { ContainerService } from "../../moduleHandlers/container"
import { toPairs } from "lodash"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"

const DEFAULT_CPU_REQUEST = 0.01
const DEFAULT_CPU_LIMIT = 0.5
const DEFAULT_MEMORY_REQUEST = 128
const DEFAULT_MEMORY_LIMIT = 512

interface KubeEnvVar {
  name: string
  value?: string
  valueFrom?: { fieldRef: { fieldPath: string } }
}

export async function createDeployment(service: ContainerService, exposePorts: boolean) {
  const configuredReplicas =  1 // service.config.count[env.name] || 1

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

  // TODO: pass in environment variables
  const envVars = {}
  // const envVars = _.extend({}, await this.getEnvVars(), service.env)

  const labels = {
    // tier: service.tier,
    module: service.module.name,
    service: service.name,
  }

  const env: KubeEnvVar[] = toPairs(envVars).map(([name, value]) => ({ name, value: value + "" }))

  // expose some metadata to the container
  env.push({
    // TODO: rename this variable
    name: "GIT_HASH",
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

  if (service.config.entrypoint) {
    container.command = [service.config.entrypoint]
  }

  // TODO: support healthchecks
  // if (service.healthCheck) {
  //   container.readinessProbe = {
  //     initialDelaySeconds: 10,
  //     periodSeconds: 5,
  //     timeoutSeconds: 3,
  //     successThreshold: 2,
  //     failureThreshold: 5,
  //   }
  //
  //   container.livenessProbe = {
  //     initialDelaySeconds: 15,
  //     periodSeconds: 5,
  //     timeoutSeconds: 3,
  //     successThreshold: 1,
  //     failureThreshold: 3,
  //   }
  //
  //   if (service.healthCheck.httpGet) {
  //     container.readinessProbe.httpGet = service.healthCheck.httpGet
  //     container.livenessProbe.httpGet = container.readinessProbe.httpGet
  //   } else if (service.healthCheck.command) {
  //     container.readinessProbe.exec = { command: service.healthCheck.command.map(s => s.toString()) }
  //     container.livenessProbe.exec = container.readinessProbe.exec
  //   } else if (service.healthCheck.tcpPort) {
  //     container.readinessProbe.tcpSocket = { port: service.healthCheck.tcpPort }
  //     container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket
  //   } else {
  //     throw new Error("Must specify type of health check when configuring health check.")
  //   }
  // }
  //
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

  // TODO: support volumes
  // if (service.volumes && service.volumes.length) {
  //   const volumes: any[] = []
  //   const volumeMounts: any[] = []
  //
  //   for (let volume of service.volumes) {
  //     const volumeName = volume.name
  //     const volumeType = volume.type || "hostPath"
  //
  //     if (!volumeName) {
  //       throw new Error("Must specify volume name")
  //     }
  //
  //     if (volumeType === "emptyDir") {
  //       volumes.push({
  //         name: volumeName,
  //         emptyDir: {},
  //       })
  //       volumeMounts.push({
  //         name: volumeName,
  //         mountPath: volume.mountPath,
  //       })
  //     } else if (volumeType === "hostPath") {
  //       volumes.push({
  //         name: volumeName,
  //         hostPath: {
  //           path: volume.hostPath,
  //         },
  //       })
  //       volumeMounts.push({
  //         name: volumeName,
  //         mountPath: volume.mountPath || volume.hostPath,
  //       })
  //     } else {
  //       throw new Error("Unsupported volume type: " + volume.type)
  //     }
  //   }
  //
  //   deployment.spec.template.spec.volumes = volumes
  //   container.volumeMounts = volumeMounts
  // }

  if (service.config.daemon === true) {
    // this runs a pod on every node
    deployment.kind = "DaemonSet"
    deployment.spec.updateStrategy = {
      type: "RollingUpdate",
    }

    if (exposePorts) {
      for (let port of service.config.ports.filter(p => p.hostPort)) {
        // For daemons we can expose host ports directly on the Pod, as opposed to only via the Service resource.
        // This allows us to choose any port.
        // TODO: validate that conflicting ports are not defined.
        container.ports.push({
          protocol: port.protocol || DEFAULT_PORT_PROTOCOL,
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
