/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { minimatch } from "minimatch"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

export type NPMWorkspaceQueryResult = {
  name: string
  location: string
  dependencies: Record<string, string>
}

export type PackageInfo = {
  name: string
  location: string
  packageJson: any
  shortName: string
  workspaceDependencies: string[]
}

export async function getPackages({ scope, ignore }: { scope?: string; ignore?: string } = {}): Promise<PackageInfo[]> {
  let packages = JSON.parse((await execa("npm", ["query", ".workspace"])).stdout) as NPMWorkspaceQueryResult[]

  if (scope) {
    packages = packages.filter(({ name }) => minimatch(name, scope))
  }

  if (ignore) {
    packages = packages.filter(({ name }) => !minimatch(name, ignore))
  }

  return Promise.all(
    packages.map(async ({ name, location, dependencies }) => {
      const resolvedLocation = resolve(moduleDirName, "..", location)
      // A dependency is considered a workspace dependency if it is also a workspace
      const workspaceDependencies = Object.keys(dependencies).filter((dependencyName) => {
        return packages.some((p) => p.name === dependencyName)
      })

      return {
        name,
        location: resolvedLocation,
        packageJson: JSON.parse(await readFile(resolve(resolvedLocation, "package.json"), "utf-8")),
        shortName: name.split("/")[1],
        workspaceDependencies,
      }
    })
  )
}
