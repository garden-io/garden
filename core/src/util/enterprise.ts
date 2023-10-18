import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../constants";
import { PluginContext } from "../plugin-context";

export function isGardenEnterprise(ctx: PluginContext): boolean {
  return !!(ctx.projectId && ctx.cloudApi && ctx.cloudApi?.domain !== DEFAULT_GARDEN_CLOUD_DOMAIN)
}


