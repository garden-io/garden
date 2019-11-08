/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RuntimeError } from "../../../exceptions"
import { LogEntry } from "../../../logger/log-entry"
import { exec } from "../../../util/util"

export async function configureMicrok8sAddons(log: LogEntry, addons: string[]) {
  let status = ""

  try {
    status = (await exec("microk8s.status", [])).stdout
  } catch {
    // This is caught below.
  }

  if (!status.includes("microk8s is running")) {
    throw new RuntimeError(`Unable to get microk8s status. Is the cluster installed and running?`, {
      status,
    })
  }

  const missingAddons = addons.filter((addon) => !status.includes(`${addon}: enabled`))

  if (missingAddons.length > 0) {
    log.info({ section: "microk8s", msg: `enabling required addons (${missingAddons.join(", ")})` })
    await exec("microk8s.enable", missingAddons)
  }
}
