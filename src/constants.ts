import { resolve } from "path"

export const MODULE_CONFIG_FILENAME = "garden.yml"
export const STATIC_DIR = resolve(__dirname, "..", "static")
export const DEFAULT_NAMESPACE = "default"
export const DEFAULT_PORT_PROTOCOL = "TCP"

export const GARDEN_ANNOTATION_PREFIX = "garden.io/"
export const GARDEN_ANNOTATION_KEYS_VERSION = GARDEN_ANNOTATION_PREFIX + "version"

export const DEFAULT_TEST_TIMEOUT = 60 * 1000
