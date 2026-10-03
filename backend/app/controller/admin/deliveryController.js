import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified, search } = req.query;
    const query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    if (search && String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      query.$or = [{ name: regex }, { phone: regex }, { vehicleNumber: regex }, { currentArea: regex }];
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    const partnerIds = deliveryPartners.map((d) => d._id);

    // Aggregate delivered order counts & today earnings per rider
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [completedCounts, todayEarnings] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            $or: [
              { deliveryBoy: { $in: partnerIds } },
              { deliveryPartner: { $in: partnerIds } },
            ],
            $or: [
              { status: "delivered" },
              { orderStatus: "delivered" },
              { workflowStatus: "DELIVERED" },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$deliveryBoy", "$deliveryPartner"] },
            totalDelivered: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        {
          $match: {
            $or: [
              { deliveryBoy: { $in: partnerIds } },
              { deliveryPartner: { $in: partnerIds } },
            ],
            $or: [
              { status: "delivered" },
              { orderStatus: "delivered" },
              { workflowStatus: "DELIVERED" },
            ],
            updatedAt: { $gte: startOfToday },
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$deliveryBoy", "$deliveryPartner"] },
            earnings: {
              $sum: {
                $add: [
                  { $ifNull: ["$paymentBreakdown.riderPayoutTotal", 0] },
                  { $ifNull: ["$paymentBreakdown.riderTipAmount", 0] },
                  { $ifNull: ["$pricing.deliveryFee", 0] },
                ],
              },
            },
          },
        },
      ]),
    ]);

    const countsMap = new Map();
    completedCounts.forEach((item) => {
      if (item._id) countsMap.set(String(item._id), item.totalDelivered);
    });

    const earningsMap = new Map();
    todayEarnings.forEach((item) => {
      if (item._id) earningsMap.set(String(item._id), item.earnings);
    });

    const enrichedItems = deliveryPartners.map((partner) => {
      const riderIdStr = String(partner._id);
      const totalDelivered = countsMap.get(riderIdStr) || 0;
      const todayEarningsVal = earningsMap.get(riderIdStr) || 0;

      return {
        ...partner,
        totalOrders: totalDelivered,
        completedOrders: totalDelivered,
        deliveredOrders: totalDelivered,
        totalDelivered,
        todayEarnings: todayEarningsVal,
      };
    });

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: enrichedItems,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(
      res,
      200,
      "Rider application rejected and removed",
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: {
        $in: ["confirmed", "packed", "shipped", "out_for_delivery"],
      },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
