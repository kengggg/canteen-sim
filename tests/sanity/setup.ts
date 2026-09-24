// Long synchronous tests starve the worker's message loop; yield a macrotask between tests so Vitest's RPC replies
// are processed (avoids "Timeout calling onTaskUpdate").
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
