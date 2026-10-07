import handleResponse from "../utils/helper.js";
import {
  submitDeliveryRating,
  getDeliveryRatingForOrder,
  getDeliveryPartnerRatingSummary,
  getDeliveryPartnerReviews as getPartnerReviewsService,
  getAdminDeliveryRatings as getAdminRatingsService,
} from "../services/deliveryRatingService.js";

export const createDeliveryRating = async (req, res) => {
  try {
    const customerId = req.user?.id || req.user?._id;
    const { orderId, rating, review, tags } = req.body || {};

    if (!orderId) {
      return handleResponse(res, 400, "orderId is required");
    }
    if (rating === undefined || rating === null) {
      return handleResponse(res, 400, "rating is required");
    }

    const result = await submitDeliveryRating(customerId, {
      orderId,
      rating,
      review,
      tags,
    });

    return handleResponse(res, 201, "Delivery rating submitted successfully", result);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getOrderDeliveryRating = async (req, res) => {
  try {
    const customerId = req.user?.id || req.user?._id;
    const { orderId } = req.params;

    if (!orderId) {
      return handleResponse(res, 400, "orderId parameter is required");
    }

    const status = await getDeliveryRatingForOrder(customerId, orderId);
    return handleResponse(res, 200, "Delivery rating eligibility fetched", status);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getDeliveryPartnerSummary = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return handleResponse(res, 400, "Delivery partner ID is required");
    }

    const summary = await getDeliveryPartnerRatingSummary(id);
    return handleResponse(res, 200, "Delivery partner rating summary fetched", summary);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getSelfDeliveryPartnerSummary = async (req, res) => {
  try {
    const partnerId = req.user?.id || req.user?._id;
    if (!partnerId) {
      return handleResponse(res, 400, "Delivery partner authentication required");
    }

    const summary = await getDeliveryPartnerRatingSummary(partnerId);
    return handleResponse(res, 200, "Delivery partner rating summary fetched", summary);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getDeliveryPartnerReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query;

    if (!id) {
      return handleResponse(res, 400, "Delivery partner ID is required");
    }

    const reviews = await getPartnerReviewsService(id, { page, limit });
    return handleResponse(res, 200, "Delivery partner reviews fetched", reviews);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};

export const getAdminDeliveryRatings = async (req, res) => {
  try {
    const { page, limit, deliveryPartnerId } = req.query;
    const result = await getAdminRatingsService({
      page,
      limit,
      deliveryPartnerId,
    });
    return handleResponse(res, 200, "Admin delivery ratings fetched", result);
  } catch (error) {
    const status = error.statusCode || 500;
    return handleResponse(res, status, error.message);
  }
};
