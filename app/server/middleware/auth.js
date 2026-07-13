/**
 * Authentication and ownership enforcement.
 *
 * Before this existed every route was public and simply trusted whatever
 * userId the caller put in the URL or body. Since a userId is derivable from
 * an email address, knowing someone's email was enough to read or mutate their
 * account.
 *
 * The rule now: the authenticated user is the only user you can act as. These
 * run in front of the controllers, so the controllers keep reading
 * `req.params.userId` / `req.body.userId` as before -- those values are just
 * guaranteed to be the caller's own by the time they see them.
 */

const User = require("../models/User");
const Trade = require("../models/Trade");
const { verifyAppToken } = require("../utils/appToken");
const { serverError } = require("../utils/httpError");

/**
 * Require a valid session token. Sets `req.userId` to the caller's public id.
 */
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const userId = verifyAppToken(token);
  if (!userId) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  req.userId = userId;
  next();
};

/**
 * For routes carrying a :userId path param. Rejects any attempt to act on an
 * account other than your own.
 */
const requireSelfParam = (req, res, next) => {
  if (req.params.userId !== req.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

/**
 * For routes that take a userId in the body (trade + journal creation).
 * Overwrites it with the authenticated id rather than rejecting, so a client
 * simply cannot create a record under someone else's account.
 */
const forceSelfBody = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body.userId = req.userId;
  }
  next();
};

/**
 * For routes keyed by :tradeId (trade actions, and journal entries, which are
 * keyed by the trade they belong to). Confirms the trade is the caller's.
 */
const requireTradeOwnership = async (req, res, next) => {
  try {
    const [user, trade] = await Promise.all([
      User.findOne({ userId: req.userId }),
      Trade.findOne({ tradeId: req.params.tradeId }),
    ]);

    if (!user) return res.status(401).json({ message: "Authentication required" });
    if (!trade) return res.status(404).json({ message: "Trade not found" });

    if (!trade.userId.equals(user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  } catch (error) {
    serverError(res, "Trade ownership check error", error);
  }
};

module.exports = {
  requireAuth,
  requireSelfParam,
  forceSelfBody,
  requireTradeOwnership,
};
