type LogLevel = "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const toErrorPayload = (error: unknown) => {
  if (!(error instanceof Error)) {
    return {
      error: String(error)
    };
  }

  return {
    error: error.message,
    ...(error.stack ? { stack: error.stack } : {})
  };
};

const writeLog = (level: LogLevel, event: string, payload: LogPayload) => {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...payload
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info(event: string, payload: LogPayload = {}) {
    writeLog("info", event, payload);
  },

  warn(event: string, payload: LogPayload = {}) {
    writeLog("warn", event, payload);
  },

  error(event: string, error: unknown, payload: LogPayload = {}) {
    writeLog("error", event, {
      ...payload,
      ...toErrorPayload(error)
    });
  }
};
