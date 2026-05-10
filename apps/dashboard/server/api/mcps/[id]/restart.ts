import { createError, defineEventHandler, getRouterParam } from "h3";
import { proxyJson } from "../../../utils/runtimeProxy.js";

export default defineEventHandler(async (event) => {
  if (event.method !== "POST") {
    throw createError({
      statusCode: 405,
      statusMessage: "Method Not Allowed",
    });
  }

  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing MCP id.",
    });
  }

  return proxyJson(event, `/api/mcps/${id}/restart`);
});
