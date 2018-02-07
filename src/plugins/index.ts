import { ContainerModuleHandler } from "./container"
import { LocalDockerSwarmProvider } from "./local/local-docker-swarm"
import { GoogleCloudFunctionsProvider } from "./google/google-cloud-functions"
import { LocalGoogleCloudFunctionsProvider } from "./local/local-google-cloud-functions"
import { KubernetesProvider } from "./kubernetes"
import { NpmPackageModuleHandler } from "./npm-package"
import { GoogleAppEngineProvider } from "./google/google-app-engine"
import { PluginFactory } from "../types/plugin"

// TODO: these should be configured, either explicitly or as dependencies of other plugins
export const defaultPlugins: PluginFactory[] = [
  ContainerModuleHandler,
  NpmPackageModuleHandler,
  KubernetesProvider,
  GoogleAppEngineProvider,
  GoogleCloudFunctionsProvider,
  LocalDockerSwarmProvider,
  LocalGoogleCloudFunctionsProvider,
].map(pluginClass => (ctx) => new pluginClass(ctx))
