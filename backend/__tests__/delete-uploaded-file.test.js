import { jest } from "@jest/globals";
import path from "path";

// Mock fs/promises and logger
const mockUnlink = jest.fn();
jest.unstable_mockModule("fs/promises", () => ({
  default: {
    unlink: mockUnlink,
  },
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const { deleteUploadedFile } = await import("../app/utils/localStorage.js");

describe("deleteUploadedFile utility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ignores empty, non-string, and Cloudinary URLs", async () => {
    await deleteUploadedFile(null);
    await deleteUploadedFile(undefined);
    await deleteUploadedFile(12345);
    await deleteUploadedFile("https://res.cloudinary.com/demo/image/upload/v12345/sample.jpg");
    await deleteUploadedFile("https://external-domain.com/some-random-image.jpg");

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  test("correctly parses and deletes local uploads URLs (localhost:7000)", async () => {
    await deleteUploadedFile("http://localhost:7000/uploads/products/xyz.jpg");
    
    const expectedPath = path.join(process.cwd(), "public", "uploads", "products", "xyz.jpg");
    expect(mockUnlink).toHaveBeenCalledWith(expectedPath);
  });

  test("correctly parses and deletes URLs routed through /api/uploads/", async () => {
    await deleteUploadedFile("https://quickemartcom.com/api/uploads/master-catalog/abc.png");
    
    const expectedPath = path.join(process.cwd(), "public", "uploads", "master-catalog", "abc.png");
    expect(mockUnlink).toHaveBeenCalledWith(expectedPath);
  });

  test("ignores ENOENT errors gracefully", async () => {
    const error = new Error("File not found");
    error.code = "ENOENT";
    mockUnlink.mockRejectedValueOnce(error);

    await expect(
      deleteUploadedFile("http://localhost:7000/uploads/products/non-existent.jpg")
    ).resolves.not.toThrow();
  });
});
