/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  KubeConfig,
  Core_v1Api,
  Extensions_v1beta1Api,
  RbacAuthorization_v1Api,
  Apps_v1Api,
  Apiextensions_v1beta1Api,
  V1Secret,
  Policy_v1beta1Api,
} from "@kubernetes/client-node"
import request = require("request-promise")
import { safeLoad, safeDump } from "js-yaml"
import { zip, omitBy, isObject } from "lodash"
import { GardenBaseError, RuntimeError, ConfigurationError } from "../../exceptions"
import { KubernetesResource } from "./types"
import { LogEntry } from "../../logger/log-entry"
import { splitLast, findByName } from "../../util/util"
import { kubectl } from "./kubectl"

const cachedConfigs: { [context: string]: KubeConfig } = {}

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
  apps: Apps_v1Api,
  core: Core_v1Api,
  extensions: Extensions_v1beta1Api,
  policy: Policy_v1beta1Api,
  rbac: RbacAuthorization_v1Api,
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
  public apps: Apps_v1Api
  public core: Core_v1Api
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

  async readBySpec(namespace: string, spec: KubernetesResource, log: LogEntry) {
    // this is just awful, sorry. any better ideas? - JE
    const name = spec.metadata.name

    switch (spec.kind) {
      case "ConfigMap":
        return this.core.readNamespacedConfigMap(name, namespace)
      case "Endpoints":
        return this.core.readNamespacedEndpoints(name, namespace)
      case "LimitRange":
        return this.core.readNamespacedLimitRange(name, namespace)
      case "PersistentVolumeClaim":
        return this.core.readNamespacedPersistentVolumeClaim(name, namespace)
      case "Pod":
        return this.core.readNamespacedPod(name, namespace)
      case "PodTemplate":
        return this.core.readNamespacedPodTemplate(name, namespace)
      case "ReplicationController":
        return this.core.readNamespacedReplicationController(name, namespace)
      case "ResourceQuota":
        return this.core.readNamespacedResourceQuota(name, namespace)
      case "Secret":
        return this.core.readNamespacedSecret(name, namespace)
      case "Service":
        return this.core.readNamespacedService(name, namespace)
      case "ServiceAccount":
        return this.core.readNamespacedServiceAccount(name, namespace)
      case "DaemonSet":
        return this.extensions.readNamespacedDaemonSet(name, namespace)
      case "Deployment":
        return this.extensions.readNamespacedDeployment(name, namespace)
      case "Ingress":
        return this.extensions.readNamespacedIngress(name, namespace)
      case "ReplicaSet":
        return this.extensions.readNamespacedReplicaSet(name, namespace)
      case "StatefulSet":
        return this.apps.readNamespacedStatefulSet(name, namespace)
      case "ClusterRole":
        return this.rbac.readClusterRole(name)
      case "ClusterRoleBinding":
        return this.rbac.readClusterRoleBinding(name)
      case "Role":
        return this.rbac.readNamespacedRole(name, namespace)
      case "RoleBinding":
        return this.rbac.readNamespacedRoleBinding(name, namespace)
      case "CustomResourceDefinition":
        return this.apiExtensions.readCustomResourceDefinition(name)
      case "PodDisruptionBudget":
        return this.policy.readNamespacedPodDisruptionBudget(name, namespace)
      default:
        // Handle CRDs
        const apiVersion = spec.apiVersion
        const baseUrl = `${this.config.getCurrentCluster()!.server}/apis/${apiVersion}`

        const [group, version] = splitLast(apiVersion, "/")

        if (!group || !version) {
          throw new KubernetesError(`Invalid apiVersion ${apiVersion}`, { spec })
        }

        let url: string

        if (!group.includes(".") && group.endsWith("k8s.io")) {
          // Looks like a built-in object
          // TODO: this is awful, need to find out where to look this up...
          let plural: string

          if (spec.kind.endsWith("s")) {
            plural = spec.kind + "es"
          } else if (spec.kind.endsWith("y")) {
            plural = spec.kind.slice(0, spec.kind.length - 1) + "ies"
          } else {
            plural = spec.kind + "s"
          }
          // /apis/networking.istio.io/v1alpha3/namespaces/gis-backend/virtualservices/gis-elasticsearch-master
          // /apis/networking.istio.io/v1alpha3/namespaces/gis-backend/virtualservices/gis-elasticsearch-master
          url = spec.metadata.namespace
            ? `${baseUrl}/namespaces/${namespace}/${plural}/${name}`
            : `${baseUrl}/${plural}/${name}`

        } else {
          // Must be a CRD then...
          const crd = await this.findCrd(group, version, spec.kind)

          const plural = crd.spec.names.plural
          url = crd.spec.scope === "Namespaced"
            ? `${baseUrl}/namespaces/${namespace}/${plural}/${name}`
            : `${baseUrl}/${plural}/${name}`
        }

        log.silly(`GET ${url}`)

        const opts: request.Options = { method: "get", url, json: true, resolveWithFullResponse: true }
        this.config.applyToRequest(opts)

        try {
          return await request(opts)
        } catch (err) {
          wrapError(err)
        }
    }
  }

  async findCrd(group: string, version: string, kind: string) {
    const crds = (await this.apiExtensions.listCustomResourceDefinition()).body

    for (const crd of crds.items) {
      if (
        crd.spec.group === group &&
        crd.status.acceptedNames.kind === kind &&
        findByName(crd.spec.versions, version)
      ) {
        return crd
      }
    }

    throw new KubernetesError(`Could not find resource type ${group}/${version}/${kind}`, {
      group,
      version,
      kind,
      availableCrds: crds.items,
    })
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
            return output.catch(wrapError)
          } else {
            return output
          }
        }
      },
    })
  }
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
    throw wrapped
  } else {
    throw err
  }
}
