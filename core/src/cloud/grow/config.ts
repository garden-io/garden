/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_GROW_CLOUD_DOMAIN, gardenEnv } from "../../constants.js"

const domain = gardenEnv.GARDEN_CLOUD_DOMAIN ?? DEFAULT_GROW_CLOUD_DOMAIN

export const cloudApiUrl = new URL("/api", domain).href

export const cloudApiOrigin = new URL(cloudApiUrl).origin
