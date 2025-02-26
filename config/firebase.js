const admin = require("firebase-admin");
const serviceAccount = require("../cellit-sandbox-firebase-adminsdk-7672n-c13b53c090.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore(); 

module.exports = { admin, db };
