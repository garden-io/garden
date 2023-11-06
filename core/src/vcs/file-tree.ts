/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { VcsFile } from "./vcs.js"
import * as path from "path"

type FileTreeNodeOptions = {
  ownPath: string
}

export class FileTreeNode {
  private ownPath: string
  private files: VcsFile[] = []
  private childrenBySubpath: Map<string, FileTreeNode> = new Map()

  constructor({ ownPath }: FileTreeNodeOptions) {
    this.ownPath = ownPath
  }

  addFile(file: VcsFile): boolean {
    if (!file.path.startsWith(`/${this.ownPath}`)) {
      return false
    }

    this.files.push(file)

    const relativePath = file.path.slice(this.ownPath.length)
    // We use absolute paths so the first part of the split is always an empty string
    const [_, subpathSegment, nextSegment] = relativePath.split(path.sep)

    // We have reached the end of this path
    // and arrived at the file.
    // No more child nodes to create.
    if (!nextSegment) {
      return true
    }

    let child: FileTreeNode
    if (!this.childrenBySubpath.has(subpathSegment)) {
      child = new FileTreeNode({ ownPath: path.join(this.ownPath, subpathSegment) })
      this.childrenBySubpath.set(subpathSegment, child)
    } else {
      child = this.childrenBySubpath.get(subpathSegment)!
    }

    child.addFile(file)

    return true
  }

  getFiles(): VcsFile[] {
    return this.files
  }

  getChildBySubpath(subpath: string): FileTreeNode | undefined {
    return this.childrenBySubpath.get(subpath)
  }
}

export class FileTree {
  private root: FileTreeNode

  constructor(root: FileTreeNode) {
    this.root = root
  }

  private getNodeAtPath(filesPath: string): FileTreeNode | undefined {
    // TODO: leading slash makes things annoying in many places
    const segments = filesPath.slice(1).split(path.sep)

    let currentNode: FileTreeNode | undefined = this.root
    while (currentNode) {
      const segment = segments.shift()
      if (!segment) {
        break
      }

      currentNode = currentNode.getChildBySubpath(segment)
    }

    return currentNode
  }

  getFilesAtPath(filesPath: string): VcsFile[] {
    const node = this.getNodeAtPath(filesPath)

    if (!node) {
      return []
    }

    const filesToReturn = node.getFiles()
    return filesToReturn
  }

  isDirectory(filesPath: string): boolean {
    // If there is a node, it's a directory
    // otherwise it's just a file
    const node = this.getNodeAtPath(filesPath)
    return node !== undefined
  }

  static fromFiles(files: VcsFile[]): FileTree {
    // We assume all files are rooted from the same directory
    // which is the root filesystem directory for most (all?) use cases here.
    const node = new FileTreeNode({
      ownPath: "",
    })

    for (const file of files) {
      node.addFile(file)
    }

    return new FileTree(node)
  }
}
