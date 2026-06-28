const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  tradeId: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  symbol: {
    type: String,
    required: true,
  },
  executionType: {
    type: String,
    enum: ['market', 'limit', 'stop'],
    default: 'market',
  },
  limitPrice: {
    type: Number,
    default: null,
  },
  entryPrice: {
    type: Number,
    default: null,
  },
  exitPrice: {
    type: Number,
    default: null,
  },
  tpPrice: {
    type: Number,
    default: null,
  },
  slPrice: {
    type: Number,
    default: null,
  },
  risk: {
    type: Number,
    default: null,
  },
  orderType: {
    type: String,
    enum: ['buy', 'sell'],
    required: true,
  },
  lotSize: {
    type: Number,
    required: true,
  },
  leverage: {
    type: Number,
    default: 50,
  },
  status: {
    type: String,
    enum: ['pending', 'open', 'closed'],
    default: 'open',
  },
  profit: {
    type: Number,
    default: 0,
  },
  closeReason: {
    type: String,
    enum: ['manual', 'take_profit', 'stop_loss', null],
    default: null,
  },
  closedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});


tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ status: 1 });

module.exports = mongoose.model('Trade', tradeSchema);
