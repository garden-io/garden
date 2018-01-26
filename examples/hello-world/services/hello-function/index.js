/**
 * HTTP Cloud Function.
 *
 * @param {Object} req Cloud Function request context.
 * @param {Object} res Cloud Function response context.
 */
exports.helloWorld = (req, res) => res.send(process.env.HELLO_WORLD_MESSAGE)
