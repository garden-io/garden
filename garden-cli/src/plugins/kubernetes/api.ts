/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeConfig, Core_v1Api, Extensions_v1beta1Api, RbacAuthorization_v1Api } from "@kubernetes/client-node"
import { join } from "path"
import { readFileSync } from "fs"
import { safeLoad } from "js-yaml"
import {
  zip,
  isFunction,
  omitBy,
} from "lodash"
import { GardenBaseError } from "../../exceptions"

let kubeConfigStr: string
let kubeConfig: any

const configs: { [context: string]: KubeConfig } = {}

// NOTE: be warned, the API of the client library is very likely to change

function getConfig(context: string): KubeConfig {
  if (!kubeConfigStr) {
    kubeConfigStr = readFileSync(process.env.KUBECONFIG || join(process.env.HOME || "/home", ".kube", "config"))
      .toString()
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
function proxyApi<T extends Core_v1Api | Extensions_v1beta1Api | RbacAuthorization_v1Api>(
  api: T, config: KubeConfig,
): T {
  api.setDefaultAuthentication(config)

  const wrapError = err => {
    if (!err.message) {
      const wrapped = new KubernetesError(`Got error from Kubernetes API - ${err.body.message}`, {
        body: err.body,
        request: omitBy(err.response.request, (v, k) => isFunction(v) || k[0] === "_"),
      })
      wrapped.code = err.response.statusCode
      wrapped.response = err.response
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
