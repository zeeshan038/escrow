//NPM Packages
const { db } = require("./firebase"); 

module.exports.connectDb = async()=>{
    try {
        const testRef = db.collection("test").doc("connection-check");
        await testRef.set({
          status: "connected",
          timestamp: Date.now(),
        });
        
        console.log(" Firestore is connected successfully");
      } catch (error) {
        console.error(" Firestore connection failed:", error);
      }
}
