/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ReadStream } from "tty"
import type {
  ApiType,
  AuthMethodsConfiguration,
  Configuration,
  KubernetesObject,
  V1APIGroup,
  V1APIResource,
  V1APIVersions,
} from "@kubernetes/client-node"
import {
  ApiextensionsV1Api,
  ApisApi,
  AppsV1Api,
  CoreApi,
  CoreV1Api,
  Exec,
  KubeConfig,
  Log as K8sLog,
  NetworkingV1Api,
  PolicyV1Api,
  RbacAuthorizationV1Api,
  V1Deployment,
  V1Secret,
  V1Service,
  V1ServiceAccount,
  ServerConfiguration,
  createConfiguration,
} from "@kubernetes/client-node"
import { load } from "js-yaml"
import fsExtra from "fs-extra"

const { readFile } = fsExtra
import type WebSocket from "isomorphic-ws"
import pRetry from "p-retry"
import { StringCollector } from "../../util/util.js"
import { flatten, keyBy } from "lodash-es"
import type { GardenErrorParams, NodeJSErrnoException } from "../../exceptions.js"
import { ConfigurationError, GardenError, InternalError, RuntimeError } from "../../exceptions.js"
import type {
  BaseResource,
  KubernetesList,
  KubernetesPod,
  KubernetesResource,
  KubernetesServerList,
  KubernetesServerResource,
} from "./types.js"
import type { Log } from "../../logger/log-entry.js"
import { kubectl } from "./kubectl.js"
import type { KubernetesProvider } from "./config.js"
import type { StringMap } from "../../config/common.js"
import type { PluginContext } from "../../plugin-context.js"
import type { Readable, Writable } from "stream"
import { PassThrough } from "stream"
import { getExecExitCode } from "./status/pod.js"
import { labelSelectorToString } from "./util.js"
import { safeDumpYaml } from "../../util/serialization.js"
import AsyncLock from "async-lock"
import type { RetryOpts } from "./retry.js"
import { requestWithRetry, toKubernetesError } from "./retry.js"
import type { Response, RequestInit } from "node-fetch"
import fetch, { FetchError } from "node-fetch"
import type { RequestOptions } from "http"
import https from "node:https"
import http from "node:http"
import { ProxyAgent } from "proxy-agent"
import { type MaybeSecret, toClearText } from "../../util/secrets.js"
import type { ConfigurationOptions } from "@kubernetes/client-node/dist/gen/configuration.js"

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
  | ApisApi
  | ApiextensionsV1Api
  | AppsV1Api
  | CoreApi
  | CoreV1Api
  | NetworkingV1Api
  | PolicyV1Api
  | RbacAuthorizationV1Api

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
  ServiceAccount: {
    cls: new V1ServiceAccount(),
    group: "core",
    read: "readNamespacedServiceAccount",
    create: "createNamespacedServiceAccount",
    replace: "replaceNamespacedServiceAccount",
    delete: "deleteNamespacedServiceAccount",
    patch: "patchNamespacedServiceAccount",
  },
}

type CrudMap = typeof crudMap
type CrudMapTypes = { [T in keyof CrudMap]: CrudMap[T]["cls"] }

export class KubernetesError extends GardenError {
  type = "kubernetes"

  /**
   * HTTP response status code
   */
  responseStatusCode: number | undefined

  /**
   * If the Kubernetes API response body contained a message, it will be stored here.
   */
  apiMessage: string | undefined

  constructor(params: GardenErrorParams & { responseStatusCode?: number; apiMessage?: string }) {
    super(params)

    this.responseStatusCode = params.responseStatusCode
    this.apiMessage = params.apiMessage
  }
}

interface List {
  items?: Array<any>
}

type WrappedList<T extends List> =
  T["items"] extends Array<infer V extends BaseResource | KubernetesObject>
    ? KubernetesServerList<V>
    : KubernetesServerList

// This describes the API classes on KubeApi after they've been wrapped with KubeApi.wrapApi()
// prettier-ignore
type WrappedApi<T> = {
  // Wrap each API method
  [P in keyof T]:
  T[P] extends (...args: infer A) => Promise<infer U>
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
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

/**
 * The ProxyAgent class ensures that HTTP_PROXY, NO_PROXY and HTTPS_PROXY environment variables are respected.
 *
 * @param agent http.Agent | https.Agent | undefined
 * @returns ProxyAgent
 */
async function createProxyAgent(agent: RequestInit["agent"]): Promise<ProxyAgent> {
  if (agent instanceof https.Agent) {
    return new ProxyAgent(agent.options)
  } else if (agent instanceof http.Agent || agent === undefined) {
    // no options to apply
    return new ProxyAgent()
  } else {
    throw new InternalError({ message: `createProxyAgent: Unhandled agent type: ${agent}` })
  }
}

type ApiConstructor<T extends ApiType> = new (config: Configuration) => T

/**
 * We need this hack to enable the middleware that is already configure in api.core.
 *
 * Otherwise, the middleware will be completely ignore because of the bug in the @kubernetes/client-node,
 * see the function patchNamespaceWithHttpInfo in ObservableAPI.js
 * and the following issues:
 *  - https://github.com/kubernetes-client/javascript/issues/2160#issuecomment-2620169494
 *  - https://github.com/kubernetes-client/javascript/issues/2264#issuecomment-2826382923
 *
 *  Waiting for https://github.com/kubernetes-client/javascript/issues/2264 to be fixed properly.
 */
export function getConfigOptionsForPatchRequest(): ConfigurationOptions {
  return { middleware: [], middlewareMergeStrategy: "append" }
}

function makeApiClient<T extends ApiType>(kubeConfig: KubeConfig, apiClientType: ApiConstructor<T>): T {
  const cluster = kubeConfig.getCurrentCluster()
  if (!cluster) {
    throw new InternalError({ message: "No active cluster" })
  }
  const authConfig: AuthMethodsConfiguration = {
    default: kubeConfig,
  }
  const baseServerConfig: ServerConfiguration<{}> = new ServerConfiguration<{}>(cluster.server, {})
  const config: Configuration = createConfiguration({
    baseServer: baseServerConfig,
    authMethods: authConfig,
    promiseMiddleware: [
      {
        pre: async (context) => {
          // patch the patch bug... (https://github.com/kubernetes-client/javascript/issues/19)
          // See also https://github.com/kubernetes-client/javascript/pull/1341 (That's why we have to use the fork)
          if (context.getHttpMethod() === "PATCH") {
            context.setHeaderParam("Content-Type", "application/merge-patch+json")
          }

          const agent = await createProxyAgent(context.getAgent())
          context.setAgent(agent)

          return context
        },
        post: async (context) => context,
      },
    ],
  })

  const apiClient = new apiClientType(config)

  return apiClient
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
      })
    }

    this.apis = this.wrapApi(log, makeApiClient(config, ApisApi))

    this.apis = this.wrapApi(log, makeApiClient(config, ApisApi))
    this.apps = this.wrapApi(log, makeApiClient(config, AppsV1Api))
    this.core = this.wrapApi(log, makeApiClient(config, CoreV1Api))
    this.coreApi = this.wrapApi(log, makeApiClient(config, CoreApi))
    this.extensions = this.wrapApi(log, makeApiClient(config, ApiextensionsV1Api))
    this.networking = this.wrapApi(log, makeApiClient(config, NetworkingV1Api))
    this.policy = this.wrapApi(log, makeApiClient(config, PolicyV1Api))
    this.rbac = this.wrapApi(log, makeApiClient(config, RbacAuthorizationV1Api))
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
          const body = (await res.json()) as any

          // We're only interested in the entities themselves, not the sub-resources
          const resources = body.resources.filter((r: any) => !r.name.includes("/"))

          apiResources[apiVersion] = keyBy(resources, "kind")
          return apiResources[apiVersion]
        } catch (err) {
          if (!(err instanceof KubernetesError)) {
            throw err
          }
          if (err.responseStatusCode === 404) {
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
    opts?: { body?: any; method?: string; query?: Record<string, string> }
    retryOpts?: RetryOpts
  }): Promise<Response> {
    const baseUrl = this.config.getCurrentCluster()!.server

    // When using URL with a base path, the merging of the paths doesn't work as you are used to from most node request libraries.
    // It uses the semantics of browser URLs where a path starting with `/` is seen as absolute and thus it does not get merged with the base path.
    // See: https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_URL#absolute_urls_vs._relative_urls
    // Similarly, when the base path does not ends with a `/`, the last path segment is seen as a resource and also removed from the joined path.
    // That's why we need to remove the leading `/` from the path and ensure that the base path ends with a `/`.

    const relativePath = path.replace(/^\//, "")
    const absoluteBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"

    const url = new URL(relativePath, absoluteBaseUrl)

    for (const [key, value] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(key, value)
    }

    const context = `Kubernetes API: ${url}`
    return await requestWithRetry(
      log,
      context,
      async () => {
        // set some default values
        const requestOptions: RequestOptions & { method: string } = {
          method: opts.method ?? "GET",
        }

        // apply auth
        const fetchOptions = await this.config.applyToFetchOptions(requestOptions)

        if (opts.body) {
          fetchOptions.body = JSON.stringify(opts.body)
          // We can't use instanceof, because the kubernetes client uses a different version of node-fetch
          if (typeof fetchOptions.headers?.["set"] !== "function") {
            // The kubernetes client library returns Headers instance, instead of a plain object (the type is wrong)
            // might change when we update the library in the future, hence the internal error.
            throw new InternalError({ message: `Expected Headers instance, got ${fetchOptions.headers}` })
          }
          ;(fetchOptions.headers as unknown as Headers).set("content-type", "application/json")
        }

        fetchOptions.agent = await createProxyAgent(fetchOptions.agent)

        try {
          log.silly(() => `${requestOptions.method.toUpperCase()} ${url}`)
          const response = await fetch(url, fetchOptions)

          if (response.status >= 400) {
            const body = (await response.text()) as any
            let message: string
            try {
              const parsedBody = JSON.parse(body)
              message = parsedBody.message
            } catch (err) {
              if (err instanceof SyntaxError) {
                message = body
              } else {
                throw err
              }
            }
            throw new KubernetesError({
              message: `Request failed with response code ${response.status}: ${context}. Message from the API: ${message}`,
              responseStatusCode: response.status,
              apiMessage: message,
            })
          }

          return response
        } catch (err) {
          if (err instanceof FetchError) {
            if (err.cause) {
              throw toKubernetesError(err.cause, context)
            } else {
              throw new KubernetesError({
                message: `Request failed: ${context}: ${err.message}`,
                code: err.code as NodeJSErrnoException["code"],
              })
            }
          }

          // use toKubernetesError for all other errors
          throw toKubernetesError(err, context)
        }
      },
      retryOpts
    )
  }

  /**
   * Fetch the specified resource from the cluster.
   */
  async read({ log, namespace, apiVersion, kind, name }: ReadParams): Promise<KubernetesResource> {
    log.silly(() => `Fetching Kubernetes resource ${apiVersion}/${kind}/${name}`)

    const typePath = await this.getResourceTypeApiPath({
      log,
      apiVersion,
      kind,
      namespace,
    })

    const apiPath = typePath + "/" + name

    const res = await this.request({ log, path: apiPath })
    const body = (await res.json()) as KubernetesResource
    return body
  }

  async readOrNull(params: ReadParams): Promise<KubernetesResource | null> {
    return await nullIfNotFound(() => this.read(params))
  }

  /**
   * Given a manifest, attempt to read the matching resource from the cluster.
   */
  async readBySpec({ log, namespace, manifest }: ReadBySpecParams): Promise<KubernetesResource> {
    log.silly(() => `Fetching Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${manifest.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest, log, namespace })

    const res = await this.request({ log, path: apiPath })
    const body = (await res.json()) as KubernetesResource
    return body
  }

  /**
   * Same as readBySpec() but returns null if the resource is missing.
   */
  async readBySpecOrNull(params: ReadBySpecParams): Promise<KubernetesResource | null> {
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

    const res = await this.request({
      log,
      path: apiPath,
      opts: { query: labelSelectorString ? { labelSelector: labelSelectorString } : undefined },
    })
    const list = (await res.json()) as KubernetesList<T>

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
          if (!(err instanceof KubernetesError)) {
            throw err
          }
          if (err.responseStatusCode === 404) {
            // Then this resource version + kind is not available in the cluster.
            return []
          }
          // FIXME: OpenShift: developers have more restrictions on what they can list
          // Ugly workaround right now, basically just shoving the problem under the rug.
          const openShiftForbiddenList = ["Namespace", "PersistentVolume"]
          if (err.responseStatusCode === 403 && openShiftForbiddenList.includes(kind)) {
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
    log.silly(() => `Replacing Kubernetes resource ${resource.apiVersion}/${resource.kind}/${resource.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest: resource, log, namespace })

    const res = await this.request({ log, path: apiPath, opts: { method: "put", body: resource } })
    return res
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
    log.silly(() => `Deleting Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${manifest.metadata.name}`)

    const apiPath = await this.getResourceApiPathFromManifest({ manifest, log, namespace })

    try {
      await this.request({ log, path: apiPath, opts: { method: "delete" } })
    } catch (err) {
      if (!(err instanceof KubernetesError)) {
        throw err
      }
      if (err.responseStatusCode !== 404) {
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
      })
      err.responseStatusCode = 404
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
        message: `Missing apiVersion on ${manifest.kind} resource named ${manifest.metadata.name}`,
      })
    }

    if (!namespace) {
      namespace = manifest.metadata?.namespace
    }

    if (!namespace) {
      throw new KubernetesError({
        message: `Missing namespace on ${manifest.kind} resource named ${manifest.metadata.name} and no namespace specified`,
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
      await api[crudMap[kind].read]({ name, namespace })
      if (api[crudMap[kind].replace]) {
        await api[crudMap[kind].replace]({ name, namespace, body: obj })
        log.debug(`Replaced ${kind} ${namespace}/${name}`)
      } else {
        await api[crudMap[kind].patch]({ name, namespace, body: obj })
        log.debug(`Patched ${kind} ${namespace}/${name}`)
      }
    }

    try {
      await replace()
    } catch (replaceError) {
      if (!(replaceError instanceof KubernetesError)) {
        throw replaceError
      }
      if (replaceError.responseStatusCode === 404) {
        try {
          await api[crudMap[kind].create]({ namespace, body: <any>obj })
          log.debug(`Created ${kind} ${namespace}/${name}`)
        } catch (createError) {
          if (!(createError instanceof KubernetesError)) {
            throw createError
          }
          if (createError.responseStatusCode === 409 || createError.responseStatusCode === 422) {
            await replace()
          } else {
            throw createError
          }
        }
      } else {
        throw replaceError
      }
    }
  }

  /**
   * Wrapping the API objects to deal with bugs.
   */
  private wrapApi<T extends K8sApi>(log: Log, api: T): WrappedApi<T> {
    return new Proxy(api, {
      get: (target: T, name: string, receiver) => {
        if (!(name in Object.getPrototypeOf(target))) {
          // assume methods live on the prototype
          return Reflect.get(target, name, receiver)
        }

        return (...args: any[]) => {
          return requestWithRetry(log, `Kubernetes API: ${name}`, () => {
            const output = target[name](...args)

            if (typeof output.then === "function") {
              return (
                output
                  // return the result body directly if applicable
                  .then((res: any) => {
                    // inexplicably, this API sometimes returns apiVersion and kind as undefined...
                    if (name === "listNamespacedPod" && res !== undefined && res.kind === "PodList") {
                      res.items = res.items.map((pod: any) => {
                        pod.apiVersion = "v1"
                        pod.kind = "Pod"
                        return pod
                      })
                    }

                    return res
                  })
                  // the API errors are not properly formed Error objects
                  .catch((err: Error) => {
                    throw toKubernetesError(err, name)
                  })
              )
            }

            return output
          })
        }
      },
    }) as WrappedApi<T>
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
    command: MaybeSecret[]
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
              command.map(toClearText),
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
          throw toKubernetesError(err, description)
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
        await this.core.createNamespacedPod({ namespace, body: pod })
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
          })
        },
      }
    )
  }
}

const WEBSOCKET_KEEPALIVE_INTERVAL = 5_000
const WEBSOCKET_PING_TIMEOUT = 30_000

function attachWebsocketKeepalive(ws: WebSocket): WebSocket {
  const keepAlive: NodeJS.Timeout = setInterval(() => {
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
        new KubernetesError({
          message: `Lost connection to the Kubernetes WebSocket API (Timed out after ${
            WEBSOCKET_PING_TIMEOUT / 1000
          }s)`,
        })
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

export const KUBECTL_RETRY_OPTS: RetryOpts = {
  maxRetries: 3,
  minTimeoutMs: 300,
  // forceRetry is important, because shouldRetry cannot handle ChildProcessError.
  forceRetry: true,
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
        KUBECTL_RETRY_OPTS
      )
    }
    return load(kubeConfigStr)!
  } catch (error) {
    throw new RuntimeError({
      message: `Unable to load kubeconfig: ${error}`,
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
    throw new KubernetesError({
      message: `Could not parse kubeconfig: ${err}`,
    })
  }

  cachedConfigs[cacheKey] = kc

  return kc
}
