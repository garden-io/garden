/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import env from "env-var"
import { resolve, join } from "path"
import { homedir } from "os"

export const isPkg = !!(<any>process).pkg

export const LOCAL_CONFIG_FILENAME = "local-config.yml"
export const GLOBAL_CONFIG_FILENAME = "global-config.yml"
export const GARDEN_CORE_ROOT = isPkg ? resolve(process.execPath, "..") : resolve(__dirname, "..", "..")
export const GARDEN_CLI_ROOT = isPkg ? resolve(process.execPath, "..") : resolve(GARDEN_CORE_ROOT, "..", "cli")
export const STATIC_DIR = isPkg ? resolve(process.execPath, "..", "static") : resolve(GARDEN_CORE_ROOT, "..", "static")
// We symlink to it the built dashboard to the core static directory during dev, and copy it there for dist builds
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
export const DEFAULT_TASK_TIMEOUT = 60 * 1000

export type SupportedPlatform = "linux" | "darwin" | "win32"
export const SUPPORTED_PLATFORMS: SupportedPlatform[] = ["linux", "darwin", "win32"]

export type SupportedArchitecture = "x64" | "arm64"
export const SUPPORTED_ARCHITECTURES: SupportedArchitecture[] = ["x64", "arm64"]

// These keys aren't sensitive, so we ask GitGuardian to ignore them.
export const SEGMENT_DEV_API_KEY = "D3DUZ3lBSDO3krnuIO7eYDdtlDAjooKW" // ggignore
export const SEGMENT_PROD_API_KEY = "b6ovUD9A0YjQqT3ZWetWUbuZ9OmGxKMa" // ggignore

export const DOCS_BASE_URL = "https://docs.garden.io"
export const VERSION_CHECK_URL = "https://get.garden.io/version"

/**
 * Environment variables, with defaults where appropriate.
 *
 * We set this up as a map to facilitate overriding values in tests.
 */
export const gardenEnv = {
  ANALYTICS_DEV: env.get("ANALYTICS_DEV").required(false).asBool(),
  GARDEN_AUTH_TOKEN: env.get("GARDEN_AUTH_TOKEN").required(false).asString(),
  GARDEN_CACHE_TTL: env.get("GARDEN_CACHE_TTL").required(false).asInt(),
  GARDEN_DB_DIR: env.get("GARDEN_DB_DIR").required(false).default(GARDEN_GLOBAL_PATH).asString(),
  GARDEN_DISABLE_ANALYTICS: env.get("GARDEN_DISABLE_ANALYTICS").required(false).asBool(),
  GARDEN_DISABLE_PORT_FORWARDS: env.get("GARDEN_DISABLE_PORT_FORWARDS").required(false).asBool(),
  GARDEN_DISABLE_VERSION_CHECK: env.get("GARDEN_DISABLE_VERSION_CHECK").required(false).asBool(),
  GARDEN_ENABLE_PROFILING: env.get("GARDEN_ENABLE_PROFILING").required(false).asBool(),
  GARDEN_ENVIRONMENT: env.get("GARDEN_ENVIRONMENT").required(false).asString(),
  GARDEN_EXPERIMENTAL_BUILD_STAGE: env.get("GARDEN_EXPERIMENTAL_BUILD_STAGE").required(false).asBool(),
  GARDEN_GE_SCHEDULED: env.get("GARDEN_GE_SCHEDULED").required(false).asBool(),
  GARDEN_K8S_BUILD_SYNC_MODE: env.get("GARDEN_K8S_BUILD_SYNC_MODE").required(false).default("rsync").asString(),
  GARDEN_LEGACY_BUILD_STAGE: env.get("GARDEN_LEGACY_BUILD_STAGE").required(false).asBool(),
  GARDEN_LOG_LEVEL: env.get("GARDEN_LOG_LEVEL").required(false).asString(),
  GARDEN_LOGGER_TYPE: env.get("GARDEN_LOGGER_TYPE").required(false).asString(),
  GARDEN_PROXY_DEFAULT_ADDRESS: env.get("GARDEN_PROXY_DEFAULT_ADDRESS").required(false).asString(),
  GARDEN_SERVER_PORT: env.get("GARDEN_SERVER_PORT").required(false).asPortNumber(),
  GARDEN_SKIP_TESTS: env.get("GARDEN_SKIP_TESTS").required(false).default("").asString(),
  GARDEN_HARD_CONCURRENCY_LIMIT: env.get("GARDEN_HARD_CONCURRENCY_LIMIT").required(false).default(50).asInt(),
  GARDEN_TASK_CONCURRENCY_LIMIT: env.get("GARDEN_TASK_CONCURRENCY_LIMIT").required(false).default(6).asInt(),
  GARDEN_WORKFLOW_RUN_UID: env.get("GARDEN_WORKFLOW_RUN_UID").required(false).asString(),
}
