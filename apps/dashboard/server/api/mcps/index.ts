import { createError, defineEventHandler } from "h3";
import { proxyJson } from "../../utils/runtimeProxy.js";

export default defineEventHandler(async (event) => {
  if (event.method === "GET") {
    return proxyJson(event, "/api/mcps");
  }

  if (event.method === "POST") {
    return proxyJson(event, "/api/mcps");
  }

  throw createError({
    statusCode: 405,
    statusMessage: "Method Not Allowed",
  });
});
