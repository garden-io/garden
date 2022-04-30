/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  KubernetesObject,
  V1DaemonSet,
  V1Deployment,
  V1ObjectMeta,
  V1ReplicaSet,
  V1StatefulSet,
  V1Pod,
  V1ListMeta,
  V1Ingress,
  NetworkingV1beta1Ingress,
  ExtensionsV1beta1Ingress,
} from "@kubernetes/client-node"

import type { Omit } from "../../util/util"
import type { ContainerDeployAction } from "../container/config"
import type { HelmDeployAction } from "./helm/config"
import type { KubernetesDeployAction, KubernetesRunAction, KubernetesTestAction } from "./kubernetes-type/config"

export interface BaseResource {
  apiVersion: string
  kind: string
  metadata: Partial<V1ObjectMeta> & {
    name: string
  }
  [key: string]: any
}

// Because the Kubernetes API library types currently list all keys as optional, we use this type to wrap the
// library types and make some fields required that are always required in the API.
export type KubernetesResource<T extends BaseResource | KubernetesObject = BaseResource, K = string> =
  // Make these always required
  {
    apiVersion: string
    kind: K
    metadata: Partial<V1ObjectMeta> & {
      name: string
    }
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

export type KubernetesWorkload = KubernetesResource<V1DaemonSet | V1Deployment | V1ReplicaSet | V1StatefulSet>
export type KubernetesIngress = KubernetesResource<V1Ingress | NetworkingV1beta1Ingress | ExtensionsV1beta1Ingress>

export function isPodResource(resource: KubernetesWorkload | KubernetesPod): resource is KubernetesPod {
  return resource.kind === "Pod"
}

export type SyncableResource = KubernetesWorkload | KubernetesPod
export type SyncableKind = "Deployment" | "DaemonSet" | "StatefulSet"
export const syncableKinds: string[] = ["Deployment", "DaemonSet", "StatefulSet"]

export type SupportedRuntimeActions =
  | ContainerDeployAction
  | HelmDeployAction
  | KubernetesDeployAction
  | KubernetesRunAction
  | KubernetesTestAction
