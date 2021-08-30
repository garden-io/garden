/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// No idea why tslint complains over this line
// tslint:disable-next-line:no-unused
import { IncomingMessage } from "http"
import { Agent } from "https"
import { ReadStream } from "tty"
import chalk from "chalk"
import httpStatusCodes from "http-status-codes"
import {
  KubeConfig,
  V1Secret,
  CoreApi,
  ApisApi,
  V1APIGroup,
  V1APIVersions,
  V1APIResource,
  CoreV1Api,
  ExtensionsV1beta1Api,
  RbacAuthorizationV1Api,
  AppsV1Api,
  ApiextensionsV1beta1Api,
  PolicyV1beta1Api,
  KubernetesObject,
  Exec,
  Attach,
  V1Deployment,
  V1Service,
  Log,
  NetworkingV1Api,
} from "@kubernetes/client-node"
import AsyncLock = require("async-lock")
import request = require("request-promise")
import requestErrors = require("request-promise/errors")
import { safeLoad } from "js-yaml"
import { readFile } from "fs-extra"
import { lookup } from "dns-lookup-cache"

import { Omit, safeDumpYaml, StringCollector, sleep } from "../../util/util"
import { omitBy, isObject, isPlainObject, keyBy } from "lodash"
import { GardenBaseError, RuntimeError, ConfigurationError } from "../../exceptions"
import {
  KubernetesResource,
  KubernetesServerResource,
  KubernetesServerList,
  KubernetesList,
  KubernetesPod,
} from "./types"
import { LogEntry } from "../../logger/log-entry"
import { kubectl } from "./kubectl"
import { deline, urlJoin } from "../../util/string"
import { KubernetesProvider } from "./config"
import { StringMap } from "../../config/common"
import { PluginContext } from "../../plugin-context"
import { Writable, Readable, PassThrough } from "stream"
import { WebSocketHandler } from "@kubernetes/client-node/dist/web-socket-handler"
import { getExecExitCode } from "./status/pod"
import { labelSelectorToString } from "./util"

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

const requestAgent = new Agent({ lookup })

// NOTE: be warned, the API of the client library is very likely to change

type K8sApi =
  | ApiextensionsV1beta1Api
  | AppsV1Api
  | CoreApi
  | CoreV1Api
  | ExtensionsV1beta1Api
  | NetworkingV1Api
  | PolicyV1beta1Api
  | RbacAuthorizationV1Api
type K8sApiConstructor<T extends K8sApi> = new (basePath?: string) => T

const apiTypes: { [key: string]: K8sApiConstructor<any> } = {
  apiExtensions: ApiextensionsV1beta1Api,
  apis: ApisApi,
  apps: AppsV1Api,
  core: CoreV1Api,
  coreApi: CoreApi,
  extensions: ExtensionsV1beta1Api,
  networking: NetworkingV1Api,
  policy: PolicyV1beta1Api,
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

type WrappedList<T extends List> = T["items"] extends Array<infer V> ? KubernetesServerList<V> : KubernetesServerList

// This describes the API classes on KubeApi after they've been wrapped with KubeApi.wrapApi()
// prettier-ignore
type WrappedApi<T> = {
  // Wrap each API method
  [P in keyof T]:
  T[P] extends (...args: infer A) => Promise<{ response: IncomingMessage, body: infer U }>
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

export class KubeApi {
  public apiExtensions: WrappedApi<ApiextensionsV1beta1Api>
  public apis: WrappedApi<ApisApi>
  public apps: WrappedApi<AppsV1Api>
  public core: WrappedApi<CoreV1Api>
  public coreApi: WrappedApi<CoreApi>
  public extensions: WrappedApi<ExtensionsV1beta1Api>
  public networking: WrappedApi<NetworkingV1Api>
  public policy: WrappedApi<PolicyV1beta1Api>
  public rbac: WrappedApi<RbacAuthorizationV1Api>

  constructor(public log: LogEntry, public context: string, private config: KubeConfig) {
    const cluster = this.config.getCurrentCluster()

    if (!cluster) {
      throw new ConfigurationError(`Could not read cluster from kubeconfig for context ${context}`, {
        context,
        config,
      })
    }

    for (const [name, cls] of Object.entries(apiTypes)) {
      const api = new cls(cluster.server)
      this[name] = this.wrapApi(log, api, this.config)
    }
  }

  static async factory(log: LogEntry, ctx: PluginContext, provider: KubernetesProvider) {
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

        const info = {
          coreApi,
          groups,
          groupMap,
        }

        cachedApiInfo[this.context] = info
      }

      return cachedApiInfo[this.context]
    })
  }

  async getApiGroup(resource: KubernetesResource) {
    const apiInfo = await this.getApiInfo()
    const apiVersion = resource.apiVersion
    const group = apiInfo.groupMap[apiVersion]

    if (!group) {
      throw new KubernetesError(`Unrecognized apiVersion: ${apiVersion}`, {
        apiVersion,
        resource,
      })
    }

    return group
  }

  async getApiResourceInfo(log: LogEntry, apiVersion: string, kind: string): Promise<V1APIResource> {
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
  }: {
    log: LogEntry
    path: string
    opts?: Omit<request.OptionsWithUrl, "url">
  }): Promise<any> {
    const baseUrl = this.config.getCurrentCluster()!.server
    const url = urlJoin(baseUrl, path)

    // set some default values
    const requestOpts = {
      url,
      method: "get",
      json: true,
      resolveWithFullResponse: true,
      agent: requestAgent,
      ...opts,
    }

    // apply auth
    await this.config.applyToRequest(requestOpts)

    return await requestWithRetry(log, `Kubernetes API: ${path}`, async () => {
      try {
        log.silly(`${requestOpts.method.toUpperCase()} ${url}`)
        return await request(requestOpts)
      } catch (err) {
        throw handleRequestPromiseError(err)
      }
    })
  }

  /**
   * Fetch the specified resource from the cluster.
   */
  async read({
    log,
    namespace,
    apiVersion,
    kind,
    name,
  }: {
    log: LogEntry
    namespace: string
    apiVersion: string
    kind: string
    name: string
  }) {
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

  /**
   * Given a manifest, attempt to read the matching resource from the cluster.
   */
  async readBySpec({ log, namespace, manifest }: { log: LogEntry; namespace: string; manifest: KubernetesResource }) {
    log.silly(`Fetching Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${manifest.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest, log, namespace })

    const res = await this.request({ log, path: apiPath })
    return res.body
  }

  /**
   * Same as readBySpec() but returns null if the resource is missing.
   */
  async readOrNull(params: { log: LogEntry; namespace: string; manifest: KubernetesResource }) {
    try {
      const resource = await this.readBySpec(params)
      return resource
    } catch (err) {
      if (err.statusCode === 404) {
        return null
      } else {
        throw err
      }
    }
  }

  async listResources<T extends KubernetesResource>({
    log,
    apiVersion,
    kind,
    namespace,
    labelSelector,
  }: {
    log: LogEntry
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

  async replace({
    log,
    resource,
    namespace,
  }: {
    log: LogEntry
    resource: KubernetesServerResource
    namespace?: string
  }) {
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
    log: LogEntry
    resource: KubernetesServerResource
    annotations: StringMap
  }) {
    // TODO: use patch instead of replacing (it's weirdly complex, unfortunately)
    resource.metadata.annotations = { ...resource.metadata.annotations, ...annotations }
    await this.replace({ log, resource })
    return resource
  }

  async deleteBySpec({ namespace, manifest, log }: { namespace: string; manifest: KubernetesResource; log: LogEntry }) {
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
    log: LogEntry
    namespace: string
  }) {
    const resourceInfo = await this.getApiResourceInfo(log, apiVersion, kind)

    if (!resourceInfo) {
      const err = new KubernetesError(`Unrecognized resource type ${apiVersion}/${kind}`, {
        apiVersion,
        kind,
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
    log: LogEntry
    namespace?: string
  }) {
    const apiVersion = manifest.apiVersion

    if (!apiVersion) {
      throw new KubernetesError(`Missing apiVersion on resource`, {
        manifest,
      })
    }

    if (!namespace) {
      namespace = manifest.metadata?.namespace
    }

    if (!namespace) {
      throw new KubernetesError(`Missing namespace on resource and no namespace specified`, {
        manifest,
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
    log: LogEntry
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
    } catch (err) {
      if (err.statusCode === 404) {
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
        throw err
      }
    }
  }

  /**
   * Wrapping the API objects to deal with bugs.
   */
  private wrapApi<T extends K8sApi>(log: LogEntry, api: T, config: KubeConfig): T {
    api.setDefaultAuthentication(config)

    api.addInterceptor((opts) => {
      opts.agent = requestAgent
    })

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
                    throw wrapError(err)
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
  }): Promise<{ exitCode?: number; allLogs: string; stdout: string; stderr: string; timedOut: boolean }> {
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

    const execHandler = new Exec(this.config, new WebSocketHandler(this.config))

    return new Promise((resolve, reject) => {
      let done = false

      const finish = (timedOut: boolean, exitCode?: number) => {
        !done &&
          resolve({
            allLogs: combinedCollector.getString(),
            stdout: stdoutCollector.getString(),
            stderr: stderrCollector.getString(),
            timedOut,
            exitCode,
          })
        done = true
      }

      if (timeoutSec) {
        setTimeout(() => {
          !done && finish(true)
        }, timeoutSec * 1000)
      }

      execHandler
        .exec(namespace, podName, containerName, command, _stdout, _stderr, stdin || null, tty, (status) => {
          finish(false, getExecExitCode(status))
        })
        .then((ws) => {
          ws.on("error", (err) => {
            !done && reject(err)
            done = true
          })
        })
        .catch(reject)
    })
  }

  /**
   * Attach to the specified Pod and container.
   *
   * Warning: Do not use tty=true unless you're actually attaching to a terminal, since collecting output will not work.
   */
  async attachToPod({
    namespace,
    podName,
    containerName,
    stdout,
    stderr,
    stdin,
    tty,
  }: {
    namespace: string
    podName: string
    containerName: string
    stdout?: Writable
    stderr?: Writable
    stdin?: Readable
    tty: boolean
  }) {
    const handler = new Attach(this.config, new WebSocketHandler(this.config))
    return handler.attach(namespace, podName, containerName, stdout || null, stderr || null, stdin || null, tty)
  }

  getLogger() {
    return new Log(this.config)
  }

  /**
   * Create an ad-hoc Pod. Use this method to handle race-condition cases when creating Pods.
   */
  async createPod(namespace: string, pod: KubernetesPod) {
    try {
      await this.core.createNamespacedPod(namespace, pod)
    } catch (error) {
      // This can occur in laggy environments, just need to retry
      if (error.message.includes("No API token found for service account")) {
        await sleep(500)
        return this.createPod(namespace, pod)
      } else {
        throw new KubernetesError(`Failed to create Pod ${pod.metadata.name}: ${error.message}`, { error })
      }
    }
  }
}

function getGroupBasePath(apiVersion: string) {
  // Of course, Kubernetes helpfully uses a singular for the core API and not everything else. So there you go.
  return apiVersion.includes("/") ? `/apis/${apiVersion}` : `/api/${apiVersion}`
}

export async function getKubeConfig(log: LogEntry, ctx: PluginContext, provider: KubernetesProvider) {
  let kubeConfigStr: string

  try {
    if (provider.config.kubeconfig) {
      kubeConfigStr = (await readFile(provider.config.kubeconfig)).toString()
    } else {
      // We use kubectl for this, to support merging multiple paths in the KUBECONFIG env var
      kubeConfigStr = await kubectl(ctx, provider).stdout({ log, args: ["config", "view", "--raw"] })
    }
    return safeLoad(kubeConfigStr)!
  } catch (error) {
    throw new RuntimeError(`Unable to load kubeconfig: ${error}`, {
      error,
    })
  }
}

async function getContextConfig(log: LogEntry, ctx: PluginContext, provider: KubernetesProvider): Promise<KubeConfig> {
  const kubeconfigPath = provider.config.kubeconfig
  const context = provider.config.context
  const cacheKey = kubeconfigPath ? `${kubeconfigPath}:${context}` : context

  if (cachedConfigs[cacheKey]) {
    return cachedConfigs[cacheKey]
  }

  const rawConfig = await getKubeConfig(log, ctx, provider)
  const kc = new KubeConfig()

  // There doesn't appear to be a method to just load the parsed config :/
  kc.loadFromString(safeDumpYaml(rawConfig))
  kc.setCurrentContext(context)

  cachedConfigs[cacheKey] = kc

  return kc
}

function wrapError(err: any) {
  if (!err.message || err.name === "HttpError") {
    const response = err.response || {}
    const body = response.body || err.body
    const wrapped = new KubernetesError(`Got error from Kubernetes API - ${body.message}`, {
      body,
      request: omitBy(response.request, (v, k) => isObject(v) || k[0] === "_"),
    })
    wrapped.statusCode = err.statusCode
    return wrapped
  } else {
    return err
  }
}

function handleRequestPromiseError(err: Error) {
  if (err instanceof requestErrors.StatusCodeError) {
    const wrapped = new KubernetesError(`StatusCodeError from Kubernetes API - ${err.message}`, {
      body: err.error,
    })
    wrapped.statusCode = err.statusCode

    return wrapped
  } else {
    return wrapError(err)
  }
}

/**
 * Helper function for retrying failed k8s API requests, using exponential backoff.
 *
 * Note: When using the Got library, don't use this helper, but instead rely on Got's built-in retry functionality.
 *
 * Only retries the request when it fails with an error that matches certain status codes and/or error
 * message contents (see the `shouldRetry` helper for details).
 *
 * The rationale here is that some errors occur because of network issues, intermittent timeouts etc.
 * and should be retried automatically.
 */
async function requestWithRetry<R>(
  log: LogEntry,
  description: string,
  req: () => Promise<R>,
  opts?: { maxRetries?: number; minTimeoutMs?: number }
): Promise<R> {
  const maxRetries = opts?.maxRetries || 5
  const minTimeoutMs = opts?.minTimeoutMs || 500
  let retryLog: LogEntry | undefined = undefined
  const retry = async (usedRetries: number): Promise<R> => {
    try {
      return await req()
    } catch (err) {
      if (shouldRetry(err)) {
        retryLog = retryLog || log.debug("")
        if (usedRetries <= maxRetries) {
          const sleepMsec = minTimeoutMs + usedRetries * minTimeoutMs
          retryLog.setState(deline`
            ${description} failed with error ${err.message}, retrying in ${sleepMsec}ms
            (${usedRetries}/${maxRetries})
          `)
          await sleep(sleepMsec)
          return await retry(usedRetries + 1)
        } else {
          if (usedRetries === maxRetries) {
            retryLog.setState(chalk.red(`Kubernetes API: Maximum retry count exceeded`))
          }
          throw err
        }
      } else {
        throw err
      }
    }
  }
  const result = await retry(1)
  return result
}

/**
 * This helper determines whether an error thrown by a k8s API request should result in the request being retried.
 *
 * Looks for a list of matching error messages. Also checks for status codes for the following error classes:
 * - `KubernetesError` (when handling wrapped k8s API errors)
 * - `requestErrors.StatusCodeError` (when using the `request` library)
 *
 * Add more error codes / regexes / filters etc. here as needed.
 */
function shouldRetry(err: any): boolean {
  const msg = err.message || ""
  let code: number | undefined = undefined
  if (err instanceof requestErrors.StatusCodeError || err instanceof KubernetesError) {
    code = err.statusCode
  }
  return (code && statusCodesForRetry.includes(code)) || !!errorMessageRegexesForRetry.find((regex) => msg.match(regex))
}

const statusCodesForRetry: number[] = [
  httpStatusCodes.REQUEST_TIMEOUT,
  httpStatusCodes.TOO_MANY_REQUESTS,
  httpStatusCodes.BAD_GATEWAY,
  httpStatusCodes.SERVICE_UNAVAILABLE,
  httpStatusCodes.GATEWAY_TIMEOUT,

  // Clouflare-specific status codes
  521, // Web Server Is Down
  522, // Connection Timed Out
  524, // A Timeout Occurred
]

const errorMessageRegexesForRetry = [/ETIMEDOUT/, /ENOTFOUND/, /EAI_AGAIN/]
