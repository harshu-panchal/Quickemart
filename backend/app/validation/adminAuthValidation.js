import Joi from "joi";

const passwordSchema = Joi.string()
  .min(10)
  .max(128)
  .pattern(/[a-z]/, "lowercase")
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/[0-9]/, "number")
  .required();

export const bootstrapAdminSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: passwordSchema,
});

export const loginAdminSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(128).required(),
});

export const createEmployeeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: passwordSchema,
  role: Joi.string().trim().valid("admin", "product").default("product"),
  permissions: Joi.array().items(Joi.string()).default([]),
});

export const updateEmployeeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).optional(),
  email: Joi.string().trim().lowercase().email().optional(),
  password: Joi.string().min(10).max(128).pattern(/[a-z]/, "lowercase").pattern(/[A-Z]/, "uppercase").pattern(/[0-9]/, "number").optional().allow("", null),
  role: Joi.string().trim().valid("admin", "product").optional(),
  permissions: Joi.array().items(Joi.string()).optional(),
  isActive: Joi.boolean().optional(),
});

export function validateSchema(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (!error) return value;
  const err = new Error(error.details.map((item) => item.message).join("; "));
  err.statusCode = 400;
  throw err;
}
