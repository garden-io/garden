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
const dedent = require("dedent");
const base_1 = require("../base");
const sources_1 = require("./sources");
const modules_1 = require("./modules");
class UpdateRemoteAllCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "all";
        this.help = "Update all remote sources and modules.";
        this.description = dedent `
    Examples:

        garden update-remote all # update all remote sources and modules in the project
  `;
    }
    action({ garden }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "hammer_and_wrench", command: "update-remote all" });
            const sourcesCmd = new sources_1.UpdateRemoteSourcesCommand();
            const modulesCmd = new modules_1.UpdateRemoteModulesCommand();
            const { result: projectSources } = yield sourcesCmd.action({ garden, args: { source: undefined }, opts: {} });
            const { result: moduleSources } = yield modulesCmd.action({ garden, args: { module: undefined }, opts: {} });
            return { result: { projectSources: projectSources, moduleSources: moduleSources } };
        });
    }
}
exports.UpdateRemoteAllCommand = UpdateRemoteAllCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3VwZGF0ZS1yZW1vdGUvYWxsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCxpQ0FBaUM7QUFFakMsa0NBSWdCO0FBQ2hCLHVDQUFzRDtBQUN0RCx1Q0FBc0Q7QUFRdEQsTUFBYSxzQkFBdUIsU0FBUSxjQUFPO0lBQW5EOztRQUNFLFNBQUksR0FBRyxLQUFLLENBQUE7UUFDWixTQUFJLEdBQUcsd0NBQXdDLENBQUE7UUFFL0MsZ0JBQVcsR0FBRyxNQUFNLENBQUE7Ozs7R0FJbkIsQ0FBQTtJQWNILENBQUM7SUFaTyxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQWlCOztZQUVwQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFBO1lBRS9FLE1BQU0sVUFBVSxHQUFHLElBQUksb0NBQTBCLEVBQUUsQ0FBQTtZQUNuRCxNQUFNLFVBQVUsR0FBRyxJQUFJLG9DQUEwQixFQUFFLENBQUE7WUFFbkQsTUFBTSxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsR0FBRyxNQUFNLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFBO1lBQzdHLE1BQU0sRUFBRSxNQUFNLEVBQUUsYUFBYSxFQUFFLEdBQUcsTUFBTSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQTtZQUU1RyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUUsY0FBYyxFQUFFLGNBQWUsRUFBRSxhQUFhLEVBQUUsYUFBYyxFQUFFLEVBQUUsQ0FBQTtRQUN2RixDQUFDO0tBQUE7Q0FDRjtBQXRCRCx3REFzQkMiLCJmaWxlIjoiY29tbWFuZHMvdXBkYXRlLXJlbW90ZS9hbGwuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IGRlZGVudCA9IHJlcXVpcmUoXCJkZWRlbnRcIilcblxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgQ29tbWFuZFBhcmFtcyxcbn0gZnJvbSBcIi4uL2Jhc2VcIlxuaW1wb3J0IHsgVXBkYXRlUmVtb3RlU291cmNlc0NvbW1hbmQgfSBmcm9tIFwiLi9zb3VyY2VzXCJcbmltcG9ydCB7IFVwZGF0ZVJlbW90ZU1vZHVsZXNDb21tYW5kIH0gZnJvbSBcIi4vbW9kdWxlc1wiXG5pbXBvcnQgeyBTb3VyY2VDb25maWcgfSBmcm9tIFwiLi4vLi4vY29uZmlnL3Byb2plY3RcIlxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZGF0ZVJlbW90ZUFsbFJlc3VsdCB7XG4gIHByb2plY3RTb3VyY2VzOiBTb3VyY2VDb25maWdbXSxcbiAgbW9kdWxlU291cmNlczogU291cmNlQ29uZmlnW10sXG59XG5cbmV4cG9ydCBjbGFzcyBVcGRhdGVSZW1vdGVBbGxDb21tYW5kIGV4dGVuZHMgQ29tbWFuZCB7XG4gIG5hbWUgPSBcImFsbFwiXG4gIGhlbHAgPSBcIlVwZGF0ZSBhbGwgcmVtb3RlIHNvdXJjZXMgYW5kIG1vZHVsZXMuXCJcblxuICBkZXNjcmlwdGlvbiA9IGRlZGVudGBcbiAgICBFeGFtcGxlczpcblxuICAgICAgICBnYXJkZW4gdXBkYXRlLXJlbW90ZSBhbGwgIyB1cGRhdGUgYWxsIHJlbW90ZSBzb3VyY2VzIGFuZCBtb2R1bGVzIGluIHRoZSBwcm9qZWN0XG4gIGBcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4gfTogQ29tbWFuZFBhcmFtcyk6IFByb21pc2U8Q29tbWFuZFJlc3VsdDxVcGRhdGVSZW1vdGVBbGxSZXN1bHQ+PiB7XG5cbiAgICBnYXJkZW4ubG9nLmhlYWRlcih7IGVtb2ppOiBcImhhbW1lcl9hbmRfd3JlbmNoXCIsIGNvbW1hbmQ6IFwidXBkYXRlLXJlbW90ZSBhbGxcIiB9KVxuXG4gICAgY29uc3Qgc291cmNlc0NtZCA9IG5ldyBVcGRhdGVSZW1vdGVTb3VyY2VzQ29tbWFuZCgpXG4gICAgY29uc3QgbW9kdWxlc0NtZCA9IG5ldyBVcGRhdGVSZW1vdGVNb2R1bGVzQ29tbWFuZCgpXG5cbiAgICBjb25zdCB7IHJlc3VsdDogcHJvamVjdFNvdXJjZXMgfSA9IGF3YWl0IHNvdXJjZXNDbWQuYWN0aW9uKHsgZ2FyZGVuLCBhcmdzOiB7IHNvdXJjZTogdW5kZWZpbmVkIH0sIG9wdHM6IHt9IH0pXG4gICAgY29uc3QgeyByZXN1bHQ6IG1vZHVsZVNvdXJjZXMgfSA9IGF3YWl0IG1vZHVsZXNDbWQuYWN0aW9uKHsgZ2FyZGVuLCBhcmdzOiB7IG1vZHVsZTogdW5kZWZpbmVkIH0sIG9wdHM6IHt9IH0pXG5cbiAgICByZXR1cm4geyByZXN1bHQ6IHsgcHJvamVjdFNvdXJjZXM6IHByb2plY3RTb3VyY2VzISwgbW9kdWxlU291cmNlczogbW9kdWxlU291cmNlcyEgfSB9XG4gIH1cbn1cbiJdfQ==
