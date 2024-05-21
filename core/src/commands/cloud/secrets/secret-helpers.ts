/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SecretResult as SecretResultApi } from "@garden-io/platform-api-types"

export interface SecretResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  environment?: {
    name: string
    id: string
  }
  user?: {
    name: string
    id: string
    vcsUsername: string
  }
}

export function makeSecretFromResponse(res: SecretResultApi): SecretResult {
  const secret = {
    name: res.name,
    id: res.id,
    updatedAt: res.updatedAt,
    createdAt: res.createdAt,
  }
  if (res.environment) {
    secret["environment"] = {
      name: res.environment.name,
      id: res.environment.id,
    }
  }
  if (res.user) {
    secret["user"] = {
      name: res.user.name,
      id: res.user.id,
      vcsUsername: res.user.vcsUsername,
    }
  }
  return secret
}
