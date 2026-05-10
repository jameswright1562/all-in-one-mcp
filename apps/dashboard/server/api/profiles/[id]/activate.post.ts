import { createError, defineEventHandler, getRouterParam } from "h3";
import { proxyJson } from "../../../utils/runtimeProxy.js";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing profile id.",
    });
  }

  return proxyJson(event, `/api/profiles/${id}/activate`);
});
