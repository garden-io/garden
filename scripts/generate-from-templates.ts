#!/usr/bin/env -S node --import ./scripts/register-hook.js
/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-disable no-console */

import { dumpYamlMulti } from "@garden-io/core/build/src/util/serialization.js"

const projectHome = "~/Repositories/garden/.repros/repro/test-dummy"
const numActions = 1000

async function generate() {
  const yamlDocs: object[] = []
  for (let i = 0; i < numActions; i++) {
    const renderConfig = {
      kind: "RenderTemplate",
      template: "dummy-template",
      name: `dummy-render-${i}`,
      inputs: {
        deployableTarget: `dev-${i}`,
      },
    }
    yamlDocs.push(renderConfig)
  }

  console.log(yamlDocs)
  await dumpYamlMulti(`${projectHome}/rendered-actions.garden.yml`, yamlDocs)
}

;(async () => {
  try {
    await generate()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
})().catch(() => {})
