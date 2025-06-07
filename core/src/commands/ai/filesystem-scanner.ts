/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, extname, basename } from "node:path"
import type { Log } from "../../logger/log-entry.js"
import type { ProjectInfo, FileSystemNode, ConfigFileInfo, ConfigFileType, ProjectStructure } from "./types.js"

export class FilesystemScanner {
  private projectRoot: string
  private log: Log
  private configFiles: ConfigFileInfo[] = []

  // Patterns to identify configuration files
  private configPatterns: { [key in ConfigFileType]: PatternMatcher } = {
    "kubernetes": isKubernetesPattern,
    "dockerfile": isDockerfilePattern,
    "garden": isGardenPattern,
    "terraform": isTerraformPattern,
    "docker-compose": isDockerComposePattern,
    "helm": isHelmPattern,
    "unknown": isUnknownPattern,
  }

  constructor(projectRoot: string, log: Log) {
    this.projectRoot = projectRoot
    this.log = log
  }

  /**
   * Check if a YAML file is a Kubernetes manifest by examining its contents
   */
  private async isKubernetesManifest(filePath: string): Promise<boolean> {
    try {
      const content = await readFile(filePath, "utf-8")

      // Check for common Kubernetes fields
      const kubernetesIndicators = [
        /^apiVersion:\s*(v1|apps\/v1|batch\/v1|networking\.k8s\.io|rbac\.authorization\.k8s\.io)/m,
        /^metadata:/m,
        /^spec:/m,
      ]

      // More comprehensive Kubernetes kind patterns
      const kindPattern = new RegExp(
        "^kind:\\s*(" +
          "Pod|Service|Deployment|StatefulSet|DaemonSet|Job|CronJob|" +
          "ConfigMap|Secret|Ingress|ServiceAccount|Role|ClusterRole|" +
          "RoleBinding|ClusterRoleBinding|NetworkPolicy|PersistentVolume|" +
          "PersistentVolumeClaim|StorageClass|Namespace|ResourceQuota|LimitRange" +
          ")\\s*$",
        "m"
      )

      // A file is likely a Kubernetes manifest if it has apiVersion and kind
      const hasApiVersion = kubernetesIndicators[0].test(content)
      const hasKind = kindPattern.test(content)

      return hasApiVersion && hasKind
    } catch (error) {
      // If we can't read the file, fall back to filename-based detection
      this.log.debug(`Could not read file ${filePath} for Kubernetes detection: ${error}`)
      return false
    }
  }

  async scan(): Promise<ProjectInfo> {
    this.log.debug(`Scanning project at ${this.projectRoot}`)

    // Scan directory structure
    const directories = await this.scanDirectory(this.projectRoot)

    // Analyze project structure
    const structure = this.analyzeProjectStructure()

    return {
      directories,
      configFiles: this.configFiles,
      structure,
    }
  }

  private async scanDirectory(
    dirPath: string,
    maxDepth: number = 5,
    currentDepth: number = 0,
    ignorePatterns: string[] = [
      "node_modules",
      ".git",
      ".garden",
      "dist",
      "build",
      ".next",
      "__pycache__",
      ".terraform",
      ".venv",
      "venv",
      "vendor",
    ]
  ): Promise<FileSystemNode[]> {
    if (currentDepth >= maxDepth) {
      return []
    }

    const nodes: FileSystemNode[] = []

    try {
      const entries = await readdir(dirPath)

      for (const entry of entries) {
        // Skip ignored directories
        if (ignorePatterns.includes(entry)) {
          continue
        }

        const fullPath = join(dirPath, entry)
        const relativePath = relative(this.projectRoot, fullPath)
        const stats = await stat(fullPath)

        if (stats.isDirectory()) {
          const children = await this.scanDirectory(fullPath, maxDepth, currentDepth + 1, ignorePatterns)
          nodes.push({
            path: relativePath,
            type: "directory",
            name: entry,
            children,
          })
        } else if (stats.isFile()) {
          const node: FileSystemNode = {
            path: relativePath,
            type: "file",
            name: entry,
          }
          nodes.push(node)

          // Check if this is a configuration file
          const configType = await this.identifyConfigType(fullPath)
          if (configType !== "unknown") {
            // Read small config files
            if (stats.size < 100000) {
              // 100KB limit
              try {
                const content = await readFile(fullPath, "utf-8")
                this.configFiles.push({
                  path: relativePath,
                  type: configType,
                  content,
                })
              } catch (error) {
                this.log.debug(`Failed to read file ${relativePath}: ${error}`)
                this.configFiles.push({
                  path: relativePath,
                  type: configType,
                })
              }
            } else {
              this.configFiles.push({
                path: relativePath,
                type: configType,
              })
            }
          }
        }
      }
    } catch (error) {
      this.log.debug(`Error scanning directory ${dirPath}: ${error}`)
    }

    return nodes
  }

  /**
   * Identify the type of configuration file
   */
  private async identifyConfigType(path: string): Promise<ConfigFileType> {
    for (const [type, matcher] of Object.entries(this.configPatterns)) {
      if (matcher(path)) {
        if (type === "kubernetes") {
          if (await this.isKubernetesManifest(path)) {
            return type as ConfigFileType
          } else {
            return "unknown"
          }
        } else {
          return type as ConfigFileType
        }
      }
    }
    return "unknown"
  }

  private analyzeProjectStructure(): ProjectStructure {
    const structure: ProjectStructure = {
      hasKubernetes: false,
      hasDocker: false,
      hasGarden: false,
      hasTerraform: false,
      services: [],
      builds: [],
      infrastructure: [],
    }

    // Check what types of configs exist
    for (const config of this.configFiles) {
      switch (config.type) {
        case "kubernetes":
          structure.hasKubernetes = true
          break
        case "helm":
          structure.hasKubernetes = true
          break
        case "dockerfile":
          structure.hasDocker = true
          break
        case "garden":
          structure.hasGarden = true
          break
        case "terraform":
          structure.hasTerraform = true
          break
      }
    }

    // TODO: More sophisticated analysis of services, builds, and infrastructure
    // For now, we'll leave these as placeholders

    return structure
  }
}

/**
 * Pattern matcher function interface
 */
type PatternMatcher = (path: string) => boolean

/**
 * Check if a file is a Kubernetes configuration based on filename patterns
 */
function isKubernetesPattern(path: string): boolean {
  const name = basename(path).toLowerCase()
  if (extname(path) !== ".yaml" && extname(path) !== ".yml") {
    return false
  }

  if (isGardenPattern(path)) {
    return false
  }

  return (
    name.includes("k8s") ||
    name.includes("kubernetes") ||
    name.includes("deployment") ||
    name.includes("service") ||
    name.includes("ingress") ||
    name.includes("configmap") ||
    name.includes("secret") ||
    path.includes("/k8s/") ||
    path.includes("/kubernetes/")
  )
}

/**
 * Check if a file is a Dockerfile
 */
function isDockerfilePattern(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name === "dockerfile" || name.startsWith("dockerfile.") || name.endsWith(".dockerfile")
}

/**
 * Check if a file is a Garden configuration file
 */
function isGardenPattern(path: string): boolean {
  const name = basename(path).toLowerCase()
  return (
    name === "garden.yml" || name === "garden.yaml" || name.endsWith(".garden.yml") || name.endsWith(".garden.yaml")
  )
}

/**
 * Check if a file is a Terraform configuration file
 */
function isTerraformPattern(path: string): boolean {
  return extname(path) === ".tf" || extname(path) === ".tfvars"
}

/**
 * Check if a file is a Docker Compose configuration file
 */
function isDockerComposePattern(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name === "docker-compose.yml" || name === "docker-compose.yaml" || name.startsWith("docker-compose.")
}

/**
 * Check if a file is a Helm chart file
 */
function isHelmPattern(path: string): boolean {
  const name = basename(path).toLowerCase()
  return name === "chart.yaml" || name === "chart.yml" || name === "values.yaml" || name === "values.yml"
}

/**
 * Unknown config type matcher (always returns false)
 */
function isUnknownPattern(_path: string): boolean {
  return false
}
