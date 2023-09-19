/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GoogleAuth, Impersonated } from "google-auth-library"
import { expect } from "chai"
import { base64 } from "../../src/util/string"

export async function getGoogleADCImagePullSecret() {
  let token: string | null | undefined

  try {
    // This will use ADC to get the credentials used for the downscoped client.
    const googleAuth = new GoogleAuth()

    const client = await googleAuth.getClient()

    // Impersonate "gar-serviceaccount"
    // This allows google artifact registry access in the garden-ci project.
    // Using the service account impersonation has the benefit that we can allow any google group to impersonate this service account, so we do not need to manage access manually:
    // This only works because we granted the google group "dev@garden.io" permission to impersonate this service account with the following command:
    // `gcloud iam service-accounts add-iam-policy-binding gar-serviceaccount@garden-ci.iam.gserviceaccount.com --member=group:dev@garden.io --role=roles/iam.serviceAccountTokenCreator`
    // We could extend this in the future to allow access to the CI cluster in the same way, without the need to manage users manually.
    let targetClient = new Impersonated({
      sourceClient: client,
      targetPrincipal: "gar-serviceaccount@garden-ci.iam.gserviceaccount.com",
      lifetime: 3600,
      delegates: [],
      targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
    })

    // Obtain an authenticated client via ADC.
    token = (await targetClient.getAccessToken()).token
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err
    }
    if (
      err.message.includes("API has not been used in project") ||
      err.message.includes("Could not load the default credentials")
    ) {
      expect.fail(
        "Could not get downscoped token: Not authenticated to gcloud. Please run the command 'gcloud auth application-default login --project garden-ci'"
      )
    }
    throw err
  }

  if (!token) {
    expect.fail("Failed to downscope token for image pull secret via ADC: token was not set")
  }

  return {
    auths: {
      "europe-west3-docker.pkg.dev": {
        auth: base64(`oauth2accesstoken:${token}`),
      },
      "pkg.dev": {
        auth: base64(`oauth2accesstoken:${token}`),
      },
      "europe-docker.pkg.dev": {
        auth: base64(`oauth2accesstoken:${token}`),
      },
    },
  }
}
