/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * This will go recursively down the file tree of the folder it's provided and
 * generate a table of contents.
 *
 * It will look for markdown files and extract "order" and "title" from their
 * front matter.
 *
 * If there's no title, it'll look for the first markdown "#" and use that.
 *
 * For ordering:
 * - Files with an order field will be ordered by that field.
 * - Files with equal order values will be sorted alphabetically.
 * - Files without an order field will be sorted alphabetically.
 * - Files with an order field always go on above files without.
 * - For directories, put their front matter in the README.md file inside it.
 */

import matter = require("gray-matter")
import dtree = require("directory-tree")
import { readFileSync, writeFile, createFile } from "fs-extra"
import { resolve } from "path"
import { cloneDeep, repeat } from "lodash"

interface Metadata {
  order: number
  title: string
}

interface FileTree extends dtree.DirectoryTree, Metadata {
  children: FileTree[]
}

function createNewTree(tree: FileTree, transform: Function): FileTree {
  let newTree = cloneDeep(tree)
  transform(newTree)
  return newTree
}

function attachMetadata(tree: FileTree) {
  if (tree.type === "directory") {
    tree.path = tree.path + "/README.md"
  }
  let file: string | undefined
  try {
    file = readFileSync(tree.path, "utf-8")
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw (e)
    }
  }
  if (file) {
    const metadata = <Metadata>matter(file).data
    if (metadata.order) {
      tree.order = metadata.order
    } else {
      tree.order = Number.MAX_VALUE
    }
    if (metadata.title) {
      tree.title = metadata.title
    } else {
      const name = file.match(/^#[^#][\s]*(.+?)#*?$/m)
      if (name) {
        tree.title = name[1]
      } else {
        tree.title = tree.name
      }
    }
  } else {
    tree.title = tree.name
  }
  if (tree.children) {
    for (let item in tree.children) {
      attachMetadata(tree.children[item])
    }
  }
}

function sortTree(tree: FileTree) {
  if (tree.children) {
    tree.children.sort((a, b) => {
      if (a.order === b.order) {
        return a.title > b.title ? 1 : -1
      }
      return a.order > b.order ? 1 : -1
    })
    for (let item in tree.children) {
      sortTree(tree.children[item])
    }
  }
}

function generateMarkdown(tree: FileTree, docsRoot: string, depth = 0) {
  const path = tree.path.replace(docsRoot, ".")
  let output = repeat(indent, depth) + "* [" + tree.title + "](" + path + ")\n"
  if (path === "./README.md") {
    output = ""
    depth = -1
  }
  if (tree.name === "README.md") {
    output = ""
  }
  for (let item in tree.children) {
    output += generateMarkdown(tree.children[item], docsRoot, depth + 1)
  }
  return output
}

const indent: string = "  "

export function generateTableOfContents(docsRoot: string): string {
  const rawTree = <FileTree>dtree(docsRoot, { extensions: /\.md/ })
  const treeWithMetadata = createNewTree(rawTree, attachMetadata)
  const preparedTree = createNewTree(treeWithMetadata, sortTree)
  return "# Table of Contents\n\n" + generateMarkdown(preparedTree, docsRoot)
}

export async function writeTableOfContents(docsRoot: string, outputFileName: string) {
  const toWrite = generateTableOfContents(docsRoot)
  const tocPath = resolve(docsRoot, outputFileName)
  await createFile(tocPath)
  await writeFile(tocPath, toWrite)
  console.log("Table of contents generated successfuly.")
}
