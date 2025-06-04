/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GoogleAuth, Impersonated } from "google-auth-library"
import { expect } from "chai"
import { base64, dedent } from "../../src/util/string.js"

import { ArtifactRegistryClient } from "@google-cloud/artifact-registry"
import { styles } from "../../src/logger/styles.js"
import { getDataDir, makeTestGarden } from "../helpers.js"

const targetProject = "garden-ci"
const targetPrincipal = "gar-serviceaccount@garden-ci.iam.gserviceaccount.com"

export async function getImpersonatedClientForIntegTests(): Promise<Impersonated> {
  try {
    // This will use ADC to get the credentials used for the downscoped client.
    const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] })

    const client = await googleAuth.getClient()

    // Impersonate "gar-serviceaccount"
    // This allows google artifact registry access in the garden-ci project.
    // Using the service account impersonation has the benefit that we can allow any google group to impersonate this service account, so we do not need to manage access manually:
    // This only works because we granted the google group "dev@garden.io" permission to impersonate this service account with the following command:
    // `gcloud iam service-accounts add-iam-policy-binding gar-serviceaccount@garden-ci.iam.gserviceaccount.com --member=group:dev@garden.io --role=roles/iam.serviceAccountTokenCreator`
    // We also gave the ci-user the permission to impersonate this service account, so that we can use it in CI with the following command:
    // `gcloud iam service-accounts add-iam-policy-binding gar-serviceaccount@garden-ci.iam.gserviceaccount.com --member=ci-user@garden-ci.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator`
    return new Impersonated({
      sourceClient: client,
      targetPrincipal,
      lifetime: 3600,
      delegates: [],
      targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
    })
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err
    }
    if (
      err.message.includes("API has not been used in project") ||
      err.message.includes("Could not load the default credentials")
    ) {
      expect.fail(
        dedent`
        Could not get downscoped token: Not authenticated to gcloud. Please run the following command:

        ${styles.bold(`$ gcloud auth application-default login --project ${targetProject}`)}
      `
      )
    }
    if (err.message.includes("unable to impersonate")) {
      expect.fail(
        dedent`
        Could not get downscoped token: ${err.message}

        Your user might not be allowed to impersonate the service account '${targetPrincipal}'. You need the role iam.serviceAccountTokenCreator in the project ${targetProject}.

        The serviceAccountTokenCreator can be assigned like this:
        ${styles.bold(
          `$ gcloud iam service-accounts add-iam-policy-binding ${targetPrincipal} --member=<yourIdentity> --role=roles/iam.serviceAccountTokenCreator`
        )}

        All developers at garden (dev@garden.io) already have this role, so if you are running into this error and you are part of the google group "Developers <dev@garden.io>", please run the following command:
        ${styles.bold(`$ gcloud auth application-default login --project ${targetProject}`)}
        `
      )
    }

    throw err
  }
}

export async function getArtifactRegistryClient() {
  return new ArtifactRegistryClient({
    authClient: await getImpersonatedClientForIntegTests(),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isGCloudServiceError(err: any): err is GCloudServiceError {
  if (err === undefined) {
    return false
  }

  return err?.code !== undefined && err?.details !== undefined && err?.metadata !== undefined
}

interface GCloudServiceError {
  code: number
  details: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any
}

const ArtifactRegistryPackagePathPrefix =
  "projects/garden-ci/locations/europe-west3/repositories/garden-integ-tests/packages"
const GCloudNotFoundErrorCode = 5

export async function listGoogleArtifactImageTags(packageName: string): Promise<string[]> {
  const client = await getArtifactRegistryClient()

  const parent = `${ArtifactRegistryPackagePathPrefix}/${packageName}`

  try {
    const [allTags] = await client.listTags({ parent })

    // removing the package parent path + /tags/ to
    return allTags.flatMap(({ name }) => {
      return name ? name?.replace(`${parent}/tags/`, "") : []
    })
  } catch (err: unknown) {
    if (isGCloudServiceError(err)) {
      const gcloudErr = err as GCloudServiceError

      if (gcloudErr.code === GCloudNotFoundErrorCode && gcloudErr.details === "Requested entity was not found.") {
        return []
      }
    }

    throw err
  }
}

export async function deleteGoogleArtifactImage(packageName: string): Promise<void> {
  const client = await getArtifactRegistryClient()

  const fullName = `${ArtifactRegistryPackagePathPrefix}/${packageName}`

  try {
    await client.deletePackage({ name: fullName })
  } catch (err: unknown) {
    if (isGCloudServiceError(err)) {
      const gcloudErr = err as GCloudServiceError

      if (gcloudErr.code === GCloudNotFoundErrorCode && gcloudErr.details === `Package "${fullName}" was not found.`) {
        return
      }
    }

    throw err
  }
}

export async function getGoogleADCImagePullSecret() {
  const client = await getImpersonatedClientForIntegTests()
  // Obtain an authenticated client via ADC.
  const token = (await client.getAccessToken()).token

  if (!token) {
    expect.fail("Failed to downscope token for image pull secret via ADC: token was not set")
  }

  const auth = base64(`oauth2accesstoken:${token}`)
  return {
    auths: {
      "europe-west3-docker.pkg.dev": { auth },
      "pkg.dev": { auth },
      "europe-docker.pkg.dev": { auth },
    },
  }
}

export async function getEmptyGardenWithLocalK8sProvider() {
  // TODO: consider creating garden in tmpDir and setting the config programmatically
  const projectRoot = getDataDir("test-projects", "empty-project-local-kubernetes")
  return await makeTestGarden(projectRoot)
}
