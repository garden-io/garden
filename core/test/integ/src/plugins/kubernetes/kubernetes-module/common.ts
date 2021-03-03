/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { TestGarden, dataDir, makeTestGarden } from "../../../../../helpers"

let kubernetesTestGarden: TestGarden

export async function getKubernetesTestGarden() {
  if (kubernetesTestGarden) {
    return kubernetesTestGarden
  }

  const projectRoot = resolve(dataDir, "test-projects", "kubernetes-module")
  const garden = await makeTestGarden(projectRoot)

  kubernetesTestGarden = garden

  return garden
}
