/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { ChildProcessError, RuntimeError } from "../../../exceptions.js"
import type { Log } from "../../../logger/log-entry.js"
import { exec } from "../../../util/util.js"
import { containerHelpers } from "../../container/helpers.js"
import type { ContainerBuildAction } from "../../container/moduleConfig.js"
import { deline, naturalList } from "../../../util/string.js"
import type { ExecaReturnValue } from "execa"
import type { PluginContext } from "../../../plugin-context.js"
import { parse as parsePath } from "path"

// TODO: Pass the correct log context instead of creating it here.
export async function configureMicrok8sAddons(log: Log, addons: string[]) {
  let statusCommandResult: ExecaReturnValue | ChildProcessError | undefined = undefined
  let status = ""
  const microK8sLog = log.createLog({ name: "microk8s" })

  try {
    statusCommandResult = await exec("microk8s", ["status"])
    status = statusCommandResult.stdout
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }
    if (err.details.output.includes("permission denied") || err.details.output.includes("Insufficient permissions")) {
      microK8sLog.warn(deline`
        Unable to get microk8s status and manage addons. You may need to add the current user to the microk8s
        group. Alternatively, you can manually ensure that the ${naturalList(addons)} are enabled.
      `)
      return
    } else {
      statusCommandResult = err
    }
  }

  if (!status.includes("microk8s is running")) {
    throw new RuntimeError({
      message: `Unexpected microk8s status '${status}'.  Is the cluster installed and running?`,
    })
  }

  const missingAddons = addons.filter((addon) => !status.includes(`${addon}: enabled`))

  if (missingAddons.length > 0) {
    microK8sLog.info(`enabling required addons (${missingAddons.join(", ")})`)
    // It's recommended to enable microk8s addons sequentially instead of using chained operations.
    // Otherwise, a deprecation warning will be printed.
    for (const missingAddon of missingAddons) {
      await exec("microk8s", ["enable", missingAddon])
    }
  }
}

export async function getMicrok8sImageStatus(imageId: string) {
  const parsedId = containerHelpers.parseImageId(imageId)
  const clusterId = containerHelpers.unparseImageId({
    ...parsedId,
    host: parsedId.host || "docker.io",
    namespace: parsedId.namespace || "library",
  })

  const res = await exec("microk8s", ["ctr", "images", "ls", "-q"])
  return res.stdout.split("\n").includes(clusterId)
}

const MULTIPASS_VM_NAME = "microk8s-vm"

type MultipassListOutput = {
  list: {
    ipv4: string[]
    name: string
    release: string
    state: string
  }[]
}

async function isMicrok8sRunningInMultipassVM(): Promise<boolean> {
  try {
    const res = await exec("multipass", ["list", "--format", "json"])

    const data = JSON.parse(res.stdout) as MultipassListOutput
    return data.list.some((vm) => vm.name === MULTIPASS_VM_NAME)
  } catch (_err) {
    return false
  }
}

export async function loadImageToMicrok8s({
  action,
  imageId,
  log,
  ctx,
}: {
  action: ContainerBuildAction
  imageId: string
  log: Log
  ctx: PluginContext
}): Promise<void> {
  try {
    // See https://microk8s.io/docs/registry-images for reference
    await tmp.withFile(async (file) => {
      await containerHelpers.dockerCli({
        cwd: action.getBuildPath(),
        args: ["save", "-o", file.path, imageId],
        log,
        ctx,
      })

      const isInMultipassVM = await isMicrok8sRunningInMultipassVM()

      const parsedTempFilePath = parsePath(file.path)
      const sourceFilePath = file.path

      // If running in multipass, we first need to transfer the file into the VM
      // And then later on remove it again manually

      // We only grab the base name of the temp file
      // since else we would need to create the entire path of the temp file first
      // Once microk8s releases with multipass v1.11.0,
      // we can use the `-p` flag and simplify this code again
      const filePath = isInMultipassVM ? `/tmp/${parsedTempFilePath.base}` : sourceFilePath

      // Transfer the file from the source path into the new destination path within the VM
      if (isInMultipassVM) {
        await exec("multipass", ["transfer", sourceFilePath, `${MULTIPASS_VM_NAME}:${filePath}`])
      }

      await exec("microk8s", ["ctr", "image", "import", filePath])

      // Clean up the file within the VM by deleting it explicitly
      if (isInMultipassVM) {
        await exec("multipass", ["exec", MULTIPASS_VM_NAME, "rm", filePath])
      }
    })
  } catch (err) {
    throw new RuntimeError({
      message: `An attempt to load image ${imageId} into the microk8s cluster failed: ${err}`,
    })
  }
}
