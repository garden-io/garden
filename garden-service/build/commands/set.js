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
class SetCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "set";
        this.help = "Set or modify data, e.g. secrets.";
        this.subCommands = [
            SetSecretCommand,
        ];
    }
    action() {
        return __awaiter(this, void 0, void 0, function* () { return {}; });
    }
}
exports.SetCommand = SetCommand;
const setSecretArgs = {
    provider: new base_1.StringParameter({
        help: "The name of the provider to store the secret with.",
        required: true,
    }),
    key: new base_1.StringParameter({
        help: "A unique identifier for the secret.",
        required: true,
    }),
    value: new base_1.StringParameter({
        help: "The value of the secret.",
        required: true,
    }),
};
// TODO: allow storing data from files
class SetSecretCommand extends base_1.Command {
    constructor() {
        super(...arguments);
        this.name = "secret";
        this.help = "Set a secret value for a provider in an environment.";
        this.description = dedent `
    These secrets are handled by each provider, and may for example be exposed as environment
    variables for services or mounted as files, depending on how the provider is implemented
    and configured.

    _Note: The value is currently always stored as a string._

    Examples:

        garden set secret kubernetes somekey myvalue
        garden set secret local-kubernets somekey myvalue
  `;
        this.arguments = setSecretArgs;
    }
    action({ garden, args }) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = args.key;
            const result = yield garden.actions.setSecret({ pluginName: args.provider, key, value: args.value });
            garden.log.info(`Set config key ${args.key}`);
            return { result };
        });
    }
}
exports.SetSecretCommand = SetSecretCommand;

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1hbmRzL3NldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7O0FBR0gsaUNBS2U7QUFDZixpQ0FBaUM7QUFFakMsTUFBYSxVQUFXLFNBQVEsY0FBTztJQUF2Qzs7UUFDRSxTQUFJLEdBQUcsS0FBSyxDQUFBO1FBQ1osU0FBSSxHQUFHLG1DQUFtQyxDQUFBO1FBRTFDLGdCQUFXLEdBQUc7WUFDWixnQkFBZ0I7U0FDakIsQ0FBQTtJQUdILENBQUM7SUFETyxNQUFNOzhEQUFLLE9BQU8sRUFBRSxDQUFBLENBQUMsQ0FBQztLQUFBO0NBQzdCO0FBVEQsZ0NBU0M7QUFFRCxNQUFNLGFBQWEsR0FBRztJQUNwQixRQUFRLEVBQUUsSUFBSSxzQkFBZSxDQUFDO1FBQzVCLElBQUksRUFBRSxvREFBb0Q7UUFDMUQsUUFBUSxFQUFFLElBQUk7S0FDZixDQUFDO0lBQ0YsR0FBRyxFQUFFLElBQUksc0JBQWUsQ0FBQztRQUN2QixJQUFJLEVBQUUscUNBQXFDO1FBQzNDLFFBQVEsRUFBRSxJQUFJO0tBQ2YsQ0FBQztJQUNGLEtBQUssRUFBRSxJQUFJLHNCQUFlLENBQUM7UUFDekIsSUFBSSxFQUFFLDBCQUEwQjtRQUNoQyxRQUFRLEVBQUUsSUFBSTtLQUNmLENBQUM7Q0FDSCxDQUFBO0FBSUQsc0NBQXNDO0FBRXRDLE1BQWEsZ0JBQWlCLFNBQVEsY0FBNkI7SUFBbkU7O1FBQ0UsU0FBSSxHQUFHLFFBQVEsQ0FBQTtRQUNmLFNBQUksR0FBRyxzREFBc0QsQ0FBQTtRQUU3RCxnQkFBVyxHQUFHLE1BQU0sQ0FBQTs7Ozs7Ozs7Ozs7R0FXbkIsQ0FBQTtRQUVELGNBQVMsR0FBRyxhQUFhLENBQUE7SUFRM0IsQ0FBQztJQU5PLE1BQU0sQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQTBCOztZQUNuRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFBO1lBQ3BCLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFBO1lBQ3BHLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLGtCQUFrQixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQTtZQUM3QyxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUE7UUFDbkIsQ0FBQztLQUFBO0NBQ0Y7QUF6QkQsNENBeUJDIiwiZmlsZSI6ImNvbW1hbmRzL3NldC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBDb3B5cmlnaHQgKEMpIDIwMTggR2FyZGVuIFRlY2hub2xvZ2llcywgSW5jLiA8aW5mb0BnYXJkZW4uaW8+XG4gKlxuICogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICogZmlsZSwgWW91IGNhbiBvYnRhaW4gb25lIGF0IGh0dHA6Ly9tb3ppbGxhLm9yZy9NUEwvMi4wLy5cbiAqL1xuXG5pbXBvcnQgeyBTZXRTZWNyZXRSZXN1bHQgfSBmcm9tIFwiLi4vdHlwZXMvcGx1Z2luL291dHB1dHNcIlxuaW1wb3J0IHtcbiAgQ29tbWFuZCxcbiAgQ29tbWFuZFJlc3VsdCxcbiAgQ29tbWFuZFBhcmFtcyxcbiAgU3RyaW5nUGFyYW1ldGVyLFxufSBmcm9tIFwiLi9iYXNlXCJcbmltcG9ydCBkZWRlbnQgPSByZXF1aXJlKFwiZGVkZW50XCIpXG5cbmV4cG9ydCBjbGFzcyBTZXRDb21tYW5kIGV4dGVuZHMgQ29tbWFuZCB7XG4gIG5hbWUgPSBcInNldFwiXG4gIGhlbHAgPSBcIlNldCBvciBtb2RpZnkgZGF0YSwgZS5nLiBzZWNyZXRzLlwiXG5cbiAgc3ViQ29tbWFuZHMgPSBbXG4gICAgU2V0U2VjcmV0Q29tbWFuZCxcbiAgXVxuXG4gIGFzeW5jIGFjdGlvbigpIHsgcmV0dXJuIHt9IH1cbn1cblxuY29uc3Qgc2V0U2VjcmV0QXJncyA9IHtcbiAgcHJvdmlkZXI6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIG5hbWUgb2YgdGhlIHByb3ZpZGVyIHRvIHN0b3JlIHRoZSBzZWNyZXQgd2l0aC5cIixcbiAgICByZXF1aXJlZDogdHJ1ZSxcbiAgfSksXG4gIGtleTogbmV3IFN0cmluZ1BhcmFtZXRlcih7XG4gICAgaGVscDogXCJBIHVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGUgc2VjcmV0LlwiLFxuICAgIHJlcXVpcmVkOiB0cnVlLFxuICB9KSxcbiAgdmFsdWU6IG5ldyBTdHJpbmdQYXJhbWV0ZXIoe1xuICAgIGhlbHA6IFwiVGhlIHZhbHVlIG9mIHRoZSBzZWNyZXQuXCIsXG4gICAgcmVxdWlyZWQ6IHRydWUsXG4gIH0pLFxufVxuXG50eXBlIFNldEFyZ3MgPSB0eXBlb2Ygc2V0U2VjcmV0QXJnc1xuXG4vLyBUT0RPOiBhbGxvdyBzdG9yaW5nIGRhdGEgZnJvbSBmaWxlc1xuXG5leHBvcnQgY2xhc3MgU2V0U2VjcmV0Q29tbWFuZCBleHRlbmRzIENvbW1hbmQ8dHlwZW9mIHNldFNlY3JldEFyZ3M+IHtcbiAgbmFtZSA9IFwic2VjcmV0XCJcbiAgaGVscCA9IFwiU2V0IGEgc2VjcmV0IHZhbHVlIGZvciBhIHByb3ZpZGVyIGluIGFuIGVudmlyb25tZW50LlwiXG5cbiAgZGVzY3JpcHRpb24gPSBkZWRlbnRgXG4gICAgVGhlc2Ugc2VjcmV0cyBhcmUgaGFuZGxlZCBieSBlYWNoIHByb3ZpZGVyLCBhbmQgbWF5IGZvciBleGFtcGxlIGJlIGV4cG9zZWQgYXMgZW52aXJvbm1lbnRcbiAgICB2YXJpYWJsZXMgZm9yIHNlcnZpY2VzIG9yIG1vdW50ZWQgYXMgZmlsZXMsIGRlcGVuZGluZyBvbiBob3cgdGhlIHByb3ZpZGVyIGlzIGltcGxlbWVudGVkXG4gICAgYW5kIGNvbmZpZ3VyZWQuXG5cbiAgICBfTm90ZTogVGhlIHZhbHVlIGlzIGN1cnJlbnRseSBhbHdheXMgc3RvcmVkIGFzIGEgc3RyaW5nLl9cblxuICAgIEV4YW1wbGVzOlxuXG4gICAgICAgIGdhcmRlbiBzZXQgc2VjcmV0IGt1YmVybmV0ZXMgc29tZWtleSBteXZhbHVlXG4gICAgICAgIGdhcmRlbiBzZXQgc2VjcmV0IGxvY2FsLWt1YmVybmV0cyBzb21la2V5IG15dmFsdWVcbiAgYFxuXG4gIGFyZ3VtZW50cyA9IHNldFNlY3JldEFyZ3NcblxuICBhc3luYyBhY3Rpb24oeyBnYXJkZW4sIGFyZ3MgfTogQ29tbWFuZFBhcmFtczxTZXRBcmdzPik6IFByb21pc2U8Q29tbWFuZFJlc3VsdDxTZXRTZWNyZXRSZXN1bHQ+PiB7XG4gICAgY29uc3Qga2V5ID0gYXJncy5rZXlcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnYXJkZW4uYWN0aW9ucy5zZXRTZWNyZXQoeyBwbHVnaW5OYW1lOiBhcmdzLnByb3ZpZGVyLCBrZXksIHZhbHVlOiBhcmdzLnZhbHVlIH0pXG4gICAgZ2FyZGVuLmxvZy5pbmZvKGBTZXQgY29uZmlnIGtleSAke2FyZ3Mua2V5fWApXG4gICAgcmV0dXJuIHsgcmVzdWx0IH1cbiAgfVxufVxuIl19
