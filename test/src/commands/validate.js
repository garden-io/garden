"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const context_1 = require("../../../src/context");
const validate_1 = require("../../../src/commands/validate");
describe("commands.validate", () => {
    it("should validate the hello-world project", () => __awaiter(this, void 0, void 0, function* () {
        const root = path_1.join(__dirname, "..", "..", "..", "examples", "hello-world");
        const ctx = new context_1.GardenContext(root);
        const command = new validate_1.ValidateCommand();
        yield command.action(ctx);
    }));
});
//# sourceMappingURL=validate.js.map