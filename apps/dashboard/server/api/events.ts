import { defineEventHandler } from "h3";
import { proxyEvents } from "../utils/runtimeProxy.js";

export default defineEventHandler(async (event) => {
  await proxyEvents(event, "/api/events");
});
