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
import { join } from "path"
import request = require("request")
import { readFileSync, pathExistsSync } from "fs-extra"
import { safeLoad } from "js-yaml"
import { zip, omitBy, isObject } from "lodash"
import { GardenBaseError } from "../../exceptions"
import { homedir } from "os"
import { KubernetesProvider } from "./kubernetes"
import { KubernetesResource } from "./types"
import * as dedent from "dedent"

let kubeConfigStr: string
let kubeConfig: any

const configs: { [context: string]: KubeConfig } = {}

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
  public context: string
  private config: KubeConfig

  public apiExtensions: Apiextensions_v1beta1Api
  public apps: Apps_v1Api
  public core: Core_v1Api
  public extensions: Extensions_v1beta1Api
  public policy: Policy_v1beta1Api
  public rbac: RbacAuthorization_v1Api

  constructor(public provider: KubernetesProvider) {
    this.context = provider.config.context
    this.config = getConfig(this.context)

    for (const [name, cls] of Object.entries(apiTypes)) {
      const api = new cls(this.config.getCurrentCluster()!.server)
      this[name] = this.proxyApi(api, this.config)
    }
  }

  async readBySpec(namespace: string, spec: KubernetesResource) {
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
        const apiVersion = spec.apiVersion
        const url = `${this.config.getCurrentCluster()!.server}/apis/${apiVersion}` +
          `/namespaces/${namespace}/${spec.kind.toLowerCase()}/${name || spec.metadata.name}`

        const opts: request.Options = { method: "get", url, json: true }
        this.config.applyToRequest(opts)

        return request(opts)
    }
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
  private proxyApi<T extends K8sApi>(api: T, config): T {
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

function getConfig(context: string): KubeConfig {
  const kubeConfigPath = process.env.KUBECONFIG || join(homedir(), ".kube", "config")

  if (pathExistsSync(kubeConfigPath)) {
    kubeConfigStr = readFileSync(kubeConfigPath).toString()
  } else {
    // Fall back to a blank kubeconfig if none is found
    kubeConfigStr = dedent`
      apiVersion: v1
      kind: Config
      clusters: []
      contexts: []
      preferences: {}
      users: []
    `
  }
  kubeConfig = safeLoad(kubeConfigStr)

  if (!configs[context]) {
    const kc = new KubeConfig()

    kc.loadFromString(kubeConfigStr)
    kc.setCurrentContext(context)

    // FIXME: need to patch a bug in the library here (https://github.com/kubernetes-client/javascript/pull/54)
    for (const [a, b] of zip(kubeConfig["clusters"] || [], kc.clusters)) {
      if (a && a["cluster"]["insecure-skip-tls-verify"] === true) {
        (<any>b).skipTLSVerify = true
      }
    }

    configs[context] = kc
  }

  return configs[context]
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
