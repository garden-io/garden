#!/usr/bin/env ts-node

/**
 * Scans all package.json files in the repo and throws if one or more packages have a disallowed license
 * (i.e. GPL, other copyleft licenses).
 *
 * Stores a CSV dump
 */

import { dumpLicenses } from "npm-license-crawler"
import { join, resolve } from "path"
import { promisify } from "bluebird"
import { asTree } from "treeify"
import { stringify } from "csv-stringify/sync"
import { writeFile } from "fs-extra"

const gardenRoot = resolve(__dirname, "..")

const disallowedLicenses = [
  /^AGPL/,
  /^copyleft/,
  "CC-BY-NC",
  "CC-BY-SA",
  /^FAL/,
  /^GPL/,
]

interface LicenseDump {
  [name: string]: {
    licenses: string
    repository: string
    licenseUrl: string
    parents: string
  }
}

const dumpLicensesAsync = promisify<LicenseDump, any>(dumpLicenses)

async function checkPackageLicenses(root: string) {
  const res = await dumpLicensesAsync({ start: [root] })

  const disallowedPackages: LicenseDump = {}

  for (const [name, entry] of Object.entries(res)) {
    const licenses = entry.licenses.trimEnd().split(" OR ")

    if (licenses[0].startsWith("(")) {
      licenses[0] = licenses[0].slice(1)
    }
    if (licenses[licenses.length - 1].endsWith(")")) {
      licenses[licenses.length - 1] = licenses[licenses.length - 1].slice(0, -1)
    }

    let anyAllowed = false

    for (const license of licenses) {
      let allowed = true
      for (const d of disallowedLicenses) {
        if (license.match(d)) {
          allowed = false
          break
        }
      }
      if (allowed) {
        anyAllowed = true
        break
      }
    }

    if (!anyAllowed) {
      disallowedPackages[name] = { ...entry, licenses: entry.licenses }
    }
  }

  // Dump to CSV
  const csvPath = join(gardenRoot, "tmp", "package-licenses.csv")
  console.log("Dumping CSV to " + csvPath)
  const rows = Object.entries(res).map(([name, entry]) => ({ name: name, ...entry }))
  await writeFile(csvPath, stringify(rows, { header: true }))

  // Throw on disallowed licenses
  const disallowedCount = Object.keys(disallowedPackages).length

  if (disallowedCount > 0) {
    let msg = `\nFound ${disallowedCount} packages with disallowed licenses:\n`
    msg += asTree(disallowedPackages, true, true)
    throw new Error(msg)
  }
}

if (require.main === module) {
  checkPackageLicenses(gardenRoot).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
