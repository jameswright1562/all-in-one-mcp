import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const client = new Client(
    { name: "test", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("http://127.0.0.1:4100/mcp"),
  );

  console.log("Connecting...");
  try {
    const connectPromise = client.connect(transport);
    let connected = false;
    connectPromise.then(() => {
      connected = true;
      console.log("Connected!");
    });

    // wait 5 seconds
    await new Promise((r) => setTimeout(r, 5000));
    console.log("After 5s, connected?", connected);

    await client.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

main();
