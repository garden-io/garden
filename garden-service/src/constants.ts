/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, join } from "path"
import { homedir } from "os"

export const isPkg = !!(<any>process).pkg

export const LOCAL_CONFIG_FILENAME = "local-config.yml"
export const GLOBAL_CONFIG_FILENAME = "global-config.yml"
export const GARDEN_SERVICE_ROOT = isPkg ? resolve(process.execPath, "..") : resolve(__dirname, "..", "..")
export const STATIC_DIR = join(GARDEN_SERVICE_ROOT, "static")
// We copy the built dashboard to the garden-service static directory (with gulp in development, otherwise in CI).
// TODO: Use env vars to detect if Garden is running in dev mode and serve straight from the dashboard directory.
export const DASHBOARD_STATIC_DIR = join(STATIC_DIR, "dashboard")
export const DEFAULT_GARDEN_DIR_NAME = ".garden"
export const LOGS_DIR_NAME = "logs"
export const GARDEN_GLOBAL_PATH = join(homedir(), DEFAULT_GARDEN_DIR_NAME)
export const LOGS_DIR = join(DEFAULT_GARDEN_DIR_NAME, LOGS_DIR_NAME)
export const ERROR_LOG_FILENAME = "error.log"
export const PROJECT_SOURCES_DIR_NAME = join("sources", "project")
export const MODULE_SOURCES_DIR_NAME = join("sources", "module")
export const GARDEN_BUILD_VERSION_FILENAME = "garden-build-version"
export const GARDEN_VERSIONFILE_NAME = ".garden-version"
export const DEFAULT_PORT_PROTOCOL = "TCP"

export const DEFAULT_API_VERSION = "garden.io/v0"

export const DEFAULT_TEST_TIMEOUT = 60 * 1000

export type SupportedPlatform = "linux" | "darwin" | "win32"
export const SUPPORTED_PLATFORMS: SupportedPlatform[] = ["linux", "darwin", "win32"]

export const SEGMENT_DEV_API_KEY = "D3DUZ3lBSDO3krnuIO7eYDdtlDAjooKW"
export const SEGMENT_PROD_API_KEY = "b6ovUD9A0YjQqT3ZWetWUbuZ9OmGxKMa"
