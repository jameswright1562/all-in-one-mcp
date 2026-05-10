import { defineEventHandler } from "h3";
import { proxyJson } from "../../utils/runtimeProxy.js";

export default defineEventHandler(async (event) => {
  return proxyJson(event, "/api/profiles/deactivate");
});
