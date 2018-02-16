import { GardenContext } from "../context"

export const NEW_MODULE_VERSION = "0000000000"

export abstract class VcsHandler {
  constructor(protected ctx: GardenContext) { }

  abstract async getTreeVersion(directories): Promise<string>
  abstract async sortVersions(versions: string[]): Promise<string[]>
}
