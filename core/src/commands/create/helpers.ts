/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"
const { pathExists, readFile, writeFile } = fsExtra

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
