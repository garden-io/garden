/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../../src/util/string.js"
import { expect } from "chai"
import { convertMarkdownLinks, makeDocsLinkPlain, makeDocsLinkOpts } from "../../../../src/docs/common.js"
import { DOCS_BASE_URL } from "../../../../src/constants.js"

describe("convertMarkdownLinks", () => {
  it("should convert all markdown links in the given text to plain links", () => {
    const text = dedent`
    For a full reference, see the [Output configuration context](https://docs.garden.io/reference/template-strings/project-outputs) section in the Template String Reference.

    See the [Configuration Files guide](https://docs.garden.io/guides/configuration-overview#including-excluding-files-and-directories) for details.
    `

    expect(convertMarkdownLinks(text)).to.equal(dedent`
    For a full reference, see the Output configuration context (https://docs.garden.io/reference/template-strings/project-outputs) section in the Template String Reference.

    See the Configuration Files guide (https://docs.garden.io/guides/configuration-overview#including-excluding-files-and-directories) for details.
    `)
  })
})

describe("makeDocsLink", () => {
  const originalRelDocValue = makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH
  after(() => {
    makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = originalRelDocValue
  })

  it("should use docs base url when relative docs path is not set", () => {
    makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = ""
    expect(makeDocsLinkPlain("file")).to.eql(DOCS_BASE_URL + "/file")
    expect(makeDocsLinkPlain`file`).to.eql(DOCS_BASE_URL + "/file")
    expect(makeDocsLinkPlain("path/file")).to.eql(DOCS_BASE_URL + "/path/file")
    expect(makeDocsLinkPlain`path/file`).to.eql(DOCS_BASE_URL + "/path/file")
    expect(makeDocsLinkPlain("file", "#frag")).to.eql(DOCS_BASE_URL + "/file#frag")
    expect(makeDocsLinkPlain("path/file", "#frag")).to.eql(DOCS_BASE_URL + "/path/file#frag")
  })

  it("should use relative docs path if set", () => {
    makeDocsLinkOpts.GARDEN_RELATIVE_DOCS_PATH = "../"
    expect(makeDocsLinkPlain("file")).to.eql("../file.md")
    expect(makeDocsLinkPlain`file`).to.eql("../file.md")
    expect(makeDocsLinkPlain("path/file")).to.eql("../path/file.md")
    expect(makeDocsLinkPlain`path/file`).to.eql("../path/file.md")
    expect(makeDocsLinkPlain("file", "#frag")).to.eql("../file.md#frag")
    expect(makeDocsLinkPlain("path/file", "#frag")).to.eql("../path/file.md#frag")
  })
})
