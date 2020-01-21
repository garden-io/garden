import { resolve } from "path"
import { TestGarden, dataDir, makeTestGarden } from "../../../../../helpers"

let kubernetesTestGarden: TestGarden

export async function getKubernetesTestGarden() {
  if (kubernetesTestGarden) {
    return kubernetesTestGarden
  }

  const projectRoot = resolve(dataDir, "test-projects", "kubernetes-module")
  const garden = await makeTestGarden(projectRoot)

  kubernetesTestGarden = garden

  return garden
}
