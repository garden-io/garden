import { map as bluebirdMap } from "bluebird"
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
import * as Rsync from "rsync"
import { GARDEN_DIR_NAME } from "./constants"
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
    const buildPath = await this.buildPath(module)
    const config = await module.getConfig()

    await bluebirdMap(config.build.dependencies || [], (depConfig) => {
      if (!depConfig.copy) {
        return []
      }

      // Sync to the module's top-level dir by default.
      const destinationDir = depConfig.copyDestination || ""

      return bluebirdMap(depConfig.copy, (relSourcePath) => {
        const sourcePath = resolve(this.buildDirPath, depConfig.name, relSourcePath)
        const destinationPath = dirname(resolve(buildPath, destinationDir, relSourcePath)) + sep
        return this.sync(sourcePath, destinationPath)
      })
    })
  }

  async clear() {
    await emptyDir(this.buildDirPath)
  }

  async buildPath<T extends Module>(module: T): Promise<string> {
    const path = resolve(this.buildDirPath, module.name)
    await ensureDir(path)
    return path
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<void> {

    await ensureDir(destinationPath)

    const syncCmd = new Rsync()
      .flags(["a"])
      .source(sourcePath)
      .destination(destinationPath)

    await execRsyncCmd(syncCmd)
  }

}
