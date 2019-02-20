import { expect } from "chai"
import { rsyncTargetPath } from "../../../../../../src/plugins/kubernetes/container/deployment"

describe("deployment", () => {
  describe("rsyncTargetPath", () => {
    const paths = [
      // Adds missing slash
      ["/foo/bar", "foo/bar/"],
      // Makes sure it doesn't add more to sub paths
      ["/foo/bar/", "foo/bar/"],
      // Handles basic 1 directory path with absolute path
      ["/foo", "foo/"],
      // Makes sure only a single slash is added
      ["/foo/", "foo/"],
      // Removes duplicate slashes (should never happen)
      ["/foo/bar//", "foo/bar/"],
    ]

    for (const path of paths) {
      it(`handles paths correctly for ${path[0]}`, () => {
        expect(rsyncTargetPath(path[0])).to.eql(path[1])
      })
    }
  })
})
