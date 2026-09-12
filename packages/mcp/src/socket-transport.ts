/** MCP transport over a Node net.Socket: newline-delimited JSON-RPC, same framing as stdio. */
import type { Socket } from "node:net";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class SocketTransport implements Transport {
  private readonly buf = new ReadBuffer();
  private started = false;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  constructor(private readonly socket: Socket) {}

  async start(): Promise<void> {
    if (this.started) throw new Error("SocketTransport already started");
    this.started = true;
    this.socket.on("data", (chunk: Buffer) => {
      this.buf.append(chunk);
      for (;;) {
        let msg: JSONRPCMessage | null;
        try {
          msg = this.buf.readMessage();
        } catch (e) {
          this.onerror?.(e as Error);
          continue;
        }
        if (!msg) break;
        this.onmessage?.(msg);
      }
    });
    this.socket.on("error", (e) => this.onerror?.(e));
    this.socket.on("close", () => this.onclose?.());
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.destroyed) return reject(new Error("socket closed"));
      this.socket.write(serializeMessage(message), (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.socket.end();
    this.socket.destroy();
  }
}
