const admin = require("firebase-admin");
const serviceAccount = require("../cell-it-dd264-firebase-adminsdk-4clhp-2143cc1831.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const messaging = admin.messaging();

module.exports = { admin, db, messaging };
