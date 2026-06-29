import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function main() {
  const client = new Client(
    { name: "test", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new SSEClientTransport(
    new URL("http://127.0.0.1:4100/mcp"),
  );

  try {
    await client.connect(transport);
    console.log("Connected!");
    await client.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

main();
