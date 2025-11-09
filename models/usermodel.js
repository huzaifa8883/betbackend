// // models/User.js
// const mongoose = require("mongoose");
// const { ObjectId } = mongoose.Schema.Types;

// const transactionSchema = new mongoose.Schema({
//   transaction_id: { type: String, required: true },
//   amount: { type: Number, required: true },
//   type: { type: String, enum: ["credit", "debit"], required: true },
//   previous_balance: { type: Number, required: true },
//   new_balance: { type: Number, required: true },
//   description: { type: String },
//   timestamp: { type: Date, default: Date.now },
// });

// const userSchema = new mongoose.Schema(
//   {
//     username: { type: String, required: true, unique: true },
//     email: { type: String, required: true, unique: true },
//     password_hash: { type: String, default: "" },

//     role: {
//       type: String,
//       enum: ["user", "master", "supermaster", "admin", "superadmin"],
//       default: "user",
//     },

//     full_name: { type: String },
//     phone: { type: String },
//     status: { type: String, enum: ["active", "suspended", "inactive"], default: "active" },
//     wallet_balance: { type: Number, default: 0.0 },
//     last_login: { type: Date },

//     parent_id: { type: ObjectId, ref: "User" },
//     children: [{ type: ObjectId, ref: "User" }],

//     transactions: [transactionSchema],
//   },
//   { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
// );

// // --------------- Methods ----------------

// // check if this user can manage another user (role hierarchy)
// userSchema.methods.canManage = function (otherUser) {
//   if (!otherUser) return false;
//   if (this.role === "admin" || this.role === "superadmin") return true;
//   if (this.role === "supermaster" && ["master", "user"].includes(otherUser.role)) return true;
//   if (this.role === "master" && otherUser.role === "user") return true;
//   return false;
// };

// // check if user has required role permission
// userSchema.methods.hasRolePermission = function (requiredRole) {
//   const ROLES = { user: 0, master: 1, supermaster: 2, admin: 3, superadmin: 4 };
//   return (ROLES[this.role] || 0) >= (ROLES[requiredRole] || 0);
// };

// // add a transaction to user's transaction history
// userSchema.methods.addTransaction = function (transaction) {
//   if (!this.transactions) this.transactions = [];
//   this.transactions.push(transaction);
// };

// // update wallet balance and record transaction
// userSchema.methods.updateWalletBalance = function (amount, type, description = "") {
//   const prevBalance = this.wallet_balance;

//   if (type === "credit") {
//     this.wallet_balance += parseFloat(amount);
//   } else if (type === "debit") {
//     if (this.wallet_balance < parseFloat(amount)) {
//       return [false, "Insufficient funds"];
//     }
//     this.wallet_balance -= parseFloat(amount);
//   } else {
//     return [false, "Invalid transaction type"];
//   }

//   const transaction = {
//     transaction_id: new mongoose.Types.ObjectId().toString(),
//     amount: parseFloat(amount),
//     type,
//     previous_balance: prevBalance,
//     new_balance: this.wallet_balance,
//     description,
//     timestamp: new Date(),
//   };

//   this.addTransaction(transaction);

//   return [true, transaction];
// };

// // convert user to safe object for APIs
// userSchema.methods.toSafeObject = function () {
//   return {
//     _id: this._id.toString(),
//     username: this.username,
//     email: this.email,
//     role: this.role,
//     full_name: this.full_name || "",
//     phone: this.phone || "",
//     status: this.status,
//     wallet_balance: this.wallet_balance || 0.0,
//     created_at: this.created_at,
//     updated_at: this.updated_at,
//     last_login: this.last_login,
//     parent_id: this.parent_id ? this.parent_id.toString() : null,
//     children_count: this.children ? this.children.length : 0,
//     transaction_count: this.transactions ? this.transactions.length : 0,
//   };
// };

// module.exports = mongoose.model("User", userSchema);
