import UserActivity from "../models/userActivity.js";

/**
 * Parses user-agent header for basic browser and OS identification.
 */
function parseUserAgent(uaString = "") {
  if (!uaString) return { browser: "Unknown", os: "Unknown", device: "Web" };

  let os = "Unknown";
  if (/windows/i.test(uaString)) os = "Windows";
  else if (/macintosh|mac os x/i.test(uaString)) os = "macOS";
  else if (/android/i.test(uaString)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(uaString)) os = "iOS";
  else if (/linux/i.test(uaString)) os = "Linux";

  let browser = "Unknown";
  if (/edg/i.test(uaString)) browser = "Edge";
  else if (/chrome/i.test(uaString)) browser = "Chrome";
  else if (/firefox/i.test(uaString)) browser = "Firefox";
  else if (/safari/i.test(uaString)) browser = "Safari";

  let device = "Desktop";
  if (/mobile|android|iphone|ipad/i.test(uaString)) device = "Mobile";

  return { browser, os, device };
}

/**
 * Non-blocking activity logging helper.
 * Never throws or blocks main request processing.
 */
export async function logActivity({
  userId = null,
  userModel = "User",
  userCustomId = "",
  userName = "System/Guest",
  role = "system",
  action,
  category = "SYSTEM",
  severity = "INFO",
  description,
  metadata = {},
  req = null,
}) {
  try {
    let ipAddress = "0.0.0.0";
    let userAgent = "";

    if (req) {
      ipAddress =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket?.remoteAddress ||
        req.ip ||
        "0.0.0.0";
      userAgent = req.headers["user-agent"] || "";

      if (!userId && req.user) {
        userId = req.user.id || req.user._id || null;
        role = req.user.role || role;
        userName = req.user.name || userName;
        userCustomId = req.user.customerId || req.user.customId || userCustomId;
      }
    }

    const deviceInfo = parseUserAgent(userAgent);

    await UserActivity.create({
      userId,
      userModel,
      userCustomId,
      userName,
      role: (role || "system").toLowerCase(),
      action,
      category,
      severity,
      description,
      metadata,
      ipAddress,
      userAgent,
      deviceInfo,
    });
  } catch (err) {
    console.error("Failed to log user activity (non-fatal):", err.message);
  }
}

/**
 * Fetch paginated activities for Admin Panel with filters.
 */
export async function getUserActivities({
  page = 1,
  limit = 20,
  role = "all",
  category = "all",
  severity = "all",
  startDate = null,
  endDate = null,
  search = "",
}) {
  const query = {};

  if (role && role !== "all") {
    query.role = role.toLowerCase();
  }

  if (category && category !== "all") {
    query.category = category.toUpperCase();
  }

  if (severity && severity !== "all") {
    query.severity = severity.toUpperCase();
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, "i");
    query.$or = [
      { userName: regex },
      { userCustomId: regex },
      { action: regex },
      { description: regex },
      { ipAddress: regex },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;

  const [items, total] = await Promise.all([
    UserActivity.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UserActivity.countDocuments(query),
  ]);

  return {
    items,
    page: Number(page),
    limit: Number(limit),
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Compute high level user activity statistics for Admin dashboard cards.
 */
export async function getUserActivityStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalToday,
    criticalAlertsToday,
    loginsToday,
    roleBreakdown,
  ] = await Promise.all([
    UserActivity.countDocuments({ createdAt: { $gte: startOfDay } }),
    UserActivity.countDocuments({
      createdAt: { $gte: startOfDay },
      severity: "CRITICAL",
    }),
    UserActivity.countDocuments({
      createdAt: { $gte: startOfDay },
      action: { $regex: /login/i },
    }),
    UserActivity.aggregate([
      { $match: { createdAt: { $gte: startOfDay } } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]),
  ]);

  const rolesCount = {
    customer: 0,
    seller: 0,
    delivery: 0,
    admin: 0,
  };

  (roleBreakdown || []).forEach((row) => {
    if (row._id && rolesCount[row._id] !== undefined) {
      rolesCount[row._id] = row.count;
    }
  });

  return {
    totalToday,
    criticalAlertsToday,
    loginsToday,
    rolesCount,
  };
}

/**
 * Get full chronological timeline for a specific user.
 */
export async function getUserTimeline(userIdentifier, limit = 50) {
  const query = {
    $or: [
      { userCustomId: userIdentifier },
      { userName: new RegExp(userIdentifier, "i") },
    ],
  };

  if (userIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
    query.$or.push({ userId: userIdentifier });
  }

  const items = await UserActivity.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return items;
}
