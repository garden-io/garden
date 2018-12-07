/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1ObjectMeta } from "@kubernetes/client-node"

export interface KubernetesResource {
  apiVersion: string
  kind: string
  metadata: Partial<V1ObjectMeta> & {
    name: string,
  }
  spec?: any
}

export interface KubeEnvVar {
  name: string
  value?: string
  valueFrom?: { fieldRef: { fieldPath: string } }
}
