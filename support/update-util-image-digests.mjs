#!/usr/bin/env node
/*
 * Rewrites the pinned gardendev utility-image references (tag@sha256 digest) in
 * core/src/plugins/kubernetes/constants.ts.
 *
 * Invoked by the rebuild-utility-images workflow with one or more "name=ref"
 * pairs. Supported names: k8s-sync, k8s-util, buildkit, buildkit-rootless.
 *
 *   node support/update-util-image-digests.mjs \
 *     k8s-sync=gardendev/k8s-sync:0.2.6-2@sha256:<digest> \
 *     k8s-util=gardendev/k8s-util:0.6.6-2@sha256:<digest>
 *
 * Each reference must keep the `<repo>:<tag>@sha256:<digest>` shape so the
 * `DockerImageWithDigest` template-literal type in core/src/util/string.ts stays
 * satisfied.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const CONSTANTS_REL = "../core/src/plugins/kubernetes/constants.ts"

// Per-image matchers for the existing `gardendev/<repo>:<tag>@sha256:<digest>`
// literals. The buildkit matchers use the presence/absence of "rootless" in the
// tag to disambiguate the two `gardendev/buildkit:` entries.
const MATCHERS = {
  "k8s-sync": /gardendev\/k8s-sync:[^"@\s]+@sha256:[0-9a-f]{64}/g,
  "k8s-util": /gardendev\/k8s-util:[^"@\s]+@sha256:[0-9a-f]{64}/g,
  "buildkit-rootless": /gardendev\/buildkit:[^"@\s]*rootless[^"@\s]*@sha256:[0-9a-f]{64}/g,
  "buildkit": /gardendev\/buildkit:(?![^"@\s]*rootless)[^"@\s]+@sha256:[0-9a-f]{64}/g,
}

const REF_RE = /^gardendev\/[^:\s]+:[^@\s]+@sha256:[0-9a-f]{64}$/

/**
 * Apply the given { name: ref } replacements to the constants file content.
 * Throws if a name is unknown, a ref is malformed, or a matcher finds nothing.
 */
export function updateConstants(content, pairs) {
  // Apply the rootless buildkit entry before the non-rootless one for clarity;
  // the matchers are mutually exclusive regardless of order.
  const order = ["k8s-sync", "k8s-util", "buildkit-rootless", "buildkit"]
  const names = order.filter((name) => name in pairs)

  for (const name of names) {
    const matcher = MATCHERS[name]
    if (!matcher) {
      throw new Error(`Unknown image name "${name}". Known: ${Object.keys(MATCHERS).join(", ")}`)
    }

    const ref = pairs[name].replace(/^docker\.io\//, "")
    if (!REF_RE.test(ref)) {
      throw new Error(`Invalid image reference for "${name}": "${ref}"`)
    }

    let count = 0
    content = content.replace(matcher, () => {
      count++
      return ref
    })
    if (count === 0) {
      throw new Error(`No existing reference found for "${name}" in constants.ts`)
    }
    console.log(`Updated ${name}: ${count} occurrence(s) -> ${ref}`)
  }

  return content
}

function parsePairs(argv) {
  const pairs = {}
  for (const arg of argv) {
    const idx = arg.indexOf("=")
    if (idx === -1) {
      throw new Error(`Expected "name=ref" but got: "${arg}"`)
    }
    pairs[arg.slice(0, idx)] = arg.slice(idx + 1)
  }
  return pairs
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error("Usage: node support/update-util-image-digests.mjs <name=ref> [<name=ref> ...]")
    process.exit(1)
  }

  const pairs = parsePairs(argv)
  const file = resolve(dirname(fileURLToPath(import.meta.url)), CONSTANTS_REL)
  const original = readFileSync(file, "utf8")
  const updated = updateConstants(original, pairs)

  if (updated !== original) {
    writeFileSync(file, updated)
    console.log(`Wrote ${file}`)
  } else {
    console.log("No changes to write.")
  }
}

// Only run main() when executed directly, so the module can be imported in tests.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ""
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
}
