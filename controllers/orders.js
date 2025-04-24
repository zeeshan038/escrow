// utils
const sendNotification = require("../utils/sendNotification");

//firebase
const { db } = require("../config/firebase");

/**
 @description Getting orders by status
 @route  GET /api/order/getOrders
 @Access Private
 */
module.exports.getOrders = async (req, res) => {
  const { userId, type, status, search } = req.query;

  try {
    if (!userId || !type) {
      return res.status(400).json({
        status: false,
        message: "Provide userId and type",
      });
    }

    const orderRef = db.collection("orders");
    let query = orderRef;

    // Filter by Buyer or Seller
    if (type === "buyer") {
      query = query.where("buyerId", "==", userId);
    } else if (type === "seller") {
      query = query.where("sellerId", "==", userId);
    } else {
      return res.status(400).json({
        status: false,
        message: "Invalid type. Use 'buyer' or 'seller'.",
      });
    }

    // Filter by Status
    // Filter by Status
    if (status) {
      let statusArray = [];

      if (status === "shipped" || status === "held") {
        statusArray = ["shipped", "held"];
        query = query.where("status", "in", statusArray);
      } else {
        query = query.where("status", "==", status);
      }
    }

    // Fetch Orders
    const snapshot = await query.get();
    if (snapshot.empty) {
      return res.status(404).json({
        status: false,
        message: `No orders found for this ${type}${
          status ? ` with status '${status}'` : ""
        }.`,
      });
    }

    let ordersData = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const order = { id: doc.id, ...doc.data() };

        // Fetch Buyer Data
        let buyerData = { userName: "", averageRating: 0, buyerReviews: 0 };
        if (order.buyerId) {
          const buyerSnap = await db
            .collection("users")
            .doc(order.buyerId)
            .get();
          if (buyerSnap.exists) {
            const buyerDoc = buyerSnap.data();
            buyerData = {
              userName: buyerDoc.userName || "",
              averageRating: buyerDoc.averageRating || 0,
              buyerReviews: Array.isArray(buyerDoc.buyerReviews)
                ? buyerDoc.buyerReviews.length
                : 0,
            };
          }
        }

        // Fetch Seller Data
        let sellerData = { userName: null, averageRating: 0, sellerReviews: 0 };
        if (order.sellerId) {
          const sellerSnap = await db
            .collection("users")
            .doc(order.sellerId)
            .get();
          if (sellerSnap.exists) {
            const sellerDoc = sellerSnap.data();
            sellerData = {
              userName: sellerDoc.userName || null,
              averageRating: sellerDoc.averageRating || 0,
              sellerReviews: Array.isArray(sellerDoc.sellerReviews)
                ? sellerDoc.sellerReviews.length
                : 0,
            };
          }
        }

        // Fetch Ad Post Data
        let adData = { adImgUrl: null, longitude: null, latitude: null };
        if (order.adId) {
          const adSnap = await db.collection("adPosts").doc(order.adId).get();
          if (adSnap.exists) {
            const adDoc = adSnap.data();
            adData = {
              adImgUrl: adDoc.adImgUrl || null,
              longitude: adDoc.longitude || null,
              latitude: adDoc.latitude || null,
            };
          }
        }
        return {
          ...order,
          buyer: buyerData,
          seller: sellerData,
          adPost: adData,
        };
      })
    );

    if (search) {
      const searchLower = search.toLowerCase();
      ordersData = ordersData.filter(
        (order) =>
          order.firstName?.toLowerCase().includes(searchLower) ||
          order.shippingMethod?.toLowerCase().includes(searchLower) ||
          order.additionalDetails?.toLowerCase().includes(searchLower)
      );
    }

    return res.status(200).json({
      status: true,
      ordersData,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

/**
 @description Getting specific order
 @route  GET /api/order/order/:id
 @Access Private
 */
module.exports.getSpecificOrder = async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ message: "Order not found" });
    }

    let orderData = orderSnap.data();
    let buyerData = null;
    if (orderData.buyerId) {
      const buyerRef = db.collection("users").doc(orderData.buyerId);
      const buyerSnap = await buyerRef.get();
      if (buyerSnap.exists) {
        const buyerDoc = buyerSnap.data();
        buyerData = {
          name: buyerDoc.userName || "",
          email: buyerDoc.email || "",
        };
      }
    }

    let sellerData = null;
    if (orderData.sellerId) {
      const sellerRef = db.collection("users").doc(orderData.sellerId);
      const sellerSnap = await sellerRef.get();
      if (sellerSnap.exists) {
        const sellerDoc = sellerSnap.data();
        sellerData = {
          name: sellerDoc.userName || "",
          email: sellerDoc.userEmail || "",
        };
      }
    }

    // Fetch Ad Post Data
    let adData = null;
    if (orderData.adId) {
      const adRef = db.collection("adPosts").doc(orderData.adId);
      const adSnap = await adRef.get();
      if (adSnap.exists) {
        adData = { id: adSnap.id, ...adSnap.data() };
      }
    }

    orderData = {
      ...orderData,
      buyer: buyerData,
      seller: sellerData,
      adPost: adData,
    };
    const status = orderData.status; 
    if (status === "dispuute"){
      const disputeRef = db.collection("disputes").doc(orderData.disputeId);
      const disputeSnap = await disputeRef.get();
      if (disputeSnap.exists) {
        const disputeData = disputeSnap.data();
        orderData.disputeDetails = {
          reason: disputeData.reason,
          description: disputeData.description,
          status: disputeData.status,
        };
      }
    } 
    return res.status(200).json({
      status: true,
      orderData,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message,
    });
  }
};

/**
 @description ship the ordder
 @route  GET /api/order/order/:id
 @Access Private
 */
module.exports.orderShipped = async (req, res) => {
  const { orderId } = req.params;

  try {
    if (!orderId) {
      return res.status(400).json({
        status: false,
        message: "Order ID is required",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        status: false,
        message: "Order not found",
      });
    }

    const orderData = orderSnap.data();

    // Update the order status to "shipped"
    await orderRef.update({
      status: "shipped",
    });

    console.log("status", orderData.status);

    // Send notification to the buyer
    if (orderData.buyerId) {
      const buyerRef = db.collection("users").doc(orderData.buyerId);
      const buyerSnap = await buyerRef.get();

      if (buyerSnap.exists) {
        const buyerData = buyerSnap.data();
        const fcmToken = buyerData.pushToken;

        if (fcmToken) {
          const title = "Order Shipped";
          const body = `Your order with ID ${orderId} has been shipped.`;
          await sendNotification(fcmToken, title, body);
        } else {
          console.warn("Buyer does not have an FCM token.");
        }
      }
    }

    orderData.status = "shipped";

    return res.status(200).json({
      status: true,
      message: "Order status updated to shipped",
      orderStatus: orderData.status,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

/**
 @description change the status to complete
 @route  GET /api/order/complete-order/:orderId
 @Access Private
 */
module.exports.completeOrder = async (req, res) => {
  const { orderId } = req.params;
  try {
    if (!orderId) {
      return res.status(400).json({
        status: false,
        message: "Order ID is required",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({
        status: false,
        message: "Order not found",
      });
    }

    const orderData = orderSnap.data();

    console.log(orderData.buyerId);
    // Update the order status to "shipped"
    await orderRef.update({
      status: "complete",
    });

    // Send notification to the buyer
    if (orderData.buyerId) {
      const buyerRef = db.collection("users").doc(orderData.buyerId);
      const buyerSnap = await buyerRef.get();

      if (buyerSnap.exists) {
        const buyerData = buyerSnap.data();
        const fcmToken = buyerData.pushToken;

        if (fcmToken) {
          const title = "Order Shipped";
          const body = `Your order with ID ${orderId} has been arrived.`;
          await sendNotification(fcmToken, title, body);
        } else {
          console.warn("Buyer does not have an FCM token.");
        }
      }
    }
    return res.status(200).json({
      status: true,
      message: "Order status updated to complete",
      orderStatus: orderData.status,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};
