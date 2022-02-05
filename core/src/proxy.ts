/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEqual, invert } from "lodash"
import Bluebird from "bluebird"
import chalk = require("chalk")
import { createServer, Server, Socket } from "net"
const AsyncLock = require("async-lock")
import getPort = require("get-port")
import { GardenService, ServiceStatus, ForwardablePort } from "./types/service"
import { Garden } from "./garden"
import { registerCleanupFunction, sleep } from "./util/util"
import { LogEntry } from "./logger/log-entry"
import { GetPortForwardResult } from "./types/plugin/service/getPortForward"
import { ConfigGraph } from "./config-graph"
import { gardenEnv } from "./constants"

interface PortProxy {
  key: string
  localPort: number
  localUrl: string
  server: Server
  service: GardenService
  spec: ForwardablePort
}

const defaultLocalAddress = "localhost"

const activeProxies: { [key: string]: PortProxy } = {}

registerCleanupFunction("kill-service-port-proxies", () => {
  for (const proxy of Object.values(activeProxies)) {
    try {
      // Avoid EPIPE errors
      proxy.server.on("error", () => {})
      stopPortProxy(proxy)
    } catch {}
  }
})

const portLock = new AsyncLock()

// tslint:disable-next-line: max-line-length
export async function startPortProxies({
  garden,
  graph,
  log,
  service,
  status,
}: {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  service: GardenService
  status: ServiceStatus
}) {
  if (garden.disablePortForwards) {
    log.info({ msg: chalk.gray("Port forwards disabled") })
    return []
  }

  return Bluebird.map(status.forwardablePorts || [], (spec) => {
    return startPortProxy({ garden, graph, log, service, spec })
  })
}

interface StartPortProxyParams {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  service: GardenService
  spec: ForwardablePort
}

async function startPortProxy({ garden, graph, log, service, spec }: StartPortProxyParams) {
  const key = getPortKey(service, spec)
  let proxy = activeProxies[key]

  if (!proxy) {
    // Start new proxy
    proxy = activeProxies[key] = await createProxy({ garden, graph, log, service, spec })
  } else if (!isEqual(proxy.spec, spec)) {
    // Stop existing proxy and create new one
    stopPortProxy(proxy, log)
    proxy = activeProxies[key] = await createProxy({ garden, graph, log, service, spec })
  }

  return proxy
}

async function createProxy({ garden, graph, log, service, spec }: StartPortProxyParams): Promise<PortProxy> {
  const actions = await garden.getActionRouter()
  const key = getPortKey(service, spec)
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
        fwd = await actions.getPortForward({ service, log, graph, ...spec })
      } catch (err) {
        const msg = err.message.trim()

        if (msg !== lastPrintedError) {
          log.warn(chalk.gray(`→ Could not start port forward to ${key} (will retry): ${msg}`))
          lastPrintedError = msg
        } else {
          log.silly(chalk.gray(`→ Could not start port forward to ${key} (will retry): ${msg}`))
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
    // tslint:disable-next-line: no-floating-promises
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

  let localIp = defaultLocalAddress
  let localPort: number | undefined
  const preferredLocalPort = spec.preferredLocalPort || spec.targetPort

  if (gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS) {
    localIp = gardenEnv.GARDEN_PROXY_DEFAULT_ADDRESS
  } else if (!spec.preferredLocalPort) {
    // TODO: drop this in 0.13, it causes more issues than it solves
    // Only try a non-default IP if a preferred port isn't set
    // Note: lazy-loading for startup performance
    const { LocalAddress } = require("./db/entities/local-address")
    const preferredLocalAddress = await LocalAddress.resolve({
      projectName: garden.projectName,
      moduleName: service.module.name,
      serviceName: service.name,
      hostname: getHostname(service, spec),
    })

    localIp = preferredLocalAddress.getIp()
  }

  while (true) {
    try {
      localPort = await getPort({ host: localIp, port: preferredLocalPort })
    } catch (err) {
      if (err.errno === "EADDRNOTAVAIL") {
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
        log.warn(
          chalk.yellow(`→ Unable to bind port forward ${key} to preferred local port ${spec.preferredLocalPort}`)
        )
      }

      return { key, server, service, spec, localPort, localUrl }
    } else {
      // Need to retry on different port
      localIp = defaultLocalAddress
      localPort = undefined
      await sleep(500)
    }
  }
}

function stopPortProxy(proxy: PortProxy, log?: LogEntry) {
  // TODO: call stopPortForward handler
  log && log.debug(`Stopping port forward to ${proxy.key}`)
  delete activeProxies[proxy.key]

  try {
    proxy.server.close(() => {})
  } catch {}
}

function getHostname(service: GardenService, spec: ForwardablePort) {
  return spec.targetName || service.name
}

function getPortKey(service: GardenService, spec: ForwardablePort) {
  return `${service.name}/${getHostname(service, spec)}:${spec.targetPort}`
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
  let protocol = standardProtocolPortIndex[port]

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
