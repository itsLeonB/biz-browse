import { test } from "node:test";
import assert from "node:assert/strict";
import { cdp, waitForSocket } from "./browser-support.mjs";

class Socket extends EventTarget {
  send(data) {
    this.last = JSON.parse(data);
  }
  reply(data) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

test("CDP resolves replies and rejects protocol errors", async () => {
  const socket = new Socket();
  const call = cdp(socket, 100);
  const first = call("Page.enable");
  socket.reply({ id: socket.last.id, result: {} });
  assert.deepEqual(await first, { id: 1, result: {} });
  const second = call("Page.navigate");
  socket.reply({ id: socket.last.id, error: { message: "bad request" } });
  await assert.rejects(second, /bad request/);
});

test("CDP rejects timed-out and disconnected requests", async () => {
  const socket = new Socket();
  const call = cdp(socket, 20);
  await assert.rejects(call("Page.enable"), /timed out/);
  socket.reply({ id: 1, result: {} });
  const first = call("Page.navigate");
  const second = call("Page.reload");
  socket.dispatchEvent(new Event("close"));
  await Promise.all([assert.rejects(first, /closed/), assert.rejects(second, /closed/)]);
  await assert.rejects(call("Page.enable"), /closed/);
});

test("CDP rejects socket and send errors", async () => {
  const socket = new Socket();
  const call = cdp(socket, 100);
  socket.send = () => {
    throw new Error("send failed");
  };
  await assert.rejects(call("Page.enable"), /send failed/);
  const other = new Socket();
  const otherCall = cdp(other, 100);
  const pending = otherCall("Page.enable");
  other.dispatchEvent(new Event("error"));
  await assert.rejects(pending, /socket error/);
});

test("socket opening rejects close and timeout", async () => {
  const socket = new Socket();
  const ready = waitForSocket(socket, 100);
  socket.dispatchEvent(new Event("close"));
  await assert.rejects(ready, /closed before opening/);
  await assert.rejects(waitForSocket(new Socket(), 20), /timed out/);
});
