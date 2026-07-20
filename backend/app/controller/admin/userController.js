import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  getUserByIdData,
  getUsersData,
  createCustomerByAdminData,
} from "../../services/admin/userAdminService.js";

export const getUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const data = await getUsersData({ page, limit, skip });
    return handleResponse(res, 200, "Users fetched successfully", data);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserByIdData(id);

    if (!user) {
      return handleResponse(res, 404, "Customer not found");
    }

    return handleResponse(
      res,
      200,
      "Customer details fetched successfully",
      user,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createCustomerByAdmin = async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    if (!name || !phone) {
      return handleResponse(res, 400, "Full Name and Phone Number are required");
    }

    const customer = await createCustomerByAdminData({ name, phone });
    return handleResponse(res, 201, "Customer created successfully", customer);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
