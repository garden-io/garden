/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEqual, invert } from "lodash-es"
import type { Server } from "net"
import { createServer, Socket } from "net"
import AsyncLock from "async-lock"
import getPort from "get-port"
import type { ServiceStatus, ForwardablePort } from "./types/service.js"
import type { Garden } from "./garden.js"
import { registerCleanupFunction, sleep } from "./util/util.js"
import type { Log } from "./logger/log-entry.js"
import { createActionLog } from "./logger/log-entry.js"
import type { ConfigGraph } from "./graph/config-graph.js"
import type { DeployAction } from "./actions/deploy.js"
import type { GetPortForwardResult } from "./plugin/handlers/Deploy/get-port-forward.js"
import type { Executed } from "./actions/types.js"
import type { PluginEventBroker } from "./plugin-context.js"
import { GardenError, isErrnoException } from "./exceptions.js"

export interface PortProxy {
  key: string
  localPort: number
  localUrl: string
  server: Server
  action: DeployAction
  spec: ForwardablePort
}

const activeProxies: { [key: string]: PortProxy } = {}

registerCleanupFunction("kill-service-port-proxies", () => {
  for (const proxy of Object.values(activeProxies)) {
    try {
      // Avoid EPIPE errors
      proxy.server.on("error", () => {})
      closeProxyServer(proxy)
    } catch {}
  }
})

const portLock = new AsyncLock()

export async function startPortProxies({
  garden,
  graph,
  log,
  action,
  status,
  events,
}: {
  garden: Garden
  graph: ConfigGraph
  log: Log
  action: Executed<DeployAction>
  status: ServiceStatus
  events?: PluginEventBroker
}) {
  return Promise.all(
    (status.forwardablePorts || []).map((spec) => {
      return startPortProxy({ garden, graph, log, action, spec, events })
    })
  )
}

interface StartPortProxyParams {
  garden: Garden
  graph: ConfigGraph
  log: Log
  action: Executed<DeployAction>
  spec: ForwardablePort
  events?: PluginEventBroker
}

async function startPortProxy({ garden, graph, log, action, spec, events }: StartPortProxyParams) {
  const key = getPortKey(action, spec)
  let proxy = activeProxies[key]

  const createParams = { garden, graph, log, action, spec, events }

  if (!proxy) {
    // Start new proxy
    proxy = activeProxies[key] = await createProxy(createParams)
  } else if (!isEqual(proxy.spec, spec)) {
    // Stop existing proxy and create new one
    await stopPortProxy({ ...createParams, proxy })
    proxy = activeProxies[key] = await createProxy(createParams)
  }

  return proxy
}

async function createProxy({ garden, graph, log, action, spec, events }: StartPortProxyParams): Promise<PortProxy> {
  const router = await garden.getActionRouter()
  const key = getPortKey(action, spec)
  let fwd: GetPortForwardResult | null = null

  let lastPrintedError = ""

  const getPortForward = async () => {
    if (fwd) {
      return fwd
    }

    await portLock.acquire(key, async () => {
      if (fwd) {
        return
      }
      log.debug(`Starting port forward to ${key}`)

      try {
        const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
        const output = await router.deploy.getPortForward({ action, log: actionLog, graph, events, ...spec })
        fwd = output.result
      } catch (err) {
        if (!(err instanceof GardenError)) {
          throw err
        }

        const msg = err.message.trim()

        if (msg !== lastPrintedError) {
          log.warn(`→ Could not start port forward to ${key} (will retry): ${msg}`)
          lastPrintedError = msg
        } else {
          log.silly(() => `→ Could not start port forward to ${key} (will retry): ${msg}`)
        }
      }

      log.debug(`Successfully started port forward to ${key}`)
    })

    return fwd
  }

  const serverCallback = (local: Socket) => {
    let _remote: Socket
    let localDidClose = false

    const getRemote = async () => {
      if (!_remote) {
        const forwardResult = await getPortForward()

        _remote = new Socket()

        _remote.on("data", (data) => {
          if (!local.writable) {
            _remote.end()
          }
          const flushed = local.write(data)
          if (!flushed) {
            _remote.pause()
          }
        })

        _remote.on("drain", () => {
          local.resume()
        })

        _remote.on("close", () => {
          log.debug(`Connection from ${local.remoteAddress}:${local.remotePort} ended`)
          local.end()
        })

        _remote.on("error", (err) => {
          log.debug(`Remote socket error: ${err.message}`)
          // Existing port forward doesn't seem to be healthy, retry forward on next connection
          // TODO: it would be nice (but much more intricate) to hold the local connection open while reconnecting,
          // plus we don't really know if the connection is dead until a connection attempt is made.
          fwd = null
        })

        if (forwardResult) {
          const { port, hostname } = forwardResult
          log.debug(`Connecting to ${key} port forward at ${hostname}:${port}`)
          _remote.connect(port, hostname)
        }

        // Local connection was closed while remote connection was being created
        if (localDidClose) {
          _remote.end()
        }
      }

      return _remote
    }

    // net.Server.listen doesn't call the handler until a connection is established, in which
    // case we can actually go ahead and contact the remote. Indeed, we need to in case the remote
    // responds on connection.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    getRemote()

    const writeToRemote = (remote: Socket, data: Buffer) => {
      if (!remote.writable) {
        local.end()
      }
      const flushed = remote.write(data)
      if (!flushed) {
        local.pause()
      }
    }

    local.on("data", (data) => {
      if (_remote) {
        writeToRemote(_remote, data)
      } else {
        getRemote()
          .then((remote) => {
            remote && writeToRemote(remote, data)
          })
          // Promises are appropriately handled in the getRemote function
          .catch(() => {})
      }
    })

    local.on("drain", () => {
      _remote.resume()
    })

    local.on("close", () => {
      _remote && _remote.end()
      localDidClose = true
    })

    local.on("error", (err) => {
      log.debug(`Local socket error: ${err.message}`)
    })
  }

  const defaultLocalAddress = garden.proxy.hostname
  let localIp = defaultLocalAddress
  let localPort: number | undefined
  const preferredLocalPort = spec.preferredLocalPort || spec.targetPort

  while (true) {
    try {
      localPort = await getPort({ host: localIp, port: preferredLocalPort })
    } catch (err) {
      if (isErrnoException(err) && err.code === "EADDRNOTAVAIL" && localIp !== defaultLocalAddress) {
        // If we're not allowed to bind to other 127.x.x.x addresses, we fall back to localhost. This will almost always
        // be the case on Mac, until we come up with something more clever (that doesn't require sudo).
        localIp = defaultLocalAddress
        localPort = await getPort({ host: localIp, port: preferredLocalPort })
      } else {
        throw err
      }
    }

    const host = `${localIp}:${localPort}`
    // For convenience, we try to guess a protocol based on the target port, if no URL protocol is specified
    const protocol = spec.urlProtocol || guessProtocol(spec)
    const localUrl = protocol ? `${protocol.toLowerCase()}://${host}` : host

    const server = createServer(serverCallback)

    const started = await new Promise((resolve, reject) => {
      server.listen(localPort, localIp)
      server.on("listening", () => {
        log.debug(`Started proxy to ${key} on ${host}`)
        resolve(true)
      })
      server.on("error", (err) => {
        if (err["errno"] === "EADDRINUSE") {
          resolve(false)
        } else {
          // This will throw the error and halt the loop
          reject(err)
        }
      })
    })

    if (started) {
      if (spec.preferredLocalPort && (localIp !== defaultLocalAddress || localPort !== spec.preferredLocalPort)) {
        log.warn(`→ Unable to bind port forward ${key} to preferred local port ${spec.preferredLocalPort}`)
      }

      return { key, server, action, spec, localPort, localUrl }
    } else {
      // Need to retry on different port
      localIp = defaultLocalAddress
      localPort = undefined
      await sleep(500)
    }
  }
}

function closeProxyServer(proxy: PortProxy) {
  // TODO: call stopPortForward handler
  delete activeProxies[proxy.key]

  try {
    proxy.server.close(() => {})
  } catch {}
}

interface StopPortProxyParams extends StartPortProxyParams {
  proxy: PortProxy
}

export async function stopPortProxy({ garden, graph, log, action, proxy, events }: StopPortProxyParams) {
  log.verbose(`Stopping port forward to ${proxy.key}`)

  closeProxyServer(proxy)

  const router = await garden.getActionRouter()
  const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

  await router.deploy.stopPortForward({ log: actionLog, graph, action, events, ...proxy.spec })
}

function getHostname(action: DeployAction, spec: ForwardablePort) {
  return spec.targetName || action.name
}

function getPortKey(action: DeployAction, spec: ForwardablePort) {
  return `${action.name}/${getHostname(action, spec)}:${spec.targetPort}`
}

const standardProtocolPorts = {
  acap: 674,
  afp: 548,
  dict: 2628,
  dns: 53,
  ftp: 21,
  git: 9418,
  gopher: 70,
  http: 80,
  https: 443,
  imap: 143,
  ipp: 631,
  ipps: 631,
  irc: 194,
  ircs: 6697,
  ldap: 389,
  ldaps: 636,
  mms: 1755,
  msrp: 2855,
  mtqp: 1038,
  nfs: 111,
  nntp: 119,
  nntps: 563,
  pop: 110,
  postgres: 5432,
  prospero: 1525,
  redis: 6379,
  rsync: 873,
  rtsp: 554,
  rtsps: 322,
  rtspu: 5005,
  sftp: 22,
  smb: 445,
  snmp: 161,
  ssh: 22,
  svn: 3690,
  telnet: 23,
  ventrilo: 3784,
  vnc: 5900,
  wais: 210,
  // "ws": 80,
  // "wss": 443,
}

const standardProtocolPortIndex = invert(standardProtocolPorts)

function guessProtocol(spec: ForwardablePort) {
  const port = spec.targetPort
  const protocol = standardProtocolPortIndex[port]

  if (protocol) {
    return protocol
  } else if (port >= 8000 && port < 9000) {
    // 8xxx ports are commonly HTTP
    return "http"
  } else if (spec.name && standardProtocolPorts[spec.name]) {
    // If the port spec name is a known protocol we return that
    return spec.name
  } else {
    return null
  }
}
