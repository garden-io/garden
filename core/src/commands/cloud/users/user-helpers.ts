/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { UserResult as UserResultApi } from "@garden-io/platform-api-types"

export interface UserResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  vcsUsername: string | null | undefined
  groups: {
    id: string
    name: string
  }[]
}

export function makeUserFromResponse(user: UserResultApi): UserResult {
  return {
    id: user.id,
    name: user.name,
    vcsUsername: user.vcsUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: user.groups.map((g) => ({ id: g.id, name: g.name })),
  }
}
