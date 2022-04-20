/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pathExists, readFile, writeFile } from "fs-extra"
import { BooleanParameter } from "../../cli/params"

export const createBaseOpts = {
  noComments: new BooleanParameter({
    help: "Set to true to disable comment generation.",
    defaultValue: false,
  }),
}

export async function addConfig(configPath: string, yaml: string) {
  let output = yaml

  if (await pathExists(configPath)) {
    const currentConfigFile = await readFile(configPath)
    output = currentConfigFile.toString()
    if (!output.endsWith("---")) {
      output += "\n\n---\n\n"
    }
    output += yaml
  }

  await writeFile(configPath, output + "\n")
}
