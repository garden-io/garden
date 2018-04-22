const hello = require("./libraries/hello-npm-package")

/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.helloFunction = (req, res) => res.send(hello("function"))
