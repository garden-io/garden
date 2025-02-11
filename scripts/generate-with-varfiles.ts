#!/usr/bin/env -S node --import ./scripts/register-hook.js
/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-disable no-console */

import fsExtra from "fs-extra"
import { loadAll } from "js-yaml"
import { mkdirp } from "fs-extra/esm"
import { cp } from "node:fs/promises"
import { dumpYamlMulti } from "@garden-io/core/build/src/util/serialization.js"

const { readFile } = fsExtra

const projectHome = "~/Repositories/repros/project-many-varfiles"
const nUniqVarfiles = 1400

async function generateWithVarfiles() {
  const buffer = await readFile(`${projectHome}/garden.orig.yml`)
  const yamls: any[] = loadAll(buffer.toString())

  let counter = 0
  for (const yamlDoc of yamls) {
    if (counter === nUniqVarfiles) {
      break
    }

    const yaml = yamlDoc as any
    const actionName = yaml.name
    const destDir = `${projectHome}/${actionName}`
    await mkdirp(destDir)
    await cp(`${projectHome}/vars.yml`, `${destDir}/vars.yml`)

    if (yaml.varfiles) {
      yaml.varfiles = [`./${actionName}/vars.yml`]
    }

    counter++
  }
  console.log(yamls)

  await dumpYamlMulti(`${projectHome}/modified.garden.yml`, yamls)
}

;(async () => {
  try {
    await generateWithVarfiles()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
})().catch(() => {})
