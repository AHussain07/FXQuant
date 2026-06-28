/**
 * Unit tests for controllers/journalController.js
 *
 * Requirements covered:
 *   FR9 — After closing a trade, user can submit a journal entry
 *         with notes and confluence tags (one per trade).
 */

jest.mock("../models/User", () => ({ findOne: jest.fn() }));

jest.mock("../models/JournalEntry", () => {
  const save = jest.fn().mockImplementation(function () {
    return Promise.resolve(this);
  });
  const ctor = jest.fn().mockImplementation(function (fields) {
    Object.assign(this, fields);
    this.save = save;
  });
  ctor.findOne = jest.fn();
  ctor.find = jest.fn();
  return ctor;
});

const User = require("../models/User");
const JournalEntry = require("../models/JournalEntry");
const controller = require("../controllers/journalController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe("createJournalEntry [FR9]", () => {
  const body = {
    userId: "u1",
    tradeId: "t-1",
    symbol: "EURUSD",
    profitLoss: 100,
    notes: "Broke Asia High, FVG respected on 1H",
    confluences: ["Asia High Swept", "FVG Respected"],
  };

  it("should create a journal entry for a closed trade [FR9]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid", userId: "u1" });
    JournalEntry.findOne.mockResolvedValue(null);

    const res = makeRes();
    await controller.createJournalEntry({ body }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(JournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tradeId: "t-1",
        notes: body.notes,
        confluences: body.confluences,
      })
    );
  });

  it("should default confluences to [] when omitted [FR9]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid" });
    JournalEntry.findOne.mockResolvedValue(null);

    const res = makeRes();
    await controller.createJournalEntry(
      { body: { ...body, confluences: undefined } },
      res
    );
    expect(JournalEntry.mock.calls[0][0].confluences).toEqual([]);
  });

  it("should enforce one-entry-per-trade [FR9]", async () => {
    User.findOne.mockResolvedValue({ _id: "u-oid" });
    JournalEntry.findOne.mockResolvedValue({ tradeId: "t-1" });

    const res = makeRes();
    await controller.createJournalEntry({ body }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toMatch(/already exists/i);
  });

  it("should 404 when the user is unknown [FR9]", async () => {
    User.findOne.mockResolvedValue(null);
    const res = makeRes();
    await controller.createJournalEntry({ body }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("updateJournalEntry [FR9]", () => {
  it("should update notes and confluences on an existing entry [FR9]", async () => {
    const entry = {
      tradeId: "t-1",
      notes: "old",
      confluences: ["old"],
      save: jest.fn().mockResolvedValue(undefined),
    };
    JournalEntry.findOne.mockResolvedValue(entry);

    const res = makeRes();
    await controller.updateJournalEntry(
      { params: { tradeId: "t-1" }, body: { notes: "new notes", confluences: ["FVG"] } },
      res
    );

    expect(entry.notes).toBe("new notes");
    expect(entry.confluences).toEqual(["FVG"]);
    expect(entry.save).toHaveBeenCalled();
  });

  it("should 404 when the journal entry doesn't exist [FR9]", async () => {
    JournalEntry.findOne.mockResolvedValue(null);
    const res = makeRes();
    await controller.updateJournalEntry(
      { params: { tradeId: "ghost" }, body: { notes: "x", confluences: [] } },
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
