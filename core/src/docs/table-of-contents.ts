/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import titleize = require("titleize")
import humanizeString = require("humanize-string")

interface Metadata {
  order: number
  title: string
  tocTitle?: string
}

interface FileTree extends dtree.DirectoryTree, Metadata {
  children: FileTree[]
  emptyDir: boolean
  topLevel: boolean
}

function createNewTree(tree: FileTree, transform: Function): FileTree {
  let newTree = cloneDeep(tree)
  transform(newTree)
  return newTree
}

function attachMetadata(tree: FileTree) {
  // Is this an empty directory?
  if (tree.type === "directory") {
    if (tree.children.length > 0) {
      tree.path = resolve(tree.path, "README.md")
    } else {
      tree.emptyDir = true
      return
    }
  }
  let file: string | undefined
  try {
    file = readFileSync(tree.path, "utf-8")
  } catch (e) {
    // We know we won't run into ENOENT because these files were just checked
    // by dtree. The only reason ENOENT might happen is if it's a non-empty
    // directory that has no README. If the error is *not* ENOENT though,
    // something really went wrong.
    if (e.code !== "ENOENT") {
      throw e
    } else {
      // It's not an empty directory but there's no README: link to first
      // file instead.
      tree.path = tree.children[0].path
    }
  }
  // We know the file's there, so let's fetch all the metadata.
  if (file) {
    const metadata = <Metadata>matter(file).data
    if (metadata.order) {
      tree.order = metadata.order
    } else {
      tree.order = 1000
    }

    tree.title = metadata.tocTitle || metadata.title

    if (!tree.title) {
      // This matches the first "# Title Header" in a Markdown file.
      const name = file.match(/^#[^#][\s]*(.+?)#*?$/m)
      if (name) {
        tree.title = name[1]
      } else {
        // If there's no "# Title Header," use the file name as title.
        tree.title = tree.name
      }
    }
  } else {
    tree.title = titleize(humanizeString(tree.name))
    tree.order = Number.MAX_VALUE
  }

  if (tree.children) {
    for (let item in tree.children) {
      attachMetadata(tree.children[item])
    }
  }
}

function sortTree(tree: FileTree) {
  if (tree.children) {
    // If order is specified, sort by order. If not, sort by title.
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

const emojiList = ["🌸", "🌳", "🌻", "💐", "🌿", "🌺", "☘️", "🌹", "🌼", "🌷"]

function generateMarkdown(tree: FileTree, docsRoot: string, depth: number, emojis: Set<string>) {
  const path = tree.path.replace(docsRoot, ".")
  let output: string

  if (depth === 0) {
    const emoji = emojis.values().next().value
    output = `\n## ${emoji} ${tree.title}\n\n`
    emojis.delete(emoji)
  } else {
    output = repeat(indent, depth - 1) + `* [${tree.title}](${path})\n`
  }

  // We don't want the root directory of the docs to be a TOC item.
  if (tree.topLevel) {
    output = ""
    depth = -1
  }
  // Empty folders are omitted; README files shouldn't be linked to directly.
  if (tree.name === "README.md" || tree.emptyDir === true || tree.name === "welcome.md") {
    output = ""
  }
  for (let item in tree.children) {
    output += generateMarkdown(tree.children[item], docsRoot, depth + 1, emojis)
  }
  return output
}

const indent: string = "  "

export function generateTableOfContents(docsRoot: string): string {
  const rawTree = <FileTree>dtree(docsRoot, { extensions: /\.md/ })
  if (rawTree === null) {
    throw new Error("Directory not found.")
  }
  rawTree.topLevel = true
  const treeWithMetadata = createNewTree(rawTree, attachMetadata)
  const preparedTree = createNewTree(treeWithMetadata, sortTree)
  return "# Table of Contents\n" + generateMarkdown(preparedTree, docsRoot, 0, new Set(emojiList))
}

export async function writeTableOfContents(docsRoot: string, outputFileName: string) {
  // tslint:disable: no-console
  const toWrite = generateTableOfContents(docsRoot)
  const tocPath = resolve(docsRoot, outputFileName)
  await createFile(tocPath)
  await writeFile(tocPath, toWrite)
  console.log("Table of contents generated successfuly.")
}
