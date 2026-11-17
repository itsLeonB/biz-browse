export function waitForSocket(socket, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      socket.removeEventListener("open", open);
      socket.removeEventListener("close", close);
      socket.removeEventListener("error", errorEvent);
      if (error) reject(error);
      else resolve();
    };
    const open = () => finish();
    const close = () => finish(new Error("Chrome debugging socket closed before opening"));
    const errorEvent = () => finish(new Error("Chrome debugging socket error before opening"));
    const timer = setTimeout(() => finish(new Error("Chrome debugging socket timed out opening")), timeout);
    socket.addEventListener("open", open);
    socket.addEventListener("close", close);
    socket.addEventListener("error", errorEvent);
  });
}

export function cdp(socket, timeout = 10_000) {
  let id = 0;
  let failure;
  const pending = new Map();
  const fail = (error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
  };
  socket.addEventListener("close", () => fail(new Error("Chrome debugging socket closed")));
  socket.addEventListener("error", () => fail(new Error("Chrome debugging socket error")));
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    if (message.error) request.reject(new Error(`CDP error: ${message.error.message}`));
    else request.resolve(message);
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const requestId = ++id;
      const finish = (fn) => (value) => {
        clearTimeout(timer);
        pending.delete(requestId);
        fn(value);
      };
      const timer = setTimeout(
        () => pending.get(requestId)?.reject(new Error(`CDP ${method} timed out`)),
        timeout,
      );
      pending.set(requestId, { resolve: finish(resolve), reject: finish(reject) });
      try {
        socket.send(JSON.stringify({ id: requestId, method, params }));
      } catch (error) {
        pending.get(requestId)?.reject(error);
      }
    });
}
