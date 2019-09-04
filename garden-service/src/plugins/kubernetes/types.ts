/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  KubernetesObject,
  V1DaemonSet,
  V1Deployment,
  V1ObjectMeta,
  V1ReplicaSet,
  V1StatefulSet,
  V1Pod,
  V1ListMeta,
} from "@kubernetes/client-node"

import { Omit } from "../../util/util"

export interface BaseResource {
  apiVersion: string
  kind: string
  metadata: Partial<V1ObjectMeta> & {
    name: string
  }
}

// Because the Kubernetes API library types currently list all keys as optional, we use this type to wrap the
// library types and make some fields required that are always required in the API.
export type KubernetesResource<T extends BaseResource | KubernetesObject = BaseResource> =
  // Make these always required
  {
    apiVersion: string
    kind: string
    metadata: Partial<V1ObjectMeta> & {
      name: string
    }
    // We add this here for convenience because it's so frequently checked on untyped resources
    spec?: any
  } & Omit<T, "apiVersion" | "kind" | "metadata"> &
    // Make sure these are required if they're on the provided type
    {
      [P in Extract<keyof T, "spec">]: Exclude<T[P], undefined>
    }

// Server-side resources always have some fields set if they're in the schema, e.g. status
export type KubernetesServerResource<T extends BaseResource | KubernetesObject = BaseResource> = KubernetesResource<T> &
  // Make sure these are required if they're on the provided type
  {
    [P in Extract<keyof T, "status">]: Exclude<T[P], undefined>
  }

export type KubernetesList<T extends BaseResource | KubernetesObject = BaseResource> = {
  apiVersion: string
  kind: string
  metadata: Partial<V1ListMeta> & {
    name: string
  }
  items: Array<KubernetesResource<T>>
}

export type KubernetesServerList<T extends BaseResource | KubernetesObject = BaseResource> = {
  apiVersion: string
  kind: string
  metadata: Partial<V1ListMeta> & {
    name: string
  }
  items: Array<KubernetesServerResource<T>>
}

// Pre-wrapping some common types here
export type KubernetesDaemonSet = KubernetesResource<V1DaemonSet>
export type KubernetesDeployment = KubernetesResource<V1Deployment>
export type KubernetesReplicaSet = KubernetesResource<V1ReplicaSet>
export type KubernetesStatefulSet = KubernetesResource<V1StatefulSet>
export type KubernetesPod = KubernetesResource<V1Pod>

export type KubernetesWorkload =
  | KubernetesResource<V1DaemonSet>
  | KubernetesResource<V1Deployment>
  | KubernetesResource<V1ReplicaSet>
  | KubernetesResource<V1StatefulSet>
