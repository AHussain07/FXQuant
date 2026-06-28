const mongoose = require("mongoose");

const journalEntrySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  tradeId: {
    type: String,
    required: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
  },
  profitLoss: {
    type: Number,
    required: true,
  },
  notes: {
    type: String,
    required: true,
  },
  confluences: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("JournalEntry", journalEntrySchema);