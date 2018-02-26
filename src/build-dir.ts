import { resolve } from "path"
import {
  copy,
  emptyDir,
  ensureDir,
  ensureDirSync,
  pathExists
} from "node-fs-extra"
import { GARDEN_DIR_NAME } from "./constants";
const Rsync = require('rsync')
import { execRsyncCmd } from "./util";
import { Module } from "./types/module";
import { GardenContext } from "./context";

// Lazily construct a directory of modules inside which all build steps are performed.

const buildDirRelPath = resolve(GARDEN_DIR_NAME, 'build')

export class BuildDir {
  private cxt: GardenContext
  private buildDirPath: string

  constructor(context: GardenContext) {
    this.buildDirPath = resolve(context.projectRoot, buildDirRelPath)
  }

  // Synchronous, so it can run in GardenContext's constructor.
  init() {
    ensureDirSync(this.buildDirPath)
  }

  async syncFromSrc<T extends Module>(module: T) {
    await this.sync(
      resolve(this.cxt.projectRoot, module.path),
      this.buildPath(module))
  }

  async syncDependencyProducts<T extends Module>(module: T) {
    const buildPath = this.buildPath(module)
    let syncPromises: Promise<any>[] = []

    for (const depConfig of module.config.build.dependencies || []) {
        if (!depConfig.copy) {
          continue
        }

        // Sync to the module's top-level dir by default.
        const destinationDir = depConfig.copyDestination || ''

        for (const sourceDir of depConfig.copy) {
          const sourcePath = resolve(this.buildDirPath, depConfig.name, sourceDir)
          const destinationPath = resolve(buildPath, destinationDir, sourceDir)
          syncPromises.push(this.sync(sourcePath, destinationPath))
        }
     }

    await Promise.all(syncPromises)
  }

  async clear()  {
    await emptyDir(this.buildDirPath)
  }

  private buildPath<T extends Module>(module: T) {
    return resolve(this.buildDirPath, module.name)
  }

  private async sync(sourcePath: string, destinationPath: string): Promise<any> {
    await ensureDir(destinationPath)

    const syncCmd = new Rsync()
      .flags('a')
      .source(sourcePath)
      .destination(destinationPath)

    return execRsyncCmd(syncCmd)
  }

}
