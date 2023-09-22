/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GoogleAuth, Impersonated } from "google-auth-library"
import { expect } from "chai"
import { base64, dedent } from "../../src/util/string"
import chalk from "chalk"

const targetProject = "garden-ci"
const targetPrincipal = "gar-serviceaccount@garden-ci.iam.gserviceaccount.com"

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
    // We also gave the ci-user the permission to impersonate this service account, so that we can use it in CI with the following command:
    // `gcloud iam service-accounts add-iam-policy-binding gar-serviceaccount@garden-ci.iam.gserviceaccount.com --member=ci-user@garden-ci.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator`
    let targetClient = new Impersonated({
      sourceClient: client,
      targetPrincipal,
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
        dedent`
          Could not get downscoped token: Not authenticated to gcloud. Please run the following command:

          ${chalk.bold(`$ gcloud auth application-default login --project ${targetProject}`)}
        `
      )
    }
    if (err.message.includes("unable to impersonate") && err.message.includes("invalid_scope")) {
      expect.fail(
        dedent`
          Could not get downscoped token: Your user is not allowed to impersonate the service account '${targetPrincipal}'. You need the role iam.serviceAccountTokenCreator in the project ${targetProject}.

          The serviceAccountTokenCreator can be assigned like this:
          ${chalk.bold(`$ gcloud iam service-accounts add-iam-policy-binding ${targetPrincipal} --member=<yourIdentity> --role=roles/iam.serviceAccountTokenCreator`)}

          All developers at garden (dev@garden.io) already have this role, so if you are running into this error and you are part of the google group "Developers <dev@garden.io>", please run the following command:
          ${chalk.bold(`$ gcloud auth application-default login --project ${targetProject}`)}
          `
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
