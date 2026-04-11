import { type paths } from "./api-types";
import createClient from "openapi-fetch";

const client = createClient<paths>({
  baseUrl: "http://localhost:3001",
});

