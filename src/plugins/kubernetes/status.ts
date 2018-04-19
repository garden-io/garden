/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeploymentError } from "../../exceptions"
import { LogEntry } from "../../logger"
import { LogSymbolType } from "../../logger/types"
import { PluginContext } from "../../plugin-context"
import { Environment } from "../../types/common"
import {
  ServiceProtocol,
  ServiceStatus,
} from "../../types/service"
import { sleep } from "../../util"
import {
  ContainerService,
  ServiceEndpointSpec,
} from "../container"
import { getContext } from "./actions"
import {
  coreApi,
  extensionsApi,
} from "./api"
import { getServiceHostname } from "./ingress"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { getAppNamespace } from "./namespace"
import { localIngressPort } from "./system"

export async function checkDeploymentStatus(
  { ctx, service, resourceVersion, env }:
    { ctx: PluginContext, service: ContainerService, resourceVersion?: number, env: Environment },
): Promise<ServiceStatus> {
  const context = getContext(env)
  const type = service.config.daemon ? "daemonsets" : "deployments"
  const hostname = getServiceHostname(ctx, service)
  const namespace = getAppNamespace(ctx, env)

  const endpoints = service.config.endpoints.map((e: ServiceEndpointSpec) => {
    // TODO: this should be HTTPS, once we've set up TLS termination at the ingress controller level
    const protocol: ServiceProtocol = "http"

    return {
      protocol,
      hostname,
      port: localIngressPort,
      url: `${protocol}://${hostname}:${localIngressPort}`,
      paths: e.paths,
    }
  })

  const out: ServiceStatus = {
    endpoints,
    runningReplicas: 0,
    detail: { resourceVersion },
  }

  let statusRes
  let status

  try {
    statusRes = await extensionsApi(context, namespace).namespaces[type](service.name).get()
  } catch (err) {
    if (err.code === 404) {
      // service is not running
      return out
    } else {
      throw err
    }
  }

  status = statusRes.status

  if (!resourceVersion) {
    resourceVersion = out.detail.resourceVersion = parseInt(statusRes.metadata.resourceVersion, 10)
  }

  out.version = statusRes.metadata.annotations["garden.io/version"]

  // TODO: try to come up with something more efficient. may need to wait for newer k8s version.
  // note: the resourceVersion parameter does not appear to work...
  const eventsRes = await coreApi(context, namespace).namespaces.events.get()

  // const eventsRes = await this.kubeApi(
  //   "GET",
  //   [
  //     "apis", apiSection, "v1beta1",
  //     "watch",
  //     "namespaces", namespace,
  //     type + "s", service.fullName,
  //   ],
  //   { resourceVersion, watch: "false" },
  // )

  // look for errors and warnings in the events for the service, abort if we find any
  const events = eventsRes.items

  for (let event of events) {
    const eventVersion = parseInt(event.metadata.resourceVersion, 10)

    if (
      eventVersion <= <number>resourceVersion ||
      (!event.metadata.name.startsWith(service.name + ".") && !event.metadata.name.startsWith(service.name + "-"))
    ) {
      continue
    }

    if (eventVersion > <number>resourceVersion) {
      out.detail.resourceVersion = eventVersion
    }

    if (event.type === "Warning" || event.type === "Error") {
      if (event.reason === "Unhealthy") {
        // still waiting on readiness probe
        continue
      }
      out.state = "unhealthy"
      out.lastError = `${event.reason} - ${event.message}`
      return out
    }

    let message = event.message

    if (event.reason === event.reason.toUpperCase()) {
      // some events like ingress events are formatted this way
      message = `${event.reason} ${message}`
    }

    if (message) {
      out.detail.lastMessage = message
    }
  }

  // See `https://github.com/kubernetes/kubernetes/blob/master/pkg/kubectl/rollout_status.go` for a reference
  // for this logic.
  let available = 0
  out.state = "ready"
  let statusMsg = ""

  if (statusRes.metadata.generation > status.observedGeneration) {
    statusMsg = `Waiting for spec update to be observed...`
    out.state = "deploying"
  } else if (service.config.daemon) {
    const desired = status.desiredNumberScheduled || 0
    const updated = status.updatedNumberScheduled || 0
    available = status.numberAvailable || 0

    if (updated < desired) {
      statusMsg = `${updated} out of ${desired} new pods updated...`
      out.state = "deploying"
    } else if (available < desired) {
      statusMsg = `${available} out of ${desired} updated pods available...`
      out.state = "deploying"
    }
  } else {
    const desired = 1 // TODO: service.count[env.name] || 1
    const updated = status.updatedReplicas || 0
    const replicas = status.replicas || 0
    available = status.availableReplicas || 0

    if (updated < desired) {
      statusMsg = `Waiting for rollout: ${updated} out of ${desired} new replicas updated...`
      out.state = "deploying"
    } else if (replicas > updated) {
      statusMsg = `Waiting for rollout: ${replicas - updated} old replicas pending termination...`
      out.state = "deploying"
    } else if (available < updated) {
      statusMsg = `Waiting for rollout: ${available} out of ${updated} updated replicas available...`
      out.state = "deploying"
    }
  }

  out.runningReplicas = available
  out.lastMessage = statusMsg

  return out
}

export async function waitForDeployment(
  { ctx, service, logEntry, env }:
    { ctx: PluginContext, service: ContainerService, logEntry?: LogEntry, env: Environment },
) {
  // NOTE: using `kubectl rollout status` here didn't pan out, since it just times out when errors occur.
  let loops = 0
  let resourceVersion = undefined
  let lastMessage
  let lastDetailMessage
  const startTime = new Date().getTime()

  logEntry && ctx.log.verbose({
    symbol: LogSymbolType.info,
    section: service.name,
    msg: `Waiting for service to be ready...`,
  })

  while (true) {
    await sleep(2000 + 1000 * loops)

    const status = await checkDeploymentStatus({ ctx, service, resourceVersion, env })

    if (status.lastError) {
      throw new DeploymentError(`Error deploying ${service.name}: ${status.lastError}`, {
        serviceName: service.name,
        status,
      })
    }

    if (status.detail.lastMessage && (!lastDetailMessage || status.detail.lastMessage !== lastDetailMessage)) {
      lastDetailMessage = status.detail.lastMessage
      logEntry && ctx.log.verbose({
        symbol: LogSymbolType.info,
        section: service.name,
        msg: status.detail.lastMessage,
      })
    }

    if (status.lastMessage && (!lastMessage && status.lastMessage !== lastMessage)) {
      lastMessage = status.lastMessage
      logEntry && ctx.log.verbose({
        symbol: LogSymbolType.info,
        section: service.name,
        msg: status.lastMessage,
      })
    }

    if (status.state === "ready") {
      break
    }

    resourceVersion = status.detail.resourceVersion

    const now = new Date().getTime()

    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new Error(`Timed out waiting for ${service.name} to deploy`)
    }
  }

  logEntry && ctx.log.verbose({ symbol: LogSymbolType.info, section: service.name, msg: `Service deployed` })
}
