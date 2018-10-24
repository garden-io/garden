import Bluebird = require("bluebird")
import { expect } from "chai"
import { getDataDir, makeTestGarden } from "../../helpers"
import { GardenIgnorer } from "../../../src/util/garden-ignorer"

const nestedIgnorefilesProjectRoot = getDataDir("test-project-nested-ignorefiles")
const noIgnorefilesProjectRoot = getDataDir("test-project-no-ignorefiles")

describe("util", () => {
  describe("getIgnorer", () => {

    let nestedIgnorer: GardenIgnorer
    let noIgnorefilesIgnorer: GardenIgnorer

    before(async () => {
      const [noIgnorefilesGarden, nestedIgnorerGarden] = await Bluebird.all([
        makeTestGarden(noIgnorefilesProjectRoot),
        makeTestGarden(nestedIgnorefilesProjectRoot),
      ])
      await Bluebird.all([
        noIgnorefilesGarden.scanModules(),
        nestedIgnorerGarden.scanModules(),
      ])

      noIgnorefilesIgnorer = noIgnorefilesGarden.ignorer
      nestedIgnorer = nestedIgnorerGarden.ignorer
    })

    context("when no ignorefiles are present", () => {

      it("ignores the .garden directory", () => {
        expect(noIgnorefilesIgnorer.ignores(".garden")).to.eql(true)
      })

    })

    context("when ignorefiles are present", () => {

      it("ignores the .garden directory", () => {
        expect(nestedIgnorer.ignores(".garden")).to.eql(true)
        expect(nestedIgnorer.ignores(".garden/foo/bar")).to.eql(true)
      })

      it("applies a rule from .gitignore in project root", () => {
        expect(nestedIgnorer.ignores("foo")).to.eql(true)
      })

      context("for files inside subdirs with ignorefiles", () => {

        it("applies rules from the deepest enclosing subdir", () => {
          expect(nestedIgnorer.ignores("b/wild")).to.eql(true)
        })

        it("does not apply rules from the project-level ignorefiles", () => {
          expect(nestedIgnorer.ignores("b/file-from-root-gitignore")).to.eql(false)
        })

        it("does not apply rules from the other (higher-up) enclosing subdirs", () => {
          expect(nestedIgnorer.ignores("b/b-subdir/file-from-b-gitignore")).to.eql(false)
        })

      })

      context("for files outside subdirs with ignorefiles", () => {

        it("applies rules from the project-level ignorefiles", () => {
          expect(nestedIgnorer.ignores("bar/baz")).to.eql(true)
        })

      })

    })

  })
})
