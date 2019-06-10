/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "url"
import {
  KubeConfig,
  Core_v1Api,
  Extensions_v1beta1Api,
  RbacAuthorization_v1Api,
  Apps_v1Api,
  Apiextensions_v1beta1Api,
  V1Secret,
  Policy_v1beta1Api,
  Storage_v1Api,
  CoreApi,
  ApisApi,
  V1APIGroup,
  V1APIVersions,
  V1APIResource,
} from "@kubernetes/client-node"
import AsyncLock = require("async-lock")
import request = require("request-promise")
import requestErrors = require("request-promise/errors")
import { safeLoad, safeDump } from "js-yaml"

import { Omit } from "../../util/util"
import { zip, omitBy, isObject, keyBy } from "lodash"
import { GardenBaseError, RuntimeError, ConfigurationError } from "../../exceptions"
import { KubernetesResource } from "./types"
import { LogEntry } from "../../logger/log-entry"
import { kubectl } from "./kubectl"

interface ApiGroupMap {
  [groupVersion: string]: V1APIGroup
}

interface ApiResourceMap {
  [kind: string]: V1APIResource
}

interface ApiInfo {
  coreApi: V1APIVersions
  groups: V1APIGroup[]
  groupMap: ApiGroupMap
  resources: { [group: string]: ApiResourceMap }
}

interface ApiResourceInfo {
  group: V1APIGroup
  resource: V1APIResource
}

const cachedConfigs: { [context: string]: KubeConfig } = {}
const cachedApiInfo: { [context: string]: ApiInfo } = {}
const apiInfoLock = new AsyncLock()

// NOTE: be warned, the API of the client library is very likely to change

type K8sApi = Core_v1Api
  | Extensions_v1beta1Api
  | RbacAuthorization_v1Api
  | Apps_v1Api
  | Apiextensions_v1beta1Api
  | Policy_v1beta1Api
type K8sApiConstructor<T extends K8sApi> = new (basePath?: string) => T

const apiTypes: { [key: string]: K8sApiConstructor<any> } = {
  apiExtensions: Apiextensions_v1beta1Api,
  apis: ApisApi,
  apps: Apps_v1Api,
  core: Core_v1Api,
  coreApi: CoreApi,
  extensions: Extensions_v1beta1Api,
  policy: Policy_v1beta1Api,
  rbac: RbacAuthorization_v1Api,
  storage: Storage_v1Api,
}

const crudMap = {
  Secret: {
    type: V1Secret,
    group: "core",
    read: "readNamespacedSecret",
    create: "createNamespacedSecret",
    patch: "patchNamespacedSecret",
    delete: "deleteNamespacedSecret",
  },
}

type CrudMapType = typeof crudMap

export class KubernetesError extends GardenBaseError {
  type = "kubernetes"

  code?: number
  response?: any
}

export class KubeApi {
  public apiExtensions: Apiextensions_v1beta1Api
  public apis: ApisApi
  public apps: Apps_v1Api
  public core: Core_v1Api
  public coreApi: CoreApi
  public extensions: Extensions_v1beta1Api
  public policy: Policy_v1beta1Api
  public rbac: RbacAuthorization_v1Api

  constructor(public context: string, private config: KubeConfig) {
    const cluster = this.config.getCurrentCluster()

    if (!cluster) {
      throw new ConfigurationError(`Could not read cluster from kubeconfig for context ${context}`, {
        context,
        config,
      })
    }

    for (const [name, cls] of Object.entries(apiTypes)) {
      const api = new cls(cluster.server)
      this[name] = this.proxyApi(api, this.config)
    }
  }

  static async factory(log: LogEntry, context: string) {
    const config = await getContextConfig(log, context)
    return new KubeApi(context, config)
  }

  async getApiInfo(): Promise<ApiInfo> {
    if (cachedApiInfo[this.context]) {
      return cachedApiInfo[this.context]
    }

    return apiInfoLock.acquire(this.context, async () => {
      if (cachedApiInfo[this.context] === undefined) {
        const coreApi = await this.coreApi.getAPIVersions()
        const apis = await this.apis.getAPIVersions()

        const coreGroups: V1APIGroup[] = coreApi.body.versions.map(version => ({
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
          serverAddressByClientCIDRs: coreApi.body.serverAddressByClientCIDRs,
        }))

        const groups = coreGroups.concat(apis.body.groups)
        const groupMap: ApiGroupMap = {}

        for (const group of groups) {
          for (const version of group.versions) {
            groupMap[version.groupVersion] = group
          }
        }

        const info = {
          coreApi: coreApi.body,
          groups,
          groupMap,
          resources: {},
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

  async getApiResourceInfo(log: LogEntry, manifest: KubernetesResource): Promise<ApiResourceInfo> {
    const apiInfo = await this.getApiInfo()
    const group = await this.getApiGroup(manifest)
    const groupId = group.preferredVersion.groupVersion

    const lockKey = `${this.context}/${groupId}`
    const resourceMap = apiInfo.resources[groupId] || await apiInfoLock.acquire(lockKey, async () => {
      if (apiInfo.resources[groupId]) {
        return apiInfo.resources[groupId]
      }

      log.debug(`Kubernetes: Getting API resource info for group ${groupId}`)
      const res = await this.request(log, getGroupBasePath(groupId))

      // We're only interested in the entities themselves, not the sub-resources
      const resources = res.body.resources.filter(r => !r.name.includes("/"))

      apiInfo.resources[groupId] = keyBy(resources, "kind")
      return apiInfo.resources[groupId]
    })

    const resource = resourceMap[manifest.kind]

    if (!resource) {
      throw new KubernetesError(`Unrecognized resource type ${manifest.apiVersion}/${manifest.kind}`, {
        manifest,
      })
    }

    return { group, resource }
  }

  async request(log: LogEntry, path: string, opts: Omit<request.OptionsWithUrl, "url"> = {}): Promise<any> {
    const baseUrl = this.config.getCurrentCluster()!.server
    const url = resolve(baseUrl, path)

    // set some default values
    const requestOpts = {
      url,
      method: "get",
      json: true,
      resolveWithFullResponse: true,
      ...opts,
    }

    // apply auth
    this.config.applyToRequest(requestOpts)

    try {
      log.silly(`GET ${url}`)
      return await request(requestOpts)
    } catch (err) {
      throw handleRequestPromiseError(err)
    }
  }

  async readBySpec(namespace: string, manifest: KubernetesResource, log: LogEntry) {
    const name = manifest.metadata.name
    log.silly(`Fetching Kubernetes resource ${manifest.apiVersion}/${manifest.kind}/${name}`)

    const { group, resource } = await this.getApiResourceInfo(log, manifest)
    const groupId = group.preferredVersion.groupVersion
    const basePath = getGroupBasePath(groupId)

    const apiPath = resource.namespaced
      ? `${basePath}/namespaces/${namespace}/${resource.name}/${name}`
      : `${basePath}/${resource.name}/${name}`

    return this.request(log, apiPath)
  }

  async upsert<K extends keyof CrudMapType>(
    kind: K, namespace: string, obj: KubernetesResource,
  ): Promise<KubernetesResource> {
    const api = this[crudMap[kind].group]

    try {
      const res = await api[crudMap[kind].read](obj.metadata.name, namespace)
      return res.body
    } catch (err) {
      if (err.code === 404) {
        try {
          await api[crudMap[kind].create](namespace, <any>obj)
        } catch (err) {
          if (err.code === 409) {
            await api[crudMap[kind].patch](name, namespace, obj)
          } else {
            throw err
          }
        }
      } else {
        throw err
      }
    }

    return obj
  }

  /**
   * Wrapping the API objects to deal with bugs.
   */
  private proxyApi<T extends K8sApi>(api: T, config: KubeConfig): T {
    api.setDefaultAuthentication(config)

    return new Proxy(api, {
      get: (target: T, name: string, receiver) => {
        if (!(name in Object.getPrototypeOf(target))) { // assume methods live on the prototype
          return Reflect.get(target, name, receiver)
        }

        return function(...args) {
          const defaultHeaders = target["defaultHeaders"]

          if (name.startsWith("patch")) {
            // patch the patch bug... (https://github.com/kubernetes-client/javascript/issues/19)
            target["defaultHeaders"] = { ...defaultHeaders, "content-type": "application/strategic-merge-patch+json" }
          }

          const output = target[name](...args)
          target["defaultHeaders"] = defaultHeaders

          if (typeof output.then === "function") {
            // the API errors are not properly formed Error objects
            return output.catch((err: Error) => {
              throw wrapError(err)
            })
          } else {
            return output
          }
        }
      },
    })
  }
}

function getGroupBasePath(groupId: string) {
  // Of course, Kubernetes helpfully uses a singular for the core API and not everything else. So there you go.
  return groupId.includes("/") ? `/apis/${groupId}` : `/api/${groupId}`
}

export async function getKubeConfig(log: LogEntry) {
  let kubeConfigStr: string

  try {
    // We use kubectl for this, to support merging multiple paths in the KUBECONFIG env var
    kubeConfigStr = await kubectl.stdout({ log, args: ["config", "view", "--raw"] })
    return safeLoad(kubeConfigStr)
  } catch (error) {
    throw new RuntimeError(`Unable to load kubeconfig: ${error}`, {
      error,
    })
  }
}

async function getContextConfig(log: LogEntry, context: string): Promise<KubeConfig> {
  if (cachedConfigs[context]) {
    return cachedConfigs[context]
  }

  const rawConfig = await getKubeConfig(log)
  const kc = new KubeConfig()

  // There doesn't appear to be a method to just load the parsed config :/
  kc.loadFromString(safeDump(rawConfig))
  kc.setCurrentContext(context)

  // FIXME: need to patch a bug in the library here (https://github.com/kubernetes-client/javascript/pull/54)
  for (const [a, b] of zip(rawConfig["clusters"] || [], kc.clusters)) {
    if (a && a["cluster"]["insecure-skip-tls-verify"] === true) {
      (<any>b).skipTLSVerify = true
    }
  }

  cachedConfigs[context] = kc

  return kc
}

function wrapError(err) {
  if (!err.message) {
    const wrapped = new KubernetesError(`Got error from Kubernetes API - ${err.body.message}`, {
      body: err.body,
      request: omitBy(err.response.request, (v, k) => isObject(v) || k[0] === "_"),
    })
    wrapped.code = err.response.statusCode
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
    wrapped.code = err.statusCode

    return wrapped
  } else {
    return wrapError(err)
  }
}
