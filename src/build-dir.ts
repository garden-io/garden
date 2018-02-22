import { resolve } from "path"
import { remove, copy, ensureDir } from "node-fs-extra"
import { Module } from "./types/module";
import { GardenContext } from "./context";

// Lazily construct a directory of modules inside which all build steps are performed

const buildDirRelPath = '.garden/build'

export class BuildDir {
  private cxt: GardenContext
  private buildDirPath: string
  private moduleNames: Set<string>

  constructor(context: GardenContext) {
    this.buildDirPath = resolve(context.projectRoot, buildDirRelPath)
    this.moduleNames = new Set()
  }

  async init() {
    await ensureDir(this.buildDirPath)
  }

  async put(module: Module) {
    if (this.moduleNames.has(module.name)) {
      return
    }

    await copy(
      resolve(this.cxt.projectRoot, module.path),
      this.buildPath(module))

    this.moduleNames.add(module.name)
  }

  async clear()  {
    this.moduleNames.clear()
    await remove(this.buildDirPath)
  }

  buildPath(module: Module) {
    return resolve(this.buildDirPath, module.name)
  }

}
