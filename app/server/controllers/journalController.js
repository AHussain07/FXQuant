/**
 * HTTP handlers for the /api/journal endpoints.
 *
 * Journal entries attach trader notes + "confluences" (the setup reasons
 * that justified entering the trade) to a closed trade, one entry per
 * tradeId.
 */

const JournalEntry = require("../models/JournalEntry");
const User = require("../models/User");

/**
 * POST /api/journal
 * Create a journal entry for a trade. Enforces one-entry-per-trade.
 */
exports.createJournalEntry = async (req, res) => {
  try {
    const { userId, tradeId, symbol, profitLoss, notes, confluences } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const existingEntry = await JournalEntry.findOne({ tradeId });
    if (existingEntry) {
      return res.status(400).json({ error: "Journal entry already exists for this trade" });
    }

    const newEntry = await new JournalEntry({
      userId: user._id,
      tradeId,
      symbol,
      profitLoss,
      notes,
      confluences: confluences || [],
    }).save();

    res.status(201).json(newEntry);
  } catch (error) {
    console.error("Error creating journal entry:", error);
    res.status(500).json({ error: error.message });
  }
};

/** GET /api/journal/user/:userId — all journal entries for a user, newest first. */
exports.getJournalEntries = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const entries = await JournalEntry.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json(entries);
  } catch (error) {
    console.error("Error fetching journal entries:", error);
    res.status(500).json({ error: error.message });
  }
};

/** GET /api/journal/trade/:tradeId — single journal entry by trade id. */
exports.getJournalByTradeId = async (req, res) => {
  try {
    const entry = await JournalEntry.findOne({ tradeId: req.params.tradeId });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });
    res.json(entry);
  } catch (error) {
    console.error("Error fetching journal entry:", error);
    res.status(500).json({ error: error.message });
  }
};

/** PUT /api/journal/:tradeId — edit notes and/or confluences on an existing entry. */
exports.updateJournalEntry = async (req, res) => {
  try {
    const { notes, confluences } = req.body;
    const entry = await JournalEntry.findOne({ tradeId: req.params.tradeId });
    if (!entry) return res.status(404).json({ error: "Journal entry not found" });

    entry.notes = notes;
    entry.confluences = confluences;
    await entry.save();

    res.json(entry);
  } catch (error) {
    console.error("Error updating journal entry:", error);
    res.status(500).json({ error: error.message });
  }
};
