import nodemailer from "nodemailer";
import logger from "./logger.js";

let cachedTransporter = null;

export function useRealEmailOTP() {
  return (
    process.env.USE_REAL_EMAIL_OTP === "true" ||
    process.env.USE_REAL_EMAIL_OTP === "1"
  );
}

function parseSmtpPort() {
  return parseInt(process.env.SMTP_PORT || "587", 10);
}

function parseSmtpSecure(port) {
  if (process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1") {
    return true;
  }

  if (process.env.SMTP_SECURE === "false" || process.env.SMTP_SECURE === "0") {
    return false;
  }

  return port === 465;
}

function getMailFrom() {
  const fromAddress = String(process.env.MAIL_FROM || "").trim();
  const fromName = String(process.env.MAIL_FROM_NAME || "QuickeMart").trim();

  if (!fromAddress) {
    const error = new Error("MAIL_FROM is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  return fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
}

function getTransportConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parseSmtpPort();
  const secure = parseSmtpSecure(port);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "").trim();

  if (!host) {
    const error = new Error("SMTP_HOST is required for email OTP delivery");
    error.statusCode = 500;
    throw error;
  }

  if (!Number.isFinite(port) || port <= 0) {
    const error = new Error("SMTP_PORT must be a valid number");
    error.statusCode = 500;
    throw error;
  }

  if ((user && !pass) || (!user && pass)) {
    const error = new Error("SMTP_USER and SMTP_PASS must be provided together");
    error.statusCode = 500;
    throw error;
  }

  return {
    host,
    port,
    secure,
    ...(user && pass
      ? {
          auth: {
            user,
            pass,
          },
        }
      : {}),
  };
}

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport(getTransportConfig());
  }

  return cachedTransporter;
}

export async function sendSellerVerificationOtpEmail({
  email,
  otp,
  expiresInMinutes,
}) {
  if (!useRealEmailOTP()) {
    logger.info("Seller email OTP generated in mock mode", {
      email,
      otp,
      mode: "mock",
    });
    return {
      delivered: false,
      mode: "mock",
    };
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: getMailFrom(),
    to: email,
    subject: "Verify your seller signup email",
    text: `Your seller signup verification code is ${otp}. This code expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <p>Your seller signup verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });

  return {
    delivered: true,
    mode: "real",
  };
}

export async function sendOrderInvoiceEmail({ order, customerEmail }) {
  const targetEmail = String(customerEmail || order?.customerEmail || "").trim();
  if (!targetEmail) {
    logger.warn("sendOrderInvoiceEmail skipped: No customer email provided", {
      orderId: order?.orderId,
    });
    return { delivered: false, reason: "NO_EMAIL" };
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  const pricing = order?.pricing || {};
  const subtotal = Number(pricing.subtotal || 0);
  const deliveryFee = Number(pricing.deliveryFee || 0);
  const platformFee = Number(pricing.platformFee || pricing.handlingFee || 0);
  const gst = Number(pricing.gst || 0);
  const discount = Number(pricing.discount || 0);
  const tip = Number(pricing.tip || 0);
  const total = Number(pricing.total || 0);
  const paymentMode = String(order?.paymentMode || order?.payment?.method || "COD").toUpperCase();
  const address = order?.address || {};
  const customerName = address.name || "Valued Customer";
  const formattedAddress = [address.address, address.landmark, address.city].filter(Boolean).join(", ") || "Delivery Address";
  const orderDate = order?.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : new Date().toLocaleDateString("en-IN");

  const itemsHtml = items.map((item) => {
    const unitPrice = Number(item.price || 0);
    const qty = Number(item.quantity || 1);
    const lineTotal = (unitPrice * qty).toFixed(2);
    const variant = item.variantSlot || item.variantSku ? ` (${item.variantSlot || item.variantSku})` : "";
    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 8px; font-weight: 500; color: #1e293b;">${item.name || "Item"}${variant}</td>
        <td style="padding: 10px 8px; text-align: center; color: #64748b;">${qty}</td>
        <td style="padding: 10px 8px; text-align: right; color: #64748b;">₹${unitPrice.toFixed(2)}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #0f172a;">₹${lineTotal}</td>
      </tr>
    `;
  }).join("");

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0f172a; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 28px 24px; color: #ffffff; }
        .badge { display: inline-block; background: rgba(255,255,255,0.25); padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .content { padding: 24px; }
        .alert-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; color: #1e40af; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
        .info-card h4 { margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; }
        .info-card p { margin: 2px 0; font-size: 13px; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        .totals-table td { padding: 6px 8px; font-size: 13px; }
        .total-row td { padding-top: 12px; border-top: 2px solid #0f172a; font-size: 16px; font-weight: 800; color: #0f172a; }
        .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <table style="width: 100%; color: #ffffff;">
            <tr>
              <td>
                <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">QuickeMart</h1>
                <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Fast & Fresh Delivery</p>
              </td>
              <td style="text-align: right;">
                <div class="badge">Official Tax Invoice</div>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">#${order.orderId || ""}</div>
              </td>
            </tr>
          </table>
        </div>

        <div class="content">
          <div class="alert-box">
            <strong>⚡ Official Electronics Bill & Warranty Copy:</strong><br/>
            Please retain this bill copy as your official proof of purchase for manufacturer warranty claims and customer support.
          </div>

          <table style="width: 100%; margin-bottom: 20px;">
            <tr>
              <td style="vertical-align: top; width: 50%; padding-right: 8px;">
                <div class="info-card">
                  <h4>Delivery Address</h4>
                  <p><strong>${customerName}</strong></p>
                  <p>${formattedAddress}</p>
                  ${address.phone ? `<p style="color: #64748b;">Phone: ${address.phone}</p>` : ""}
                </div>
              </td>
              <td style="vertical-align: top; width: 50%; padding-left: 8px;">
                <div class="info-card">
                  <h4>Order Summary</h4>
                  <p><strong>Date:</strong> ${orderDate}</p>
                  <p><strong>Payment Mode:</strong> ${paymentMode === "ONLINE" ? "Online Paid" : "Cash on Delivery (COD)"}</p>
                  <p><strong>Bill Sent To:</strong> ${targetEmail}</p>
                </div>
              </td>
            </tr>
          </table>

          <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #334155;">Items Purchased</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <table class="totals-table" style="width: 100%; max-width: 300px; margin-left: auto;">
            <tr>
              <td style="color: #64748b;">Items Subtotal:</td>
              <td style="text-align: right; font-weight: 600; color: #1e293b;">₹${subtotal.toFixed(2)}</td>
            </tr>
            ${deliveryFee > 0 ? `
              <tr>
                <td style="color: #64748b;">Delivery Fee:</td>
                <td style="text-align: right; color: #1e293b;">₹${deliveryFee.toFixed(2)}</td>
              </tr>
            ` : ""}
            ${platformFee > 0 ? `
              <tr>
                <td style="color: #64748b;">Handling / Platform Fee:</td>
                <td style="text-align: right; color: #1e293b;">₹${platformFee.toFixed(2)}</td>
              </tr>
            ` : ""}
            ${gst > 0 ? `
              <tr>
                <td style="color: #64748b;">GST / Taxes:</td>
                <td style="text-align: right; color: #1e293b;">₹${gst.toFixed(2)}</td>
              </tr>
            ` : ""}
            ${discount > 0 ? `
              <tr>
                <td style="color: #16a34a;">Discount:</td>
                <td style="text-align: right; color: #16a34a; font-weight: 600;">-₹${discount.toFixed(2)}</td>
              </tr>
            ` : ""}
            ${tip > 0 ? `
              <tr>
                <td style="color: #64748b;">Rider Tip:</td>
                <td style="text-align: right; color: #1e293b;">₹${tip.toFixed(2)}</td>
              </tr>
            ` : ""}
            <tr class="total-row">
              <td>Grand Total:</td>
              <td style="text-align: right; color: #059669;">₹${total.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">Thank you for shopping with QuickeMart!</p>
          <p style="margin: 0; font-size: 11px;">If you have any questions regarding your electronics warranty or bill, please contact our support team at support@quickemart.com.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const transporter = getTransporter();
    const mailFrom = getMailFrom();
    const info = await transporter.sendMail({
      from: mailFrom,
      to: targetEmail,
      subject: `Your QuickeMart Bill & Tax Invoice - #${order.orderId}`,
      text: `Thank you for your order on QuickeMart! Your order #${order.orderId} total is ₹${total.toFixed(2)}. Please view this email in HTML format for your official bill copy.`,
      html: emailHtml,
    });

    logger.info("Order invoice email sent successfully", {
      orderId: order.orderId,
      recipient: targetEmail,
      messageId: info.messageId,
    });

    return { delivered: true, messageId: info.messageId };
  } catch (err) {
    logger.error("Failed to send order invoice email", {
      orderId: order.orderId,
      recipient: targetEmail,
      error: err.message,
    });
    return { delivered: false, error: err.message };
  }
}

export function __resetEmailTransportForTests() {
  cachedTransporter = null;
}

