const {onRequest} = require("firebase-functions/v2/https");
const {setGlobalOptions} = require("firebase-functions");

setGlobalOptions({maxInstances: 10});

const app = require("../server");

exports.api = onRequest(app);
