/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, join } from "path"

export const isPkg = !!(<any>process).pkg

export const MODULE_CONFIG_FILENAME = "garden.yml"
export const LOCAL_CONFIG_FILENAME = "local-config.yml"
export const STATIC_DIR = resolve(isPkg ? process.execPath : __dirname, "..", "static")
// We copy the built dashboard to the garden-service static directory (with gulp in development, otherwise in CI).
// TODO: Use env vars to detect if Garden is running in dev mode and serve straight from the dashboard directory.
export const DASHBOARD_STATIC_DIR = join(STATIC_DIR, "dashboard")
export const GARDEN_DIR_NAME = ".garden"
export const LOGS_DIR = join(GARDEN_DIR_NAME, "logs")
export const ERROR_LOG_FILENAME = "error.log"
export const PROJECT_SOURCES_DIR_NAME = join(GARDEN_DIR_NAME, "sources", "project")
export const MODULE_SOURCES_DIR_NAME = join(GARDEN_DIR_NAME, "sources", "module")
export const GARDEN_BUILD_VERSION_FILENAME = "garden-build-version"
export const GARDEN_VERSIONFILE_NAME = ".garden-version"
export const DEFAULT_NAMESPACE = "default"
export const DEFAULT_PORT_PROTOCOL = "TCP"

export const GARDEN_ANNOTATION_PREFIX = "garden.io/"
export const GARDEN_ANNOTATION_KEYS_SERVICE = GARDEN_ANNOTATION_PREFIX + "service"
export const GARDEN_ANNOTATION_KEYS_VERSION = GARDEN_ANNOTATION_PREFIX + "version"

export const DEFAULT_TEST_TIMEOUT = 60 * 1000

export type SupportedPlatform = "linux" | "darwin" | "win32"
export const SUPPORTED_PLATFORMS: SupportedPlatform[] = ["linux", "darwin", "win32"]
