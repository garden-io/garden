import {
  dirname,
  join,
  resolve,
  sep,
} from "path"
import {
  emptyDir,
  ensureDir,
  ensureDirSync,
} from "fs-extra"
import { GARDEN_DIR_NAME } from "./constants"
const Rsync = require("rsync")
import { execRsyncCmd } from "./util"
import { Module } from "./types/module"
import { GardenContext } from "./context"

// Lazily construct a directory of modules inside which all build steps are performed.

const buildDirRelPath = join(GARDEN_DIR_NAME, "build")

export class BuildDir {
  buildDirPath: string
  private ctx: GardenContext

  constructor(ctx: GardenContext) {
    this.ctx = ctx
    this.buildDirPath = join(ctx.projectRoot, buildDirRelPath)
  }

  // Synchronous, so it can run in GardenContext's constructor.
  init() {
    ensureDirSync(this.buildDirPath)
  }

  async syncFromSrc<T extends Module>(module: T) {
    await this.sync(
      resolve(this.ctx.projectRoot, module.path),
      this.buildDirPath)
  }

  async syncDependencyProducts<T extends Module>(module: T) {
    await this.syncFromSrc(module)

    const buildPath = this.buildPath(module)
    let syncPromises: Promise<any>[] = []

    for (const depConfig of module.config.build.dependencies || []) {
      if (!depConfig.copy) {
        continue
      }

      // Sync to the module's top-level dir by default.
      const destinationDir = depConfig.copyDestination || ""

      for (const relSourcePath of depConfig.copy) {
        const sourcePath = resolve(this.buildDirPath, depConfig.name, relSourcePath)
        const destinationPath = dirname(resolve(buildPath, destinationDir, relSourcePath)) + sep
        syncPromises.push(this.sync(sourcePath, destinationPath))
      }
    }

    await Promise.all(syncPromises)
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  buildPath<T extends Module>(module: T) {
    return resolve(this.buildDirPath, module.name)
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<any> {

    await ensureDir(destinationPath)

    const syncCmd = new Rsync()
      .flags(["a"])
      .source(sourcePath)
      .destination(destinationPath)

    return execRsyncCmd(syncCmd)
  }

}
