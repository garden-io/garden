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
const path_1 = require("path");
const dedent = require("dedent");
const chalk_1 = require("chalk");
const exceptions_1 = require("../../exceptions");
const base_1 = require("../base");
const ext_source_util_1 = require("../../util/ext-source-util");
const linkSourceArguments = {
    source: new base_1.StringParameter({
        help: "Name of the source to link as declared in the project config.",
        required: true,
    }),
    path: new base_1.PathParameter({
        help: "Path to the local directory that containes the source.",
        required: true,
    }),
};
class LinkSourceCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "source";
        this.help = "Link a remote source to a local directory.";
        this.arguments = linkSourceArguments;
        this.description = dedent `
    After linking a remote source, Garden will read it from its local directory instead of
    from the remote URL. Garden can only link remote sources that have been declared in the project
    level garden.yml config.

    Examples:

        garden link source my-source path/to/my-source # links my-source to its local version at the given path
  `;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            garden.log.header({ emoji: "link", command: "link source" });
            const sourceType = "project";
            const { source: sourceName, path } = args;
            const projectSourceToLink = garden.projectSources.find(src => src.name === sourceName);
            if (!projectSourceToLink) {
                const availableRemoteSources = garden.projectSources.map(s => s.name).sort();
                throw new exceptions_1.ParameterError(`Remote source ${chalk_1.default.underline(sourceName)} not found in project config.` +
                    ` Did you mean to use the "link module" command?`, {
                    availableRemoteSources,
                    input: sourceName,
                });
            }
            const absPath = path_1.resolve(garden.projectRoot, path);
            const linkedProjectSources = yield ext_source_util_1.addLinkedSources({
                garden,
                sourceType,
                sources: [{ name: sourceName, path: absPath }],
            });
            garden.log.info(`Linked source ${sourceName}`);
            return { result: linkedProjectSources };
        });
    }
}
exports.LinkSourceCommand = LinkSourceCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL2xpbmsvc291cmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7QUFFSCwrQkFBOEI7QUFDOUIsaUNBQWlDO0FBQ2pDLGlDQUF5QjtBQUV6QixpREFBaUQ7QUFDakQsa0NBS2dCO0FBQ2hCLGdFQUE2RDtBQUk3RCxNQUFNLG1CQUFtQixHQUFHO0lBQzFCLE1BQU0sRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDMUIsSUFBSSxFQUFFLCtEQUErRDtRQUNyRSxRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7SUFDRixJQUFJLEVBQUUsSUFBSSxvQkFBYSxDQUFDO1FBQ3RCLElBQUksRUFBRSx3REFBd0Q7UUFDOUQsUUFBUSxFQUFFLElBQUk7S0FDZixDQUFDO0NBQ0gsQ0FBQTtBQUlELE1BQWEsaUJBQWtCLFNBQVEsY0FBYTtJQUFwRDs7UUFDRSxTQUFJLEdBQUcsUUFBUSxDQUFBO1FBQ2YsU0FBSSxHQUFHLDRDQUE0QyxDQUFBO1FBQ25ELGNBQVMsR0FBRyxtQkFBbUIsQ0FBQTtRQUUvQixnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7Ozs7R0FRbkIsQ0FBQTtJQW1DSCxDQUFDO0lBakNPLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQXVCOztZQUNoRCxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUE7WUFFNUQsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFBO1lBRTVCLE1BQU0sRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQTtZQUN6QyxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsQ0FBQTtZQUV0RixJQUFJLENBQUMsbUJBQW1CLEVBQUU7Z0JBQ3hCLE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUE7Z0JBRTVFLE1BQU0sSUFBSSwyQkFBYyxDQUN0QixpQkFBaUIsZUFBSyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsK0JBQStCO29CQUMzRSxpREFBaUQsRUFDakQ7b0JBQ0Usc0JBQXNCO29CQUN0QixLQUFLLEVBQUUsVUFBVTtpQkFDbEIsQ0FDRixDQUFBO2FBQ0Y7WUFFRCxNQUFNLE9BQU8sR0FBRyxjQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUVqRCxNQUFNLG9CQUFvQixHQUFHLE1BQU0sa0NBQWdCLENBQUM7Z0JBQ2xELE1BQU07Z0JBQ04sVUFBVTtnQkFDVixPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO2FBQy9DLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixVQUFVLEVBQUUsQ0FBQyxDQUFBO1lBRTlDLE9BQU8sRUFBRSxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQTtRQUN6QyxDQUFDO0tBQUE7Q0FDRjtBQWhERCw4Q0FnREMiLCJmaWxlIjoiY29tbWFuZHMvbGluay9zb3VyY2UuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQ29weXJpZ2h0IChDKSAyMDE4IEdhcmRlbiBUZWNobm9sb2dpZXMsIEluYy4gPGluZm9AZ2FyZGVuLmlvPlxuICpcbiAqIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAqIExpY2Vuc2UsIHYuIDIuMC4gSWYgYSBjb3B5IG9mIHRoZSBNUEwgd2FzIG5vdCBkaXN0cmlidXRlZCB3aXRoIHRoaXNcbiAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uXG4gKi9cblxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5pbXBvcnQgY2hhbGsgZnJvbSBcImNoYWxrXCJcblxuaW1wb3J0IHsgUGFyYW1ldGVyRXJyb3IgfSBmcm9tIFwiLi4vLi4vZXhjZXB0aW9uc1wiXG5pbXBvcnQge1xuICBDb21tYW5kLFxuICBDb21tYW5kUmVzdWx0LFxuICBTdHJpbmdQYXJhbWV0ZXIsXG4gIFBhdGhQYXJhbWV0ZXIsXG59IGZyb20gXCIuLi9iYXNlXCJcbmltcG9ydCB7IGFkZExpbmtlZFNvdXJjZXMgfSBmcm9tIFwiLi4vLi4vdXRpbC9leHQtc291cmNlLXV0aWxcIlxuaW1wb3J0IHsgTGlua2VkU291cmNlIH0gZnJvbSBcIi4uLy4uL2NvbmZpZy1zdG9yZVwiXG5pbXBvcnQgeyBDb21tYW5kUGFyYW1zIH0gZnJvbSBcIi4uL2Jhc2VcIlxuXG5jb25zdCBsaW5rU291cmNlQXJndW1lbnRzID0ge1xuICBzb3VyY2U6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiTmFtZSBvZiB0aGUgc291cmNlIHRvIGxpbmsgYXMgZGVjbGFyZWQgaW4gdGhlIHByb2plY3QgY29uZmlnLlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbiAgcGF0aDogbmV3IFBhdGhQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiUGF0aCB0byB0aGUgbG9jYWwgZGlyZWN0b3J5IHRoYXQgY29udGFpbmVzIHRoZSBzb3VyY2UuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG50eXBlIEFyZ3MgPSB0eXBlb2YgbGlua1NvdXJjZUFyZ3VtZW50c1xuXG5leHBvcnQgY2xhc3MgTGlua1NvdXJjZUNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kPEFyZ3M+IHtcbiAgbmFtZSA9IFwic291cmNlXCJcbiAgaGVscCA9IFwiTGluayBhIHJlbW90ZSBzb3VyY2UgdG8gYSBsb2NhbCBkaXJlY3RvcnkuXCJcbiAgYXJndW1lbnRzID0gbGlua1NvdXJjZUFyZ3VtZW50c1xuXG4gIGRlc2NyaXB0aW9uID0gZGVkZW50YFxuICAgIEFmdGVyIGxpbmtpbmcgYSByZW1vdGUgc291cmNlLCBHYXJkZW4gd2lsbCByZWFkIGl0IGZyb20gaXRzIGxvY2FsIGRpcmVjdG9yeSBpbnN0ZWFkIG9mXG4gICAgZnJvbSB0aGUgcmVtb3RlIFVSTC4gR2FyZGVuIGNhbiBvbmx5IGxpbmsgcmVtb3RlIHNvdXJjZXMgdGhhdCBoYXZlIGJlZW4gZGVjbGFyZWQgaW4gdGhlIHByb2plY3RcbiAgICBsZXZlbCBnYXJkZW4ueW1sIGNvbmZpZy5cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBsaW5rIHNvdXJjZSBteS1zb3VyY2UgcGF0aC90by9teS1zb3VyY2UgIyBsaW5rcyBteS1zb3VyY2UgdG8gaXRzIGxvY2FsIHZlcnNpb24gYXQgdGhlIGdpdmVuIHBhdGhcbiAgYFxuXG4gIGFzeW5jIGFjdGlvbih7IGdhcmRlbiwgYXJncyB9OiBDb21tYW5kUGFyYW1zPEFyZ3M+KTogUHJvbWlzZTxDb21tYW5kUmVzdWx0PExpbmtlZFNvdXJjZVtdPj4ge1xuICAgIGdhcmRlbi5sb2cuaGVhZGVyKHsgZW1vamk6IFwibGlua1wiLCBjb21tYW5kOiBcImxpbmsgc291cmNlXCIgfSlcblxuICAgIGNvbnN0IHNvdXJjZVR5cGUgPSBcInByb2plY3RcIlxuXG4gICAgY29uc3QgeyBzb3VyY2U6IHNvdXJjZU5hbWUsIHBhdGggfSA9IGFyZ3NcbiAgICBjb25zdCBwcm9qZWN0U291cmNlVG9MaW5rID0gZ2FyZGVuLnByb2plY3RTb3VyY2VzLmZpbmQoc3JjID0+IHNyYy5uYW1lID09PSBzb3VyY2VOYW1lKVxuXG4gICAgaWYgKCFwcm9qZWN0U291cmNlVG9MaW5rKSB7XG4gICAgICBjb25zdCBhdmFpbGFibGVSZW1vdGVTb3VyY2VzID0gZ2FyZGVuLnByb2plY3RTb3VyY2VzLm1hcChzID0+IHMubmFtZSkuc29ydCgpXG5cbiAgICAgIHRocm93IG5ldyBQYXJhbWV0ZXJFcnJvcihcbiAgICAgICAgYFJlbW90ZSBzb3VyY2UgJHtjaGFsay51bmRlcmxpbmUoc291cmNlTmFtZSl9IG5vdCBmb3VuZCBpbiBwcm9qZWN0IGNvbmZpZy5gICtcbiAgICAgICAgYCBEaWQgeW91IG1lYW4gdG8gdXNlIHRoZSBcImxpbmsgbW9kdWxlXCIgY29tbWFuZD9gLFxuICAgICAgICB7XG4gICAgICAgICAgYXZhaWxhYmxlUmVtb3RlU291cmNlcyxcbiAgICAgICAgICBpbnB1dDogc291cmNlTmFtZSxcbiAgICAgICAgfSxcbiAgICAgIClcbiAgICB9XG5cbiAgICBjb25zdCBhYnNQYXRoID0gcmVzb2x2ZShnYXJkZW4ucHJvamVjdFJvb3QsIHBhdGgpXG5cbiAgICBjb25zdCBsaW5rZWRQcm9qZWN0U291cmNlcyA9IGF3YWl0IGFkZExpbmtlZFNvdXJjZXMoe1xuICAgICAgZ2FyZGVuLFxuICAgICAgc291cmNlVHlwZSxcbiAgICAgIHNvdXJjZXM6IFt7IG5hbWU6IHNvdXJjZU5hbWUsIHBhdGg6IGFic1BhdGggfV0sXG4gICAgfSlcblxuICAgIGdhcmRlbi5sb2cuaW5mbyhgTGlua2VkIHNvdXJjZSAke3NvdXJjZU5hbWV9YClcblxuICAgIHJldHVybiB7IHJlc3VsdDogbGlua2VkUHJvamVjdFNvdXJjZXMgfVxuICB9XG59XG4iXX0=
