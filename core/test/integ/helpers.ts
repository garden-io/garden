/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GoogleAuth, DownscopedClient } from "google-auth-library"
import { expect } from "chai"
import { base64 } from "../../src/util/string"

export async function getGoogleADCImagePullSecret() {
  let token: string

  try {
    // This will use ADC to get the credentials used for the downscoped client.
    const googleAuth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      projectId: "garden-ci",
    })

    // Obtain an authenticated client via ADC.
    const client = await googleAuth.getClient()

    // Use the client to create a DownscopedClient.
    const cabClient = new DownscopedClient(client, {
      accessBoundary: {
        accessBoundaryRules: [
          {
            availablePermissions: ["inRole:roles/artifactregistry.repoAdmin"],
            availableResource: "//artifactregistry.googleapis.com/projects/garden-ci/locations/_/repositories/_",
          },
        ],
      },
    })

    // Refresh the tokens.
    const refreshedAccessToken = await cabClient.getAccessToken()

    // This will need to be passed to the token consumer.
    if (!refreshedAccessToken.token) {
      expect.fail("Failed to downscope token for image pull secret via ADC: token was not set")
    }

    token = refreshedAccessToken.token
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err
    }
    if (err.message.includes("API has not been used in project") || err.message.includes("Could not load the default credentials")) {
      expect.fail("Could not get downscoped token: Not authenticated to gcloud. Please run the command 'gcloud auth application-default login --project garden-ci'")
    }
    throw err
  }

  return {
    auths: {
      "eu.gcr.io": {
        auth: base64(`oauth2accesstoken:${token}`),
      }
    }
  }
}
