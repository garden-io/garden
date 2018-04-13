/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as K8s from "kubernetes-client"

import { DEFAULT_CONTEXT } from "./kubectl"

const cachedParams = {}

function getParams(namespace?: string) {
  let params = cachedParams[namespace || ""]

  if (!params) {
    const config = K8s.config.loadKubeconfig()
    params = <any>K8s.config.fromKubeconfig(config, DEFAULT_CONTEXT)

    params.promises = true
    params.namespace = namespace

    cachedParams[namespace || ""] = params
  }

  return params
}

export function coreApi(namespace?: string): any {
  return new K8s.Core(getParams(namespace))
}

export function extensionsApi(namespace?: string): any {
  return new K8s.Extensions(getParams(namespace))
}

export async function apiPostOrPut(api: any, name: string, body: object) {
  try {
    await api.post(body)
  } catch (err) {
    if (err.code === 409) {
      await api(name).put(body)
    } else {
      throw err
    }
  }
}

export async function apiGetOrNull(api: any, name: string) {
  try {
    return await api(name).get()
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}
