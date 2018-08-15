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
} from "@kubernetes/client-node"
import { join } from "path"
import { readFileSync } from "fs"
import { safeLoad } from "js-yaml"
import {
  zip,
  omitBy,
  isObject,
} from "lodash"
import { GardenBaseError, ConfigurationError } from "../../exceptions"
import { KubernetesObject } from "./helm"
import { homedir } from "os"

let kubeConfigStr: string
let kubeConfig: any

const configs: { [context: string]: KubeConfig } = {}

// NOTE: be warned, the API of the client library is very likely to change

function getConfig(context: string): KubeConfig {
  if (!kubeConfigStr) {
    kubeConfigStr = readFileSync(join(homedir(), ".kube", "config")).toString()
    kubeConfig = safeLoad(kubeConfigStr)
  }

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

export function coreApi(context: string) {
  const config = getConfig(context)
  const k8sApi = new Core_v1Api(config.getCurrentCluster().server)
  return proxyApi(k8sApi, config)
}

export function extensionsApi(context: string) {
  const config = getConfig(context)
  const k8sApi = new Extensions_v1beta1Api(config.getCurrentCluster().server)
  return proxyApi(k8sApi, config)
}

export function appsApi(context: string) {
  const config = getConfig(context)
  const k8sApi = new Apps_v1Api(config.getCurrentCluster().server)
  return proxyApi(k8sApi, config)
}

export function apiExtensionsApi(context: string) {
  const config = getConfig(context)
  const k8sApi = new Apiextensions_v1beta1Api(config.getCurrentCluster().server)
  return proxyApi(k8sApi, config)
}

export function rbacApi(context: string) {
  const config = getConfig(context)
  const k8sApi = new RbacAuthorization_v1Api(config.getCurrentCluster().server)
  return proxyApi(k8sApi, config)
}

export class KubernetesError extends GardenBaseError {
  type = "kubernetes"

  code?: number
  response?: any
}

/**
 * Wrapping the API objects to deal with bugs.
 */
type K8sApi = Core_v1Api | Extensions_v1beta1Api | RbacAuthorization_v1Api | Apps_v1Api | Apiextensions_v1beta1Api

function proxyApi<T extends K8sApi>(api: T, config: KubeConfig): T {
  api.setDefaultAuthentication(config)

  const wrapError = err => {
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

  return new Proxy(api, {
    get: (target: T, name: string, receiver) => {
      if (name in Object.getPrototypeOf(target)) { // assume methods live on the prototype
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
      } else { // assume instance vars live on the target
        return Reflect.get(target, name, receiver)
      }
    },
  })
}

export async function apiReadBySpec(namespace: string, context: string, spec: KubernetesObject) {
  // this is just awful, sorry. any better ideas? - JE
  const name = spec.metadata.name

  const core = coreApi(context)
  const ext = extensionsApi(context)
  const apps = appsApi(context)
  const rbac = rbacApi(context)
  const apiext = apiExtensionsApi(context)

  switch (spec.kind) {
    case "ConfigMap":
      return core.readNamespacedConfigMap(name, namespace)
    case "Endpoints":
      return core.readNamespacedEndpoints(name, namespace)
    case "LimitRange":
      return core.readNamespacedLimitRange(name, namespace)
    case "PersistentVolumeClaim":
      return core.readNamespacedPersistentVolumeClaim(name, namespace)
    case "Pod":
      return core.readNamespacedPod(name, namespace)
    case "PodTemplate":
      return core.readNamespacedPodTemplate(name, namespace)
    case "ReplicationController":
      return core.readNamespacedReplicationController(name, namespace)
    case "ResourceQuota":
      return core.readNamespacedResourceQuota(name, namespace)
    case "Secret":
      return core.readNamespacedSecret(name, namespace)
    case "Service":
      return core.readNamespacedService(name, namespace)
    case "ServiceAccount":
      return core.readNamespacedServiceAccount(name, namespace)
    case "DaemonSet":
      return ext.readNamespacedDaemonSet(name, namespace)
    case "Deployment":
      return ext.readNamespacedDeployment(name, namespace)
    case "Ingress":
      return ext.readNamespacedIngress(name, namespace)
    case "ReplicaSet":
      return ext.readNamespacedReplicaSet(name, namespace)
    case "StatefulSet":
      return apps.readNamespacedStatefulSet(name, namespace)
    case "ClusterRole":
      return rbac.readClusterRole(name)
    case "ClusterRoleBinding":
      return rbac.readClusterRoleBinding(name)
    case "Role":
      return rbac.readNamespacedRole(name, namespace)
    case "RoleBinding":
      return rbac.readNamespacedRoleBinding(name, namespace)
    case "CustomResourceDefinition":
      return apiext.readCustomResourceDefinition(name)
    default:
      throw new ConfigurationError(`Unsupported Kubernetes spec kind: ${spec.kind}`, {
        spec,
      })
  }
}
