/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string.js"
import { minimatch } from "minimatch"
import pluralize from "pluralize"
import { userPrompt } from "../../util/util.js"
import { styles } from "../../logger/styles.js"

export interface DeleteResult {
  id: string | number
  status: string
}

export interface ApiCommandError {
  identifier: string | number
  message?: string
}

export function applyFilter(filter: string[], val?: string | string[]) {
  if (filter.length === 0) {
    return true
  }
  if (Array.isArray(val)) {
    return filter.find((f) => val.some((v) => minimatch(v.toLowerCase(), f.toLowerCase())))
  }
  return val && filter.find((f) => minimatch(val.toLowerCase(), f.toLowerCase()))
}

export async function confirmDelete(resource: string, count: number) {
  const msg = styles.warning(dedent`
    Warning: you are about to delete ${count} ${
      count === 1 ? resource : pluralize(resource)
    }. This operation cannot be undone.
    Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).
  `)

  const answer = await userPrompt({
    message: msg,
    type: "confirm",
    default: false,
  })

  return answer
}
