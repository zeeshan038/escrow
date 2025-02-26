const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0 }, 
    withdrawalMethod: { type: String, enum: ["paypal", "bank", "wise"], default: "bank" },
    paypalEmail: { type: String }, 
    bankDetails: {
      accountNumber: { type: String },
      routingNumber: { type: String },
      bankName: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
