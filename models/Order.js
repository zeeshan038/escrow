const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    paymentIntentId: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "held", "released", "completed", "cancelled"],
      default: "held",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
