const { messaging } = require("../config/firebase"); 

const sendNotification = async (token, title, body) => {
    
  const message = {
    notification: {
      title, 
      body,
    },
    token,
  };

  try {
    const response = await messaging.send(message); 
    console.log("Notification sent successfully!", response);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

module.exports = sendNotification;
