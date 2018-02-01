import { ContainerModuleHandler } from "../moduleHandlers/container"
import { LocalDockerSwarmProvider } from "./local/local-docker-swarm"
import { GoogleCloudFunctionsProvider } from "./google/google-cloud-functions"
import { LocalGoogleCloudFunctionsProvider } from "./local/local-google-cloud-functions"
import { KubernetesProvider } from "./kubernetes"
import { NpmPackageModuleHandler } from "../moduleHandlers/npm-package"
import { GoogleAppEngineProvider } from "./google/google-app-engine"

// TODO: these should be configured, either explicitly or as dependencies of other plugins
export const defaultPlugins = [
  ContainerModuleHandler,
  NpmPackageModuleHandler,
  KubernetesProvider,
  GoogleAppEngineProvider,
  GoogleCloudFunctionsProvider,
  LocalDockerSwarmProvider,
  LocalGoogleCloudFunctionsProvider,
].map(pluginClass => (ctx) => new pluginClass(ctx))
