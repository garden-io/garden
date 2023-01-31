// This file contains functions that are being used in multiple different scripts.

import execa from "execa";
import { mapValues, pickBy } from "lodash";
import minimatch from "minimatch"
import { resolve } from "path"

export const yarnPath = resolve(__dirname, "..", ".yarn", "releases", "yarn-1.22.5.js")

export async function getPackages({ scope, ignore }: { scope?: string; ignore?: string } = {}) {
  let packages = JSON.parse((await execa("node", [yarnPath, "--silent", "workspaces", "info"])).stdout)

  if (scope) {
    packages = pickBy(packages, (_, k) => minimatch(k, scope))
  }

  if (ignore) {
    packages = pickBy(packages, (_, k) => !minimatch(k, ignore))
  }

  return mapValues(packages, (p, k) => {
    const location = resolve(__dirname, "..", p.location)
    return {
      ...p,
      name: k,
      location,
      packageJson: require(resolve(location, "package.json")),
      shortName: k.split("/")[1],
    }
  })
}
