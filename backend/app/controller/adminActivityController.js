import {
  getUserActivities,
  getUserActivityStats,
  getUserTimeline,
  logActivity,
} from "../services/userActivityService.js";
import { handleResponse } from "../utils/helper.js";

/**
 * GET /api/admin/user-activities
 * Query paginated activity logs with search, role, category, severity, date range filters.
 */
export const getActivities = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role = "all",
      category = "all",
      severity = "all",
      startDate = null,
      endDate = null,
      search = "",
    } = req.query;

    const result = await getUserActivities({
      page: Number(page),
      limit: Number(limit),
      role,
      category,
      severity,
      startDate,
      endDate,
      search,
    });

    return handleResponse(res, 200, "User activities fetched successfully", result);
  } catch (error) {
    console.error("Error fetching user activities:", error);
    return handleResponse(res, 500, error.message || "Failed to fetch user activities");
  }
};

/**
 * GET /api/admin/user-activities/stats
 * Aggregate metrics for activity dashboard cards.
 */
export const getActivityStats = async (req, res) => {
  try {
    const stats = await getUserActivityStats();
    return handleResponse(res, 200, "User activity stats fetched successfully", stats);
  } catch (error) {
    console.error("Error fetching activity stats:", error);
    return handleResponse(res, 500, error.message || "Failed to fetch activity stats");
  }
};

/**
 * GET /api/admin/user-activities/user/:userIdentifier
 * Fetch chronological activity timeline for a target user.
 */
export const getUserActivityTimeline = async (req, res) => {
  try {
    const { userIdentifier } = req.params;
    const { limit = 50 } = req.query;

    if (!userIdentifier) {
      return handleResponse(res, 400, "User identifier is required");
    }

    const timeline = await getUserTimeline(userIdentifier, Number(limit));
    return handleResponse(res, 200, "User timeline fetched successfully", timeline);
  } catch (error) {
    console.error("Error fetching user timeline:", error);
    return handleResponse(res, 500, error.message || "Failed to fetch user timeline");
  }
};

/**
 * POST /api/admin/logout (and role logouts)
 * Records user logout event in activity logs.
 */
export const handleLogoutActivity = async (req, res) => {
  try {
    if (req.user) {
      const userRole = (req.user.role || "user").toLowerCase();
      const modelName =
        userRole === "admin"
          ? "Admin"
          : userRole === "seller"
          ? "Seller"
          : userRole === "delivery"
          ? "Delivery"
          : "Customer";

      await logActivity({
        userId: req.user.id || req.user._id,
        userModel: modelName,
        userName: req.user.name || "User",
        userCustomId: req.user.customerId || req.user.customId || "",
        role: userRole,
        action: `${userRole.toUpperCase()}_LOGOUT`,
        category: "AUTH",
        severity: "INFO",
        description: `${userRole.toUpperCase()} ${req.user.name || req.user.email || req.user.phone || ""} logged out`,
        req,
      });
    }
    return handleResponse(res, 200, "Logged out successfully");
  } catch (error) {
    return handleResponse(res, 200, "Logged out successfully");
  }
};
