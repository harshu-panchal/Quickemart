import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
  bootstrapAdminSchema,
  loginAdminSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  validateSchema,
} from "../validation/adminAuthValidation.js";

const PUBLIC_ADMIN_SIGNUP_ENABLED = () =>
  process.env.ENABLE_PUBLIC_ADMIN_SIGNUP === "true";

function sanitizeAdmin(adminDoc) {
  const admin = adminDoc?.toObject ? adminDoc.toObject() : { ...(adminDoc || {}) };
  delete admin.password;
  delete admin.__v;
  return admin;
}

const generateToken = (admin) =>
  jwt.sign(
    {
      id: admin._id,
      role: admin.role || "admin",
      permissions: admin.permissions || [],
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

function readBootstrapSecret(req) {
  return String(
    req.headers["x-admin-bootstrap-secret"] ||
      req.body?.adminSecret ||
      "",
  ).trim();
}

export const bootstrapAdmin = async (req, res) => {
  try {
    const configuredSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();
    if (!configuredSecret) {
      return handleResponse(res, 503, "Admin bootstrap is not configured");
    }

    const suppliedSecret = readBootstrapSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return handleResponse(res, 403, "Invalid admin bootstrap secret");
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 409, "Admin bootstrap is disabled after initial setup");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const duplicate = await Admin.findOne({ email: payload.email }).lean();
    if (duplicate) {
      return handleResponse(res, 409, "Admin already exists");
    }

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: true,
      isActive: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin bootstrapped successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const signupAdmin = async (req, res) => {
  try {
    if (!PUBLIC_ADMIN_SIGNUP_ENABLED()) {
      return handleResponse(
        res,
        403,
        "Public admin signup is disabled. Use secure bootstrap flow.",
      );
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 403, "Public admin signup is disabled after bootstrap");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: true,
      isActive: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin registered successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const payload = validateSchema(loginAdminSchema, req.body || {});

    const admin = await Admin.findOne({ email: payload.email }).select("+password");
    if (!admin) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    if (admin.isActive === false) {
      return handleResponse(res, 403, "Your account has been deactivated. Please contact Administrator.");
    }

    const isMatch = await admin.comparePassword(payload.password);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    return handleResponse(res, 200, "Login successful", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Fetch public employee list for admin login dropdown
export const getPublicEmployees = async (req, res) => {
  try {
    const employees = await Admin.find({ isActive: true })
      .select("name email role permissions")
      .sort({ createdAt: -1 })
      .lean();

    return handleResponse(res, 200, "Employees retrieved successfully", employees);
  } catch (error) {
    return handleResponse(res, 500, "Error retrieving public employees");
  }
};

// Admin create employee credential
export const createEmployee = async (req, res) => {
  try {
    const payload = validateSchema(createEmployeeSchema, req.body || {});

    const existing = await Admin.findOne({ email: payload.email }).lean();
    if (existing) {
      return handleResponse(res, 409, "Account with this email already exists");
    }

    const employee = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: payload.role || "product",
      permissions: payload.permissions || (payload.role === "product" ? ["products", "categories"] : []),
      createdBy: req.user?.id || null,
      isVerified: true,
      isActive: true,
    });

    return handleResponse(res, 201, "Employee credential created successfully", sanitizeAdmin(employee));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Admin fetch all employees
export const getEmployees = async (req, res) => {
  try {
    const employees = await Admin.find({})
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return handleResponse(res, 200, "Employees retrieved successfully", employees);
  } catch (error) {
    return handleResponse(res, 500, "Error retrieving employees list");
  }
};

// Admin update employee
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateSchema(updateEmployeeSchema, req.body || {});

    const employee = await Admin.findById(id);
    if (!employee) {
      return handleResponse(res, 404, "Employee account not found");
    }

    if (payload.name) employee.name = payload.name;
    if (payload.email) {
      const emailExists = await Admin.findOne({ email: payload.email, _id: { $ne: id } }).lean();
      if (emailExists) {
        return handleResponse(res, 409, "Email is already taken by another account");
      }
      employee.email = payload.email;
    }
    if (payload.password && payload.password.trim() !== "") {
      employee.password = payload.password;
    }
    if (payload.role) employee.role = payload.role;
    if (payload.permissions) employee.permissions = payload.permissions;
    if (typeof payload.isActive === "boolean") employee.isActive = payload.isActive;

    await employee.save();
    return handleResponse(res, 200, "Employee account updated successfully", sanitizeAdmin(employee));
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

// Admin delete employee
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user?.id === id) {
      return handleResponse(res, 400, "You cannot delete your own admin account");
    }

    const employee = await Admin.findByIdAndDelete(id);
    if (!employee) {
      return handleResponse(res, 404, "Employee account not found");
    }

    return handleResponse(res, 200, "Employee account deleted successfully");
  } catch (error) {
    return handleResponse(res, 500, "Error deleting employee account");
  }
};

