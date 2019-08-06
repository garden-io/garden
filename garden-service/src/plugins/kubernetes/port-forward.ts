/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess } from "child_process"

import getPort = require("get-port")
const AsyncLock = require("async-lock")
import { V1Service } from "@kubernetes/client-node"

import { GetPortForwardParams, GetPortForwardResult } from "../../types/plugin/service/getPortForward"
import { KubernetesProvider, KubernetesPluginContext } from "./config"
import { getAppNamespace } from "./namespace"
import { registerCleanupFunction } from "../../util/util"
import { PluginContext } from "../../plugin-context"
import { kubectl } from "./kubectl"
import { KubernetesResource } from "./types"
import { ForwardablePort } from "../../types/service"
import { isBuiltIn } from "./util"
import { LogEntry } from "../../logger/log-entry"

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

export function killPortForward(targetResource: string, port: number) {
  const key = getPortForwardKey(targetResource, port)
  const fwd = registeredPortForwards[key]
  if (fwd) {
    const { proc } = fwd
    !proc.killed && proc.kill()
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
export async function getPortForward(
  { ctx, log, namespace, targetResource, port }:
    { ctx: PluginContext, log: LogEntry, namespace: string, targetResource: string, port: number },
): Promise<PortForward> {
  // Using lock here to avoid concurrency issues (multiple parallel requests for same forward).
  const key = getPortForwardKey(targetResource, port)

  return portForwardRegistrationLock.acquire("register-port-forward", (async () => {
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

    // TODO: use the API directly instead of kubectl (need to reverse engineer kubectl a bit to get how that works)
    const portForwardArgs = ["port-forward", targetResource, portMapping]
    log.silly(`Running 'kubectl ${portForwardArgs.join(" ")}'`)

    const proc = await kubectl.spawn({ log, context: k8sCtx.provider.config.context, namespace, args: portForwardArgs })

    return new Promise((resolve) => {
      proc.on("error", (error) => {
        !proc.killed && proc.kill()
        throw error
      })

      proc.stdout!.on("data", (line) => {
        // This is unfortunately the best indication that we have that the connection is up...
        log.silly(`[${targetResource} port forwarder] ${line}`)

        if (line.toString().includes("Forwarding from ")) {
          const portForward = { targetResource, port, proc, localPort }
          registeredPortForwards[key] = portForward
          resolve(portForward)
        }
      })
    })
  }))
}

export async function getPortForwardHandler(
  { ctx, log, service, targetPort }: GetPortForwardParams,
): Promise<GetPortForwardResult> {
  const provider = ctx.provider as KubernetesProvider
  const namespace = await getAppNamespace(ctx, log, provider)
  const targetResource = `Service/${service.name}`

  const fwd = await getPortForward({ ctx, log, namespace, targetResource, port: targetPort })

  return {
    hostname: "localhost",
    port: fwd.localPort,
  }
}

/**
 * Returns a list of forwardable ports based on the specified resources.
 */
export function getForwardablePorts(resources: KubernetesResource[]) {
  const ports: ForwardablePort[] = []

  for (const resource of resources) {
    if (isBuiltIn(resource) && resource.kind === "Service") {
      const service = resource as V1Service

      for (const portSpec of service.spec!.ports || []) {
        ports.push({
          name: portSpec.name,
          // TODO: not sure if/how possible but it would be good to deduce the protocol somehow
          protocol: "TCP",
          targetHostname: service.metadata!.name,
          targetPort: portSpec.port,
        })
      }
    }
  }

  return ports
}
