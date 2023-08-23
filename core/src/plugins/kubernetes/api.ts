/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { IncomingMessage } from "http"
import { ReadStream } from "tty"
import {
  ApiextensionsV1Api,
  ApisApi,
  AppsV1Api,
  CoreApi,
  CoreV1Api,
  Exec,
  KubeConfig,
  KubernetesObject,
  Log as K8sLog,
  NetworkingV1Api,
  PolicyV1Api,
  RbacAuthorizationV1Api,
  V1APIGroup,
  V1APIResource,
  V1APIVersions,
  V1Deployment,
  V1Secret,
  V1Service,
} from "@kubernetes/client-node"
import { load } from "js-yaml"
import { readFile } from "fs-extra"
import WebSocket from "isomorphic-ws"
import pRetry from "p-retry"
import { Omit, StringCollector } from "../../util/util"
import { flatten, isObject, isPlainObject, keyBy, omitBy } from "lodash"
import { ConfigurationError, GardenBaseError, RuntimeError } from "../../exceptions"
import {
  BaseResource,
  KubernetesList,
  KubernetesPod,
  KubernetesResource,
  KubernetesServerList,
  KubernetesServerResource,
} from "./types"
import { Log } from "../../logger/log-entry"
import { kubectl } from "./kubectl"
import { urlJoin } from "../../util/string"
import { KubernetesProvider } from "./config"
import { StringMap } from "../../config/common"
import { PluginContext } from "../../plugin-context"
import { PassThrough, Readable, Writable } from "stream"
import { getExecExitCode } from "./status/pod"
import { labelSelectorToString } from "./util"
import { safeDumpYaml } from "../../util/serialization"
import AsyncLock from "async-lock"
import { requestWithRetry, RetryOpts } from "./retry"
import request = require("request-promise")
import requestErrors = require("request-promise/errors")

interface ApiGroupMap {
  [groupVersion: string]: V1APIGroup
}

interface ApiResourceMap {
  [group: string]: { [kind: string]: V1APIResource }
}

interface ApiInfo {
  coreApi: V1APIVersions
  groups: V1APIGroup[]
  groupMap: ApiGroupMap
}

const cachedConfigs: { [context: string]: KubeConfig } = {}
const cachedApiInfo: { [context: string]: ApiInfo } = {}
const cachedApiResourceInfo: { [context: string]: ApiResourceMap } = {}
const apiInfoLock = new AsyncLock()

// NOTE: be warned, the API of the client library is very likely to change

type K8sApi =
  | ApiextensionsV1Api
  | AppsV1Api
  | CoreApi
  | CoreV1Api
  | NetworkingV1Api
  | PolicyV1Api
  | RbacAuthorizationV1Api
type K8sApiConstructor<T extends K8sApi> = new (basePath?: string) => T

const apiTypes: { [key: string]: K8sApiConstructor<any> } = {
  apis: ApisApi,
  apps: AppsV1Api,
  core: CoreV1Api,
  coreApi: CoreApi,
  extensions: ApiextensionsV1Api,
  networking: NetworkingV1Api,
  policy: PolicyV1Api,
  rbac: RbacAuthorizationV1Api,
}

const crudMap = {
  Deployment: {
    cls: new V1Deployment(),
    group: "apps",
    read: "readNamespacedDeployment",
    create: "createNamespacedDeployment",
    replace: "replaceNamespacedDeployment",
    delete: "deleteNamespacedDeployment",
    patch: "patchNamespacedDeployment",
  },
  Secret: {
    cls: new V1Secret(),
    group: "core",
    read: "readNamespacedSecret",
    create: "createNamespacedSecret",
    replace: "replaceNamespacedSecret",
    delete: "deleteNamespacedSecret",
    patch: "patchNamespacedSecret",
  },
  Service: {
    cls: new V1Service(),
    group: "core",
    read: "readNamespacedService",
    create: "createNamespacedService",
    replace: null,
    delete: "deleteNamespacedService",
    patch: "patchNamespacedService",
  },
}

type CrudMap = typeof crudMap
type CrudMapTypes = { [T in keyof CrudMap]: CrudMap[T]["cls"] }

export class KubernetesError extends GardenBaseError {
  type = "kubernetes"

  statusCode?: number
  response?: any
}

interface List {
  items?: Array<any>
}

type WrappedList<T extends List> = T["items"] extends Array<infer V extends BaseResource | KubernetesObject>
  ? KubernetesServerList<V>
  : KubernetesServerList

// This describes the API classes on KubeApi after they've been wrapped with KubeApi.wrapApi()
// prettier-ignore
type WrappedApi<T> = {
  // Wrap each API method
  [P in keyof T]:
  T[P] extends (...args: infer A) => Promise<{ response: IncomingMessage; body: infer U }>
    ? (
      // If so we wrap it and return the `body` part of the output directly and...
      // If it's a list, we cast to a KubernetesServerList, which in turn wraps the array type
      U extends List ? (...args: A) => Promise<WrappedList<U>> :
        // If it's a resource, we wrap it as a KubernetesResource which makes some attributes required
        // (as they should be)
        U extends KubernetesObject ? (...args: A) => Promise<KubernetesServerResource<U>> :
          // Otherwise we keep the body output type as-is
          (...args: A) => Promise<U>
      ) :
    T[P]
}

export interface ExecInPodResult {
  exitCode?: number
  allLogs: string
  stdout: string
  stderr: string
  timedOut: boolean
}

interface ReadParams {
  log: Log
  namespace: string
  apiVersion: string
  kind: string
  name: string
}

interface ReadBySpecParams {
  log: Log
  namespace: string
  manifest: KubernetesResource
}

async function nullIfNotFound<T>(fn: () => Promise<T>) {
  try {
    const resource = await fn()
    return resource
  } catch (err) {
    if (err.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

export class KubeApi {
  public apis: WrappedApi<ApisApi>
  public apps: WrappedApi<AppsV1Api>
  public core: WrappedApi<CoreV1Api>
  public coreApi: WrappedApi<CoreApi>
  public extensions: WrappedApi<ApiextensionsV1Api>
  public networking: WrappedApi<NetworkingV1Api>
  public policy: WrappedApi<PolicyV1Api>
  public rbac: WrappedApi<RbacAuthorizationV1Api>

  constructor(
    public log: Log,
    public context: string,
    private config: KubeConfig
  ) {
    const cluster = this.config.getCurrentCluster()

    if (!cluster) {
      throw new ConfigurationError({
        message: `Could not read cluster from kubeconfig for context ${context}`,
        detail: {
          context,
          config,
        },
      })
    }

    for (const [name, cls] of Object.entries(apiTypes)) {
      const api = new cls(cluster.server)
      this[name] = this.wrapApi(log, api, this.config)
    }
  }

  static async factory(log: Log, ctx: PluginContext, provider: KubernetesProvider) {
    const config = await getContextConfig(log, ctx, provider)
    return new KubeApi(log, provider.config.context, config)
  }

  async getApiInfo(): Promise<ApiInfo> {
    if (cachedApiInfo[this.context]) {
      return cachedApiInfo[this.context]
    }

    return apiInfoLock.acquire(this.context, async () => {
      if (cachedApiInfo[this.context] === undefined) {
        const coreApi = await this.coreApi.getAPIVersions()
        const apis = await this.apis.getAPIVersions()

        const coreGroups: V1APIGroup[] = coreApi.versions.map((version) => ({
          apiVersion: "v1",
          kind: "ApiGroup",
          name: version,
          preferredVersion: {
            groupVersion: version,
            version,
          },
          versions: [
            {
              groupVersion: "core/" + version,
              version: "core/" + version,
            },
            {
              groupVersion: version,
              version,
            },
          ],
          serverAddressByClientCIDRs: coreApi.serverAddressByClientCIDRs,
        }))

        const groups = coreGroups.concat(apis.groups)
        const groupMap: ApiGroupMap = {}

        for (const group of groups) {
          for (const version of group.versions) {
            groupMap[version.groupVersion] = group
          }
        }

        cachedApiInfo[this.context] = { coreApi, groups, groupMap }
      }

      return cachedApiInfo[this.context]
    })
  }

  async getApiGroup(resource: KubernetesResource) {
    const apiInfo = await this.getApiInfo()
    const apiVersion = resource.apiVersion
    const group = apiInfo.groupMap[apiVersion]

    if (!group) {
      throw new KubernetesError({
        message: `Unrecognized apiVersion: ${apiVersion}`,
        detail: {
          apiVersion,
          resource,
        },
      })
    }

    return group
  }

  async getApiResourceInfo(log: Log, apiVersion: string, kind: string): Promise<V1APIResource> {
    if (!cachedApiResourceInfo[this.context]) {
      cachedApiResourceInfo[this.context] = {}
    }

    const apiResources = cachedApiResourceInfo[this.context]

    const lockKey = `${this.context}/${apiVersion}`
    const resourceMap =
      apiResources[apiVersion] ||
      (await apiInfoLock.acquire(lockKey, async () => {
        if (apiResources[apiVersion]) {
          return apiResources[apiVersion]
        }

        log.debug(`Kubernetes: Getting API resource info for group ${apiVersion}`)

        try {
          const res = await this.request({ log, path: getGroupBasePath(apiVersion) })

          // We're only interested in the entities themselves, not the sub-resources
          const resources = res.body.resources.filter((r: any) => !r.name.includes("/"))

          apiResources[apiVersion] = keyBy(resources, "kind")
          return apiResources[apiVersion]
        } catch (err) {
          if (err.statusCode === 404) {
            // Could not find the resource type
            return {}
          } else {
            throw err
          }
        }
      }))

    return resourceMap[kind]
  }

  async request({
    log,
    path,
    opts = {},
    retryOpts,
  }: {
    log: Log
    path: string
    opts?: Omit<request.OptionsWithUrl, "url">
    retryOpts?: RetryOpts
  }): Promise<any> {
    const baseUrl = this.config.getCurrentCluster()!.server
    const url = urlJoin(baseUrl, path)

    // set some default values
    const requestOpts = {
      url,
      method: "get",
      json: true,
      resolveWithFullResponse: true,
      ...opts,
    }

    // apply auth
    await this.config.applyToRequest(requestOpts)

    return await requestWithRetry(
      log,
      `Kubernetes API: ${path}`,
      async () => {
        try {
          log.silly(`${requestOpts.method.toUpperCase()} ${url}`)
          return await request(requestOpts)
        } catch (err) {
          throw handleRequestPromiseError(path, err)
        }
      },
      retryOpts
    )
  }

  /**
   * Fetch the specified resource from the cluster.
   */
  async read({ log, namespace, apiVersion, kind, name }: ReadParams) {
    log.silly(`Fetching Kubernetes resource ${apiVersion}/${kind}/${name}`)

    const typePath = await this.getResourceTypeApiPath({
      log,
      apiVersion,
      kind,
      namespace,
    })

    const apiPath = typePath + "/" + name

    const res = await this.request({ log, path: apiPath })
    return res.body
  }

  async readOrNull(params: ReadParams) {
    return await nullIfNotFound(() => this.read(params))
  }

  /**
   * Given a manifest, attempt to read the matching resource from the cluster.
   */
  async readBySpec({ log, namespace, manifest }: ReadBySpecParams) {
    log.silly(`Fetching Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${manifest.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest, log, namespace })

    const res = await this.request({ log, path: apiPath })
    return res.body
  }

  /**
   * Same as readBySpec() but returns null if the resource is missing.
   */
  async readBySpecOrNull(params: ReadBySpecParams) {
    return await nullIfNotFound(() => this.readBySpec(params))
  }

  async listResources<T extends KubernetesResource>({
    log,
    apiVersion,
    kind,
    namespace,
    labelSelector,
  }: {
    log: Log
    apiVersion: string
    kind: string
    namespace: string
    labelSelector?: { [label: string]: string }
  }) {
    const apiPath = await this.getResourceTypeApiPath({ log, apiVersion, kind, namespace })
    const labelSelectorString = labelSelector ? labelSelectorToString(labelSelector) : undefined

    const res = await this.request({ log, path: apiPath, opts: { qs: { labelSelector: labelSelectorString } } })
    const list = res.body as KubernetesList<T>

    // This fixes an odd issue where apiVersion and kind are sometimes missing from list items coming from the API :/
    list.items = list.items.map((r) => ({
      ...r,
      apiVersion: r.apiVersion || apiVersion,
      kind: r.kind || kind,
    }))

    return list
  }

  /**
   * Fetches all resources in the namespace matching the provided API version + kind pairs, optionally filtered by
   * `labelSelector`.
   *
   * Useful when resources of several kinds need to be fetched at once.
   */
  async listResourcesForKinds({
    log,
    namespace,
    versionedKinds,
    labelSelector,
  }: {
    log: Log
    namespace: string
    versionedKinds: { apiVersion: string; kind: string }[]
    labelSelector?: { [label: string]: string }
  }): Promise<KubernetesResource[]> {
    const resources = await Promise.all(
      versionedKinds.map(async ({ apiVersion, kind }) => {
        try {
          const resourceListForKind = await this.listResources({
            log,
            apiVersion,
            kind,
            namespace,
            labelSelector,
          })
          return resourceListForKind.items
        } catch (err) {
          if (err.statusCode === 404) {
            // Then this resource version + kind is not available in the cluster.
            return []
          }
          // FIXME: OpenShift: developers have more restrictions on what they can list
          // Ugly workaround right now, basically just shoving the problem under the rug.
          const openShiftForbiddenList = ["Namespace", "PersistentVolume"]
          if (err.statusCode === 403 && openShiftForbiddenList.includes(kind)) {
            log.warn(
              `No permissions to list resources of kind ${kind}. If you are using OpenShift, ignore this warning.`
            )
            return []
          }
          throw err
        }
      })
    )
    return flatten(resources)
  }

  async replace({ log, resource, namespace }: { log: Log; resource: KubernetesServerResource; namespace?: string }) {
    log.silly(`Replacing Kubernetes resource ${resource.apiVersion}/${resource.kind}/${resource.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest: resource, log, namespace })

    const res = await this.request({ log, path: apiPath, opts: { method: "put", body: resource } })
    return res.body
  }

  /**
   * Applies the specified `annotations` to the given resource and persists to the cluster.
   * Assumes the resource already exists in the cluster.
   */
  async annotateResource({
    log,
    resource,
    annotations,
  }: {
    log: Log
    resource: KubernetesServerResource
    annotations: StringMap
  }) {
    // TODO: use patch instead of replacing (it's weirdly complex, unfortunately)
    resource.metadata.annotations = { ...resource.metadata.annotations, ...annotations }
    await this.replace({ log, resource })
    return resource
  }

  async deleteBySpec({ namespace, manifest, log }: { namespace: string; manifest: KubernetesResource; log: Log }) {
    log.silly(`Deleting Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${manifest.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest, log, namespace })

    try {
      await this.request({ log, path: apiPath, opts: { method: "delete" } })
    } catch (err) {
      if (err.statusCode !== 404) {
        throw err
      }
    }
  }

  private async getResourceTypeApiPath({
    apiVersion,
    kind,
    log,
    namespace,
  }: {
    apiVersion: string
    kind: string
    log: Log
    namespace: string
  }) {
    const resourceInfo = await this.getApiResourceInfo(log, apiVersion, kind)

    if (!resourceInfo) {
      const err = new KubernetesError({
        message: `Unrecognized resource type ${apiVersion}/${kind}`,
        detail: {
          apiVersion,
          kind,
        },
      })
      err.statusCode = 404
      throw err
    }

    const basePath = getGroupBasePath(apiVersion)

    return resourceInfo.namespaced
      ? `${basePath}/namespaces/${namespace}/${resourceInfo.name}`
      : `${basePath}/${resourceInfo.name}`
  }

  private async getResourceApiPathFromManifest({
    manifest,
    log,
    namespace,
  }: {
    manifest: KubernetesResource
    log: Log
    namespace?: string
  }) {
    const apiVersion = manifest.apiVersion

    if (!apiVersion) {
      throw new KubernetesError({
        message: `Missing apiVersion on resource`,
        detail: {
          manifest,
        },
      })
    }

    if (!namespace) {
      namespace = manifest.metadata?.namespace
    }

    if (!namespace) {
      throw new KubernetesError({
        message: `Missing namespace on resource and no namespace specified`,
        detail: {
          manifest,
        },
      })
    }

    const typePath = await this.getResourceTypeApiPath({
      log,
      apiVersion,
      kind: manifest.kind,
      namespace,
    })

    return typePath + "/" + manifest.metadata.name
  }

  async upsert<K extends keyof CrudMap, O extends KubernetesResource<CrudMapTypes[K]>>({
    kind,
    namespace,
    obj,
    log,
  }: {
    kind: K
    namespace: string
    obj: O
    log: Log
  }) {
    const api = this[crudMap[kind].group]
    const name = obj.metadata.name

    log.debug(`Upserting ${kind} ${namespace}/${name}`)

    const replace = async () => {
      await api[crudMap[kind].read](name, namespace)
      if (api[crudMap[kind].replace]) {
        await api[crudMap[kind].replace](name, namespace, obj)
        log.debug(`Replaced ${kind} ${namespace}/${name}`)
      } else {
        await api[crudMap[kind].patch](name, namespace, obj)
        log.debug(`Patched ${kind} ${namespace}/${name}`)
      }
    }

    try {
      await replace()
    } catch (error) {
      if (error.statusCode === 404) {
        try {
          await api[crudMap[kind].create](namespace, <any>obj)
          log.debug(`Created ${kind} ${namespace}/${name}`)
        } catch (err) {
          if (err.statusCode === 409 || err.statusCode === 422) {
            await replace()
          } else {
            throw err
          }
        }
      } else {
        throw error
      }
    }
  }

  /**
   * Wrapping the API objects to deal with bugs.
   */
  private wrapApi<T extends K8sApi>(log: Log, api: T, config: KubeConfig): T {
    api.setDefaultAuthentication(config)

    return new Proxy(api, {
      get: (target: T, name: string, receiver) => {
        if (!(name in Object.getPrototypeOf(target))) {
          // assume methods live on the prototype
          return Reflect.get(target, name, receiver)
        }

        return (...args: any[]) => {
          const defaultHeaders = target["defaultHeaders"]

          if (name.startsWith("patch")) {
            // patch the patch bug... (https://github.com/kubernetes-client/javascript/issues/19)
            target["defaultHeaders"] = { ...defaultHeaders, "content-type": "application/merge-patch+json" }
          }

          return requestWithRetry(log, `Kubernetes API: ${name}`, () => {
            const output = target[name](...args)
            target["defaultHeaders"] = defaultHeaders

            if (typeof output.then === "function") {
              return (
                output
                  // return the result body directly if applicable
                  .then((res: any) => {
                    if (isPlainObject(res) && res.hasOwnProperty("body")) {
                      // inexplicably, this API sometimes returns apiVersion and kind as undefined...
                      if (name === "listNamespacedPod" && res.body.items) {
                        res.body.items = res.body.items.map((pod: any) => {
                          pod.apiVersion = "v1"
                          pod.kind = "Pod"
                          return pod
                        })
                      }
                      return res["body"]
                    } else {
                      return res
                    }
                  })
                  // the API errors are not properly formed Error objects
                  .catch((err: Error) => {
                    throw wrapError(name, err)
                  })
              )
            }

            return output
          })
        }
      },
    })
  }

  /**
   * Exec a command in the specified Pod container.
   *
   * Warning: Do not use tty=true unless you're actually attaching to a terminal, since collecting output will not work.
   */
  async execInPod({
    log,
    buffer,
    namespace,
    podName,
    containerName,
    command,
    stdout,
    stderr,
    stdin,
    tty,
    timeoutSec,
  }: {
    log: Log
    buffer: boolean
    namespace: string
    podName: string
    containerName: string
    command: string[]
    stdout?: Writable
    stderr?: Writable
    stdin?: Readable
    tty: boolean
    timeoutSec?: number
  }): Promise<ExecInPodResult> {
    const stdoutCollector = new StringCollector()
    const stderrCollector = new StringCollector()
    const combinedCollector = new StringCollector()

    let _stdout = stdout || null
    let _stderr = stderr || null

    if (tty) {
      // We connect stdout and stderr directly.
      if (stdout) {
        _stdout = stdout
      }
      if (stderr) {
        _stderr = stderr
      }
      if (stdin) {
        /**
         * We use raw mode for stdin to ensure that control characters aren't intercepted by the terminal and that
         * input isn't echoed back (among other things).
         *
         * See https://nodejs.org/api/tty.html#tty_readstream_setrawmode_mode for more.
         */
        const ttyStdin = stdin as ReadStream
        ttyStdin.setRawMode && ttyStdin.setRawMode(true)
      }
    } else if (buffer) {
      /**
       * Unless we're attaching a TTY to the output streams or buffer=false, we multiplex the outputs to both a
       * StringCollector, and whatever stream the caller provided.
       */
      _stdout = new PassThrough()
      _stdout.pipe(stdoutCollector)
      _stdout.pipe(combinedCollector)

      _stderr = new PassThrough()
      _stderr.pipe(stderrCollector)
      _stderr.pipe(combinedCollector)

      if (stdout) {
        _stdout.pipe(stdout)
      }

      if (stderr) {
        _stderr.pipe(stderr)
      }
    }

    return new Promise(async (resolve, reject) => {
      let done = false

      const finish = (timedOut: boolean, exitCode?: number) => {
        if (!done) {
          resolve({
            allLogs: combinedCollector.getString(),
            stdout: stdoutCollector.getString(),
            stderr: stderrCollector.getString(),
            timedOut,
            exitCode,
          })
          done = true
        }
      }

      const execWithRetry = async () => {
        const execHandler = new Exec(this.config)
        const description = "Pod exec"

        try {
          return await requestWithRetry(log, description, () =>
            execHandler.exec(
              namespace,
              podName,
              containerName,
              command,
              _stdout,
              _stderr,
              stdin || null,
              tty,
              (status) => {
                finish(false, getExecExitCode(status))
              }
            )
          )
        } catch (err) {
          throw wrapError(description, err)
        }
      }

      if (timeoutSec) {
        setTimeout(() => {
          if (!done) {
            finish(true)
          }
        }, timeoutSec * 1000)
      }

      try {
        const ws = attachWebsocketKeepalive(await execWithRetry())

        ws.on("error", (err) => {
          done = true
          reject(err)
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  getLogger() {
    return new K8sLog(this.config)
  }

  /**
   * Create an ad-hoc Pod. Use this method to handle race-condition cases when creating Pods.
   *
   * @throws {KubernetesError}
   */
  async createPod(namespace: string, pod: KubernetesPod) {
    await pRetry(
      async () => {
        await this.core.createNamespacedPod(namespace, pod)
      },
      {
        retries: 3,
        minTimeout: 500,
        onFailedAttempt(error) {
          // This can occur in laggy environments, just need to retry
          if (error.message.includes("No API token found for service account")) {
            return
          } else if (error.message.includes("error looking up service account")) {
            return
          }

          throw new KubernetesError({
            message: `Failed to create Pod ${pod.metadata.name}: ${error.message}`,
            detail: { error },
          })
        },
      }
    )
  }
}

const WEBSOCKET_KEEPALIVE_INTERVAL = 5_000
const WEBSOCKET_PING_TIMEOUT = 30_000

function attachWebsocketKeepalive(ws: WebSocket): WebSocket {
  let keepAlive: NodeJS.Timeout = setInterval(() => {
    ws.ping()
  }, WEBSOCKET_KEEPALIVE_INTERVAL)

  let pingTimeout: NodeJS.Timeout | undefined

  function heartbeat() {
    if (pingTimeout) {
      clearTimeout(pingTimeout)
    }
    pingTimeout = setTimeout(() => {
      ws.emit(
        "error",
        new Error(`Lost connection to the Kubernetes WebSocket API (Timed out after ${WEBSOCKET_PING_TIMEOUT / 1000}s)`)
      )
      ws.terminate()
    }, WEBSOCKET_PING_TIMEOUT)
  }

  function clear() {
    if (pingTimeout) {
      clearTimeout(pingTimeout)
    }
    clearInterval(keepAlive)
  }

  ws.on("pong", () => {
    heartbeat()
  })

  ws.on("error", () => {
    clear()
  })

  ws.on("close", () => {
    clear()
  })

  heartbeat()

  return ws
}

function getGroupBasePath(apiVersion: string) {
  // Of course, Kubernetes helpfully uses a singular for the core API and not everything else. So there you go.
  return apiVersion.includes("/") ? `/apis/${apiVersion}` : `/api/${apiVersion}`
}

export async function getKubeConfig(log: Log, ctx: PluginContext, provider: KubernetesProvider) {
  let kubeConfigStr: string

  try {
    if (provider.config.kubeconfig) {
      kubeConfigStr = (await readFile(provider.config.kubeconfig)).toString()
    } else {
      const args = ["config", "view", "--raw"]
      // We use kubectl for this, to support merging multiple paths in the KUBECONFIG env var
      kubeConfigStr = await requestWithRetry(
        log,
        `kubectl ${args.join(" ")}`,
        () =>
          kubectl(ctx, provider).stdout({
            log,
            args,
          }),
        { forceRetry: true }
      )
    }
    return load(kubeConfigStr)!
  } catch (error) {
    throw new RuntimeError({
      message: `Unable to load kubeconfig: ${error}`,
      detail: {
        error,
      },
    })
  }
}

async function getContextConfig(log: Log, ctx: PluginContext, provider: KubernetesProvider): Promise<KubeConfig> {
  const kubeconfigPath = provider.config.kubeconfig
  const context = provider.config.context
  const cacheKey = kubeconfigPath ? `${kubeconfigPath}:${context}` : context

  if (cachedConfigs[cacheKey]) {
    return cachedConfigs[cacheKey]
  }

  const rawConfig = await getKubeConfig(log, ctx, provider)
  const kc = new KubeConfig()

  // There doesn't appear to be a method to just load the parsed config :/
  try {
    kc.loadFromString(safeDumpYaml(rawConfig))
    kc.setCurrentContext(context)
  } catch (err) {
    throw new Error("Could not parse kubeconfig, " + err)
  }

  cachedConfigs[cacheKey] = kc

  return kc
}

function wrapError(name: string, err: any) {
  if (!err.message || err.name === "HttpError") {
    const response = err.response || {}
    const body = response.body || err.body
    const wrapped = new KubernetesError({
      message: `Got error from Kubernetes API (${name}) - ${body.message}`,
      detail: {
        body,
        request: omitBy(response.request, (v, k) => isObject(v) || k[0] === "_"),
      },
    })
    wrapped.statusCode = err.statusCode
    return wrapped
  } else {
    return err
  }
}

function handleRequestPromiseError(name: string, err: Error) {
  if (err instanceof requestErrors.StatusCodeError) {
    const wrapped = new KubernetesError({
      message: `StatusCodeError from Kubernetes API (${name}) - ${err.message}`,
      detail: {
        body: err.error,
      },
    })
    wrapped.statusCode = err.statusCode

    return wrapped
  } else {
    return wrapError(name, err)
  }
}
