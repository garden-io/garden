/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess } from "child_process"

import getPort = require("get-port")
const AsyncLock = require("async-lock")
import { V1ContainerPort, V1Deployment, V1PodTemplate, V1Service } from "@kubernetes/client-node"

import { KubernetesProvider, KubernetesPluginContext } from "./config"
import { getAppNamespace } from "./namespace"
import { registerCleanupFunction, sleep } from "../../util/util"
import { PluginContext } from "../../plugin-context"
import { kubectl } from "./kubectl"
import { KubernetesResource, SupportedRuntimeActions } from "./types"
import { ForwardablePort } from "../../types/service"
import { isBuiltIn, matchSelector } from "./util"
import { LogEntry } from "../../logger/log-entry"
import { RuntimeError } from "../../exceptions"
import execa = require("execa")
import { KubernetesDeployAction } from "./kubernetes-type/config"
import { HelmDeployAction } from "./helm/config"
import { DeployAction } from "../../actions/deploy"
import { GetPortForwardResult } from "../../plugin/handlers/Deploy/get-port-forward"
import { Resolved } from "../../actions/types"

// TODO: implement stopPortForward handler

export interface PortForward {
  targetResource: string
  port: number
  localPort: number
  proc: ChildProcess
}

const registeredPortForwards: { [key: string]: PortForward } = {}
const portForwardRegistrationLock = new AsyncLock()

registerCleanupFunction("kill-port-forward-procs", () => {
  for (const { targetResource, port } of Object.values(registeredPortForwards)) {
    killPortForward(targetResource, port)
  }
})

export function killPortForward(targetResource: string, targetPort: number, log?: LogEntry) {
  const key = getPortForwardKey(targetResource, targetPort)
  const fwd = registeredPortForwards[key]
  if (fwd) {
    log?.debug(`Terminating port forward ${key}`)
    const { proc } = fwd
    !proc.killed && proc.kill()
  }
}

export function killPortForwards(action: SupportedRuntimeActions, forwardablePorts: ForwardablePort[], log: LogEntry) {
  for (const port of forwardablePorts) {
    const targetResource = getTargetResourceName(action, port.targetName)
    killPortForward(targetResource, port.targetPort, log)
  }
}

function getPortForwardKey(targetResource: string, port: number) {
  return `${targetResource}:${port}`
}

/**
 * Creates or re-uses an existing tunnel to a Kubernetes resources.
 *
 * We maintain a simple in-process cache of randomly allocated local ports that have been port-forwarded to a
 * given port on a given Kubernetes resource.
 */
export async function getPortForward({
  ctx,
  log,
  namespace,
  targetResource,
  port,
}: {
  ctx: PluginContext
  log: LogEntry
  namespace: string
  targetResource: string
  port: number
}): Promise<PortForward> {
  // Using lock here to avoid concurrency issues (multiple parallel requests for same forward).
  const key = getPortForwardKey(targetResource, port)

  return portForwardRegistrationLock.acquire("register-port-forward", async () => {
    let localPort: number

    const registered = registeredPortForwards[key]

    if (registered && !registered.proc.killed) {
      log.debug(`Reusing local port ${registered.localPort} for ${targetResource}`)
      return registered
    }

    const k8sCtx = <KubernetesPluginContext>ctx

    // Forward random free local port to the remote rsync container.
    localPort = await getPort()
    const portMapping = `${localPort}:${port}`

    log.debug(`Forwarding local port ${localPort} to ${targetResource} port ${port}`)

    // TODO: use the API directly instead of kubectl (need to reverse-engineer kubectl quite a bit for that)
    const { args: portForwardArgs } = kubectl(k8sCtx, k8sCtx.provider).prepareArgs({
      namespace,
      args: ["port-forward", targetResource, portMapping],
      log,
    })

    log.silly(`Running 'kubectl ${portForwardArgs.join(" ")}'`)

    // Need to use execa directly to use its cleanup mechanism, otherwise processes can linger on Windows
    const kubectlPath = await kubectl(k8sCtx, k8sCtx.provider).getPath(log)
    const proc = execa(kubectlPath, portForwardArgs, { cleanup: true, buffer: false })

    let output = ""

    return new Promise((resolve, reject) => {
      let resolved = false

      const portForward = { targetResource, port, proc, localPort }

      proc.on("close", (code) => {
        if (registeredPortForwards[key]) {
          delete registeredPortForwards[key]
        }
        if (!resolved) {
          reject(
            new RuntimeError(`Port forward exited with code ${code} before establishing connection:\n\n${output}`, {
              code,
              portForward,
            })
          )
        }
      })

      proc.on("error", (error) => {
        !proc.killed && proc.kill()
        throw error
      })

      proc.stdout!.on("data", (line) => {
        if (resolved) {
          return
        }

        // This is unfortunately the best indication that we have that the connection is up...
        log.silly(`[${targetResource} port forwarder] ${line}`)
        output += line

        if (line.toString().includes("Forwarding from ")) {
          registeredPortForwards[key] = portForward
          resolved = true
          // Setting a sleep because kubectl returns a bit early sometimes
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          sleep(250).then(() => resolve(portForward))
        }
      })

      proc.stderr!.on("data", (line) => {
        log.silly(`[${targetResource} port forwarder] ${line}`)
        output += line
        // eslint-disable-next-line max-len
        // Following this: https://github.com/nkubala/skaffold/blob/0d52436f792b862e06311c42065afd8e2363771c/pkg/skaffold/kubernetes/portforward/kubectl_forwarder.go#L177
        // Note: It'd be much more robust to avoid kubectl here, but it's more work to implement.
        if (
          line.includes("error forwarding port") ||
          line.includes("unable to forward") ||
          line.includes("error upgrading connection")
        ) {
          // Terminate the forward, which will trigger the Garden proxy to create a new one.
          !proc.killed && proc.kill()
        }
      })
    })
  })
}

export async function getPortForwardHandler(params: {
  ctx: PluginContext
  log: LogEntry
  action: DeployAction
  namespace: string | undefined
  targetName?: string
  targetPort: number
}): Promise<GetPortForwardResult> {
  const { ctx, log, action, targetName, targetPort } = params

  const provider = ctx.provider as KubernetesProvider

  let namespace = params.namespace

  if (!namespace) {
    namespace = await getAppNamespace(ctx, log, provider)
  }

  const targetResource = getTargetResourceName(action, targetName)
  const fwd = await getPortForward({ ctx, log, namespace, targetResource, port: targetPort })

  return {
    hostname: "localhost",
    port: fwd.localPort,
  }
}

function getTargetResourceName(action: SupportedRuntimeActions, targetName?: string) {
  return targetName || `Service/${action.name}`
}

/**
 * Returns a list of forwardable ports based on the specified resources.
 */
export function getForwardablePorts(
  resources: KubernetesResource[],
  parentAction: Resolved<KubernetesDeployAction | HelmDeployAction> | undefined
): ForwardablePort[] {
  const spec = parentAction?.getSpec()

  if (spec?.portForwards) {
    return spec?.portForwards.map((p) => ({
      name: p.name,
      protocol: "TCP",
      targetName: p.resource,
      targetPort: p.targetPort,
      preferredLocalPort: p.localPort,
    }))
  }

  const ports: ForwardablePort[] = []

  // Start by getting ports defined by Service resources
  const services = resources.filter((r) => isBuiltIn(r) && r.kind === "Service") as V1Service[]

  for (const service of services) {
    for (const portSpec of service.spec!.ports || []) {
      ports.push({
        name: portSpec.name,
        // TODO: not sure if/how possible but it would be good to deduce the protocol somehow
        protocol: "TCP",
        targetName: "Service/" + service.metadata!.name,
        targetPort: portSpec.port,
      })
    }
  }

  // Then find ports defined by Deployments and DaemonSets  (omitting ports that Service resources already point to).
  const workloads = resources.filter(
    (r) => (isBuiltIn(r) && r.kind === "Deployment") || r.kind === "DaemonSet"
  ) as V1Deployment[]

  const matchesService = (podTemplate: V1PodTemplate, portSpec: V1ContainerPort) => {
    for (const service of services) {
      if (!matchSelector(service.spec?.selector || {}, podTemplate.metadata?.labels || {})) {
        continue
      }

      for (const servicePort of service.spec?.ports || []) {
        const serviceTargetPort = (servicePort.targetPort as any) as number

        if (serviceTargetPort && serviceTargetPort === portSpec.containerPort) {
          return true
        }
      }
    }
    return false
  }

  for (const workload of workloads) {
    const podTemplate = workload.spec!.template
    const containers = podTemplate.spec?.containers || []
    const portSpecs = containers.flatMap((c) => c.ports || [])

    for (const portSpec of portSpecs) {
      if (matchesService(podTemplate, portSpec)) {
        continue
      }

      ports.push({
        name: portSpec.name,
        protocol: "TCP",
        targetName: `${workload.kind!}/${workload.metadata!.name}`,
        targetPort: portSpec.containerPort,
      })
    }
  }

  return ports
}
