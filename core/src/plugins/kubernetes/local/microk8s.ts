/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { RuntimeError } from "../../../exceptions"
import { Log } from "../../../logger/log-entry"
import { exec } from "../../../util/util"
import { containerHelpers } from "../../container/helpers"
import { ContainerBuildAction } from "../../container/moduleConfig"
import chalk from "chalk"
import { deline, naturalList } from "../../../util/string"
import { ExecaReturnValue } from "execa"
import { PluginContext } from "../../../plugin-context"
import { parse as parsePath } from "path"

// TODO: Pass the correct log context instead of creating it here.
export async function configureMicrok8sAddons(log: Log, addons: string[]) {
  let statusCommandResult: ExecaReturnValue | undefined = undefined
  let status = ""
  const microK8sLog = log.createLog({ name: "microk8s" })

  try {
    statusCommandResult = await exec("microk8s", ["status"])
    status = statusCommandResult.stdout
  } catch (err) {
    if (err.all?.includes("permission denied") || err.all?.includes("Insufficient permissions")) {
      microK8sLog.warn(
        chalk.yellow(
          deline`Unable to get microk8s status and manage addons. You may need to add the current user to the microk8s
          group. Alternatively, you can manually ensure that the ${naturalList(addons)} are enabled.`
        )
      )
      return
    } else {
      statusCommandResult = err
    }
  }

  if (!status.includes("microk8s is running")) {
    throw new RuntimeError({
      message: `Unable to get microk8s status. Is the cluster installed and running?`,
      detail: {
        status,
        statusCommandResult,
      },
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
      message: `An attempt to load image ${imageId} into the microk8s cluster failed: ${err.message}`,
      detail: {
        err,
      },
    })
  }
}
