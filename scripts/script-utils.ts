// This file contains functions that are being used in multiple different scripts.

import execa from "execa"
import minimatch from "minimatch"
import { resolve } from "path"

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

  return packages.map(({ name, location, dependencies }) => {
    const resolvedLocation = resolve(__dirname, "..", location)
    // A dependency is considered a workspace dependency if it is also a workspace
    const workspaceDependencies = Object.keys(dependencies).filter((dependencyName) => {
      return packages.some((p) => p.name === dependencyName)
    })

    return {
      name,
      location: resolvedLocation,
      packageJson: require(resolve(resolvedLocation, "package.json")),
      shortName: name.split("/")[1],
      workspaceDependencies,
    }
  })
}
