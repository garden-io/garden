"use strict";
/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("./base");
const dedent = require("dedent");
class ValidateCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "validate";
        this.help = "Check your garden configuration for errors.";
        this.description = dedent `
    Throws an error and exits with code 1 if something's not right in your garden.yml files.
  `;
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "heavy_check_mark", command: "validate" });
            yield garden.getModules();
            return {};
        });
    }
}
exports.ValidateCommand = ValidateCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3ZhbGlkYXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FJZTtBQUNmLGlDQUFpQztBQUVqQyxNQUFhLGVBQWdCLFNBQVEsY0FBTztJQUE1Qzs7UUFDRSxTQUFJLEdBQUcsVUFBVSxDQUFBO1FBQ2pCLFNBQUksR0FBRyw2Q0FBNkMsQ0FBQTtRQUVwRCxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7R0FFbkIsQ0FBQTtJQVNILENBQUM7SUFQTyxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQWlCOztZQUNwQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQTtZQUVyRSxNQUFNLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQTtZQUV6QixPQUFPLEVBQUUsQ0FBQTtRQUNYLENBQUM7S0FBQTtDQUNGO0FBZkQsMENBZUMiLCJmaWxlIjoiY29tbWFuZHMvdmFsaWRhdGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgQ29tbWFuZFJlc3VsdCxcbn0gZnJvbSBcIi4vYmFzZVwiXG5pbXBvcnQgZGVkZW50ID0gcmVxdWlyZShcImRlZGVudFwiKVxuXG5leHBvcnQgY2xhc3MgVmFsaWRhdGVDb21tYW5kIGV4dGVuZHMgQ29tbWFuZCB7XG4gIG5hbWUgPSBcInZhbGlkYXRlXCJcbiAgaGVscCA9IFwiQ2hlY2sgeW91ciBnYXJkZW4gY29uZmlndXJhdGlvbiBmb3IgZXJyb3JzLlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgVGhyb3dzIGFuIGVycm9yIGFuZCBleGl0cyB3aXRoIGNvZGUgMSBpZiBzb21ldGhpbmcncyBub3QgcmlnaHQgaW4geW91ciBnYXJkZW4ueW1sIGZpbGVzLlxuICBgXG5cbiAgYXN5bmMgYWN0aW9uKHsgZ2FyZGVuIH06IENvbW1hbmRQYXJhbXMpOiBQcm9taXNlPENvbW1hbmRSZXN1bHQ+IHtcbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7IGVtb2ppOiBcImhlYXZ5X2NoZWNrX21hcmtcIiwgY29tbWFuZDogXCJ2YWxpZGF0ZVwiIH0pXG5cbiAgICBhd2FpdCBnYXJkZW4uZ2V0TW9kdWxlcygpXG5cbiAgICByZXR1cm4ge31cbiAgfVxufVxuIl19
