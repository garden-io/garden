/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"

export const MODULE_CONFIG_FILENAME = "garden.yml"
export const STATIC_DIR = resolve(__dirname, "..", "static")
export const GARDEN_DIR_NAME = ".garden"
export const LOGS_DIR = `${GARDEN_DIR_NAME}/logs`
export const GARDEN_VERSIONFILE_NAME = ".garden-version"
export const DEFAULT_NAMESPACE = "default"
export const DEFAULT_PORT_PROTOCOL = "TCP"

export const GARDEN_ANNOTATION_PREFIX = "garden.io/"
export const GARDEN_ANNOTATION_KEYS_VERSION = GARDEN_ANNOTATION_PREFIX + "version"

export const DEFAULT_TEST_TIMEOUT = 60 * 1000
